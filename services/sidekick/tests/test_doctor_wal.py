import sqlite3

from cli.doctor import (
    _checkpoint_wal_truncate,
    _has_provider_env_config,
    _integrated_provider,
    _provider_env_file_is_optional,
    _doctor_provider_is_configured,
    _resolve_doctor_provider_context,
)


def test_provider_env_detection_ignores_comments_and_empty_values():
    assert not _has_provider_env_config(
        "# OPENAI_API_KEY=old\nOLLAMA_API_KEY=\nOPENROUTER_API_KEY=   \n"
    )
    assert _has_provider_env_config("OLLAMA_API_KEY=cloud-test-key\n")


def test_provider_env_detection_does_not_report_other_tools_as_inference_keys():
    assert not _has_provider_env_config("TINKER_API_KEY=tool-only\nEXA_API_KEY=search-only\n")


def test_desktop_managed_providers_do_not_require_sidekick_env_credentials():
    assert _integrated_provider("openrouter")
    assert _integrated_provider("ollama-cloud")
    assert _integrated_provider("antigravity")
    assert not _integrated_provider("google-gemini-cli")


def test_missing_desktop_provider_credentials_do_not_make_env_file_required():
    # The provider-specific missing-key error is sufficient; .env is not used
    # for credentials managed by Lastbrowser, even when that key is absent.
    assert _provider_env_file_is_optional("openrouter")
    assert _provider_env_file_is_optional("antigravity")
    assert _provider_env_file_is_optional("auto")
    assert not _provider_env_file_is_optional("deepseek")


def test_active_provider_credentials_accept_context_pool_and_local_ollama(monkeypatch):
    import web.api.providers as providers
    from cli.doctor import _active_provider_has_credentials

    monkeypatch.setattr(providers, "_provider_has_key", lambda _provider: False)
    assert _active_provider_has_credentials("openrouter", {"api_key": "pooled-token"})
    assert not _active_provider_has_credentials("openrouter", {"api_key": ""})
    assert _active_provider_has_credentials("ollama", {})


def test_doctor_uses_lastbrowser_pool_for_active_api_key_providers(monkeypatch):
    import web.api.providers as providers

    monkeypatch.setattr(providers, "_provider_has_key", lambda _provider: False)
    for provider in ("openai", "anthropic", "ollama-cloud"):
        assert _doctor_provider_is_configured(
            provider,
            provider,
            {"provider": provider, "api_key": "vault-backed-credential"},
        )

    assert not _doctor_provider_is_configured("openai", "openai", {"api_key": ""})
    assert _doctor_provider_is_configured("ollama", "ollama", {})
    assert _doctor_provider_is_configured("deepseek", "deepseek", {"api_key": "token"}) is None


def test_active_provider_resolution_uses_profile_aware_runtime_context(monkeypatch):
    import web.api.config as config
    import web.api.profiles as profiles

    initialized = []
    monkeypatch.setattr(profiles, "init_profile_state", lambda: initialized.append(True))
    monkeypatch.setattr(
        config,
        "resolve_active_provider_context",
        lambda: {"provider": "openrouter", "api_key": "test-credential"},
    )

    assert _resolve_doctor_provider_context() == {"provider": "openrouter", "api_key": "test-credential"}
    assert initialized == [True]


def test_checkpoint_wal_truncate_shrinks_sqlite_wal(tmp_path):
    db_path = tmp_path / "state.db"
    wal_path = tmp_path / "state.db-wal"

    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("CREATE TABLE sessions (id TEXT PRIMARY KEY)")
        conn.executemany(
            "INSERT INTO sessions (id) VALUES (?)",
            [(f"session-{i}",) for i in range(1000)],
        )
        conn.commit()
        assert wal_path.exists()
        assert wal_path.stat().st_size > 0

        old_size, new_size, checkpoint_result = _checkpoint_wal_truncate(db_path, wal_path)

        assert checkpoint_result is not None
        assert old_size > 0
        assert new_size < old_size
    finally:
        conn.close()
