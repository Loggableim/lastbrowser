from __future__ import annotations

import threading

import pytest


def test_game_mode_judge_retries_transient_provider_failure_once(monkeypatch):
    from cli import goals
    from web.api import config

    monkeypatch.setattr(config, "is_game_mode_enabled", lambda: True)
    monkeypatch.setattr(goals.time, "sleep", lambda _seconds: None)
    calls = []

    def fail(**kwargs):
        calls.append(kwargs)
        raise TimeoutError("private endpoint detail")

    monkeypatch.setattr("runtime.auxiliary_client.call_llm", fail)
    verdict = goals.judge_goal("Finish the work", "A response", timeout=0.01)

    assert verdict == ("unavailable", "judge unavailable: TimeoutError", False)
    assert len(calls) == goals.DEFAULT_JUDGE_MAX_ATTEMPTS == 2
    assert all(call["provider"] == "ollama-cloud" for call in calls)
    assert all(call["model"] == "deepseek-v4.1-flash" for call in calls)


def test_game_mode_judge_does_not_retry_permanent_unauthorized_failure(monkeypatch):
    from cli import goals
    from web.api import config

    monkeypatch.setattr(config, "is_game_mode_enabled", lambda: True)
    calls = []

    class Unauthorized(Exception):
        status_code = 401

    def fail(**_kwargs):
        calls.append(True)
        raise Unauthorized("private credential detail")

    monkeypatch.setattr("runtime.auxiliary_client.call_llm", fail)
    verdict = goals.judge_goal("Finish the work", "A response")

    assert verdict == ("unavailable", "judge unavailable: Unauthorized", False)
    assert calls == [True]


def test_game_mode_judge_retries_transient_failure_then_accepts_valid_verdict(monkeypatch):
    from types import SimpleNamespace

    from cli import goals
    from web.api import config

    monkeypatch.setattr(config, "is_game_mode_enabled", lambda: True)
    monkeypatch.setattr(goals.time, "sleep", lambda _seconds: None)
    calls = []

    def flaky(**_kwargs):
        calls.append(True)
        if len(calls) == 1:
            raise TimeoutError("private endpoint detail")
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(
            content='{"done": true, "reason": "all criteria satisfied"}',
        ))])

    monkeypatch.setattr("runtime.auxiliary_client.call_llm", flaky)
    verdict = goals.judge_goal("Finish the work", "All acceptance criteria are satisfied")

    assert verdict == ("done", "all criteria satisfied", False)
    assert calls == [True, True]


