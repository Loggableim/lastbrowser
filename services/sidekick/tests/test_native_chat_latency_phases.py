"""Opt-in latency probe: send-to-first-token phases of three real native chat turns.

The provider is a loopback OpenAI-compatible SSE endpoint (127.0.0.1 only, fixture key,
no network). It timestamps request arrival and the first response byte, so every phase
is a difference of wall-clock marks taken on this machine.

Run (not part of the default suite):
    LASTBROWSER_LATENCY_MEASURE=1 LASTBROWSER_LATENCY_LABEL=before \
        python -m pytest tests/test_native_chat_latency_phases.py -s
Set LASTBROWSER_CHAT_PERSISTENT_WORKER=1 for the persistent-worker configuration.
The rows are written to .test-tmp/latency-<label>.json.
"""
from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace

import pytest

from runtime.chat_modes import ChatExecutionPolicy
from runtime.independent.chat_binding import NativeChatWriter
from runtime.independent.native_chat_host import NATIVE_WORKER_POOL, _retire_worker, relay_native_chat
from runtime.independent.native_chat_protocol import capture_native_chat_context
from runtime.independent.native_sdk_broker import NativeSdkSessionBroker
from test_independent_profile_isolation import isolated_python
from test_native_chat_fixed_process import captured_fixed
from test_native_chat_process import fixture_context

TURNS = 3
_HOST_LOGGER = "runtime.independent.native_chat_host"
_STAGE = re.compile(r"native_chat_phase stream=(\S+) stage=(\S+)(?: wall=([0-9.]+))?")


