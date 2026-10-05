"""Two real worker processes, actual imported globals and parent profile drift."""
from __future__ import annotations

import os
import sys
import json
import threading
from pathlib import Path

import pytest

from runtime.independent.contracts import PermissionScope, ProviderSelection, RunContext, Scope, new_id
from runtime.independent.worker_host import WorkerHost, build_worker_environment


def profile_context(tmp_path, name):
    home = tmp_path / "base" / "profiles" / name
    space = home / "spaces" / "research"
    space.mkdir(parents=True)
    (home / "config.yaml").write_text(f"probe_provider: {name}\n", "utf-8")
    (home / ".env").write_text(f"PROFILE_PROBE_MARKER={name}\nSIDEKICK_HOME=invalid-home\nLASTBROWSER_PARTITION_KEY=foreign\nPYTHONPATH=foreign\n", "utf-8")
    scope = Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id=name)
    return RunContext(run_id=new_id(), dispatch_id=new_id(), scope=scope, resolved_profile_home=str(home), resolved_space_root=str(space), backend_profile_name=name, partition_key=f"persist:test_{name}", binding_revision=1, provider=ProviderSelection(provider_config_ref=f"provider:{name}", model=f"model-{name}"), effective_permissions=PermissionScope(), runner_generation=new_id(), cancellation_token=new_id())


def wait_for(handle, kind, timeout=20):
    import time
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        event = handle.read_event(timeout=0.2)
        if event and event.get("kind") == kind:
            return event
        if event and event.get("kind") in {"eof", "error"}:
            pytest.fail(f"Controlled worker ended before {kind}: {event.get('errorCode') or event.get('code')}; stderr bytes={handle.stderr_bytes}")
    pytest.fail("Controlled worker did not produce the expected event before deadline")


def isolated_python():
    # -I deliberately does not inherit dev user-site dependencies. Exercise
    # the exact offline runtime the desktop ships when it is present.
    shipped = Path(__file__).resolve().parents[3] / "apps" / "desktop" / "runtime" / "python" / "python.exe"
    return shipped if shipped.is_file() else Path(sys.executable)


def test_actual_child_auth_reads_only_own_profile_and_default_keeps_own_auth(tmp_path):
    a, b = profile_context(tmp_path, "a"), profile_context(tmp_path, "b")
    base = Path(a.resolved_profile_home).parent.parent
    (base / "auth.json").write_text(json.dumps({"providers": {"root-only": {"controlled": True}}, "credential_pool": {"root-only": [{"controlled": True}]}}), "utf-8")
    for context, own in ((a, "only-a"), (b, "only-b")):
        (Path(context.resolved_profile_home) / "auth.json").write_text(json.dumps({"providers": {own: {"controlled": True}}, "credential_pool": {own: [{"controlled": True}]}}), "utf-8")
    handles = []
    try:
        for context in (a, b):
            handles.append(WorkerHost(context, python_executable=isolated_python()).start(entry_module="runtime.independent.worker_host", payload={"authProviderIds": ["only-a", "only-b", "root-only"]}))
        probes = [wait_for(handle, "probe") for handle in handles]
        assert probes[0]["authPresent"]["only-a"] == {"state": True, "pool": True}
        assert probes[1]["authPresent"]["only-b"] == {"state": True, "pool": True}
        for index, foreign in ((0, "only-b"), (1, "only-a")):
            assert probes[index]["authPresent"][foreign] == {"state": False, "pool": False}
            assert probes[index]["authPresent"]["root-only"] == {"state": False, "pool": False}
        default_space = base / "spaces" / "research"
        default_space.mkdir(parents=True)
        default = a.model_copy(update={"resolved_profile_home": str(base), "resolved_space_root": str(default_space), "backend_profile_name": "default"})
        handle = WorkerHost(default, python_executable=isolated_python()).start(entry_module="runtime.independent.worker_host", payload={"authProviderIds": ["root-only"]})
        handles.append(handle)
        assert wait_for(handle, "probe")["authPresent"]["root-only"] == {"state": True, "pool": True}
    finally:
        for handle in handles:
            handle.terminate(grace_seconds=0.25, hard_seconds=2)


