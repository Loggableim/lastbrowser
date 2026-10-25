"""Security hardening: webhook bind rules, shell-free terminal exec, bat allowlist, auth on routes."""

import asyncio
import io
import os
import queue
import socket
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest


def _workspace_session(tmp_path, **extra):
    """Workspace session with assistants opted in (required by _run_in_terminal)."""
    from runtime.memory_policy import update_policy

    update_policy({"assistants_enabled": True}, tmp_path)
    return {
        "id": "s",
        "events": [],
        "event_queue": queue.Queue(),
        "workdir": str(tmp_path),
        "policy_home": str(tmp_path),
        **extra,
    }


# ── Webhook bind rules ─────────────────────────────────────────────────

def _adapter(**extra):
    from gateway.platforms.webhook import WebhookAdapter

    return WebhookAdapter(SimpleNamespace(extra=extra))


def test_webhook_default_host_is_loopback():
    assert _adapter()._host == "127.0.0.1"


@pytest.mark.parametrize("host", ["127.0.0.1", "127.8.9.10", "::1", "[::1]", "localhost"])
def test_loopback_hosts_are_recognised(host):
    from gateway.platforms.webhook import _is_loopback_host

    assert _is_loopback_host(host)


@pytest.mark.parametrize("host", ["0.0.0.0", "::", "192.168.1.5", "example.com", ""])
def test_non_loopback_hosts_are_recognised(host):
    from gateway.platforms.webhook import _is_loopback_host

    assert not _is_loopback_host(host)


@pytest.mark.parametrize("host", ["0.0.0.0", "192.168.1.5", "::"])
def test_webhook_non_loopback_without_secret_refuses_to_start(host):
    adapter = _adapter(host=host, port=_free_port(), secret="")

    assert asyncio.run(adapter.start()) is False
    assert adapter._runner is None
    assert adapter.has_fatal_error
    assert "secret" in adapter.fatal_error_message
    assert "non-loopback" in adapter.fatal_error_message


def test_webhook_whitespace_secret_counts_as_missing():
    adapter = _adapter(host="0.0.0.0", port=_free_port(), secret="   ")

    assert asyncio.run(adapter.start()) is False


def test_webhook_loopback_without_secret_starts():
    port = _free_port()
    adapter = _adapter(host="127.0.0.1", port=port, secret="")
    try:
        assert asyncio.run(_start_then_stop(adapter)) is True
    finally:
        asyncio.run(adapter.stop())


async def _start_then_stop(adapter):
    ok = await adapter.start()
    await adapter.stop()
    return ok


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


# ── Terminal execution without shell ───────────────────────────────────

def test_command_to_argv_splits_posix_quotes(monkeypatch):
    from web.api import agent_workspace

    class _PosixOs:
        name = "posix"

        def __getattr__(self, attr):
            return getattr(os, attr)

    monkeypatch.setattr(agent_workspace, "os", _PosixOs())
    assert agent_workspace._command_to_argv('ls -la "my dir"') == ["ls", "-la", "my dir"]


def test_command_to_argv_rejects_empty_and_unbalanced():
    from web.api.agent_workspace import _command_to_argv

    with pytest.raises(ValueError):
        _command_to_argv("   ")
    with pytest.raises(ValueError):
        _command_to_argv('echo "unterminated')


def test_run_in_terminal_passes_argv_without_shell(monkeypatch, tmp_path):
    from web.api import agent_workspace

    seen = {}

    class _Proc:
        pid = 1
        stdout = io.StringIO("a && b\n")

        def poll(self):
            return 0

        def communicate(self, timeout=None):
            return "", None

    def _fake_popen(args, **kwargs):
        seen["args"] = args
        seen["shell"] = kwargs.get("shell")
        return _Proc()

    monkeypatch.setattr(agent_workspace.subprocess, "Popen", _fake_popen)
    session = _workspace_session(tmp_path)

    result = agent_workspace._run_in_terminal(session, 'echo "a && b"', timeout=5)

    assert seen["shell"] is False
    assert isinstance(seen["args"], list)
    assert seen["args"] == ["echo", "a && b"]
    assert result["exit_code"] == 0
    assert result["output"] == "a && b\n"
    assert session["events"][-1]["exit_code"] == 0


