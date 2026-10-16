import threading
import time
import subprocess
import sys

import pytest

from cli import opencode_device as device


def config():
    return {"providers": {"opencode-go": {"package": "aisdk:@ai-sdk/openai-compatible",
        "settings": {"baseURL": "https://opencode.ai/inference/openai/v1"},
        "headers": {"x-opencode-org-id": "synthetic-org"}, "models": {"synthetic-model": {}}}}}


def tokens(suffix="one", expiry=3600):
    return {"access_token": "synthetic-access-" + suffix, "refresh_token": "synthetic-refresh-" + suffix,
            "org_id": "synthetic-org", "expires_in": expiry}


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setattr(device, "get_sidekick_home", lambda: tmp_path)
    device._PENDING.clear()
    return tmp_path


def start(home, monkeypatch):
    calls = []
    def request(path, **kwargs):
        calls.append((path, kwargs))
        if path.endswith("/code"):
            return {"device_code": "synthetic-private-code", "user_code": "PUBLIC-CODE",
                    "verification_uri_complete": "/console/device?user_code=PUBLIC-CODE", "expires_in": 600, "interval": 5}
        if path.endswith("/token"):
            return tokens()
        return config()
    monkeypatch.setattr(device, "_request", request)
    response = device.start_login("opencode-go")
    assert response["ok"]
    assert "synthetic-private-code" not in str(response)
    assert "access_token" not in str(response)
    return response["login_id"], calls


def test_device_flow_profile_binding_poll_interval_and_secret_boundary(home, monkeypatch):
    login, calls = start(home, monkeypatch)
    assert calls[0][1]["data"] == {"client_id": "lastbrowser", "supports_org_scope": "true"}
    assert device.login_status(login)["status"] == "running"
    assert len(calls) == 1
    monkeypatch.setattr(device, "get_sidekick_home", lambda: home / "foreign")
    assert device.login_status(login)["error_code"] == "login_not_found"
    monkeypatch.setattr(device, "get_sidekick_home", lambda: home)
    device._PENDING[login]["next_poll"] = 0
    status = device.login_status(login)
    assert status["status"] == "connected"
    assert "synthetic-access" not in str(status)
    assert device.has_credentials("opencode-go")
    assert device.cancel_login(login)["status"] == "connected"
    first = device.resolve_connection("opencode-go", "synthetic-model", "session-a")
    second = device.resolve_connection("opencode-go", "synthetic-model", "session-a")
    assert first["headers"] == second["headers"]
    assert first["headers"]["User-Agent"].startswith("LastBrowser/")
    assert first["api_mode"] == "chat_completions"
    assert first["headers"] != device.resolve_connection("opencode-go", "synthetic-model", "session-b")["headers"]
    with pytest.raises(device.DeviceError, match="workspace_model_unavailable"):
        device.resolve_connection("opencode-go", "unlisted-model", "session-a")


@pytest.mark.parametrize("url", ["https://evil.invalid/console/device?user_code=PUBLIC-CODE",
    "https://opencode.ai:443/console/device?user_code=PUBLIC-CODE",
    "/console/device?user_code=PUBLIC-CODE&profile=foreign", "/console/device?user_code=WRONG"])
def test_rejects_untrusted_verification_url(home, monkeypatch, url):
    monkeypatch.setattr(device, "_request", lambda *_args, **_kwargs: {
        "device_code": "private", "user_code": "PUBLIC-CODE", "verification_uri_complete": url,
        "expires_in": 600, "interval": 5})
    assert device.start_login("opencode-go")["error_code"] == "invalid_verification_url"


@pytest.mark.parametrize("query", ["user_code=PUBLIC-CODE&client_id=lastbrowser",
                                  "client_id=lastbrowser&user_code=PUBLIC-CODE"])
def test_accepts_actual_official_device_url_with_own_client_id(home, monkeypatch, query):
    monkeypatch.setattr(device, "_request", lambda *_args, **_kwargs: {
        "device_code": "private", "user_code": "PUBLIC-CODE",
        "verification_uri_complete": "/console/device?" + query, "expires_in": 600, "interval": 5})
    assert device.start_login("opencode-go")["verification_url"] == "https://opencode.ai/console/device?" + query


