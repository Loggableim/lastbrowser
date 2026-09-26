"""OpenRouter key and selected-model persistence contracts."""

from __future__ import annotations


def test_openrouter_model_allowlist_persists_without_overwriting_key(monkeypatch, tmp_path):
    from web.api import config, providers

    config_path = tmp_path / "config.yaml"
    monkeypatch.setattr(config, "_get_config_path", lambda: config_path)
    monkeypatch.setattr(config, "reload_config", lambda: None)
    monkeypatch.setattr(config, "invalidate_models_cache", lambda: None)
    config._save_yaml_config_file(
        config_path,
        {"providers": {"openrouter": {"api_key": "existing-test-only"}}},
    )

    result = providers.set_provider_models(
        "openrouter",
        ["anthropic/claude-sonnet-4.6", "qwen/qwen3.8-27b:free", "anthropic/claude-sonnet-4.6"],
    )

    saved = config._load_yaml_config_file(config_path)
    assert result["ok"] is True
    assert result["models"] == ["anthropic/claude-sonnet-4.6", "qwen/qwen3.8-27b:free"]
    assert saved["providers"]["openrouter"]["api_key"] == "existing-test-only"
    assert saved["providers"]["openrouter"]["models"] == result["models"]


def test_openrouter_allowlist_filters_catalog_and_keeps_saved_unlisted_model():
    from web.api.config import _apply_provider_model_allowlist

    live = [
        {"id": "anthropic/claude-sonnet-4.6", "label": "Claude Sonnet"},
        {"id": "qwen/qwen3.8-27b:free", "label": "Qwen"},
    ]

    assert _apply_provider_model_allowlist(live, {}) == live
    assert _apply_provider_model_allowlist(
        live,
        {"models": ["qwen/qwen3.8-27b:free", "retired/model-v1"]},
    ) == [
        {"id": "qwen/qwen3.8-27b:free", "label": "Qwen"},
        {"id": "retired/model-v1", "label": "retired/model-v1"},
    ]
    assert _apply_provider_model_allowlist(live, {"models": []}) == []


def test_openrouter_allowlist_rejects_other_providers_and_unsafe_model_ids():
    import pytest
    from web.api.providers import normalize_provider_model_allowlist

    with pytest.raises(ValueError, match="OpenRouter only"):
        normalize_provider_model_allowlist("anthropic", ["anthropic/claude-sonnet-4.6"])
    with pytest.raises(ValueError, match="unsupported characters"):
        normalize_provider_model_allowlist("openrouter", ["model\napi_key=secret"])
    with pytest.raises(ValueError, match="at most 500"):
        normalize_provider_model_allowlist("openrouter", ["model"] * 501)


def test_models_only_provider_update_does_not_remove_saved_api_key(monkeypatch):
    import io
    import json
    from urllib.parse import urlparse
    from web.api import routes

    calls = []
    monkeypatch.setattr(
        routes,
        "set_provider_key",
        lambda *args: calls.append(("key", args)) or {"ok": True},
    )
    monkeypatch.setattr(
        routes,
        "set_provider_models",
        lambda provider, models: calls.append(("models", provider, models))
        or {"ok": True, "provider": provider, "models": models},
    )
    monkeypatch.setattr(
        "runtime.smart_track_orchestrator.schedule_model_wall_scan",
        lambda: None,
    )
    body = json.dumps({"provider": "openrouter", "models": ["vendor/model-a"]})

    class Handler:
        headers = {"Content-Length": str(len(body)), "Host": "127.0.0.1"}
        client_address = ("127.0.0.1", 12345)

        def __init__(self):
            self.rfile = io.BytesIO(body.encode())
            self.wfile = io.BytesIO()
            self.status_code = None

        def send_response(self, status):
            self.status_code = status

        def send_header(self, *_args):
            pass

        def end_headers(self):
            pass

    handler = Handler()
    routes.handle_post(handler, urlparse("/api/providers"))
    payload = json.loads(handler.wfile.getvalue())
    assert handler.status_code == 200
    assert payload["models"] == ["vendor/model-a"]
    assert calls == [("models", "openrouter", ["vendor/model-a"])]


def test_openrouter_probe_uses_fixed_catalog_url_and_never_returns_key(monkeypatch):
    import io
    import json
    from urllib.parse import urlparse

    from web.api import routes

    seen = {}

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self, _limit):
            return json.dumps({"data": [
                {"id": "vendor/model-b", "name": "Model B"},
                {"id": "vendor/model-a", "name": "Model A"},
            ]}).encode()

    def fake_urlopen(request, timeout):
        seen["url"] = request.full_url
        seen["headers"] = {key.lower(): value for key, value in request.header_items()}
        seen["timeout"] = timeout
        return Response()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    key = "unit-test-key"
    # Capture the actual handler response contract.
    class Handler:
        def __init__(self):
            self.wfile = io.BytesIO()
            self.status = None

        def send_response(self, status):
            self.status = status

        def send_header(self, *_args):
            pass

        def end_headers(self):
            pass

    handler = Handler()
    routes._handle_model_probe(handler, {"provider": "openrouter", "api_key": key})
    payload = json.loads(handler.wfile.getvalue())
    assert handler.status == 200
    assert payload["provider"] == "openrouter"
    assert [model["id"] for model in payload["models"]] == ["vendor/model-a", "vendor/model-b"]
    assert key not in json.dumps(payload)
    assert seen["url"] == "https://openrouter.ai/api/v1/models"
    assert key not in seen["url"]
    assert seen["headers"]["authorization"] == f"Bearer {key}"
    assert seen["timeout"] == 12


def test_model_probe_rejects_unregistered_provider_without_network(monkeypatch):
    import io
    import json

    from web.api import routes

    def unexpected_network(*_args, **_kwargs):
        raise AssertionError("unsupported provider must not trigger a network request")

    monkeypatch.setattr("urllib.request.urlopen", unexpected_network)

    class Handler:
        def __init__(self):
            self.wfile = io.BytesIO()
            self.status = None

        def send_response(self, status):
            self.status = status

        def send_header(self, *_args):
            pass

        def end_headers(self):
            pass

    handler = Handler()
    routes._handle_model_probe(handler, {"provider": "custom", "api_key": "unit-test-key"})
    payload = json.loads(handler.wfile.getvalue())
    assert handler.status == 400
    assert payload["models"] == []
    assert "unit-test-key" not in json.dumps(payload)
