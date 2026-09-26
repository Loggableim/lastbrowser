"""Provider status keeps Anthropic API-key and Claude Code link states distinct."""

import json


def test_anthropic_provider_reports_claude_code_link_without_claiming_api_key(monkeypatch, tmp_path):
    from web.api import providers

    auth_path = tmp_path / "auth.json"
    auth_path.write_text(json.dumps({
        "credential_pool": {
            "anthropic": [{
                "auth_type": "oauth",
                "source": "claude_code_linked",
                "label": "Claude Code (linked)",
            }]
        }
    }), encoding="utf-8")

    monkeypatch.setattr(providers, "get_config", lambda: {})
    monkeypatch.setattr(providers, "_PROVIDER_DISPLAY", {"anthropic": "Anthropic"})
    monkeypatch.setattr(providers, "_PROVIDER_MODELS", {"anthropic": []})
    monkeypatch.setattr(providers, "_OAUTH_PROVIDERS", frozenset())
    monkeypatch.setattr(providers, "_PROVIDER_ENV_VAR", {"anthropic": "ANTHROPIC_API_KEY"})
    monkeypatch.setattr(providers, "_provider_has_key", lambda _provider_id: False)
    monkeypatch.setattr(providers, "_get_sidekick_home", lambda: tmp_path)
    monkeypatch.setattr(providers, "_load_env_file", lambda _path: {})

    result = providers.get_providers()["providers"][0]

    assert result["oauth_connected"] is True
    assert result["has_key"] is False
    assert result["configurable"] is True
    assert result["is_oauth"] is False
    assert result["auth_state"] == "not_connected"


def test_anthropic_provider_reports_no_oauth_link_without_marker(monkeypatch, tmp_path):
    from web.api import providers

    (tmp_path / "auth.json").write_text(json.dumps({"credential_pool": {}}), encoding="utf-8")
    monkeypatch.setattr(providers, "get_config", lambda: {})
    monkeypatch.setattr(providers, "_PROVIDER_DISPLAY", {"anthropic": "Anthropic"})
    monkeypatch.setattr(providers, "_PROVIDER_MODELS", {"anthropic": []})
    monkeypatch.setattr(providers, "_OAUTH_PROVIDERS", frozenset())
    monkeypatch.setattr(providers, "_PROVIDER_ENV_VAR", {"anthropic": "ANTHROPIC_API_KEY"})
    monkeypatch.setattr(providers, "_provider_has_key", lambda _provider_id: False)
    monkeypatch.setattr(providers, "_get_sidekick_home", lambda: tmp_path)
    monkeypatch.setattr(providers, "_load_env_file", lambda _path: {})

    result = providers.get_providers()["providers"][0]
    assert result["oauth_connected"] is False