class TimedProvider:
    """Loopback SSE provider recording request arrival and the first response byte."""

    def __init__(self):
        self.timeline = []
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                arrival = time.time()
                if not body.get("stream") or "messages" not in body:
                    self.send_response(400)
                    self.end_headers()
                    return
                row = {"arrival": arrival, "headers": None}
                owner.timeline.append(row)
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Connection", "close")
                self.end_headers()
                row["headers"] = time.time()

                def chunk(delta, finish=None):
                    payload = {"id": "timed", "object": "chat.completion.chunk", "created": int(time.time()),
                        "model": body["model"], "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}
                    self.wfile.write(("data: " + json.dumps(payload) + "\n\n").encode())
                    self.wfile.flush()

                try:
                    chunk({"role": "assistant", "content": "timed-answer"})
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


_RPC = re.compile(r"native_chat_phase stream=(\S+) stage=rpc_(\S+) elapsed_ms=([0-9.]+)")


class _StageLog(logging.Handler):
    def __init__(self):
        super().__init__(level=logging.DEBUG)
        self.records = []
        self.rpcs = []

    def emit(self, record):
        message = record.getMessage()
        match = _STAGE.search(message)
        if match:
            self.records.append((match.group(1), match.group(2), match.group(3)))
        rpc = _RPC.search(message)
        if rpc:
            self.rpcs.append((rpc.group(1), rpc.group(2), float(rpc.group(3))))


def _drain_idle_pool():
    with NATIVE_WORKER_POOL._lock:
        entries = list(NATIVE_WORKER_POOL._idle.values())
        NATIVE_WORKER_POOL._idle.clear()
    for handle, _fingerprint in entries:
        _retire_worker(handle)


def _phase_table(row):
    """Phases in milliseconds from wall-clock marks (parent, worker and loopback provider)."""
    stages, events, server = row["stages"], row["events"], row["server"]

    def ms(later, earlier):
        return round((later - earlier) * 1000, 1)

    phases = {
        "parent_lease": ms(row["t_leased"], row["t_send"]),
        "parent_capture": ms(row["t_captured"], row["t_leased"]),
        "parent_broker": ms(row["t_prepared"], row["t_captured"]),
        "spawn_boot": ms(stages["worker_turn_start"], row["t_prepared"]),
        "profile_load": ms(stages["worker_bind_done"], stages["worker_turn_start"]),
        "import_decode": ms(stages["worker_decode_done"], stages["worker_bind_done"]),
        "bridges": ms(stages["worker_bridges_done"], stages["worker_decode_done"]),
        "provider_init": ms(events["nativeModelResolution"], stages["worker_engine_started"]),
        "engine_pre": ms(events["companion"], events["nativeModelResolution"]),
        "prompt_build": ms(server["arrival"], events["companion"]),
        "network_ttfb": ms(server["headers"], server["arrival"]),
        "first_token_ui": ms(events["token"], server["headers"]),
        "total_send_to_token": ms(events["token"], row["t_send"]),
    }
    phases["rpc_calls"] = len(row["rpcs"])
    phases["rpc_ms"] = round(sum(elapsed for _method, elapsed in row["rpcs"]), 1)
    return phases


@pytest.mark.skipif(os.environ.get("LASTBROWSER_LATENCY_MEASURE") != "1", reason="opt-in latency probe")
def test_measure_three_native_turns(tmp_path, monkeypatch):
    label = os.environ.get("LASTBROWSER_LATENCY_LABEL", "run")
    provider = TimedProvider()
    context, store = fixture_context(tmp_path, "a", provider.port)
    session_file = Path(context.sessions_dir) / (context.session_id + ".json")
    stage_log = _StageLog()
    host_logger = logging.getLogger(_HOST_LOGGER)
    previous_level = host_logger.level
    host_logger.setLevel(logging.DEBUG)
    host_logger.addHandler(stage_log)
    rows = []
    try:
        base, _session, service, resolver = captured_fixed(context, store, monkeypatch)
        generation = base.writer_generation
        previous_lease = base.writer_lease_id
        hub = SimpleNamespace(by_scope=lambda *args: (store, resolver),
            base_home=Path(context.profile_home).parent.parent,
            existing_store_paths=lambda: ((store.backend_profile_id, store.db_path),))
        for number in range(1, TURNS + 1):
            stream_id = f"turn_a_{number}"
            message = f"Turn {number}: summarize my own file"
            t_send = time.time()
            store.release_lease(previous_lease, owner_generation=generation)
            lease = store.acquire_chat_writer(base.scope, base.session_id, stream_id, generation)
            previous_lease = lease["leaseId"]
            raw = json.loads(session_file.read_text("utf-8"))
            raw.update(active_stream_id=stream_id, pending_user_message=message, pending_started_at=time.time())
            session_file.write_text(json.dumps(raw), "utf-8")
            session = SimpleNamespace(**raw)
            t_leased = time.time()
            writer = NativeChatWriter(store, lease["leaseId"], generation)
            turn_context = capture_native_chat_context(session, stream_id, writer, profile_hub=hub)
            t_captured = time.time()
            broker = NativeSdkSessionBroker(turn_context, session, service=service,
                execution_policy=ChatExecutionPolicy("action", 1))
            broker.file_fence.python_executable = str(isolated_python())
            t_prepared = time.time()
            events, started = [], []
            args = (turn_context.session_id, message, "controlled-model", turn_context.workspace, stream_id)
            kwargs = {"model_provider": "custom", "execution_policy": ChatExecutionPolicy("action", 1)}
            try:
                exit_code = relay_native_chat(turn_context, args, kwargs,
                    lambda event, data: events.append((event, time.time(), data)),
                    python_executable=isolated_python(), rpc_handler=broker,
                    on_started=lambda handle: started.append(time.time()))
            finally:
                broker.close_after_exit()
            first = {}
            for event, wall, _data in events:
                first.setdefault(event, wall)
            stages = {stage: float(wall) for sid, stage, wall in stage_log.records if sid == stream_id and wall}
            rpcs = [(method, elapsed) for sid, method, elapsed in stage_log.rpcs if sid == stream_id]
            server_row = provider.timeline[number - 1]
            rows.append({"turn": number, "exit": exit_code, "t_send": t_send, "t_leased": t_leased,
                "t_captured": t_captured, "t_prepared": t_prepared,
                "t_spawned": started[0] if started else None, "stages": stages,
                "events": first, "server": server_row, "rpcs": rpcs,
                "faults": [event for event, _w, _d in events if event in {"worker_fault", "error", "apperror"}]})
            assert exit_code == 0 and not rows[-1]["faults"], rows[-1]
            assert len(provider.timeline) == number, provider.timeline
        out = Path(__file__).resolve().parents[1] / ".test-tmp" / f"latency-{label}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(rows, indent=1), "utf-8")
        tables = [_phase_table(row) for row in rows]
        print(f"\nlatency {label} (ms)")
        for key in tables[0]:
            print(f"{key:22s}" + "".join(f"{table[key]:12.1f}" for table in tables))
    finally:
        host_logger.removeHandler(stage_log)
        host_logger.setLevel(previous_level)
        _drain_idle_pool()
        provider.close()
        store.close()