@pytest.mark.parametrize(
    "command",
    [
        "echo a && rm -rf x",
        "echo a || echo b",
        "echo a; rm -rf x",
        "ls | wc -l",
        "echo hi > out.txt",
        "cat < in.txt",
        "git status 2>&1",
        "echo $HOME",
        "echo $(id)",
        "echo `id`",
        "echo a\nrm -rf x",
    ],
)
def test_unquoted_shell_operators_are_rejected(monkeypatch, tmp_path, command):
    from web.api import agent_workspace

    popen_calls = []
    monkeypatch.setattr(agent_workspace.subprocess, "Popen",
                        lambda *a, **k: popen_calls.append((a, k)))
    session = _workspace_session(tmp_path)

    result = agent_workspace._run_in_terminal(session, command, timeout=5)

    assert popen_calls == []
    assert result["exit_code"] == 2
    assert "unquoted shell operator" in result["output"]
    assert session["events"][-1]["exit_code"] == 2
    event = session["event_queue"].get_nowait()
    assert event["type"] == "error"


def test_quoted_shell_operators_are_literal_arguments():
    from web.api.agent_workspace import _command_to_argv

    assert _command_to_argv('echo "a && b" \'$HOME\' "x|y"') == ["echo", "a && b", "$HOME", "x|y"]


def test_shell_operator_rejection_does_not_run_side_effects(tmp_path):
    """Real subprocess: an unquoted '&&' must not launch the second command."""
    from web.api.agent_workspace import _run_in_terminal

    marker = tmp_path / "marker.txt"
    session = _workspace_session(tmp_path)
    command = f'"{sys.executable}" -c "print(1)" && "{sys.executable}" -c "open(r\'{marker}\', \'w\')"'

    result = _run_in_terminal(session, command, timeout=10)

    assert result["exit_code"] == 2
    assert not marker.exists()


def test_run_in_terminal_records_exit_127_when_program_missing(monkeypatch, tmp_path):
    from web.api import agent_workspace

    def _missing(*a, **k):
        raise FileNotFoundError(2, "No such file or directory")

    monkeypatch.setattr(agent_workspace.subprocess, "Popen", _missing)
    session = _workspace_session(tmp_path)

    result = agent_workspace._run_in_terminal(session, "nosuchprog --flag", timeout=5)

    assert result["exit_code"] == 127
    assert "Command not found: nosuchprog" in result["output"]
    assert session["events"][-1]["exit_code"] == 127
    assert session["events"][-1]["output"] == result["output"]


# ── Windows argv resolution ────────────────────────────────────────────

@pytest.fixture
def windows(monkeypatch):
    """Simulate Windows for agent_workspace only.

    ``os.name`` is patched on a proxy bound to the module's ``os`` global, not on
    the real ``os`` module: pathlib selects its flavour from the global ``os.name``
    and would break pytest's own traceback handling.
    """
    import os as real_os
    from web.api import agent_workspace

    class _WindowsOs:
        name = "nt"

        def __getattr__(self, attr):
            return getattr(real_os, attr)

    monkeypatch.setattr(agent_workspace, "os", _WindowsOs())
    which_map = {}
    monkeypatch.setattr(agent_workspace.shutil, "which",
                        lambda name, *a, **k: which_map.get(name))
    return which_map


def test_windows_cmd_builtin_runs_through_cmd_exe(windows):
    from web.api.agent_workspace import _exec_argv

    assert _exec_argv(["dir", "src"]) == ["cmd.exe", "/d", "/c", "dir", "src"]
    assert _exec_argv(["ECHO", "hi"]) == ["cmd.exe", "/d", "/c", "ECHO", "hi"]


