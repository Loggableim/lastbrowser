"""Provider key storage contract for local Ollama settings."""

from __future__ import annotations

import os

import pytest


def test_local_ollama_key_is_saved_provider_scoped_without_changing_cloud_env(monkeypatch, tmp_path):
    from web.api import config, providers

    config_path = tmp_path / "config.yaml"
    original_config_path = config._get_config_path
    monkeypatch.setattr(config, "_get_config_path", lambda: config_path)
    monkeypatch.setenv("OLLAMA_API_KEY", "cloud-test-only")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    try:
        result = providers.set_provider_key("ollama", "local-test-only")

        assert result["ok"] is True
        assert result["action"] == "updated"
        assert os.environ["OLLAMA_API_KEY"] == "cloud-test-only"
        saved = config._load_yaml_config_file(config_path)
        assert saved["providers"]["ollama"]["api_key"] == "local-test-only"

        removed = providers.set_provider_key("ollama", None)
        assert removed["ok"] is True
        saved_after_remove = config._load_yaml_config_file(config_path)
        assert "api_key" not in saved_after_remove.get("providers", {}).get("ollama", {})
        assert os.environ["OLLAMA_API_KEY"] == "cloud-test-only"
    finally:
        monkeypatch.setattr(config, "_get_config_path", original_config_path)
        config.reload_config()


@pytest.mark.parametrize("action", ["set", "remove"])
def test_ollama_cloud_key_change_invalidates_live_catalog_cache(monkeypatch, tmp_path, action):
    from web.api import config, providers
    from cli import models

    config_path = tmp_path / "config.yaml"
    monkeypatch.setattr(config, "_get_config_path", lambda: config_path)
    monkeypatch.setattr(providers, "_get_sidekick_home", lambda: tmp_path)
    monkeypatch.setattr(providers, "_write_env_file", lambda _path, _updates: None)
    cache_path = tmp_path / "ollama_cloud_models_cache.json"
    monkeypatch.setattr(models, "_ollama_cloud_cache_path", lambda: cache_path)
    cache_path.write_text('{"version":2,"models":["stale-model"],"cached_at":0}', encoding="utf-8")

    # The API models cache uses the shared invalidator; this provider-specific
    # cache is separately dropped only for Ollama Cloud key changes.
    monkeypatch.setattr(config, "_delete_models_cache_on_disk", lambda: None)
    if action == "set":
        result = providers.set_provider_key("ollama-cloud", "cloud-test-key")
    else:
        result = providers.remove_provider_key("ollama-cloud")

    assert result["ok"] is True
    assert not cache_path.exists()


@pytest.mark.parametrize("action", ["set", "remove"])
def test_ollama_cloud_credential_change_evicts_real_sync_and_async_runtime_clients(
    monkeypatch, tmp_path, action
):
    """Changing the stored credential must invalidate actual SDK clients in the runtime cache."""
    from openai import AsyncOpenAI, OpenAI
    from web.api import config, providers
    from runtime import auxiliary_client

    config_path = tmp_path / "config.yaml"
    monkeypatch.setattr(config, "_get_config_path", lambda: config_path)
    monkeypatch.setattr(providers, "_get_sidekick_home", lambda: tmp_path)
    monkeypatch.setattr(providers, "_write_env_file", lambda _path, _updates: None)
    monkeypatch.setattr(config, "_delete_models_cache_on_disk", lambda: None)
    monkeypatch.delenv("OLLAMA_API_KEY", raising=False)

    # Seed the process-global cache through its normal cache-key/store helpers,
    # using real SDK objects so this verifies sync and async client eviction.
    sync_client = OpenAI(api_key="old-test-credential", base_url="https://ollama.com/v1")
    async_client = AsyncOpenAI(api_key="old-test-credential", base_url="https://ollama.com/v1")
    sync_key = auxiliary_client._client_cache_key(
        "ollama-cloud", async_mode=False, base_url="https://ollama.com/v1", api_key=None
    )
    async_key = auxiliary_client._client_cache_key(
        "ollama-cloud", async_mode=True, base_url="https://ollama.com/v1", api_key=None
    )
    async_key_other_provider = auxiliary_client._client_cache_key(
        "openrouter", async_mode=True, base_url="https://openrouter.ai/api/v1", api_key=None
    )
    other_client = AsyncOpenAI(api_key="other-test-credential", base_url="https://openrouter.ai/api/v1")
    auxiliary_client._store_cached_client(sync_key, sync_client, "deepseek-v4.1-flash")
    auxiliary_client._store_cached_client(async_key, async_client, "deepseek-v4.1-flash")
    auxiliary_client._store_cached_client(async_key_other_provider, other_client, "test-model")

    try:
        if action == "set":
            result = providers.set_provider_key("ollama-cloud", "new-test-credential")
        else:
            result = providers.remove_provider_key("ollama-cloud")

        assert result["ok"] is True
        assert sync_key not in auxiliary_client._client_cache
        assert async_key not in auxiliary_client._client_cache
        assert async_key_other_provider in auxiliary_client._client_cache
        assert sync_client._client.is_closed
        assert async_client._client.is_closed
        assert not other_client._client.is_closed
    finally:
        auxiliary_client._force_close_async_httpx(other_client)
        with auxiliary_client._client_cache_lock:
            auxiliary_client._client_cache.pop(async_key_other_provider, None)


