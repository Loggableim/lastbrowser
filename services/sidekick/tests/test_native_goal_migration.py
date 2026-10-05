"""Temporary actual SQLite/ProfileHub/Session proofs; never a user database."""
from contextlib import closing
import json
import sqlite3

import pytest

from runtime.independent import native_goal_migration as migration
from runtime.independent.contracts import Scope, new_id
from runtime.independent.scope_binding import ProfileHub
from runtime.independent.store import IdempotencyConflict, ResourceBusy, RevisionConflict, StateConflict
from web.api import config, goals, independent
from web.api.models import Session


@pytest.fixture
def owned(tmp_path, monkeypatch):
    home, workspace = tmp_path / "base", tmp_path / "project"
    home.mkdir(); workspace.mkdir()
    state = home / "state" / "webui"
    state.mkdir(parents=True)
    (state / "workspaces.json").write_text(json.dumps([{"path": str(workspace), "name": "Project"}]), "utf-8")
    hub = ProfileHub(home)
    bound = hub.bind("default", {"workspacePath": str(workspace), "browserProfileId": "browser-a",
                                 "partitionKey": "persist:migration-a"})
    scope = Scope.model_validate(bound["scope"])
    store, resolver = hub.by_scope(scope, "default")
    resolved = resolver.resolve(scope, authenticated_profile_name="default")
    resolved.space.sessions_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(independent, "hub", lambda: hub)
    source_slug = goals.lastbrowser_workspace_goal_slug(workspace)
    session = Session(session_id="saved-goal-chat", title="Actual saved chat", model="controlled-model",
        profile="default", workspace=str(workspace), workspace_slug=resolved.space.slug,
        goal_space_slug=source_slug, space_scope=bound["scope"],
        messages=[{"role": "user", "content": "Keep this actual transcript"}],
        context_messages=[{"role": "assistant", "content": "Actual compressed context"}])
    session.save(touch_updated_at=False, skip_index=True)
    session_path = resolved.space.sessions_dir / (session.session_id + ".json")
    raw_session = json.loads(session_path.read_text("utf-8"))
    raw_session["unknown_future_metadata"] = {"preserve": ["this", 7]}
    session_path.write_text(json.dumps(raw_session), "utf-8")
    source = home / "browser-spaces" / source_slug / "goals.db"
    source.parent.mkdir(parents=True)
    source_goal = {"goal": "Preserve the real standing goal", "status": "paused", "revision": 7,
        "turns_used": 3, "max_turns": 9, "continuation_owner": "legacy_chat", "owner_run_id": None,
        "_goal_run_id": new_id(), "consumed_continuation_turn": 3,
        "recent_assistant_responses": ["Real earlier result"], "paused_reason": "human",
        "future_goal_metadata": {"exact": True}}
    serialized_goal = json.dumps(source_goal, ensure_ascii=False, indent=2)
    with closing(sqlite3.connect(source)) as connection:
        connection.execute("CREATE TABLE state_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
        connection.execute("INSERT INTO state_meta VALUES(?,?)", ("goal:" + session.session_id, serialized_goal))
        connection.execute("INSERT INTO state_meta VALUES(?,?)", ("goal-command:historical-own-claim",
            json.dumps({"state": "complete", "goal": source_goal, "result": {"ok": True}})))
        connection.commit()
    review = migration.inspect_native_goal_migration(session, actor="default", scope=scope, profile_hub=hub)
    request = migration.NativeGoalMigrationRequest(scope=scope, session_id=session.session_id,
        expected_source_revision=review["sourceRevision"], expected_source_digest=review["sourceDigest"],
        client_request_id=new_id())
    target = resolved.space_root / "goals.db"
    def apply(request_override=None, actor="default"):
        with config._get_session_agent_lock(session.session_id):
            return migration.migrate_native_goal(session, request_override or request,
                actor=actor, generation="actual-parent-generation", profile_hub=hub)
    yield dict(locals())
    hub.close()


def read_goal(path, sid):
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as connection:
        return connection.execute("SELECT value FROM state_meta WHERE key=?", ("goal:" + sid,)).fetchone()[0]


def test_readonly_review_and_exact_raw_migration_preserve_full_saved_history(owned, monkeypatch):
    old_bytes = owned["source"].read_bytes()
    before = json.loads(owned["session_path"].read_text("utf-8"))
    assert not owned["target"].exists()
    assert owned["review"]["sourceRevision"] == 7 and not owned["review"]["targetConflict"]
    assert owned["source"].read_bytes() == old_bytes
    import subprocess, threading
    def forbidden(*args, **kwargs):
        raise AssertionError("Migration must never start execution")
    monkeypatch.setattr(subprocess, "Popen", forbidden)
    monkeypatch.setattr(threading, "Thread", forbidden)
    result = owned["apply"]()
    after = json.loads(owned["session_path"].read_text("utf-8"))
    assert after == {**before, "goal_space_slug": owned["resolved"].space.slug}
    assert read_goal(owned["target"], owned["session"].session_id) == owned["serialized_goal"]
    assert owned["source"].read_bytes() == old_bytes
    assert result["goalRevision"] == 7 and result["continuationStarted"] is False
    assert owned["store"].list_leases() == ()
    assert owned["apply"]()["replayed"] is True


def test_actual_target_conflict_cannot_overwrite_an_existing_goal(owned):
    with closing(sqlite3.connect(owned["target"])) as connection:
        connection.execute("CREATE TABLE state_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
        connection.execute("INSERT INTO state_meta VALUES(?,?)", ("goal:" + owned["session"].session_id,
            json.dumps({"goal": "Target already has a goal", "status": "paused", "revision": 42})))
        connection.commit()
    target_before = owned["target"].read_bytes()
    with pytest.raises(StateConflict): owned["apply"]()
    assert owned["target"].read_bytes() == target_before
    assert owned["session"].goal_space_slug == owned["source_slug"]


@pytest.mark.parametrize("boundary", ["after_copy", "after_namespace"])
def test_crash_recovery_same_uuid_finishes_verified_copy_without_execution(owned, monkeypatch, boundary):
    if boundary == "after_copy":
        original = migration._save_namespace
        def fail(*args, **kwargs): raise RuntimeError("Controlled crash after durable DB copy")
        monkeypatch.setattr(migration, "_save_namespace", fail)
    else:
        original = owned["store"].record_request_result
        def fail(scope, operation, *args, **kwargs):
            if operation == migration._COMMIT: raise RuntimeError("Controlled crash after namespace save")
            return original(scope, operation, *args, **kwargs)
        monkeypatch.setattr(owned["store"], "record_request_result", fail)
    with pytest.raises(RuntimeError): owned["apply"]()
    assert read_goal(owned["target"], owned["session"].session_id) == owned["serialized_goal"]
    if boundary == "after_copy": monkeypatch.setattr(migration, "_save_namespace", original)
    else: monkeypatch.setattr(owned["store"], "record_request_result", original)
    # Replace the actual Hub/store connection, as during parent restart.
    owned["hub"].close()
    replacement = ProfileHub(owned["home"])
    try:
        restored = Session(**json.loads(owned["session_path"].read_text("utf-8")))
        result = migration.migrate_native_goal(restored, owned["request"], actor="default",
            generation="restarted-parent-generation", profile_hub=replacement)
        assert result["state"] == "migrated"
        assert restored.goal_space_slug == owned["resolved"].space.slug
        assert result["continuationStarted"] is False
    finally: replacement.close()


def test_prepared_retry_rejects_different_content_and_changed_source(owned, monkeypatch):
    original = migration._save_namespace
    monkeypatch.setattr(migration, "_save_namespace", lambda *args: (_ for _ in ()).throw(RuntimeError("controlled")))
    with pytest.raises(RuntimeError): owned["apply"]()
    monkeypatch.setattr(migration, "_save_namespace", original)
    changed = owned["request"].model_copy(update={"expected_source_revision": 8})
    with pytest.raises((IdempotencyConflict, RevisionConflict)): owned["apply"](changed)
    with closing(sqlite3.connect(owned["source"])) as connection:
        raw = {**owned["source_goal"], "revision": 8, "goal": "Newer actual source goal"}
        connection.execute("UPDATE state_meta SET value=? WHERE key=?", (json.dumps(raw), "goal:" + owned["session"].session_id))
        connection.commit()
    with pytest.raises(RevisionConflict): owned["apply"]()
    assert read_goal(owned["target"], owned["session"].session_id) == owned["serialized_goal"]


@pytest.mark.parametrize("blocker", ["writer", "queued", "claimed", "pending_command", "unknown_stream", "pending_user"])
def test_unsettled_owner_or_continuation_never_creates_target(owned, blocker):
    lease = None
    key = goals._continuation_key(owned["session"].session_id,
        profile_home=owned["home"], space_slug=owned["source_slug"])
    if blocker == "writer":
        lease = owned["store"].acquire_chat_writer(owned["scope"], owned["session"].session_id, "other-owner", "other-generation")
    elif blocker == "queued": goals._PENDING_CONTINUATIONS[key] = "actual queued continuation"
    elif blocker == "claimed": goals._IN_FLIGHT_CONTINUATIONS.add((*key, 3))
    elif blocker == "pending_command":
        with closing(sqlite3.connect(owned["source"])) as connection:
            connection.execute("INSERT INTO state_meta VALUES(?,?)", ("goal-command:pending", json.dumps({"state": "pending"})))
            connection.commit()
    else:
        raw = json.loads(owned["session_path"].read_text("utf-8"))
        raw["active_stream_id" if blocker == "unknown_stream" else "pending_user_message"] = "unverified"
        owned["session_path"].write_text(json.dumps(raw), "utf-8")
    try:
        with pytest.raises(ResourceBusy): owned["apply"]()
        assert not owned["target"].exists()
    finally:
        goals._PENDING_CONTINUATIONS.pop(key, None)
        goals._IN_FLIGHT_CONTINUATIONS.discard((*key, 3))
        if lease: owned["store"].release_lease(lease["leaseId"], owner_generation="other-generation")


@pytest.mark.parametrize("invalid", ["actor", "revoked", "metadata", "foreign_hash", "legacy_unbound"])
def test_scope_revocation_or_non_native_session_never_migrates(owned, invalid):
    actor = "default"
    if invalid == "actor": actor = "foreign"
    elif invalid == "revoked": owned["store"].tombstone_binding(owned["scope"], expected_revision=1)
    elif invalid == "metadata": owned["session"]._loaded_metadata_only = True
    elif invalid == "legacy_unbound": owned["session"].space_scope = None
    else:
        raw = json.loads(owned["session_path"].read_text("utf-8"))
        raw["goal_space_slug"] = "lbws-" + "a" * 32
        owned["session_path"].write_text(json.dumps(raw), "utf-8")
    old = owned["source"].read_bytes()
    with pytest.raises((PermissionError, StateConflict, ValueError)):
        owned["apply"](actor=actor)
    assert not owned["target"].exists() and owned["source"].read_bytes() == old


def test_missing_source_never_creates_an_empty_goal_database(owned):
    owned["source"].unlink()
    with pytest.raises(StateConflict): owned["apply"]()
    assert not owned["source"].exists() and not owned["target"].exists()
