"""Contracts for direct OpenAI API-key access, separate from Codex OAuth."""

from __future__ import annotations

import sys
from pathlib import Path


SIDEKICK_ROOT = Path(__file__).resolve().parents[1]
if str(SIDEKICK_ROOT) not in sys.path:
    sys.path.insert(0, str(SIDEKICK_ROOT))


def test_openai_api_key_provider_is_configured_separately_from_codex() -> None:
    from cli.auth import PROVIDER_REGISTRY

    openai = PROVIDER_REGISTRY["openai"]
    codex = PROVIDER_REGISTRY["openai-codex"]

    assert openai.auth_type == "api_key"
    assert openai.api_key_env_vars == ("OPENAI_API_KEY",)
    assert openai.inference_base_url == "https://api.openai.com/v1"
    assert openai.base_url_env_var == "OPENAI_BASE_URL"
    assert codex.auth_type == "oauth_external"
    assert codex.api_key_env_vars == ()


def test_openai_api_key_resolution_uses_chat_api_and_configured_model_endpoint(monkeypatch) -> None:
    from cli import runtime_provider

    model_config = {
        "provider": "openai",
        "default": "gpt-4o-mini",
        "base_url": "https://configured-openai.example/v1",
        # A stale persisted Codex mode must not turn API-key traffic into OAuth.
        "api_mode": "codex_responses",
    }
    monkeypatch.setattr(runtime_provider, "_get_model_config", lambda: dict(model_config))
    monkeypatch.setattr(runtime_provider, "load_pool", lambda _provider: None)
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    result = runtime_provider.resolve_runtime_provider(
        requested="openai",
        target_model="gpt-4o",
    )

    assert result["provider"] == "openai"
    assert result["requested_provider"] == "openai"
    assert result["api_mode"] == "chat_completions"
    assert result["base_url"] == "https://configured-openai.example/v1"
    assert result["api_key"] == "test-openai-key"


def test_openai_env_endpoint_override_precedes_model_endpoint(monkeypatch) -> None:
    from cli import runtime_provider

    model_config = {
        "provider": "openai",
        "default": "gpt-4o-mini",
        "base_url": "https://configured-openai.example/v1",
    }
    monkeypatch.setattr(runtime_provider, "_get_model_config", lambda: dict(model_config))
    monkeypatch.setattr(runtime_provider, "load_pool", lambda _provider: None)
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://env-openai.example/v1")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    result = runtime_provider.resolve_runtime_provider(requested="openai")

    assert result["provider"] == "openai"
    assert result["base_url"] == "https://env-openai.example/v1"
    assert result["api_mode"] == "chat_completions"


def test_codex_oauth_remains_on_responses_endpoint(monkeypatch) -> None:
    from cli import runtime_provider

    monkeypatch.setattr(
        runtime_provider,
        "_get_model_config",
        lambda: {"provider": "openai-codex", "default": "gpt-5.4"},
    )
    monkeypatch.setattr(runtime_provider, "load_pool", lambda _provider: None)
    monkeypatch.setattr(
        runtime_provider,
        "resolve_codex_runtime_credentials",
        lambda: {
            "api_key": "test-codex-oauth-token",
            "base_url": "https://chatgpt.com/backend-api/codex",
            "last_refresh": "test",
        },
    )
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")

    result = runtime_provider.resolve_runtime_provider(requested="openai-codex")

    assert result["provider"] == "openai-codex"
    assert result["requested_provider"] == "openai-codex"
    assert result["api_mode"] == "codex_responses"
    assert result["base_url"] == "https://chatgpt.com/backend-api/codex"
    assert result["api_key"] == "test-codex-oauth-token"


def test_auto_routing_with_only_openai_key_selects_openai_api(monkeypatch) -> None:
    from cli import auth

    monkeypatch.setattr(auth, "_load_auth_store", lambda: {})
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    assert auth.resolve_provider("auto") == "openai"


def test_openrouter_runtime_never_uses_openai_key_as_openrouter_credential(monkeypatch) -> None:
    from cli import runtime_provider

    monkeypatch.setattr(runtime_provider, "_get_model_config", lambda: {"provider": "auto"})
    monkeypatch.setattr(runtime_provider, "load_config", lambda: {})
    monkeypatch.setattr(runtime_provider, "load_pool", lambda _provider: None)
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    result = runtime_provider.resolve_runtime_provider(requested="openrouter")

    assert result["provider"] == "openrouter"
    assert result["base_url"] == "https://openrouter.ai/api/v1"
    assert result["api_key"] == ""


def test_openrouter_runtime_uses_only_openrouter_key_for_openrouter_host(monkeypatch) -> None:
    from cli import runtime_provider

    monkeypatch.setattr(runtime_provider, "_get_model_config", lambda: {"provider": "openrouter"})
    monkeypatch.setattr(runtime_provider, "load_config", lambda: {})
    monkeypatch.setattr(runtime_provider, "load_pool", lambda _provider: None)
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key")

    result = runtime_provider.resolve_runtime_provider(requested="openrouter")

    assert result["provider"] == "openrouter"
    assert result["api_key"] == "test-openrouter-key"


