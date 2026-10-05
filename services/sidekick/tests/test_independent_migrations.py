"""Crash, transaction, idempotency and event recovery behavior in real SQLite."""
from __future__ import annotations

import sqlite3
import json
import os
import subprocess
import sys
import threading
from pathlib import Path
from datetime import datetime, timedelta, timezone

import pytest

from runtime.independent.contracts import (
    ActionRecord, AgentDefinition, ApprovalView, BackendProfileRef, Budget,
    PermissionScope, ProviderSelection, RunContext, RunView, Scope, SpaceBinding,
    TaskDispatchRequest, canonical_json, new_id, utc_now,
)
from runtime.independent.migrations import SchemaVersionError, current_version, SCHEMA_VERSION
from runtime.independent.store import IndependentStore, IdempotencyConflict, ResourceBusy, RevisionConflict, StateConflict


def initialized(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    scope = Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id="default")
    store = IndependentStore(home, scope.backend_profile_id)
    store.register_profile(BackendProfileRef(backend_profile_id=scope.backend_profile_id, name="default", canonical_home=str(home)))
    store.bind_space(SpaceBinding(scope=scope, native_slug="research", partition_key="persist:scope_test"))
    state = store.ensure_assistant(scope)
    source = new_id()
    state = store.update_assistant(scope, state.revision, lambda value: value.model_copy(update={"messages": ({"id": source, "role": "user", "content": "Research the controlled page"},)}))
    request = TaskDispatchRequest(client_request_id=new_id(), scope=scope, assistant_conversation_id=state.conversation_id, source_message_id=source, kind="start_chat", title="Research", instruction="Research the controlled page")
    definition = AgentDefinition(definition_id=new_id(), scope=scope, title="Research", instruction=request.instruction, provider=ProviderSelection(provider_config_ref="test-provider", model="test-model"))
    store.put_definition(definition)
    return home, scope, store, request, definition


def run_started(home, scope, store, request, definition):
    dispatch, _ = store.reserve_dispatch(request)
    now, run_id = utc_now(), new_id()
    context = RunContext(run_id=run_id, dispatch_id=dispatch.dispatch_id, scope=scope, resolved_profile_home=str(home), resolved_space_root=str(home), partition_key="persist:scope_test", binding_revision=1, provider=definition.provider, effective_permissions=PermissionScope(), runner_generation=new_id(), cancellation_token=new_id())
    run = RunView(run_id=run_id, dispatch_id=dispatch.dispatch_id, scope=scope, definition_id=definition.definition_id, definition_revision=1, created_at=now, updated_at=now, target_session_id=dispatch.target_session_id)
    store.create_run(run, context)
    run = store.transition_run(run_id, "running", expected_revision=1)
    return run, context


def action(run):
    return ActionRecord(action_id=new_id(), run_id=run.run_id, step_id="read-1", scope=run.scope, tool_id="browser_read", canonical_args_digest="a" * 64, intended_effect="read", authorization_ref="user-order", permission_revision=1, control_epoch=run.control_epoch)


