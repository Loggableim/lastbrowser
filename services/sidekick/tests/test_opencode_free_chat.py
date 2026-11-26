"""The free chat route uses the official OpenCode CLI and no user key."""
import json
import os
import stat
import subprocess
import sys
import time
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace

import pytest

from runtime.opencode_free_chat import (
    CANDIDATE_MODELS,
    CLI_MODEL,
    FREE_MODEL,
    FREE_PROVIDER,
    attach_free_opencode_catalog,
    free_default_choice,
    free_client_path,
    is_free_official_chat,
    openrouter_free_headers,
    stream_free_reply,
)


def test_v2_stream_events_are_scoped_to_the_active_session():
    from runtime.opencode_free_chat import _v2_stream_event

    session = "ses_fixture"
    assert _v2_stream_event({"type": "session.text.delta", "data": {"sessionID": session, "delta": "Hello"}}, session) == ("text", "Hello")
    assert _v2_stream_event({"type": "session.text.delta", "data": {"sessionID": "ses_other", "delta": "Wrong"}}, session) == ("ignore", "")
    assert _v2_stream_event({"type": "session.execution.succeeded", "data": {"sessionID": session}}, session) == ("done", "")
    assert _v2_stream_event({"type": "session.execution.failed", "data": {"sessionID": session, "error": "sensitive"}}, session) == ("error", "")
    assert _v2_stream_event({"type": "session.execution.failed", "data": {"sessionID": session, "error": {"type": "provider.free-limit", "status": 429, "message": "private"}}}, session) == ("rate_limit", "")
    assert _v2_stream_event({"type": "session.execution.interrupted", "data": {"sessionID": session}}, session) == ("interrupted", "")
    assert _v2_stream_event({"type": "session.text.delta", "data": {"sessionID": session, "delta": 4}}, session) == ("ignore", "")


@pytest.mark.parametrize("cancel", [False, True])
def test_v2_server_turn_streams_and_interrupts(monkeypatch, tmp_path, cancel):
    from runtime import opencode_free_chat as client

    stop = threading.Event()
    calls = []
    events = [
        {"type": "session.text.delta", "data": {"sessionID": "ses_other", "delta": "wrong"}},
        {"type": "session.text.delta", "data": {"sessionID": "ses_test", "delta": "hello"}},
        {"type": "session.execution.succeeded", "data": {"sessionID": "ses_test"}},
    ]
    class Response:
        sent = False
        def __enter__(self): return self
        def __exit__(self, *_args): pass
        def read1(self, _size):
            if self.sent: return b""
            self.sent = True
            return ("".join("data: " + json.dumps(event) + "\n\n" for event in events)).encode()
    def request(_server, method, route, body=None, **_kwargs):
        calls.append((method, route, body))
        return {"data": {"id": "ses_test"}} if route == "/api/session" else {}
    monkeypatch.setattr(client, "_ensure_server", lambda *_args: {"base": "http://127.0.0.1:1", "auth": "local", "api_version": 2})
    monkeypatch.setattr(client, "_server_json", request)
    monkeypatch.setattr(client.urllib.request, "urlopen", lambda *_args, **_kwargs: Response())
    chunks = []
    def emit(text):
        chunks.append(text)
        if cancel: stop.set()
    if cancel:
        with pytest.raises(InterruptedError):
            client._serve_turn(binary="test", root=tmp_path, prompt="hello", model="free", on_text=emit, cancel_event=stop)
        assert ("POST", "/api/session/ses_test/interrupt", {}) in calls
    else:
        assert client._serve_turn(binary="test", root=tmp_path, prompt="hello", model="free", on_text=emit, cancel_event=stop) == "hello"
    assert chunks == ["hello"]
    assert ("POST", "/api/session/ses_test/model", {"model": {"providerID": "opencode", "id": "free"}}) in calls
    assert ("POST", "/api/session/ses_test/prompt", {"text": "hello"}) in calls


def test_v2_truncated_stream_interrupts_the_unfinished_server_turn(monkeypatch, tmp_path):
    from runtime import opencode_free_chat as client
    calls = []
    class Response:
        sent = False
        def __enter__(self): return self
        def __exit__(self, *_args): pass
        def read1(self, _size):
            if self.sent: return b""
            self.sent = True
            return b'data: {"type":"session.text.delta","data":{"sessionID":"ses_test","delta":"partial"}}\n\n'
    def request(_server, method, route, body=None, **_kwargs):
        calls.append((method, route, body))
        return {"data": {"id": "ses_test"}} if route == "/api/session" else {}
    monkeypatch.setattr(client, "_ensure_server", lambda *_args: {"base": "http://127.0.0.1:1", "auth": "local", "api_version": 2})
    monkeypatch.setattr(client, "_server_json", request)
    monkeypatch.setattr(client.urllib.request, "urlopen", lambda *_args, **_kwargs: Response())
    with pytest.raises(client.FreeChatError, match="interrupted"):
        client._serve_turn(binary="test", root=tmp_path, prompt="hello", model="free", on_text=lambda _: None, cancel_event=None)
    assert ("POST", "/api/session/ses_test/interrupt", {}) in calls


