"""Persistent native chat worker: several real turns in one private process.

The provider is the loopback ControlledServer (no internet, fixture key only).
Each turn is a real relay_native_chat call with its own stream and writer lease.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from types import SimpleNamespace

from runtime.chat_modes import ChatExecutionPolicy
from runtime.independent.native_chat_host import NATIVE_WORKER_POOL, _retire_worker, relay_native_chat
from runtime.independent.native_chat_protocol import NativeChatContext
from runtime.independent.native_sdk_broker import NativeSdkSessionBroker
from test_independent_profile_isolation import isolated_python
from test_native_chat_fixed_process import captured_fixed
from test_native_chat_process import ControlledServer, fixture_context

TURNS = 5


def _drain_idle_pool():
    with NATIVE_WORKER_POOL._lock:
        entries = list(NATIVE_WORKER_POOL._idle.values())
        NATIVE_WORKER_POOL._idle.clear()
    for handle, _fingerprint in entries:
        _retire_worker(handle)


def _advance_turn(base, store, session_file, generation, previous_lease_id, stream_id, message):
    """Mint the next accepted turn: new stream, new writer lease, same session and capture.

    Mirrors the Parent's saved pending state before a turn starts.
    """
    store.release_lease(previous_lease_id, owner_generation=generation)
    lease = store.acquire_chat_writer(base.scope, base.session_id, stream_id, generation)
    raw = json.loads(session_file.read_text("utf-8"))
    raw["active_stream_id"] = stream_id
    raw["pending_user_message"] = message
    raw["pending_started_at"] = time.time()
    session_file.write_text(json.dumps(raw), "utf-8")
    context = NativeChatContext.model_validate({**base.model_dump(mode="json"),
        "stream_id": stream_id, "writer_lease_id": lease["leaseId"]})
    return context, lease, SimpleNamespace(**raw)


def test_persistent_worker_serves_five_turns_in_one_process(tmp_path, monkeypatch):
    monkeypatch.setenv("LASTBROWSER_CHAT_PERSISTENT_WORKER", "1")
    server = ControlledServer(text_only=True, parties=1)
    context, store = fixture_context(tmp_path, "a", server.port)
    session_file = Path(context.sessions_dir) / (context.session_id + ".json")
    report = []
    try:
        base, session, service, _resolver = captured_fixed(context, store, monkeypatch)
        generation = base.writer_generation
        lease_id = base.writer_lease_id
        pids = []
        for number in range(1, TURNS + 1):
            stream_id = "turn_a_" + str(number)
            message = f"Turn {number}: summarize my own file"
            if number == 1:
                turn_context, turn_session = base, session
            else:
                turn_context, _lease, turn_session = _advance_turn(
                    base, store, session_file, generation, lease_id, stream_id, message)
            lease_id = turn_context.writer_lease_id
            broker = NativeSdkSessionBroker(turn_context, turn_session, service=service,
                execution_policy=ChatExecutionPolicy("action", 1))
            broker.file_fence.python_executable = str(isolated_python())
            events, started = [], []
            args = (turn_context.session_id, message, "controlled-model",
                    turn_context.workspace, turn_context.stream_id)
            kwargs = {"model_provider": "custom", "execution_policy": ChatExecutionPolicy("action", 1)}
            try:
                exit_code = relay_native_chat(turn_context, args, kwargs,
                    lambda event, data: events.append((event, data)),
                    python_executable=isolated_python(), rpc_handler=broker,
                    on_started=lambda handle: started.append(handle.pid))
            except Exception as exc:
                raise AssertionError(f"turn {number} raised {type(exc).__name__}: {exc}; "
                    f"events={[event for event, _ in events]}") from exc
            finally:
                broker.close_after_exit()
            names = [event for event, _ in events]
            ready = [data["pid"] for event, data in events if event == "worker_ready"]
            finished = [data for event, data in events if event == "worker_finished"]
            faults = [data for event, data in events if event in {"worker_fault", "error", "apperror"}]
            report.append({"turn": number, "exit": exit_code, "events": names,
                "requests": len(server.all_requests), "started": started})
            assert exit_code == 0 and not faults, report
            assert finished and finished[-1]["failed"] is False and finished[-1]["reusable"] is True, report
            assert started == [ready[-1]], report
            assert "done" in names or "stream_end" in names, report
            pids.append(ready[-1])
        assert len(set(pids)) == 1, (pids, report)
        assert len(server.all_requests) == TURNS, report
        raw = json.loads(session_file.read_text("utf-8"))
        assert [m["role"] for m in raw["messages"]].count("assistant") == TURNS
    finally:
        _drain_idle_pool()
        server.close()
        store.close()
