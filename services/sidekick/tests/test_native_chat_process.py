"""Actual ordinary engine + shipped Python + controlled local SDK endpoint."""
from __future__ import annotations
import json
import os
import subprocess
import queue
import select
import socket
import threading
import time
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace
import pytest

from runtime.chat_modes import ChatExecutionPolicy
from runtime.independent.contracts import BackendProfileRef, SpaceBinding, Scope, new_id
from runtime.independent.store import IndependentStore, ResourceBusy
from runtime.independent.native_chat_protocol import NativeChatContext, verify_native_context, encode_turn
from runtime.independent.native_chat_host import NativeChatHost, build_native_environment
from web.api.space_engine import Space
from test_independent_profile_isolation import isolated_python


def fixture_context(tmp_path, name, port=12345):
    home = tmp_path / "base" / "profiles" / name
    home.mkdir(parents=True)
    space = Space("research", custom_root=home / "spaces")
    space.save_config({"name": "Research"}, mint_space_id=True)
    space.sessions_dir.mkdir(parents=True, exist_ok=True)
    scope = Scope(backend_profile_id=new_id(), space_id=space.load_config()["space_id"], browser_profile_id=name)
    store = IndependentStore(home, scope.backend_profile_id)
    store.register_profile(BackendProfileRef(backend_profile_id=scope.backend_profile_id, name=name, canonical_home=str(home)))
    store.bind_space(SpaceBinding(scope=scope, native_slug="research", partition_key="persist:native_"+name))
    sid, stream, generation = "chat_"+name, "turn_"+name, new_id()
    lease = store.acquire_chat_writer(scope, sid, stream, generation)
    (home / "auth.json").write_text(json.dumps({"providers": {"own-"+name: {"controlled": True}}}))
    (home / ".env").write_text(f"CUSTOM_API_KEY=fixture-{name}\nSIDEKICK_HOME=foreign\nLASTBROWSER_BRIDGE_TOKEN=foreign\n")
    (home / "config.yaml").write_text(
        f"runtime_hooks_enabled: false\nprovider_metadata_prewarm: false\n"
        f"model:\n  provider: custom\n  default: controlled-model\n  base_url: http://127.0.0.1:{port}/v1\n  context_length: 128000\n"
        "agent:\n  max_turns: 3\n  api_mode: chat_completions\n"
        "toolsets:\n  - file\n")
    raw = {"session_id": sid, "title": "Controlled", "profile": name,
        "workspace": str(space.root), "workspace_slug": space.slug,
        "model": "controlled-model", "model_provider": "custom",
        "space_scope": scope.model_dump(mode="json", by_alias=True),
        "active_stream_id": stream, "pending_user_message": "READ OWN FILE",
        "pending_started_at": time.time(), "messages": [], "llm_title_generated": True,
        "enabled_toolsets": ["file"], "child_parent_turns": [stream]}
    (space.sessions_dir / (sid+".json")).write_text(json.dumps(raw), "utf-8")
    (space.root / "controlled.txt").write_text("content-"+name)
    context = NativeChatContext(scope=scope, profile_name=name, profile_home=str(home),
        space_root=str(space.root), sessions_dir=str(space.sessions_dir), workspace=str(space.root),
        partition_key="persist:native_"+name, session_id=sid, stream_id=stream,
        writer_lease_id=lease["leaseId"], writer_generation=generation,
        store_path=str(store.db_path), binding_revision=1)
    return context, store


def test_shipped_python_dependencies_are_importable_in_private_worker_environment(tmp_path):
    from runtime.independent.worker_host import build_worker_environment
    from runtime.independent.contracts import ProviderSelection
    from test_independent_dispatch import manager_fixture
    home, space, scope, store, manager, _request = manager_fixture(tmp_path)
    try:
        executable = isolated_python()
        code = "import sys,json; print(json.dumps(sys.path)); import pydantic; print(pydantic.__version__)"
        context = manager.make_context(scope, ProviderSelection(provider_config_ref="test-provider", model="test-model"), interactive=True)
        completed = subprocess.run([str(executable), "-I", "-c", code], cwd=context.resolved_space_root,
            env=build_worker_environment(context), capture_output=True, text=True, timeout=10)
        assert completed.returncode == 0, {
            "stderrBytes": len(completed.stderr.encode("utf-8", errors="replace")),
            "stderrTail": completed.stderr[-600:], "stdout": completed.stdout[-1000:]}
    finally:
        manager.shutdown()
        store.close()


