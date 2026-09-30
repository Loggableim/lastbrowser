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
    monkeypatch.setattr(
        goals, "_space_goals_path",
        lambda _slug, *, profile_home=None: space_root / "goals.db",
    )

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


def test_delayed_prior_turn_prompt_cannot_claim_the_next_turn_after_restart(
    monkeypatch, tmp_path,
):
    from web.api import goals

    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))
    monkeypatch.setattr(goals, "_DB_CACHE", {})
    monkeypatch.setattr(goals, "_PENDING_CONTINUATIONS", {})
    monkeypatch.setattr(goals, "_CANCELLED_CONTINUATIONS", {})
    monkeypatch.setattr(goals, "_space_goals_path", lambda *_args, **_kwargs: None)

    profile_home = tmp_path / "profiles" / "work"
    session_id = "delayed-prior-turn"
    assert goals.goal_command_payload(
        session_id, "Complete several steps", profile_home=profile_home,
    )["ok"] is True
    manager = goals._manager(session_id, profile_home=profile_home)
    first_turn_prompt = manager.next_continuation_prompt()
    assert first_turn_prompt
    assert goals.queue_goal_continuation(
        session_id, first_turn_prompt, profile_home=profile_home,
    )
    assert goals.consume_goal_continuation(
        session_id, first_turn_prompt, profile_home=profile_home,
    ) == "active"

    manager = goals._manager(session_id, profile_home=profile_home)
    decision = manager.evaluate_after_turn(
        "One step completed",
        judged_result=("continue", "more steps remain", False),
    )
    assert decision["should_continue"] is True
    next_turn_prompt = manager.next_continuation_prompt()
    assert next_turn_prompt and next_turn_prompt != first_turn_prompt
    assert goals.queue_goal_continuation(
        session_id, next_turn_prompt, profile_home=profile_home,
    )

    # A delayed duplicate from the previous turn must not steal the pending
    # continuation for this turn, even after process-local state is lost.
    goals._DB_CACHE.clear()
    goals._PENDING_CONTINUATIONS.clear()
    goals._CANCELLED_CONTINUATIONS.clear()
    assert goals.consume_goal_continuation(
        session_id, first_turn_prompt, profile_home=profile_home,
    ) == "cancelled"
    assert goals.consume_goal_continuation(
        session_id, next_turn_prompt, profile_home=profile_home,
    ) == "active"

    goals._DB_CACHE.clear()
    goals._PENDING_CONTINUATIONS.clear()
    goals._CANCELLED_CONTINUATIONS.clear()
    assert goals.consume_goal_continuation(
        session_id, next_turn_prompt, profile_home=profile_home,
    ) == "cancelled"


def test_same_space_slug_and_session_are_scoped_to_the_session_profile(
    monkeypatch, tmp_path,
):
    from types import SimpleNamespace
    from web.api import goals, profiles, space_engine

    home = tmp_path / "sidekick-home"
    profile_a = home / "profiles" / "alpha"
    profile_b = home / "profiles" / "beta"
    root_a = profile_a / "spaces" / "shared-slug"
    root_b = profile_b / "spaces" / "shared-slug"
    root_a.mkdir(parents=True)
    root_b.mkdir(parents=True)

    monkeypatch.setenv("SIDEKICK_HOME", str(home))
    monkeypatch.setattr(profiles, "_DEFAULT_SIDEKICK_HOME", home)
    # A different globally active profile models the bare streaming worker,
    # which does not inherit the HTTP request's ContextVar.
    monkeypatch.setattr(profiles, "_active_profile", "alpha")
    monkeypatch.setattr(goals, "_DB_CACHE", {})
    monkeypatch.setattr(goals, "_PENDING_CONTINUATIONS", {})
    monkeypatch.setattr(goals, "_CANCELLED_CONTINUATIONS", {})

    def profile_space(slug):
        selected = profiles.get_active_profile_name()
        roots = {
            "alpha": profile_a / "spaces",
            "beta": profile_b / "spaces",
        }
        root = roots[selected] / slug if selected in roots else None
        return SimpleNamespace(root=root) if root and root.is_dir() else None

    monkeypatch.setattr(space_engine, "get_workspace", profile_space)
    session_id = "collision-safe-session"
    assert goals.goal_command_payload(
        session_id, "Alpha profile goal", profile_home=profile_a, space_slug="shared-slug",
    )["ok"] is True
    assert goals.goal_command_payload(
        session_id, "Beta profile goal", profile_home=profile_b, space_slug="shared-slug",
    )["ok"] is True

    goals._DB_CACHE.clear()
    state_a = goals.goal_state_for_session(
        session_id, profile_home=profile_a, space_slug="shared-slug",
    )
    state_b = goals.goal_state_for_session(
        session_id, profile_home=profile_b, space_slug="shared-slug",
    )
    assert state_a["goal"] == "Alpha profile goal"
    assert state_b["goal"] == "Beta profile goal"

    prompt_a = goals._manager(
        session_id, profile_home=profile_a, space_slug="shared-slug",
    ).next_continuation_prompt()
    prompt_b = goals._manager(
        session_id, profile_home=profile_b, space_slug="shared-slug",
    ).next_continuation_prompt()
    assert prompt_a != prompt_b
    assert goals.queue_goal_continuation(
        session_id, prompt_a, profile_home=profile_a, space_slug="shared-slug",
    )
    assert goals.queue_goal_continuation(
        session_id, prompt_b, profile_home=profile_b, space_slug="shared-slug",
    )
    assert goals.consume_goal_continuation(
        session_id, prompt_a, profile_home=profile_a, space_slug="shared-slug",
    ) == "active"
    assert goals.consume_goal_continuation(
        session_id, prompt_b, profile_home=profile_b, space_slug="shared-slug",
    ) == "active"


