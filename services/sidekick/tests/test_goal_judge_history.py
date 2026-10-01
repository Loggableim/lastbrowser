"""The judge retains earlier goal steps without borrowing other goals' evidence."""

import json
from types import SimpleNamespace
import pytest


def test_legacy_and_untrusted_history_are_bounded():
    from cli.goals import GoalState

    assert GoalState.from_json('{"goal":"legacy"}').recent_assistant_responses == []
    state = GoalState.from_json(json.dumps({
        "goal": "bounded", "recent_assistant_responses": [None, {}] + ["x" * 10000] * 100,
    }))
    assert sum(map(len, state.recent_assistant_responses)) <= 12000
    assert all(len(item) <= 4000 for item in state.recent_assistant_responses)
    assert len(state.recent_assistant_responses) <= 8


def test_judge_receives_earlier_step_separately_from_current_response(monkeypatch):
    from cli import goals

    monkeypatch.setattr("web.api.config.is_game_mode_enabled", lambda: True)
    captured = {}

    def call(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(
            content='{"done":true,"reason":"both steps present"}',
        ))])

    monkeypatch.setattr("runtime.auxiliary_client.call_llm", call)
    assert goals.judge_goal("Produce A then B", "B", prior_responses=["A"])[0] == "done"
    messages = captured["messages"]
    assert '"A"' in messages[-1]["content"]
    assert "most recent response:\nB" in messages[-1]["content"]
    assert "Later corrections or failures override" in messages[0]["content"]


def test_goal_history_survives_reload_resume_and_is_scoped(monkeypatch, tmp_path):
    from web.api import goals

    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))
    monkeypatch.setattr(goals, "_space_goals_path", lambda *_args, **_kwargs: None)
    goals._DB_CACHE.clear()
    profile = tmp_path / "profile"
    calls = []

    def judge(goal, response, **kwargs):
        calls.append((goal, response, kwargs["prior_responses"]))
        return "continue", "next step", False

    monkeypatch.setattr(goals, "judge_goal", judge)
    goals.goal_command_payload("shared", "A then B", profile_home=profile)
    goals.evaluate_goal_after_turn("shared", "A", profile_home=profile)
    goals._DB_CACHE.clear()
    goals.goal_command_payload("shared", "pause", profile_home=profile)
    goals.goal_command_payload("shared", "resume", profile_home=profile)
    goals.evaluate_goal_after_turn("shared", "B", profile_home=profile)
    assert calls[-1] == ("A then B", "B", ["A"])

    other = tmp_path / "other-profile"
    goals.goal_command_payload("shared", "Other goal", profile_home=other)
    goals.evaluate_goal_after_turn("shared", "Other response", profile_home=other)
    assert calls[-1][2] == []
    goals.goal_command_payload("shared", "Replacement", profile_home=profile)
    goals.evaluate_goal_after_turn("shared", "New response", profile_home=profile)
    assert calls[-1] == ("Replacement", "New response", [])


def test_replacement_during_judging_does_not_receive_old_evidence(monkeypatch, tmp_path):
    from web.api import goals

    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))
    monkeypatch.setattr(goals, "_space_goals_path", lambda *_args, **_kwargs: None)
    goals._DB_CACHE.clear()
    profile = tmp_path / "profile"
    goals.goal_command_payload("session", "Old goal", profile_home=profile)

    def judge(*args, **kwargs):
        goals.goal_command_payload("session", "New goal", profile_home=profile)
        return "done", "old goal done", False

    monkeypatch.setattr(goals, "judge_goal", judge)
    result = goals.evaluate_goal_after_turn("session", "Old evidence", profile_home=profile)
    assert result["verdict"] == "stale"
    state = goals._manager("session", profile_home=profile).state
    assert state.goal == "New goal"
    assert state.recent_assistant_responses == []
    assert state.turns_used == 0


