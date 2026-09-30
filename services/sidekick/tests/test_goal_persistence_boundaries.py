"""Regression tests for profile and Space boundaries in persistent goals."""

import json
import threading

import pytest


def test_explicit_space_goal_is_stored_only_in_that_space(monkeypatch, tmp_path):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))

    from runtime._compat.shim_state import SessionDB
    from web.api import goals

    goals._DB_CACHE.clear()
    profile_home = tmp_path / "profiles" / "default"
    profile_home.mkdir(parents=True)
    space_root = tmp_path / "home" / "spaces" / "research"
    space_root.mkdir(parents=True)

    class Workspace:
        root = space_root

    monkeypatch.setattr(
        "web.api.space_engine.get_workspace",
        lambda slug: Workspace() if slug == "research" else None,
    )

    response = goals.goal_command_payload(
        "session-1",
        "Finish the research",
        profile_home=profile_home,
        space_slug="research",
    )

    assert response["ok"] is True
    assert response["goal"]["space"] == "research"
    space_db = SessionDB(db_path=space_root / "goals.db")
    assert json.loads(space_db.get_meta("goal:session-1"))["goal"] == "Finish the research"

    profile_db_path = profile_home / "state.db"
    assert not profile_db_path.exists()


def test_unresolvable_explicit_space_does_not_fall_back_to_profile_store(monkeypatch, tmp_path):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))

    from web.api import goals

    goals._DB_CACHE.clear()
    profile_home = tmp_path / "profiles" / "default"
    profile_home.mkdir(parents=True)
    monkeypatch.setattr("web.api.space_engine.get_workspace", lambda _slug: None)

    response = goals.goal_command_payload(
        "session-1",
        "Do not leak this goal",
        profile_home=profile_home,
        space_slug="deleted-space",
    )

    assert response["ok"] is False
    assert response["error"] == "unavailable"
    assert not (profile_home / "state.db").exists()


def test_goal_status_reads_the_requested_space_not_another_space(monkeypatch, tmp_path):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))

    from runtime._compat.shim_state import SessionDB
    from web.api import goals

    goals._DB_CACHE.clear()
    profile_home = tmp_path / "profiles" / "default"
    profile_home.mkdir(parents=True)
    root_a = tmp_path / "home" / "spaces" / "alpha"
    root_b = tmp_path / "home" / "spaces" / "beta"
    root_a.mkdir(parents=True)
    root_b.mkdir(parents=True)

    class Workspace:
        def __init__(self, root):
            self.root = root

    monkeypatch.setattr(
        "web.api.space_engine.get_workspace",
        lambda slug: Workspace(root_a if slug == "alpha" else root_b) if slug in {"alpha", "beta"} else None,
    )
    SessionDB(db_path=root_a / "goals.db").set_meta(
        "goal:session-1",
        json.dumps({
            "goal": "Only in alpha",
            "status": "active",
            "turns_used": 0,
            "max_turns": 20,
            "created_at": 1.0,
            "last_turn_at": 0.0,
        }),
    )

    response = goals.goal_command_payload(
        "session-1",
        "status",
        profile_home=profile_home,
        space_slug="beta",
    )

    assert response["ok"] is True
    assert response["goal"] is None
    assert not (profile_home / "state.db").exists()


