"""Real SQLite CAS/receipt/ownership checks on the existing scoped goal engine."""
import json
import threading
import subprocess
import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

import pytest


@pytest.fixture
def scoped(monkeypatch, tmp_path):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "base"))
    from web.api import goals
    goals._DB_CACHE.clear()
    home = tmp_path / "profile"
    home.mkdir()
    def call(args, revision=None, request_id=None, **kwargs):
        return goals.goal_command_payload("session", args, profile_home=home,
            expected_revision=revision, client_request_id=request_id, **kwargs)
    yield goals, home, call
    for db in list(goals._DB_CACHE.values()):
        db.close()
    goals._DB_CACHE.clear()


def test_legacy_record_has_explicit_owner_and_initial_revision():
    from cli.goals import GoalState
    state = GoalState.from_json('{"goal":"Legacy"}')
    assert state.revision == 0
    assert state.continuation_owner == "legacy_chat"
    assert state.owner_run_id is None


@pytest.mark.parametrize("fields", [{"revision": True}, {"revision": -1}, {"continuation_owner": "unknown"},
    {"continuation_owner": "independent_run", "owner_run_id": {"wrong": "type"}}])
def test_corrupt_revision_or_owner_does_not_gain_legacy_authority(fields):
    from cli.goals import GoalState
    with pytest.raises(ValueError):
        GoalState.from_json(json.dumps({"goal": "Existing", **fields}))


def test_revisions_survive_clear_and_restart(scoped):
    goals, home, call = scoped
    started = call("Verify delivery", 0, "start")
    assert started["goal"]["revision"] == 1
    assert started["goal"]["continuation_owner"] == "legacy_chat"
    paused = call("pause", 1, "pause")
    assert paused["revision"] == 2
    assert call("clear", 2, "clear")["revision"] == 3
    assert call("status")["revision"] == 3
    restarted = call("New objective", 3, "restart")
    assert restarted["goal"]["revision"] == 4
    assert (home / "state.db").exists()


def test_request_retry_cannot_restart_kickoff(scoped):
    goals, _, call = scoped
    first = call("Verify delivery", 0, "same-request")
    assert first["kickoff_prompt"] == "Verify delivery"
    # A fresh cache represents HTTP retry after backend restart.
    goals._DB_CACHE.clear()
    replay = call("Verify delivery", 0, "same-request")
    assert replay["replayed"] is True
    assert "kickoff_prompt" not in replay
    assert replay["revision"] == 1
    assert call("Changed text", 0, "same-request")["error"] == "request_identity_conflict"


@pytest.mark.parametrize("command", ["pause", "resume", "clear", "Replacement goal"])
def test_stale_controls_do_not_mutate_newer_goal(scoped, command):
    _, _, call = scoped
    call("First", 0, "first")
    call("Second", 1, "second")
    assert call(command, 1, "stale")["error"] == "goal_revision_conflict"
    latest = call("status")
    assert latest["goal"]["goal"] == "Second"
    assert latest["revision"] == 2


def test_race_after_command_reservation_does_not_pause_replacement(scoped, monkeypatch):
    goals, _, call = scoped
    call("First", 0, "first")
    reached, release = threading.Event(), threading.Event()
    original = goals._goal_command_payload
    def delayed(sid, args="", **kwargs):
        if args == "pause":
            reached.set()
            assert release.wait(5)
        return original(sid, args, **kwargs)
    monkeypatch.setattr(goals, "_goal_command_payload", delayed)
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(call, "pause", 1, "delayed-pause")
        assert reached.wait(5)
        assert call("Second", 1, "replacement")["ok"] is True
        release.set()
        assert pending.result()["error"] == "goal_revision_conflict"
    assert call("status")["goal"]["goal"] == "Second"


def test_two_manager_instances_cannot_overwrite_each_other(scoped):
    goals, home, call = scoped
    from cli.goals import GoalRevisionConflict
    call("First", 0, "first")
    old = goals._ProfileGoalManager("session", profile_home=home)
    newer = goals._ProfileGoalManager("session", profile_home=home)
    newer.set("Second")
    with pytest.raises(GoalRevisionConflict):
        old.pause()
    assert call("status")["goal"]["goal"] == "Second"