def test_ollama_connection_probe_runs_in_backend_and_does_not_persist_key(monkeypatch):
    from web.api import providers

    calls = []

    class Response:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return b'{"data":[{"id":"test-model"}]}'

    class Opener:
        def open(self, request, timeout):
            calls.append((request, timeout))
            return Response()

    def fake_build_opener(handler):
        from web.api.providers import _NoRedirectHandler
        assert handler is _NoRedirectHandler
        assert handler().redirect_request(None, None, 302, "Found", {}, "https://attacker.test/") is None
        return Opener()

    monkeypatch.setattr(providers.urllib.request, "build_opener", fake_build_opener)
    result = providers.probe_ollama_connection(
        "ollama-cloud", "https://ollama.com/v1", "ollama-test-credential"
    )

    assert result == {"ok": True, "provider": "ollama-cloud", "model_count": 1}
    request, timeout = calls[0]
    assert request.full_url == "https://ollama.com/v1/models"
    assert request.get_header("Authorization") == "Bearer ollama-test-credential"
    assert timeout == 8


def test_ollama_connection_probe_rejects_non_loopback_local_endpoint(monkeypatch):
    from web.api import providers

    def unexpected_build_opener(*_args, **_kwargs):
        raise AssertionError("invalid endpoint must not be contacted")

    monkeypatch.setattr(providers.urllib.request, "build_opener", unexpected_build_opener)
    assert providers.probe_ollama_connection(
        "ollama", "http://example.test:11434", "test-local-key"
    ) == {"ok": False, "error": "local_ollama_must_use_loopback"}
    assert providers.probe_ollama_connection(
        "ollama-cloud", "https://ollama.com.attacker.test/v1", "test-cloud-key"
    ) == {"ok": False, "error": "invalid_ollama_cloud_base_url"}


def test_local_ollama_probe_counts_api_tags_models(monkeypatch):
    from web.api import providers

    class Response:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return b'{"models":[{"name":"local-a"},{"name":"local-b"}]}'

    class Opener:
        def open(self, request, timeout):
            assert request.full_url == "http://127.0.0.1:11434/api/tags"
            return Response()

    monkeypatch.setattr(providers.urllib.request, "build_opener", lambda _handler: Opener())

    assert providers.probe_ollama_connection(
        "ollama", "http://127.0.0.1:11434"
    ) == {"ok": True, "provider": "ollama", "model_count": 2}


def test_model_discovery_uses_provider_scoped_ollama_credentials(monkeypatch):
    from web.api.config import _configured_model_probe_api_key

    monkeypatch.setenv("OLLAMA_API_KEY", "cloud-test-only")
    monkeypatch.setenv("OPENAI_API_KEY", "openai-test-only")
    monkeypatch.setenv("OPENROUTER_API_KEY", "openrouter-test-only")

    local_config = {"providers": {"ollama": {"api_key": "local-test-only"}}}
    assert _configured_model_probe_api_key(
        "ollama",
        config=local_config,
        model_config={"provider": "ollama", "base_url": "http://127.0.0.1:11434/v1"},
        env_values={"OLLAMA_API_KEY": "cloud-test-only"},
        base_url="http://127.0.0.1:11434/v1",
    ) == "local-test-only"

    assert _configured_model_probe_api_key(
        "ollama",
        config={"providers": {}},
        model_config={"provider": "ollama", "base_url": "http://127.0.0.1:11434/v1"},
        env_values={
            "OLLAMA_API_KEY": "cloud-test-only",
            "OPENAI_API_KEY": "openai-test-only",
            "OPENROUTER_API_KEY": "openrouter-test-only",
        },
        base_url="http://127.0.0.1:11434/v1",
    ) == ""


