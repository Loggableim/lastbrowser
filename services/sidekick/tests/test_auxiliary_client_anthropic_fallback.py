"""Anthropic credentials must fall back when a credential pool is unusable."""

from runtime import auxiliary_client


def _patch_anthropic_client(monkeypatch):
    import runtime.anthropic_adapter as adapter

    created = []

    def build_client(token, base_url):
        client = object()
        created.append((token, base_url, client))
        return client

    monkeypatch.setattr(adapter, "build_anthropic_client", build_client)
    monkeypatch.setattr(auxiliary_client, "_get_aux_model_for_provider", lambda _provider: "claude-test")
    monkeypatch.setattr("cli.config.load_config", lambda: {})
    return created


def test_explicit_anthropic_api_key_is_used_when_pool_is_exhausted(monkeypatch):
    created = _patch_anthropic_client(monkeypatch)
    monkeypatch.setattr(auxiliary_client, "_select_pool_entry", lambda _provider: (True, None))

    client, model = auxiliary_client._try_anthropic(explicit_api_key="sk-ant-test-key")

    assert model == "claude-test"
    assert created[0][0] == "sk-ant-test-key"
    assert client is not None


def test_adapter_token_is_used_when_pool_exists_but_has_no_selectable_entry(monkeypatch):
    created = _patch_anthropic_client(monkeypatch)
    monkeypatch.setattr(auxiliary_client, "_select_pool_entry", lambda _provider: (True, None))
    monkeypatch.setattr(
        "runtime.anthropic_adapter.resolve_anthropic_token",
        lambda: "adapter-test-token",
    )

    client, model = auxiliary_client._try_anthropic()

    assert model == "claude-test"
    assert created[0][0] == "adapter-test-token"
    assert client is not None
