import json

from cli import opencode_login


def test_login_launcher_is_profile_scoped_and_uses_official_provider_id(tmp_path, monkeypatch):
    monkeypatch.setattr(opencode_login, "get_sidekick_home", lambda: tmp_path)
    monkeypatch.setattr(opencode_login.os, "name", "nt")
    monkeypatch.setattr(opencode_login.shutil, "which", lambda _name: r"C:\OpenCode\opencode.exe")
    monkeypatch.setattr(opencode_login.subprocess, "CREATE_NEW_CONSOLE", 16, raising=False)
    monkeypatch.setenv("OPENCODE_CONFIG", r"C:\Users\user\global-opencode.json")
    monkeypatch.setenv("OPENCODE_ZEN_API_KEY", "environment-test-key")
    captured = {}

    class FakeProcess:
        pid = 1234

        def poll(self):
            return None

        def wait(self):
            return 0

    def fake_popen(args, **kwargs):
        captured["args"] = args
        captured.update(kwargs)
        return FakeProcess()

    monkeypatch.setattr(opencode_login.subprocess, "Popen", fake_popen)
    result = opencode_login.start_login("opencode-go")

    assert result["ok"] is True
    assert captured["args"] == [r"C:\OpenCode\opencode.exe", "auth", "login", "--provider", "opencode-go"]
    assert captured["env"]["XDG_DATA_HOME"] == str(tmp_path / "opencode-data")
    assert "OPENCODE_CONFIG" not in captured["env"]
    assert "OPENCODE_ZEN_API_KEY" not in captured["env"]
    assert captured["cwd"] == str(tmp_path / "opencode-data")
    assert captured["creationflags"] == 16


def test_login_launcher_reports_missing_cli_and_rejects_unknown_provider(tmp_path, monkeypatch):
    monkeypatch.setenv("APPDATA", str(tmp_path / "empty-app-data"))
    monkeypatch.setattr(opencode_login, "get_sidekick_home", lambda: tmp_path)
    monkeypatch.setattr(opencode_login.os, "name", "nt")
    monkeypatch.setattr(opencode_login.shutil, "which", lambda _name: None)

    assert opencode_login.start_login("opencode-zen")["error_code"] == "opencode_cli_not_found"
    assert opencode_login.start_login("not-opencode")["error_code"] == "unsupported_provider"


def test_cli_discovery_finds_native_user_npm_binary_without_path(tmp_path, monkeypatch):
    monkeypatch.setattr(opencode_login.shutil, "which", lambda _name: None)
    monkeypatch.setenv("APPDATA", str(tmp_path))
    executable = tmp_path / "npm" / "node_modules" / "opencode-ai" / "bin" / "opencode.exe"
    executable.parent.mkdir(parents=True)
    executable.touch()
    assert opencode_login._find_opencode_executable() == str(executable)


def test_cli_discovery_preserves_explicit_path_installation(tmp_path, monkeypatch):
    monkeypatch.setattr(opencode_login.shutil, "which", lambda _name: "preferred-opencode.exe")
    monkeypatch.setenv("APPDATA", str(tmp_path))
    assert opencode_login._find_opencode_executable() == "preferred-opencode.exe"


def test_cli_discovery_does_not_treat_npm_directory_as_executable(tmp_path, monkeypatch):
    monkeypatch.setattr(opencode_login.shutil, "which", lambda _name: None)
    monkeypatch.setenv("APPDATA", str(tmp_path))
    (tmp_path / "npm" / "opencode.exe").mkdir(parents=True)
    assert opencode_login._find_opencode_executable() is None


