"""Transactional independent ownership in the existing profile SessionDB.

All writes are short SQLite transactions. No DB transaction survives a tool,
model request, login or approval wait. Events, outbox and state are committed
together; a disconnected renderer therefore cannot own or cancel execution.
"""
from __future__ import annotations

import sqlite3
import threading
import time
from contextlib import closing, contextmanager
from pathlib import Path
from typing import Any, Callable, Iterator

from .contracts import (
    ActionRecord, ActivitySnapshot, AgentDefinition, ApprovalView, AssistantState,
    NativeActionRecord, NativeApprovalView, NativeChatOwner,
    BackendProfileRef, RunContext, RunCounters, RunEvent, RunView, Scope,
    SpaceAssistantProfile, SpaceBinding, TaskDispatchRequest, TaskDispatchView,
    RUN_TRANSITIONS, TERMINAL_STATES, canonical_json, digest_json, new_id, utc_now,
)
from .migrations import migrate, verify_supported


class StoreError(RuntimeError):
    code = "store_error"


class RevisionConflict(StoreError):
    code = "stale_revision"


class IdempotencyConflict(StoreError):
    code = "idempotency_conflict"


RESOURCE_BUSY_DIAGNOSTIC_REASONS = frozenset({
    "provider_admission_lock_busy", "provider_journal_maintenance_required",
    "provider_concurrency_occupied", "request_budget_exhausted",
    "token_budget_exhausted", "cost_budget_exhausted", "retry_after_active",
    "provider_limit_requests_exhausted", "provider_limit_input_tokens_exhausted",
    "provider_limit_output_tokens_exhausted", "provider_limit_tokens_exhausted",
    "provider_limit_other_exhausted", "auto_receipt_capacity_exhausted",
    "provider_admission_wait_expired", "unclassified_resource_busy",
})


class ResourceBusy(StoreError):
    code = "resource_busy"

    def __init__(self, message: str = "Resource is busy", *, diagnostic_reason: str | None = None):
        # Optional source-owned enum for the native RPC receipt. Never derive
        # this value from exception text, provider data, or user input.
        self.diagnostic_reason = (diagnostic_reason if isinstance(diagnostic_reason, str)
            and diagnostic_reason in RESOURCE_BUSY_DIAGNOSTIC_REASONS else "unclassified_resource_busy")
        super().__init__(message)


class StateConflict(StoreError):
    code = "invalid_state"