def test_stream_worker_without_request_context_uses_owning_profile_and_restores_context(
    monkeypatch, tmp_path,
):
    """A real worker thread must persist the goal under its session profile.

    ContextVars are not inherited by a newly-created ``threading.Thread``.
    The process-level active profile deliberately points elsewhere to model a
    user switching profiles while a stream is running.
    """
    import threading

    from web.api import goals, profiles, space_engine

    home = tmp_path / "sidekick-home"
    profile_a = home / "profiles" / "alpha"
    profile_b = home / "profiles" / "beta"
    root_a = profile_a / "spaces" / "shared-slug"
    root_b = profile_b / "spaces" / "shared-slug"
    root_a.mkdir(parents=True)
    root_b.mkdir(parents=True)

    monkeypatch.setenv("SIDEKICK_HOME", str(home))
    monkeypatch.setattr(profiles, "_DEFAULT_SIDEKICK_HOME", home)
    monkeypatch.setattr(profiles, "_active_profile", "alpha")
    monkeypatch.setattr(goals, "_DB_CACHE", {})
    monkeypatch.setattr(goals, "_PENDING_CONTINUATIONS", {})
    monkeypatch.setattr(goals, "_CANCELLED_CONTINUATIONS", {})

    def profile_space(slug):
        selected = profiles.get_active_profile_name()
        roots = {"alpha": profile_a / "spaces", "beta": profile_b / "spaces"}
        root = roots.get(selected, home / "invalid") / slug
        return SimpleNamespace(root=root) if root.is_dir() else None

    monkeypatch.setattr(space_engine, "get_workspace", profile_space)

    # The request handler is handling beta, but a plain background thread does
    # not inherit this token. The owning profile_home must therefore be passed
    # explicitly to the goal bridge.
    request_token = profiles.set_request_profile("beta")
    observed = {}

    def stream_worker():
        observed["profile_before"] = profiles.get_active_profile_name()
        observed["response"] = goals.goal_command_payload(
            "thread-scoped-session",
            "Persist under beta",
            profile_home=profile_b,
            space_slug="shared-slug",
        )
        observed["profile_after"] = profiles.get_active_profile_name()

    worker = threading.Thread(target=stream_worker)
    try:
        worker.start()
        worker.join(timeout=5)
    finally:
        profiles._request_profile.reset(request_token)

    assert not worker.is_alive()
    assert observed["profile_before"] == "alpha"
    assert observed["response"]["ok"] is True
    assert observed["profile_after"] == "alpha"

    goals._DB_CACHE.clear()
    state_b = goals.goal_state_for_session(
        "thread-scoped-session", profile_home=profile_b, space_slug="shared-slug",
    )
    state_a = goals.goal_state_for_session(
        "thread-scoped-session", profile_home=profile_a, space_slug="shared-slug",
    )
    assert state_b["goal"] == "Persist under beta"
    assert state_a is None
