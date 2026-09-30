"""Regression coverage for safe Teamwork provider failover."""
import logging
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from runtime.teamwork_orchestrator import _invoke_worker, run_teamwork_turn


class ProviderError(RuntimeError):
    def __init__(
        self,
        status_code: int,
        message: str = "https://provider.invalid/path?key=do-not-leak sensitive-body-fragment",
    ):
        super().__init__(message)
        self.status_code = status_code


def _worker(model: str, provider: str, *, call_model: str | None = None) -> dict:
    return {
        "id": model,
        "model": model,
        "call_model": call_model or model,
        "provider": provider,
        "name": model,
        "role": "Pragmatiker",
        "focus": "direct answer",
    }


@pytest.mark.parametrize("status_code", [401, 429])
def test_worker_does_not_hot_swap_after_auth_or_quota_failure(status_code):
    primary = _worker("@ollama-cloud:deepseek-v4.1-flash", "ollama-cloud", call_model="deepseek-v4.1-flash")
    backup = _worker("@openrouter:paid-model", "openrouter", call_model="paid-model")
    calls = []

    def fail_primary(*, provider, model, **_kwargs):
        calls.append((provider, model))
        raise ProviderError(status_code)

    with patch("runtime.auxiliary_client.call_llm", side_effect=fail_primary):
        result = _invoke_worker(primary, "Do the work", "", [primary, backup])

    assert calls == [("ollama-cloud", "deepseek-v4.1-flash")]
    assert result["http_status"] == status_code
    assert result["error"] == (
        "HTTP 401: authentication failed" if status_code == 401
        else "HTTP 429: rate limit or quota reached"
    )
    assert "provider.invalid" not in result["error"]
    assert result["swapped"] is False


def test_worker_still_hot_swaps_after_transient_provider_failure():
    primary = _worker("@ollama-cloud:deepseek-v4.1-flash", "ollama-cloud", call_model="deepseek-v4.1-flash")
    backup = _worker("@openrouter:backup", "openrouter", call_model="backup")
    calls = []
    response = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="backup answer"))])

    def fail_then_succeed(*, provider, model, **_kwargs):
        calls.append((provider, model))
        if len(calls) == 1:
            raise ProviderError(503, "temporary upstream failure")
        return response

    with patch("runtime.auxiliary_client.call_llm", side_effect=fail_then_succeed), \
         patch("runtime.auxiliary_client.extract_content_or_reasoning", return_value="backup answer"):
        result = _invoke_worker(primary, "Do the work", "", [primary, backup])

    assert calls == [
        ("ollama-cloud", "deepseek-v4.1-flash"),
        ("openrouter", "backup"),
    ]
    assert result["content"] == "backup answer"
    assert result["model"] == "@openrouter:backup"
    assert result["swapped"] is True


@pytest.mark.parametrize("status_code", [401, 429])
def test_teamwork_emits_sanitized_auth_and_quota_failures_without_cross_provider_call(status_code):
    primary = _worker("@ollama-cloud:deepseek-v4.1-flash", "ollama-cloud", call_model="deepseek-v4.1-flash")
    backup = _worker("@openrouter:paid-model", "openrouter", call_model="paid-model")
    plan = {
        "strategy": "balanced",
        "planner": None,
        "workers": [primary],
        "critic": backup["model"],
        "critic_provider": backup["provider"],
        "synthesizer": backup["model"],
        "synthesizer_provider": backup["provider"],
        "pool": [primary, backup],
    }
    calls = []
    events = []

    def fail_provider(*, provider, model, **_kwargs):
        calls.append((provider, model))
        raise ProviderError(status_code)

    with patch("runtime.teamwork_orchestrator.resolve_team_plan", return_value=plan), \
         patch("runtime.auxiliary_client.call_llm", side_effect=fail_provider):
        with pytest.raises(RuntimeError, match=f"HTTP {status_code}"):
            run_teamwork_turn(
                MagicMock(messages=[]),
                "Answer using the configured provider.",
                config={"shared_grounding": False, "hot_swap": {"enabled": True, "fallback_quorum_min": 1}},
                stream_put=lambda event, data: events.append((event, data)),
            )

    assert calls == [("ollama-cloud", "deepseek-v4.1-flash")]
    draft_errors = [data["error"] for event, data in events if event == "teamwork_draft"]
    assert draft_errors == [f"HTTP {status_code}"]
    assert "provider.invalid" not in repr(events)
    assert "paid-model" not in repr(calls)


