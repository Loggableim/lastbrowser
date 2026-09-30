from __future__ import annotations

from runtime.think_scrubber import StreamingThinkScrubber
from run_agent import AIAgent


def test_embedded_think_chunks_are_routed_live_and_removed_from_answer():
    reasoning: list[str] = []
    visible: list[str] = []
    scrubber = StreamingThinkScrubber(reasoning.append)

    for delta in ("The answer is 42.\n<th", "ink>checking", " the math", "</think>Done."):
        visible.append(scrubber.feed(delta))

    assert "".join(visible) == "The answer is 42.\nDone."
    assert "".join(reasoning) == "checking the math"


def test_inline_closed_think_pair_routes_payload_and_preserves_surrounding_text():
    reasoning: list[str] = []
    scrubber = StreamingThinkScrubber(reasoning.append)

    result = scrubber.feed("Before<think>private thought</think>after")

    assert result == "Beforeafter"
    assert reasoning == ["private thought"]


def test_non_thinking_prose_is_not_sent_to_reasoning_callback():
    reasoning: list[str] = []
    scrubber = StreamingThinkScrubber(reasoning.append)

    result = scrubber.feed("Use the word thinking in this ordinary answer.")

    assert result == "Use the word thinking in this ordinary answer."
    assert reasoning == []


def test_unclosed_think_block_never_leaks_to_visible_answer():
    reasoning: list[str] = []
    scrubber = StreamingThinkScrubber(reasoning.append)

    assert scrubber.feed("<think>partial private thought") == ""
    assert scrubber.flush() == ""
    assert "".join(reasoning) == "partial private thought"


def test_agent_stream_path_delivers_embedded_thinking_separately():
    reasoning: list[str] = []
    visible: list[str] = []
    agent = object.__new__(AIAgent)
    agent.reasoning_callback = reasoning.append
    agent.stream_delta_callback = visible.append
    agent._stream_callback = None
    agent._stream_needs_break = False
    agent._current_streamed_assistant_text = ""
    agent._stream_context_scrubber = type("Identity", (), {"feed": staticmethod(lambda text: text)})()
    agent._stream_think_scrubber = StreamingThinkScrubber(agent._fire_reasoning_delta)

    for delta in ("<think>", "step one", " step two", "</think>Answer"):
        agent._fire_stream_delta(delta)

    assert "".join(visible) == "Answer"
    assert "".join(reasoning) == "step one step two"