def turn(context, mode="action"):
    return (context.session_id, "READ OWN FILE", "controlled-model", context.workspace, context.stream_id), {
        "model_provider": "custom", "execution_policy": ChatExecutionPolicy(mode, 1)}


def drain(handle, timeout=25):
    messages = []
    deadline = time.monotonic()+timeout
    while time.monotonic() < deadline:
        message = handle.read_event(timeout=.1)
        if message:
            messages.append(message)
            if message.get("kind") == "eof": return messages
    raise AssertionError("Native engine did not exit before deadline")


def test_context_requires_actual_lease_and_exact_turn(tmp_path, monkeypatch):
    context, store = fixture_context(tmp_path, "a")
    try:
        verify_native_context(context)
        args, kwargs = turn(context)
        encode_turn(context, args, kwargs)
        with pytest.raises(PermissionError):
            encode_turn(context, ("foreign", *args[1:]), kwargs)
        monkeypatch.setenv("OPENAI_API_KEY", "ambient-fixture")
        monkeypatch.setenv("LASTBROWSER_CDP_PORT", "1234")
        env = build_native_environment(context)
        assert env["CUSTOM_API_KEY"] == "fixture-a"
        assert "OPENAI_API_KEY" not in env and "LASTBROWSER_CDP_PORT" not in env
        assert "LASTBROWSER_BRIDGE_TOKEN" not in env
        store.release_lease(context.writer_lease_id, owner_generation=context.writer_generation)
        with pytest.raises(PermissionError): verify_native_context(context)
    finally: store.close()


def test_private_binding_refreshes_import_time_provider_cache(tmp_path):
    context, store = fixture_context(tmp_path, "other", port=12346)
    home = Path(context.profile_home)
    (home.parent.parent / "config.yaml").write_text(
        "model:\n  provider: custom\n  default: controlled-model\n"
        "  base_url: http://127.0.0.1:12345/v1\n", "utf-8")
    source = str(Path(__file__).resolve().parents[1])
    script = """
import json, sys
sys.path.insert(0, sys.argv[1])
from web.api import config
assert config.cfg['model']['base_url'] == 'http://127.0.0.1:12345/v1'
from runtime.independent.native_chat_protocol import NativeChatContext
from runtime.independent.native_chat_worker import bind_native_context
context = NativeChatContext.model_validate(json.loads(sys.stdin.read()))
bind_native_context(context)
assert config.resolve_model_provider('controlled-model') == (
    'controlled-model', 'custom', 'http://127.0.0.1:12346/v1')
print('original-profile-cache-bound')
"""
    try:
        result = subprocess.run([isolated_python(), "-I", "-B", "-c", script, source],
            input=context.model_dump_json(), text=True, capture_output=True,
            env=build_native_environment(context), timeout=25)
        assert result.returncode == 0, result.stderr
        assert 'original-profile-cache-bound' in result.stdout
    finally:
        store.close()