def test_goal_judge_outage_preserves_budget_and_response_then_resume_rejudges_without_skipping_evaluation(
    monkeypatch, tmp_path,
):
    from web.api import goals

    monkeypatch.setattr(goals, "_DB_CACHE", {})
    monkeypatch.setattr(goals, "_PENDING_CONTINUATIONS", {})
    monkeypatch.setattr(goals, "_CANCELLED_CONTINUATIONS", {})
    monkeypatch.setattr(goals, "_IN_FLIGHT_CONTINUATIONS", set())
    monkeypatch.setattr(goals, "_space_goals_path", lambda *_args, **_kwargs: None)
    profile_home = tmp_path / "profile"
    session_id = "judge-outage-recovery"

    created = goals.goal_command_payload(
        session_id, "Complete all release checks", profile_home=profile_home, max_turns=2,
    )
    assert created["ok"] is True
    monkeypatch.setattr(goals, "judge_goal", lambda *_args, **_kwargs: (
        "unavailable", "judge unavailable: TimeoutError", False,
    ))

    failed = goals.evaluate_goal_after_turn(
        session_id,
        "First response with partial work; the full release criteria remain required.",
        profile_home=profile_home,
    )

    assert failed["status"] == "paused"
    assert failed["verdict"] == "unavailable"
    assert failed["should_continue"] is False
    assert failed["continuation_prompt"] is None
    assert "no completion was assumed" in failed["message"]
    goals._DB_CACHE.clear()
    pending = goals._manager(session_id, profile_home=profile_home).state
    assert pending.status == "paused"
    assert pending.last_verdict == "unavailable"
    assert pending.turns_used == 0
    assert pending.pending_judge_response.startswith("First response with partial work")

    still_failed = goals.goal_command_payload(
        session_id, "resume", profile_home=profile_home,
    )
    assert still_failed["goal"]["status"] == "paused"
    assert still_failed.get("kickoff_prompt") is None
    assert still_failed["message_key"] == "goal_judge_unavailable"
    goals._DB_CACHE.clear()
    still_pending = goals._manager(session_id, profile_home=profile_home).state
    assert still_pending.turns_used == 0
    assert still_pending.pending_judge_response.startswith("First response with partial work")

    judged = []

    def recovered_judge(goal, response, **kwargs):
        judged.append((goal, response, kwargs.get("prior_responses")))
        return "continue", "remaining release criteria are not yet proven", False

    monkeypatch.setattr(goals, "judge_goal", recovered_judge)
    resumed = goals.goal_command_payload(
        session_id, "resume", profile_home=profile_home,
    )

    assert resumed["ok"] is True
    assert resumed["goal"]["status"] == "active"
    assert resumed["goal"]["turns_used"] == 1
    assert resumed["kickoff_prompt"]
    assert len(judged) == 1
    assert judged[0][0] == "Complete all release checks"
    assert judged[0][1].startswith("First response with partial work")
    goals._DB_CACHE.clear()
    recovered = goals._manager(session_id, profile_home=profile_home).state
    assert recovered.pending_judge_response is None
    assert recovered.last_verdict == "continue"
    assert recovered.turns_used == 1


def test_saved_response_can_be_marked_done_after_explicit_judge_retry_without_new_generation(
    monkeypatch, tmp_path,
):
    from web.api import goals

    monkeypatch.setattr(goals, "_DB_CACHE", {})
    monkeypatch.setattr(goals, "_space_goals_path", lambda *_args, **_kwargs: None)
    profile_home = tmp_path / "profile"
    session_id = "judge-retry-done"
    goals.goal_command_payload(session_id, "Ship all acceptance criteria", profile_home=profile_home)
    monkeypatch.setattr(goals, "judge_goal", lambda *_args, **_kwargs: (
        "unavailable", "judge unavailable", False,
    ))
    goals.evaluate_goal_after_turn(session_id, "All acceptance criteria are complete.", profile_home=profile_home)

    monkeypatch.setattr(goals, "judge_goal", lambda *_args, **_kwargs: (
        "done", "all acceptance criteria are evidenced", False,
    ))
    resumed = goals.goal_command_payload(session_id, "resume", profile_home=profile_home)

    assert resumed["goal"]["status"] == "done"
    assert resumed.get("kickoff_prompt") is None
    goals._DB_CACHE.clear()
    current = goals._manager(session_id, profile_home=profile_home).state
    assert current.last_verdict == "done"
    assert current.turns_used == 1
    assert current.pending_judge_response is None


