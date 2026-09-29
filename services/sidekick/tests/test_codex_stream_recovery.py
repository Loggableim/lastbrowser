"""Hermetic regressions for empty Codex Responses stream final payloads."""

from __future__ import annotations

import importlib.util
import sys
from types import SimpleNamespace
from pathlib import Path


class _FakeStream:
    def __init__(self, events, final_response):
        self._events = events
        self._final_response = final_response

    def __iter__(self):
        return iter(self._events)

    def get_final_response(self):
        return self._final_response


class _FakeStreamContext:
    def __init__(self, events, final_response):
        self._stream = _FakeStream(events, final_response)

    def __enter__(self):
        return self._stream

    def __exit__(self, *_exc_info):
        return False


class _FakeResponses:
    def __init__(self, events, final_response):
        self._events = events
        self._final_response = final_response

    def stream(self, **_kwargs):
        return _FakeStreamContext(self._events, self._final_response)


class _FakeClient:
    def __init__(self, events, final_response):
        self.responses = _FakeResponses(events, final_response)


def _run_codex_stream(events, final_response):
    # Other suites sometimes leave a compatibility/legacy module named
    # ``run_agent`` in sys.modules. Load this repository's implementation by
    # path under a private name so the test always exercises the in-tree code.
    sidekick_root = Path(__file__).resolve().parents[1]
    if str(sidekick_root) not in sys.path:
        sys.path.insert(0, str(sidekick_root))
    module_name = "_lastbrowser_sidekick_run_agent_codex_stream_test"
    agent_module = sys.modules.get(module_name)
    if agent_module is None:
        spec = importlib.util.spec_from_file_location(module_name, sidekick_root / "run_agent.py")
        assert spec is not None and spec.loader is not None
        agent_module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = agent_module
        spec.loader.exec_module(agent_module)
    AIAgent = agent_module.AIAgent

    agent = object.__new__(AIAgent)
    agent._interrupt_requested = False
    agent._touch_activity = lambda *_args: None
    agent._fire_stream_delta = lambda *_args: None
    agent._fire_reasoning_delta = lambda *_args: None
    agent._client_log_context = lambda: "hermetic-codex-stream-test"
    return agent._run_codex_stream(
        {"model": "gpt-test", "input": []},
        client=_FakeClient(events, final_response),
    )


def _assistant_item(text: str):
    return SimpleNamespace(
        type="message",
        role="assistant",
        status="completed",
        content=[SimpleNamespace(type="output_text", text=text)],
    )


def _output_text(response) -> str:
    return "".join(
        part.text
        for item in response.output
        for part in getattr(item, "content", [])
        if getattr(part, "type", None) in {"output_text", "text"}
    )


def test_codex_stream_backfills_completed_output_item_when_final_output_is_empty():
    completed_item = _assistant_item("recovered item text")
    response = _run_codex_stream(
        [SimpleNamespace(type="response.output_item.done", item=completed_item)],
        SimpleNamespace(output=[]),
    )

    assert response.output == [completed_item]
    assert _output_text(response) == "recovered item text"


def test_codex_stream_synthesizes_assistant_output_from_text_deltas():
    response = _run_codex_stream(
        [SimpleNamespace(type="response.output_text.delta", delta="recovered "),
         SimpleNamespace(type="response.output_text.delta", delta="delta text")],
        SimpleNamespace(output=[]),
    )

    assert len(response.output) == 1
    assert response.output[0].type == "message"
    assert response.output[0].role == "assistant"
    assert _output_text(response) == "recovered delta text"


def test_codex_stream_preserves_nonempty_final_output():
    final_item = _assistant_item("authoritative final text")
    response = _run_codex_stream(
        [SimpleNamespace(type="response.output_text.delta", delta="streamed text")],
        SimpleNamespace(output=[final_item]),
    )

    assert response.output == [final_item]
    assert _output_text(response) == "authoritative final text"
