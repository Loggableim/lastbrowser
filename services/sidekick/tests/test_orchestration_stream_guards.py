from __future__ import annotations

from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import Mock

import pytest


@pytest.mark.parametrize(
    ("model", "mode", "expected"),
    [
        ("teamwork", "", "teamwork"),
        ("default-model", "teamwork", "teamwork"),
        ("smart-track-low", "", "smart-track"),
        ("default-model", "smart-track", "smart-track"),
        ("ollama:qwen3", "", None),
        ("openai/gpt", "", None),
    ],
)
def test_requested_orchestration_mode_leaves_normal_models_untouched(model, mode, expected):
    from web.api.streaming import _requested_orchestration_mode

    assert _requested_orchestration_mode(model, mode) == expected


@pytest.mark.parametrize("orchestration", ["teamwork", "smart-track"])
def test_orchestration_config_load_errors_fail_closed(monkeypatch, orchestration):
    from web.api import streaming
    if orchestration == "teamwork":
        from runtime import teamwork_orchestrator
        monkeypatch.setattr(teamwork_orchestrator, "load_teamwork_config", Mock(side_effect=OSError("unavailable")))
    else:
        from runtime import smart_track_orchestrator
        monkeypatch.setattr(smart_track_orchestrator, "load_smart_track_config", Mock(side_effect=OSError("unavailable")))

    assert streaming._orchestration_is_enabled(orchestration) is False


def test_goal_hook_for_orchestrator_turn_persists_decision_and_queues_continuation(monkeypatch):
    from web.api import streaming
    from web.api import goals as goals_api

    session = SimpleNamespace(
        profile="profile-a",
        workspace_slug="research",
        messages=[{"role": "assistant", "content": "The synthesis answer."}],
    )
    evaluated = {}
    monkeypatch.setattr("web.api.profiles.get_profile_home", lambda profile: f"home:{profile}")
    monkeypatch.setattr(
        "web.api.goals.has_active_goal",
        lambda session_id, **kwargs: session_id == "goal-session" and kwargs == {
            "profile_home": "home:profile-a",
            "space_slug": "research",
        },
    )
    continuation_prompt = goals_api.CONTINUATION_PROMPT_TEMPLATE.format(goal="more work")

    class ActiveGoal:
        def is_active(self):
            return True

        def next_continuation_prompt(self):
            return continuation_prompt

    monkeypatch.setattr(
        goals_api,
        "_manager",
        lambda session_id, **kwargs: (
            ActiveGoal()
            if session_id == "goal-session" and kwargs.get("space_slug") == "research"
            else None
        ),
    )

    def evaluate(session_id, response, **kwargs):
        evaluated.update(session_id=session_id, response=response, **kwargs)
        return {
            "status": "active",
            "should_continue": True,
            "continuation_prompt": continuation_prompt,
            "message": "Continuing toward the goal.",
            "message_key": "goal_continuing",
            "message_args": [1, 20, "more work"],
        }

    monkeypatch.setattr("web.api.goals.evaluate_goal_after_turn", evaluate)
    events = []

    result = streaming._evaluate_goal_after_stream_turn(
        session,
        "goal-session",
        True,
        lambda name, payload: events.append((name, payload)),
    )

    assert result["should_continue"] is True
    assert evaluated == {
        "session_id": "goal-session",
        "response": "The synthesis answer.",
        "user_initiated": True,
        "profile_home": "home:profile-a",
        "space_slug": "research",
    }
    assert [name for name, _ in events] == ["goal", "goal", "goal_continue"]
    assert events[-1][1]["continuation_prompt"] == continuation_prompt
    assert goals_api.consume_goal_continuation(
        "another-session",
        continuation_prompt,
        profile_home="home:profile-a",
        space_slug="research",
    ) == "cancelled"
    assert goals_api.consume_goal_continuation(
        "goal-session",
        continuation_prompt,
        profile_home="home:profile-a",
        space_slug="other-space",
    ) == "cancelled"
    assert goals_api.consume_goal_continuation(
        "goal-session",
        continuation_prompt,
        profile_home="home:profile-a",
        space_slug="research",
    ) == "active"