def test_browser_goal_context_uses_the_owning_session_space(monkeypatch, tmp_path):
    """A background session must not inherit the currently selected Space's goal."""
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))

    from runtime._compat.shim_state import SessionDB
    from types import SimpleNamespace
    from web.api import goals
    from web.api.browser_runtime import _active_goal_context
    from web.api import profiles

    goals._DB_CACHE.clear()
    profile_base = tmp_path / "profile-base"
    monkeypatch.setattr(profiles, "_DEFAULT_SIDEKICK_HOME", profile_base)
    alpha_root = tmp_path / "home" / "spaces" / "alpha"
    beta_root = tmp_path / "home" / "spaces" / "beta"
    alpha_root.mkdir(parents=True)
    beta_root.mkdir(parents=True)

    class Workspace:
        def __init__(self, root):
            self.root = root

    monkeypatch.setattr(
        "web.api.space_engine.get_workspace",
        lambda slug: Workspace({"alpha": alpha_root, "beta": beta_root}[slug]),
    )
    monkeypatch.setattr("web.api.space_engine.resolve_active_space", lambda: Workspace(beta_root))
    monkeypatch.setattr(
        "web.api.models.get_session",
        lambda sid, metadata_only=False: SimpleNamespace(
            session_id=sid, profile="work", workspace_slug="alpha"
        ),
    )
    monkeypatch.setattr(
        "web.api.profiles.get_profile_home",
        lambda profile: profile_base / "profiles" / profile,
    )

    active = {
        "goal": "Goal belonging to alpha",
        "status": "active",
        "turns_used": 0,
        "max_turns": 20,
        "created_at": 1.0,
        "last_turn_at": 0.0,
    }
    other = {**active, "goal": "Unrelated beta goal"}
    SessionDB(db_path=alpha_root / "goals.db").set_meta(
        "goal:session-1", json.dumps(active)
    )
    SessionDB(db_path=beta_root / "goals.db").set_meta(
        "goal:session-1", json.dumps(other)
    )

    context = _active_goal_context("session-1")

    assert context["present"] is True
    assert context["goal"] == "Goal belonging to alpha"
    assert context["space"] == "alpha"


def test_browser_goal_context_falls_back_when_profile_home_cannot_resolve(monkeypatch, tmp_path):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))

    from types import SimpleNamespace
    from web.api import goals
    from web.api.browser_runtime import _active_goal_context

    goals._DB_CACHE.clear()
    monkeypatch.setattr(
        "web.api.models.get_session",
        lambda _sid, metadata_only=False: SimpleNamespace(
            profile="missing-profile", workspace_slug=None
        ),
    )

    def fail_profile_home(_profile):
        raise OSError("profile path is unavailable")

    monkeypatch.setattr("web.api.profiles.get_profile_home", fail_profile_home)

    context = _active_goal_context("legacy-session")

    assert context["available"] is True
    assert context["present"] is False
    assert "get_webui_home" not in context.get("error", "")


def test_goal_lifecycle_survives_manager_restarts_and_is_profile_scoped(monkeypatch, tmp_path):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))

    from web.api import goals

    goals._DB_CACHE.clear()
    monkeypatch.setattr(goals, "_space_goals_path", lambda *_args, **_kwargs: None)
    profile_a = tmp_path / "profiles" / "profile-a"
    profile_b = tmp_path / "profiles" / "profile-b"

    created = goals.goal_command_payload(
        "same-session-id", "Finish the task", profile_home=profile_a,
    )
    assert created["ok"] is True
    other_profile = goals.goal_command_payload(
        "same-session-id", "Separate task", profile_home=profile_b,
    )
    assert other_profile["ok"] is True

    paused = goals.goal_command_payload(
        "same-session-id", "pause", profile_home=profile_a,
    )
    assert paused["goal"]["status"] == "paused"
    goals._DB_CACHE.clear()  # Force a fresh SessionDB/GoalManager after restart.
    assert goals.goal_state_for_session(
        "same-session-id", profile_home=profile_a,
    )["status"] == "paused"
    assert goals.goal_state_for_session(
        "same-session-id", profile_home=profile_b,
    )["goal"] == "Separate task"

    resumed = goals.goal_command_payload(
        "same-session-id", "resume", profile_home=profile_a,
    )
    assert resumed["goal"]["status"] == "active"
    goals._DB_CACHE.clear()
    monkeypatch.setattr(goals, "judge_goal", lambda *_args, **_kwargs: ("done", "completed", False))
    decision = goals.evaluate_goal_after_turn(
        "same-session-id", "done", profile_home=profile_a,
    )
    assert decision["status"] == "done"
    goals._DB_CACHE.clear()
    assert goals.goal_state_for_session(
        "same-session-id", profile_home=profile_a,
    )["status"] == "done"

    cleared = goals.goal_command_payload(
        "same-session-id", "clear", profile_home=profile_a,
    )
    assert cleared["ok"] is True
    goals._DB_CACHE.clear()
    assert goals.goal_state_for_session(
        "same-session-id", profile_home=profile_a,
    ) is None
    assert goals.goal_state_for_session(
        "same-session-id", profile_home=profile_b,
    )["goal"] == "Separate task"