def test_capture_reads_actual_own_selection_policy_not_session_model_pseudofield(tmp_path, monkeypatch):
    from runtime.independent.native_chat_protocol import capture_native_chat_context
    from runtime.independent.chat_binding import NativeChatWriter
    from runtime.independent.scope import ScopeResolver
    from runtime.independent.model_selection import SelectionPolicyRepository
    from runtime.independent.model_policy_session import validate_native_session
    context, store = fixture_context(tmp_path, "a")
    from test_native_chat_fixed_process import captured_fixed
    context, _, _, _ = captured_fixed(context, store, monkeypatch)
    resolver = ScopeResolver(store, profiles_provider=lambda:[{"name":"a","path":context.profile_home}])
    resolved = resolver.resolve(context.scope, authenticated_profile_name="a")
    session = SimpleNamespace(session_id=context.session_id, profile="a", workspace=context.workspace,
        space_scope=context.scope.model_dump(mode="json",by_alias=True), model_policy="fake-session-authority",
        model="controlled-model", model_provider="custom")
    writer = NativeChatWriter(store,context.writer_lease_id,context.writer_generation)
    hub = SimpleNamespace(by_scope=lambda *args:(store,resolver), base_home=Path(context.profile_home).parent.parent,
        existing_store_paths=lambda: ((store.backend_profile_id, store.db_path),))
    try:
        assert capture_native_chat_context(session,context.stream_id,writer,profile_hub=hub).selection_mode == "fixed"
        repository = SelectionPolicyRepository(store,session_validator=lambda scope,sid:validate_native_session(resolved,sid,actor="a"))
        repository.set(context.scope,context.session_id,{"mode":"auto","allowedModels":[{"provider":"custom","model":"controlled-model"}]},
            expected_revision=0,client_request_id=new_id(),validate=lambda policy:None)
        captured=capture_native_chat_context(session,context.stream_id,writer,profile_hub=hub)
        assert captured.selection_mode == "auto" and captured.selection_policy_revision == 1
        with pytest.raises(PermissionError,match="selection policy changed"):
            verify_native_context(context)
    finally: store.close()


class ControlledServer:
    def __init__(self, *, hold=False, tool="read_file", parties=3, fail_second=False, text_only=False):
        self.requests, self.arrived, self.release = [], threading.Barrier(parties), threading.Event()
        self.all_requests=[]
        self.hold = hold
        self.text_only = text_only
        self.held_started = threading.Event()
        self.held_aborted = threading.Event()
        owner = self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args): pass
            def do_GET(self):
                self.send_response(400); self.end_headers()
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                owner.all_requests.append((self.path,self.headers.get("Authorization",""),body))
                if not body.get("stream") or "messages" not in body:
                    self.send_response(400); self.send_header("Content-Type", "application/json"); self.end_headers()
                    self.wfile.write(b'{"error":{"message":"Unsupported controlled capability probe"}}'); return
                token = self.headers.get("Authorization", "")
                owner.requests.append((token, body))
                own = token.rsplit("-", 1)[-1]
                tool_result = next((row for row in body["messages"] if row.get("role") == "tool"), None)
                if fail_second and tool_result is not None:
                    self.send_response(429); self.send_header("Content-Type","application/json")
                    self.send_header("retry-after","60"); self.end_headers()
                    self.wfile.write(b'{"error":{"message":"Controlled rate limit","type":"rate_limit_error","code":"rate_limit_exceeded"}}')
                    return
                self.send_response(200); self.send_header("Content-Type", "text/event-stream")
                self.send_header("Connection", "close"); self.end_headers()
                def chunk(delta, finish=None):
                    row = {"id":"controlled", "object":"chat.completion.chunk", "created":int(time.time()), "model":body["model"],
                        "choices":[{"index":0, "delta":delta, "finish_reason":finish}]}
                    self.wfile.write(("data: "+json.dumps(row)+"\n\n").encode()); self.wfile.flush()
                try:
                    if owner.hold:
                        chunk({"role":"assistant", "content":"partial-"+own})
                        owner.held_started.set()
                        deadline = time.monotonic() + 20
                        while not owner.release.is_set() and time.monotonic() < deadline:
                            readable, _, _ = select.select([self.connection], [], [], .025)
                            if readable:
                                try:
                                    if self.connection.recv(1, socket.MSG_PEEK) == b"":
                                        owner.held_aborted.set()
                                        return
                                except (ConnectionResetError, OSError):
                                    owner.held_aborted.set()
                                    return
                        if not owner.release.is_set():
                            owner.held_aborted.set()
                            return
                        chunk({}, "stop")
                    elif owner.text_only:
                        chunk({"role":"assistant", "content":"controlled-answer-"+own})
                        chunk({}, "stop")
                    elif tool_result is None:
                        chunk({"role":"assistant", **({"content":"first-visible-"+own} if fail_second else {}), "tool_calls":[{"index":0,"id":"call-own-file","type":"function",
                            "function":{"name":tool,"arguments":json.dumps({"path":"controlled.txt", **({"content":"FORBIDDEN CHANGE"} if tool == "write_file" else {})})}}]})
                        owner.arrived.wait(timeout=20); owner.release.wait(timeout=20)
                        chunk({}, "tool_calls")
                    else:
                        chunk({"role":"assistant", "content":"answer-"+own+":"+str(tool_result["content"])})
                        chunk({}, "stop")
                    self.wfile.write(b'data: [DONE]\n\n'); self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError, threading.BrokenBarrierError): pass
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
    @property
    def port(self): return self.server.server_port
    def close(self):
        self.release.set(); self.server.shutdown(); self.server.server_close()


