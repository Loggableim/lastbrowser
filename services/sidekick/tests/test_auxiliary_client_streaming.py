import threading
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from runtime import auxiliary_client


class _FakeStream:
    def __init__(self, chunks):
        self.chunks = chunks
        self.closed = False

    def __iter__(self):
        return iter(self.chunks)

    def close(self):
        self.closed = True


class _FailAfterChunkStream(_FakeStream):
    def __iter__(self):
        yield self.chunks[0]
        raise _TransientProviderError("temporary upstream failure", status_code=503)


class _TransientProviderError(Exception):
    def __init__(self, message, *, status_code):
        super().__init__(message)
        self.status_code = status_code


def _chunk(content=None, **delta_fields):
    delta = SimpleNamespace(content=content, **delta_fields)
    return SimpleNamespace(
        choices=[SimpleNamespace(delta=delta)],
        usage=None,
    )


def _fake_client(stream):
    completions = SimpleNamespace(create=lambda **kwargs: stream)
    return SimpleNamespace(
        chat=SimpleNamespace(completions=completions),
        base_url="https://ollama.com/v1",
    )


def _patch_provider(monkeypatch, stream):
    client = _fake_client(stream)
    monkeypatch.setattr(
        auxiliary_client,
        "_resolve_task_provider_model",
        lambda *args: ("ollama-cloud", "deepseek-v4.1-flash", None, None, None),
    )
    monkeypatch.setattr(auxiliary_client, "_get_cached_client", lambda *args, **kwargs: (client, "deepseek-v4.1-flash"))
    monkeypatch.setattr(auxiliary_client, "_raise_if_game_mode_blocks_local_request", lambda *args: None)
    monkeypatch.setattr(auxiliary_client, "_record_completion_metadata", lambda *args, **kwargs: None)
    return client


def test_stream_llm_emits_content_and_reasoning_as_separate_deltas(monkeypatch):
    stream = _FakeStream([
        _chunk("The answer "),
        _chunk("is 42.", reasoning_content="checking the result"),
    ])
    client = _patch_provider(monkeypatch, stream)
    content = []
    reasoning = []

    answer = auxiliary_client.stream_llm(
        provider="ollama-cloud",
        model="deepseek-v4.1-flash",
        messages=[{"role": "user", "content": "Compute 6 times 7"}],
        on_content=content.append,
        on_reasoning=reasoning.append,
    )

    assert answer == "The answer is 42."
    assert content == ["The answer ", "is 42."]
    assert reasoning == ["checking the result"]
    assert stream.closed is True


def test_stream_llm_routes_think_tags_to_reasoning_without_leaking(monkeypatch):
    stream = _FakeStream([
        _chunk("<think>private "),
        _chunk("analysis</think>Visible answer"),
    ])
    _patch_provider(monkeypatch, stream)
    content = []
    reasoning = []

    answer = auxiliary_client.stream_llm(
        provider="ollama-cloud",
        model="deepseek-v4.1-flash",
        messages=[{"role": "user", "content": "Answer"}],
        on_content=content.append,
        on_reasoning=reasoning.append,
    )

    assert answer == "Visible answer"
    assert "".join(content) == answer
    assert "".join(reasoning) == "private analysis"


def test_stream_llm_stops_and_closes_on_cancellation(monkeypatch):
    stream = _FakeStream([_chunk("partial"), _chunk("must not be emitted")])
    _patch_provider(monkeypatch, stream)
    cancel_event = threading.Event()
    content = []

    def emit(text):
        content.append(text)
        cancel_event.set()

    with pytest.raises(InterruptedError, match="cancelled"):
        auxiliary_client.stream_llm(
            provider="ollama-cloud",
            model="deepseek-v4.1-flash",
            messages=[{"role": "user", "content": "Answer"}],
            on_content=emit,
            cancel_event=cancel_event,
        )

    assert content == ["partial"]
    assert stream.closed is True


def _client_with_create(create):
    return SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create)),
        base_url="https://ollama.com/v1",
    )


def test_teamwork_stream_retries_transient_failure_before_first_output(monkeypatch):
    first_client = _client_with_create(
        lambda **_kwargs: (_ for _ in ()).throw(
            _TransientProviderError("upstream unavailable", status_code=503)
        )
    )
    second_stream = _FakeStream([_chunk("recovered")])
    second_client = _client_with_create(lambda **_kwargs: second_stream)
    clients = iter([first_client, second_client])
    evicted = []
    monkeypatch.setattr(
        auxiliary_client,
        "_resolve_task_provider_model",
        lambda *args: ("ollama-cloud", "deepseek-v4.1-flash", None, None, None),
    )
    monkeypatch.setattr(
        auxiliary_client,
        "_get_cached_client",
        lambda *args, **kwargs: (next(clients), "deepseek-v4.1-flash"),
    )
    monkeypatch.setattr(auxiliary_client, "_evict_cached_client_instance", lambda client: evicted.append(client) or True)
    monkeypatch.setattr(auxiliary_client, "_raise_if_game_mode_blocks_local_request", lambda *args: None)
    monkeypatch.setattr(auxiliary_client, "_record_completion_metadata", lambda *args, **kwargs: None)
    content = []

    answer = auxiliary_client.stream_llm(
        provider="ollama-cloud",
        model="deepseek-v4.1-flash",
        messages=[{"role": "user", "content": "Answer"}],
        on_content=content.append,
        retry_transient_before_first_token=True,
    )

    assert answer == "recovered"
    assert content == ["recovered"]
    assert evicted == [first_client]
    assert second_stream.closed is True