def test_migration_preserves_legacy_sessions_messages_and_user_version(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    path = home / "state.db"
    connection = sqlite3.connect(path)
    connection.executescript("CREATE TABLE sessions(session_id TEXT PRIMARY KEY,title TEXT);INSERT INTO sessions VALUES('existing','User work');PRAGMA user_version=42;")
    connection.commit()
    connection.close()
    with IndependentStore(home, new_id()) as store:
        assert current_version(store._conn) == SCHEMA_VERSION
        assert store._conn.execute("SELECT title FROM sessions WHERE session_id='existing'").fetchone()[0] == "User work"
        assert store._conn.execute("PRAGMA user_version").fetchone()[0] == 42
        assert store._conn.execute("SELECT COUNT(*) FROM ia_schema_migrations").fetchone()[0] == SCHEMA_VERSION


def test_readonly_store_does_not_create_migration_or_write(tmp_path):
    home, scope, store, _, _ = initialized(tmp_path)
    store.close()
    with IndependentStore(home, scope.backend_profile_id, initialize=False) as readonly:
        assert readonly.get_assistant(scope)
        with pytest.raises(Exception, match="Read-only"):
            readonly.ensure_assistant(scope)
    missing = tmp_path / "empty"
    missing.mkdir()
    with pytest.raises(sqlite3.OperationalError):
        IndependentStore(missing, new_id(), initialize=False)
    assert not (missing / "state.db").exists()


def test_v3_upgrade_preserves_actual_run_lease_and_nullable_chat_owner(tmp_path):
    args = initialized(tmp_path)
    home, scope, store, _, _ = args
    run, context = run_started(*args)
    lease = store.acquire_lease(scope, run.run_id, "session_writer:task", context.runner_generation, "2099-01-01T00:00:00Z")
    store.close()
    with sqlite3.connect(home / "state.db") as connection:
        # Reconstruct a genuine v2 schema, rather than leaving an applied M4
        # record above a deleted M3 identity (correctly treated as corruption).
        from runtime.independent.migrations import MIGRATION_1
        connection.execute("DROP INDEX ia_native_action_step")
        for table in ("ia_action_journal", "ia_approval_bindings"):
            connection.execute(f"ALTER TABLE {table} RENAME TO {table}_fixture_v4")
            connection.execute(next(statement for statement in MIGRATION_1 if statement.startswith(f"CREATE TABLE IF NOT EXISTS {table}(")))
            connection.execute(f"INSERT INTO {table} SELECT * FROM {table}_fixture_v4")
            connection.execute(f"DROP TABLE {table}_fixture_v4")
        connection.executescript("""
            DROP INDEX ia_one_resource_owner;
            ALTER TABLE ia_resource_leases RENAME TO lease_v3;
            CREATE TABLE ia_resource_leases(lease_id TEXT PRIMARY KEY,resource_key TEXT NOT NULL,scope_key TEXT NOT NULL,run_id TEXT NOT NULL REFERENCES ia_runs(run_id),owner_generation TEXT NOT NULL,revision INTEGER NOT NULL,expires_at TEXT NOT NULL,state TEXT NOT NULL,data_json TEXT NOT NULL);
            INSERT INTO ia_resource_leases SELECT * FROM lease_v3;
            DROP TABLE lease_v3;
            CREATE UNIQUE INDEX ia_one_resource_owner ON ia_resource_leases(resource_key) WHERE state='active';
            DELETE FROM ia_schema_migrations WHERE version>=3;
        """)
    with IndependentStore(home, scope.backend_profile_id) as migrated:
        assert migrated.get_run(run.run_id) == run
        assert migrated.list_leases() == (lease,)
        normal = migrated.acquire_chat_writer(scope, "ordinary", "request", context.runner_generation)
        assert normal["runId"] is None and normal["ownerRef"] == "request"
        assert migrated._conn.execute("PRAGMA foreign_key_check").fetchall() == []


def test_normal_and_independent_writer_race_has_one_winner_and_recovers(tmp_path):
    args = initialized(tmp_path)
    home, scope, store, _, _ = args
    run, context = run_started(*args)
    other = IndependentStore(home, scope.backend_profile_id)
    barrier = threading.Barrier(2)
    winners, denied = [], []
    def reserve(which, ordinary):
        barrier.wait()
        try:
            lease = (which.acquire_chat_writer(scope, "same-task", "request", context.runner_generation) if ordinary else
                     which.acquire_lease(scope, run.run_id, "session_writer:same-task", context.runner_generation, "2099-01-01T00:00:00Z"))
            winners.append(lease)
        except ResourceBusy as exc:
            denied.append(exc)
    threads = [threading.Thread(target=reserve, args=(store, True)), threading.Thread(target=reserve, args=(other, False))]
    try:
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=10)
        assert all(not thread.is_alive() for thread in threads)
        assert len(winners) == len(denied) == 1
        assert len(store.list_leases()) == 1
        store.recover_after_restart(new_id())
        assert store.list_leases() == ()
        assert store.acquire_chat_writer(scope, "same-task", "new-request", new_id())["ownerRef"] == "new-request"
    finally:
        other.close()
        store.close()