def test_windows_cmd_shim_runs_through_cmd_exe(windows):
    from web.api.agent_workspace import _exec_argv

    windows["npm"] = r"C:\Program Files\nodejs\npm.CMD"

    assert _exec_argv(["npm", "install", "x"]) == [
        "cmd.exe", "/d", "/c", r"C:\Program Files\nodejs\npm.CMD", "install", "x",
    ]


def test_windows_bat_shim_runs_through_cmd_exe(windows):
    from web.api.agent_workspace import _exec_argv

    windows["tool"] = r"C:\tools\tool.bat"

    assert _exec_argv(["tool", "a"])[:4] == ["cmd.exe", "/d", "/c", r"C:\tools\tool.bat"]


def test_windows_exe_runs_directly_with_resolved_path(windows):
    from web.api.agent_workspace import _exec_argv

    windows["python"] = r"C:\Python312\python.exe"

    assert _exec_argv(["python", "-V"]) == [r"C:\Python312\python.exe", "-V"]


def test_windows_unresolved_program_is_passed_through(windows):
    from web.api.agent_workspace import _exec_argv

    assert _exec_argv(["nosuchprog", "x"]) == ["nosuchprog", "x"]


@pytest.mark.parametrize("arg", ["a&calc", "a|b", "a<b", "a>b", "a^b", "100%", "a\nb"])
def test_windows_cmd_metacharacters_rejected_for_cmd_routing(windows, arg):
    from web.api.agent_workspace import _exec_argv

    with pytest.raises(ValueError, match="cmd metacharacter"):
        _exec_argv(["echo", arg])


def test_windows_metacharacters_allowed_for_direct_exe(windows):
    from web.api.agent_workspace import _exec_argv

    windows["python"] = r"C:\Python312\python.exe"

    assert _exec_argv(["python", "a&b"]) == [r"C:\Python312\python.exe", "a&b"]


def test_windows_command_run_routes_dir_through_cmd(windows, monkeypatch, tmp_path):
    from web.api import agent_workspace

    seen = {}

    class _Proc:
        pid = 1
        stdout = io.StringIO("")

        def poll(self):
            return 0

    def _fake_popen(args, **kwargs):
        seen["args"] = args
        seen["shell"] = kwargs.get("shell")
        return _Proc()

    monkeypatch.setattr(agent_workspace.subprocess, "Popen", _fake_popen)
    session = _workspace_session(tmp_path)

    agent_workspace._run_in_terminal(session, "dir", timeout=5)

    assert seen["shell"] is False
    assert seen["args"] == ["cmd.exe", "/d", "/c", "dir"]


def test_windows_command_with_cmd_metachar_is_rejected_before_popen(windows, monkeypatch, tmp_path):
    from web.api import agent_workspace

    popen_calls = []
    monkeypatch.setattr(agent_workspace.subprocess, "Popen",
                        lambda *a, **k: popen_calls.append((a, k)))
    session = _workspace_session(tmp_path)

    result = agent_workspace._run_in_terminal(session, 'echo "a^b"', timeout=5)

    assert popen_calls == []
    assert result["exit_code"] == 2


def test_windows_command_to_argv_strips_quotes_and_keeps_backslashes(windows):
    from web.api.agent_workspace import _command_to_argv

    assert _command_to_argv(r'"C:\Program Files\x.exe" arg') == [r"C:\Program Files\x.exe", "arg"]


# ── Intent prompt contract ─────────────────────────────────────────────

def test_intent_prompt_examples_contain_no_shell_operators():
    import re
    from web.api.agent_workspace import INTENT_SYSTEM_PROMPT, _command_to_argv

    examples = re.findall(r'"cmd":\s*"((?:[^"\\]|\\.)*)"', INTENT_SYSTEM_PROMPT)

    assert len(examples) >= 3
    for example in examples:
        command = example.replace('\\"', '"')
        assert _command_to_argv(command), example


def test_intent_prompt_forbids_shell_syntax():
    from web.api.agent_workspace import INTENT_SYSTEM_PROMPT

    assert "KEINE Shell" in INTENT_SYSTEM_PROMPT
    assert "&&" in INTENT_SYSTEM_PROMPT
    assert "|| echo" not in INTENT_SYSTEM_PROMPT.split("## Antwort-Format")[1]