def test_teamwork_stream_cancellation_between_attempts_prevents_retry(monkeypatch):
    cancel_event = threading.Event()
    first_client = _client_with_create(
        lambda **_kwargs: (_ for _ in ()).throw(
            _TransientProviderError("upstream unavailable", status_code=503)
        )
    )
    client_calls = []

    def get_client(*_args, **_kwargs):
        client_calls.append(True)
        return first_client, "deepseek-v4.1-flash"

    def evict(_client):
        cancel_event.set()
        return True

    monkeypatch.setattr(
        auxiliary_client,
        "_resolve_task_provider_model",
        lambda *args: ("ollama-cloud", "deepseek-v4.1-flash", None, None, None),
    )
    monkeypatch.setattr(auxiliary_client, "_get_cached_client", get_client)
    monkeypatch.setattr(auxiliary_client, "_evict_cached_client_instance", evict)
    monkeypatch.setattr(auxiliary_client, "_raise_if_game_mode_blocks_local_request", lambda *args: None)
    monkeypatch.setattr(auxiliary_client, "_record_completion_metadata", lambda *args, **kwargs: None)

    with pytest.raises(InterruptedError, match="cancelled"):
        auxiliary_client.stream_llm(
            provider="ollama-cloud",
            model="deepseek-v4.1-flash",
            messages=[{"role": "user", "content": "Answer"}],
            on_content=lambda _text: None,
            cancel_event=cancel_event,
            retry_transient_before_first_token=True,
        )

    assert len(client_calls) == 1


def test_teamwork_stream_does_not_retry_after_visible_output(monkeypatch):
    stream = _FailAfterChunkStream([_chunk("partial")])
    create_calls = []

    def create(**_kwargs):
        create_calls.append(True)
        return stream

    client = _client_with_create(create)
    monkeypatch.setattr(
        auxiliary_client,
        "_resolve_task_provider_model",
        lambda *args: ("ollama-cloud", "deepseek-v4.1-flash", None, None, None),
    )
    monkeypatch.setattr(auxiliary_client, "_get_cached_client", lambda *args, **kwargs: (client, "deepseek-v4.1-flash"))
    monkeypatch.setattr(auxiliary_client, "_evict_cached_client_instance", lambda _client: pytest.fail("must not evict/retry after output"))
    monkeypatch.setattr(auxiliary_client, "_raise_if_game_mode_blocks_local_request", lambda *args: None)
    monkeypatch.setattr(auxiliary_client, "_record_completion_metadata", lambda *args, **kwargs: None)
    content = []

    with pytest.raises(_TransientProviderError):
        auxiliary_client.stream_llm(
            provider="ollama-cloud",
            model="deepseek-v4.1-flash",
            messages=[{"role": "user", "content": "Answer"}],
            on_content=content.append,
            retry_transient_before_first_token=True,
        )

    assert content == ["partial"]
    assert len(create_calls) == 1
    assert stream.closed is True


def test_teamwork_stream_does_not_retry_after_thinking_output(monkeypatch):
    stream = _FailAfterChunkStream([_chunk(reasoning_content="private reasoning")])
    create_calls = []
    client = _client_with_create(lambda **_kwargs: create_calls.append(True) or stream)
    monkeypatch.setattr(
        auxiliary_client,
        "_resolve_task_provider_model",
        lambda *args: ("ollama-cloud", "deepseek-v4.1-flash", None, None, None),
    )
    monkeypatch.setattr(auxiliary_client, "_get_cached_client", lambda *args, **kwargs: (client, "deepseek-v4.1-flash"))
    monkeypatch.setattr(auxiliary_client, "_evict_cached_client_instance", lambda _client: pytest.fail("must not retry after thinking output"))
    monkeypatch.setattr(auxiliary_client, "_raise_if_game_mode_blocks_local_request", lambda *args: None)
    monkeypatch.setattr(auxiliary_client, "_record_completion_metadata", lambda *args, **kwargs: None)
    reasoning = []

    with pytest.raises(_TransientProviderError):
        auxiliary_client.stream_llm(
            provider="ollama-cloud",
            model="deepseek-v4.1-flash",
            messages=[{"role": "user", "content": "Answer"}],
            on_content=lambda _text: None,
            on_reasoning=reasoning.append,
            retry_transient_before_first_token=True,
        )

    assert reasoning == ["private reasoning"]
    assert len(create_calls) == 1
    assert stream.closed is True


def test_teamwork_stream_does_not_retry_rate_limit_before_output(monkeypatch):
    rate_limit = _TransientProviderError("rate limit", status_code=429)
    create_calls = []
    client = _client_with_create(
        lambda **_kwargs: create_calls.append(True) or (_ for _ in ()).throw(rate_limit)
    )
    monkeypatch.setattr(
        auxiliary_client,
        "_resolve_task_provider_model",
        lambda *args: ("ollama-cloud", "deepseek-v4.1-flash", None, None, None),
    )
    monkeypatch.setattr(auxiliary_client, "_get_cached_client", lambda *args, **kwargs: (client, "deepseek-v4.1-flash"))
    monkeypatch.setattr(auxiliary_client, "_evict_cached_client_instance", lambda _client: pytest.fail("429 must not retry"))
    monkeypatch.setattr(auxiliary_client, "_raise_if_game_mode_blocks_local_request", lambda *args: None)

    with pytest.raises(_TransientProviderError, match="rate limit"):
        auxiliary_client.stream_llm(
            provider="ollama-cloud",
            model="deepseek-v4.1-flash",
            messages=[{"role": "user", "content": "Answer"}],
            on_content=lambda _text: None,
            retry_transient_before_first_token=True,
        )

    assert len(create_calls) == 1
