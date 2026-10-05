"""Scoped, previewed Assistant history controls in the existing store.

The native API must hold SpaceAssistant's scope/generation guard around apply
and invalidate in-flight conversation/interview replies. This module performs
only short store transactions; it never cancels runs, logs out connections or
changes immutable profile snapshots. It does not promise forensic disk erasure.
"""
from __future__ import annotations

from typing import Annotated, Callable, Literal

from pydantic import Field, model_validator

from .connections import ConnectionRepository
from .contracts import Contract, Id, ProfilePatch, Scope, Versioned, canonical_json, digest_json
from .policy import PolicyDenied
from .store import RevisionConflict

ResetAction = Literal["clear_interview_history", "reset_assistant"]


class AssistantResetRequest(Contract):
    mode: Literal["preview", "apply"]
    action: ResetAction
    expected_revision: Annotated[int, Field(strict=True, ge=1)]
    client_request_id: Id | None = None
    preview_digest: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")] | None = None

    @model_validator(mode="after")
    def _mode_fields(self):
        if self.mode == "apply" and (self.client_request_id is None or self.preview_digest is None):
            raise ValueError("Apply requires the reviewed preview and an idempotency ID")
        if self.mode == "preview" and (self.client_request_id is not None or self.preview_digest is not None):
            raise ValueError("Preview accepts no mutation identifiers")
        return self


class PreservedDefinition(Contract):
    definition_id: Id
    title: str
    revision: int
    enabled: bool
    scheduled: bool


class PreservedRun(Contract):
    run_id: Id
    definition_id: Id
    state: str
    state_revision: int
    control_epoch: int


class PreservedConnection(Contract):
    binding_id: Id
    connection_id: str
    capability_id: str
    revision: int
    status: str


class PreservedSchedule(Contract):
    job_id: str
    definition_id: Id
    enabled: bool
    next_run_at: str | None


class AssistantResetPreview(Versioned):
    scope: Scope
    action: ResetAction
    expected_revision: int
    conversation_id: str
    removed_interview_messages: int
    removed_conversation_messages: int
    removed_answer_records: int
    cleared_cached_states: int
    removed_profile_fields: tuple[str, ...]
    removed_draft_fields: tuple[str, ...]
    preserved_profile_fields: tuple[str, ...]
    confirmed_profile_id: Id | None
    preserved_snapshot_count: int
    preserved_snapshot_evidence_count: int
    preserved_definitions: tuple[PreservedDefinition, ...]
    preserved_runs: tuple[PreservedRun, ...]
    preserved_connections: tuple[PreservedConnection, ...]
    preserved_schedules: tuple[PreservedSchedule, ...]
    permission_revision: int
    permission_control_epoch: int
    browser_binding_revision: int
    preview_digest: str


class AssistantResetResult(Versioned):
    scope: Scope
    action: ResetAction
    revision: int
    interview_revision: int
    conversation_id: str
    confirmed_profile_id: Id | None
    preview_digest: str


def _interview_message(message: dict) -> bool:
    return any(message.get(field) is not None for field in ("answerId", "questionId", "reviewRevision"))


def _fields(patch: ProfilePatch) -> tuple[str, ...]:
    return tuple(key for key, value in patch.model_dump(mode="json", by_alias=True).items()
                 if value is not None and value != [] and value != "")