def test_completed_v2_turn_releases_its_event_listener(monkeypatch, tmp_path):
    from runtime import opencode_free_chat as client
    release = threading.Event()
    closed = threading.Event()
    class Response:
        sent = False
        def __enter__(self): return self
        def __exit__(self, *_args): closed.set()
        def read1(self, _size):
            if not self.sent:
                self.sent = True
                return ("".join("data: " + json.dumps(e) + "\n\n" for e in [
                    {"type": "session.text.delta", "data": {"sessionID": "ses_test", "delta": "ok"}},
                    {"type": "session.execution.succeeded", "data": {"sessionID": "ses_test"}},
                ])).encode()
            release.wait(2)
            time.sleep(0.02)
            return b'data: {"type":"unrelated"}\n\n'
    monkeypatch.setattr(client, "_ensure_server", lambda *_args: {"base": "http://127.0.0.1:1", "auth": "local", "api_version": 2})
    monkeypatch.setattr(client, "_server_json", lambda _s, _m, route, *_a, **_k: {"data": {"id": "ses_test"}} if route == "/api/session" else {})
    monkeypatch.setattr(client.urllib.request, "urlopen", lambda *_args, **_kwargs: Response())
    try:
        assert client._serve_turn(binary="test", root=tmp_path, prompt="hi", model="free", on_text=lambda _: None, cancel_event=None) == "ok"
    finally:
        release.set()
    assert closed.wait(1)


def test_v2_failed_interrupt_stops_the_owned_server(monkeypatch):
    from runtime import opencode_free_chat as client
    process = SimpleNamespace()
    server = {"process": process}
    other = {"process": object()}
    stopped = []
    monkeypatch.setattr(client, "_SERVERS", {"ours": server, "other": other})
    monkeypatch.setattr(client, "_server_json", lambda *_args, **_kwargs: (_ for _ in ()).throw(client.FreeChatError("offline")))
    monkeypatch.setattr(client, "_stop_free_server", stopped.append)
    client._interrupt_v2_turn(server, "ses_test")
    assert stopped == [process]
    assert client._SERVERS == {"other": other}


def test_v2_reuses_only_the_same_profile_chat_and_model(monkeypatch, tmp_path):
    from runtime import opencode_free_chat as client
    calls = []
    class Response:
        sent = False
        def __enter__(self): return self
        def __exit__(self, *_args): pass
        def read1(self, _size):
            if self.sent: return b""
            self.sent = True
            return ("".join("data: " + json.dumps(e) + "\n\n" for e in [
                {"type": "session.text.delta", "data": {"sessionID": "ses_test", "delta": "ok"}},
                {"type": "session.execution.succeeded", "data": {"sessionID": "ses_test"}},
            ])).encode()
    def request(_server, method, route, body=None, **_kwargs):
        calls.append((method, route, body))
        return {"data": {"id": "ses_test"}} if route == "/api/session" else {}
    monkeypatch.setattr(client, "_ensure_server", lambda *_args: {"base": "http://127.0.0.1:1", "auth": "local", "api_version": 2})
    monkeypatch.setattr(client, "_server_json", request)
    monkeypatch.setattr(client.urllib.request, "urlopen", lambda *_args, **_kwargs: Response())
    root = client._client_root(tmp_path)
    for chat, model in [("one", "free"), ("one", "free"), ("two", "free"), ("one", "other")]:
        assert client._serve_turn(binary="test", root=root, session_key=chat, prompt="hello", model=model, on_text=lambda _: None, cancel_event=None) == "ok"
    assert sum(route == "/api/session" for _, route, _ in calls) == 3


def test_v2_server_starts_with_isolated_deny_configuration(monkeypatch, tmp_path):
    from runtime import opencode_free_chat as client
    started = []
    class Process:
        def poll(self): return None
    def spawn(command, **kwargs):
        started.append((command, kwargs))
        return Process()
    monkeypatch.setattr(client, "_SERVERS", {})
    monkeypatch.setattr(client, "_SERVER_FAILED", {})
    monkeypatch.setattr(client, "_client_api_version", lambda *_args: 2)
    monkeypatch.setattr(client, "_free_port", lambda: 12345)
    monkeypatch.setattr(client.subprocess, "Popen", spawn)
    monkeypatch.setattr(client, "_server_json", lambda _server, _method, route, **_kwargs: {"data": []} if route.startswith("/api/session") else None)
    root = client._client_root(tmp_path)
    server = client._ensure_server("test-client", root)
    command, kwargs = started[0]
    config = json.loads(kwargs["env"]["OPENCODE_CONFIG_CONTENT"])
    assert server["api_version"] == 2
    assert "--pure" not in command
    assert config["permissions"] == [{"action": "*", "resource": "*", "effect": "deny"}]
    assert {entry["action"] for entry in config["policies"]} == {"tool.use", "plugin.use", "mcp.use", "skill.use"}
    assert kwargs["env"]["OPENCODE_SERVER_PASSWORD"]


def test_v2_version_output_with_v_prefix_is_detected(monkeypatch, tmp_path):
    from runtime import opencode_free_chat as client
    monkeypatch.setattr(client.subprocess, "run", lambda *_args, **_kwargs: SimpleNamespace(returncode=0, stdout="opencode v2.4.2\n"))
    assert client._client_api_version("client", client._client_root(tmp_path)) == 2


def test_client_version_probe_retries_one_transient_timeout(monkeypatch, tmp_path):
    from runtime import opencode_free_chat as client
    attempts = []
    def run(*_args, **_kwargs):
        attempts.append(True)
        if len(attempts) == 1:
            raise subprocess.TimeoutExpired("client", 5)
        return SimpleNamespace(returncode=0, stdout="opencode v2.4.2\n")
    monkeypatch.setattr(client.subprocess, "run", run)
    assert client._client_api_version("client", client._client_root(tmp_path)) == 2
    assert len(attempts) == 2