def test_ollama_cloud_model_discovery_uses_ollama_key_only_on_official_host(monkeypatch):
    from web.api.config import _configured_model_probe_api_key

    monkeypatch.setenv("OLLAMA_API_KEY", "cloud-test-only")
    monkeypatch.setenv("OPENAI_API_KEY", "openai-test-only")
    monkeypatch.setenv("OPENROUTER_API_KEY", "openrouter-test-only")
    args = {
        "provider": "ollama-cloud",
        "config": {"providers": {}},
        "model_config": {"provider": "ollama-cloud"},
        "env_values": {},
    }
    assert _configured_model_probe_api_key(base_url="https://ollama.com/v1", **args) == "cloud-test-only"
    assert _configured_model_probe_api_key(base_url="https://ollama.com.attacker.test/v1", **args) == ""
    # A provider setting stored in config.yaml is also valid for discovery,
    # but only for the official host over TLS.
    configured_args = {
        **args,
        "config": {"providers": {"ollama-cloud": {"api_key": "configured-cloud-test-only"}}},
    }
    monkeypatch.delenv("OLLAMA_API_KEY", raising=False)
    assert _configured_model_probe_api_key(base_url="https://api.ollama.com/v1", **configured_args) == "configured-cloud-test-only"
    assert _configured_model_probe_api_key(base_url="http://ollama.com/v1", **configured_args) == ""
    assert _configured_model_probe_api_key(base_url="https://ollama.com.attacker.test/v1", **configured_args) == ""


def test_ollama_cloud_runtime_resolves_provider_scoped_config_key(monkeypatch):
    from cli import runtime_provider

    monkeypatch.delenv("OLLAMA_API_KEY", raising=False)
    monkeypatch.delenv("OLLAMA_BASE_URL", raising=False)
    # The host may have a real Ollama credential in its user .env file.
    # This test specifically verifies the config.yaml source, so isolate that
    # source too instead of allowing machine credentials to win precedence.
    monkeypatch.setattr("cli.config.get_env_value", lambda _name: None)
    monkeypatch.setattr(runtime_provider, "load_pool", lambda _provider: None)
    monkeypatch.setattr(
        "cli.config.load_config",
        lambda: {"providers": {"ollama-cloud": {"api_key": "config-cloud-test-key"}}},
    )
    monkeypatch.setattr(
        runtime_provider,
        "_get_model_config",
        lambda: {"provider": "ollama-cloud", "default": "deepseek-v4-flash"},
    )

    credentials = runtime_provider.resolve_runtime_provider(requested="ollama-cloud")

    assert credentials["api_key"] == "config-cloud-test-key"
    assert credentials["source"] == "config:providers.ollama-cloud"
    assert credentials["provider"] == "ollama-cloud"
    assert credentials["base_url"] == "https://ollama.com/v1"


@pytest.mark.parametrize(
    "base_url",
    [
        "http://ollama.com/v1",
        "https://ollama.com.attacker.test/v1",
        "http://127.0.0.1:11434/v1",
    ],
)
def test_ollama_cloud_runtime_rejects_non_official_key_destinations(monkeypatch, base_url):
    from cli import runtime_provider
    from cli.auth import AuthError

    monkeypatch.setenv("OLLAMA_API_KEY", "cloud-test-key")
    monkeypatch.setenv("OLLAMA_BASE_URL", base_url)
    monkeypatch.setattr(runtime_provider, "load_pool", lambda _provider: None)
    monkeypatch.setattr(
        runtime_provider,
        "_get_model_config",
        lambda: {"provider": "ollama-cloud", "default": "deepseek-v4-flash"},
    )

    with pytest.raises(AuthError) as exc:
        runtime_provider.resolve_runtime_provider(requested="ollama-cloud")

    assert exc.value.code == "invalid_ollama_cloud_base_url"


def test_ollama_cloud_runtime_accepts_official_https_host_override(monkeypatch):
    from cli import runtime_provider

    monkeypatch.setenv("OLLAMA_API_KEY", "cloud-test-key")
    monkeypatch.setenv("OLLAMA_BASE_URL", "https://api.ollama.com/v1")
    monkeypatch.setattr(runtime_provider, "load_pool", lambda _provider: None)
    monkeypatch.setattr(
        runtime_provider,
        "_get_model_config",
        lambda: {"provider": "ollama-cloud", "default": "deepseek-v4-flash"},
    )

    credentials = runtime_provider.resolve_runtime_provider(requested="ollama-cloud")

    assert credentials["base_url"] == "https://api.ollama.com/v1"


