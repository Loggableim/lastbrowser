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


def test_named_profile_qwen_status_requires_its_explicit_profile_pool_entry(monkeypatch, tmp_path):
    from cli import auth
    from web.api import profiles, providers

    home = tmp_path / "named-profile"
    home.mkdir()
    (home / "auth.json").write_text(json.dumps({
        "credential_pool": {
            "qwen-oauth": [{
                "source": "manual:qwen_cli",
                "access_token": "fixture-qwen-profile-access-token",
            }]
        }
    }), encoding="utf-8")
    monkeypatch.setattr(providers, "get_config", lambda: {})
    monkeypatch.setattr(providers, "_PROVIDER_DISPLAY", {"qwen-oauth": "Qwen OAuth"})
    monkeypatch.setattr(providers, "_PROVIDER_MODELS", {"qwen-oauth": []})
    monkeypatch.setattr(providers, "_OAUTH_PROVIDERS", frozenset({"qwen-oauth"}))
    monkeypatch.setattr(providers, "_PROVIDER_ENV_VAR", {})
    monkeypatch.setattr(providers, "_provider_has_key", lambda _provider_id: False)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "alpha")
    monkeypatch.setattr(profiles, "get_active_profile_home", lambda: home)
    monkeypatch.setattr(profiles, "_is_root_profile", lambda _name: False)
    monkeypatch.setattr(auth, "get_auth_status", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("must not probe global Qwen CLI auth")))

    result = providers.get_providers()["providers"][0]

    assert result["oauth_connected"] is True
    assert result["has_key"] is True
    assert result["auth_state"] == "connected"
    assert "api_key" not in result


def test_named_profile_qwen_status_does_not_inherit_global_cli_login(monkeypatch, tmp_path):
    from cli import auth
    from web.api import profiles, providers

    home = tmp_path / "named-profile"
    home.mkdir()
    monkeypatch.setattr(providers, "get_config", lambda: {})
    monkeypatch.setattr(providers, "_PROVIDER_DISPLAY", {"qwen-oauth": "Qwen OAuth"})
    monkeypatch.setattr(providers, "_PROVIDER_MODELS", {"qwen-oauth": []})
    monkeypatch.setattr(providers, "_OAUTH_PROVIDERS", frozenset({"qwen-oauth"}))
    monkeypatch.setattr(providers, "_PROVIDER_ENV_VAR", {})
    monkeypatch.setattr(providers, "_provider_has_key", lambda _provider_id: False)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "alpha")
    monkeypatch.setattr(profiles, "get_active_profile_home", lambda: home)
    monkeypatch.setattr(profiles, "_is_root_profile", lambda _name: False)
    monkeypatch.setattr(auth, "get_auth_status", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("must not probe global Qwen CLI auth")))

    result = providers.get_providers()["providers"][0]

    assert result["oauth_connected"] is False
    assert result["has_key"] is False
    assert result["auth_state"] == "not_connected"


def test_default_profile_keeps_legacy_qwen_cli_status(monkeypatch):
    from cli import auth
    from web.api import profiles, providers

    calls = []
    monkeypatch.setattr(providers, "get_config", lambda: {})
    monkeypatch.setattr(providers, "_PROVIDER_DISPLAY", {"qwen-oauth": "Qwen OAuth"})
    monkeypatch.setattr(providers, "_PROVIDER_MODELS", {"qwen-oauth": []})
    monkeypatch.setattr(providers, "_OAUTH_PROVIDERS", frozenset({"qwen-oauth"}))
    monkeypatch.setattr(providers, "_PROVIDER_ENV_VAR", {})
    monkeypatch.setattr(providers, "_provider_has_key", lambda _provider_id: False)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "default")
    monkeypatch.setattr(profiles, "_is_root_profile", lambda _name: True)
    monkeypatch.setattr(auth, "get_auth_status", lambda provider_id: calls.append(provider_id) or {"logged_in": True, "key_source": "oauth"})

    result = providers.get_providers()["providers"][0]

    assert calls == ["qwen-oauth"]
    assert result["has_key"] is True
    assert result["auth_state"] == "connected"