@pytest.mark.parametrize(("user_action", "expected_status"), [("pause", "paused"), ("clear", None)])
def test_slow_goal_judge_cannot_overwrite_concurrent_user_action(
    monkeypatch, tmp_path, user_action, expected_status,
):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))

    from web.api import goals

    goals._DB_CACHE.clear()
    monkeypatch.setattr(goals, "_space_goals_path", lambda *_args, **_kwargs: None)
    profile_home = tmp_path / "profiles" / "default"
    session_id = f"judge-race-{user_action}"
    assert goals.goal_command_payload(
        session_id, "Finish the task", profile_home=profile_home,
    )["ok"] is True

    judge_started = threading.Event()
    finish_judge = threading.Event()
    evaluation = {}

    def blocked_judge(*_args, **_kwargs):
        judge_started.set()
        assert finish_judge.wait(timeout=3)
        return "continue", "not done yet", False

    monkeypatch.setattr(goals, "judge_goal", blocked_judge)

    def evaluate():
        evaluation["decision"] = goals.evaluate_goal_after_turn(
            session_id, "Still working", profile_home=profile_home,
        )

    worker = threading.Thread(target=evaluate)
    worker.start()
    assert judge_started.wait(timeout=3)

    control = goals.goal_command_payload(
        session_id, user_action, profile_home=profile_home,
    )
    assert control["ok"] is True
    finish_judge.set()
    worker.join(timeout=3)

    assert not worker.is_alive()
    assert evaluation["decision"]["verdict"] == "stale"
    assert evaluation["decision"]["should_continue"] is False
    goals._DB_CACHE.clear()
    state = goals.goal_state_for_session(session_id, profile_home=profile_home)
    if expected_status is None:
        assert state is None
    else:
        assert state["status"] == expected_status
        assert state["turns_used"] == 0


def test_profile_goal_without_space_does_not_follow_active_space(monkeypatch, tmp_path):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))

    from runtime._compat.shim_state import SessionDB
    from web.api import goals

    goals._DB_CACHE.clear()
    profile_home = tmp_path / "profiles" / "work"
    active_space_root = tmp_path / "home" / "spaces" / "currently-selected"
    profile_home.mkdir(parents=True)
    active_space_root.mkdir(parents=True)
    active_space_lookups = []

    def active_space_path(space_slug=None, *, profile_home=None):
        active_space_lookups.append(space_slug)
        return active_space_root / "goals.db"

    monkeypatch.setattr(goals, "_space_goals_path", active_space_path)

    response = goals.goal_command_payload(
        "same-session-id",
        "Profile-owned goal",
        profile_home=profile_home,
        space_slug=None,
    )

    assert response["ok"] is True
    assert goals.goal_state_for_session(
        "same-session-id", profile_home=profile_home, space_slug=None,
    )["goal"] == "Profile-owned goal"
    assert active_space_lookups == []
    assert not (active_space_root / "goals.db").exists()
    assert SessionDB(db_path=profile_home / "state.db").get_meta(
        "goal:same-session-id"
    )