def test_client_version_probe_fails_closed_after_two_timeouts(monkeypatch, tmp_path):
    from runtime import opencode_free_chat as client
    attempts = []
    def run(*_args, **_kwargs):
        attempts.append(True)
        raise subprocess.TimeoutExpired("client", 5)
    monkeypatch.setattr(client.subprocess, "run", run)
    with pytest.raises(client.UnverifiedClientError):
        client._client_api_version("client", client._client_root(tmp_path))
    assert len(attempts) == 2


@pytest.mark.parametrize("version", ["opencode v2.5.0", "opencode v3.0.0", "unrecognized"])
def test_unverified_client_version_cannot_use_the_v2_safety_assumptions(monkeypatch, tmp_path, version):
    from runtime import opencode_free_chat as client
    monkeypatch.setattr(client.subprocess, "run", lambda *_args, **_kwargs: SimpleNamespace(returncode=0, stdout=version))
    with pytest.raises(client.FreeChatError, match="not been verified"):
        client._client_api_version("client", client._client_root(tmp_path))


def test_unverified_client_never_falls_back_to_cli_or_cloud(monkeypatch, tmp_path):
    from runtime import opencode_free_chat as client
    monkeypatch.setattr(client, "free_client_path", lambda: "client")
    monkeypatch.setattr(client, "_client_api_version", lambda *_args: (_ for _ in ()).throw(client.UnverifiedClientError("unverified")))
    monkeypatch.setattr(client, "_cli_turn", lambda **_kwargs: pytest.fail("unverified CLI was started"))
    monkeypatch.setattr(client, "_openrouter_free", lambda *_args: pytest.fail("unexpected cloud fallback"))
    with pytest.raises(client.UnverifiedClientError):
        client.stream_free_reply(profile_home=tmp_path, session_key="test", prompt="hello", on_text=lambda _: None)


def test_free_model_limit_is_not_hidden_by_failed_fallbacks(monkeypatch, tmp_path):
    from runtime import opencode_free_chat as client
    monkeypatch.setattr(client, "free_client_path", lambda: "client")
    def server(**kwargs):
        if kwargs["model"] == client.FREE_MODEL:
            raise client.FreeModelLimitError("quota reached")
        raise client.FreeChatError("other provider failure")
    monkeypatch.setattr(client, "_serve_turn", server)
    monkeypatch.setattr(client, "_cli_turn", lambda **_kwargs: (_ for _ in ()).throw(client.FreeChatError("cli unavailable")))
    monkeypatch.setattr(client, "_openrouter_free", lambda *_args: (_ for _ in ()).throw(client.FreeChatError("offline")))
    with pytest.raises(client.FreeModelLimitError, match="quota reached"):
        client.stream_free_reply(profile_home=tmp_path, session_key="test", prompt="hello", on_text=lambda _: None)


def test_v2_rate_limit_skips_unsupported_legacy_cli(monkeypatch, tmp_path):
    from runtime import opencode_free_chat as client
    root = client._client_root(tmp_path)
    monkeypatch.setattr(client, "_SERVERS", {str(root.resolve()): {"api_version": 2}})
    monkeypatch.setattr(client, "free_client_path", lambda: "client")
    monkeypatch.setattr(client, "_models_for_turn", lambda _model: ("free",))
    monkeypatch.setattr(client, "_serve_turn", lambda **_kwargs: (_ for _ in ()).throw(client.FreeModelLimitError("quota")))
    monkeypatch.setattr(client, "_cli_turn", lambda **_kwargs: pytest.fail("v1-only CLI invoked for v2"))
    monkeypatch.setattr(client, "_openrouter_free", lambda *_args: (_ for _ in ()).throw(client.FreeChatError("offline")))
    with pytest.raises(client.FreeModelLimitError):
        client.stream_free_reply(profile_home=tmp_path, session_key="test", prompt="hello", on_text=lambda _: None)


def test_explicit_openrouter_free_does_not_call_opencode(monkeypatch, tmp_path):
    from runtime import opencode_free_chat as client
    monkeypatch.setattr(client, "free_client_path", lambda: "client")
    monkeypatch.setattr(client, "_serve_turn", lambda **_kwargs: pytest.fail("wrong provider"))
    monkeypatch.setattr(client, "_openrouter_free", lambda prompt, emit: (emit("reply"), "reply")[1])
    route = {}
    assert client.stream_free_reply(profile_home=tmp_path, session_key="test", prompt="hi", on_text=lambda _: None,
                                    provider="openrouter", model="openrouter/free", route_out=route) == "reply"
    assert route["provider"] == "openrouter"


def test_opencode_failure_does_not_transmit_to_openrouter(monkeypatch, tmp_path):
    from runtime import opencode_free_chat as client
    monkeypatch.setattr(client, "free_client_path", lambda: "client")
    monkeypatch.setattr(client, "_models_for_turn", lambda _model: ("free",))
    monkeypatch.setattr(client, "_serve_turn", lambda **_kwargs: (_ for _ in ()).throw(client.FreeChatError("offline")))
    monkeypatch.setattr(client, "_cli_turn", lambda **_kwargs: (_ for _ in ()).throw(client.FreeChatError("offline")))
    monkeypatch.setattr(client, "_openrouter_free", lambda *_args: pytest.fail("unexpected provider transfer"))
    with pytest.raises(client.FreeChatError):
        client.stream_free_reply(profile_home=tmp_path, session_key="test", prompt="hi", on_text=lambda _: None, provider="opencode")