def test_goal_hook_surfaces_unverified_evaluation_failure_and_does_not_continue(monkeypatch):
    from web.api import streaming

    session = SimpleNamespace(
        profile="profile-a",
        workspace_slug="research",
        messages=[{"role": "assistant", "content": "The synthesis answer."}],
        save=Mock(),
    )
    monkeypatch.setattr("web.api.profiles.get_profile_home", lambda _profile: "profile-home")
    monkeypatch.setattr("web.api.goals.has_active_goal", lambda *_a, **_k: True)
    monkeypatch.setattr("web.api.goals.evaluate_goal_after_turn", lambda *_a, **_k: {
        "status": None,
        "should_continue": False,
        "continuation_prompt": None,
        "verdict": "error",
        "reason": "goal evaluation failed: OSError",
        "message": "",
    })
    events = []

    decision = streaming._evaluate_goal_after_stream_turn(
        session,
        "goal-session",
        True,
        lambda name, payload: events.append((name, payload)),
    )

    assert decision["verdict"] == "error"
    assert [name for name, _payload in events] == ["goal", "goal"]
    assert events[-1][1]["state"] == "error"
    assert events[-1][1]["error_code"] == "goal_evaluation_failed"
    assert events[-1][1]["retryable"] is True
    warning = session.messages[-1]
    assert warning["_error"] is True
    assert warning["error_code"] == "goal_evaluation_failed"
    assert "Check /goal status before retrying" in warning["content"]
    session.save.assert_called_once()


def test_goal_hook_surfaces_goal_state_read_failure_and_does_not_continue(monkeypatch):
    from web.api import streaming

    session = SimpleNamespace(
        profile="profile-a",
        workspace_slug="research",
        messages=[{"role": "assistant", "content": "The synthesis answer."}],
        save=Mock(),
    )
    monkeypatch.setattr("web.api.profiles.get_profile_home", lambda _profile: "profile-home")
    monkeypatch.setattr(
        "web.api.goals.has_active_goal",
        Mock(side_effect=OSError("goal database is unavailable")),
    )
    evaluate = Mock(side_effect=AssertionError("the judge must not run when goal state cannot be read"))
    monkeypatch.setattr("web.api.goals.evaluate_goal_after_turn", evaluate)
    events = []

    decision = streaming._evaluate_goal_after_stream_turn(
        session,
        "goal-session",
        True,
        lambda name, payload: events.append((name, payload)),
    )

    assert decision["verdict"] == "error"
    assert decision["should_continue"] is False
    evaluate.assert_not_called()
    assert [name for name, _payload in events] == ["goal"]
    assert events[-1][1]["state"] == "error"
    assert events[-1][1]["error_code"] == "goal_evaluation_failed"
    assert events[-1][1]["retryable"] is True
    warning = session.messages[-1]
    assert warning["_error"] is True
    assert warning["error_code"] == "goal_evaluation_failed"
    assert "Check /goal status before retrying" in warning["content"]
    session.save.assert_called_once()


def test_goal_evaluation_warning_stays_visible_but_is_excluded_from_model_history():
    from web.api.streaming import _session_context_messages

    warning = {
        "role": "assistant",
        "content": "**Goal progress unverified:** Check /goal status before retrying.",
        "_error": True,
        "error_code": "goal_evaluation_failed",
    }
    answer = {"role": "assistant", "content": "The synthesis answer."}
    session = SimpleNamespace(context_messages=[], messages=[answer, warning])

    assert warning in session.messages
    assert _session_context_messages(session) == [answer]
    assert _session_context_messages(SimpleNamespace(context_messages=[answer, warning], messages=[])) == [answer]


def test_persisted_goal_error_does_not_shift_reasoning_metadata_restore_positions():
    from web.api.streaming import _restore_reasoning_metadata

    previous_messages = [
        {"role": "user", "content": "first question"},
        {
            "role": "assistant",
            "content": "first answer",
            "reasoning": "first reasoning",
            "timestamp": 100,
        },
        {
            "role": "assistant",
            "content": "Goal progress could not be verified.",
            "_error": True,
            "error_code": "goal_evaluation_failed",
        },
        {"role": "user", "content": "second question"},
        {
            "role": "assistant",
            "content": "second answer",
            "reasoning": "second reasoning",
            "timestamp": 200,
        },
    ]
    # This is the API-safe conversation returned by the model. The persisted
    # error notice is intentionally absent, just as it is from provider input.
    updated_messages = [
        {"role": "user", "content": "first question"},
        {"role": "assistant", "content": "first answer"},
        {"role": "user", "content": "second question"},
        {"role": "assistant", "content": "second answer"},
    ]

    restored = _restore_reasoning_metadata(previous_messages, updated_messages)

    assert restored[1]["reasoning"] == "first reasoning"
    assert restored[1]["timestamp"] == 100
    assert restored[3]["reasoning"] == "second reasoning"
    assert restored[3]["timestamp"] == 200