def _pipeline_plan(*, planner=None, workers=None, pool=None):
    default_worker = _worker("@ollama-cloud:deepseek-v4.1-flash", "ollama-cloud", call_model="deepseek-v4.1-flash")
    workers = workers or [default_worker]
    pool = pool or workers
    reviewer = pool[-1]
    return {
        "strategy": "balanced",
        "planner": planner,
        "workers": workers,
        "critic": reviewer["id"],
        "critic_provider": reviewer["provider"],
        "synthesizer": reviewer["id"],
        "synthesizer_provider": reviewer["provider"],
        "pool": pool,
    }


def _ok_response(content: str):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


def _fake_stream(*, on_content, **_kwargs):
    on_content("final answer")
    return "final answer"


def test_worker_failure_metadata_is_sanitized_while_another_draft_succeeds(caplog):
    failed = _worker("@ollama-cloud:deepseek-v4.1-flash", "ollama-cloud", call_model="deepseek-v4.1-flash")
    successful = _worker("@anthropic:backup", "anthropic", call_model="backup")
    paid_backup = _worker("@openrouter:paid-model", "openrouter", call_model="paid-model")
    plan = _pipeline_plan(workers=[failed, successful], pool=[failed, paid_backup, successful])
    events = []
    calls = []

    def call_model(*, provider, model, **_kwargs):
        calls.append((provider, model))
        if provider == "ollama-cloud":
            raise ProviderError(429)
        return _ok_response("successful worker or critic")

    with patch("runtime.teamwork_orchestrator.resolve_team_plan", return_value=plan), \
         patch("runtime.auxiliary_client.call_llm", side_effect=call_model), \
         patch("runtime.auxiliary_client.extract_content_or_reasoning", side_effect=lambda response: response.choices[0].message.content), \
         patch("runtime.auxiliary_client.stream_llm", side_effect=_fake_stream):
        result = run_teamwork_turn(
            MagicMock(messages=[]),
            "Complete the task.",
            config={"shared_grounding": False, "hot_swap": {"enabled": True, "fallback_quorum_min": 1}},
            stream_put=lambda event, data: events.append((event, data)),
        )

    failed_draft = next(draft for draft in result["metadata"]["drafts"] if draft["model"] == failed["model"])
    assert failed_draft["error"] == "HTTP 429: rate limit or quota reached"
    assert "provider.invalid" not in repr(result)
    assert "sensitive-body-fragment" not in repr(events)
    assert not any(provider == "openrouter" for provider, _model in calls)
    assert "provider.invalid" not in caplog.text


