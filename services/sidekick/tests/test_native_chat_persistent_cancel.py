"""Persistent native chat worker: a cancelled turn must not poison the next turn.

The loopback provider holds only the first request mid-stream until the worker
aborts the connection; later requests answer normally. No network, fixture key.
"""
from __future__ import annotations

import json
import select
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from runtime.chat_modes import ChatExecutionPolicy
from runtime.independent.native_chat_host import relay_native_chat
from runtime.independent.native_sdk_broker import NativeSdkSessionBroker
from test_independent_profile_isolation import isolated_python
from test_native_chat_fixed_process import captured_fixed
from test_native_chat_persistent_worker import _advance_turn, _drain_idle_pool
from test_native_chat_process import fixture_context


class HoldFirstProvider:
    def __init__(self):
        self.requests = 0
        self.first_token_sent = threading.Event()
        self.first_aborted = threading.Event()
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                owner.requests += 1
                index = owner.requests
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Connection", "close")
                self.end_headers()

                def chunk(delta, finish=None):
                    payload = {"id": "held", "object": "chat.completion.chunk", "created": int(time.time()),
                        "model": body["model"], "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}
                    self.wfile.write(("data: " + json.dumps(payload) + "\n\n").encode())
                    self.wfile.flush()

                try:
                    if index == 1:
                        chunk({"role": "assistant", "content": "partial-before-cancel"})
                        owner.first_token_sent.set()
                        deadline = time.monotonic() + 25
                        while time.monotonic() < deadline:
                            readable, _, _ = select.select([self.connection], [], [], .05)
                            if readable and self.connection.recv(1, socket.MSG_PEEK) == b"":
                                owner.first_aborted.set()
                                return
                        return
                    chunk({"role": "assistant", "content": "second-answer"})
                    chunk({}, "stop")
                    self.wfile.write(b"data: [DONE]\n\n")
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    owner.first_aborted.set()

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    @property
    def port(self):
        return self.server.server_port

    def close(self):
        self.server.shutdown()
        self.server.server_close()


def test_persistent_worker_serves_next_turn_after_cancelled_turn(tmp_path, monkeypatch):
    monkeypatch.setenv("LASTBROWSER_CHAT_PERSISTENT_WORKER", "1")
    provider = HoldFirstProvider()
    context, store = fixture_context(tmp_path, "a", provider.port)
    session_file = Path(context.sessions_dir) / (context.session_id + ".json")
    try:
        base, session, service, _resolver = captured_fixed(context, store, monkeypatch)
        generation = base.writer_generation
        lease_id = base.writer_lease_id

        # Turn 1: stream until the first token, then cancel through the real control path.
        broker = NativeSdkSessionBroker(base, session, service=service,
            execution_policy=ChatExecutionPolicy("action", 1))
        broker.file_fence.python_executable = str(isolated_python())
        events, pids, cancelled = [], [], threading.Event()
        args = (base.session_id, "Turn 1: stream then stop", "controlled-model", base.workspace, base.stream_id)
        kwargs = {"model_provider": "custom", "execution_policy": ChatExecutionPolicy("action", 1)}
        result = {}

        def run_first():
            try:
                result["exit"] = relay_native_chat(base, args, kwargs,
                    lambda event, data: events.append((event, data)), cancelled=cancelled,
                    python_executable=isolated_python(), rpc_handler=broker,
                    on_started=lambda handle: pids.append(handle.pid))
            except BaseException as exc:
                result["error"] = exc

        thread = threading.Thread(target=run_first, daemon=True)
        thread.start()
        deadline = time.monotonic() + 40
        while not provider.first_token_sent.is_set() and time.monotonic() < deadline and thread.is_alive():
            time.sleep(.05)
        assert provider.first_token_sent.is_set(), (result, [event for event, _ in events])
        time.sleep(.3)
        cancelled.set()
        thread.join(40)
        assert not thread.is_alive(), "cancelled relay did not return"
        broker.close_after_exit()
        assert "error" not in result, result
        assert provider.first_aborted.wait(10), "provider connection was not aborted by the cancel"
        first_names = [event for event, _ in events]
        assert not [event for event in first_names if event in {"worker_fault", "apperror"}], first_names

        # Turn 2 in the same session: must complete normally, whether or not the worker was reused.
        message = "Turn 2: continue after the stop"
        turn_context, _lease, turn_session = _advance_turn(
            base, store, session_file, generation, lease_id, "turn_a_2", message)
        broker = NativeSdkSessionBroker(turn_context, turn_session, service=service,
            execution_policy=ChatExecutionPolicy("action", 1))
        broker.file_fence.python_executable = str(isolated_python())
        events2, pids2 = [], []
        args2 = (turn_context.session_id, message, "controlled-model", turn_context.workspace, turn_context.stream_id)
        try:
            exit_code = relay_native_chat(turn_context, args2, kwargs,
                lambda event, data: events2.append((event, data)),
                python_executable=isolated_python(), rpc_handler=broker,
                on_started=lambda handle: pids2.append(handle.pid))
        finally:
            broker.close_after_exit()
        names2 = [event for event, _ in events2]
        finished = [data for event, data in events2 if event == "worker_finished"]
        assert exit_code == 0, names2
        assert not [event for event in names2 if event in {"worker_fault", "apperror", "error"}], names2
        assert finished and finished[-1]["failed"] is False, names2
        assert "done" in names2 or "stream_end" in names2, names2
        assert provider.requests == 2, provider.requests
        # A cleanly stopped turn leaves an idle, reusable worker: the next turn reuses it.
        assert pids2 == pids, (pids, pids2)
        raw = json.loads(session_file.read_text("utf-8"))
        assert any(m["role"] == "assistant" and "second-answer" in str(m.get("content")) for m in raw["messages"])
    finally:
        _drain_idle_pool()
        provider.close()
        store.close()