def test_ordinary_cli_auth_still_allows_existing_root_fallback(tmp_path, monkeypatch):
    from cli import auth
    import runtime._compat.shim_constants as constants
    profile = tmp_path / "profile"
    profile.mkdir()
    (tmp_path / "auth.json").write_text(json.dumps({"providers": {"root-only": {"controlled": True}}, "credential_pool": {"root-only": [{"controlled": True}]}}), "utf-8")
    monkeypatch.delenv("LASTBROWSER_INDEPENDENT_WORKER", raising=False)
    monkeypatch.setattr(auth, "get_sidekick_home", lambda: profile)
    monkeypatch.setattr(constants, "get_default_sidekick_root", lambda: tmp_path)
    assert auth.get_provider_auth_state("root-only") == {"controlled": True}
    assert auth.read_credential_pool("root-only") == [{"controlled": True}]


def test_child_env_cannot_inherit_parent_provider_or_override_bound_home(tmp_path, monkeypatch):
    context = profile_context(tmp_path, "a")
    monkeypatch.setenv("OTHER_PROVIDER_API_KEY", "synthetic-parent-only")
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "foreign"))
    env = build_worker_environment(context)
    assert "OTHER_PROVIDER_API_KEY" not in env
    assert env["SIDEKICK_HOME"] == context.resolved_profile_home
    assert env["LASTBROWSER_PARTITION_KEY"] == context.partition_key
    assert env["LASTBROWSER_INDEPENDENT_WORKER"] == "1"
    assert env["PROFILE_PROBE_MARKER"] == "a"
    assert env["SIDEKICK_WEBUI_ACTIVE_WORKSPACE"] == "research"
    assert Path(env["SIDEKICK_WEBUI_SPACES_DIR"]) == Path(context.resolved_space_root).parent
    assert env["SIDEKICK_STREAM_RETRIES"] == "0"
    assert "PYTHONPATH" not in env


def test_two_workers_keep_real_profile_tool_and_mcp_globals_after_parent_switch(tmp_path, monkeypatch):
    a, b = profile_context(tmp_path, "a"), profile_context(tmp_path, "b")
    # Prefer the shipped 3.12 runtime when these tests run with a dev Python.
    python = isolated_python()
    handles = []
    try:
        handles.append(WorkerHost(a, python_executable=python).start(entry_module="runtime.independent.worker_host", payload={"marker": "a", "hold": True}))
        handles.append(WorkerHost(b, python_executable=python).start(entry_module="runtime.independent.worker_host", payload={"marker": "b", "hold": True}))
        probes = [wait_for(handle, "probe") for handle in handles]
        assert probes[0]["pid"] != probes[1]["pid"]
        for context, probe, name in zip((a, b), probes, ("a", "b")):
            assert probe["profileHome"] == context.resolved_profile_home
            assert probe["scope"] == context.scope.model_dump(mode="json", by_alias=True)
            assert probe["providerMarker"] == name and probe["envMarker"] == name
            assert probe["toolNames"] == [name] and probe["mcpKeys"] == [name]
            assert {item["copiedContext"] for item in probe["thread"]} == {True, False}
            for item in probe["thread"]:
                assert item["profile"] == name
                assert Path(item["home"]) == Path(context.resolved_profile_home)
                assert item["space"] == "research"
        monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "changed-ui-profile"))
        monkeypatch.setenv("PROFILE_PROBE_MARKER", "foreign-parent")
        from web.api import profiles
        monkeypatch.setattr(profiles, "_active_profile", "foreign-parent")
        for handle, context, name in zip(handles, (a, b), ("a", "b")):
            handle.send({"kind": "probe_again"})
            reply = wait_for(handle, "probe_again")
            assert reply["profileHome"] == context.resolved_profile_home
            assert reply["toolNames"] == [name] and reply["mcpKeys"] == [name]
    finally:
        for handle in handles:
            handle.terminate(grace_seconds=1, hard_seconds=3)
        assert all(not handle.is_alive for handle in handles)


def test_unapproved_entry_module_is_never_spawned(tmp_path):
    context = profile_context(tmp_path, "a")
    with pytest.raises(Exception, match="approved"):
        WorkerHost(context).start(entry_module="os", payload={})


def test_request_proxy_meters_each_sdk_entry_and_denies_before_io():
    from types import SimpleNamespace
    from runtime.independent.runner import ProviderRequestProxy
    from runtime.independent.policy import PolicyDenied
    observed, calls = [], []
    def gate():
        observed.append("request")
        if len(observed) > 2:
            raise PolicyDenied("provider_request_budget_exhausted")
    resource = SimpleNamespace(create=lambda **kw: calls.append("create"), stream=lambda **kw: calls.append("stream"))
    target = SimpleNamespace(max_retries=3, chat=SimpleNamespace(completions=resource), responses=resource)
    client = ProviderRequestProxy(target, gate)
    client.chat.completions.create(model="controlled")
    client.responses.stream(model="controlled")
    with pytest.raises(PolicyDenied, match="budget"):
        client.responses.create(model="controlled")
    assert target.max_retries == 0 and calls == ["create", "stream"]
    assert len(observed) == 3