@pytest.mark.parametrize(
    ("orchestration", "model", "config_module", "config_loader", "runner_name"),
    [
        ("teamwork", "teamwork", "runtime.teamwork_orchestrator", "load_teamwork_config", "run_teamwork_turn"),
        ("smart-track", "smart-track-high", "runtime.smart_track_orchestrator", "load_smart_track_config", "run_smart_track_turn"),
    ],
)
def test_disabled_orchestration_stream_emits_error_without_model_call(
    monkeypatch, tmp_path, orchestration, model, config_module, config_loader, runner_name
):
    import web.api.streaming as streaming
    from web.api.config import STREAMS, STREAMS_LOCK, StreamChannel
    import importlib

    stream_id = f"disabled-{orchestration}"
    channel = StreamChannel()
    with STREAMS_LOCK:
        STREAMS[stream_id] = channel

    session = SimpleNamespace(
        workspace_slug=None,
        workspace="",
        model="",
        model_provider=None,
        active_stream_id=stream_id,
        pending_user_message="Testfrage",
        save=Mock(),
    )
    monkeypatch.setattr(streaming, "get_session", lambda _sid: session)
    monkeypatch.setattr(streaming, "register_active_run", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "update_active_run", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "unregister_active_run", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "append_turn_journal_event_for_stream", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "_get_session_agent_lock", lambda _sid: nullcontext())
    monkeypatch.setattr(streaming, "meter", lambda: SimpleNamespace(begin_session=lambda *_a: None, get_interval=lambda: 10.0, get_stats=lambda: {}))

    orchestrator_module = importlib.import_module(config_module)
    monkeypatch.setattr(orchestrator_module, config_loader, lambda: {"enabled": False})
    runner = Mock(side_effect=AssertionError("disabled orchestrator must not run"))
    monkeypatch.setattr(orchestrator_module, runner_name, runner)

    try:
        streaming._run_agent_streaming(
            "disabled-session",
            "Testfrage",
            model,
            str(tmp_path),
            stream_id,
        )
        event, payload = channel._offline_buffer.pop(0)
        assert event == "error"
        assert "deaktiviert" in payload["error"]
        assert payload["session_id"] == "disabled-session"
        assert session.active_stream_id is None
        assert session.pending_user_message is None
        session.save.assert_called_once()
        runner.assert_not_called()
    finally:
        with STREAMS_LOCK:
            STREAMS.pop(stream_id, None)


@pytest.mark.parametrize(
    ("orchestration", "model", "config_module", "config_loader", "runner_name"),
    [
        ("teamwork", "teamwork", "runtime.teamwork_orchestrator", "load_teamwork_config", "run_teamwork_turn"),
        ("smart-track", "smart-track-high", "runtime.smart_track_orchestrator", "load_smart_track_config", "run_smart_track_turn"),
    ],
)
def test_enabled_orchestration_stream_runs_persistent_goal_hook(
    monkeypatch, tmp_path, orchestration, model, config_module, config_loader, runner_name
):
    import importlib
    from web.api import streaming
    from web.api.config import STREAMS, STREAMS_LOCK, StreamChannel
    from web.api import goals as goals_api

    stream_id = f"goal-{orchestration}"
    channel = StreamChannel()
    with STREAMS_LOCK:
        STREAMS[stream_id] = channel

    session = SimpleNamespace(
        session_id=f"session-{orchestration}",
        profile="default",
        workspace_slug=None,
        space_slug=None,
        space=None,
        workspace=str(tmp_path),
        model="",
        model_provider=None,
        active_stream_id=stream_id,
        pending_user_message="Keep working",
        save=Mock(),
        messages=[],
    )
    monkeypatch.setattr(streaming, "get_session", lambda _sid: session)
    monkeypatch.setattr(streaming, "register_active_run", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "update_active_run", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "unregister_active_run", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "append_turn_journal_event_for_stream", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "_get_session_agent_lock", lambda _sid: nullcontext())
    monkeypatch.setattr(
        streaming,
        "meter",
        lambda: SimpleNamespace(begin_session=lambda *_a: None, get_interval=lambda: 10.0, get_stats=lambda: {}),
    )
    monkeypatch.setattr(streaming, "_clear_thread_env", lambda: None)
    monkeypatch.setattr(streaming, "_restore_streaming_home_env", lambda *_a: None)
    monkeypatch.setattr(streaming, "_restore_streaming_browser_env", lambda *_a: None)
    monkeypatch.setattr("web.api.kanban_orchestration.session_has_kanban_orchestration", lambda _s: False)
    monkeypatch.setattr("web.api.kanban_orchestration.set_webui_kanban_orchestration", lambda _v: None)
    monkeypatch.setattr("web.api.kanban_orchestration.clear_webui_kanban_orchestration", lambda: None)

    orchestrator_module = importlib.import_module(config_module)
    monkeypatch.setattr(orchestrator_module, config_loader, lambda: {"enabled": True})

    def run_turn(*_args, **_kwargs):
        session.messages.append({"role": "assistant", "content": "Team answer"})

    monkeypatch.setattr(orchestrator_module, runner_name, run_turn)
    monkeypatch.setattr("web.api.profiles.get_profile_home", lambda _profile: tmp_path / "profile")
    monkeypatch.setattr(goals_api, "has_active_goal", lambda *_a, **_k: True)
    evaluation = Mock(return_value={
        "status": "done",
        "should_continue": False,
        "message": "Goal complete.",
        "message_key": "goal_achieved",
    })
    monkeypatch.setattr(goals_api, "evaluate_goal_after_turn", evaluation)

    try:
        streaming._run_agent_streaming(
            session.session_id,
            "Keep working",
            model,
            str(tmp_path),
            stream_id,
            goal_related=True,
        )
        evaluation.assert_called_once_with(
            session.session_id,
            "Team answer",
            user_initiated=True,
            profile_home=tmp_path / "profile",
            space_slug=None,
        )
        assert session.active_stream_id is None
        assert session.pending_user_message is None
        events = [event for event, _payload in channel._offline_buffer]
        assert events[:2] == ["goal", "goal"]
        assert events[-1] == "stream_end"
        assert goals_api.consume_goal_continuation(
            session.session_id,
            "",
            profile_home=tmp_path / "profile",
        ) == "none"
    finally:
        with STREAMS_LOCK:
            STREAMS.pop(stream_id, None)