class BoundNativePeer:
    """Real captured provider and production Parent RPC drain, without a UI."""
    def __init__(self, context, store, monkeypatch, mode="action"):
        from test_native_chat_fixed_process import captured_fixed
        from runtime.independent.native_sdk_broker import NativeSdkSessionBroker
        from runtime.independent.native_chat_host import relay_native_chat
        self.context, session, service, _ = captured_fixed(context, store, monkeypatch)
        self.broker = NativeSdkSessionBroker(self.context, session, service=service,
            execution_policy=ChatExecutionPolicy(mode, 1))
        self.events, self.started = queue.Queue(), threading.Event()
        self.handle = None
        self.error = None
        def on_started(handle):
            self.handle = handle
            self.started.set()
        def put(event, data):
            message = ({"kind": event, **data} if event.startswith("worker_") or event == "control_ack"
                else {"kind": "native_event", "event": event, "data": data})
            self.events.put(message)
        def run():
            try:
                relay_native_chat(self.context, *turn(self.context, mode), put,
                    python_executable=isolated_python(), rpc_handler=self.broker,
                    on_started=on_started)
            except BaseException as exc:
                self.error = exc
            finally:
                self.started.set()
                self.events.put({"kind": "eof"})
        self.thread = threading.Thread(target=run, daemon=True)
        self.thread.start()
        assert self.started.wait(10), "Native Parent did not start"
        assert self.handle is not None, repr(self.error)

    @property
    def pid(self): return self.handle.pid
    @property
    def is_alive(self): return self.handle.is_alive
    def read_event(self, timeout):
        try: message = self.events.get(timeout=timeout)
        except queue.Empty: return None
        if message["kind"] == "eof" and self.error is not None:
            raise self.error
        return message
    def send_control(self, command): self.handle.send_control(command)
    def terminate(self, **kwargs):
        if self.handle.is_alive: self.handle.terminate(**kwargs)
        self.thread.join(5)
        assert not self.thread.is_alive(), "Parent drain did not exit"
        self.broker.close_after_exit()