@pytest.mark.parametrize("owner_kind,process_state", [
    ("local_ai_download", {}),
    ("local_ai_model", {"launchPending": True}),
    ("local_ai_model", {"launchPending": False, "hostPid": 123, "childPid": 124}),
    ("local_ai_model", {"launchPending": False, "hostPid": None, "childPid": None}),
])
def test_manager_restart_does_not_claim_os_exit_of_local_ai_jobs(tmp_path, owner_kind, process_state):
    _, scope, store, _, _ = initialized(tmp_path)
    try:
        generation = new_id()
        normal = store.acquire_chat_writer(scope, "ordinary", "request", generation)
        lease = {"leaseId": new_id(), "resourceKey": owner_kind + ":" + scope.key + ":controlled-plan",
            "scope": scope.model_dump(mode="json", by_alias=True), "runId": None, "ownerGeneration": generation,
            "ownerKind": owner_kind, "revision": 1, "state": "active", "expiresAt": "2099-01-01T00:00:00Z",
            **process_state}
        with store.transaction():
            store._conn.execute("INSERT INTO ia_resource_leases VALUES(?,?,?,?,?,?,?,?,?)", (lease["leaseId"], lease["resourceKey"],
                scope.key, None, generation, 1, lease["expiresAt"], "active", canonical_json(lease)))
        store.recover_after_restart(new_id())
        assert store.list_leases() == (lease,)
        ordinary = next(row for row in store.list_leases(active_only=False) if row["leaseId"] == normal["leaseId"])
        assert ordinary["state"] == "stale"
        store.release_lease(lease["leaseId"], owner_generation=generation)
        assert store.list_leases() == ()
    finally:
        store.close()


@pytest.mark.parametrize("prefix,kind,run_bound", [
    ("local_ai_model:", "legacy_chat", False),
    ("session_writer:", "local_ai_model", False),
    ("local_ai_model:", "local_ai_model", True),
])
def test_restart_model_exception_requires_exact_owner_family_and_no_run(tmp_path, prefix, kind, run_bound):
    args = initialized(tmp_path)
    _, scope, store, _, _ = args
    try:
        run, context = run_started(*args)
        lease_id = new_id()
        generation = context.runner_generation
        resource = prefix + scope.key + ":controlled-owner"
        payload = {"leaseId": lease_id, "resourceKey": resource, "ownerKind": kind}
        with store.transaction():
            store._conn.execute("INSERT INTO ia_resource_leases VALUES(?,?,?,?,?,?,?,?,?)", (
                lease_id, resource, scope.key, run.run_id if run_bound else None,
                generation, 1, "2099-01-01T00:00:00Z", "active", canonical_json(payload)))
        store.recover_after_restart(new_id())
        actual = store._one("SELECT state FROM ia_resource_leases WHERE lease_id=?", (lease_id,))
        assert actual["state"] in {"stale", "released"}
        assert not store.list_leases()
    finally:
        store.close()