def test_missing_opencode_client_does_not_transmit_to_openrouter(monkeypatch, tmp_path):
    from runtime import opencode_free_chat as client
    monkeypatch.setattr(client, "free_client_path", lambda: None)
    monkeypatch.setattr(client, "_openrouter_free", lambda *_args: pytest.fail("unexpected provider transfer"))
    with pytest.raises(client.FreeChatError, match="not available"):
        client.stream_free_reply(profile_home=tmp_path, session_key="test", prompt="hi", on_text=lambda _: None, provider="opencode")


def test_free_model_limit_has_a_structured_error_code_without_provider_details():
    from runtime.opencode_free_chat import FreeModelLimitError, free_chat_error_payload
    payload = free_chat_error_payload(FreeModelLimitError("private provider detail"), "session")
    assert payload == {"error": "The free OpenCode model has reached its usage limit. Try again later or choose another model.", "code": "opencode_free_limit", "session_id": "session"}


def test_free_client_environment_is_profile_scoped_and_excludes_inherited_credentials(monkeypatch, tmp_path):
    from runtime.opencode_free_chat import _child_env, _client_root

    monkeypatch.setenv("GITHUB_TOKEN", "fixture-only")
    monkeypatch.setenv("OPENCODE_CONFIG", "fixture-config")
    monkeypatch.setenv("APPDATA", "fixture-host-appdata")
    root = _client_root(tmp_path / "profile")
    env = _child_env(root)
    assert "GITHUB_TOKEN" not in env
    assert "OPENCODE_CONFIG" not in env
    assert env["HOME"] == str(root)
    assert env["USERPROFILE"] == str(root)
    assert env["APPDATA"] == str(root / "config")
    assert env["LOCALAPPDATA"] == str(root / "data")
    assert env["TEMP"] == str(root / "data" / "tmp")
    assert (root / "data" / "tmp").is_dir()
    assert env["OPENCODE_PURE"] == "1"
    assert env["OPENCODE_DISABLE_PROJECT_CONFIG"] == "1"


@pytest.mark.skipif(os.name != 'nt', reason='Windows executable discovery')
def test_windows_bundled_client_is_discovered_without_environment_override(monkeypatch, tmp_path):
    monkeypatch.delenv("LASTBROWSER_OPENCODE_BIN", raising=False)
    monkeypatch.setenv("SIDEKICK_AGENT_DIR", str(tmp_path))
    client = tmp_path / "vendor" / "opencode" / "opencode.exe"
    client.parent.mkdir(parents=True)
    client.write_bytes(b"test fixture")
    client.chmod(client.stat().st_mode | stat.S_IEXEC)
    assert free_client_path() == str(client)


@pytest.mark.skipif(os.name != 'nt', reason='Windows npm installation layout')
def test_windows_npm_client_is_discovered_without_environment_override(monkeypatch, tmp_path):
    monkeypatch.delenv("LASTBROWSER_OPENCODE_BIN", raising=False)
    monkeypatch.setenv("SIDEKICK_AGENT_DIR", str(tmp_path / "empty-agent"))
    monkeypatch.setenv("APPDATA", str(tmp_path))
    monkeypatch.setenv("PATH", "")
    monkeypatch.setattr("runtime.opencode_free_chat.Path.home", lambda: tmp_path / "empty-home")
    client = tmp_path / "npm" / "node_modules" / "opencode-ai" / "bin" / "opencode.exe"
    client.parent.mkdir(parents=True)
    client.write_bytes(b"test fixture")
    assert free_client_path() == str(client)