def test_profile_status_reads_only_profile_scoped_opencode_auth(tmp_path, monkeypatch):
    monkeypatch.setattr(opencode_login, "get_sidekick_home", lambda: tmp_path / "profile")
    isolated_auth = tmp_path / "profile" / "opencode-data" / "opencode" / "auth.json"
    isolated_auth.parent.mkdir(parents=True)
    isolated_auth.write_text(json.dumps({"opencode": {"type": "api", "key": "profile-key"}}), encoding="utf-8")
    global_auth = tmp_path / "global" / "opencode" / "auth.json"
    global_auth.parent.mkdir(parents=True)
    global_auth.write_text(json.dumps({"opencode-go": {"type": "api", "key": "global-key"}}), encoding="utf-8")

    assert opencode_login._has_profile_credentials("opencode-zen") is True
    assert opencode_login._has_profile_credentials("opencode-go") is False


def test_login_status_never_exposes_auth_file_contents(tmp_path, monkeypatch):
    monkeypatch.setattr(opencode_login, "get_sidekick_home", lambda: tmp_path)

    class FakeProcess:
        def poll(self):
            return None

    login_id = "safe-test-id"
    with opencode_login._LOGINS_LOCK:
        opencode_login._LOGINS[login_id] = {
            "provider": "opencode-zen",
            "profile_home": str(tmp_path.resolve()),
            "process": FakeProcess(),
            "exit_code": None,
        }

    result = opencode_login.login_status(login_id)
    assert result == {"ok": True, "provider": "opencode-zen", "configured": False, "status": "running"}


def test_login_cancel_is_limited_to_the_active_profile(tmp_path, monkeypatch):
    monkeypatch.setattr(opencode_login, "get_sidekick_home", lambda: tmp_path)
    calls = []

    class FakeProcess:
        pid = 2345

        def poll(self):
            return None

    login_id = "cancel-test-id"
    with opencode_login._LOGINS_LOCK:
        opencode_login._LOGINS[login_id] = {
            "provider": "opencode-go",
            "profile_home": str(tmp_path.resolve()),
            "process": FakeProcess(),
            "exit_code": None,
        }
    monkeypatch.setattr(
        opencode_login.subprocess,
        "run",
        lambda args, **kwargs: (calls.append(args) or type("Result", (), {"returncode": 0})()),
    )

    assert opencode_login.cancel_login(login_id) == {"ok": True, "status": "cancelled"}
    assert calls == [["taskkill.exe", "/PID", "2345", "/T", "/F"]]

    monkeypatch.setattr(opencode_login, "get_sidekick_home", lambda: tmp_path / "another-profile")
    assert opencode_login.cancel_login(login_id) == {"ok": False, "error_code": "login_not_found"}
    assert len(calls) == 1


def test_login_cancel_reports_taskkill_failure_and_actual_process_state(tmp_path, monkeypatch):
    monkeypatch.setattr(opencode_login, "get_sidekick_home", lambda: tmp_path)
    taskkill_result = type("Result", (), {"returncode": 128})()

    class FakeProcess:
        pid = 3456

        def __init__(self, exit_codes):
            self.exit_codes = list(exit_codes)

        def poll(self):
            return self.exit_codes.pop(0) if len(self.exit_codes) > 1 else self.exit_codes[0]

    login_id = "cancel-failed-running-id"
    process = FakeProcess([None])
    with opencode_login._LOGINS_LOCK:
        opencode_login._LOGINS[login_id] = {
            "provider": "opencode-go",
            "profile_home": str(tmp_path.resolve()),
            "process": process,
            "exit_code": None,
        }
    monkeypatch.setattr(opencode_login.subprocess, "run", lambda *args, **kwargs: taskkill_result)

    assert opencode_login.cancel_login(login_id) == {
        "ok": False,
        "error_code": "cancel_failed",
        "status": "running",
        "taskkill_exit_code": 128,
    }

    login_id = "cancel-failed-finished-id"
    process = FakeProcess([None, 1])
    with opencode_login._LOGINS_LOCK:
        opencode_login._LOGINS[login_id] = {
            "provider": "opencode-go",
            "profile_home": str(tmp_path.resolve()),
            "process": process,
            "exit_code": None,
        }
    assert opencode_login.cancel_login(login_id) == {
        "ok": False,
        "error_code": "cancel_failed",
        "status": "finished",
        "process_exit_code": 1,
        "taskkill_exit_code": 128,
    }
