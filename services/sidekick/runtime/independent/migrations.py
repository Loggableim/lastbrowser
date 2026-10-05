"""Additive migrations in the existing profile state.db.

The private ia_ marker deliberately does not reuse SQLite's user_version or
replace legacy sessions/messages. A newer unknown schema fails closed.
"""
from __future__ import annotations

import hashlib
import sqlite3

from .contracts import utc_now

SCHEMA_VERSION = 4


class SchemaVersionError(RuntimeError):
    pass


MIGRATION_1 = (
    "CREATE TABLE IF NOT EXISTS ia_schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, migration_digest TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS ia_profile_refs(backend_profile_id TEXT PRIMARY KEY,canonical_home TEXT NOT NULL UNIQUE,name TEXT NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL,data_json TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS ia_space_bindings(scope_key TEXT PRIMARY KEY,backend_profile_id TEXT NOT NULL,space_id TEXT NOT NULL,browser_profile_id TEXT NOT NULL,native_slug TEXT NOT NULL,workspace_locator TEXT,partition_key TEXT NOT NULL,revision INTEGER NOT NULL,tombstoned_at TEXT,data_json TEXT NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS ia_active_partition ON ia_space_bindings(partition_key) WHERE tombstoned_at IS NULL",
    "CREATE TABLE IF NOT EXISTS ia_assistant_state(scope_key TEXT PRIMARY KEY,conversation_id TEXT NOT NULL UNIQUE,revision INTEGER NOT NULL,interview_revision INTEGER NOT NULL,confirmed_profile_id TEXT,setup_status TEXT NOT NULL,data_json TEXT NOT NULL,updated_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS ia_interview_answers(answer_id TEXT PRIMARY KEY,scope_key TEXT NOT NULL,revision INTEGER NOT NULL,question_id TEXT NOT NULL,replaces_answer_id TEXT,data_json TEXT NOT NULL,created_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS ia_answers_scope ON ia_interview_answers(scope_key,revision)",
    "CREATE TABLE IF NOT EXISTS ia_profile_snapshots(snapshot_id TEXT PRIMARY KEY,scope_key TEXT NOT NULL,revision INTEGER NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(scope_key,revision))",
    "CREATE TABLE IF NOT EXISTS ia_definition_revisions(definition_id TEXT NOT NULL,revision INTEGER NOT NULL,scope_key TEXT NOT NULL,enabled INTEGER NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(definition_id,revision))",
    "CREATE TABLE IF NOT EXISTS ia_dispatches(dispatch_id TEXT PRIMARY KEY,scope_key TEXT NOT NULL,conversation_id TEXT NOT NULL,source_message_id TEXT NOT NULL,client_request_id TEXT NOT NULL,request_digest TEXT NOT NULL,request_json TEXT NOT NULL,target_session_id TEXT NOT NULL,run_id TEXT,state TEXT NOT NULL,error_code TEXT,data_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(scope_key,client_request_id))",
    "CREATE TABLE IF NOT EXISTS ia_runs(run_id TEXT PRIMARY KEY,definition_id TEXT NOT NULL,definition_revision INTEGER NOT NULL,scope_key TEXT NOT NULL,dispatch_id TEXT NOT NULL REFERENCES ia_dispatches(dispatch_id),state TEXT NOT NULL,state_revision INTEGER NOT NULL,control_epoch INTEGER NOT NULL,generation TEXT NOT NULL,counters_json TEXT NOT NULL,context_json TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(dispatch_id))",
    "CREATE UNIQUE INDEX IF NOT EXISTS ia_one_live_definition ON ia_runs(definition_id) WHERE state IN ('queued','running','waiting_for_user','waiting_for_approval','pausing','paused','cancelling')",
    "CREATE INDEX IF NOT EXISTS ia_runs_scope_state ON ia_runs(scope_key,state,created_at)",
    "CREATE TABLE IF NOT EXISTS ia_scope_cursors(scope_key TEXT PRIMARY KEY,last_seq INTEGER NOT NULL CHECK(last_seq>=0))",
    "CREATE TABLE IF NOT EXISTS ia_run_events(scope_key TEXT NOT NULL,seq INTEGER NOT NULL,event_id TEXT NOT NULL UNIQUE,run_id TEXT,kind TEXT NOT NULL,payload_json TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(scope_key,seq))",
    "CREATE TABLE IF NOT EXISTS ia_action_journal(action_id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES ia_runs(run_id),scope_key TEXT NOT NULL,step_id TEXT NOT NULL,attempt INTEGER NOT NULL,state TEXT NOT NULL,permission_revision INTEGER NOT NULL,control_epoch INTEGER NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,finished_at TEXT,UNIQUE(run_id,step_id,attempt))",
    "CREATE TABLE IF NOT EXISTS ia_approval_bindings(approval_id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES ia_runs(run_id),scope_key TEXT NOT NULL,action_digest TEXT NOT NULL,permission_revision INTEGER NOT NULL,state TEXT NOT NULL,expires_at TEXT NOT NULL,data_json TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS ia_resource_leases(lease_id TEXT PRIMARY KEY,resource_key TEXT NOT NULL,scope_key TEXT NOT NULL,run_id TEXT NOT NULL REFERENCES ia_runs(run_id),owner_generation TEXT NOT NULL,revision INTEGER NOT NULL,expires_at TEXT NOT NULL,state TEXT NOT NULL,data_json TEXT NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS ia_one_resource_owner ON ia_resource_leases(resource_key) WHERE state='active'",
    "CREATE TABLE IF NOT EXISTS ia_checkpoints(checkpoint_id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES ia_runs(run_id),seq INTEGER NOT NULL,safe_boundary INTEGER NOT NULL,journal_watermark TEXT,state_json TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(run_id,seq))",
    "CREATE TABLE IF NOT EXISTS ia_outbox(delivery_key TEXT PRIMARY KEY,scope_key TEXT NOT NULL,kind TEXT NOT NULL,payload_json TEXT NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TEXT,error_code TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS ia_schedule_occurrences(definition_id TEXT NOT NULL,schedule_revision INTEGER NOT NULL,planned_utc TEXT NOT NULL,scope_key TEXT NOT NULL,outcome TEXT NOT NULL,run_id TEXT,PRIMARY KEY(definition_id,schedule_revision,planned_utc))",
    "CREATE TABLE IF NOT EXISTS ia_request_results(scope_key TEXT NOT NULL,request_id TEXT NOT NULL,operation TEXT NOT NULL,request_digest TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(scope_key,operation,request_id))",
    "CREATE TABLE IF NOT EXISTS ia_permission_state(scope_key TEXT PRIMARY KEY,revision INTEGER NOT NULL,control_epoch INTEGER NOT NULL,control_sequence INTEGER NOT NULL DEFAULT 0,data_json TEXT NOT NULL,updated_at TEXT NOT NULL)",
)
MIGRATION_DIGEST = hashlib.sha256("\n".join(MIGRATION_1).encode("utf-8")).hexdigest()
MIGRATION_2 = (
    "CREATE TABLE IF NOT EXISTS ia_connection_bindings(binding_id TEXT PRIMARY KEY,scope_key TEXT NOT NULL,capability_id TEXT NOT NULL,connection_id TEXT NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL,data_json TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(scope_key,capability_id,connection_id))",
    "CREATE TABLE IF NOT EXISTS ia_connection_setup_flows(flow_id TEXT PRIMARY KEY,scope_key TEXT NOT NULL,capability_id TEXT NOT NULL,state TEXT NOT NULL,data_json TEXT NOT NULL,updated_at TEXT NOT NULL)",
)
MIGRATION_2_DIGEST = hashlib.sha256("\n".join(MIGRATION_2).encode("utf-8")).hexdigest()
MIGRATION_3 = (
    # Reuse the same unique lease table for ordinary native chat writers. They
    # have a real request owner in data_json and do not fabricate an agent run.
    "DROP INDEX ia_one_resource_owner",
    "ALTER TABLE ia_resource_leases RENAME TO ia_resource_leases_v2",
    "CREATE TABLE ia_resource_leases(lease_id TEXT PRIMARY KEY,resource_key TEXT NOT NULL,scope_key TEXT NOT NULL,run_id TEXT REFERENCES ia_runs(run_id),owner_generation TEXT NOT NULL,revision INTEGER NOT NULL,expires_at TEXT NOT NULL,state TEXT NOT NULL,data_json TEXT NOT NULL)",
    "INSERT INTO ia_resource_leases SELECT * FROM ia_resource_leases_v2",
    "DROP TABLE ia_resource_leases_v2",
    "CREATE UNIQUE INDEX ia_one_resource_owner ON ia_resource_leases(resource_key) WHERE state='active'",
)
MIGRATION_3_DIGEST = hashlib.sha256("\n".join(MIGRATION_3).encode("utf-8")).hexdigest()
MIGRATION_4 = (
    "ALTER TABLE ia_action_journal RENAME TO ia_action_journal_v3",
    "CREATE TABLE ia_action_journal(action_id TEXT PRIMARY KEY,run_id TEXT REFERENCES ia_runs(run_id),scope_key TEXT NOT NULL,step_id TEXT NOT NULL,attempt INTEGER NOT NULL,state TEXT NOT NULL,permission_revision INTEGER NOT NULL,control_epoch INTEGER NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,finished_at TEXT,UNIQUE(run_id,step_id,attempt))",
    "INSERT INTO ia_action_journal SELECT * FROM ia_action_journal_v3",
    "DROP TABLE ia_action_journal_v3",
    "CREATE UNIQUE INDEX ia_native_action_step ON ia_action_journal(scope_key,json_extract(data_json,'$.ownerRef.streamId'),json_extract(data_json,'$.ownerRef.writerGeneration'),step_id,attempt) WHERE run_id IS NULL",
    "ALTER TABLE ia_approval_bindings RENAME TO ia_approval_bindings_v3",
    "CREATE TABLE ia_approval_bindings(approval_id TEXT PRIMARY KEY,run_id TEXT REFERENCES ia_runs(run_id),scope_key TEXT NOT NULL,action_digest TEXT NOT NULL,permission_revision INTEGER NOT NULL,state TEXT NOT NULL,expires_at TEXT NOT NULL,data_json TEXT NOT NULL)",
    "INSERT INTO ia_approval_bindings SELECT * FROM ia_approval_bindings_v3",
    "DROP TABLE ia_approval_bindings_v3",
)
MIGRATION_4_DIGEST = hashlib.sha256("\n".join(MIGRATION_4).encode("utf-8")).hexdigest()


