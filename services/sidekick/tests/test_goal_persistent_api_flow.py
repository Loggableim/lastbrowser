"""Integration coverage for persistent goals across command, stream, and DB reloads."""

from types import SimpleNamespace


def test_goal_scope_survives_stream_resume_clear_and_cache_reload(monkeypatch, tmp_path):
    from runtime._compat.shim_state import SessionDB
    from web.api import goals, routes

    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))
    goals._DB_CACHE.clear()
    routes.STREAMS.clear()
    routes.STREAM_GOAL_RELATED.clear()

    profile_home = tmp_path / "profiles" / "work"
    alpha_root = tmp_path / "spaces" / "alpha"
    beta_root = tmp_path / "spaces" / "beta"
    alpha_root.mkdir(parents=True)
    beta_root.mkdir(parents=True)

    class Workspace:
        def __init__(self, root):
            self.root = root

    monkeypatch.setattr(
        "web.api.space_engine.get_workspace",
        lambda slug: Workspace({"alpha": alpha_root, "beta": beta_root}[slug]),
    )
    monkeypatch.setattr(goals, "_space_goals_path", lambda slug: {
        "alpha": alpha_root / "goals.db",
        "beta": beta_root / "goals.db",
    }.get(slug))

    session_id = "shared-session-id"
    created = goals.goal_command_payload(
        session_id, "Finish alpha task", profile_home=profile_home, space_slug="alpha",
    )
    assert created["ok"] is True
    assert goals.goal_command_payload(
        session_id, "Beta task", profile_home=profile_home, space_slug="beta",
    )["ok"] is True

    # Simulate backend/manager recreation: state must be read from alpha's DB,
    # while the same session id in beta remains isolated.
    goals._DB_CACHE.clear()
    assert goals.goal_state_for_session(
        session_id, profile_home=profile_home, space_slug="alpha",
    )["goal"] == "Finish alpha task"
    assert goals.goal_state_for_session(
        session_id, profile_home=profile_home, space_slug="beta",
    )["goal"] == "Beta task"

    continuation = goals.CONTINUATION_PROMPT_TEMPLATE.format(goal="Finish alpha task")
    assert goals.queue_goal_continuation(
        session_id, continuation, profile_home=profile_home, space_slug="alpha",
    ) is True

    # Exercise the real stream-start continuation gate, stubbing only the
    # expensive agent worker and unrelated session/journal side effects.
    session = SimpleNamespace(
        session_id=session_id,
        profile="work",
        workspace_slug="alpha",
        space_slug=None,
        space=None,
        active_stream_id=None,
        workspace=str(tmp_path),
        model="deepseek-v4.1-flash",
        model_provider="ollama-cloud",
        pending_started_at=1.0,
    )
    launched = []

    class StubThread:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def start(self):
            launched.append(self.kwargs)

    monkeypatch.setattr("web.api.profiles.get_profile_home", lambda _profile: profile_home)
    monkeypatch.setattr(routes, "activate_kanban_orchestration", lambda *_args: None)
    monkeypatch.setattr(routes, "_prepare_chat_start_session_for_stream", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(routes, "set_last_workspace", lambda _workspace: None)
    monkeypatch.setattr(routes.threading, "Thread", StubThread)

    started = routes._start_chat_stream_for_session(
        session,
        msg=continuation,
        workspace=str(tmp_path),
        model="deepseek-v4.1-flash",
        model_provider="ollama-cloud",
    )
    assert started["session_id"] == session_id
    assert len(launched) == 1
    stream_id = started["stream_id"]
    assert routes.STREAM_GOAL_RELATED[stream_id] is True

    # The exact continuation is idempotent and cannot start a second worker.
    duplicate = routes._start_chat_stream_for_session(
        session,
        msg=continuation,
        workspace=str(tmp_path),
        model="deepseek-v4.1-flash",
        model_provider="ollama-cloud",
    )
    assert duplicate["_status"] == 409
    assert duplicate["error_code"] == "goal_continuation_cancelled"
    assert len(launched) == 1

    paused = goals.goal_command_payload(
        session_id, "pause", profile_home=profile_home, space_slug="alpha",
    )
    assert paused["ok"] is True
    goals._DB_CACHE.clear()
    assert goals.goal_state_for_session(
        session_id, profile_home=profile_home, space_slug="alpha",
    )["status"] == "paused"

    resumed = goals.goal_command_payload(
        session_id, "resume", profile_home=profile_home, space_slug="alpha",
    )
    assert resumed["ok"] is True
    assert resumed["goal"]["status"] == "active"
    goals._DB_CACHE.clear()
    assert goals.goal_state_for_session(
        session_id, profile_home=profile_home, space_slug="alpha",
    )["status"] == "active"

    cleared = goals.goal_command_payload(
        session_id, "clear", profile_home=profile_home, space_slug="alpha",
    )
    assert cleared["ok"] is True
    goals._DB_CACHE.clear()
    assert goals.goal_state_for_session(
        session_id, profile_home=profile_home, space_slug="alpha",
    ) is None
    assert goals.goal_state_for_session(
        session_id, profile_home=profile_home, space_slug="beta",
    )["goal"] == "Beta task"

    # Verify the persisted slot really belongs to the expected Space store.
    persisted_alpha = SessionDB(db_path=alpha_root / "goals.db").get_meta(f"goal:{session_id}")
    assert '"status": "cleared"' in persisted_alpha
    assert SessionDB(db_path=beta_root / "goals.db").get_meta(f"goal:{session_id}") is not None
    routes.STREAMS.pop(stream_id, None)
    routes.STREAM_GOAL_RELATED.pop(stream_id, None)
    goals._DB_CACHE.clear()
