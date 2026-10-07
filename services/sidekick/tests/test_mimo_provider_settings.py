"""MiMo settings stay profile-bound and test only approved Xiaomi endpoints."""
import io
import json
import urllib.error

import pytest

from runtime import mimo_settings
from web.api import providers


class _Response:
    status = 200

    def __init__(self, payload=None):
        self._payload = json.dumps(payload or {"choices": [{"message": {"content": "ok"}}]}).encode()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self._payload


class _Opener:
    def __init__(self, result=None):
        self.result = result or _Response()
        self.requests = []

    def open(self, request, timeout):
        self.requests.append((request, timeout))
        if isinstance(self.result, BaseException):
            raise self.result
        return self.result


def test_mimo_url_validation_pins_key_type_and_token_plan_region():
    key, url, error = mimo_settings.validate_mimo_settings(
        "tp-synthetic-test-value", "https://token-plan-ams.xiaomimimo.com/v1")
    assert (key, url, error) == (
        "tp-synthetic-test-value", "https://token-plan-ams.xiaomimimo.com/v1", None)
    _, url, error = mimo_settings.validate_mimo_settings(
        "sk-synthetic-test-value", "https://api.xiaomimimo.com/v1")
    assert (url, error) == ("https://api.xiaomimimo.com/v1", None)
    _, url, error = mimo_settings.validate_mimo_settings(
        "ttp-synthetic-test-value", "https://token-plan-cn.xiaomimimo.com/v1")
    assert (url, error) == ("https://token-plan-cn.xiaomimimo.com/v1", None)
    for key, url in [
        ("tp-synthetic-test-value", ""),
        ("tp-synthetic-test-value", "https://evil.example/v1"),
        ("tp-synthetic-test-value", "https://other.xiaomimimo.com/v1"),
        ("tp-synthetic-test-value", "https://xiaomimimo.com/v1"),
        ("tp-synthetic-test-value", "https://token-plan-ams.other.xiaomimimo.com/v1"),
        ("tp-synthetic-test-value", "http://token-plan-ams.xiaomimimo.com/v1"),
        ("tp-synthetic-test-value", "https://token-plan-ams.xiaomimimo.com/v1?next=evil"),
        ("sk-synthetic-test-value", "https://token-plan-ams.xiaomimimo.com/v1"),
        ("sk-synthetic-test-value", "https://other.xiaomimimo.com/v1"),
        ("unknown-synthetic-value", "https://api.xiaomimimo.com/v1"),
    ]:
        assert mimo_settings.validate_mimo_settings(key, url)[2] is not None


def test_mimo_probe_uses_only_validated_explicit_host_and_redacts_response():
    opener = _Opener()
    result = mimo_settings.probe_mimo_connection(
        "tp-synthetic-secret-value", "https://token-plan-ams.xiaomimimo.com/v1",
        opener_factory=lambda: opener)
    assert result == {"ok": True, "provider": "xiaomi", "verified": True}
    request, timeout = opener.requests[0]
    assert request.full_url == "https://token-plan-ams.xiaomimimo.com/v1/chat/completions"
    assert request.get_header("Authorization") == "Bearer tp-synthetic-secret-value"
    assert timeout == 8
    assert "tp-synthetic-secret-value" not in json.dumps(result)


@pytest.mark.parametrize("status,code", [(401, "mimo_auth_failed"), (403, "mimo_auth_failed"),
                                         (429, "mimo_rate_limited"), (503, "mimo_provider_unavailable"),
                                         (302, "mimo_provider_unavailable")])
def test_mimo_probe_returns_only_safe_http_error_code(status, code):
    error = urllib.error.HTTPError("https://token-plan-ams.xiaomimimo.com/v1/chat/completions",
        status, "private upstream body", {}, io.BytesIO(b"secret response"))
    result = mimo_settings.probe_mimo_connection("tp-synthetic-secret-value",
        "https://token-plan-ams.xiaomimimo.com/v1", opener_factory=lambda: _Opener(error))
    assert result == {"ok": False, "error": code}
    assert "secret" not in json.dumps(result)


