"""Stale continuation regression tests for restarted goal runs."""

from types import SimpleNamespace


def test_old_prompt_is_rejected_after_identical_goal_is_recreated_and_restart_simulated(
    monkeypatch, tmp_path,
):
    from web.api import goals, routes

    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))
    # Replace process-local caches instead of clearing shared module state.
    monkeypatch.setattr(goals, "_DB_CACHE", {})
    monkeypatch.setattr(goals, "_PENDING_CONTINUATIONS", {})
    monkeypatch.setattr(goals, "_CANCELLED_CONTINUATIONS", {})

    profile_home = tmp_path / "profiles" / "default"
    space_root = tmp_path / "spaces" / "work"
    space_root.mkdir(parents=True)

    class Workspace:
        root = space_root

    monkeypatch.setattr(
        "web.api.space_engine.get_workspace",
        lambda slug: Workspace() if slug == "work" else None,
    )
    monkeypatch.setattr(goals, "_space_goals_path", lambda _slug: space_root / "goals.db")

    session_id = "same-session-id"
    goal_text = "Finish the same task"
    assert goals.goal_command_payload(
        session_id, goal_text, profile_home=profile_home, space_slug="work",
    )["ok"] is True
    old_prompt = goals._manager(
        session_id, profile_home=profile_home, space_slug="work",
    ).next_continuation_prompt()
    assert old_prompt
    assert "lastbrowser-goal-run:" in old_prompt

    assert goals.goal_command_payload(
        session_id, "clear", profile_home=profile_home, space_slug="work",
    )["ok"] is True
    assert goals.goal_command_payload(
        session_id, goal_text, profile_home=profile_home, space_slug="work",
    )["ok"] is True
    new_prompt = goals._manager(
        session_id, profile_home=profile_home, space_slug="work",
    ).next_continuation_prompt()
    assert new_prompt and new_prompt != old_prompt

    # A backend restart loses pending/tombstone memory but retains the scoped
    # SQLite goal and its run discriminator.
    goals._DB_CACHE.clear()
    goals._PENDING_CONTINUATIONS.clear()
    goals._CANCELLED_CONTINUATIONS.clear()
    monkeypatch.setattr("web.api.profiles.get_profile_home", lambda _profile: profile_home)

    launched = []

    class MustNotLaunchThread:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def start(self):
            launched.append(self.kwargs)

    monkeypatch.setattr(routes.threading, "Thread", MustNotLaunchThread)
    session = SimpleNamespace(
        session_id=session_id,
        profile="default",
        workspace_slug="work",
        space_slug=None,
        space=None,
        active_stream_id=None,
        workspace=str(tmp_path),
        model="deepseek-v4.1-flash",
        model_provider="ollama-cloud",
    )

    stale = routes._start_chat_stream_for_session(
        session,
        msg=old_prompt,
        workspace=str(tmp_path),
        model="deepseek-v4.1-flash",
        model_provider="ollama-cloud",
    )
    assert stale["_status"] == 409
    assert stale["error_code"] == "goal_continuation_cancelled"
    assert launched == []

    # A delayed old POST must not consume or cancel the currently queued run.
    assert goals.queue_goal_continuation(
        session_id, new_prompt, profile_home=profile_home, space_slug="work",
    ) is True
    assert goals.consume_goal_continuation(
        session_id, old_prompt, profile_home=profile_home, space_slug="work",
    ) == "cancelled"
    assert goals.consume_goal_continuation(
        session_id, new_prompt, profile_home=profile_home, space_slug="work",
    ) == "active"

    # After consuming, another process-local reset must still not replay it:
    # the claim is persisted with the goal turn in the same scoped database.
    goals._DB_CACHE.clear()
    goals._PENDING_CONTINUATIONS.clear()
    goals._CANCELLED_CONTINUATIONS.clear()
    replay = routes._start_chat_stream_for_session(
        session,
        msg=new_prompt,
        workspace=str(tmp_path),
        model="deepseek-v4.1-flash",
        model_provider="ollama-cloud",
    )
    assert replay["_status"] == 409
    assert replay["error_code"] == "goal_continuation_cancelled"
    assert launched == []


def test_legacy_active_goal_without_run_id_keeps_restart_recovery_compatibility(
    monkeypatch, tmp_path,
):
    from runtime._compat.shim_state import SessionDB
    from cli.goals import GoalState
    from web.api import goals

    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))
    monkeypatch.setattr(goals, "_DB_CACHE", {})
    monkeypatch.setattr(goals, "_PENDING_CONTINUATIONS", {})
    monkeypatch.setattr(goals, "_CANCELLED_CONTINUATIONS", {})
    monkeypatch.setattr(goals, "_space_goals_path", lambda *_args, **_kwargs: None)

    profile_home = tmp_path / "profiles" / "legacy"
    session_id = "legacy-active-goal"
    legacy_state = GoalState(goal="Keep legacy goal running", status="active", created_at=1.0)
    db = SessionDB(db_path=profile_home / "state.db")
    db.set_meta(f"goal:{session_id}", legacy_state.to_json())
    prompt = goals.CONTINUATION_PROMPT_TEMPLATE.format(goal=legacy_state.goal)

    # Older records have no run-id metadata. Preserve their original continuation
    # text and allow one durable recovery after process-local handoff state clears.
    assert goals._manager(session_id, profile_home=profile_home).next_continuation_prompt() == prompt
    goals._DB_CACHE.clear()
    assert goals.consume_goal_continuation(
        session_id, prompt, profile_home=profile_home,
    ) == "active"
