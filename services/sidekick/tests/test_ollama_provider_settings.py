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