def test_generic_custom_endpoint_does_not_inherit_openai_or_openrouter_keys(monkeypatch) -> None:
    from cli import runtime_provider

    monkeypatch.setattr(runtime_provider, "_get_model_config", lambda: {"provider": "custom"})
    monkeypatch.setattr(runtime_provider, "load_config", lambda: {})
    monkeypatch.setattr(runtime_provider, "load_pool", lambda _provider: None)
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key")

    result = runtime_provider.resolve_runtime_provider(
        requested="custom",
        explicit_base_url="https://custom-endpoint.example/v1",
    )

    assert result["provider"] == "custom"
    assert result["base_url"] == "https://custom-endpoint.example/v1"
    assert result["api_key"] == "no-key-required"


def test_openai_model_discovery_uses_resolved_key_and_model_endpoint(monkeypatch) -> None:
    from cli import models

    calls = []
    monkeypatch.setattr(
        "cli.auth.resolve_api_key_provider_credentials",
        lambda provider: {
            "provider": provider,
            "api_key": "config-openai-test-key",
            "base_url": "https://api.openai.com/v1",
        },
    )
    monkeypatch.setattr(
        "cli.config.load_config",
        lambda: {
            "model": {
                "provider": "openai",
                "base_url": "https://configured-openai.example/v1",
            }
        },
    )
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
    monkeypatch.setattr(
        models,
        "fetch_api_models",
        lambda key, base_url, **kwargs: calls.append((key, base_url, kwargs)) or ["gpt-live-test"],
    )

    assert models.provider_model_ids("openai") == ["gpt-live-test"]
    assert calls == [(
        "config-openai-test-key",
        "https://configured-openai.example/v1",
        {"allow_redirects": False},
    )]


def test_openai_model_discovery_returns_empty_on_missing_key_or_probe_failure(monkeypatch) -> None:
    from cli import models

    monkeypatch.setattr(
        "cli.auth.resolve_api_key_provider_credentials",
        lambda _provider: {"api_key": "", "base_url": "https://api.openai.com/v1"},
    )
    monkeypatch.setattr("cli.config.load_config", lambda: {"model": {"provider": "openai"}})
    monkeypatch.setattr(
        models,
        "fetch_api_models",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("no key means no probe")),
    )

    assert models.provider_model_ids("openai") == []

    monkeypatch.setattr(
        "cli.auth.resolve_api_key_provider_credentials",
        lambda _provider: {"api_key": "fake-test-key", "base_url": "https://api.openai.com/v1"},
    )
    monkeypatch.setattr(models, "fetch_api_models", lambda *_args, **_kwargs: None)
    assert models.provider_model_ids("openai") == []


def test_openai_api_key_does_not_imply_codex_oauth_availability() -> None:
    from web.api.config import _openai_api_key_provider_ids

    assert _openai_api_key_provider_ids({"OPENAI_API_KEY": "fake-test-key"}) == {"openai"}
    assert _openai_api_key_provider_ids({}) == set()


def test_openai_model_probe_uses_only_openai_scoped_credentials(monkeypatch) -> None:
    from web.api.config import _configured_model_probe_api_key

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key")
    args = {
        "provider": "openai",
        "config": {"providers": {}},
        "model_config": {"provider": "openai"},
        "env_values": {"OPENROUTER_API_KEY": "test-openrouter-key"},
        "base_url": "https://api.openai.com/v1",
    }
    assert _configured_model_probe_api_key(**args) == ""

    configured = {
        **args,
        "config": {"providers": {"openai": {"api_key": "config-openai-test-key"}}},
    }
    assert _configured_model_probe_api_key(**configured) == "config-openai-test-key"


def test_openai_live_models_endpoint_returns_empty_instead_of_static_fallback(monkeypatch, tmp_path) -> None:
    from fastapi.testclient import TestClient

    from cli import web_server
    from web.api import routes

    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "sidekick"))
    monkeypatch.setattr("cli.models.provider_model_ids", lambda _provider: [])
    monkeypatch.setattr(routes, "_get_cached_live_models", lambda _key: None)
    monkeypatch.setattr(routes, "_set_cached_live_models", lambda _key, _payload: None)
    monkeypatch.setattr(
        "urllib.request.urlopen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("OpenAI live endpoint must not retry with an unscoped key")
        ),
    )

    client = TestClient(web_server.app)
    headers = {web_server._SESSION_HEADER_NAME: web_server._SESSION_TOKEN}
    response = client.get("/api/models/live?provider=openai", headers=headers)

    assert response.status_code == 200
    assert response.json() == {"provider": "openai", "models": [], "count": 0}
