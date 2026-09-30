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