def test_ollama_cloud_runtime_rejects_non_official_credential_pool_endpoint(monkeypatch):
    from types import SimpleNamespace

    from cli import runtime_provider

    entry = SimpleNamespace(
        access_token="pool-cloud-test-key",
        runtime_api_key=None,
        base_url="http://127.0.0.1:11434/v1",
        runtime_base_url=None,
        source="test-pool",
    )
    pool = SimpleNamespace(has_credentials=lambda: True, select=lambda: entry)
    monkeypatch.setattr(runtime_provider, "load_pool", lambda _provider: pool)
    monkeypatch.setattr(
        runtime_provider,
        "_get_model_config",
        lambda: {"provider": "ollama-cloud", "default": "deepseek-v4-flash"},
    )

    with pytest.raises(runtime_provider.AuthError) as exc:
        runtime_provider.resolve_runtime_provider(requested="ollama-cloud")

    assert exc.value.code == "invalid_ollama_cloud_base_url"


def test_ollama_cloud_runtime_rejects_explicit_non_official_endpoint(monkeypatch):
    from cli import runtime_provider

    with pytest.raises(runtime_provider.AuthError) as exc:
        runtime_provider.resolve_runtime_provider(
            requested="ollama-cloud",
            explicit_api_key="explicit-cloud-test-key",
            explicit_base_url="http://127.0.0.1:11434/v1",
        )

    assert exc.value.code == "invalid_ollama_cloud_base_url"


def test_other_provider_probe_keeps_provider_scoped_config_key_precedence(monkeypatch):
    from web.api.config import _configured_model_probe_api_key

    monkeypatch.setenv("OPENAI_API_KEY", "ambient-test-only")
    assert _configured_model_probe_api_key(
        "openrouter",
        config={"providers": {"openrouter": {"api_key": "provider-test-only"}}},
        model_config={"provider": "openrouter"},
        env_values={},
        base_url="https://openrouter.ai/api/v1",
    ) == "provider-test-only"


def test_model_probe_never_forwards_a_different_or_generic_provider_key(monkeypatch):
    from web.api.config import _configured_model_probe_api_key

    monkeypatch.setenv("OPENROUTER_API_KEY", "openrouter-test-only")
    monkeypatch.setenv("OPENAI_API_KEY", "openai-test-only")
    monkeypatch.setenv("API_KEY", "generic-test-only")
    monkeypatch.setenv("LOCAL_API_KEY", "local-test-only")

    # A stale model.api_key and unrelated ambient keys must not be forwarded
    # to a different provider's endpoint during catalog discovery.
    assert _configured_model_probe_api_key(
        "anthropic",
        config={"providers": {}},
        model_config={"provider": "openrouter", "api_key": "stale-openrouter-test-only"},
        env_values={},
        base_url="https://api.anthropic.com/v1",
    ) == ""
    assert _configured_model_probe_api_key(
        "anthropic",
        config={"providers": {}},
        model_config={"provider": "anthropic"},
        env_values={},
        base_url="https://api.anthropic.com/v1",
    ) == ""

    # An unscoped legacy model key and the custom-provider key are only valid
    # for an explicitly custom endpoint; they must not leak to a named vendor.
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    assert _configured_model_probe_api_key(
        "openrouter",
        config={"providers": {"custom": {"api_key": "custom-test-only"}}},
        model_config={"api_key": "legacy-unscoped-test-only"},
        env_values={},
        base_url="https://openrouter.ai/api/v1",
    ) == ""
    assert _configured_model_probe_api_key(
        "custom",
        config={"providers": {"custom": {"api_key": "custom-test-only"}}},
        model_config={"api_key": "legacy-unscoped-test-only"},
        env_values={},
        base_url="https://llm.example.test/v1",
    ) == "legacy-unscoped-test-only"


def test_model_probe_uses_only_the_selected_providers_registered_env_key(monkeypatch):
    from web.api.config import _configured_model_probe_api_key

    monkeypatch.setenv("OPENROUTER_API_KEY", "openrouter-test-only")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "anthropic-test-only")

    assert _configured_model_probe_api_key(
        "anthropic",
        config={"providers": {}},
        model_config={"provider": "anthropic"},
        env_values={},
        base_url="https://api.anthropic.com/v1",
    ) == "anthropic-test-only"