@pytest.mark.parametrize("change", ["replace", "clear_then_same_goal", "pause_resume", "new_goal"])
def test_stream_output_cannot_evaluate_changed_goal(monkeypatch, tmp_path, change):
    from web.api import goals, streaming

    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))
    monkeypatch.setattr(goals, "_space_goals_path", lambda *_args, **_kwargs: None)
    goals._DB_CACHE.clear()
    profile = tmp_path / "profile"
    monkeypatch.setattr("web.api.profiles.get_profile_home", lambda _: profile)
    session = SimpleNamespace(profile="default", messages=[{"role": "assistant", "content": "Old result"}])
    if change != "new_goal":
        goals.goal_command_payload("session", "Original goal", profile_home=profile)
    context = streaming._capture_goal_turn_context(session, "session")
    if change == "clear_then_same_goal":
        goals.goal_command_payload("session", "clear", profile_home=profile)
        goals.goal_command_payload("session", "Original goal", profile_home=profile)
    elif change == "pause_resume":
        goals.goal_command_payload("session", "pause", profile_home=profile)
        goals.goal_command_payload("session", "resume", profile_home=profile)
    else:
        goals.goal_command_payload("session", "New goal", profile_home=profile)
    monkeypatch.setattr(goals, "judge_goal", lambda *a, **kw: pytest.fail("stale output must not be judged"))
    decision = streaming._evaluate_goal_after_stream_turn(
        session, "session", True, lambda *args: None, goal_turn_context=context,
    )
    assert decision["verdict"] == "stale"
    state = goals._manager("session", profile_home=profile).state
    assert state.turns_used == 0
    assert state.recent_assistant_responses == []


def test_stream_evidence_uses_captured_profile(monkeypatch, tmp_path):
    from web.api import goals, streaming

    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))
    monkeypatch.setattr(goals, "_space_goals_path", lambda *_args, **_kwargs: None)
    goals._DB_CACHE.clear()
    profile_a, profile_b = tmp_path / "a", tmp_path / "b"
    monkeypatch.setattr("web.api.profiles.get_profile_home", lambda name: profile_a if name == "a" else profile_b)
    for profile in (profile_a, profile_b):
        goals.goal_command_payload("session", "Same goal", profile_home=profile)
    session = SimpleNamespace(profile="a", messages=[{"role": "assistant", "content": "Result A"}])
    context = streaming._capture_goal_turn_context(session, "session")
    session.profile = "b"
    monkeypatch.setattr(goals, "judge_goal", lambda *a, **kw: ("done", "finished", False))
    decision = streaming._evaluate_goal_after_stream_turn(
        session, "session", True, lambda *args: None, goal_turn_context=context,
    )
    assert decision["verdict"] == "done"
    assert goals._manager("session", profile_home=profile_a).state.recent_assistant_responses == ["Result A"]
    assert goals._manager("session", profile_home=profile_b).state.recent_assistant_responses == []


def test_resume_active_goal_preserves_pending_continuation_and_running_turn(monkeypatch, tmp_path):
    from web.api import goals

    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))
    monkeypatch.setattr(goals, "_space_goals_path", lambda *_args, **_kwargs: None)
    goals._DB_CACHE.clear()
    profile = tmp_path / "profile"
    goals.goal_command_payload("session", "Finish", profile_home=profile)
    manager = goals._manager("session", profile_home=profile)
    snapshot = goals.goal_state_snapshot("session", profile_home=profile)
    prompt = manager.next_continuation_prompt()
    assert goals.queue_goal_continuation("session", prompt, profile_home=profile)
    response = goals.goal_command_payload("session", "resume", profile_home=profile)
    assert response["action"] == "status"
    assert not response.get("kickoff_prompt")
    assert goals.consume_goal_continuation("session", prompt, profile_home=profile) == "active"
    state = goals._manager("session", profile_home=profile).state
    assert state._goal_run_id == snapshot._goal_run_id
    # A direct manager resume also must not rotate the identity.
    assert manager.resume()._goal_run_id == snapshot._goal_run_id
    monkeypatch.setattr(goals, "judge_goal", lambda *a, **kw: ("done", "complete", False))
    # Consuming the queued turn mutates the claim marker, so take its snapshot
    # as the stream does, then exercise another redundant resume mid-turn.
    running_snapshot = goals.goal_state_snapshot("session", profile_home=profile)
    goals.goal_command_payload("session", "resume", profile_home=profile, stream_running=True)
    result = goals.evaluate_goal_after_turn(
        "session", "Finished", profile_home=profile, expected_goal_state=running_snapshot,
    )
    assert result["verdict"] == "done"