def test_blocked_pending_judge_retry_cannot_overwrite_replacement_goal(monkeypatch, tmp_path):
    from web.api import goals

    monkeypatch.setattr(goals, "_DB_CACHE", {})
    monkeypatch.setattr(goals, "_PENDING_CONTINUATIONS", {})
    monkeypatch.setattr(goals, "_CANCELLED_CONTINUATIONS", {})
    monkeypatch.setattr(goals, "_IN_FLIGHT_CONTINUATIONS", set())
    monkeypatch.setattr(goals, "_space_goals_path", lambda *_args, **_kwargs: None)
    profile_home = tmp_path / "profile"
    session_id = "judge-retry-goal-replaced"
    goals.goal_command_payload(session_id, "Old goal", profile_home=profile_home)
    monkeypatch.setattr(goals, "judge_goal", lambda *_args, **_kwargs: (
        "unavailable", "judge unavailable", False,
    ))
    goals.evaluate_goal_after_turn(session_id, "Old response", profile_home=profile_home)

    entered = threading.Event()
    release = threading.Event()

    def blocked_judge(*_args, **_kwargs):
        entered.set()
        assert release.wait(timeout=3)
        return "done", "old goal complete", False

    monkeypatch.setattr(goals, "judge_goal", blocked_judge)
    resumed = []
    worker = threading.Thread(target=lambda: resumed.append(goals.goal_command_payload(
        session_id, "resume", profile_home=profile_home,
    )))
    worker.start()
    assert entered.wait(timeout=2)
    replacement = goals.goal_command_payload(
        session_id, "New goal must remain active", profile_home=profile_home,
    )
    release.set()
    worker.join(timeout=3)

    assert not worker.is_alive()
    assert replacement["goal"]["goal"] == "New goal must remain active"
    assert resumed[0]["action"] == "status"
    assert resumed[0].get("kickoff_prompt") is None
    goals._DB_CACHE.clear()
    current = goals._manager(session_id, profile_home=profile_home).state
    assert current.goal == "New goal must remain active"
    assert current.status == "active"
    assert current.last_verdict is None


def test_pending_judge_retry_cannot_bypass_turn_budget(monkeypatch, tmp_path):
    from web.api import goals

    monkeypatch.setattr(goals, "_DB_CACHE", {})
    monkeypatch.setattr(goals, "_space_goals_path", lambda *_args, **_kwargs: None)
    profile_home = tmp_path / "profile"
    session_id = "judge-retry-budget"
    goals.goal_command_payload(
        session_id, "Finish one checked step", profile_home=profile_home, max_turns=1,
    )
    monkeypatch.setattr(goals, "judge_goal", lambda *_args, **_kwargs: (
        "unavailable", "judge unavailable", False,
    ))
    failed = goals.evaluate_goal_after_turn(session_id, "Saved response", profile_home=profile_home)
    assert failed["status"] == "paused"
    assert failed["turns_used"] == 0

    monkeypatch.setattr(goals, "judge_goal", lambda *_args, **_kwargs: (
        "continue", "more work remains", False,
    ))
    resumed = goals.goal_command_payload(session_id, "resume", profile_home=profile_home)

    assert resumed["goal"]["status"] == "paused"
    assert resumed["goal"]["turns_used"] == 1
    assert resumed.get("kickoff_prompt") is None
    goals._DB_CACHE.clear()
    current = goals._manager(session_id, profile_home=profile_home).state
    assert current.paused_reason.startswith("turn budget exhausted")
    assert current.pending_judge_response is None


def test_new_goal_and_explicit_budget_reset_clear_pending_judge_snapshot(monkeypatch, tmp_path):
    from cli.goals import GoalManager, GoalState

    monkeypatch.setattr("cli.goals.save_goal", lambda *_args, **_kwargs: None)
    manager = GoalManager("pending-reset")
    manager._state = GoalState(
        goal="Old goal", status="paused", turns_used=5, max_turns=10,
        pending_judge_response="Response awaiting the judge",
    )

    replacement = manager.set("Replacement goal", max_turns=3)
    assert replacement.pending_judge_response is None

    replacement.status = "paused"
    replacement.pending_judge_response = "Another response awaiting the judge"
    manager.resume(reset_budget=True)
    assert manager.state.turns_used == 0
    assert manager.state.pending_judge_response is None
    assert manager.state.recent_assistant_responses == ["Another response awaiting the judge"]


