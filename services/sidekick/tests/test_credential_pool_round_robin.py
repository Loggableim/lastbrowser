"""Offline integration contract for runtime credential rotation."""

from __future__ import annotations

from copy import deepcopy


def test_runtime_provider_round_robins_persisted_anthropic_credentials(monkeypatch):
    """Separate runtime resolutions must rotate without reading user auth data."""
    from cli import runtime_provider
    from runtime import credential_pool

    persisted = [
        {
            "id": "account-a",
            "label": "Account A",
            "auth_type": "api_key",
            "priority": 0,
            "source": "test",
            "access_token": "test-credential-a",
            "base_url": "https://api.anthropic.com",
        },
        {
            "id": "account-b",
            "label": "Account B",
            "auth_type": "api_key",
            "priority": 1,
            "source": "test",
            "access_token": "test-credential-b",
            "base_url": "https://api.anthropic.com",
        },
    ]
    monkeypatch.setattr(credential_pool, "read_credential_pool", lambda _provider: deepcopy(persisted))

    def persist(_provider, entries):
        persisted[:] = deepcopy(entries)

    monkeypatch.setattr(credential_pool, "write_credential_pool", persist)
    monkeypatch.setattr(credential_pool, "get_pool_strategy", lambda _provider: credential_pool.STRATEGY_ROUND_ROBIN)
    monkeypatch.setattr(credential_pool, "_seed_from_singletons", lambda _provider, _entries: (False, set()))
    monkeypatch.setattr(credential_pool, "_seed_from_env", lambda _provider, _entries: (False, set()))
    monkeypatch.setattr(credential_pool, "_normalize_pool_priorities", lambda _provider, _entries: False)
    monkeypatch.setattr(runtime_provider, "_get_model_config", lambda: {
        "provider": "anthropic",
        "default": "claude-sonnet-test",
    })

    selected = [
        runtime_provider.resolve_runtime_provider(requested="anthropic")["api_key"]
        for _ in range(4)
    ]

    assert selected == [
        "test-credential-a",
        "test-credential-b",
        "test-credential-a",
        "test-credential-b",
    ]