def test_client_is_discovered_on_path(monkeypatch, tmp_path):
    monkeypatch.delenv("LASTBROWSER_OPENCODE_BIN", raising=False)
    monkeypatch.setenv("SIDEKICK_AGENT_DIR", str(tmp_path / "empty-agent"))
    monkeypatch.delenv("APPDATA", raising=False)
    monkeypatch.setattr("runtime.opencode_free_chat.Path.home", lambda: tmp_path / "empty-home")
    client = tmp_path / ("opencode.exe" if os.name == "nt" else "opencode")
    client.write_bytes(b"test fixture")
    client.chmod(client.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("PATH", str(tmp_path))
    assert free_client_path() == str(client)


def test_unstartable_client_does_not_leak_raw_os_error(monkeypatch, tmp_path):
    from runtime.opencode_free_chat import FreeChatError
    monkeypatch.setattr("runtime.opencode_free_chat.free_client_path", lambda: "bad-client")
    monkeypatch.setattr("runtime.opencode_free_chat.subprocess.Popen", lambda *_args, **_kwargs: (_ for _ in ()).throw(OSError("sensitive path")))
    monkeypatch.setattr("runtime.opencode_free_chat._openrouter_free", lambda *_args, **_kwargs: (_ for _ in ()).throw(FreeChatError("offline")))
    with pytest.raises(FreeChatError) as error:
        stream_free_reply(profile_home=tmp_path, session_key="chat", prompt="hello", on_text=lambda _text: None)
    assert "sensitive path" not in str(error.value)


def test_timed_out_server_is_stopped_and_removed(monkeypatch, tmp_path):
    from runtime import opencode_free_chat as client
    class Process:
        stopped = False
        def poll(self): return 0 if self.stopped else None
        def terminate(self): self.stopped = True
        def wait(self, timeout): return 0
        def kill(self): self.stopped = True
    process = Process()
    clock = iter([0, 31, 31])
    monkeypatch.setattr(client, "time", SimpleNamespace(monotonic=lambda: next(clock)))
    monkeypatch.setattr(client, "_free_port", lambda: 12345)
    monkeypatch.setattr(client, "_client_api_version", lambda *_args: 1)
    monkeypatch.setattr(client.subprocess, "Popen", lambda *_args, **_kwargs: process)
    root = client._client_root(tmp_path)
    with pytest.raises(client.FreeChatError):
        client._ensure_server("test-client", root)
    assert process.stopped
    assert str(root.resolve()) not in client._SERVERS


def test_server_start_can_retry_after_transient_failure_cooldown(monkeypatch, tmp_path):
    from runtime import opencode_free_chat as client
    clock = [100.0]
    launches = []
    class Process:
        def poll(self): return None
    def spawn(*_args, **_kwargs):
        launches.append(True)
        if len(launches) == 1: raise OSError("temporary")
        return Process()
    monkeypatch.setattr(client, "_SERVERS", {})
    monkeypatch.setattr(client, "_SERVER_FAILED", {})
    monkeypatch.setattr(client, "_client_api_version", lambda *_args: 1)
    monkeypatch.setattr(client, "_free_port", lambda: 12345)
    monkeypatch.setattr(client.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(client.subprocess, "Popen", spawn)
    monkeypatch.setattr(client, "_server_json", lambda *_args, **_kwargs: {})
    root = client._client_root(tmp_path)
    with pytest.raises(client.FreeChatError): client._ensure_server("client", root)
    with pytest.raises(client.FreeChatError): client._ensure_server("client", root)
    assert len(launches) == 1
    clock[0] += 31
    assert client._ensure_server("client", root)["healthy"] is True
    assert len(launches) == 2


def test_shutdown_terminates_owned_servers(monkeypatch):
    from runtime import opencode_free_chat as client
    class Process:
        stopped = False
        def poll(self): return 0 if self.stopped else None
        def terminate(self): self.stopped = True
        def wait(self, timeout): return 0
    process = Process()
    monkeypatch.setattr(client, "_SERVERS", {"test": {"process": process}})
    client._shutdown_free_servers()
    assert process.stopped
    assert not client._SERVERS


def test_concurrent_turns_wait_for_server_readiness(monkeypatch, tmp_path):
    from runtime import opencode_free_chat as client
    health_started = threading.Event()
    release_health = threading.Event()
    second_finished = threading.Event()
    processes = []
    results = []
    class Process:
        def poll(self): return None
    def spawn(*_args, **_kwargs):
        process = Process()
        processes.append(process)
        return process
    def health(*_args, **_kwargs):
        health_started.set()
        assert release_health.wait(3)
        return {}
    monkeypatch.setattr(client, "_SERVERS", {})
    monkeypatch.setattr(client, "_SERVER_FAILED", {})
    monkeypatch.setattr(client, "_free_port", lambda: 12345)
    monkeypatch.setattr(client, "_client_api_version", lambda *_args: 1)
    monkeypatch.setattr(client.subprocess, "Popen", spawn)
    monkeypatch.setattr(client, "_server_json", health)
    root = client._client_root(tmp_path)
    def start(second=False):
        results.append(client._ensure_server("test-client", root))
        if second: second_finished.set()
    first = threading.Thread(target=start)
    second = threading.Thread(target=lambda: start(True))
    first.start()
    assert health_started.wait(3)
    second.start()
    try:
        assert not second_finished.wait(0.2)
    finally:
        release_health.set()
        first.join(3)
        second.join(3)
    assert second_finished.is_set()
    assert len(processes) == 1
    assert len(results) == 2 and results[0] is results[1]


def _portable_python_fixture(monkeypatch, binary):
    monkeypatch.setattr("runtime.opencode_free_chat._client_api_version", lambda *_args: 1)
    if os.name != "nt":
        return
    popen = subprocess.Popen
    def run_fixture(command, *args, **kwargs):
        return popen([sys.executable, str(binary), *command[1:]], *args, **kwargs)
    monkeypatch.setattr("runtime.opencode_free_chat.subprocess.Popen", run_fixture)


def test_free_opencode_id_is_not_rewritten_to_zen():
    from web.api.config import _resolve_provider_alias
    assert _resolve_provider_alias("opencode") == "opencode"
    assert _resolve_provider_alias("zen") == "opencode-zen"


def test_paid_opencode_routes_are_not_the_free_default():
    assert FREE_MODEL not in {"muse-spark-1.3-contributor-free", "muse-spark-1.3-contributor", "deepseek-v4-pro"}
    assert is_free_official_chat("opencode", FREE_MODEL) is True
    assert is_free_official_chat("opencode-go", "muse-spark-1.3-contributor") is False
    assert is_free_official_chat("opencode-go", FREE_MODEL) is False
    assert is_free_official_chat("opencode", "muse-spark-1.3-contributor") is False
    assert is_free_official_chat("opencode", "deepseek-v4-pro") is False
    assert is_free_official_chat("opencode", "muse-spark-1.3-contributor-free") is False
    assert is_free_official_chat("opencode-go-free", "space-bunny-free") is True
    assert is_free_official_chat("opencode-go-free", "deepseek-v4-pro") is False
    assert is_free_official_chat("opencode-go", "space-bunny-free") is False


def test_current_free_alternatives_are_available_for_fallback():
    from runtime.opencode_free_chat import _models_for_turn
    assert "nemotron-3.5-lightning-free" in _models_for_turn(None)
    assert "mimo-v2.6-flash-free" in _models_for_turn(None)


@pytest.mark.parametrize("failing_route", ["server", "cli"])
def test_partial_stream_failure_does_not_retry_another_route(monkeypatch, tmp_path, failing_route):
    from runtime.opencode_free_chat import FreeChatError

    monkeypatch.setattr("runtime.opencode_free_chat.free_client_path", lambda: "test-client")
    calls = []

    def server(**kwargs):
        calls.append("server")
        if failing_route == "server":
            kwargs["on_text"]("partial")
        raise FreeChatError("interrupted")

    def cli(**kwargs):
        calls.append("cli")
        kwargs["on_text"]("partial")
        raise FreeChatError("interrupted")

    def fallback(*_args, **_kwargs):
        calls.append("openrouter")
        return "unexpected"

    monkeypatch.setattr("runtime.opencode_free_chat._serve_turn", server)
    monkeypatch.setattr("runtime.opencode_free_chat._cli_turn", cli)
    monkeypatch.setattr("runtime.opencode_free_chat._openrouter_free", fallback)
    chunks = []
    with pytest.raises(FreeChatError, match="interrupted"):
        stream_free_reply(profile_home=tmp_path, session_key="chat", prompt="hello", on_text=chunks.append)
    assert chunks == ["partial"]
    assert calls == (["server"] if failing_route == "server" else ["server", "cli"])


def test_free_chat_can_fallback_before_any_text_is_emitted(monkeypatch, tmp_path):
    from runtime.opencode_free_chat import FreeChatError

    monkeypatch.setattr("runtime.opencode_free_chat.free_client_path", lambda: "test-client")
    def server(**_kwargs):
        raise FreeChatError("unavailable")
    def cli(**kwargs):
        kwargs["on_text"]("reply")
        return "reply"
    monkeypatch.setattr("runtime.opencode_free_chat._serve_turn", server)
    monkeypatch.setattr("runtime.opencode_free_chat._cli_turn", cli)
    chunks = []
    route = {}
    assert stream_free_reply(profile_home=tmp_path, session_key="chat", prompt="hello", on_text=chunks.append, route_out=route) == "reply"
    assert chunks == ["reply"]
    assert route["route"] == "opencode-cli"


def test_official_server_reads_available_events_without_waiting_for_full_buffer(monkeypatch, tmp_path):
    from runtime.opencode_free_chat import _serve_turn

    events = [
        {"type": "message.updated", "properties": {"sessionID": "ses_test", "info": {"id": "msg_1", "role": "assistant"}}},
        {"type": "message.part.updated", "properties": {"sessionID": "ses_test", "part": {"messageID": "msg_1", "type": "text", "text": "hello"}}},
        {"type": "session.status", "properties": {"sessionID": "ses_test", "status": {"type": "idle"}}},
    ]
    class Response:
        sent = False
        def __enter__(self): return self
        def __exit__(self, *_args): pass
        def read(self, _size): return b""
        def read1(self, _size):
            if self.sent: return b""
            self.sent = True
            return ("".join("data: " + json.dumps(event) + "\n\n" for event in events)).encode()

    clock = iter(range(100))
    monkeypatch.setattr("runtime.opencode_free_chat.time", SimpleNamespace(monotonic=lambda: next(clock)))
    monkeypatch.setattr("runtime.opencode_free_chat._ensure_server", lambda *_args: {"base": "http://127.0.0.1:1", "auth": "local"})
    monkeypatch.setattr("runtime.opencode_free_chat._server_json", lambda _server, _method, route, *_args: {"id": "ses_test"} if route == "/session" else {})
    monkeypatch.setattr("runtime.opencode_free_chat.urllib.request.urlopen", lambda *_args, **_kwargs: Response())
    chunks = []
    assert _serve_turn(binary="test", root=tmp_path, prompt="hello", model="free", on_text=chunks.append, cancel_event=None) == "hello"
    assert chunks == ["hello"]


def test_official_server_subscribes_before_starting_a_turn(monkeypatch, tmp_path):
    from runtime.opencode_free_chat import _serve_turn

    subscribed = []
    events = [
        {"type": "message.updated", "properties": {"sessionID": "ses_test", "info": {"id": "msg_1", "role": "assistant"}}},
        {"type": "message.part.updated", "properties": {"sessionID": "ses_test", "part": {"messageID": "msg_1", "type": "text", "text": "hello"}}},
        {"type": "session.status", "properties": {"sessionID": "ses_test", "status": {"type": "idle"}}},
    ]
    class Response:
        sent = False
        def __enter__(self): return self
        def __exit__(self, *_args): pass
        def read1(self, _size):
            if self.sent: return b""
            self.sent = True
            return ("".join("data: " + json.dumps(event) + "\n\n" for event in events)).encode()
    def connect(*_args, **_kwargs):
        time.sleep(0.1)
        subscribed.append(True)
        return Response()
    def server_json(_server, _method, route, *_args):
        assert subscribed, "turn started before the event subscription was ready"
        return {"id": "ses_test"} if route == "/session" else {}
    monkeypatch.setattr("runtime.opencode_free_chat._ensure_server", lambda *_args: {"base": "http://127.0.0.1:1", "auth": "local"})
    monkeypatch.setattr("runtime.opencode_free_chat._server_json", server_json)
    monkeypatch.setattr("runtime.opencode_free_chat.urllib.request.urlopen", connect)
    assert _serve_turn(binary="test", root=tmp_path, prompt="hello", model="free", on_text=lambda _text: None, cancel_event=None) == "hello"


def test_official_server_does_not_report_a_truncated_stream_as_complete(monkeypatch, tmp_path):
    from runtime.opencode_free_chat import FreeChatError, _serve_turn

    events = [
        {"type": "message.updated", "properties": {"sessionID": "ses_test", "info": {"id": "msg_1", "role": "assistant"}}},
        {"type": "message.part.updated", "properties": {"sessionID": "ses_test", "part": {"messageID": "msg_1", "type": "text", "text": "partial"}}},
    ]
    class Response:
        sent = False
        def __enter__(self): return self
        def __exit__(self, *_args): pass
        def read1(self, _size):
            if self.sent: return b""
            self.sent = True
            return ("".join("data: " + json.dumps(event) + "\n\n" for event in events)).encode()
    monkeypatch.setattr("runtime.opencode_free_chat._ensure_server", lambda *_args: {"base": "http://127.0.0.1:1", "auth": "local"})
    monkeypatch.setattr("runtime.opencode_free_chat._server_json", lambda _server, _method, route, *_args: {"id": "ses_test"} if route == "/session" else {})
    monkeypatch.setattr("runtime.opencode_free_chat.urllib.request.urlopen", lambda *_args, **_kwargs: Response())
    chunks = []
    with pytest.raises(FreeChatError, match="interrupted"):
        _serve_turn(binary="test", root=tmp_path, prompt="hello", model="free", on_text=chunks.append, cancel_event=None)
    assert chunks == ["partial"]


@pytest.mark.parametrize("line_ending", ["\n", "\r\n"])
@pytest.mark.parametrize("nested_session", [False, True])
@pytest.mark.parametrize("delta_stream", [False, True])
def test_official_server_streams_small_events_over_real_http(monkeypatch, tmp_path, line_ending, nested_session, delta_stream):
    from runtime.opencode_free_chat import _serve_turn

    started = threading.Event()
    release = threading.Event()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args): pass
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            self.wfile.flush()
            if not started.wait(3): return
            events = [
                {"type": "message.updated", "properties": {"sessionID": "ses_test", "info": {"id": "msg_1", "role": "assistant"}}},
                {"type": "message.part.updated", "properties": {"sessionID": "ses_test", "part": {"messageID": "msg_1", "type": "text", "text": "hello"}}},
                {"type": "session.status", "properties": {"sessionID": "ses_test", "status": {"type": "idle"}}},
            ]
            if nested_session:
                for event, field in zip(events[:2], ("info", "part")):
                    event["properties"][field]["sessionID"] = event["properties"].pop("sessionID")
            if delta_stream:
                part = events[1]["properties"]["part"]
                part["id"] = "part_1"
                part["text"] = ""
                events[2:2] = [
                    {"type": "message.part.delta", "properties": {"sessionID": "ses_test", "messageID": "msg_1", "partID": "part_1", "field": "text", "delta": "hel"}},
                    {"type": "message.part.delta", "properties": {"sessionID": "ses_test", "messageID": "msg_1", "partID": "part_1", "field": "text", "delta": "lo"}},
                    {"type": "message.part.updated", "properties": {"sessionID": "ses_test", "part": {"id": "part_1", "messageID": "msg_1", "type": "text", "text": "hello"}}},
                ]
            events.insert(1, {"type": "message.part.updated", "properties": {
                "sessionID": "ses_test", "part": {"sessionID": "ses_other", "messageID": "msg_1", "type": "text", "text": "wrong session"}
            }})
            for event in events:
                self.wfile.write(("data: " + json.dumps(event) + line_ending * 2).encode())
                self.wfile.flush()
            release.wait(3)
        def do_POST(self):
            self.rfile.read(int(self.headers.get("Content-Length", "0")))
            if self.path.endswith("prompt_async"): started.set()
            body = b'{"id":"ses_test"}' if self.path == "/session" else b'{}'
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    monkeypatch.setattr("runtime.opencode_free_chat._ensure_server", lambda *_args: {
        "base": f"http://127.0.0.1:{server.server_port}", "auth": "local-test"
    })
    chunks = []
    try:
        assert _serve_turn(binary="test", root=tmp_path, prompt="hello", model="free", on_text=chunks.append, cancel_event=None) == "hello"
        assert chunks == (["hel", "lo"] if delta_stream else ["hello"])
        assert not release.is_set()
    finally:
        release.set()
        server.shutdown()
        server.server_close()


def test_catalog_stays_unchanged_without_the_official_client(monkeypatch, tmp_path):
    monkeypatch.delenv("LASTBROWSER_OPENCODE_BIN", raising=False)
    monkeypatch.delenv("SIDEKICK_AGENT_DIR", raising=False)
    monkeypatch.setattr("runtime.opencode_free_chat.Path.home", lambda: tmp_path)
    catalog = {"groups": [{"provider_id": "openrouter", "configured": False, "models": []}]}
    assert attach_free_opencode_catalog(catalog)["groups"][0]["provider_id"] == "openrouter"
    assert free_default_choice() == ("", "")
    assert is_free_official_chat("openrouter", "openrouter/free") is True
    assert is_free_official_chat("openrouter", "deepseek/deepseek-chat") is False


def test_official_client_streams_text_and_continues_the_same_session(tmp_path, monkeypatch):
    log = tmp_path / "argv.jsonl"
    binary = tmp_path / "opencode"
    binary.write_text(
        "#!/usr/bin/env python3\n"
        "import json, os, sys\n"
        f"open({str(log)!r}, 'a', encoding='utf-8').write(json.dumps(sys.argv) + '\\n')\n"
        "print(json.dumps({'type':'text','sessionID':'ses_testsession1','part':{'type':'text','text':'pong'}}), flush=True)\n",
        encoding="utf-8",
    )
    binary.chmod(binary.stat().st_mode | stat.S_IEXEC)
    _portable_python_fixture(monkeypatch, binary)
    monkeypatch.setenv("LASTBROWSER_OPENCODE_BIN", str(binary))
    monkeypatch.setenv("OPENROUTER_API_KEY", "should-not-pass")
    home = tmp_path / "profile"
    chunks = []
    first = stream_free_reply(profile_home=home, session_key="chat-1", prompt="Say pong", on_text=chunks.append)
    second = stream_free_reply(profile_home=home, session_key="chat-1", prompt="Again", on_text=chunks.append)
    assert first == "pong" and second == "pong"
    assert chunks == ["pong", "pong"]
    calls = [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines()]
    runs = [call for call in calls if "run" in call]
    assert runs[0][runs[0].index("-m") + 1] == CLI_MODEL
    assert "--session" not in runs[0]
    assert runs[1][runs[1].index("--session") + 1] == "ses_testsession1"
    assert "http" not in " ".join(runs[0])
    assert "muse-spark" not in " ".join(runs[0])
    assert "Authorization" not in openrouter_free_headers()
    child_env_file = home / "opencode-free" / "data"
    assert child_env_file.is_dir()
    # The stored session file is runtime state, not a credential.
    saved = json.loads((home / "opencode-free" / "sessions.json").read_text(encoding="utf-8"))
    assert saved[f"chat-1:{FREE_MODEL}"] == "ses_testsession1"
    assert "should-not-pass" not in log.read_text(encoding="utf-8")


def test_provider_rejection_does_not_surface_transport_headers(tmp_path, monkeypatch):
    from runtime.opencode_free_chat import FreeChatError

    def _skip_openrouter(*_args, **_kwargs):
        raise FreeChatError("openrouter skipped")

    monkeypatch.setattr("runtime.opencode_free_chat._openrouter_free", _skip_openrouter)
    binary = tmp_path / "opencode"
    binary.write_text(
        "#!/usr/bin/env python3\n"
        "import json\n"
        "print(json.dumps({'type':'error','error':{'name':'APIError','data':{'statusCode':403,"
        "'message':'rejected','responseHeaders':{'authorization':'secret'}}}}), flush=True)\n",
        encoding="utf-8",
    )
    binary.chmod(binary.stat().st_mode | stat.S_IEXEC)
    _portable_python_fixture(monkeypatch, binary)
    monkeypatch.setenv("LASTBROWSER_OPENCODE_BIN", str(binary))
    with pytest.raises(RuntimeError, match="rejected the free model") as caught:
        stream_free_reply(profile_home=tmp_path / "profile", session_key="chat-1", prompt="Hi", on_text=lambda _text: None)
    assert "secret" not in str(caught.value)
    assert "authorization" not in str(caught.value)


def test_configured_catalog_offers_only_the_free_model(monkeypatch, tmp_path):
    binary = tmp_path / "opencode"
    binary.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    binary.chmod(binary.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("LASTBROWSER_OPENCODE_BIN", str(binary))
    catalog = attach_free_opencode_catalog({"groups": [], "providers": []})
    group = catalog["groups"][0]
    assert group["provider_id"] == FREE_PROVIDER
    assert group["configured"] is True
    assert group["models"][0]["id"] == FREE_MODEL
    assert catalog["providers"] == [{
        "id": FREE_PROVIDER,
        "display_name": "OpenCode",
        "provider_available": True,
        "auth_state": "not_required",
        "has_key": False,
        "oauth_connected": False,
        "models": list(CANDIDATE_MODELS),
    }]
    assert free_default_choice() == (FREE_MODEL, FREE_PROVIDER)


def test_connection_free_group_is_not_replaced_by_the_client_list(monkeypatch, tmp_path):
    binary = tmp_path / "opencode"
    binary.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    binary.chmod(binary.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("LASTBROWSER_OPENCODE_BIN", str(binary))
    catalog = attach_free_opencode_catalog({"groups": [{
        "provider_id": "opencode-go-free",
        "provider": "OpenCode Go Free",
        "models": [{"id": "space-bunny-free", "label": "Space Bunny Free"}],
    }]})
    assert [group["provider_id"] for group in catalog["groups"]] == ["opencode-go-free"]
    assert catalog["groups"][0]["models"][0]["id"] == "space-bunny-free"