def current_version(connection: sqlite3.Connection) -> int:
    exists = connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ia_schema_migrations'").fetchone()
    if not exists:
        return 0
    row = connection.execute("SELECT MAX(version) FROM ia_schema_migrations").fetchone()
    return int(row[0] or 0)


def verify_supported(connection: sqlite3.Connection) -> int:
    version = current_version(connection)
    if version > SCHEMA_VERSION:
        raise SchemaVersionError("Independent-run data was written by a newer Lastbrowser version")
    for applied in range(1, version + 1):
        row = connection.execute("SELECT migration_digest FROM ia_schema_migrations WHERE version=?", (applied,)).fetchone()
        expected = {1: MIGRATION_DIGEST, 2: MIGRATION_2_DIGEST, 3: MIGRATION_3_DIGEST, 4: MIGRATION_4_DIGEST}[applied]
        if row is None or row[0] != expected:
            raise SchemaVersionError("Independent-run migration identity does not match this build")
    return version


def migrate(connection: sqlite3.Connection) -> int:
    """Apply one all-or-nothing migration under the existing DB write lock."""
    connection.execute("BEGIN IMMEDIATE")
    try:
        version = verify_supported(connection)
        if version < 1:
            for statement in MIGRATION_1:
                connection.execute(statement)
            connection.execute("INSERT INTO ia_schema_migrations VALUES(?,?,?)", (1, utc_now(), MIGRATION_DIGEST))
        if version < 2:
            for statement in MIGRATION_2:
                connection.execute(statement)
            connection.execute("INSERT INTO ia_schema_migrations VALUES(?,?,?)", (2, utc_now(), MIGRATION_2_DIGEST))
        if version < 3:
            for statement in MIGRATION_3:
                connection.execute(statement)
            connection.execute("INSERT INTO ia_schema_migrations VALUES(?,?,?)", (3, utc_now(), MIGRATION_3_DIGEST))
        if version < 4:
            for statement in MIGRATION_4:
                connection.execute(statement)
            connection.execute("INSERT INTO ia_schema_migrations VALUES(?,?,?)", (4, utc_now(), MIGRATION_4_DIGEST))
        connection.execute("COMMIT")
    except BaseException:
        connection.execute("ROLLBACK")
        raise
    return SCHEMA_VERSION