def test_blocked_local_resume_cannot_overwrite_replacement_from_another_manager(monkeypatch):
    from cli import goals

    saved: dict[str, str] = {}

    def load(session_id):
        raw = saved.get(session_id)
        return goals.GoalState.from_json(raw) if raw else None

    def save(session_id, state):
        saved[session_id] = state.to_json()

    monkeypatch.setattr(goals, "load_goal", load)
    monkeypatch.setattr(goals, "save_goal", save)
    session_id = "local-manager-goal-replaced"

    original_manager = goals.GoalManager(session_id)
    original_manager.set("Old goal")
    original_manager.evaluate_after_turn(
        "Old response",
        judged_result=("unavailable", "judge unavailable", False),
    )

    retry_manager = goals.GoalManager(session_id)
    entered = threading.Event()
    release = threading.Event()

    def blocked_judge(*_args, **_kwargs):
        entered.set()
        assert release.wait(timeout=3)
        return "done", "old goal complete", False

    monkeypatch.setattr(goals, "judge_goal", blocked_judge)
    resumed: list[object] = []
    errors: list[BaseException] = []

    def retry():
        try:
            resumed.append(retry_manager.resume())
        except BaseException as exc:  # propagate worker errors in the test thread
            errors.append(exc)

    worker = threading.Thread(target=retry, name="local-goal-judge-retry")
    worker.start()
    assert entered.wait(timeout=2)
    replacement_manager = goals.GoalManager(session_id)
    replacement_manager.set("New goal must stay active")
    release.set()
    worker.join(timeout=3)

    assert not worker.is_alive()
    assert errors == []
    assert retry_manager._resume_stale is True
    assert resumed[0] is not None
    assert resumed[0].goal == "New goal must stay active"
    assert resumed[0].status == "active"
    assert retry_manager.next_continuation_prompt() is None

    persisted = load(session_id)
    assert persisted is not None
    assert persisted.goal == "New goal must stay active"
    assert persisted.status == "active"
    assert persisted.last_verdict is None
    assert persisted.pending_judge_response is None


@pytest.mark.parametrize("control", ["pause", "clear"])
def test_blocked_local_turn_evaluation_cannot_overwrite_control_from_another_manager(
    monkeypatch, control,
):
    from cli import goals

    saved: dict[str, str] = {}

    def load(session_id):
        raw = saved.get(session_id)
        return goals.GoalState.from_json(raw) if raw else None

    def save(session_id, state):
        saved[session_id] = state.to_json()

    monkeypatch.setattr(goals, "load_goal", load)
    monkeypatch.setattr(goals, "save_goal", save)
    session_id = f"local-turn-control-{control}"
    goals.GoalManager(session_id).set("Finish the active task")

    evaluation_manager = goals.GoalManager(session_id)
    entered = threading.Event()
    release = threading.Event()

    def blocked_judge(*_args, **_kwargs):
        entered.set()
        assert release.wait(timeout=3)
        return "done", "old response completed the old goal", False

    monkeypatch.setattr(goals, "judge_goal", blocked_judge)
    decisions: list[dict] = []
    errors: list[BaseException] = []

    def evaluate():
        try:
            decisions.append(evaluation_manager.evaluate_after_turn("Old assistant response"))
        except BaseException as exc:  # propagate worker errors in the test thread
            errors.append(exc)

    worker = threading.Thread(target=evaluate, name=f"local-goal-evaluation-{control}")
    worker.start()
    assert entered.wait(timeout=2)
    control_manager = goals.GoalManager(session_id)
    if control == "pause":
        control_manager.pause("user-paused")
    else:
        control_manager.clear()
    release.set()
    worker.join(timeout=3)

    assert not worker.is_alive()
    assert errors == []
    assert decisions[0]["verdict"] == "stale"
    assert decisions[0]["should_continue"] is False
    assert decisions[0]["continuation_prompt"] is None
    assert evaluation_manager._resume_stale is True
    assert evaluation_manager.next_continuation_prompt() is None

    persisted = load(session_id)
    assert persisted is not None
    assert persisted.status == ("paused" if control == "pause" else "cleared")
    assert persisted.last_verdict is None
    assert persisted.turns_used == 0