def _preview(store, scope: Scope, action: ResetAction, revision: int) -> AssistantResetPreview:
    state = store.get_assistant(scope)
    if state is None or state.revision != revision:
        raise RevisionConflict("Assistant revision changed")
    profile = store.get_confirmed_profile(scope)
    confirmed_fields = _fields(profile.values) if profile else ()
    draft_fields = _fields(state.draft)
    interview_messages = sum(_interview_message(message) for message in state.messages)
    # Raw answers have two historical storage shapes, both belonging to scope.
    raw_rows = store._many("SELECT answer_id FROM ia_interview_answers WHERE scope_key=?", (scope.key,))
    answer_ids = {row[0] for row in raw_rows} | {answer.answer_id for answer in state.answers}
    answer_ids.update(item["answerId"] for item in (state.interview or {}).get("answers", []) if "answerId" in item)
    snapshots = store._many("SELECT data_json FROM ia_profile_snapshots WHERE scope_key=?", (scope.key,))
    import json
    snapshot_evidence = sum(bool(json.loads(row[0]).get("sourceAnswerIds")) for row in snapshots)
    cached_count = store._one("SELECT COUNT(*) FROM ia_request_results WHERE scope_key=? AND operation='assistant_update'", (scope.key,))[0]
    definitions = tuple(PreservedDefinition(definition_id=item.definition_id, title=item.title,
                        revision=item.revision, enabled=item.enabled, scheduled=item.schedule is not None)
                        for item in store.list_definitions(scope))
    runs = tuple(PreservedRun(run_id=item.run_id, definition_id=item.definition_id, state=item.state,
                 state_revision=item.state_revision, control_epoch=item.control_epoch)
                 for item in store.list_runs(scope, include_terminal=False))
    connections = tuple(PreservedConnection(binding_id=item.binding_id, connection_id=item.connection_id,
                        capability_id=item.capability_id, revision=item.revision, status=item.status)
                        for item in ConnectionRepository(store).list(scope))
    from runtime.cron.jobs import read_scoped_jobs
    schedules = tuple(PreservedSchedule(job_id=str(item.get("id", "")),
                      definition_id=item["independent_ref"]["definitionId"],
                      enabled=bool(item.get("enabled")), next_run_at=item.get("next_run_at"))
                      for item in read_scoped_jobs(store.profile_home)
                      if item.get("job_type") == "independent_agent" and
                      (item.get("independent_ref") or {}).get("scope") == scope.model_dump(mode="json", by_alias=True))
    permissions = store.get_permission_state(scope)
    binding = store.get_binding(scope)
    data = dict(scope=scope, action=action, expected_revision=revision, conversation_id=state.conversation_id,
                removed_interview_messages=interview_messages,
                removed_conversation_messages=len(state.messages) - interview_messages if action == "reset_assistant" else 0,
                removed_answer_records=len(answer_ids), cleared_cached_states=cached_count,
                removed_profile_fields=confirmed_fields if action == "reset_assistant" else (),
                removed_draft_fields=draft_fields,
                preserved_profile_fields=confirmed_fields if action == "clear_interview_history" else (),
                confirmed_profile_id=state.confirmed_profile_id,
                preserved_snapshot_count=len(snapshots), preserved_snapshot_evidence_count=snapshot_evidence,
                preserved_definitions=definitions, preserved_runs=runs, preserved_connections=connections,
                preserved_schedules=schedules, permission_revision=permissions["revision"],
                permission_control_epoch=permissions["controlEpoch"], browser_binding_revision=binding.revision)
    typed = AssistantResetPreview(**data, preview_digest="")
    return typed.model_copy(update={"preview_digest": digest_json(
        typed.model_dump(mode="json", by_alias=True, exclude={"preview_digest"}))})


def handle_assistant_reset(store, resolver, scope: Scope, payload: dict, *,
                           actor_ref: str, authenticated_profile_name: str,
                           before_apply: Callable[[ResetAction], None] | None = None) -> AssistantResetPreview | AssistantResetResult:
    if actor_ref != "user:desktop":
        raise PolicyDenied("assistant_reset_human_actor_required")
    request = AssistantResetRequest.model_validate(payload)
    resolver.resolve(scope, authenticated_profile_name=authenticated_profile_name)
    body = request.model_dump(mode="json", by_alias=True)
    with store.transaction():
        if request.mode == "apply":
            cached = store.get_request_result(scope, "assistant_reset", request.client_request_id, body)
            if cached is not None:
                return AssistantResetResult.model_validate(cached)
        preview = _preview(store, scope, request.action, request.expected_revision)
        if request.mode == "preview":
            return preview
        if request.preview_digest != preview.preview_digest:
            raise RevisionConflict("Reset preview changed; review the current impact first")
        # Owner holds SpaceAssistant._lock. This callback only invalidates
        # in-memory generations/cancel events: no join, network or process I/O.
        if before_apply is not None:
            before_apply(request.action)
        def reset(state):
            messages = () if request.action == "reset_assistant" else tuple(
                message for message in state.messages if not _interview_message(message))
            return state.model_copy(update={
                "messages": messages, "interview": None, "answers": (), "draft": ProfilePatch(),
                "current_reply": None, "current_question_id": None,
                "interview_revision": state.interview_revision + 1,
                "confirmed_profile_id": None if request.action == "reset_assistant" else state.confirmed_profile_id,
                "setup_status": "legacy" if request.action == "reset_assistant" or not state.confirmed_profile_id else state.setup_status,
            })
        updated = store.update_assistant(scope, request.expected_revision, reset, event_kind="assistant_control")
        store._conn.execute("DELETE FROM ia_interview_answers WHERE scope_key=?", (scope.key,))
        # Historical retry results also contain whole AssistantState copies.
        # Keep their request digests (old IDs cannot replay) but replace their
        # personal state payload with the newly sanitized authoritative state.
        store._conn.execute("UPDATE ia_request_results SET result_json=? WHERE scope_key=? AND operation='assistant_update'",
                            (canonical_json(updated), scope.key))
        result = AssistantResetResult(scope=scope, action=request.action, revision=updated.revision,
                  interview_revision=updated.interview_revision, conversation_id=updated.conversation_id,
                  confirmed_profile_id=updated.confirmed_profile_id, preview_digest=preview.preview_digest)
        store.record_request_result(scope, "assistant_reset", request.client_request_id, body, result)
        return result