@pytest.mark.parametrize("query", ["user_code=PUBLIC-CODE&client_id=foreign",
    "user_code=PUBLIC-CODE&client_id=lastbrowser&client_id=lastbrowser"])
def test_rejects_foreign_or_duplicate_device_client_id(home, monkeypatch, query):
    monkeypatch.setattr(device, "_request", lambda *_args, **_kwargs: {
        "device_code": "private", "user_code": "PUBLIC-CODE",
        "verification_uri_complete": "/console/device?" + query, "expires_in": 600, "interval": 5})
    assert device.start_login("opencode-go")["error_code"] == "invalid_verification_url"


def test_pending_slow_down_expiry_and_cancel(home, monkeypatch):
    login, _ = start(home, monkeypatch)
    for code in ("authorization_pending", "slow_down"):
        device._PENDING[login]["next_poll"] = 0
        def fail(*_args, **_kwargs):
            raise device.DeviceError(code)
        monkeypatch.setattr(device, "_request", fail)
        assert device.login_status(login)["status"] == "running"
    assert device._PENDING[login]["interval"] == 10
    assert device.cancel_login(login)["status"] == "cancelled"
    assert "device_code" not in device._PENDING[login]
    assert device.login_status(login)["status"] == "cancelled"
    login, _ = start(home, monkeypatch)
    device._PENDING[login]["expires"] = 0
    assert device.login_status(login)["status"] == "expired"


def test_cancel_while_token_request_is_pending_never_saves_late_credentials(home, monkeypatch):
    login, _ = start(home, monkeypatch)
    entered, release = threading.Event(), threading.Event()
    def request(path, **kwargs):
        if path.endswith("/token"):
            entered.set()
            assert release.wait(5)
            return tokens()
        return config()
    monkeypatch.setattr(device, "_request", request)
    device._PENDING[login]["next_poll"] = 0
    worker = threading.Thread(target=lambda: device.login_status(login))
    worker.start()
    assert entered.wait(5)
    assert device.cancel_login(login)["status"] == "cancelled"
    release.set()
    worker.join(5)
    assert not worker.is_alive()
    assert not device.has_credentials("opencode-go")


def test_refresh_rotates_once_under_concurrent_calls_and_preserves_workspace(home, monkeypatch):
    record = device._token_record(tokens(expiry=1)) | {"config": config()}
    device._write(home, {"opencode-go": record})
    refreshes = []
    def request(path, **kwargs):
        if path.endswith("/token"):
            refreshes.append(kwargs["data"]["refresh_token"])
            time.sleep(.03)
            return tokens("two")
        return config()
    monkeypatch.setattr(device, "_request", request)
    results = []
    workers = [threading.Thread(target=lambda: results.append(device.resolve_connection("opencode-go", "synthetic-model", "session"))) for _ in range(2)]
    for worker in workers: worker.start()
    for worker in workers: worker.join(5)
    assert len(results) == 2
    assert refreshes == ["synthetic-refresh-one"]
    assert all(result["api_key"] == "synthetic-access-two" for result in results)


def test_uncertain_refresh_failure_cannot_reuse_single_use_token(home, monkeypatch):
    device._write(home, {"opencode-go": device._token_record(tokens(expiry=1)) | {"config": config()}})
    calls = []
    def fail(*_args, **_kwargs):
        calls.append(True)
        raise device.DeviceError("device_request_failed")
    monkeypatch.setattr(device, "_request", fail)
    for _ in range(2):
        with pytest.raises(device.DeviceError):
            device.resolve_connection("opencode-go", "synthetic-model", "session")
    assert len(calls) == 1