def test_cross_process_compare_and_swap_has_one_winner(scoped):
    goals, home, call = scoped
    call("First", 0, "first")
    db_path = home / "state.db"
    code = """
import sys
from types import SimpleNamespace
sys.path.insert(0, sys.argv[1])
from cli.goals import GoalState, GoalRevisionConflict, persist_goal_state
try:
    persist_goal_state(SimpleNamespace(db_path=sys.argv[2]), 'session', GoalState(goal=sys.argv[3], revision=1))
except GoalRevisionConflict:
    raise SystemExit(3)
"""
    backend = str(Path(__file__).resolve().parents[1])
    workers = [subprocess.Popen([sys.executable, "-I", "-B", "-c", code, backend, str(db_path), name],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE) for name in ("Process A", "Process B")]
    results = []
    try:
        for worker in workers:
            out, err = worker.communicate(timeout=15)
            assert not err, err.decode(errors="replace")
            results.append(worker.returncode)
    finally:
        for worker in workers:
            if worker.poll() is None:
                worker.kill()
                worker.wait(timeout=5)
    assert sorted(results) == [0, 3]
    assert call("status")["revision"] == 2


def test_durable_continuation_claim_cannot_be_owned_twice(scoped):
    goals, home, call = scoped
    call("First", 0, "first")
    first = goals._ProfileGoalManager("session", profile_home=home)
    second = goals._ProfileGoalManager("session", profile_home=home)
    assert first.consume_continuation() is True
    assert second.consume_continuation() is False
    assert call("status")["revision"] == 2


def test_atomic_receipt_recovers_crash_after_state_commit(scoped, monkeypatch):
    goals, home, call = scoped
    db = goals._profile_db(home)
    original = db.set_meta
    def fail_response_receipt(key, value):
        if key.startswith("goal-command:"):
            raise OSError("controlled receipt-finalization interruption")
        return original(key, value)
    monkeypatch.setattr(db, "set_meta", fail_response_receipt)
    assert call("First", 0, "interrupted")["ok"] is False
    monkeypatch.setattr(db, "set_meta", original)
    replay = call("First", 0, "interrupted")
    assert replay["ok"] is True and replay["replayed"] is True
    assert replay["goal"]["goal"] == "First"
    assert "kickoff_prompt" not in replay
    assert replay["revision"] == 1


def test_owner_transfer_invalidates_legacy_continuation(scoped):
    goals, home, call = scoped
    first = call("First", 0, "first")
    manager = goals._ProfileGoalManager("session", profile_home=home)
    prompt = manager.next_continuation_prompt()
    assert goals.queue_goal_continuation("session", prompt, profile_home=home)
    state = goals.transfer_goal_continuation_owner("session", profile_home=home, space_slug=None,
        expected_revision=1, continuation_owner="independent_run", owner_run_id="owning-run")
    assert state["revision"] == 2
    assert goals.consume_goal_continuation("session", prompt, profile_home=home) == "cancelled"
    assert goals.goal_state_for_session("session", profile_home=home).get("continuation_prompt") is None
    assert call("resume", 2, "resume")["error"] == "goal_owned_by_run"
    assert call("pause")["error"] == "goal_owned_by_run"
    assert goals.evaluate_goal_after_turn("session", "old response", profile_home=home)["verdict"] == "foreign_owner"


def test_model_text_cannot_become_human_control(scoped):
    _, _, call = scoped
    assert call("First", 0, "model-command", source_actor="assistant")["error"] == "human_command_required"
    assert call("status")["goal"] is None
    assert call("First", None, "unrevisioned")["error"] == "missing_revision"


def test_judge_resume_does_not_hold_database_lock_over_network(scoped, monkeypatch):
    goals, home, call = scoped
    call("First", 0, "first")
    manager = goals._ProfileGoalManager("session", profile_home=home)
    manager.state.pending_judge_response = "Saved response"
    manager.pause("judge unavailable")
    reached, release = threading.Event(), threading.Event()
    def judge(*args, **kwargs):
        reached.set()
        assert release.wait(5)
        return "continue", "More work", False
    monkeypatch.setattr(goals, "judge_goal", judge)
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(call, "resume", 2, "slow-resume")
        assert reached.wait(5)
        assert call("clear", 2, "clear-during-judge")["ok"] is True
        release.set()
        pending.result()
    assert call("status")["goal"] is None
    assert call("status")["revision"] == 3