# ── _run_bat allowlist ─────────────────────────────────────────────────

@pytest.mark.parametrize(
    "name",
    ["evil.bat", "../evil.bat", "..\\evil.bat", "shutdown.bat.evil", "SHUTDOWN.BAT", "", "shutdown.bat;calc"],
)
def test_run_bat_rejects_non_allowlisted_names(monkeypatch, name):
    from web.api import routes

    calls = []
    monkeypatch.setattr(routes.subprocess, "Popen", lambda *a, **k: calls.append((a, k)))
    monkeypatch.setattr(Path, "exists", lambda self: True)

    routes._run_bat(name)

    assert calls == []


def test_run_bat_runs_allowlisted_name_without_shell(monkeypatch):
    from web.api import routes

    calls = []
    monkeypatch.setattr(routes.subprocess, "Popen", lambda *a, **k: calls.append((a, k)))
    monkeypatch.setattr(Path, "exists", lambda self: True)

    routes._run_bat("reboot.bat")

    assert len(calls) == 1
    args, kwargs = calls[0]
    assert isinstance(args[0], list)
    assert args[0][-1].endswith("reboot.bat")
    assert kwargs.get("shell") is False


# ── Auth on affected HTTP routes ───────────────────────────────────────

@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))
    TestClient = pytest.importorskip("fastapi.testclient").TestClient
    from cli.web_server import app

    return TestClient(app)


@pytest.mark.parametrize(
    "method,path",
    [
        ("POST", "/api/system/shutdown"),
        ("POST", "/api/system/restart"),
        ("POST", "/api/agents/some-agent/chat"),
        ("POST", "/api/agents/workspace/sess-1/command"),
        ("POST", "/api/agents/workspace/sess-1/stop"),
        ("GET", "/api/agents/workspace/stream/sess-1"),
    ],
)
def test_affected_routes_require_session_token(client, monkeypatch, method, path):
    from web.api import routes, agent_workspace

    called = []
    monkeypatch.setattr(routes, "_run_bat", lambda name: called.append(name))
    monkeypatch.setattr(agent_workspace, "send_command_to_agent",
                        lambda *a, **k: called.append("command") or {})
    monkeypatch.setattr(agent_workspace, "process_agent_request",
                        lambda *a, **k: called.append("request") or {})

    response = client.request(method, path, json={"command": "echo hi", "message": "x"})

    assert response.status_code == 401
    assert called == []


def test_command_route_reaches_handler_with_valid_session_token(client, monkeypatch, tmp_path):
    from cli import web_server
    from web.api import agent_workspace
    from runtime.memory_policy import update_policy

    update_policy({"assistants_enabled": True}, tmp_path / "home")
    called = []
    monkeypatch.setattr(agent_workspace, "send_command_to_agent",
                        lambda sid, command: called.append((sid, command)) or {"status": "executing"})

    response = client.post(
        "/api/agents/workspace/sess-1/command",
        json={"command": "echo hi"},
        headers={"X-Sidekick-Session-Token": web_server._SESSION_TOKEN},
    )

    assert response.status_code == 200
    assert called == [("sess-1", "echo hi")]
    assert response.json() == {"status": "executing"}

    from web.api import routes

    called = []
    monkeypatch.setattr(routes, "_run_bat", lambda name: called.append(name))

    response = client.post(
        "/api/system/shutdown",
        headers={"X-Sidekick-Session-Token": "not-the-token"},
    )

    assert response.status_code == 401
    assert called == []


def test_run_in_terminal_reports_invalid_command_without_raising(tmp_path):
    from web.api.agent_workspace import _run_in_terminal

    session = _workspace_session(tmp_path)

    result = _run_in_terminal(session, 'echo "unterminated', timeout=5)

    assert result["exit_code"] == 2
    assert "Invalid command" in result["output"]