def test_mimo_profile_save_preserves_blank_key_and_does_not_mutate_process_environment(tmp_path, monkeypatch):
    env_path = tmp_path / ".env"
    env_path.write_text("XIAOMI_API_KEY=tp-synthetic-secret-value\nXIAOMI_BASE_URL=https://token-plan-ams.xiaomimimo.com/v1\n", "utf-8")
    monkeypatch.setattr(providers, "_get_sidekick_home", lambda: tmp_path)
    monkeypatch.setattr("cli.config.load_env", lambda: providers._load_env_file(env_path))
    monkeypatch.setattr(providers, "invalidate_models_cache", lambda: None)
    monkeypatch.setenv("XIAOMI_API_KEY", "machine-global-secret")
    result = providers.set_provider_key("xiaomi", None,
        "https://token-plan-ams.xiaomimimo.com/v1", preserve_api_key=True)
    assert result["ok"] and result["has_key"] and result["action"] == "preserved"
    saved = env_path.read_text("utf-8")
    assert "tp-synthetic-secret-value" in saved
    assert "token-plan-ams.xiaomimimo.com" in saved
    assert __import__("os").environ["XIAOMI_API_KEY"] == "machine-global-secret"
    assert providers._get_provider_api_key("xiaomi") == "tp-synthetic-secret-value"


def test_mimo_auth_resolution_ignores_process_global_key(tmp_path, monkeypatch):
    from cli import auth
    monkeypatch.setenv("XIAOMI_API_KEY", "machine-global-secret")
    monkeypatch.setattr("cli.config.load_env", lambda: {})
    key, source = auth._resolve_api_key_provider_secret("xiaomi", auth.PROVIDER_REGISTRY["xiaomi"])
    assert (key, source) == ("", "")


def test_mimo_runtime_uses_profile_token_plan_url_and_refuses_missing_url(monkeypatch):
    from cli import auth
    monkeypatch.setenv("XIAOMI_API_KEY", "machine-global-secret")
    monkeypatch.setenv("XIAOMI_BASE_URL", "https://wrong.example/v1")
    monkeypatch.setattr("cli.config.load_env", lambda: {
        "XIAOMI_API_KEY": "tp-synthetic-secret-value",
        "XIAOMI_BASE_URL": "https://token-plan-ams.xiaomimimo.com/v1",
    })
    result = auth.resolve_api_key_provider_credentials("xiaomi")
    assert result["api_key"] == "tp-synthetic-secret-value"
    assert result["base_url"] == "https://token-plan-ams.xiaomimimo.com/v1"
    monkeypatch.setattr("cli.config.load_env", lambda: {"XIAOMI_API_KEY": "tp-synthetic-secret-value"})
    with pytest.raises(auth.AuthError) as error:
        auth.resolve_api_key_provider_credentials("xiaomi")
    assert error.value.code == "mimo_token_plan_base_url_required"


def test_mimo_model_catalog_uses_only_scoped_key_and_current_model_ids(monkeypatch):
    from cli.models import _PROVIDER_MODELS as cli_models
    from web.api.config import _PROVIDER_MODELS as api_models, _configured_model_probe_api_key
    import os

    monkeypatch.setenv("XIAOMI_API_KEY", "machine-global-secret")
    args = {"provider": "xiaomi", "config": {}, "model_config": {}, "env_values": {}}
    base = "https://token-plan-ams.xiaomimimo.com/v1"
    assert _configured_model_probe_api_key(**args, base_url=base) == ""
    scoped = {**args, "env_values": {"XIAOMI_API_KEY": "tp-synthetic-secret-value"}}
    assert _configured_model_probe_api_key(**scoped, base_url=base) == "tp-synthetic-secret-value"
    assert cli_models["xiaomi"] == ["mimo-v2.5", "mimo-v2.5-pro", "mimo-v2.6-flash", "mimo-v2.6-pro"]
    assert {row["id"] for row in api_models["xiaomi"]} == set(cli_models["xiaomi"])
    assert os.environ["XIAOMI_API_KEY"] == "machine-global-secret"
