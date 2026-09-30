"""Regression tests: smoke-test goal cleanup + orphaned goal hygiene.

Bug (observed 2026-09-14, live nova goals.db): the WebUI smoke test's
``_check_goal_reload_resume_autostarts`` set an active goal via ``/api/goal``
but its ``finally`` cleanup only cancelled the stream and deleted the session —
it never called ``/api/goal clear``. ``/api/session/delete`` does not remove the
``goal:{session_id}`` row from the space's ``goals.db`` either, so every smoke
run leaked an orphaned **active** goal: 81 stale ``Smoke reload continuation``
goals accumulated in the live nova goals.db (96 rows total, 83% garbage).

Two guards:
1. The smoke script must clear the goal it created before deleting the session.
2. The session-delete route clears the persistent goal before removing the
   session, and the goals API reports cleared state as ``None``.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
SMOKE_SCRIPT = REPO_ROOT / "scripts" / "browser_webui_smoke.py"


def test_smoke_goal_check_clears_goal_in_cleanup() -> None:
    """The reload-resume check's finally block must clear the goal it set."""
    source = SMOKE_SCRIPT.read_text(encoding="utf-8")
    start = source.find("def _check_goal_reload_resume_autostarts")
    assert start != -1, "goal reload-resume check not found"
    end = source.find("\ndef ", start + 1)
    body = source[start:end if end != -1 else len(source)]

    assert '"args": goal_text' in body, "goal check no longer sets a goal — update this guard"
    # The cleanup (finally block) must clear the goal for the created session.
    finally_idx = body.find("finally:")
    assert finally_idx != -1, "goal check lost its finally cleanup"
    cleanup = body[finally_idx:]
    assert "/api/goal" in cleanup and '"clear"' in cleanup, (
        "smoke goal check deletes the session without clearing its goal — "
        "session deletion does not remove the goal:{session_id} row from the "
        "space goals.db, so every run leaks an orphaned active goal"
    )
    # The clear must happen before the session delete for deterministic ordering.
    assert cleanup.find('"clear"') < cleanup.find('"/api/session/delete"'), (
        "goal clear should run before the session delete"
    )


def test_session_delete_clears_goal_before_removing_session():
    """The API must own goal cleanup instead of relying on each caller."""
    source = (REPO_ROOT / "web" / "api" / "routes.py").read_text(encoding="utf-8")
    start = source.find('if parsed.path == "/api/session/delete":')
    assert start != -1
    end = source.find('\n    if parsed.path == "/api/session/clear":', start)
    body = source[start:end]
    assert 'goal_command_payload(' in body and '"clear"' in body
    assert body.find('goal_command_payload(') < body.find('_mark_session_deleted(sid)')
    assert 'cancel_goal_continuation(' in body


def test_goal_clear_removes_state_from_space_store(monkeypatch, tmp_path):
    """Clearing a goal must make goal_state_for_session return None (space store)."""
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))

    from runtime._compat.shim_state import SessionDB
    from web.api import goals, space_engine
    from web.api.goals import goal_command_payload, goal_state_for_session

    space_root = tmp_path / "home" / "spaces" / "color"
    space_root.mkdir(parents=True)
    # Pin the registry and its caches to this fixture; other tests may already
    # have imported SpaceEngine under another SIDEKICK_HOME.
    monkeypatch.setattr(space_engine, "_spaces_root", lambda: tmp_path / "home" / "spaces")
    monkeypatch.setattr(space_engine, "_SPACE_CACHE", None)
    monkeypatch.setattr(space_engine, "_SPACE_CACHE_ROOTS", None)
    monkeypatch.setattr(space_engine, "_SPACE_CACHE_TS", 0.0)
    monkeypatch.setattr(goals, "_DB_CACHE", {})
    db = SessionDB(db_path=space_root / "goals.db")
    db.set_meta("goal:smoke-session", json.dumps({"goal": "orphaned", "status": "active", "turns_used": 0, "max_turns": 20, "created_at": 0.0, "last_turn_at": 0.0}))

    # The store has an orphaned active goal for a session that no longer exists.
    profile_home = tmp_path / "home"
    assert goal_state_for_session(
        "smoke-session", profile_home=profile_home, space_slug="color"
    ) is not None

    payload = goal_command_payload(
        "smoke-session", "clear", profile_home=profile_home, space_slug="color"
    )
    assert payload["ok"] is True
    assert payload["action"] == "clear"

    # After the clear, the goal must be gone from every read surface.
    assert goal_state_for_session(
        "smoke-session", profile_home=profile_home, space_slug="color"
    ) is None
    status = goal_command_payload(
        "smoke-session", "status", profile_home=profile_home, space_slug="color"
    )
    assert status["goal"] is None
    assert status["message_key"] == "goal_status_none"
