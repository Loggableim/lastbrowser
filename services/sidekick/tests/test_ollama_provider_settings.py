"""Provider key storage contract for local Ollama settings."""

from __future__ import annotations

import os


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