def test_runtime_plan_does_not_guess_context_or_activate_auxiliary_models(tmp_path):
    from runtime.independent.runner import independent_runtime_config
    from runtime.independent.policy import PolicyDenied
    context = profile_context(tmp_path, "a")
    with pytest.raises(PolicyDenied, match="context_metadata_required"):
        independent_runtime_config(context, {})
    selected = context.model_copy(update={"provider": context.provider.model_copy(update={"context_length": 64000})})
    value = independent_runtime_config(selected, {})
    assert value["model"]["context_length"] == 64000
    assert value["runtime_hooks_enabled"] is False
    assert value["provider_metadata_prewarm"] is False
    assert value["context"] == {"engine": "compressor"}
    assert value["compression"]["enabled"] is False
    assert value["agent"]["api_max_retries"] == 1
    assert (Path(context.resolved_profile_home) / "config.yaml").read_text("utf-8") == "probe_provider: a\n"


def test_existing_hook_helpers_preserve_normal_calls_and_deny_independent_calls(monkeypatch):
    from run_agent import AIAgent
    from cli import plugins
    calls = []
    monkeypatch.setattr(plugins, "invoke_hook", lambda *a, **kw: calls.append((a, kw)) or ["normal"])
    monkeypatch.setattr(plugins, "get_pre_tool_call_block_message", lambda *a, **kw: calls.append((a, kw)) or "normal-block")
    ordinary = AIAgent.__new__(AIAgent)
    independent = AIAgent.__new__(AIAgent)
    independent._runtime_hooks_enabled = False
    assert ordinary._invoke_runtime_hook("pre_llm_call", model="controlled") == ["normal"]
    assert ordinary._runtime_tool_block_message("read_file", {}) == "normal-block"
    assert independent._invoke_runtime_hook("pre_llm_call", model="controlled") == []
    assert independent._runtime_tool_block_message("read_file", {}) is None
    assert len(calls) == 2


def test_actual_constructor_uses_owned_config_without_changing_normal_config(tmp_path, monkeypatch):
    import copy
    from unittest.mock import MagicMock
    import run_agent
    from cli import config
    home = tmp_path / "constructor-home"
    home.mkdir()
    monkeypatch.setenv("SIDEKICK_HOME", str(home))
    monkeypatch.setenv("SIDEKICK_BASE_HOME", str(home))
    monkeypatch.delenv("LASTBROWSER_INDEPENDENT_WORKER", raising=False)
    monkeypatch.setattr(run_agent, "get_sidekick_home", lambda: home)
    ordinary_config = {"agent": {"api_max_retries": 7}, "model": {"context_length": 64000}, "compression": {"enabled": False}}
    before = copy.deepcopy(ordinary_config)
    monkeypatch.setattr(config, "load_config", lambda *a, **kw: ordinary_config)
    monkeypatch.setattr(run_agent, "query_ollama_num_ctx", lambda *a, **kw: None)
    monkeypatch.setattr(run_agent.AIAgent, "_create_openai_client", lambda *a, **kw: MagicMock())
    agents = []
    try:
        common = {"model": "controlled-agent", "provider": "custom", "base_url": "http://127.0.0.1:9/v1", "api_key": "controlled-fixture", "quiet_mode": True, "enabled_toolsets": [], "skip_memory": True, "skip_context_files": True}
        agents.append(run_agent.AIAgent(**common))
        from runtime.chat_modes import ChatExecutionPolicy
        policy = ChatExecutionPolicy("plan", 4)
        runtime = {**copy.deepcopy(ordinary_config), "agent": {"api_max_retries": 1}, "runtime_hooks_enabled": False, "provider_metadata_prewarm": False}
        agents.append(run_agent.AIAgent(**common, runtime_config=runtime, chat_execution_policy=policy))
        runtime["agent"]["api_max_retries"] = 99
        assert agents[0]._api_max_retries == 7
        assert agents[0]._runtime_hooks_enabled is True
        assert agents[0]._chat_execution_policy is None
        assert agents[1]._chat_execution_policy is policy
        assert agents[1]._api_max_retries == 1
        assert agents[1]._runtime_config["agent"]["api_max_retries"] == 1
        assert agents[1]._runtime_hooks_enabled is False
        assert ordinary_config == before
    finally:
        for agent in agents:
            agent.close()