def test_two_real_profile_engines_sdk_file_tool_and_parent_drift(tmp_path, monkeypatch):
    servers, handles, stores = [ControlledServer(parties=2), ControlledServer(parties=2)], [], []
    contexts = []
    before_env = dict(os.environ)
    try:
        for name, server in zip(("a", "b"), servers):
            context, store = fixture_context(tmp_path, name, server.port)
            contexts.append(context); stores.append(store)
        auth_before = [(Path(c.profile_home)/"auth.json").read_bytes() for c in contexts]
        for index, (context, store) in enumerate(zip(contexts, stores)):
            peer = BoundNativePeer(context, store, monkeypatch)
            contexts[index] = peer.context
            handles.append(peer)
        assert dict(os.environ) == before_env
        try:
            for server in servers: server.arrived.wait(timeout=20)
            assert handles[0].pid != handles[1].pid and all(h.is_alive for h in handles)
            # Actual Parent drift while both ordinary SDK streams overlap.
            from web.api import profiles
            monkeypatch.setattr(profiles, "_active_profile", "foreign")
            monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path/"foreign"))
            for context, store in zip(contexts, stores):
                with pytest.raises(ResourceBusy):
                    store.acquire_chat_writer(context.scope, context.session_id, "other", new_id())
        finally:
            for server in servers: server.release.set()
        outputs = [drain(handle) for handle in handles]
        for context, output, store in zip(contexts, outputs, stores):
            ready = next(m for m in output if m["kind"] == "worker_ready")
            assert ready["auxiliarySources"] == [{"profileName":context.profile_name,"profileHome":context.profile_home,"sessionsDir":context.sessions_dir}]
            assert any(m["kind"] == "native_event" and m["event"] == "done" for m in output), [
                (m.get("kind"), m.get("event"), m.get("data")) for m in output]
            raw = json.loads((Path(context.sessions_dir)/(context.session_id+".json")).read_text("utf-8"))
            assistant = " ".join(m.get("content", "") for m in raw["messages"] if m["role"] == "assistant")
            assert "content-"+context.profile_name in assistant
            assert "content-"+({"a":"b","b":"a"}[context.profile_name]) not in assistant
            assert store.list_leases()  # Child exit does not release Parent's lease.
        assert [(Path(c.profile_home)/"auth.json").read_bytes() for c in contexts] == auth_before
        assert {token for server in servers for token, body in server.requests} == {"Bearer fixture-a","Bearer fixture-b"}
        assert all(body["model"] == "controlled-model" for server in servers for _, body in server.requests)
    finally:
        for server in servers: server.close()
        for h in handles: h.terminate(grace_seconds=0, hard_seconds=1)
        for s in stores: s.close()


@pytest.mark.parametrize("command", ["cancel", "pause"])
def test_actual_cancel_pause_ack_before_confirmed_exit_and_auth_unchanged(tmp_path, command, monkeypatch):
    server = ControlledServer(hold=True)
    context, store = fixture_context(tmp_path, "a", server.port)
    handle = None
    try:
        auth = (Path(context.profile_home)/"auth.json").read_bytes()
        handle = BoundNativePeer(context, store, monkeypatch)
        context = handle.context
        deadline = time.monotonic()+25
        observed = []
        while time.monotonic() < deadline:
            message = handle.read_event(timeout=.1)
            if message:
                observed.append(message)
                if message.get("kind") == "native_event" and message.get("event") == "token":
                    break
        assert any(m.get("event") == "token" for m in observed)
        start = time.monotonic(); handle.send_control(command)
        output = drain(handle, timeout=6)
        assert any(m["kind"] == "control_ack" and m.get("accepted") and m.get("status") == "stopping" for m in output)
        handle.terminate(grace_seconds=0, hard_seconds=1)
        assert not handle.is_alive and time.monotonic()-start < 6
        assert store.list_leases()
        assert (Path(context.profile_home)/"auth.json").read_bytes() == auth
    finally:
        server.close()
        if handle: handle.terminate(grace_seconds=0, hard_seconds=1)
        store.close()


@pytest.mark.parametrize("mode,tool,denial", [("plan","write_file","plan_mode_read_only"), ("grill_me","read_file","grill_me_tools_disabled")])
def test_actual_prompt_mode_and_tool_dispatch_gate(tmp_path, mode, tool, denial, monkeypatch):
    server = ControlledServer(tool=tool, parties=2)
    context, store = fixture_context(tmp_path, "a", server.port)
    handle = None
    try:
        handle = BoundNativePeer(context, store, monkeypatch, mode)
        context = handle.context
        try: server.arrived.wait(timeout=30)
        finally: server.release.set()
        output = drain(handle)
        tool_results = [str(m.get("content")) for _,body in server.requests for m in body["messages"] if m.get("role") == "tool"]
        assert any(denial in result for result in tool_results), tool_results
        assert (Path(context.workspace)/"controlled.txt").read_text() == "content-a"
        prompts = [str(m.get("content")) for _,body in server.requests for m in body["messages"] if m.get("role") in {"system","developer"}]
        assert prompts and any(mode.replace("_", " ").split()[0] in prompt.lower() for prompt in prompts)
    finally:
        server.close()
        if handle: handle.terminate(grace_seconds=0, hard_seconds=1)
        store.close()
