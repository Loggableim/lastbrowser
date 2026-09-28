"""The OpenRouter configuration catalog includes compatible paid models."""

from __future__ import annotations

import json
from types import SimpleNamespace

from web.api import routes


class _Response:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


def test_openrouter_config_catalog_includes_paid_tool_models(monkeypatch):
    catalog = {
        "data": [
            {"id": "vendor/paid-chat", "pricing": {"prompt": "0.001"}, "supported_parameters": ["tools"]},
            {"id": "vendor/free-chat", "pricing": {"prompt": "0"}, "supported_parameters": ["tools"]},
            {"id": "vendor/image-only", "pricing": {"prompt": "0.001"}, "supported_parameters": ["image"]},
            {"id": "vendor/paid-chat", "supported_parameters": ["tools"]},
        ]
    }
    monkeypatch.setattr("urllib.request.urlopen", lambda *_args, **_kwargs: _Response(catalog))

    assert routes._fetch_openrouter_config_model_ids() == ["vendor/paid-chat", "vendor/free-chat"]


def test_openrouter_live_endpoint_uses_full_catalog(monkeypatch):
    monkeypatch.setattr("web.api.config.get_config", lambda: {})
    monkeypatch.setattr(routes, "_resolve_provider_alias", lambda provider: provider, raising=False)
    monkeypatch.setattr(routes, "_get_cached_live_models", lambda _key: None)
    monkeypatch.setattr(routes, "_set_cached_live_models", lambda *_args: None)
    monkeypatch.setattr(routes, "_fetch_openrouter_config_model_ids", lambda: ["vendor/paid-chat", "vendor/free-chat"])
    monkeypatch.setattr("cli.models.provider_model_ids", lambda _provider: [])
    monkeypatch.setattr(routes, "j", lambda _handler, payload, **_kwargs: payload)

    response = routes._handle_live_models(None, SimpleNamespace(query="provider=openrouter&catalog=configuration"))

    assert response["provider"] == "openrouter"
    assert [model["id"] for model in response["models"]] == ["vendor/paid-chat", "vendor/free-chat"]


def test_openrouter_general_picker_keeps_curated_catalog(monkeypatch):
    monkeypatch.setattr("web.api.config.get_config", lambda: {})
    monkeypatch.setattr(routes, "_get_cached_live_models", lambda _key: None)
    monkeypatch.setattr(routes, "_set_cached_live_models", lambda *_args: None)
    monkeypatch.setattr(
        routes,
        "_fetch_openrouter_config_model_ids",
        lambda: (_ for _ in ()).throw(AssertionError("configuration catalog must not load")),
    )
    monkeypatch.setattr("cli.models.provider_model_ids", lambda _provider: ["vendor/free-chat"])
    monkeypatch.setattr(routes, "j", lambda _handler, payload, **_kwargs: payload)

    response = routes._handle_live_models(None, SimpleNamespace(query="provider=openrouter"))

    assert [model["id"] for model in response["models"]] == ["vendor/free-chat"]