@pytest.mark.parametrize("deny", [False, True])
def test_actual_bound_agent_calls_controlled_provider_only_after_parent_gate(tmp_path, deny):
    """Real AIAgent + OpenAI SDK + HTTP; the response is a fixture, not inference."""
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    import time
    requests = []
    class Provider(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def do_GET(self):
            requests.append(("GET", self.path))
            self.send_error(405)
        def do_POST(self):
            request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            requests.append(("POST", self.path, request))
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            base = {"id": "controlled-response", "object": "chat.completion.chunk", "created": 1, "model": "controlled-agent"}
            chunks = [{**base, "choices": [{"index": 0, "delta": {"role": "assistant", "content": text,
                **({"reasoning_content": "Private reasoning channel"} if index == 0 else {})}, "finish_reason": None}]}
                for index, text in enumerate(("<thi", "nk>Private reasoning body", "</think>Controlled provider response – Grüße 日本語"))]
            chunks.append({**base, "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 7, "completion_tokens": 4, "total_tokens": 11}})
            for chunk in chunks:
                self.wfile.write(("data: " + json.dumps(chunk) + "\n\n").encode())
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
    server = ThreadingHTTPServer(("127.0.0.1", 0), Provider)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    context = profile_context(tmp_path, "a")
    context = context.model_copy(update={"provider": ProviderSelection(provider_config_ref="controlled", provider="custom", model="controlled-agent", context_length=64000)})
    home = Path(context.resolved_profile_home)
    (home / "config.yaml").write_text(f"model:\n  provider: custom\n  default: controlled-agent\n  base_url: http://127.0.0.1:{server.server_port}/v1\n  api_key: controlled-fixture\n  context_length: 64000\n", "utf-8")
    from runtime.independent.capabilities import evidence_digest
    auth_path = home / "auth.json"
    auth_path.write_text(json.dumps({"version": 1, "providers": {}, "credential_pool": {}}), "utf-8")
    captured_auth = auth_path.read_bytes()
    captured_evidence = evidence_digest(home)
    handle = None
    events = []
    try:
        handle = WorkerHost(context, python_executable=isolated_python()).start(payload={"mode": "assistant", "instruction": "Give a brief response"})
        until = time.monotonic() + 25
        while time.monotonic() < until:
            event = handle.read_event(timeout=0.1)
            if not event:
                continue
            events.append(event)
            if event.get("kind") == "request":
                assert auth_path.read_bytes() == captured_auth
                assert evidence_digest(home) == captured_evidence
                assert event.get("runId") == context.run_id
                assert requests == [] or event.get("requestKind") == "usage"
                handle.send({"kind": "reply", "requestId": event["requestId"], **({"error": "controlled_parent_denial"} if deny else {"value": {"authorized": True}})})
            elif event.get("kind") in {"result", "error", "eof"}:
                break
        terminal = events[-1]
        assert auth_path.read_bytes() == captured_auth
        assert evidence_digest(home) == captured_evidence
        assert [event.get("requestKind") for event in events if event.get("kind") == "request"].count("provider_request") == 1, events
        if deny:
            assert requests == []
            assert terminal == {"kind": "error", "code": "controlled_parent_denial", "runId": context.run_id}
        else:
            assert terminal["kind"] == "result", terminal
            assert terminal["value"]["response"] == "Controlled provider response – Grüße 日本語"
            assert "".join(event["delta"] for event in events if event.get("kind") == "delta") == "Controlled provider response – Grüße 日本語"
            assert len(requests) == 1 and requests[0][:2] == ("POST", "/v1/chat/completions")
            assert [event.get("measuredTokens") for event in events if event.get("requestKind") == "usage"] == [11]
    finally:
        if handle:
            handle.terminate(grace_seconds=0.25, hard_seconds=2)
        server.shutdown()
        server.server_close()
        server_thread.join(timeout=2)


@pytest.mark.parametrize("independent", [False, True])
def test_native_config_seed_persistence_keeps_legacy_and_bound_worker_separate(monkeypatch, independent):
    from runtime import credential_pool
    config = {"custom_providers": [{"name": "controlled", "base_url": "http://127.0.0.1:9/v1", "api_key": "controlled-fixture"}]}
    writes = []
    monkeypatch.setattr(credential_pool, "_load_config_safe", lambda: config)
    monkeypatch.setattr(credential_pool, "read_credential_pool", lambda _: [])
    monkeypatch.setattr(credential_pool, "write_credential_pool", lambda provider, rows: writes.append((provider, rows)))
    if independent:
        monkeypatch.setenv("LASTBROWSER_INDEPENDENT_WORKER", "1")
    else:
        monkeypatch.delenv("LASTBROWSER_INDEPENDENT_WORKER", raising=False)
    pool = credential_pool.load_pool("custom:controlled")
    assert pool.has_credentials()
    assert pool.entries()[0].access_token == "controlled-fixture"
    assert len(writes) == (0 if independent else 1)


@pytest.mark.parametrize("independent", [False, True])
def test_native_gh_cli_fallback_never_runs_in_bound_worker(monkeypatch, independent):
    from cli import copilot_auth
    import subprocess
    calls = []
    monkeypatch.setattr(copilot_auth, "_gh_cli_candidates", lambda: ["controlled-gh.exe"])
    def native_gh(command, **kwargs):
        calls.append(command)
        return subprocess.CompletedProcess(command, 0, stdout="controlled-ambient-credential", stderr="")
    monkeypatch.setattr(copilot_auth.subprocess, "run", native_gh)
    if independent:
        monkeypatch.setenv("LASTBROWSER_INDEPENDENT_WORKER", "1")
    else:
        monkeypatch.delenv("LASTBROWSER_INDEPENDENT_WORKER", raising=False)
    result = copilot_auth._try_gh_cli_token()
    assert len(calls) == (0 if independent else 1)
    assert result == (None if independent else "controlled-ambient-credential")


def test_bound_pool_rejects_persisted_gh_seed_but_keeps_explicit_own_credential(monkeypatch):
    from runtime import credential_pool
    rows = [{"id": new_id(), "source": source, "access_token": "controlled-own-fixture", "auth_type": "api_key", "priority": index}
        for index, source in enumerate(("gh_cli", "user"))]
    monkeypatch.setenv("LASTBROWSER_INDEPENDENT_WORKER", "1")
    monkeypatch.setattr(credential_pool, "read_credential_pool", lambda _: rows)
    monkeypatch.setattr(credential_pool, "_seed_from_singletons", lambda *_: (False, set()))
    monkeypatch.setattr(credential_pool, "_seed_from_env", lambda *_: (False, set()))
    monkeypatch.setattr(credential_pool, "_load_config_safe", lambda: {})
    pool = credential_pool.load_pool("copilot")
    assert [entry.source for entry in pool.entries()] == ["user"]


@pytest.mark.parametrize("independent", [False, True])
def test_actual_windows_child_gh_sentinel_and_owned_auth_pool(tmp_path, independent):
    """Native subprocess fallback reaches only a controlled local cmd stub."""
    if os.name != "nt":
        pytest.skip("Windows Credential Manager regression")
    import subprocess
    context = profile_context(tmp_path, "gh-bound")
    home = Path(context.resolved_profile_home)
    sentinel = tmp_path / "controlled-gh-called.txt"
    fake_gh = tmp_path / "controlled-gh.cmd"
    fake_gh.write_text('@echo off\n@echo called>>"' + str(sentinel) + '"\n@echo controlled-ambient-fixture\n', "utf-8")
    rows = [{"id": new_id(), "source": source, "access_token": "controlled-own-fixture", "auth_type": "api_key", "priority": index}
        for index, source in enumerate(("gh_cli", "user"))]
    auth = home / "auth.json"
    auth.write_text(json.dumps({"version": 1, "providers": {}, "credential_pool": {"copilot": rows}}), "utf-8")
    before = auth.read_bytes()
    env = build_worker_environment(context)
    if not independent:
        env.pop("LASTBROWSER_INDEPENDENT_WORKER")
    code = "import sys,os,json;sys.path.insert(0,sys.argv[1]);from cli import copilot_auth;copilot_auth._gh_cli_candidates=lambda:[sys.argv[2]];token=copilot_auth._try_gh_cli_token();result={'pid':os.getpid(),'hasAmbient':bool(token)};"
    if independent:
        code += "from runtime.credential_pool import load_pool;result['ownSources']=[entry.source for entry in load_pool('copilot').entries()];"
    code += "print(json.dumps(result))"
    result = subprocess.run([str(isolated_python()), "-I", "-B", "-c", code, str(Path(__file__).resolve().parents[1]), str(fake_gh)],
        env=env, cwd=context.resolved_space_root, capture_output=True, text=True, encoding="utf-8", timeout=20)
    assert result.returncode == 0, result.stderr
    observed = json.loads(result.stdout.splitlines()[-1])
    assert observed["pid"] != os.getpid()
    assert observed["hasAmbient"] is (not independent)
    assert sentinel.exists() is (not independent)
    if independent:
        assert observed["ownSources"] == ["user"]
        assert auth.read_bytes() == before


def test_catalog_token_exchange_refresh_and_ambient_keychain_are_denied(monkeypatch):
    from cli import copilot_auth
    from runtime import anthropic_adapter, credential_pool
    from web.api import config
    monkeypatch.setenv("LASTBROWSER_INDEPENDENT_WORKER", "1")
    monkeypatch.setenv("LASTBROWSER_INDEPENDENT_PURPOSE", "model_catalog")
    monkeypatch.setattr(anthropic_adapter.platform, "system", lambda: "Darwin")
    calls = []
    monkeypatch.setattr(anthropic_adapter.subprocess, "run", lambda *a, **kw: calls.append("keychain"))
    assert anthropic_adapter._read_claude_code_credentials_from_keychain() is None
    monkeypatch.setattr(copilot_auth, "resolve_copilot_token", lambda: ("controlled-own-fixture", "COPILOT_GITHUB_TOKEN"))
    changed, sources = credential_pool._seed_from_singletons("copilot", [])
    assert not changed and not sources
    with pytest.raises(RuntimeError, match="cannot exchange"):
        copilot_auth.get_copilot_api_token("controlled-own-fixture")
    with pytest.raises(RuntimeError, match="cannot exchange"):
        copilot_auth.exchange_copilot_token("controlled-own-fixture")
    assert config._runtime_provider_status("openai-codex") == {}
    entry = credential_pool.PooledCredential(provider="anthropic", id=new_id(), label="Controlled own account", auth_type="oauth",
        priority=0, source="user", access_token="controlled-own-fixture", refresh_token="controlled-refresh-fixture")
    monkeypatch.setattr(anthropic_adapter, "refresh_anthropic_oauth_pure", lambda *a, **kw: calls.append("refresh"))
    assert credential_pool.CredentialPool("anthropic", [entry])._refresh_entry(entry, force=True) is None
    assert calls == []


def test_auth_store_noop_save_preserves_bytes_timestamp_and_mtime(tmp_path, monkeypatch):
    from cli import auth
    store_path = tmp_path / "private-profile" / "auth.json"
    store_path.parent.mkdir(parents=True)
    original = {"version": auth.AUTH_STORE_VERSION, "updated_at": "fixed-test-time", "providers": {},
        "active_provider": None, "credential_pool": {"controlled": [{"id": "fixture", "token": "synthetic"}]}}
    store_path.write_text(json.dumps(original, indent=2) + "\n", "utf-8")
    before_bytes, before_mtime = store_path.read_bytes(), store_path.stat().st_mtime_ns
    monkeypatch.setattr(auth, "_auth_file_path", lambda: store_path)
    same = dict(original)
    same["updated_at"] = "caller-timestamp-must-not-force-write"
    assert auth._save_auth_store(same) == store_path
    assert store_path.read_bytes() == before_bytes
    assert store_path.stat().st_mtime_ns == before_mtime


def test_auth_store_real_credential_change_still_persists_new_timestamp(tmp_path, monkeypatch):
    from cli import auth
    store_path = tmp_path / "private-profile" / "auth.json"
    store_path.parent.mkdir(parents=True)
    original = {"version": auth.AUTH_STORE_VERSION, "updated_at": "fixed-test-time", "providers": {"test": {"access_token": "synthetic-old"}}}
    store_path.write_text(json.dumps(original, indent=2) + "\n", "utf-8")
    monkeypatch.setattr(auth, "_auth_file_path", lambda: store_path)
    changed = dict(original)
    changed["providers"] = {"test": {"access_token": "synthetic-new"}}
    auth._save_auth_store(changed)
    saved = json.loads(store_path.read_text("utf-8"))
    assert saved["providers"]["test"]["access_token"] == "synthetic-new"
    assert saved["updated_at"] != "fixed-test-time"