class IndependentStore:
    def __init__(self, profile_home: str | Path, backend_profile_id: str, *, initialize: bool = True):
        from .scope import canonical_path
        from .contracts import Scope
        # UUID validation without accidentally accepting an active-profile
        # alias as the durable identity.
        self.backend_profile_id = Scope(backend_profile_id=backend_profile_id, space_id=new_id(), browser_profile_id="validation").backend_profile_id
        self.profile_home = canonical_path(profile_home)
        if not self.profile_home.is_dir():
            raise StoreError("Configured Profile Home is not a directory")
        self.db_path = self.profile_home / "state.db"
        self._lock = threading.RLock()
        self._local = threading.local()
        self.read_only = not initialize
        self._session_db = None
        if self.db_path.exists():
            with closing(sqlite3.connect(self.db_path.as_uri() + "?mode=ro", uri=True)) as existing:
                verify_supported(existing)
        if initialize:
            # Reuse the actual existing session store and its WAL/fallback
            # setup. The old module docstring is stale: it is real SQLite.
            from runtime._compat.shim_state import SessionDB
            self._session_db = SessionDB(db_path=self.db_path)
            self._conn = self._session_db._conn
            self._conn.execute("PRAGMA busy_timeout=2000")
            migrate(self._conn)
        else:
            # Pure reads do not create a DB, schema, profile or native Space.
            self._conn = sqlite3.connect(self.db_path.as_uri() + "?mode=ro", uri=True, check_same_thread=False, isolation_level=None)
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA query_only=ON")

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def __enter__(self) -> IndependentStore:
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    @contextmanager
    def transaction(self, *, write: bool = True) -> Iterator[sqlite3.Connection]:
        if write and self.read_only:
            raise StoreError("Read-only profile store cannot be mutated")
        with self._lock:
            depth = getattr(self._local, "depth", 0)
            savepoint = f"ia_nested_{depth}"
            if depth:
                self._conn.execute(f"SAVEPOINT {savepoint}")
            else:
                for attempt in range(3):
                    try:
                        self._conn.execute("BEGIN IMMEDIATE" if write else "BEGIN")
                        break
                    except sqlite3.OperationalError as exc:
                        if "locked" not in str(exc).lower() or attempt == 2:
                            raise
                        time.sleep((0.025, 0.075)[attempt])
            self._local.depth = depth + 1
            try:
                yield self._conn
                self._conn.execute(f"RELEASE SAVEPOINT {savepoint}" if depth else "COMMIT")
            except BaseException:
                if depth:
                    self._conn.execute(f"ROLLBACK TO SAVEPOINT {savepoint}")
                    self._conn.execute(f"RELEASE SAVEPOINT {savepoint}")
                else:
                    self._conn.execute("ROLLBACK")
                raise
            finally:
                self._local.depth = depth

    def _scope(self, scope: Scope) -> str:
        if scope.backend_profile_id != self.backend_profile_id:
            raise PermissionError("Scope belongs to another profile")
        return scope.key

    def _one(self, sql: str, params: tuple = ()):
        with self._lock:
            return self._conn.execute(sql, params).fetchone()

    def _many(self, sql: str, params: tuple = ()):
        with self._lock:
            return self._conn.execute(sql, params).fetchall()

    def _idempotent(self, scope: Scope, operation: str, request_id: str | None, request: Any):
        if request_id is None:
            return None
        row = self._one("SELECT request_digest,result_json FROM ia_request_results WHERE scope_key=? AND operation=? AND request_id=?", (self._scope(scope), operation, request_id))
        if row is None:
            return None
        if row["request_digest"] != digest_json(request):
            raise IdempotencyConflict("Request ID was already used for different content")
        import json
        return json.loads(row["result_json"])

    def _remember(self, scope: Scope, operation: str, request_id: str | None, request: Any, result: Any):
        if request_id is not None:
            self._conn.execute("INSERT INTO ia_request_results VALUES(?,?,?,?,?,?)", (self._scope(scope), request_id, operation, digest_json(request), canonical_json(result), utc_now()))

    def get_request_result(self, scope: Scope, operation: str, request_id: str, request: Any):
        return self._idempotent(scope, operation, request_id, request)

    def record_request_result(self, scope: Scope, operation: str, request_id: str, request: Any, result: Any):
        with self.transaction():
            existing = self._idempotent(scope, operation, request_id, request)
            if existing is not None:
                return existing
            self._remember(scope, operation, request_id, request, result)
            return result

    def register_profile(self, profile: BackendProfileRef) -> BackendProfileRef:
        from .scope import same_path
        if profile.backend_profile_id != self.backend_profile_id or not same_path(profile.canonical_home, self.profile_home):
            raise PermissionError("Profile reference does not own this store")
        with self.transaction():
            existing = self.get_profile_ref(profile.backend_profile_id)
            if existing is not None and existing != profile:
                if existing.canonical_home != profile.canonical_home or profile.revision != existing.revision + 1:
                    raise RevisionConflict("Profile update requires the next revision and the same Home")
            self._conn.execute("INSERT INTO ia_profile_refs VALUES(?,?,?,?,?,?) ON CONFLICT(backend_profile_id) DO UPDATE SET name=excluded.name,revision=excluded.revision,status=excluded.status,data_json=excluded.data_json", (profile.backend_profile_id, profile.canonical_home, profile.name, profile.revision, profile.status, canonical_json(profile)))
        return profile

    def get_profile_ref(self, profile_id: str | None = None) -> BackendProfileRef | None:
        profile_id = profile_id or self.backend_profile_id
        if profile_id != self.backend_profile_id:
            return None
        row = self._one("SELECT data_json FROM ia_profile_refs WHERE backend_profile_id=?", (profile_id,))
        return BackendProfileRef.model_validate_json(row[0]) if row else None

    def bind_space(self, binding: SpaceBinding, *, expected_revision: int | None = None) -> SpaceBinding:
        key = self._scope(binding.scope)
        with self.transaction():
            existing = self.get_binding(binding.scope)
            if existing == binding:
                return existing
            if existing is not None:
                if existing.tombstoned_at is not None:
                    raise StateConflict("Deleted Space identity cannot be silently resurrected")
                if expected_revision != existing.revision or binding.revision != existing.revision + 1:
                    raise RevisionConflict("Space binding revision changed")
                if binding.partition_key != existing.partition_key:
                    raise StateConflict("Partition replacement requires a separate controlled migration")
            elif binding.revision != 1:
                raise RevisionConflict("A new binding starts at revision 1")
            try:
                self._conn.execute("INSERT INTO ia_space_bindings VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(scope_key) DO UPDATE SET native_slug=excluded.native_slug,workspace_locator=excluded.workspace_locator,revision=excluded.revision,tombstoned_at=excluded.tombstoned_at,data_json=excluded.data_json", (key, binding.scope.backend_profile_id, binding.scope.space_id, binding.scope.browser_profile_id, binding.native_slug, binding.workspace_locator, binding.partition_key, binding.revision, binding.tombstoned_at, canonical_json(binding)))
            except sqlite3.IntegrityError as exc:
                raise ResourceBusy("Persistent browser partition is already bound to another Space") from exc
            self._emit(binding.scope, "activity_changed", {"reason": "space_bound"})
        return binding

    def get_binding(self, scope: Scope) -> SpaceBinding | None:
        row = self._one("SELECT data_json FROM ia_space_bindings WHERE scope_key=?", (self._scope(scope),))
        return SpaceBinding.model_validate_json(row[0]) if row else None

    def list_bindings(self, *, include_tombstoned: bool = False) -> tuple[SpaceBinding, ...]:
        where = "" if include_tombstoned else " WHERE tombstoned_at IS NULL"
        return tuple(SpaceBinding.model_validate_json(row[0]) for row in self._many("SELECT data_json FROM ia_space_bindings" + where + " ORDER BY native_slug"))

    def tombstone_binding(self, scope: Scope, *, expected_revision: int) -> SpaceBinding:
        with self.transaction():
            existing = self.get_binding(scope)
            if not existing or existing.revision != expected_revision:
                raise RevisionConflict("Space binding revision changed")
            tombstone = existing.model_copy(update={"revision": existing.revision + 1, "tombstoned_at": utc_now()})
            self.revoke_permissions(scope, expected_revision=self.get_permission_state(scope)["revision"])
            self._conn.execute("UPDATE ia_space_bindings SET revision=?,tombstoned_at=?,data_json=? WHERE scope_key=?", (tombstone.revision, tombstone.tombstoned_at, canonical_json(tombstone), self._scope(scope)))
            for run in self.list_runs(scope, include_terminal=False):
                self.transition_run(run.run_id, "interrupted", expected_revision=run.state_revision, reason_code="space_deleted", force_recovery=True)
            return tombstone

    def ensure_assistant(self, scope: Scope, *, conversation_id: str | None = None) -> AssistantState:
        with self.transaction():
            existing = self.get_assistant(scope)
            if existing:
                return existing
            if not self.get_binding(scope):
                raise PermissionError("Assistant needs an explicit Space binding")
            state = AssistantState(scope=scope, conversation_id=conversation_id or new_id())
            self._write_assistant(state)
            return state

    def get_assistant(self, scope: Scope) -> AssistantState | None:
        row = self._one("SELECT data_json FROM ia_assistant_state WHERE scope_key=?", (self._scope(scope),))
        return AssistantState.model_validate_json(row[0]) if row else None

    def _write_assistant(self, state: AssistantState):
        self._conn.execute("INSERT INTO ia_assistant_state VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(scope_key) DO UPDATE SET revision=excluded.revision,interview_revision=excluded.interview_revision,confirmed_profile_id=excluded.confirmed_profile_id,setup_status=excluded.setup_status,data_json=excluded.data_json,updated_at=excluded.updated_at", (self._scope(state.scope), state.conversation_id, state.revision, state.interview_revision, state.confirmed_profile_id, state.setup_status, canonical_json(state), state.updated_at))
        # Keep the durable answer history, including superseded originals.
        for answer in state.answers:
            self._conn.execute("INSERT INTO ia_interview_answers VALUES(?,?,?,?,?,?,?) ON CONFLICT(answer_id) DO NOTHING", (answer.answer_id, self._scope(answer.scope), answer.revision, answer.answer.question_id, answer.answer.replaces_answer_id, canonical_json(answer), answer.created_at))

    def update_assistant(self, scope: Scope, expected_revision: int, callback: Callable[[AssistantState], AssistantState], *, client_request_id: str | None = None, request_payload: Any = None, event_kind: str = "assistant", operation: str = "assistant_update") -> AssistantState:
        with self.transaction():
            cached = self._idempotent(scope, operation, client_request_id, request_payload)
            if cached is not None:
                return AssistantState.model_validate(cached)
            existing = self.ensure_assistant(scope)
            if existing.revision != expected_revision:
                raise RevisionConflict("Assistant revision changed")
            updated = callback(existing)
            # model_copy is deliberately revalidated; callbacks cannot bypass
            # strict types through Pydantic's unchecked copy(update=...).
            updated = AssistantState.model_validate_json(canonical_json(updated))
            if updated.scope != scope or updated.conversation_id != existing.conversation_id:
                raise PermissionError("Assistant identity is immutable")
            if updated.revision not in {existing.revision, existing.revision + 1}:
                raise RevisionConflict("Assistant revision must advance once")
            updated = updated.model_copy(update={"revision": existing.revision + 1, "updated_at": utc_now()})
            self._write_assistant(updated)
            self._emit(scope, event_kind, {"conversationId": updated.conversation_id, "revision": updated.revision})
            self._remember(scope, operation, client_request_id, request_payload, updated)
            return updated

    def save_assistant(self, state: AssistantState, *, expected_revision: int, client_request_id: str | None = None) -> AssistantState:
        return self.update_assistant(state.scope, expected_revision, lambda _: state, client_request_id=client_request_id, request_payload=state)

    def save_profile(self, profile: SpaceAssistantProfile) -> SpaceAssistantProfile:
        with self.transaction():
            existing = self.get_profile_snapshot(profile.profile_id)
            if existing:
                if existing != profile:
                    raise IdempotencyConflict("Confirmed snapshots are immutable")
                return existing
            self._conn.execute("INSERT INTO ia_profile_snapshots VALUES(?,?,?,?,?)", (profile.profile_id, self._scope(profile.scope), profile.revision, canonical_json(profile), profile.recorded_at))
            return profile

    def get_profile_snapshot(self, snapshot_id: str) -> SpaceAssistantProfile | None:
        row = self._one("SELECT data_json FROM ia_profile_snapshots WHERE snapshot_id=?", (snapshot_id,))
        return SpaceAssistantProfile.model_validate_json(row[0]) if row else None

    def get_confirmed_profile(self, scope: Scope) -> SpaceAssistantProfile | None:
        state = self.get_assistant(scope)
        if state and state.confirmed_profile_id:
            profile = self.get_profile_snapshot(state.confirmed_profile_id)
            if profile and profile.scope == scope and profile.status == "confirmed":
                return profile
        return None

    def put_definition(self, definition: AgentDefinition, *, expected_revision: int | None = None) -> AgentDefinition:
        with self.transaction():
            self._scope(definition.scope)
            existing = self.get_definition(definition.definition_id)
            if existing:
                if existing == definition:
                    return existing
                if existing.scope != definition.scope or expected_revision != existing.revision or definition.revision != existing.revision + 1:
                    raise RevisionConflict("Agent definition revision changed")
            elif definition.revision != 1:
                raise RevisionConflict("New definition starts at revision 1")
            self._conn.execute("INSERT INTO ia_definition_revisions VALUES(?,?,?,?,?,?)", (definition.definition_id, definition.revision, definition.scope.key, int(definition.enabled), canonical_json(definition), definition.created_at))
            self._emit(definition.scope, "activity_changed", {"reason": "definition_updated", "definitionId": definition.definition_id})
            return definition

    save_definition = put_definition

    def get_definition(self, definition_id: str, revision: int | None = None) -> AgentDefinition | None:
        row = self._one("SELECT data_json FROM ia_definition_revisions WHERE definition_id=?" + (" AND revision=?" if revision is not None else " ORDER BY revision DESC LIMIT 1"), (definition_id, revision) if revision is not None else (definition_id,))
        return AgentDefinition.model_validate_json(row[0]) if row else None

    def list_definitions(self, scope: Scope | None = None) -> tuple[AgentDefinition, ...]:
        params = (self._scope(scope),) if scope is not None else ()
        return tuple(AgentDefinition.model_validate_json(row[0]) for row in self._many("SELECT d.data_json FROM ia_definition_revisions d WHERE d.revision=(SELECT MAX(n.revision) FROM ia_definition_revisions n WHERE n.definition_id=d.definition_id)" + (" AND d.scope_key=?" if scope else "") + " ORDER BY d.created_at", params))

    def reserve_dispatch(self, request: TaskDispatchRequest, *, dispatch_id: str | None = None, target_session_id: str | None = None, authorized_definition: AgentDefinition | None = None) -> tuple[TaskDispatchView, bool]:
        with self.transaction():
            key = self._scope(request.scope)
            row = self._one("SELECT request_digest,data_json FROM ia_dispatches WHERE scope_key=? AND client_request_id=?", (key, request.client_request_id))
            if row:
                if row[0] != digest_json(request):
                    raise IdempotencyConflict("Dispatch request ID reused for different content")
                return TaskDispatchView.model_validate_json(row[1]), False
            if authorized_definition is not None:
                stored = self.get_definition(request.definition_id)
                if stored is None or stored != authorized_definition or not stored.enabled or stored.schedule is None or request.kind != "start_agent" or request.scope != stored.scope or request.definition_id != stored.definition_id or request.definition_revision != stored.revision or request.assistant_conversation_id != stored.activation_conversation_id or request.source_message_id != stored.activation_message_id or not stored.activation_message_id or request.title != stored.title or request.instruction != stored.instruction or request.desired_result != stored.desired_result:
                    raise PermissionError("Scheduled dispatch must match its exact durable definition authorization")
            else:
                assistant = self.get_assistant(request.scope)
                if assistant is None or assistant.conversation_id != request.assistant_conversation_id:
                    raise PermissionError("Dispatch must refer to this Space Assistant")
                source = next((message for message in assistant.messages if (message.get("id") or message.get("messageId") or message.get("message_id")) == request.source_message_id), None)
                if source is None or source.get("role") != "user":
                    raise PermissionError("Dispatch must reference an existing user message in this Assistant")
            view = TaskDispatchView(dispatch_id=dispatch_id or new_id(), scope=request.scope, assistant_conversation_id=request.assistant_conversation_id, source_message_id=request.source_message_id, target_session_id=target_session_id or new_id())
            self._conn.execute("INSERT INTO ia_dispatches VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (view.dispatch_id, key, view.assistant_conversation_id, view.source_message_id, request.client_request_id, digest_json(request), canonical_json(request), view.target_session_id, None, view.state, None, canonical_json(view), view.created_at, view.updated_at))
            self.put_outbox("session:" + view.dispatch_id, request.scope, "materialize_session", {"dispatchId": view.dispatch_id, "targetSessionId": view.target_session_id})
            self._emit(request.scope, "dispatch", {"dispatch": view.model_dump(mode="json", by_alias=True)})
            return view, True

    def get_dispatch(self, dispatch_id: str) -> TaskDispatchView | None:
        row = self._one("SELECT data_json FROM ia_dispatches WHERE dispatch_id=?", (dispatch_id,))
        return TaskDispatchView.model_validate_json(row[0]) if row else None

    def get_dispatch_request(self, dispatch_id: str) -> TaskDispatchRequest | None:
        row = self._one("SELECT request_json FROM ia_dispatches WHERE dispatch_id=?", (dispatch_id,))
        return TaskDispatchRequest.model_validate_json(row[0]) if row else None

    def list_dispatches(self, scope: Scope | None = None) -> tuple[TaskDispatchView, ...]:
        return tuple(TaskDispatchView.model_validate_json(row[0]) for row in self._many("SELECT data_json FROM ia_dispatches" + (" WHERE scope_key=?" if scope else "") + " ORDER BY created_at", (self._scope(scope),) if scope else ()))

    def update_dispatch(self, dispatch_id: str, state: str, *, run_id: str | None = None, reason_code: str | None = None) -> TaskDispatchView:
        with self.transaction():
            old = self.get_dispatch(dispatch_id)
            if old is None:
                raise StoreError("Unknown dispatch")
            allowed = {"prepared": {"materializing", "started", "failed"}, "materializing": {"prepared", "started", "failed"}, "started": set(), "failed": {"materializing", "prepared"}}
            if state != old.state and state not in allowed[old.state]:
                raise StateConflict("Dispatch cannot move to that state")
            new = TaskDispatchView.model_validate_json(canonical_json(old.model_copy(update={"state": state, "run_id": run_id or old.run_id, "reason_code": reason_code, "updated_at": utc_now()})))
            self._conn.execute("UPDATE ia_dispatches SET state=?,run_id=?,error_code=?,data_json=?,updated_at=? WHERE dispatch_id=?", (new.state, new.run_id, new.reason_code, canonical_json(new), new.updated_at, dispatch_id))
            self._emit(new.scope, "dispatch", {"dispatch": new.model_dump(mode="json", by_alias=True)})
            return new

    def create_run(self, run: RunView, context: RunContext) -> tuple[RunView, bool]:
        with self.transaction():
            self._scope(run.scope)
            if context.scope != run.scope or context.run_id != run.run_id or context.dispatch_id != run.dispatch_id or context.agent_definition_revision != run.definition_revision:
                raise PermissionError("RunContext identity does not match the run")
            if run.state != "queued" or run.state_revision != 1:
                raise StateConflict("New runs start queued at revision 1")
            dispatch = self.get_dispatch(run.dispatch_id)
            if not dispatch or dispatch.scope != run.scope or dispatch.target_session_id != run.target_session_id:
                raise PermissionError("Run needs its reserved scoped workchat")
            old = self.get_run(run.run_id)
            if old:
                if self.get_run_context(run.run_id) != context or old.dispatch_id != run.dispatch_id:
                    raise IdempotencyConflict("Run identity reused with different context")
                return old, False
            definition = self.get_definition(run.definition_id, run.definition_revision)
            if not definition or definition.scope != run.scope or not definition.enabled:
                raise PermissionError("Run definition is unavailable")
            try:
                self._conn.execute("INSERT INTO ia_runs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (run.run_id, run.definition_id, run.definition_revision, run.scope.key, run.dispatch_id, run.state, run.state_revision, run.control_epoch, context.runner_generation, canonical_json(run.counters), canonical_json(context), canonical_json(run), run.created_at, run.updated_at))
            except sqlite3.IntegrityError as exc:
                raise ResourceBusy("Definition or dispatch already has a run") from exc
            self._emit(run.scope, "run_state", {"runId": run.run_id, "state": run.state, "stateRevision": run.state_revision})
            return run, True

    def get_run(self, run_id: str) -> RunView | None:
        row = self._one("SELECT data_json FROM ia_runs WHERE run_id=?", (run_id,))
        return RunView.model_validate_json(row[0]) if row else None

    def get_run_context(self, run_id: str) -> RunContext | None:
        row = self._one("SELECT context_json FROM ia_runs WHERE run_id=?", (run_id,))
        return RunContext.model_validate_json(row[0]) if row else None

    def adopt_queued_generation(self, run_id: str, generation: str) -> RunContext:
        """Rotate only transport ownership for work that never dispatched.

        Scope, Home, provider, definition and confirmed-profile snapshots stay
        frozen. Once any action exists this becomes interrupted/retry instead.
        """
        with self.transaction():
            run = self.get_run(run_id)
            context = self.get_run_context(run_id)
            if not run or run.state != "queued" or self.list_actions(run_id):
                raise StateConflict("Only never-dispatched queued work can adopt a fresh generation")
            new = RunContext.model_validate_json(canonical_json(context.model_copy(update={"runner_generation": generation, "cancellation_token": new_id()})))
            self._conn.execute("UPDATE ia_runs SET generation=?,context_json=? WHERE run_id=?", (generation, canonical_json(new), run_id))
            return new

    def list_runs(self, scope: Scope | None = None, *, include_terminal: bool = True, states: tuple[str, ...] | None = None) -> tuple[RunView, ...]:
        params: list[Any] = []
        terms = []
        if scope is not None:
            terms.append("scope_key=?")
            params.append(self._scope(scope))
        if not include_terminal:
            terms.append("state NOT IN ('completed','failed','cancelled','interrupted')")
        if states:
            terms.append("state IN (" + ",".join("?" for _ in states) + ")")
            params.extend(states)
        return tuple(RunView.model_validate_json(row[0]) for row in self._many("SELECT data_json FROM ia_runs" + (" WHERE " + " AND ".join(terms) if terms else "") + " ORDER BY created_at,run_id", tuple(params)))

    def _write_run(self, run: RunView):
        self._conn.execute("UPDATE ia_runs SET state=?,state_revision=?,control_epoch=?,counters_json=?,data_json=?,updated_at=? WHERE run_id=?", (run.state, run.state_revision, run.control_epoch, canonical_json(run.counters), canonical_json(run), run.updated_at, run.run_id))

    def transition_run(self, run_id: str, state: str, *, expected_revision: int | None = None, expected_control_epoch: int | None = None, reason_code: str | None = None, result_ref: str | None = None, waiting_for: Any = None, force_recovery: bool = False, client_request_id: str | None = None, expected_scope: Scope | None = None, expected_permission_revision: int | None = None, expected_permission_epoch: int | None = None) -> RunView:
        with self.transaction():
            old = self.get_run(run_id)
            if old is None:
                raise StoreError("Unknown run")
            if expected_scope is not None and old.scope != expected_scope:
                raise RevisionConflict("Run control scope changed")
            if expected_permission_revision is not None or expected_permission_epoch is not None:
                permissions = self.get_permission_state(old.scope)
                if (expected_permission_revision is not None and permissions["revision"] != expected_permission_revision
                        or expected_permission_epoch is not None and permissions["controlEpoch"] != expected_permission_epoch):
                    raise RevisionConflict("Run control permission revision or epoch changed")
            request = {"runId": run_id, "state": state, "expectedRevision": expected_revision, "epoch": expected_control_epoch, "reason": reason_code}
            cached = self._idempotent(old.scope, "run_control", client_request_id, request)
            if cached is not None:
                return RunView.model_validate(cached)
            if expected_revision is not None and old.state_revision != expected_revision or expected_control_epoch is not None and old.control_epoch != expected_control_epoch:
                raise RevisionConflict("Run state or cancellation epoch changed")
            if state == old.state:
                return old
            if state not in RUN_TRANSITIONS[old.state] and not (force_recovery and state == "interrupted" and old.state not in TERMINAL_STATES):
                raise StateConflict("Late reply or invalid run transition rejected")
            if state == "paused":
                checkpoint = self.latest_checkpoint(run_id)
                if old.state == "pausing" and (checkpoint is None or not checkpoint["safeBoundary"]):
                    raise StateConflict("Pause must acknowledge a persisted safe boundary")
            new = old.model_copy(update={"state": state, "state_revision": old.state_revision + 1, "control_epoch": old.control_epoch + int(state in {"cancelling", "interrupted"}), "reason_code": reason_code, "result_ref": result_ref or old.result_ref, "waiting_for": waiting_for, "updated_at": utc_now()})
            new = RunView.model_validate_json(canonical_json(new))
            self._write_run(new)
            self._emit(new.scope, "run_state", {"runId": new.run_id, "state": new.state, "stateRevision": new.state_revision, "reasonCode": reason_code})
            if state in TERMINAL_STATES:
                self._conn.execute("UPDATE ia_resource_leases SET state='released',revision=revision+1 WHERE run_id=? AND state='active' AND resource_key NOT LIKE 'account:%'", (run_id,))
                self._conn.execute("UPDATE ia_approval_bindings SET state='revoked' WHERE run_id=? AND state IN ('pending','approved')", (run_id,))
                self.put_outbox("result:" + run_id, new.scope, "terminal_result", {"runId": run_id, "dispatchId": new.dispatch_id, "targetSessionId": new.target_session_id, "status": state, "resultRef": new.result_ref, "deliveryKey": "result:" + run_id})
            self._remember(new.scope, "run_control", client_request_id, request, new)
            return new

    def update_counters(self, run_id: str, *, expected_control_epoch: int | None = None, tool_calls: int = 0, provider_requests: int = 0, active_seconds: float = 0.0, measured_tokens: int | None = None) -> RunView:
        if min(tool_calls, provider_requests, active_seconds) < 0 or (measured_tokens is not None and measured_tokens < 0):
            raise ValueError("Counters cannot be decremented")
        with self.transaction():
            run = self.get_run(run_id)
            if run is None or run.state in TERMINAL_STATES or (expected_control_epoch is not None and run.control_epoch != expected_control_epoch):
                raise StateConflict("Cannot update a completed or revoked run")
            old = run.counters
            tokens = None if measured_tokens is None and old.measured_tokens is None else (old.measured_tokens or 0) + (measured_tokens or 0)
            counters = RunCounters(tool_calls=old.tool_calls + tool_calls, provider_requests=old.provider_requests + provider_requests, active_seconds=old.active_seconds + float(active_seconds), measured_tokens=tokens)
            new = run.model_copy(update={"counters": counters, "updated_at": utc_now()})
            self._write_run(new)
            return new

    def _emit(self, scope: Scope, kind: str, payload: dict[str, Any]) -> RunEvent:
        key = self._scope(scope)
        self._conn.execute("INSERT INTO ia_scope_cursors VALUES(?,0) ON CONFLICT(scope_key) DO NOTHING", (key,))
        self._conn.execute("UPDATE ia_scope_cursors SET last_seq=last_seq+1 WHERE scope_key=?", (key,))
        seq = self._conn.execute("SELECT last_seq FROM ia_scope_cursors WHERE scope_key=?", (key,)).fetchone()[0]
        event = RunEvent(event_id=new_id(), scope=scope, seq=seq, at=utc_now(), kind=kind, payload=payload)
        self._conn.execute("INSERT INTO ia_run_events VALUES(?,?,?,?,?,?,?)", (key, seq, event.event_id, payload.get("runId"), kind, canonical_json(payload), event.at))
        return event

    def append_event(self, scope: Scope, kind: str, payload: dict[str, Any]) -> RunEvent:
        with self.transaction():
            return self._emit(scope, kind, payload)

    def watermark(self, scope: Scope) -> int:
        row = self._one("SELECT last_seq FROM ia_scope_cursors WHERE scope_key=?", (self._scope(scope),))
        return int(row[0]) if row else 0

    def events_after(self, scope: Scope, after: int, *, limit: int = 500) -> tuple[RunEvent, ...]:
        import json
        if after < 0 or limit < 1 or limit > 1000:
            raise ValueError("Invalid cursor range")
        rows = self._many("SELECT * FROM ia_run_events WHERE scope_key=? AND seq>? ORDER BY seq LIMIT ?", (self._scope(scope), after, limit))
        return tuple(RunEvent(event_id=row["event_id"], scope=scope, seq=row["seq"], at=row["at"], kind=row["kind"], payload=json.loads(row["payload_json"])) for row in rows)

    def activity_snapshot(self, scope: Scope) -> ActivitySnapshot:
        with self.transaction(write=False):
            runs = self.list_runs(scope)
            dispatches = self.list_dispatches(scope)
            definitions = self.list_definitions(scope)
            approvals = self.list_approvals(scope)
            progress = tuple(self.get_run_progress(row[0]) for row in self._many("SELECT json_extract(payload_json,'$.runId') FROM ia_outbox WHERE scope_key=? AND kind='run_progress' ORDER BY updated_at DESC LIMIT 100", (self._scope(scope),)))
            native_approvals = tuple(NativeApprovalView.model_validate_json(row[0]).model_copy(update={"state": row[1]})
                for row in self._many("""SELECT approval.data_json,approval.state FROM ia_approval_bindings approval
                    WHERE approval.scope_key=? AND approval.run_id IS NULL AND approval.state IN ('pending','approved')
                      AND approval.expires_at>?
                      AND EXISTS(SELECT 1 FROM ia_resource_leases writer WHERE writer.lease_id=json_extract(approval.data_json,'$.writerLeaseId')
                        AND writer.scope_key=approval.scope_key AND writer.state='active' AND writer.run_id IS NULL
                        AND writer.owner_generation=json_extract(approval.data_json,'$.writerGeneration')
                        AND json_extract(writer.data_json,'$.ownerKind')='legacy_chat')""", (self._scope(scope), utc_now())))
            return ActivitySnapshot(scope=scope, observed_at=utc_now(), watermark=self.watermark(scope), runs=runs, run_progress=tuple(p for p in progress if p is not None), dispatches=dispatches, approvals=approvals, native_approvals=native_approvals, active_chats=tuple({"sessionId": r.target_session_id, "dispatchId": r.dispatch_id, "observedAt": r.updated_at} for r in runs if r.state not in TERMINAL_STATES and r.target_session_id), schedules=self.schedule_activity(scope, definitions=definitions))

    def get_run_progress(self, run_id: str):
        from .contracts import RunProgress
        item = self.get_outbox("progress:" + run_id)
        if item is None or item["kind"] != "run_progress":
            return None
        progress = RunProgress.model_validate(item["payload"])
        run = self.get_run(run_id)
        if run is None or progress.run_id != run_id or progress.scope != run.scope or progress.target_session_id != run.target_session_id:
            raise PermissionError("Run progress scope or session changed")
        return progress

    def save_run_progress(self, run_id: str, text: str, *, truncated: bool = False, active_seconds: float | None = None):
        from .contracts import RunProgress
        with self.transaction():
            run = self.get_run(run_id)
            context = self.get_run_context(run_id)
            if run is None or context is None:
                raise StoreError("Run progress requires its durable scoped run")
            previous = self.get_run_progress(run_id)
            counters = run.counters
            if active_seconds is not None:
                counters = counters.model_copy(update={"active_seconds": max(counters.active_seconds, active_seconds)})
            now = utc_now()
            progress = RunProgress(run_id=run_id, scope=run.scope, target_session_id=run.target_session_id,
                progress_revision=1 if previous is None else previous.progress_revision + 1, observed_at=now,
                run_state=run.state, counters=counters, budget=context.budget, text=text, text_truncated=truncated)
            self._conn.execute("""INSERT INTO ia_outbox VALUES(?,?,?,?,?,0,NULL,NULL,?,?)
                ON CONFLICT(delivery_key) DO UPDATE SET payload_json=excluded.payload_json,state='pending',attempts=0,
                error_code=NULL,next_attempt_at=NULL,updated_at=excluded.updated_at""",
                ("progress:" + run_id, self._scope(run.scope), "run_progress", canonical_json(progress), "pending", now, now))
            self._emit(run.scope, "run_progress", {"runId": run_id, "targetSessionId": run.target_session_id,
                "progressRevision": progress.progress_revision, "observedAt": now, "runState": run.state,
                "counters": counters.model_dump(mode="json", by_alias=True), "textPreview": text[-512:],
                "textTruncated": truncated, "source": "sdk_output_text"})
            return progress

    def schedule_activity(self, scope: Scope, *, definitions=None) -> tuple[dict[str, Any], ...]:
        """Actual native cursor and durable outcomes, without writes on reads."""
        from runtime.cron.jobs import read_scoped_jobs
        definitions = definitions if definitions is not None else self.list_definitions(scope)
        try:
            native = {row.get("id"): row for row in read_scoped_jobs(self.profile_home) if row.get("job_type") == "independent_agent"}
            available = True
        except (OSError, ValueError, TypeError):
            native, available = {}, False
        result = []
        for definition in definitions:
            if definition.schedule is None:
                continue
            row = native.get("independent:" + definition.definition_id)
            current = row is not None and (row.get("independent_ref") or {}).get("definitionRevision") == definition.revision
            last = self._one("SELECT planned_utc,outcome,run_id,schedule_revision FROM ia_schedule_occurrences WHERE definition_id=? ORDER BY planned_utc DESC LIMIT 1", (definition.definition_id,))
            result.append({"definitionId": definition.definition_id, "definitionRevision": definition.revision, "enabled": definition.enabled, "scheduleRevision": definition.schedule.revision, "timezone": definition.schedule.timezone, "cronExpression": definition.schedule.cron_expression, "nextRunAt": row.get("next_run_at") if current else None, "sourceStatus": "observed" if current else "projection_pending" if available else "unavailable", "lastOccurrence": {"plannedUtc": last[0], "outcome": last[1], "runId": last[2], "scheduleRevision": last[3]} if last else None})
        return tuple(result)

    snapshot = activity_snapshot

    def recover_events(self, scope: Scope, after: int) -> dict[str, Any]:
        with self.transaction(write=False):
            earliest = self._one("SELECT MIN(seq) FROM ia_run_events WHERE scope_key=?", (self._scope(scope),))[0]
            watermark = self.watermark(scope)
            stale = after > watermark or (after < watermark and (earliest is None or after < earliest - 1))
            if stale:
                snapshot = self.activity_snapshot(scope)
                return {"resyncRequired": True, "snapshot": snapshot, "watermark": snapshot.watermark, "events": ()}
            return {"resyncRequired": False, "snapshot": None, "watermark": watermark, "events": self.events_after(scope, after)}

    def trim_events(self, scope: Scope, *, retain: int = 10000) -> int:
        if retain < 1:
            raise ValueError("Retain at least one event")
        with self.transaction():
            threshold = self.watermark(scope) - retain
            return self._conn.execute("DELETE FROM ia_run_events WHERE scope_key=? AND seq<=?", (self._scope(scope), threshold)).rowcount

    def put_outbox(self, delivery_key: str, scope: Scope, kind: str, payload: dict[str, Any]) -> dict[str, Any]:
        with self.transaction():
            existing = self.get_outbox(delivery_key)
            if existing:
                if existing["scopeKey"] != self._scope(scope) or existing["kind"] != kind or digest_json(existing["payload"]) != digest_json(payload):
                    raise IdempotencyConflict("Outbox key reused for different content")
                return existing
            now = utc_now()
            self._conn.execute("INSERT INTO ia_outbox VALUES(?,?,?,?,?,0,NULL,NULL,?,?)", (delivery_key, self._scope(scope), kind, canonical_json(payload), "pending", now, now))
            return self.get_outbox(delivery_key)

    def get_outbox(self, delivery_key: str) -> dict[str, Any] | None:
        import json
        row = self._one("SELECT * FROM ia_outbox WHERE delivery_key=?", (delivery_key,))
        if not row:
            return None
        return {"deliveryKey": row["delivery_key"], "scopeKey": row["scope_key"], "kind": row["kind"], "payload": json.loads(row["payload_json"]), "state": row["state"], "attempts": row["attempts"], "nextAttemptAt": row["next_attempt_at"], "errorCode": row["error_code"]}

    def pending_outbox(self, *, limit: int = 100) -> tuple[dict[str, Any], ...]:
        rows = self._many("SELECT delivery_key FROM ia_outbox WHERE state='pending' AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY created_at LIMIT ?", (utc_now(), limit))
        return tuple(self.get_outbox(row[0]) for row in rows)

    def finish_outbox(self, delivery_key: str, *, success: bool, error_code: str | None = None, next_attempt_at: str | None = None, terminal: bool = False) -> dict[str, Any]:
        with self.transaction():
            existing = self.get_outbox(delivery_key)
            if not existing:
                raise StoreError("Unknown outbox delivery")
            if existing["state"] != "pending":
                return existing
            attempts = existing["attempts"] + 1
            state = "delivered" if success else "failed" if terminal or attempts >= 5 else "pending"
            self._conn.execute("UPDATE ia_outbox SET state=?,attempts=?,next_attempt_at=?,error_code=?,updated_at=? WHERE delivery_key=?", (state, attempts, next_attempt_at, error_code, utc_now(), delivery_key))
            return self.get_outbox(delivery_key)

    def create_approval(self, approval: ApprovalView) -> ApprovalView:
        with self.transaction():
            run = self.get_run(approval.run_id)
            if not run or run.scope != approval.scope or run.state in TERMINAL_STATES:
                raise PermissionError("Approval needs a live run in the same scope")
            if approval.action_id is not None:
                action = self.get_action(approval.action_id)
                if (action is None or action.run_id != approval.run_id or action.scope != approval.scope
                    or action.state != "prepared" or action.canonical_args_digest != approval.action_digest
                    or action.intended_effect != approval.effect or action.permission_revision != approval.permission_revision
                    or action.navigation_epoch != approval.navigation_epoch or action.control_epoch != approval.control_epoch
                    or any(getattr(action, field) != getattr(approval, field) for field in
                        ("lease_id", "target_id", "main_generation", "runner_generation"))):
                    raise PermissionError("Approval must bind the exact prepared action and browser target")
            elif approval.lease_id is not None or approval.target_id is not None or approval.main_generation is not None or approval.runner_generation is not None:
                raise PermissionError("Target-bound approval requires its exact action identity")
            if self.get_approval(approval.approval_id):
                raise IdempotencyConflict("Approval identity already exists")
            self._conn.execute("INSERT INTO ia_approval_bindings VALUES(?,?,?,?,?,?,?,?)", (approval.approval_id, approval.run_id, self._scope(approval.scope), approval.action_digest, approval.permission_revision, approval.state, approval.expires_at, canonical_json(approval)))
            self._emit(approval.scope, "approval", {"approval": approval.model_dump(mode="json", by_alias=True)})
            return approval

    def get_approval(self, approval_id: str) -> ApprovalView | None:
        row = self._one("SELECT data_json,state FROM ia_approval_bindings WHERE approval_id=? AND run_id IS NOT NULL", (approval_id,))
        return ApprovalView.model_validate_json(row[0]).model_copy(update={"state": row[1]}) if row else None

    def list_approvals(self, scope: Scope) -> tuple[ApprovalView, ...]:
        return tuple(ApprovalView.model_validate_json(row[0]).model_copy(update={"state": row[1]}) for row in self._many("SELECT data_json,state FROM ia_approval_bindings WHERE scope_key=? AND run_id IS NOT NULL", (self._scope(scope),)))

    def decide_approval(self, approval_id: str, *, approved: bool, actor_ref: str, action_digest: str, expected_permission_revision: int) -> ApprovalView:
        with self.transaction():
            old = self.get_approval(approval_id)
            if not old or old.state != "pending" or old.expires_at <= utc_now() or old.action_digest != action_digest or old.permission_revision != expected_permission_revision or self.get_permission_state(old.scope)["revision"] != expected_permission_revision:
                raise RevisionConflict("Approval expired or its action/permission changed")
            if approved:
                candidates = [action for action in self.list_actions(old.run_id)
                    if action.canonical_args_digest == old.action_digest and action.intended_effect == old.effect
                    and action.permission_revision == old.permission_revision and action.state == "prepared"]
                action = next((row for row in candidates if old.action_id is not None and row.action_id == old.action_id), None)
                # Old browser approvals did not carry action/target identity.
                # They cannot be upgraded by approval; a new action must be reviewed.
                if (action is None and (old.action_id is not None or any(row.lease_id is not None or row.resource_refs for row in candidates))):
                    raise RevisionConflict("Approval lacks the immutable target binding; request a new review")
                if action is not None and (action.scope != old.scope or action.control_epoch != old.control_epoch
                    or action.navigation_epoch != old.navigation_epoch
                    or any(getattr(action, field) != getattr(old, field) for field in
                        ("lease_id", "target_id", "main_generation", "runner_generation"))):
                    raise RevisionConflict("Approval no longer matches its exact action target")
            if not actor_ref.startswith("user:"):
                raise PermissionError("Only an authenticated human actor may approve")
            new = old.model_copy(update={"state": "approved" if approved else "revoked", "actor_ref": actor_ref})
            self._conn.execute("UPDATE ia_approval_bindings SET state=?,data_json=? WHERE approval_id=?", (new.state, canonical_json(new), approval_id))
            self._emit(new.scope, "approval", {"approval": new.model_dump(mode="json", by_alias=True)})
            return new

    def get_permission_state(self, scope: Scope) -> dict[str, Any]:
        import json
        row = self._one("SELECT * FROM ia_permission_state WHERE scope_key=?", (self._scope(scope),))
        if row is None:
            return {"revision": 1, "controlEpoch": 0, "controlSequence": 0, "permissions": None}
        return {"revision": row["revision"], "controlEpoch": row["control_epoch"], "controlSequence": row["control_sequence"], "permissions": json.loads(row["data_json"])}

    def set_permission_state(self, scope: Scope, permissions: Any, *, expected_revision: int) -> dict[str, Any]:
        with self.transaction():
            old = self.get_permission_state(scope)
            if old["revision"] != expected_revision:
                raise RevisionConflict("Permissions revision changed")
            new = {**old, "revision": old["revision"] + 1, "controlEpoch": old["controlEpoch"] + 1, "controlSequence": old["controlSequence"] + 1, "permissions": permissions}
            self._conn.execute("INSERT INTO ia_permission_state VALUES(?,?,?,?,?,?) ON CONFLICT(scope_key) DO UPDATE SET revision=excluded.revision,control_epoch=excluded.control_epoch,control_sequence=excluded.control_sequence,data_json=excluded.data_json,updated_at=excluded.updated_at", (self._scope(scope), new["revision"], new["controlEpoch"], new["controlSequence"], canonical_json(permissions), utc_now()))
            self._conn.execute("UPDATE ia_approval_bindings SET state='revoked' WHERE scope_key=? AND state IN ('pending','approved')", (scope.key,))
            self._emit(scope, "control", {"permissionRevision": new["revision"], "controlEpoch": new["controlEpoch"], "controlSequence": new["controlSequence"]})
            return new

    def revoke_permissions(self, scope: Scope, *, expected_revision: int) -> dict[str, Any]:
        return self.set_permission_state(scope, {"revoked": True}, expected_revision=expected_revision)

    def next_control_sequence(self, scope: Scope) -> int:
        with self.transaction():
            state = self.get_permission_state(scope)
            value = state["controlSequence"] + 1
            self._conn.execute("INSERT INTO ia_permission_state VALUES(?,?,?,?,?,?) ON CONFLICT(scope_key) DO UPDATE SET control_sequence=excluded.control_sequence,updated_at=excluded.updated_at", (self._scope(scope), state["revision"], state["controlEpoch"], value, canonical_json(state["permissions"]), utc_now()))
            return value

    def prepare_action(self, action: ActionRecord) -> ActionRecord:
        with self.transaction():
            run = self.get_run(action.run_id)
            if not run or run.scope != action.scope or run.state != "running" or run.control_epoch != action.control_epoch:
                raise StateConflict("Tool dispatch is not active for this run")
            old = self.get_action(action.action_id)
            if old:
                if old != action:
                    raise IdempotencyConflict("Action identity reused with different content")
                return old
            self._conn.execute("INSERT INTO ia_action_journal VALUES(?,?,?,?,?,?,?,?,?,?,?)", (action.action_id, action.run_id, self._scope(action.scope), action.step_id, action.attempt, action.state, action.permission_revision, action.control_epoch, canonical_json(action), action.created_at, action.finished_at))
            return action

    def get_action(self, action_id: str) -> ActionRecord | None:
        row = self._one("SELECT data_json,state FROM ia_action_journal WHERE action_id=? AND run_id IS NOT NULL", (action_id,))
        return ActionRecord.model_validate_json(row[0]).model_copy(update={"state": row[1]}) if row else None

    def list_actions(self, run_id: str) -> tuple[ActionRecord, ...]:
        return tuple(ActionRecord.model_validate_json(row[0]).model_copy(update={"state": row[1]}) for row in self._many("SELECT data_json,state FROM ia_action_journal WHERE run_id=? ORDER BY created_at", (run_id,)))

    def claim_action(self, action_id: str, *, expected_permission_revision: int, expected_control_epoch: int, approval_id: str | None = None) -> ActionRecord:
        with self.transaction():
            old = self.get_action(action_id)
            if old is None or old.state != "prepared":
                raise StateConflict("Action was already claimed or does not exist")
            run = self.get_run(old.run_id)
            current = self.get_permission_state(old.scope)
            if not run or run.state != "running" or run.control_epoch != expected_control_epoch or old.control_epoch != expected_control_epoch or current["revision"] != expected_permission_revision or old.permission_revision != expected_permission_revision or (current["permissions"] or {}).get("revoked"):
                raise RevisionConflict("Action authorization changed before dispatch")
            context = self.get_run_context(old.run_id)
            if context and context.connection_bindings:
                from .connections import ConnectionRepository
                bindings = {binding.binding_id: binding for binding in ConnectionRepository(self).list(old.scope)}
                for captured in context.connection_bindings:
                    binding = bindings.get(captured.binding_id)
                    if binding is None or binding.status != "active" or binding.revision != captured.revision or binding.connection_revision != captured.connection_revision or binding.capability_id != captured.capability_id or binding.connection_id != captured.connection_id:
                        raise RevisionConflict("Connection authorization changed before action claim")
            if old.lease_id is not None or old.resource_refs:
                if (old.lease_id is None or old.resource_refs != (old.lease_id,) or not old.target_id
                    or not old.main_generation or not old.runner_generation):
                    raise RevisionConflict("Browser action lacks an immutable target identity; request a new review")
                lease_rows = self._many("SELECT * FROM ia_resource_leases WHERE lease_id=?", (old.lease_id,))
                if len(lease_rows) != 1:
                    raise RevisionConflict("Browser target lease is unavailable")
                lease = self._lease_dict(lease_rows[0])
                if (lease.get("state") != "active" or lease.get("runId") != old.run_id
                    or lease.get("scope") != old.scope.model_dump(mode="json", by_alias=True)
                    or lease.get("ownerGeneration") != old.runner_generation
                    or lease.get("resourceKey") != "target:" + old.lease_id
                    or any(getattr(old, field) != lease.get(alias) for field, alias in
                        (("lease_id", "leaseId"), ("target_id", "targetId"),
                         ("main_generation", "mainGeneration"), ("runner_generation", "runnerGeneration"),
                         ("navigation_epoch", "navigationEpoch")))):
                    raise RevisionConflict("Browser target identity changed before action claim")
            if approval_id is not None:
                approval = self.get_approval(approval_id)
                if not approval or approval.state != "approved" or approval.run_id != old.run_id or approval.scope != old.scope or (approval.action_id is not None and approval.action_id != old.action_id) or (old.lease_id is not None and approval.action_id != old.action_id) or approval.effect != old.intended_effect or approval.action_digest != old.canonical_args_digest or approval.permission_revision != old.permission_revision or approval.navigation_epoch != old.navigation_epoch or approval.control_epoch != old.control_epoch or any(getattr(approval, field) != getattr(old, field) for field in ("lease_id", "target_id", "main_generation", "runner_generation")) or approval.expires_at <= utc_now():
                    raise RevisionConflict("Approval cannot authorize this exact action")
                self._conn.execute("UPDATE ia_approval_bindings SET state='consumed' WHERE approval_id=?", (approval_id,))
            elif old.approval_id is not None or old.intended_effect != "read":
                raise PermissionError("This action requires its specific approval")
            new = old.model_copy(update={"state": "claimed", "approval_id": approval_id})
            self._conn.execute("UPDATE ia_action_journal SET state=?,data_json=? WHERE action_id=?", (new.state, canonical_json(new), action_id))
            self._emit(old.scope, "action", {"runId": old.run_id, "actionId": action_id, "state": new.state})
            return new

    def _native_owner(self, context) -> NativeChatOwner:
        from .native_chat_protocol import verify_native_context
        verify_native_context(context)
        if context.scope.backend_profile_id != self.backend_profile_id or Path(context.store_path).resolve() != self.db_path.resolve():
            raise PermissionError("Native action belongs to another profile store")
        return NativeChatOwner(session_id=context.session_id, stream_id=context.stream_id,
            writer_generation=context.writer_generation, writer_lease_id=context.writer_lease_id)

    def _native_authority(self, context, record):
        owner = self._native_owner(context)
        if record.owner_ref != owner or record.scope != context.scope or record.run_id is not None:
            raise PermissionError("Native action owner changed")
        current = self.get_permission_state(context.scope)
        if (record.permission_revision != current["revision"] or record.control_epoch != current["controlEpoch"]
            or (current["permissions"] or {}).get("revoked")):
            raise RevisionConflict("Native action permission epoch changed")
        action = record if isinstance(record, NativeActionRecord) else self.get_native_action(record.action_id)
        if action is None: raise StoreError("Native action is unavailable")
        from .connections import ConnectionRepository
        live = {row.binding_id: row for row in ConnectionRepository(self).list(context.scope)}
        for ref in action.connection_bindings:
            actual = live.get(ref.binding_id)
            if (actual is None or actual.status != "active" or actual.scope != context.scope
                or actual.connection_id != ref.connection_id or actual.capability_id != ref.capability_id
                or actual.revision != ref.revision or actual.connection_revision != ref.connection_revision
                or actual.connection_kind != ref.kind):
                raise RevisionConflict("Native connection binding changed")
        if action.connection_revisions != {ref.binding_id: ref.revision for ref in action.connection_bindings}:
            raise RevisionConflict("Native action connection revisions disagree")
        if action.lease_id is not None:
            leases = [lease for lease in self.list_leases() if lease["leaseId"] == action.lease_id]
            if len(leases) != 1: raise RevisionConflict("Native browser lease is unavailable")
            lease = leases[0]
            if (lease.get("ownerKind") != "native_chat" or lease.get("runId") is not None
                or lease.get("ownerGeneration") != context.writer_generation or lease.get("ownerRef") != context.stream_id
                or lease.get("scope") != context.scope.model_dump(mode="json", by_alias=True)
                or lease.get("sessionId") != context.session_id or lease.get("writerLeaseId") != context.writer_lease_id
                or lease.get("resourceKey") != "target:" + action.lease_id
                or any(getattr(action, field) != lease.get(alias) for field, alias in (("target_id", "targetId"),
                    ("main_generation", "mainGeneration"), ("runner_generation", "runnerGeneration"), ("navigation_epoch", "navigationEpoch")))):
                raise RevisionConflict("Native browser target generation changed")
        return owner

    def prepare_native_action(self, context, action: NativeActionRecord) -> NativeActionRecord:
        if not isinstance(action, NativeActionRecord): raise TypeError("Native action contract required")
        with self.transaction():
            self._native_authority(context, action)
            if action.authorization_ref != context.writer_lease_id or action.state != "prepared":
                raise PermissionError("Native action needs its exact writer ingress")
            existing = self.get_native_action(action.action_id)
            if existing is not None:
                if existing != action: raise IdempotencyConflict("Native action identity changed")
                return existing
            self._conn.execute("INSERT INTO ia_action_journal VALUES(?,?,?,?,?,?,?,?,?,?,?)", (action.action_id, None,
                self._scope(action.scope), action.step_id, action.attempt, action.state, action.permission_revision,
                action.control_epoch, canonical_json(action), action.created_at, action.finished_at))
            self._emit(action.scope, "action", {"ownerKind": "native_chat", "sessionId": action.session_id,
                "streamId": action.stream_id, "actionId": action.action_id, "state": action.state})
            return action

    def get_native_action(self, action_id: str) -> NativeActionRecord | None:
        row = self._one("SELECT data_json,state FROM ia_action_journal WHERE action_id=? AND run_id IS NULL", (action_id,))
        return NativeActionRecord.model_validate_json(row[0]).model_copy(update={"state": row[1]}) if row else None

    def list_native_actions(self, context) -> tuple[NativeActionRecord, ...]:
        owner = self._native_owner(context)
        return tuple(action for row in self._many("SELECT action_id FROM ia_action_journal WHERE scope_key=? AND run_id IS NULL ORDER BY created_at", (self._scope(context.scope),))
            if (action := self.get_native_action(row[0])).owner_ref == owner)

    def create_native_approval(self, context, approval: NativeApprovalView) -> NativeApprovalView:
        if not isinstance(approval, NativeApprovalView): raise TypeError("Native approval contract required")
        with self.transaction():
            self._native_authority(context, approval)
            action = self.get_native_action(approval.action_id)
            if action.state != "prepared" or approval.state != "pending" or not self._native_approval_matches(action, approval):
                raise PermissionError("Native approval is not bound to its prepared action")
            if approval.expires_at <= utc_now(): raise RevisionConflict("Native approval already expired")
            if self.get_native_approval(approval.approval_id) is not None: raise IdempotencyConflict("Native approval identity exists")
            self._conn.execute("INSERT INTO ia_approval_bindings VALUES(?,?,?,?,?,?,?,?)", (approval.approval_id, None,
                self._scope(approval.scope), approval.action_digest, approval.permission_revision, approval.state,
                approval.expires_at, canonical_json(approval)))
            self._emit(approval.scope, "approval", {"approval": approval.model_dump(mode="json", by_alias=True)})
            return approval

    def get_native_approval(self, approval_id: str) -> NativeApprovalView | None:
        row = self._one("SELECT data_json,state FROM ia_approval_bindings WHERE approval_id=? AND run_id IS NULL", (approval_id,))
        return NativeApprovalView.model_validate_json(row[0]).model_copy(update={"state": row[1]}) if row else None

    def list_native_approvals(self, context) -> tuple[NativeApprovalView, ...]:
        owner = self._native_owner(context)
        return tuple(approval for row in self._many("SELECT approval_id FROM ia_approval_bindings WHERE scope_key=? AND run_id IS NULL", (self._scope(context.scope),))
            if (approval := self.get_native_approval(row[0])).owner_ref == owner)

    @staticmethod
    def _native_approval_matches(action, approval):
        return (action.action_id == approval.action_id and action.scope == approval.scope
            and action.owner_ref == approval.owner_ref and action.intended_effect == approval.effect
            and action.canonical_args_digest == approval.action_digest
            and all(getattr(action, field) == getattr(approval, field) for field in ("permission_revision", "control_epoch",
                "navigation_epoch", "connection_revisions", "lease_id", "target_id", "main_generation", "runner_generation")))

    def decide_native_approval(self, context, approval_id: str, *, approved: bool, actor_ref: str,
            action_digest: str, expected_permission_revision: int, expected_control_epoch: int,
            client_request_id: str | None = None) -> NativeApprovalView:
        with self.transaction():
            old = self.get_native_approval(approval_id)
            if old is None: raise StoreError("Native approval is unavailable")
            self._native_authority(context, old)
            if not actor_ref.startswith("user:"): raise PermissionError("Only an authenticated human may approve")
            request = {"owner": old.owner_ref.model_dump(mode="json", by_alias=True), "approvalId": approval_id,
                "actionDigest": action_digest, "approved": approved, "actorRef": actor_ref,
                "expectedPermissionRevision": expected_permission_revision, "expectedControlEpoch": expected_control_epoch}
            if client_request_id is not None:
                from uuid import UUID
                UUID(client_request_id)
                cached = self.get_request_result(context.scope, "native_approval_decide", client_request_id, request)
                if cached is not None:
                    if old.permission_revision != expected_permission_revision or old.control_epoch != expected_control_epoch:
                        raise RevisionConflict("Native approval replay epoch changed")
                    return NativeApprovalView.model_validate(cached)
            action = self.get_native_action(old.action_id)
            if (action.state != "prepared" or old.state != "pending" or old.expires_at <= utc_now() or old.action_digest != action_digest
                or old.permission_revision != expected_permission_revision or old.control_epoch != expected_control_epoch
                or not self._native_approval_matches(action, old)):
                raise RevisionConflict("Native approval action or epoch changed")
            new = old.model_copy(update={"state": "approved" if approved else "revoked", "actor_ref": actor_ref})
            self._conn.execute("UPDATE ia_approval_bindings SET state=?,data_json=? WHERE approval_id=? AND run_id IS NULL", (new.state, canonical_json(new), approval_id))
            if client_request_id is not None:
                self._remember(context.scope, "native_approval_decide", client_request_id, request, new)
            self._emit(new.scope, "approval", {"approval": new.model_dump(mode="json", by_alias=True)})
            return new

    def consume_native_approval(self, context, approval_id: str, action: NativeActionRecord) -> NativeApprovalView:
        with self.transaction():
            old = self.get_native_approval(approval_id)
            if old is None: raise StoreError("Native approval is unavailable")
            self._native_authority(context, old)
            persisted = self.get_native_action(action.action_id)
            if (persisted is None or persisted != action or action.state != "prepared"
                or old.state != "approved" or old.expires_at <= utc_now() or not self._native_approval_matches(action, old)):
                raise RevisionConflict("Native approval cannot authorize this action")
            new = old.model_copy(update={"state": "consumed"})
            self._conn.execute("UPDATE ia_approval_bindings SET state='consumed',data_json=? WHERE approval_id=? AND state='approved' AND run_id IS NULL", (canonical_json(new), approval_id))
            return new

    def claim_native_action(self, context, action_id: str, *, expected_permission_revision: int,
            expected_control_epoch: int, approval_id: str | None = None) -> NativeActionRecord:
        with self.transaction():
            old = self.get_native_action(action_id)
            if old is None or old.state != "prepared": raise StateConflict("Native action already claimed")
            self._native_authority(context, old)
            if old.permission_revision != expected_permission_revision or old.control_epoch != expected_control_epoch:
                raise RevisionConflict("Native action epoch changed")
            if approval_id is not None: self.consume_native_approval(context, approval_id, old)
            elif old.approval_id is not None or old.intended_effect != "read":
                raise PermissionError("Native action requires exact human approval")
            new = old.model_copy(update={"state": "claimed", "approval_id": approval_id})
            self._conn.execute("UPDATE ia_action_journal SET state='claimed',data_json=? WHERE action_id=? AND state='prepared' AND run_id IS NULL", (canonical_json(new), action_id))
            self._emit(old.scope, "action", {"ownerKind": "native_chat", "sessionId": old.session_id,
                "streamId": old.stream_id, "actionId": action_id, "state": new.state})
            return new

    def finish_native_action(self, context, action_id: str, state: str, *, result_ref: str | None = None,
            error_code: str | None = None) -> NativeActionRecord:
        with self.transaction():
            old = self.get_native_action(action_id)
            owner = NativeChatOwner(session_id=context.session_id, stream_id=context.stream_id,
                writer_generation=context.writer_generation, writer_lease_id=context.writer_lease_id)
            if old is None or old.scope != context.scope or old.owner_ref != owner:
                raise PermissionError("Native action cleanup belongs to another owner")
            if state == old.state:
                if old.result_ref != result_ref or old.error_code != error_code:
                    raise IdempotencyConflict("Native terminal receipt changed")
                return old
            if state == "dispatched": self._native_authority(context, old)
            allowed = {"prepared": {"denied"}, "claimed": {"dispatched", "denied", "unknown"},
                "dispatched": {"succeeded", "failed", "unknown"}, "unknown": set(), "succeeded": set(), "failed": set(), "denied": set()}
            if state != old.state and state not in allowed[old.state]: raise StateConflict("Invalid native action transition")
            now = utc_now()
            new = old.model_copy(update={"state": state, "dispatched_at": now if state == "dispatched" else old.dispatched_at,
                "finished_at": now if state in {"succeeded", "failed", "unknown", "denied"} else None,
                "result_ref": result_ref, "error_code": error_code})
            self._conn.execute("UPDATE ia_action_journal SET state=?,data_json=?,finished_at=? WHERE action_id=? AND run_id IS NULL", (state, canonical_json(new), new.finished_at, action_id))
            self._emit(old.scope, "action", {"ownerKind": "native_chat", "sessionId": old.session_id,
                "streamId": old.stream_id, "actionId": action_id, "state": state})
            return new

    def finish_action(self, action_id: str, state: str, *, result_ref: str | None = None, error_code: str | None = None) -> ActionRecord:
        with self.transaction():
            old = self.get_action(action_id)
            if old is None:
                raise StoreError("Unknown action")
            allowed = {"prepared": {"denied"}, "claimed": {"dispatched", "denied", "unknown"}, "dispatched": {"succeeded", "failed", "unknown"}, "unknown": set(), "succeeded": set(), "failed": set(), "denied": set()}
            if state != old.state and state not in allowed[old.state]:
                raise StateConflict("Invalid action journal transition")
            now = utc_now()
            new = ActionRecord.model_validate_json(canonical_json(old.model_copy(update={"state": state, "dispatched_at": now if state == "dispatched" else old.dispatched_at, "finished_at": now if state in {"succeeded", "failed", "unknown", "denied"} else None, "result_ref": result_ref, "error_code": error_code})))
            self._conn.execute("UPDATE ia_action_journal SET state=?,data_json=?,finished_at=? WHERE action_id=?", (state, canonical_json(new), new.finished_at, action_id))
            self._emit(new.scope, "action", {"runId": new.run_id, "actionId": action_id, "state": state})
            return new

    def acquire_lease(self, scope: Scope, run_id: str, resource_key: str, owner_generation: str, expires_at: str, *, lease_id: str | None = None, identity: dict[str, Any] | None = None) -> dict[str, Any]:
        with self.transaction():
            run = self.get_run(run_id)
            if not run or run.scope != scope or run.state in TERMINAL_STATES:
                raise StateConflict("Only a live run may acquire a resource")
            existing = self._one("SELECT * FROM ia_resource_leases WHERE resource_key=? AND state='active'", (resource_key,))
            if existing:
                # Account resources with unknown effects are not automatically
                # free simply because a timestamp expired.
                if existing["run_id"] == run_id and existing["owner_generation"] == owner_generation:
                    value = self._lease_dict(existing)
                    if identity and any(value.get(key) != item for key, item in identity.items()):
                        raise StateConflict("Resource lease identity changed")
                    return value
                raise ResourceBusy("Resource belongs to another run")
            value = {"leaseId": lease_id or new_id(), "resourceKey": resource_key, "scope": scope.model_dump(mode="json", by_alias=True), "runId": run_id, "ownerGeneration": owner_generation, "revision": 1, "expiresAt": expires_at, "state": "active"}
            if identity:
                if set(identity) != {"targetId", "mainGeneration", "runnerGeneration", "navigationEpoch"} or not all(isinstance(identity.get(key), str) and identity[key] for key in ("targetId", "mainGeneration", "runnerGeneration")) or type(identity.get("navigationEpoch")) is not int or identity["navigationEpoch"] < 0:
                    raise ValueError("Browser lease identity is incomplete")
                value.update(identity)
            self._conn.execute("INSERT INTO ia_resource_leases VALUES(?,?,?,?,?,?,?,?,?)", (value["leaseId"], resource_key, self._scope(scope), run_id, owner_generation, 1, expires_at, "active", canonical_json(value)))
            return value

    def update_browser_lease_navigation(self, lease_id: str, run_id: str, scope: Scope,
            owner_generation: str, identity: dict[str, str], navigation_epoch: int) -> dict[str, Any]:
        if type(navigation_epoch) is not int or navigation_epoch < 0:
            raise ValueError("Invalid browser navigation epoch")
        with self.transaction():
            row = self._one("SELECT * FROM ia_resource_leases WHERE lease_id=?", (lease_id,))
            if row is None:
                raise RevisionConflict("Browser target lease is unavailable")
            value = self._lease_dict(row)
            expected_identity = {"leaseId": lease_id, "runId": run_id,
                "scope": scope.model_dump(mode="json", by_alias=True), "ownerGeneration": owner_generation,
                "resourceKey": "target:" + lease_id, "targetId": identity.get("target_id"),
                "mainGeneration": identity.get("main_generation"), "runnerGeneration": identity.get("runner_generation")}
            if value.get("state") != "active" or any(value.get(key) != expected for key, expected in expected_identity.items()):
                raise RevisionConflict("Browser target lease identity changed")
            previous_epoch = value.get("navigationEpoch")
            if type(previous_epoch) is not int or navigation_epoch < previous_epoch:
                raise RevisionConflict("Browser navigation epoch moved backwards")
            value["navigationEpoch"] = navigation_epoch
            value["revision"] = row["revision"] + 1
            self._conn.execute("UPDATE ia_resource_leases SET revision=?,data_json=? WHERE lease_id=?",
                (value["revision"], canonical_json(value), lease_id))
            return value

    def acquire_chat_writer(self, scope: Scope, session_id: str, owner_ref: str, owner_generation: str) -> dict[str, Any]:
        return self._acquire_session_writer(scope, session_id, owner_ref, owner_generation, "legacy_chat")

    def acquire_session_projection(self, scope: Scope, session_id: str, owner_ref: str, owner_generation: str) -> dict[str, Any]:
        return self._acquire_session_writer(scope, session_id, owner_ref, owner_generation, "independent_projection")

    def _acquire_session_writer(self, scope: Scope, session_id: str, owner_ref: str, owner_generation: str, owner_kind: str) -> dict[str, Any]:
        """Ordinary native turns share the same atomic writer reservation.

        Request ownership is explicit. No independent run or tool authority is
        invented merely to protect an existing chat transcript.
        """
        if not isinstance(session_id, str) or not session_id or len(session_id) > 128 or not isinstance(owner_ref, str) or not owner_ref:
            raise ValueError("Chat writer requires its actual session and request owner")
        resource_key = "session_writer:" + session_id
        with self.transaction():
            if self.get_binding(scope) is None:
                raise PermissionError("Chat writer requires a registered native scope")
            existing = self._one("SELECT * FROM ia_resource_leases WHERE resource_key=? AND state='active'", (resource_key,))
            if existing:
                data = self._lease_dict(existing)
                if existing["run_id"] is None and existing["scope_key"] == self._scope(scope) and existing["owner_generation"] == owner_generation and data.get("ownerRef") == owner_ref and data.get("ownerKind") == owner_kind:
                    return data
                raise ResourceBusy("This chat has another writer")
            value = {"leaseId": new_id(), "resourceKey": resource_key, "scope": scope.model_dump(mode="json", by_alias=True),
                     "runId": None, "ownerKind": owner_kind, "ownerRef": owner_ref,
                     "ownerGeneration": owner_generation, "revision": 1,
                     "expiresAt": "2099-01-01T00:00:00Z", "state": "active"}
            self._conn.execute("INSERT INTO ia_resource_leases VALUES(?,?,?,?,?,?,?,?,?)", (value["leaseId"], resource_key, self._scope(scope), None, owner_generation, 1, value["expiresAt"], "active", canonical_json(value)))
            return value

    def _lease_dict(self, row):
        import json
        value = json.loads(row["data_json"])
        value.update(state=row["state"], revision=row["revision"], expiresAt=row["expires_at"])
        return value

    def list_leases(self, *, run_id: str | None = None, active_only: bool = True) -> tuple[dict[str, Any], ...]:
        terms, params = [], []
        if run_id:
            terms.append("run_id=?")
            params.append(run_id)
        if active_only:
            terms.append("state='active'")
        return tuple(self._lease_dict(row) for row in self._many("SELECT * FROM ia_resource_leases" + (" WHERE " + " AND ".join(terms) if terms else ""), tuple(params)))

    def release_lease(self, lease_id: str, *, owner_generation: str, expected_revision: int | None = None) -> None:
        with self.transaction():
            row = self._one("SELECT * FROM ia_resource_leases WHERE lease_id=?", (lease_id,))
            if not row or row["owner_generation"] != owner_generation or expected_revision is not None and row["revision"] != expected_revision:
                raise RevisionConflict("Lease owner or revision changed")
            self._conn.execute("UPDATE ia_resource_leases SET state='released',revision=revision+1 WHERE lease_id=?", (lease_id,))

    def save_checkpoint(self, run_id: str, state: dict[str, Any], *, safe_boundary: bool = True, journal_watermark: str | None = None) -> dict[str, Any]:
        with self.transaction():
            run = self.get_run(run_id)
            if not run or run.state in TERMINAL_STATES:
                raise StateConflict("Cannot checkpoint a terminal run")
            if safe_boundary and any(action.state in {"claimed", "dispatched"} for action in self.list_actions(run_id)):
                raise StateConflict("An action is still in flight")
            seq = self._one("SELECT COALESCE(MAX(seq),0)+1 FROM ia_checkpoints WHERE run_id=?", (run_id,))[0]
            checkpoint_id, now = new_id(), utc_now()
            self._conn.execute("INSERT INTO ia_checkpoints VALUES(?,?,?,?,?,?,?)", (checkpoint_id, run_id, seq, int(safe_boundary), journal_watermark, canonical_json(state), now))
            self._write_run(run.model_copy(update={"checkpoint_id": checkpoint_id, "updated_at": now}))
            self._emit(run.scope, "checkpoint", {"runId": run_id, "checkpointId": checkpoint_id, "summary": str(state.get("summary", "Safe execution boundary"))[:1000]})
            return {"checkpointId": checkpoint_id, "runId": run_id, "seq": seq, "safeBoundary": safe_boundary, "state": state, "journalWatermark": journal_watermark, "createdAt": now}

    def latest_checkpoint(self, run_id: str) -> dict[str, Any] | None:
        import json
        row = self._one("SELECT * FROM ia_checkpoints WHERE run_id=? ORDER BY seq DESC LIMIT 1", (run_id,))
        return {"checkpointId": row["checkpoint_id"], "runId": run_id, "seq": row["seq"], "safeBoundary": bool(row["safe_boundary"]), "state": json.loads(row["state_json"]), "journalWatermark": row["journal_watermark"], "createdAt": row["created_at"]} if row else None

    def claim_schedule_occurrence(self, definition: AgentDefinition, planned_utc: str) -> bool:
        if definition.schedule is None:
            raise ValueError("Definition has no schedule")
        with self.transaction():
            cursor = self._conn.execute("INSERT OR IGNORE INTO ia_schedule_occurrences VALUES(?,?,?,?,?,NULL)", (definition.definition_id, definition.schedule.revision, planned_utc, self._scope(definition.scope), "claimed"))
            return cursor.rowcount == 1

    def finish_schedule_occurrence(self, definition: AgentDefinition, planned_utc: str, outcome: str, *, run_id: str | None = None):
        with self.transaction():
            changed = self._conn.execute("UPDATE ia_schedule_occurrences SET outcome=?,run_id=? WHERE definition_id=? AND schedule_revision=? AND planned_utc=?", (outcome, run_id, definition.definition_id, definition.schedule.revision, planned_utc)).rowcount
            if not changed:
                raise StoreError("Schedule occurrence was not claimed")

    def recover_after_restart(self, current_generation: str) -> tuple[RunView, ...]:
        """Never replay dispatched mutations or reattach an old browser target."""
        with self.transaction():
            changed = []
            for run in self.list_runs(include_terminal=False):
                context = self.get_run_context(run.run_id)
                if context.runner_generation == current_generation:
                    continue
                if run.state == "queued" and not self.list_actions(run.run_id):
                    # Queued never-started work can be re-admitted by Manager
                    # after fresh scope/governance checks; context isn't rebound.
                    continue
                for action in self.list_actions(run.run_id):
                    if action.state in {"claimed", "dispatched"}:
                        self.finish_action(action.action_id, "unknown", error_code="process_interrupted")
                changed.append(self.transition_run(run.run_id, "interrupted", expected_revision=run.state_revision, reason_code="process_restarted", force_recovery=True))
            # Download/model/file jobs have their own persisted OS PID/creation-time
            # recovery. A Manager generation change cannot prove their exit.
            # Keep only these exact NULL-run owner families; a prefix alone
            # must not exempt an ordinary session/run lease from recovery.
            self._conn.execute("""UPDATE ia_resource_leases
                SET state='stale',revision=revision+1
                WHERE owner_generation<>? AND state='active'
                  AND resource_key NOT LIKE 'account:%'
                  AND NOT (run_id IS NULL AND (
                    (resource_key LIKE 'local_ai_download:%'
                     AND COALESCE(json_extract(data_json,'$.ownerKind'),'')='local_ai_download')
                    OR (resource_key LIKE 'local_ai_model:%'
                     AND COALESCE(json_extract(data_json,'$.ownerKind'),'')='local_ai_model')
                    OR (resource_key LIKE 'native_file:%'
                     AND COALESCE(json_extract(data_json,'$.ownerKind'),'')='native_file')
                    OR (resource_key LIKE 'target:%'
                     AND COALESCE(json_extract(data_json,'$.ownerKind'),'')='native_chat')))
                """, (current_generation,))
            self._conn.execute("UPDATE ia_approval_bindings SET state='revoked' WHERE state IN ('pending','approved')")
            return tuple(changed)


# Narrow compatibility spelling for callers; there is only one implementation.
RunStore = IndependentStore
