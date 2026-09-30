"""Regression tests for profile and Space boundaries in persistent goals."""

import json


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