def test_credential_lock_excludes_a_separate_worker_process(home):
    marker = home / "lock-acquired"
    script = ("from pathlib import Path; from cli.opencode_device import _credential_lock; "
              "import sys\nwith _credential_lock(Path(sys.argv[1])):\n Path(sys.argv[2]).write_text('acquired')\n")
    with device._credential_lock(home):
        worker = subprocess.Popen([sys.executable, "-c", script, str(home), str(marker)],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        time.sleep(.2)
        assert not marker.exists()
        assert worker.poll() is None
    _stdout, stderr = worker.communicate(timeout=10)
    assert worker.returncode == 0, stderr.decode()
    assert marker.read_text() == "acquired"


def test_refresh_rotation_is_saved_even_if_subsequent_config_lookup_fails(home, monkeypatch):
    device._write(home, {"opencode-go": device._token_record(tokens(expiry=1)) | {"config": config()}})
    refreshes = []
    def request(path, **kwargs):
        if path.endswith("/token"):
            refreshes.append(kwargs["data"]["refresh_token"])
            return tokens("rotated")
        raise device.DeviceError("device_request_failed")
    monkeypatch.setattr(device, "_request", request)
    with pytest.raises(device.DeviceError):
        device.resolve_connection("opencode-go", "synthetic-model", "session")
    assert device.resolve_connection("opencode-go", "synthetic-model", "session")["api_key"] == "synthetic-access-rotated"
    assert refreshes == ["synthetic-refresh-one"]


@pytest.mark.parametrize("mutation", ["gateway", "org", "package", "package_type", "settings_type", "headers_type"])
def test_workspace_config_is_fail_closed(home, monkeypatch, mutation):
    value = config()
    entry = value["providers"]["opencode-go"]
    if mutation == "gateway": entry["settings"]["baseURL"] = "https://evil.invalid/v1"
    if mutation == "org": entry["headers"]["x-opencode-org-id"] = "foreign-org"
    if mutation == "package": entry["package"] = "unsupported-sdk"
    if mutation == "package_type": entry["package"] = ["unsupported-sdk"]
    if mutation == "settings_type": entry["settings"] = []
    if mutation == "headers_type": entry["headers"] = []
    device._write(home, {"opencode-go": device._token_record(tokens()) | {"config": value}})
    with pytest.raises(device.DeviceError):
        device.resolve_connection("opencode-go", "synthetic-model", "session")


def test_free_catalog_sibling_stays_selectable_beside_the_go_catalog(home):
    value = config()
    value["providers"]["opencode"] = {"package": "aisdk:@ai-sdk/openai-compatible",
        "settings": {"baseURL": "https://opencode.ai/inference/openai/v1"},
        "headers": {"x-opencode-org-id": "synthetic-org"},
        "models": {"muse-spark-1.3-contributor-free": {}}}
    device._write(home, {"opencode-go": device._token_record(tokens()) | {"config": value}})
    assert device.discovered_models("opencode-go") == ["synthetic-model", "muse-spark-1.3-contributor-free"]
    connection = device.resolve_connection("opencode-go", "muse-spark-1.3-contributor-free", "session")
    assert connection["model"] == "muse-spark-1.3-contributor-free"
    assert connection["api_mode"] == "chat_completions"
    assert "synthetic-access" not in str(connection["base_url"])
    value["providers"]["opencode"]["models"]["muse-spark-1.3-contributor-free"] = {"limit": {"context": 1048576, "output": 131072}}
    device._write(home, {"opencode-go": device._token_record(tokens()) | {"config": value}})
    assert device.device_model_context_length("opencode-go", "muse-spark-1.3-contributor-free") == 1048576


def test_canonical_console_provider_and_mixed_families_use_supported_actual_models(home):
    value = config()
    entry = value["providers"].pop("opencode-go")
    entry["models"] = {"unsupported-google": {"package": "aisdk:@ai-sdk/google",
        "settings": {"baseURL": "https://opencode.ai/inference/google/v1beta"}}, "actual-openai": {}}
    value["providers"]["opencode"] = entry
    device._write(home, {"opencode-go": device._token_record(tokens()) | {"config": value}})
    assert device.discovered_models("opencode-go") == ["actual-openai"]
    assert device.resolve_connection("opencode-go", "actual-openai", "session")["model"] == "actual-openai"


def test_uncertain_refresh_status_requires_relogin_without_network(home, monkeypatch):
    record = device._token_record(tokens()) | {"config": config(), "refresh_in_flight": True}
    device._write(home, {"opencode-go": record})
    monkeypatch.setattr(device, "_request", lambda *_args, **_kwargs: pytest.fail("status must not refresh"))
    assert device.has_credentials("opencode-go")
    assert device.credential_status("opencode-go") == {"logged_in": False, "error_code": "device_login_required"}


def test_anthropic_gateway_returns_sdk_base_matching_captured_request_authority(home):
    value = config()
    entry = value["providers"]["opencode-go"]
    entry["package"] = "aisdk:@ai-sdk/anthropic"
    entry["settings"]["baseURL"] = "https://opencode.ai/inference/anthropic/v1"
    device._write(home, {"opencode-go": device._token_record(tokens()) | {"config": value}})
    connection = device.resolve_connection("opencode-go", "synthetic-model", "session")
    assert connection["api_mode"] == "anthropic_messages"
    assert connection["base_url"] == "https://opencode.ai/inference/anthropic"


@pytest.mark.parametrize("family,package,mode", [
    ("openai", "aisdk:@ai-sdk/openai-compatible", "chat_completions"),
    ("anthropic", "aisdk:@ai-sdk/anthropic", "anthropic_messages"),
])
def test_go_subscription_gateway_catalog_and_sdk_base(home, family, package, mode):
    value = config()
    entry = value["providers"]["opencode-go"]
    entry["package"] = package
    base = f"https://opencode.ai/inference/go/{family}/v1"
    entry["settings"]["baseURL"] = base
    device._write(home, {"opencode-go": device._token_record(tokens()) | {"config": value}})
    assert device.discovered_models("opencode-go") == ["synthetic-model"]
    connection = device.resolve_connection("opencode-go", "synthetic-model", "session")
    assert connection["api_mode"] == mode
    assert connection["base_url"] == (base[:-3] if family == "anthropic" else base)
    assert device._config_diagnostic(value, "opencode-go")["gateway_paths"] == [f"/inference/go/{family}/v1"]


@pytest.mark.parametrize("base", [
    "https://opencode.ai/inference/go/openai/v1/other",
    "https://opencode.ai/inference/go/openai/v1?redirect=other",
    "https://opencode.ai.evil.invalid/inference/go/openai/v1",
])
def test_go_gateway_rejects_near_matches(home, base):
    value = config()
    value["providers"]["opencode-go"]["settings"]["baseURL"] = base
    device._write(home, {"opencode-go": device._token_record(tokens()) | {"config": value}})
    with pytest.raises(device.DeviceError, match="unsupported_workspace_gateway"):
        device.resolve_connection("opencode-go", "synthetic-model", "session")


def test_native_opencode_runtime_package_and_wire_model_id_are_supported(home):
    value = config()
    entry = value["providers"]["opencode-go"]
    entry["package"] = "@opencode/ai/providers/openai-compatible"
    entry["models"]["synthetic-model"] = {"modelID": "actual-wire-model"}
    device._write(home, {"opencode-go": device._token_record(tokens()) | {"config": value}})
    assert device.resolve_connection("opencode-go", "synthetic-model", "session")["model"] == "actual-wire-model"
    assert device.resolve_connection("opencode-go", "actual-wire-model", "session")["model"] == "actual-wire-model"


def test_valid_oauth_credentials_survive_unsupported_catalog_without_claiming_connected(home, monkeypatch):
    login, _ = start(home, monkeypatch)
    value = config()
    value["providers"]["opencode-go"]["package"] = "unsupported-sdk"
    monkeypatch.setattr(device, "_request", lambda path, **_kwargs: tokens() if path.endswith("/token") else value)
    device._PENDING[login]["next_poll"] = 0
    status = device.login_status(login)
    assert status["status"] == "failed" and status["configured"] is False
    assert status["error_code"] == "unsupported_workspace_gateway"
    assert device.has_credentials("opencode-go")
    assert device.credential_status("opencode-go")["logged_in"] is False
    assert "synthetic-access" not in str(status)
    assert "synthetic-org" not in str(status)
    assert status["diagnostic"]["provider_match"] is True


def test_catalog_errors_preserve_workspace_mismatch_reason(home):
    value = config()
    value["providers"]["opencode-go"]["headers"]["x-opencode-org-id"] = "foreign-org"
    device._write(home, {"opencode-go": device._token_record(tokens()) | {"config": value}})
    with pytest.raises(device.DeviceError, match="workspace_binding_changed"):
        device.discovered_models("opencode-go")
