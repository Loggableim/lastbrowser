"""Explicit, restartable migration of an existing paused Browser Goal.

The authenticated parent route holds the existing per-session mutation lock.
This leaf reserves the existing native writer and journals prepare/commit in
IndependentStore. It never starts a worker, judge, continuation or new Goal.
"""
from __future__ import annotations

from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import tempfile
from typing import Any

from pydantic import Field

from .chat_binding import assert_session_writer_available, native_chat_writer
from .contracts import Id, Scope, TERMINAL_STATES, Versioned, digest_json
from .scope import ScopeError, same_path
from .store import ResourceBusy, RevisionConflict, StateConflict

_PREPARE = "native_goal_migration_prepare"
_COMMIT = "native_goal_migration_commit"


class NativeGoalMigrationRequest(Versioned):
    scope: Scope
    session_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    expected_source_revision: int = Field(ge=0)
    expected_source_digest: str = Field(pattern=r"^[0-9a-f]{64}$")
    client_request_id: Id


def _sha(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _owned(path: Path, home: Path, *, missing: bool = False) -> Path:
    from .chat_activity import _linked
    if not path.is_absolute() or not path.resolve().is_relative_to(home):
        raise ScopeError("Goal migration path escapes its owning profile")
    for item in (path, *path.parents):
        if item == home:
            break
        if item.exists() and _linked(item):
            raise ScopeError("Goal migration storage is linked")
    if not missing and not path.is_file():
        raise StateConflict("Existing goal migration source is unavailable")
    return path


def _session_read(path: Path) -> dict[str, Any]:
    before = path.stat()
    raw = json.loads(path.read_text("utf-8"))
    after = path.stat()
    if (before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns):
        raise RevisionConflict("Saved session changed during migration read")
    if not isinstance(raw, dict) or not isinstance(raw.get("messages"), list):
        raise ScopeError("Goal migration requires the complete saved session")
    return raw


def _snapshot(path: Path, session_id: str) -> dict[str, Any]:
    """Never create, migrate schema, invoke a manager or modify the source."""
    if not path.exists():
        return {"goal": None, "digest": None, "claimsDigest": digest_json([])}
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as connection:
        connection.execute("PRAGMA query_only=ON")
        connection.execute("BEGIN")
        try:
            goal = connection.execute("SELECT value FROM state_meta WHERE key=?", ("goal:" + session_id,)).fetchone()
            # Opaque command keys cannot be reassigned to a different Space.
            # Keep their source history untouched and bind its digest to the receipt.
            claims = connection.execute("SELECT key,value FROM state_meta WHERE key LIKE 'goal-command:%' ORDER BY key").fetchall()
            for _, value in claims:
                if json.loads(value).get("state") == "pending":
                    raise ResourceBusy("A source goal command is not settled")
            raw = goal[0] if goal else None
            return {"goal": raw, "digest": _sha(raw) if raw is not None else None,
                    "claimsDigest": digest_json(claims)}
        except (sqlite3.Error, ValueError, TypeError, AttributeError) as error:
            raise StateConflict("Goal migration SQLite snapshot cannot be verified") from error


def _resolve(session, scope: Scope, actor: str, profile_hub):
    from web.api.chat_modes import resolve_native_chat
    from web.api.goals import lastbrowser_workspace_goal_slug
    if getattr(session, "_loaded_metadata_only", False):
        raise ScopeError("Goal migration requires a full session")
    resolved = resolve_native_chat(session, scope.model_dump(by_alias=True), actor=actor, profile_hub=profile_hub)
    home = resolved.profile_home
    path = _owned(Path(resolved.space.sessions_dir) / (session.session_id + ".json"), home)
    raw = _session_read(path)
    if (raw.get("session_id") != session.session_id or (raw.get("profile") or "default") != actor
            or raw.get("space_scope") != scope.model_dump(by_alias=True)
            or not same_path(raw.get("workspace", ""), session.workspace)):
        raise ScopeError("Saved goal session owner changed")
    source_slug = lastbrowser_workspace_goal_slug(raw["workspace"])
    target_slug = resolved.binding.native_slug
    if raw.get("goal_space_slug") not in {source_slug, target_slug}:
        raise ScopeError("Saved goal namespace is not its workspace hash")
    source = _owned(home / "browser-spaces" / source_slug / "goals.db", home)
    target = _owned(resolved.space_root / "goals.db", home, missing=True)
    return resolved, path, raw, source_slug, target_slug, source, target


def _idle(raw, resolved, store):
    from web.api import config, goals, native_chats
    sid = raw["session_id"]
    if raw.get("pending_user_message") or raw.get("pending_started_at") is not None:
        raise ResourceBusy("The goal session has unsettled user input")
    with native_chats._lock:
        if any(entry.context.session_id == sid and entry.context.scope == resolved.scope
               and (not entry.settled or (entry.handle is not None and entry.handle.is_alive))
               for entry in native_chats._active.values()):
            raise ResourceBusy("Native goal worker exit is not confirmed")
        stream = raw.get("active_stream_id")
        if stream:
            context = native_chats._settled.get(stream)
            if context is None or context.session_id != sid or context.scope != resolved.scope:
                raise ResourceBusy("Saved goal stream has no proven process exit")
        if any(context.session_id == sid and context.scope == resolved.scope
               for context, _ in native_chats._goal_handoffs.values()):
            raise ResourceBusy("A goal continuation handoff is pending")
    with config.ACTIVE_RUNS_LOCK:
        if any(value.get("session_id") == sid for value in config.ACTIVE_RUNS.values()):
            raise ResourceBusy("The goal session has an active run")
    home_key = str(resolved.profile_home)
    if any(key[0] == sid and key[1] == home_key for key in goals._PENDING_CONTINUATIONS):
        raise ResourceBusy("A goal continuation is queued")
    if any(key[0] == sid and key[1] == home_key for key in goals._IN_FLIGHT_CONTINUATIONS):
        raise ResourceBusy("A goal continuation claim is in flight")


def _verify_writer(store, resolver, scope, actor, writer, sid, expected_binding_revision):
    resolved = resolver.resolve(scope, authenticated_profile_name=actor)
    if resolved.binding.revision != expected_binding_revision:
        raise RevisionConflict("Goal migration binding changed")
    leases = [lease for lease in store.list_leases() if lease["leaseId"] == writer.lease_id]
    if (len(leases) != 1 or leases[0]["scope"] != scope.model_dump(by_alias=True)
            or leases[0]["ownerGeneration"] != writer.generation
            or leases[0]["resourceKey"] != "session_writer:" + sid):
        raise ResourceBusy("Goal migration writer was revoked")
    return resolved


def _copy_target(target: Path, sid: str, raw_goal: str):
    from runtime._compat.shim_state import SessionDB
    db = SessionDB(db_path=target)
    db.close()
    with closing(sqlite3.connect(target, timeout=2, isolation_level=None)) as connection:
        connection.execute("BEGIN IMMEDIATE")
        try:
            if connection.execute("SELECT 1 FROM state_meta WHERE key=?", ("goal:" + sid,)).fetchone():
                raise RevisionConflict("Goal migration target changed before copy")
            connection.execute("INSERT INTO state_meta(key,value) VALUES(?,?)", ("goal:" + sid, raw_goal))
            connection.execute("COMMIT")
        except BaseException:
            connection.execute("ROLLBACK")
            raise


def _existing_goal(snapshot, store, scope):
    from cli.goals import GoalState
    if snapshot["goal"] is None:
        raise StateConflict("No existing source goal may be invented by migration")
    state = GoalState.from_json(snapshot["goal"])
    if not state.goal or state.status != "paused" or state.pending_judge_response:
        raise ResourceBusy("Only an existing paused, settled goal can be migrated")
    run_id = json.loads(snapshot["goal"]).get("_goal_run_id")
    if run_id is not None and (not isinstance(run_id, str) or not re.fullmatch(r"[0-9a-f]{32}", run_id)):
        raise StateConflict("Stored goal run discriminator is invalid")
    if state.continuation_owner == "independent_run":
        run = store.get_run(state.owner_run_id)
        if run is None or run.scope != scope or run.state not in TERMINAL_STATES:
            raise ResourceBusy("The goal belongs to an unsettled independent run")
    return state


def inspect_native_goal_migration(session, *, actor: str, scope: Scope | dict, profile_hub=None) -> dict:
    """Read-only user review; this never reserves a writer or prepares a copy."""
    from web.api import goals, independent
    profile_hub = profile_hub or independent.hub()
    scope = Scope.model_validate(scope)
    store, _ = profile_hub.by_scope(scope, actor)
    assert_session_writer_available(session, actor=actor, profile_hub=profile_hub)
    with goals._CONTINUATION_LOCK:
        resolved, _, raw, source_slug, target_slug, source, target = _resolve(session, scope, actor, profile_hub)
        _idle(raw, resolved, store)
        before, current = _snapshot(source, session.session_id), _snapshot(target, session.session_id)
        state = _existing_goal(before, store, scope)
        return {"schemaVersion": 1, "scope": scope.model_dump(by_alias=True), "sessionId": session.session_id,
                "sourceNamespace": source_slug, "targetNamespace": target_slug,
                "sourceDigest": before["digest"], "sourceClaimsDigest": before["claimsDigest"],
                "sourceRevision": state.revision, "goal": json.loads(before["goal"]),
                "targetDigest": current["digest"], "targetConflict": current["goal"] is not None,
                "continuationStarted": False}


def _save_namespace(path: Path, raw: dict, target_slug: str, home: Path):
    _owned(path, home)
    if digest_json(_session_read(path)) != digest_json(raw):
        raise RevisionConflict("Saved session changed before goal namespace commit")
    fd, temporary = tempfile.mkstemp(prefix=".native-goal-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            json.dump({**raw, "goal_space_slug": target_slug}, output, ensure_ascii=False, indent=2)
            output.flush()
            os.fsync(output.fileno())
        _owned(path, home)
        if digest_json(_session_read(path)) != digest_json(raw):
            raise RevisionConflict("Saved session changed during goal namespace commit")
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def migrate_native_goal(session, request: NativeGoalMigrationRequest | dict, *, actor: str,
                        generation: str, profile_hub=None) -> dict:
    """Explicit human ingress only. Parent holds config's per-session lock.

    An interrupted copy resumes only with the same UUID and exact goal digest.
    The source remains byte-for-byte untouched; old opaque command receipts
    stay at their original owner. Goal claim fields and unknown fields survive.
    """
    from web.api import goals, independent
    request = NativeGoalMigrationRequest.model_validate(request)
    if session.session_id != request.session_id or not isinstance(generation, str) or not generation:
        raise ScopeError("Goal migration request does not own its saved session")
    profile_hub = profile_hub or independent.hub()
    scope = request.scope
    store, resolver = profile_hub.by_scope(scope, actor)
    identity = request.model_dump(mode="json", by_alias=True)
    with native_chat_writer(session, actor=actor, owner_ref="goal_migration:" + request.client_request_id,
                            generation=generation, profile_hub=profile_hub) as writer:
        with goals._CONTINUATION_LOCK:
            resolved, path, raw, source_slug, target_slug, source, target = _resolve(session, scope, actor, profile_hub)
            _idle(raw, resolved, store)
            before, current = _snapshot(source, session.session_id), _snapshot(target, session.session_id)
            state = _existing_goal(before, store, scope)
            if before["digest"] != request.expected_source_digest or state.revision != request.expected_source_revision:
                raise RevisionConflict("Source goal changed since migration review")
            prepared = store.get_request_result(scope, _PREPARE, request.client_request_id, identity)
            committed = store.get_request_result(scope, _COMMIT, request.client_request_id, identity)
            if committed:
                if raw["goal_space_slug"] != target_slug or current["digest"] != before["digest"]:
                    raise RevisionConflict("Previously migrated goal or namespace changed")
                session.goal_space_slug = target_slug
                return {**committed, "replayed": True}
            if prepared is None:
                if raw["goal_space_slug"] != source_slug or current["goal"] is not None:
                    raise StateConflict("Goal migration target is already owned")
                prepared = store.record_request_result(scope, _PREPARE, request.client_request_id, identity,
                    {"schemaVersion": 1, "scope": scope.model_dump(by_alias=True), "sessionId": session.session_id,
                     "sourceNamespace": source_slug, "targetNamespace": target_slug,
                     "sourceDigest": before["digest"], "sourceClaimsDigest": before["claimsDigest"],
                     "targetDigest": before["digest"], "sourceRevision": state.revision,
                     "sessionDigest": digest_json(raw), "profileHome": str(resolved.profile_home),
                     "bindingRevision": resolved.binding.revision, "writerLeaseId": writer.lease_id,
                     "writerGeneration": writer.generation})
            # Every recovery verifies actual ownership again, rather than trusting the receipt.
            unchanged_session = dict(raw, goal_space_slug=source_slug)
            if (prepared["sourceDigest"] != before["digest"] or prepared["sourceClaimsDigest"] != before["claimsDigest"]
                    or prepared["bindingRevision"] != resolved.binding.revision
                    or prepared["profileHome"] != str(resolved.profile_home)
                    or prepared["sessionDigest"] != digest_json(unchanged_session)
                    or current["goal"] is not None and current["goal"] != before["goal"]):
                raise RevisionConflict("Prepared goal migration ownership or snapshot changed")
            result = {"schemaVersion": 1, "scope": scope.model_dump(by_alias=True), "sessionId": session.session_id,
                      "sourceNamespace": source_slug, "targetNamespace": target_slug,
                      "sourceDigest": before["digest"], "goalRevision": state.revision,
                      "state": "migrated", "continuationStarted": False}
            # Scope/writer revocation uses the same existing short store
            # transaction. No provider or worker call can occur within it.
            with store.transaction():
                _verify_writer(store, resolver, scope, actor, writer, session.session_id, resolved.binding.revision)
                _idle(raw, resolved, store)
                if _snapshot(source, session.session_id) != before:
                    raise RevisionConflict("Source goal changed before target copy")
                if current["goal"] is None:
                    _owned(target, resolved.profile_home, missing=True)
                    _copy_target(target, session.session_id, before["goal"])
                if (_snapshot(source, session.session_id) != before
                        or _snapshot(target, session.session_id)["goal"] != before["goal"]):
                    raise RevisionConflict("Goal migration copy could not be confirmed")
                _verify_writer(store, resolver, scope, actor, writer, session.session_id, resolved.binding.revision)
                _idle(raw, resolved, store)
                if raw["goal_space_slug"] == source_slug:
                    _save_namespace(path, raw, target_slug, resolved.profile_home)
                if _session_read(path).get("goal_space_slug") != target_slug:
                    raise RevisionConflict("Saved goal namespace could not be confirmed")
                result = store.record_request_result(scope, _COMMIT, request.client_request_id, identity, result)
            session.goal_space_slug = target_slug
            return result
