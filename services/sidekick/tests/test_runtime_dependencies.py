"""Packaging contracts for dependencies used by the chat runtime."""

from __future__ import annotations

import tomllib
from pathlib import Path


def test_openai_sdk_is_installed_by_the_base_sidekick_package() -> None:
    """The default chat path uses OpenAI-compatible clients, including Ollama.

    Keep this in the base dependencies: desktop installs the Sidekick package
    without the optional ``all`` extra, and Ollama/other OpenAI-compatible
    providers still construct ``openai.OpenAI`` clients.
    """
    pyproject = Path(__file__).resolve().parents[1] / "pyproject.toml"
    with pyproject.open("rb") as stream:
        project = tomllib.load(stream)["project"]

    dependencies = [item.lower() for item in project["dependencies"]]
    assert any(item.startswith("openai>=") for item in dependencies)


def test_chat_runtime_can_issue_mocked_openai_compatible_chat_request() -> None:
    """Exercise lazy SDK loading and a chat request without remote traffic."""
    import sys

    sidekick_root = Path(__file__).resolve().parents[1]
    if str(sidekick_root) not in sys.path:
        sys.path.insert(0, str(sidekick_root))

    from run_agent import AIAgent
    from httpx import Client, MockTransport, Response

    requests = []

    def respond(request):
        requests.append(request)
        return Response(
            200,
            json={
                "id": "chatcmpl-local-test",
                "object": "chat.completion",
                "created": 1,
                "model": "qwen3:4b",
                "choices": [{"index": 0, "message": {"role": "assistant", "content": "local fake"}, "finish_reason": "stop"}],
            },
        )

    http_client = Client(transport=MockTransport(respond))
    agent = object.__new__(AIAgent)
    agent.provider = "ollama"
    agent.model = "qwen3:4b"
    agent.base_url = "http://ollama.test/v1"
    agent._build_keepalive_http_client = lambda _base_url="": http_client
    try:
        client = agent._create_openai_client(
            {"api_key": "test-only", "base_url": "http://ollama.test/v1"},
            reason="runtime_dependency_test",
            shared=False,
        )
        result = client.chat.completions.create(
            model="qwen3:4b",
            messages=[{"role": "user", "content": "hello"}],
        )
        assert result.choices[0].message.content == "local fake"
        assert len(requests) == 1
        assert requests[0].url.path == "/v1/chat/completions"
        assert requests[0].headers["authorization"] == "Bearer test-only"
    finally:
        http_client.close()


def test_ollama_provider_resolution_uses_local_endpoint_and_scoped_key(monkeypatch) -> None:
    import sys

    sidekick_root = Path(__file__).resolve().parents[1]
    if str(sidekick_root) not in sys.path:
        sys.path.insert(0, str(sidekick_root))

    from cli import runtime_provider

    model_config = {
        "provider": "ollama",
        "default": "qwen3:4b",
        "base_url": "http://127.0.0.1:11434",
    }
    monkeypatch.setattr(runtime_provider, "_get_model_config", lambda: dict(model_config))
    monkeypatch.setattr(
        runtime_provider,
        "load_config",
        lambda: {"model": dict(model_config), "providers": {"ollama": {"api_key": "local-test-only"}}},
    )
    for variable in ("OPENAI_API_KEY", "OPENROUTER_API_KEY", "CUSTOM_BASE_URL", "OPENROUTER_BASE_URL"):
        monkeypatch.delenv(variable, raising=False)
    monkeypatch.setenv("OLLAMA_API_KEY", "cloud-test-only")
    monkeypatch.delenv("OLLAMA_BASE_URL", raising=False)

    runtime = runtime_provider.resolve_runtime_provider(requested="ollama")

    assert runtime["provider"] == "custom"
    assert runtime["base_url"] == "http://127.0.0.1:11434/v1"
    assert runtime["api_key"] == "local-test-only"


def test_keyless_ollama_does_not_receive_cloud_or_generic_provider_keys(monkeypatch) -> None:
    import sys

    sidekick_root = Path(__file__).resolve().parents[1]
    if str(sidekick_root) not in sys.path:
        sys.path.insert(0, str(sidekick_root))

    from cli import runtime_provider

    model_config = {
        "provider": "ollama",
        "default": "qwen3:4b",
        "base_url": "http://127.0.0.1:11434/v1",
    }
    monkeypatch.setattr(runtime_provider, "_get_model_config", lambda: dict(model_config))
    monkeypatch.setattr(runtime_provider, "load_config", lambda: {"model": dict(model_config)})
    monkeypatch.setenv("OLLAMA_API_KEY", "cloud-test-only")
    monkeypatch.setenv("OPENAI_API_KEY", "openai-test-only")
    monkeypatch.setenv("OPENROUTER_API_KEY", "openrouter-test-only")
    monkeypatch.delenv("CUSTOM_BASE_URL", raising=False)
    monkeypatch.delenv("OPENROUTER_BASE_URL", raising=False)

    runtime = runtime_provider.resolve_runtime_provider(requested="ollama")

    assert runtime["provider"] == "custom"
    assert runtime["base_url"] == "http://127.0.0.1:11434/v1"
    assert runtime["api_key"] == "no-key-required"