@pytest.mark.parametrize("status_code", [401, 429])
def test_critic_failure_review_is_actionable_and_sanitized(status_code, caplog):
    worker = _worker("@ollama-cloud:deepseek-v4.1-flash", "ollama-cloud", call_model="deepseek-v4.1-flash")
    plan = _pipeline_plan(workers=[worker], pool=[worker])
    call_count = 0

    def call_model(**_kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 2:  # worker draft succeeds; the next call is the critic.
            raise ProviderError(status_code)
        return _ok_response("good draft")

    with patch("runtime.teamwork_orchestrator.resolve_team_plan", return_value=plan), \
         patch("runtime.auxiliary_client.call_llm", side_effect=call_model), \
         patch("runtime.auxiliary_client.extract_content_or_reasoning", side_effect=lambda response: response.choices[0].message.content), \
         patch("runtime.auxiliary_client.stream_llm", side_effect=_fake_stream):
        result = run_teamwork_turn(
            MagicMock(messages=[]),
            "Complete the task.",
            config={"shared_grounding": False, "hot_swap": {"enabled": True, "fallback_quorum_min": 1}},
        )

    review = result["metadata"]["critic"]["review"]
    assert f"HTTP {status_code}" in review
    assert "provider.invalid" not in review
    assert "sensitive-body-fragment" not in repr(result["metadata"])
    assert "provider.invalid" not in caplog.text


def test_planner_failure_is_logged_without_provider_payload(caplog):
    caplog.set_level(logging.WARNING, logger="sidekick.teamwork")
    planner = _worker("@ollama-cloud:deepseek-v4.1-flash", "ollama-cloud", call_model="deepseek-v4.1-flash")
    worker = _worker("@anthropic:worker", "anthropic", call_model="worker")
    plan = _pipeline_plan(planner=planner, workers=[worker], pool=[planner, worker])
    calls = []

    def call_model(*, messages, **_kwargs):
        calls.append(messages)
        if len(calls) == 1:
            raise ProviderError(401)
        return _ok_response("worker or critic result")

    with patch("runtime.teamwork_orchestrator.resolve_team_plan", return_value=plan), \
         patch("runtime.auxiliary_client.call_llm", side_effect=call_model), \
         patch("runtime.auxiliary_client.extract_content_or_reasoning", side_effect=lambda response: response.choices[0].message.content), \
         patch("runtime.auxiliary_client.stream_llm", side_effect=_fake_stream):
        result = run_teamwork_turn(
            MagicMock(messages=[]),
            "Complete the task.",
            config={"shared_grounding": False, "hot_swap": {"enabled": True, "fallback_quorum_min": 1}},
        )

    assert result["content"] == "final answer"
    assert result["metadata"]["planner_failure"] == "HTTP 401: authentication failed"
    assert "provider.invalid" not in repr(result)
    assert "sensitive-body-fragment" not in caplog.text
    assert "authentication failed" in caplog.text


@pytest.mark.parametrize("partial_output", [False, True])
def test_synthesis_failures_never_expose_provider_payload(partial_output, caplog):
    worker = _worker("@ollama-cloud:deepseek-v4.1-flash", "ollama-cloud", call_model="deepseek-v4.1-flash")
    plan = _pipeline_plan(workers=[worker], pool=[worker])
    events = []

    def fail_stream(*, on_content, **_kwargs):
        if partial_output:
            on_content("partial draft")
        raise ProviderError(429)

    with patch("runtime.teamwork_orchestrator.resolve_team_plan", return_value=plan), \
         patch("runtime.auxiliary_client.call_llm", return_value=_ok_response("worker draft")), \
         patch("runtime.auxiliary_client.extract_content_or_reasoning", return_value="worker draft"), \
         patch("runtime.auxiliary_client.stream_llm", side_effect=fail_stream):
        if partial_output:
            with pytest.raises(RuntimeError, match="HTTP 429") as raised:
                run_teamwork_turn(
                    MagicMock(messages=[]),
                    "Complete the task.",
                    config={"shared_grounding": False, "hot_swap": {"enabled": True, "fallback_quorum_min": 1}},
                    stream_put=lambda event, data: events.append((event, data)),
                )
            assert raised.value.__cause__ is None
            assert "provider.invalid" not in str(raised.value)
        else:
            result = run_teamwork_turn(
                MagicMock(messages=[]),
                "Complete the task.",
                config={"shared_grounding": False, "hot_swap": {"enabled": True, "fallback_quorum_min": 1}},
                stream_put=lambda event, data: events.append((event, data)),
            )
            assert result["content"] == "worker draft"
            assert result["metadata"]["synthesis_failure"] == "HTTP 429: rate limit or quota reached"

    assert "provider.invalid" not in repr(events)
    assert "sensitive-body-fragment" not in caplog.text