@pytest.mark.parametrize(
    ("orchestration", "model", "config_module", "config_loader", "runner_name"),
    [
        ("teamwork", "teamwork", "runtime.teamwork_orchestrator", "load_teamwork_config", "run_teamwork_turn"),
        ("smart-track", "smart-track-medium", "runtime.smart_track_orchestrator", "load_smart_track_config", "run_smart_track_turn"),
    ],
)
@pytest.mark.parametrize("terminal", ["cancel", "error"])
def test_orchestration_cancel_and_error_clear_pending_session_state(
    monkeypatch, tmp_path, orchestration, model, config_module, config_loader, runner_name, terminal
):
    import importlib
    from web.api import streaming
    from web.api.config import STREAMS, STREAMS_LOCK, StreamChannel

    stream_id = f"{terminal}-{orchestration}"
    channel = StreamChannel()
    with STREAMS_LOCK:
        STREAMS[stream_id] = channel
    session = SimpleNamespace(
        session_id=f"session-{orchestration}",
        workspace_slug=None,
        space_slug=None,
        space=None,
        workspace=str(tmp_path),
        model="",
        model_provider=None,
        active_stream_id=stream_id,
        pending_user_message="still running",
        pending_attachments=[{"name": "attachment"}],
        pending_started_at=123.0,
        save=Mock(),
        messages=[],
    )
    monkeypatch.setattr(streaming, "get_session", lambda _sid: session)
    monkeypatch.setattr(streaming, "register_active_run", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "update_active_run", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "unregister_active_run", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "append_turn_journal_event_for_stream", lambda *_a, **_k: None)
    monkeypatch.setattr(streaming, "_get_session_agent_lock", lambda _sid: nullcontext())
    monkeypatch.setattr(
        streaming,
        "meter",
        lambda: SimpleNamespace(begin_session=lambda *_a: None, get_interval=lambda: 10.0, get_stats=lambda: {}),
    )
    monkeypatch.setattr(streaming, "_clear_thread_env", lambda: None)
    monkeypatch.setattr(streaming, "_restore_streaming_home_env", lambda *_a: None)
    monkeypatch.setattr(streaming, "_restore_streaming_browser_env", lambda *_a: None)
    monkeypatch.setattr("web.api.kanban_orchestration.session_has_kanban_orchestration", lambda _s: False)
    monkeypatch.setattr("web.api.kanban_orchestration.set_webui_kanban_orchestration", lambda _v: None)
    monkeypatch.setattr("web.api.kanban_orchestration.clear_webui_kanban_orchestration", lambda: None)

    orchestrator_module = importlib.import_module(config_module)
    monkeypatch.setattr(orchestrator_module, config_loader, lambda: {"enabled": True})

    def terminate(*_args, **_kwargs):
        if terminal == "cancel":
            raise InterruptedError("cancelled")
        raise RuntimeError("provider failed")

    monkeypatch.setattr(orchestrator_module, runner_name, terminate)
    try:
        streaming._run_agent_streaming(
            session.session_id,
            "Request",
            model,
            str(tmp_path),
            stream_id,
        )

        assert session.active_stream_id is None
        assert session.pending_user_message is None
        assert session.pending_attachments == []
        assert session.pending_started_at is None
        session.save.assert_called_once()
        events = [event for event, _payload in channel._offline_buffer]
        assert events[-1] == ("cancel" if terminal == "cancel" else "error")
    finally:
        with STREAMS_LOCK:
            STREAMS.pop(stream_id, None)
