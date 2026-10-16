"""Persistent native chat worker: several real turns in one private process.

The provider is the loopback ControlledServer (no internet, fixture key only).
Each turn is a real relay_native_chat call with its own stream and writer lease.
"""
from __future__ import annotations

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
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


class ToolTurnProvider:
    """Loopback SSE provider: each turn calls read_file once, then answers from that tool result."""

    def __init__(self):
        self.tool_results_before_request = []
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                messages = body.get("messages", [])
                last_user = max((i for i, row in enumerate(messages) if row.get("role") == "user"), default=-1)
                results = [row for row in messages[last_user + 1:] if row.get("role") == "tool"]
                owner.tool_results_before_request.append(len(results))
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Connection", "close")
                self.end_headers()

                def chunk(delta, finish=None):
                    payload = {"id": "tool-turn", "object": "chat.completion.chunk", "created": int(time.time()),
                        "model": body["model"], "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}
                    self.wfile.write(("data: " + json.dumps(payload) + "\n\n").encode())
                    self.wfile.flush()

                try:
                    if not results:
                        chunk({"role": "assistant", "tool_calls": [{"index": 0, "id": "call-%d" % len(owner.tool_results_before_request),
                            "type": "function", "function": {"name": "read_file",
                                "arguments": json.dumps({"path": "controlled.txt"})}}]})
                        chunk({}, "tool_calls")
                    else:
                        chunk({"role": "assistant", "content": "answer:" + str(results[-1].get("content"))[:300]})
                        chunk({}, "stop")
                    self.wfile.write(b"data: [DONE]\n\n")
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    @property
    def port(self):
        return self.server.server_port

    def close(self):
        self.server.shutdown()
        self.server.server_close()


def test_persistent_worker_runs_file_tool_turns_in_one_process(tmp_path, monkeypatch):
    monkeypatch.setenv("LASTBROWSER_CHAT_PERSISTENT_WORKER", "1")
    provider = ToolTurnProvider()
    context, store = fixture_context(tmp_path, "a", provider.port)
    session_file = Path(context.sessions_dir) / (context.session_id + ".json")
    report = []
    try:
        base, session, service, _resolver = captured_fixed(context, store, monkeypatch)
        generation = base.writer_generation
        lease_id = base.writer_lease_id
        pids = []
        for number in range(1, 4):
            stream_id = "turn_a_" + str(number)
            message = f"Turn {number}: read my own file"
            if number == 1:
                turn_context, turn_session = base, session
                raw = json.loads(session_file.read_text("utf-8"))
                raw.update(pending_user_message=message, pending_started_at=time.time())
                session_file.write_text(json.dumps(raw), "utf-8")
                turn_session = SimpleNamespace(**raw)
            else:
                turn_context, _lease, turn_session = _advance_turn(
                    base, store, session_file, generation, lease_id, stream_id, message)
            lease_id = turn_context.writer_lease_id
            broker = NativeSdkSessionBroker(turn_context, turn_session, service=service,
                execution_policy=ChatExecutionPolicy("action", 1))
            broker.file_fence.python_executable = str(isolated_python())
            events, started = [], []
            args = (turn_context.session_id, message, "controlled-model", turn_context.workspace, turn_context.stream_id)
            kwargs = {"model_provider": "custom", "execution_policy": ChatExecutionPolicy("action", 1)}
            try:
                exit_code = relay_native_chat(turn_context, args, kwargs,
                    lambda event, data: events.append((event, data)),
                    python_executable=isolated_python(), rpc_handler=broker,
                    on_started=lambda handle: started.append(handle.pid))
            finally:
                broker.close_after_exit()
            names = [event for event, _ in events]
            ready = [data["pid"] for event, data in events if event == "worker_ready"]
            finished = [data for event, data in events if event == "worker_finished"]
            faults = [data for event, data in events if event in {"worker_fault", "error", "apperror"}]
            report.append({"turn": number, "exit": exit_code, "events": names, "started": started,
                "requests": list(provider.tool_results_before_request)})
            assert exit_code == 0 and not faults, report
            assert finished and finished[-1]["failed"] is False and finished[-1]["reusable"] is True, report
            assert "tool_complete" in names and ("done" in names or "stream_end" in names), report
            pids.append(ready[-1])
        assert len(set(pids)) == 1, (pids, report)
        assert provider.tool_results_before_request == [0, 1] * 3, report
        raw = json.loads(session_file.read_text("utf-8"))
        answers = [str(m.get("content")) for m in raw["messages"] if m["role"] == "assistant"]
        assert len([a for a in answers if a.startswith("answer:") and "content-a" in a]) == 3, answers
    finally:
        _drain_idle_pool()
        provider.close()
        store.close()


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


def test_persistent_worker_queued_followup_after_deferred_terminal(tmp_path, monkeypatch):
    """Simulates standard chat: turn 1 defers terminal until writer release, then a queued follow-up."""
    from web.api import config, native_chats
    from runtime.chat_modes import ChatExecutionPolicy

    monkeypatch.setenv("LASTBROWSER_CHAT_PERSISTENT_WORKER", "1")
    server = ControlledServer(text_only=True, parties=1)
    context, store = fixture_context(tmp_path, "a", server.port)
    session_file = Path(context.sessions_dir) / (context.session_id + ".json")
    channel = config.create_stream_channel()
    with config.STREAMS_LOCK:
        config.STREAMS[context.stream_id] = channel
    try:
        base, session, service, _resolver = captured_fixed(context, store, monkeypatch)
        generation = base.writer_generation
        broker = NativeSdkSessionBroker(base, session, service=service,
            execution_policy=ChatExecutionPolicy("action", 1))
        broker.file_fence.python_executable = str(isolated_python())
        native_chats.register_native_chat(base)
        args = (base.session_id, "queued-ping", "controlled-model", base.workspace, base.stream_id)
        kwargs = {"model_provider": "custom", "execution_policy": ChatExecutionPolicy("action", 1)}
        try:
            exit_code = native_chats.run_native_chat(base, args, kwargs, python_executable=isolated_python(),
                rpc_handler=broker, defer_terminal=True)
        finally:
            broker.close_after_exit()
        assert exit_code == 0
        assert native_chats.native_chat_exit_confirmed(base)
        assert not native_chats.finalize_native_chat(base)
        store.release_lease(base.writer_lease_id, owner_generation=generation)
        assert native_chats.finalize_native_chat(base)

        stream_id = "turn_queued_followup"
        turn_context, _lease, turn_session = _advance_turn(
            base, store, session_file, generation, base.writer_lease_id, stream_id, "queued-pong")
        channel2 = config.create_stream_channel()
        with config.STREAMS_LOCK:
            config.STREAMS[stream_id] = channel2
        native_chats.register_native_chat(turn_context)
        broker2 = NativeSdkSessionBroker(turn_context, turn_session, service=service,
            execution_policy=ChatExecutionPolicy("action", 1))
        broker2.file_fence.python_executable = str(isolated_python())
        follow_events = []
        args2 = (turn_context.session_id, "queued-pong", "controlled-model", turn_context.workspace, stream_id)
        try:
            exit2 = relay_native_chat(turn_context, args2, kwargs,
                lambda event, data: follow_events.append((event, data)),
                python_executable=isolated_python(), rpc_handler=broker2)
        finally:
            broker2.close_after_exit()
        fault_names = [event for event, data in follow_events if event in {"worker_fault", "error", "apperror"}
            or (event == "error" and isinstance(data, dict) and data.get("error") == "native_chat_worker_failed")]
        assert exit2 == 0 and not fault_names, {"exit": exit2, "events": follow_events}
        finished = [data for event, data in follow_events if event == "worker_finished"]
        assert finished and finished[-1].get("failed") is False and finished[-1].get("reusable") is True
    finally:
        _drain_idle_pool()
        server.close()
        store.close()
        with config.STREAMS_LOCK:
            config.STREAMS.pop(context.stream_id, None)
            config.STREAMS.pop("turn_queued_followup", None)
            config.RECENT_CHAT_STREAMS.pop(context.stream_id, None)
            config.RECENT_CHAT_STREAMS.pop("turn_queued_followup", None)