def test_unknown_newer_schema_refuses_before_legacy_migration(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    connection = sqlite3.connect(home / "state.db")
    connection.executescript("CREATE TABLE ia_schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT,migration_digest TEXT);INSERT INTO ia_schema_migrations VALUES(99,'now','future');")
    connection.close()
    with pytest.raises(SchemaVersionError):
        IndependentStore(home, new_id())
    connection = sqlite3.connect(home / "state.db")
    assert connection.execute("SELECT name FROM sqlite_master WHERE name='sessions'").fetchone() is None
    connection.close()


def test_assistant_cas_request_retry_and_scope_isolation(tmp_path):
    _, scope, store, _, _ = initialized(tmp_path)
    try:
        before = store.get_assistant(scope)
        request_id = new_id()
        update = lambda state: state.model_copy(update={"setup_status": "in_progress", "interview": {"revision": 2, "stage": "interview"}})
        result = store.update_assistant(scope, before.revision, update, client_request_id=request_id, request_payload={"answer": "free"})
        again = store.update_assistant(scope, before.revision, update, client_request_id=request_id, request_payload={"answer": "free"})
        assert again == result
        assert result.revision == before.revision + 1
        with pytest.raises(IdempotencyConflict):
            store.update_assistant(scope, before.revision, update, client_request_id=request_id, request_payload={"answer": "different"})
        with pytest.raises(RevisionConflict):
            store.update_assistant(scope, before.revision, update)
        foreign = scope.model_copy(update={"backend_profile_id": new_id()})
        with pytest.raises(PermissionError):
            store.get_assistant(foreign)
    finally:
        store.close()


def test_transaction_rolls_back_state_event_and_outbox_together(tmp_path):
    _, scope, store, _, _ = initialized(tmp_path)
    try:
        before = store.watermark(scope)
        with pytest.raises(RuntimeError):
            with store.transaction():
                store.append_event(scope, "activity_changed", {"reason": "uncommitted"})
                store.put_outbox("rollback", scope, "probe", {"value": 1})
                raise RuntimeError("injected crash")
        assert store.watermark(scope) == before
        assert store.get_outbox("rollback") is None
    finally:
        store.close()


def test_dispatch_double_click_returns_same_chat_and_rejects_changed_order(tmp_path):
    _, _, store, request, _ = initialized(tmp_path)
    try:
        first, created = store.reserve_dispatch(request)
        second, duplicate = store.reserve_dispatch(request)
        assert created and not duplicate and first == second
        with pytest.raises(IdempotencyConflict):
            store.reserve_dispatch(request.model_copy(update={"instruction": "Send something else"}))
        assert len(store.list_dispatches()) == 1
        assert store.get_outbox("session:" + first.dispatch_id)["state"] == "pending"
        forged = request.model_copy(update={"client_request_id": new_id(), "source_message_id": "foreign"})
        with pytest.raises(PermissionError):
            store.reserve_dispatch(forged)
    finally:
        store.close()


def test_concurrent_dispatch_claim_is_one_identity(tmp_path):
    home, scope, store, request, _ = initialized(tmp_path)
    other = IndependentStore(home, scope.backend_profile_id)
    results, failures = [], []
    gate = threading.Barrier(2)
    def reserve(which):
        try:
            gate.wait()
            results.append(which.reserve_dispatch(request))
        except Exception as exc:
            failures.append(exc)
    threads = [threading.Thread(target=reserve, args=(which,)) for which in (store, other)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)
    try:
        assert not failures
        assert len(results) == 2 and sum(int(result[1]) for result in results) == 1
        assert results[0][0].dispatch_id == results[1][0].dispatch_id
    finally:
        other.close()
        store.close()


def test_definition_single_live_run_and_terminal_late_reply_cannot_revive(tmp_path):
    args = initialized(tmp_path)
    home, scope, store, request, definition = args
    try:
        run, _ = run_started(*args)
        second_request = request.model_copy(update={"client_request_id": new_id()})
        with pytest.raises(ResourceBusy):
            run_started(home, scope, store, second_request, definition)
        stopped = store.transition_run(run.run_id, "cancelling", expected_revision=run.state_revision)
        final = store.transition_run(run.run_id, "cancelled", expected_revision=stopped.state_revision)
        with pytest.raises(StateConflict):
            store.transition_run(run.run_id, "completed", expected_revision=final.state_revision)
        with pytest.raises(StateConflict):
            store.update_counters(run.run_id, tool_calls=1)
        assert store.get_outbox("result:" + run.run_id)["payload"]["status"] == "cancelled"
        assert store.get_run(run.run_id).state == "cancelled"
    finally:
        store.close()


def test_pause_needs_safe_checkpoint_and_inflight_action_is_not_safe(tmp_path):
    args = initialized(tmp_path)
    store = args[2]
    try:
        run, _ = run_started(*args)
        pending = store.prepare_action(action(run))
        store.claim_action(pending.action_id, expected_permission_revision=1, expected_control_epoch=0)
        with pytest.raises(StateConflict):
            store.save_checkpoint(run.run_id, {"summary": "not safe"})
        pausing = store.transition_run(run.run_id, "pausing")
        with pytest.raises(StateConflict):
            store.transition_run(run.run_id, "paused", expected_revision=pausing.state_revision)
        store.finish_action(pending.action_id, "unknown", error_code="interrupted")
        store.save_checkpoint(run.run_id, {"summary": "safe after reconciliation boundary"})
        assert store.transition_run(run.run_id, "paused").state == "paused"
    finally:
        store.close()


def test_approval_bound_to_exact_action_epoch_expiry_and_consumed_once(tmp_path):
    args = initialized(tmp_path)
    store = args[2]
    try:
        run, _ = run_started(*args)
        pending = action(run)
        approval = ApprovalView(approval_id=new_id(), run_id=run.run_id, scope=run.scope, action_digest=pending.canonical_args_digest, effect="read", target_summary="controlled target", permission_revision=1, expires_at=(datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat())
        store.create_approval(approval)
        with pytest.raises(PermissionError):
            store.decide_approval(approval.approval_id, approved=True, actor_ref="model:fake", action_digest=approval.action_digest, expected_permission_revision=1)
        with pytest.raises(RevisionConflict):
            store.decide_approval(approval.approval_id, approved=True, actor_ref="user:test", action_digest="b" * 64, expected_permission_revision=1)
        store.decide_approval(approval.approval_id, approved=True, actor_ref="user:test", action_digest=approval.action_digest, expected_permission_revision=1)
        pending = pending.model_copy(update={"approval_id": approval.approval_id})
        store.prepare_action(pending)
        store.claim_action(pending.action_id, expected_permission_revision=1, expected_control_epoch=0, approval_id=approval.approval_id)
        assert store.get_approval(approval.approval_id).state == "consumed"
        with pytest.raises(StateConflict):
            store.claim_action(pending.action_id, expected_permission_revision=1, expected_control_epoch=0, approval_id=approval.approval_id)
    finally:
        store.close()


def test_revoke_before_claim_blocks_dispatch_and_invalidates_approval(tmp_path):
    args = initialized(tmp_path)
    store = args[2]
    try:
        run, _ = run_started(*args)
        pending = store.prepare_action(action(run))
        revision = store.revoke_permissions(run.scope, expected_revision=1)
        assert revision["revision"] == 2 and revision["controlEpoch"] == 1
        with pytest.raises(RevisionConflict):
            store.claim_action(pending.action_id, expected_permission_revision=1, expected_control_epoch=0)
        assert store.get_action(pending.action_id).state == "prepared"
    finally:
        store.close()


def test_mutation_requires_concrete_approval_with_matching_effect(tmp_path):
    args = initialized(tmp_path)
    store = args[2]
    try:
        run, _ = run_started(*args)
        pending = store.prepare_action(action(run).model_copy(update={"intended_effect": "write"}))
        with pytest.raises(PermissionError):
            store.claim_action(pending.action_id, expected_permission_revision=1, expected_control_epoch=0)
        wrong = ApprovalView(approval_id=new_id(), run_id=run.run_id, scope=run.scope, action_digest=pending.canonical_args_digest, effect="read", target_summary="controlled", permission_revision=1, expires_at=(datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat())
        store.create_approval(wrong)
        store.decide_approval(wrong.approval_id, approved=True, actor_ref="user:test", action_digest=wrong.action_digest, expected_permission_revision=1)
        with pytest.raises(RevisionConflict):
            store.claim_action(pending.action_id, expected_permission_revision=1, expected_control_epoch=0, approval_id=wrong.approval_id)
        assert store.get_action(pending.action_id).state == "prepared"
        assert store.get_approval(wrong.approval_id).state == "approved"
    finally:
        store.close()


def test_waiting_run_keeps_account_lease_without_blocking_other_space(tmp_path):
    args = initialized(tmp_path)
    store = args[2]
    try:
        run, context = run_started(*args)
        lease = store.acquire_lease(run.scope, run.run_id, "account:test", context.runner_generation, "2099-01-01T00:00:00Z")
        store.transition_run(run.run_id, "waiting_for_approval")
        assert store.list_leases(run_id=run.run_id)[0]["leaseId"] == lease["leaseId"]
        store.transition_run(run.run_id, "interrupted", force_recovery=True)
        assert store.list_leases(run_id=run.run_id)[0]["resourceKey"] == "account:test"
        store.release_lease(lease["leaseId"], owner_generation=context.runner_generation)
        assert store.list_leases(run_id=run.run_id) == ()
    finally:
        store.close()


def test_restart_marks_dispatched_action_unknown_and_never_replays(tmp_path):
    args = initialized(tmp_path)
    home, scope, store, _, _ = args
    run, _ = run_started(*args)
    pending = store.prepare_action(action(run))
    store.claim_action(pending.action_id, expected_permission_revision=1, expected_control_epoch=0)
    store.finish_action(pending.action_id, "dispatched")
    store.close()
    with IndependentStore(home, scope.backend_profile_id) as recovered:
        changed = recovered.recover_after_restart(new_id())
        assert changed[0].state == "interrupted"
        assert recovered.get_action(pending.action_id).state == "unknown"
        assert recovered.recover_after_restart(new_id()) == ()
        with pytest.raises(StateConflict):
            recovered.claim_action(pending.action_id, expected_permission_revision=1, expected_control_epoch=0)


@pytest.mark.parametrize("action_state", ["claimed", "dispatched"])
def test_unclean_process_exit_recovers_committed_checkpoint_without_action_replay(tmp_path, action_state):
    """A real process exits without store.close(), exercising SQLite WAL recovery."""
    root = Path(__file__).resolve().parents[3]
    receipt = tmp_path / "crash-receipt.json"
    code = '''
import json,os,sys
from pathlib import Path
sys.path.insert(0,str(Path(sys.argv[1])/"services/sidekick"))
sys.path.insert(0,str(Path(sys.argv[1])/"services/sidekick/tests"))
sys.path.append(sys.argv[4])
from test_independent_migrations import initialized,run_started,action
args=initialized(Path(sys.argv[2]))
home,scope,store,_,_=args
run,context=run_started(*args)
checkpoint=store.save_checkpoint(run.run_id,{"summary":"Committed safe boundary"},safe_boundary=True)
lease=store.acquire_lease(scope,run.run_id,"execution:"+run.run_id,context.runner_generation,"2099-01-01T00:00:00Z")
pending=store.prepare_action(action(run))
store.claim_action(pending.action_id,expected_permission_revision=1,expected_control_epoch=0)
if sys.argv[5]=="dispatched":store.finish_action(pending.action_id,"dispatched")
Path(sys.argv[3]).write_text(json.dumps({"home":str(home),"scope":scope.model_dump(mode="json",by_alias=True),"runId":run.run_id,"actionId":pending.action_id,"checkpointId":checkpoint["checkpointId"],"leaseId":lease["leaseId"]}),encoding="utf-8")
os._exit(23)
'''
    environment = {key: value for key, value in os.environ.items() if key.upper() in {
        "SYSTEMROOT", "WINDIR", "COMSPEC", "PATH", "PATHEXT", "TEMP", "TMP"}}
    child = subprocess.run([sys.executable, "-I", "-B", "-c", code, str(root), str(tmp_path),
        str(receipt), str(Path(pytest.__file__).resolve().parent.parent), action_state],
        env=environment, capture_output=True, timeout=20, check=False)
    assert child.returncode == 23, child.stderr.decode("utf-8", errors="replace")
    saved = json.loads(receipt.read_text("utf-8"))
    scope = Scope.model_validate(saved["scope"])
    with IndependentStore(Path(saved["home"]), scope.backend_profile_id) as recovered:
        changed = recovered.recover_after_restart(new_id())
        assert len(changed) == 1 and changed[0].state == "interrupted"
        assert changed[0].scope == scope
        assert recovered.latest_checkpoint(saved["runId"])["checkpointId"] == saved["checkpointId"]
        assert recovered.get_action(saved["actionId"]).state == "unknown"
        assert recovered.list_leases() == ()
        assert recovered.recover_after_restart(new_id()) == ()
        with pytest.raises(StateConflict):
            recovered.claim_action(saved["actionId"], expected_permission_revision=1, expected_control_epoch=0)


def test_old_event_cursor_returns_atomic_snapshot_and_monotonic_watermark(tmp_path):
    _, scope, store, _, _ = initialized(tmp_path)
    try:
        for number in range(8):
            store.append_event(scope, "activity_changed", {"reason": str(number)})
        watermark = store.watermark(scope)
        assert store.trim_events(scope, retain=2) > 0
        recovery = store.recover_events(scope, 0)
        assert recovery["resyncRequired"] and recovery["snapshot"].watermark == watermark
        event = store.append_event(scope, "activity_changed", {"reason": "next"})
        assert event.seq == watermark + 1
        assert store.events_after(scope, watermark) == (event,)
        other = scope.model_copy(update={"space_id": new_id()})
        assert store.events_after(other, 0) == ()
        with pytest.raises(ValueError, match="32 KiB"):
            store.append_event(scope, "activity_changed", {"reason": "x" * 40000})
        assert store.watermark(scope) == event.seq
    finally:
        store.close()


def test_outbox_has_bounded_retries_and_terminal_delivery_dedupes(tmp_path):
    _, scope, store, _, _ = initialized(tmp_path)
    try:
        store.put_outbox("bounded", scope, "local_projection", {"source": "one"})
        for _ in range(5):
            result = store.finish_outbox("bounded", success=False, error_code="controlled_write_failure")
        assert result["state"] == "failed" and result["attempts"] == 5
        assert store.finish_outbox("bounded", success=True)["state"] == "failed"
        with pytest.raises(IdempotencyConflict):
            store.put_outbox("bounded", scope, "local_projection", {"source": "two"})
    finally:
        store.close()
