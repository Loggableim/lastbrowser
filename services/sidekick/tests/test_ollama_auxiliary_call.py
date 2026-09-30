"""Ollama Cloud auxiliary request contract without network access."""

from types import SimpleNamespace


def test_ollama_cloud_client_uses_deepseek_flash_when_model_is_omitted(monkeypatch):
    from cli import auth
    from runtime import auxiliary_client

    client = SimpleNamespace(base_url="https://ollama.com/v1")
    captured = {}
    monkeypatch.setattr(
        auth,
        "resolve_api_key_provider_credentials",
        lambda _provider: {
            "api_key": "ollama-runtime-test-credential",
            "base_url": "https://ollama.com/v1",
        },
    )
    monkeypatch.setattr(
        auxiliary_client,
        "OpenAI",
        lambda **kwargs: captured.update(kwargs) or client,
    )

    resolved_client, model = auxiliary_client.resolve_provider_client("ollama-cloud")

    assert resolved_client is client
    assert model == "deepseek-v4.1-flash"
    assert captured["base_url"] == "https://ollama.com/v1"
    assert captured["api_key"] == "ollama-runtime-test-credential"


def test_ollama_cloud_call_preserves_response_reasoning_and_tool_contract(monkeypatch):
    from runtime import auxiliary_client

    tool = {
        "type": "function",
        "function": {
            "name": "lookup",
            "description": "Look up a value",
            "parameters": {"type": "object", "properties": {}},
        },
    }
    tool_call = SimpleNamespace(
        id="call-test",
        type="function",
        function=SimpleNamespace(name="lookup", arguments="{}"),
    )
    response = SimpleNamespace(
        choices=[SimpleNamespace(
            message=SimpleNamespace(
                content="Found it.",
                reasoning_content="I checked the available source.",
                tool_calls=[tool_call],
            ),
        )],
        usage=None,
    )
    captured = {}
    client = SimpleNamespace(
        base_url="https://ollama.com/v1",
        chat=SimpleNamespace(
            completions=SimpleNamespace(
                create=lambda **kwargs: captured.update(kwargs) or response,
            ),
        ),
    )

    monkeypatch.setattr(
        auxiliary_client,
        "_get_cached_client",
        lambda *args, **kwargs: (client, "deepseek-v4.1-flash"),
    )
    monkeypatch.setattr(auxiliary_client, "_raise_if_game_mode_blocks_local_request", lambda *_args: None)
    monkeypatch.setattr(auxiliary_client, "_get_task_extra_body", lambda _task: {})
    monkeypatch.setattr(auxiliary_client, "_get_task_timeout", lambda _task: 30.0)
    monkeypatch.setattr(auxiliary_client, "_record_completion_metadata", lambda *_args, **_kwargs: None)

    result = auxiliary_client.call_llm(
        provider="ollama-cloud",
        model="deepseek-v4.1-flash",
        messages=[{"role": "user", "content": "Find the value"}],
        tools=[tool],
        temperature=0.2,
        max_tokens=128,
        extra_body={"think": True},
    )

    assert result is response
    assert captured["model"] == "deepseek-v4.1-flash"
    assert captured["tools"] == [tool]
    assert captured["extra_body"] == {"think": True}
    assert captured["max_tokens"] == 128
    assert response.choices[0].message.content == "Found it."
    assert response.choices[0].message.reasoning_content == "I checked the available source."
    assert response.choices[0].message.tool_calls[0].function.name == "lookup"