def test_goal_state_exposes_only_an_unconsumed_continuation_for_renderer_recovery(monkeypatch, tmp_path):
    from web.api import goals

    monkeypatch.setattr(goals, "judge_goal", lambda *_args, **_kwargs: ("continue", "keep going", False))
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))
    goals._DB_CACHE.clear()
    monkeypatch.setattr(goals, "_space_goals_path", lambda *_args, **_kwargs: None)
    profile_home = tmp_path / "profiles" / "work"
    profile_home.mkdir(parents=True)
    session_id = "renderer-recovery-session"

    response = goals.goal_command_payload(
        session_id,
        "Finish the release audit",
        profile_home=profile_home,
    )
    assert response["kickoff_prompt"]

    # The initial turn has not yet consumed the kickoff, so a restored renderer
    # may recover it if the app closed before starting the chat request.
    initial = goals.goal_state_for_session(
        session_id, profile_home=profile_home,
    )
    assert "Finish the release audit" in initial["continuation_prompt"]
    assert initial["continuation_prompt"] != response["kickoff_prompt"]

    manager = goals._manager(
        session_id, profile_home=profile_home,
    )
    assert manager.consume_continuation() is True
    consumed = goals.goal_state_for_session(
        session_id, profile_home=profile_home,
    )
    assert "continuation_prompt" not in consumed

    decision = goals.evaluate_goal_after_turn(
        session_id,
        "The first pass is complete; one release check remains.",
        profile_home=profile_home,
    )
    assert decision["should_continue"] is True
    pending = goals.goal_state_for_session(
        session_id, profile_home=profile_home,
    )
    assert pending["continuation_prompt"] == decision["continuation_prompt"]

    goals.goal_command_payload(
        session_id, "pause", profile_home=profile_home,
    )
    paused = goals.goal_state_for_session(
        session_id, profile_home=profile_home,
    )
    assert paused["status"] == "paused"
    assert "continuation_prompt" not in paused


def test_goal_set_reports_persistence_failure_instead_of_claiming_success(monkeypatch, tmp_path):
    from web.api import goals

    class FailingWriteDB:
        def get_meta(self, _key):
            return None

        def set_meta(self, _key, _value):
            raise OSError("database is read-only")

    monkeypatch.setattr(goals, "_profile_db", lambda *_args, **_kwargs: FailingWriteDB())

    response = goals.goal_command_payload(
        "session-1",
        "Persist me",
        profile_home=tmp_path / "profile",
    )

    assert response["ok"] is False
    assert response["error"] == "persistence_failed"
    assert response["goal"] is None


def test_goal_status_reports_unavailable_when_persistent_store_cannot_be_read(monkeypatch, tmp_path):
    from web.api import goals

    class FailingReadDB:
        def get_meta(self, _key):
            raise OSError("database is unavailable")

    monkeypatch.setattr(goals, "_profile_db", lambda *_args, **_kwargs: FailingReadDB())

    response = goals.goal_command_payload(
        "session-1",
        "status",
        profile_home=tmp_path / "profile",
    )

    assert response["ok"] is False
    assert response["error"] == "unavailable"


def test_corrupt_persisted_goal_fails_closed_instead_of_appearing_absent(monkeypatch, tmp_path):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))

    from runtime._compat.shim_state import SessionDB
    from web.api import goals

    goals._DB_CACHE.clear()
    monkeypatch.setattr(goals, "_space_goals_path", lambda *_args, **_kwargs: None)
    profile_home = tmp_path / "profiles" / "default"
    profile_home.mkdir(parents=True)
    db = SessionDB(db_path=profile_home / "state.db")
    db.set_meta("goal:session-1", "{not valid json")

    response = goals.goal_command_payload(
        "session-1", "status", profile_home=profile_home,
    )

    assert response["ok"] is False
    assert response["error"] == "unavailable"
    assert db.get_meta("goal:session-1") == "{not valid json"


def test_goal_pause_reports_failure_if_store_becomes_unavailable(monkeypatch, tmp_path):
    from web.api import goals

    manager = goals._ProfileGoalManager("session-1", profile_home=tmp_path)
    manager.set("Keep this goal")
    monkeypatch.setattr(goals, "_manager", lambda *_args, **_kwargs: manager)
    monkeypatch.setattr(goals, "_profile_db", lambda *_args, **_kwargs: None)

    response = goals.goal_command_payload(
        "session-1", "pause", profile_home=tmp_path,
    )

    assert response["ok"] is False
    assert response["error"] == "persistence_failed"
