"""Ollama Cloud endpoint confinement for auxiliary API-key requests."""

from types import SimpleNamespace

import pytest


@pytest.mark.parametrize(
    "base_url",
    [
        "http://ollama.com/v1",
        "https://ollama.com.attacker.test/v1",
        "https://attacker.test/v1",
        "http://127.0.0.1:11434/v1",
    ],
)
def test_ollama_cloud_auxiliary_rejects_explicit_untrusted_endpoint(
    monkeypatch, base_url
):
    from cli import auth
    from runtime import auxiliary_client

    monkeypatch.setattr(
        auth,
        "resolve_api_key_provider_credentials",
        lambda provider: {
            "provider": provider,
            "api_key": "cloud-test-credential",
            "base_url": "https://ollama.com/v1",
        },
    )
    client_constructions = []
    monkeypatch.setattr(
        auxiliary_client,
        "OpenAI",
        lambda **kwargs: client_constructions.append(kwargs),
    )

    with pytest.raises(auth.AuthError) as exc:
        auxiliary_client.resolve_provider_client(
            "ollama-cloud",
            model="deepseek-v4.1-flash",
            explicit_base_url=base_url,
        )

    assert exc.value.code == "invalid_ollama_cloud_base_url"
    assert client_constructions == []


def test_ollama_cloud_auxiliary_accepts_official_endpoint(monkeypatch):
    from cli import auth
    from runtime import auxiliary_client

    monkeypatch.setattr(
        auth,
        "resolve_api_key_provider_credentials",
        lambda provider: {
            "provider": provider,
            "api_key": "cloud-test-credential",
            "base_url": "https://ollama.com/v1",
        },
    )
    client = SimpleNamespace(base_url="https://api.ollama.com/v1", api_key="test-only")
    constructions = []

    def make_client(**kwargs):
        constructions.append(kwargs)
        return client

    monkeypatch.setattr(auxiliary_client, "OpenAI", make_client)

    resolved_client, model = auxiliary_client.resolve_provider_client(
        "ollama-cloud",
        model="deepseek-v4.1-flash",
        explicit_base_url="https://api.ollama.com/v1",
    )

    assert resolved_client is client
    assert model == "deepseek-v4.1-flash"
    assert constructions[0]["base_url"] == "https://api.ollama.com/v1"


def test_custom_local_ollama_endpoint_remains_supported(monkeypatch):
    from runtime import auxiliary_client

    client = SimpleNamespace(base_url="http://127.0.0.1:11434/v1", api_key="local-test-only")
    monkeypatch.setattr(auxiliary_client, "OpenAI", lambda **_kwargs: client)

    resolved_client, model = auxiliary_client.resolve_provider_client(
        "custom",
        model="qwen3:4b",
        explicit_base_url="http://127.0.0.1:11434/v1",
        explicit_api_key="local-test-only",
    )

    assert resolved_client is client
    assert model == "qwen3:4b"

