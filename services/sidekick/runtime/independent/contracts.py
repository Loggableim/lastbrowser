"""Versioned, strict contracts shared by the independent-run broker and UI.

Preferences cannot carry permissions. RunContext is minted by the broker; HTTP
clients must never be allowed to supply it as an authorization object.
"""
from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, AfterValidator, field_validator, model_validator


def _camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


def _identity(value: str) -> str:
    try:
        return uuid.UUID(value).hex
    except (ValueError, AttributeError) as exc:
        raise ValueError("identity must be a UUID") from exc


def _reference(value: str) -> str:
    if not value or len(value) > 512 or value != value.strip() or any(ord(c) < 32 for c in value):
        raise ValueError("invalid reference")
    return value


def _utc(value: str) -> str:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("invalid UTC timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset().total_seconds() != 0:
        raise ValueError("timestamp must be UTC")
    return parsed.isoformat().replace("+00:00", "Z")


Id = Annotated[str, AfterValidator(_identity)]
Ref = Annotated[str, AfterValidator(_reference)]
Utc = Annotated[str, AfterValidator(_utc)]
Revision = Annotated[int, Field(ge=1)]
Effect = Literal["read", "write", "send", "delete", "purchase"]
InterviewTopic = Literal["purpose", "help", "style", "context", "connections", "background_work"]
RunState = Literal["queued", "running", "waiting_for_user", "waiting_for_approval", "pausing", "paused", "cancelling", "cancelled", "completed", "failed", "interrupted"]
TERMINAL_STATES = frozenset({"cancelled", "completed", "failed", "interrupted"})
NONTERMINAL_STATES = frozenset({"queued", "running", "waiting_for_user", "waiting_for_approval", "pausing", "paused", "cancelling"})
RUN_TRANSITIONS: dict[str, frozenset[str]] = {
    "queued": frozenset({"running", "cancelling", "cancelled", "failed", "interrupted", "waiting_for_user"}),
    "running": frozenset({"waiting_for_user", "waiting_for_approval", "pausing", "cancelling", "completed", "failed", "interrupted"}),
    "waiting_for_user": frozenset({"queued", "pausing", "paused", "cancelling", "cancelled", "failed", "interrupted"}),
    "waiting_for_approval": frozenset({"queued", "pausing", "paused", "cancelling", "cancelled", "failed", "interrupted"}),
    "pausing": frozenset({"paused", "cancelling", "failed", "interrupted"}),
    "paused": frozenset({"queued", "cancelling", "cancelled", "failed", "interrupted"}),
    "cancelling": frozenset({"cancelled", "interrupted"}),
    **{state: frozenset() for state in TERMINAL_STATES},
}


def new_id() -> str:
    return uuid.uuid4().hex


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def canonical_json(value: Any) -> str:
    if isinstance(value, BaseModel):
        value = value.model_dump(mode="json", by_alias=True)
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


class Contract(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", frozen=True, populate_by_name=True, alias_generator=_camel)

    @model_validator(mode="before")
    @classmethod
    def _json_arrays(cls, value: Any) -> Any:
        # JSON has arrays, not tuples. Convert only typed tuple fields; all
        # elements still undergo strict validation, and internal state stays
        # immutable instead of sharing writable lists with callers.
        if isinstance(value, dict):
            value = dict(value)
            for name, field in cls.model_fields.items():
                if getattr(field.annotation, "__origin__", None) is tuple:
                    key = name if name in value else field.alias
                    if key in value and isinstance(value[key], list):
                        value[key] = tuple(value[key])
        return value


class Versioned(Contract):
    schema_version: Literal[1] = 1


class Scope(Contract):
    backend_profile_id: Id
    space_id: Id
    browser_profile_id: Annotated[str, Field(min_length=1, max_length=128, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_.-]*$")]

    @property
    def key(self) -> str:
        return f"{self.backend_profile_id}:{self.space_id}:{self.browser_profile_id}"


class BackendProfileRef(Versioned):
    backend_profile_id: Id
    name: Ref
    canonical_home: Ref
    revision: Revision = 1
    status: Literal["active", "tombstoned"] = "active"


class SpaceBinding(Versioned):
    scope: Scope
    native_slug: Annotated[str, Field(pattern=r"^[a-z0-9][a-z0-9_-]*$")]
    partition_key: Annotated[str, Field(min_length=9, max_length=1024)]
    revision: Revision = 1
    workspace_locator: str | None = None
    tombstoned_at: Utc | None = None

    @field_validator("partition_key")
    @classmethod
    def _persistent_partition(cls, value: str) -> str:
        if not value.startswith("persist:") or any(ord(c) < 32 for c in value):
            raise ValueError("independent work requires an existing persistent partition")
        return value


class SpaceSummaryV1(Versioned):
    scope: Scope
    name: str
    binding_revision: Revision
    emoji: str | None = None
    workspace_path: str | None = None
    assistant_setup: Literal["legacy", "in_progress", "confirmed", "skipped"] = "legacy"


class ConnectionBinding(Contract):
    connection_id: Ref
    kind: Literal["provider", "connector", "browser_account"]
    capability_id: Ref
    revision: Revision = 1
    binding_id: Id | None = None
    connection_revision: Revision | None = None


class PermissionScope(Contract):
    browser_origins: tuple[str, ...] = ()
    connector_bindings: tuple[str, ...] = ()
    network_origins: tuple[str, ...] = ()
    allowed_workspace_roots: tuple[str, ...] = ()
    allowed_effects: tuple[Effect, ...] = ("read",)
    raw_cdp: Literal[False] = False
    terminal: Literal[False] = False
    desktop: Literal[False] = False

    @field_validator("browser_origins", "network_origins")
    @classmethod
    def _origins(cls, values: tuple[str, ...]) -> tuple[str, ...]:
        from urllib.parse import urlsplit
        for value in values:
            parsed = urlsplit(value)
            if value == "*":
                raise ValueError("wildcard network authority is not an origin")
            if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
                raise ValueError("expected an explicit HTTP(S) origin")
        return values


class ProviderSelection(Contract):
    provider_config_ref: Ref
    config_revision: Revision = 1
    model: Annotated[str, Field(min_length=1, max_length=512)]
    provider: str = ""
    context_length: Annotated[int, Field(ge=1, le=16000000)] | None = None


class Budget(Contract):
    max_tool_calls: Annotated[int, Field(ge=1, le=10000)] = 50
    max_provider_requests: Annotated[int, Field(ge=1, le=10000)] = 20
    max_active_seconds: Annotated[int, Field(ge=1, le=86400)] = 900
    max_measured_tokens: Annotated[int, Field(ge=1, le=10000000)] = 100000
    max_safe_read_retries: Annotated[int, Field(ge=0, le=2)] = 2
    provider_timeout_seconds: Annotated[int, Field(ge=1, le=120)] = 120
    tool_timeout_seconds: Annotated[int, Field(ge=1, le=45)] = 30


class ProfilePatch(Contract):
    purpose: Annotated[str, Field(max_length=4000)] | None = None
    requested_help: tuple[str, ...] | None = None
    working_style: Annotated[str, Field(max_length=4000)] | None = None
    background_preferences: Annotated[str, Field(max_length=4000)] | None = None

    @field_validator("requested_help", mode="before")
    @classmethod
    def _help_array(cls, value: Any) -> Any:
        return tuple(value) if isinstance(value, list) else value


class SpaceAssistantProfile(Versioned):
    profile_id: Id
    scope: Scope
    revision: Revision
    status: Literal["confirmed", "skipped"]
    values: ProfilePatch
    recorded_at: Utc
    confirmed_at: Utc | None = None
    source_answer_ids: tuple[Id, ...] = ()

    @model_validator(mode="after")
    def _confirmation(self) -> SpaceAssistantProfile:
        if self.status == "confirmed" and self.confirmed_at is None:
            raise ValueError("confirmed profile requires confirmation time")
        return self


class InterviewOption(Contract):
    id: Ref
    label: Annotated[str, Field(min_length=1, max_length=1000)]
    description: Annotated[str, Field(max_length=2000)] | None = None


class UnderstoodTopic(Contract):
    topic: InterviewTopic
    summary: str
    answer_ids: tuple[Id, ...] = ()


class InterviewQuestion(Versioned):
    kind: Literal["question"] = "question"
    based_on_revision: Revision
    topic: InterviewTopic
    prompt: Annotated[str, Field(min_length=1, max_length=8000)]
    options: Annotated[tuple[InterviewOption, ...], Field(min_length=3, max_length=4)]
    allow_free_text: Literal[True] = True
    selection: Literal["single", "multiple"] = "single"
    explanation: str | None = None
    understood: tuple[UnderstoodTopic, ...] = ()
    profile_patch: ProfilePatch = Field(default_factory=ProfilePatch)

    @model_validator(mode="after")
    def _unique_options(self) -> InterviewQuestion:
        if len({option.id for option in self.options}) != len(self.options):
            raise ValueError("option IDs must be unique")
        return self


class InterviewReview(Versioned):
    kind: Literal["review"] = "review"
    based_on_revision: Revision
    summary: Annotated[str, Field(min_length=1, max_length=16000)]
    missing_topics: tuple[InterviewTopic, ...] = ()
    completion_reason: Literal["user_finished", "sufficient_context"]
    understood: tuple[UnderstoodTopic, ...] = ()
    profile_patch: ProfilePatch = Field(default_factory=ProfilePatch)


InterviewModelReply = Annotated[Union[InterviewQuestion, InterviewReview], Field(discriminator="kind")]


class InterviewAnswer(Contract):
    question_id: Id
    selected_option_ids: tuple[str, ...] = ()
    free_text: Annotated[str, Field(max_length=16000)] | None = None
    replaces_answer_id: Id | None = None
    expected_revision: Revision
    client_request_id: Id

    @model_validator(mode="after")
    def _not_empty(self) -> InterviewAnswer:
        if not self.selected_option_ids and not (self.free_text or "").strip():
            raise ValueError("choose an option or write an answer")
        if len(self.selected_option_ids) != len(set(self.selected_option_ids)):
            raise ValueError("duplicate selected option")
        return self


class StoredInterviewAnswer(Versioned):
    answer_id: Id
    scope: Scope
    revision: Revision
    answer: InterviewAnswer
    topic: InterviewTopic
    question: str
    created_at: Utc


class AssistantState(Versioned):
    scope: Scope
    conversation_id: Ref
    revision: Revision = 1
    interview_revision: Revision = 1
    setup_status: Literal["legacy", "in_progress", "confirmed", "skipped"] = "legacy"
    confirmed_profile_id: Id | None = None
    current_question_id: Id | None = None
    current_reply: InterviewQuestion | InterviewReview | None = None
    draft: ProfilePatch = Field(default_factory=ProfilePatch)
    messages: tuple[dict[str, Any], ...] = ()
    answers: tuple[StoredInterviewAnswer, ...] = ()
    interview: dict[str, Any] | None = None
    updated_at: Utc = Field(default_factory=utc_now)


class ScheduleSpec(Contract):
    cron_expression: Annotated[str, Field(min_length=1, max_length=200)]
    timezone: Ref
    gap_policy: Literal["skip"] = "skip"
    fold_policy: Literal["first"] = "first"
    missed_policy: Literal["skip", "one_catch_up"] = "skip"
    revision: Revision = 1

    @field_validator("timezone")
    @classmethod
    def _timezone(cls, value: str) -> str:
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("unknown IANA timezone") from exc
        return value


class AgentDefinition(Versioned):
    definition_id: Id
    scope: Scope
    revision: Revision = 1
    title: Annotated[str, Field(min_length=1, max_length=500)]
    instruction: Annotated[str, Field(min_length=1, max_length=64000)]
    desired_result: str | None = None
    provider: ProviderSelection
    permission_scope: PermissionScope = Field(default_factory=PermissionScope)
    budget: Budget = Field(default_factory=Budget)
    profile_snapshot_ref: Id | None = None
    connection_bindings: tuple[ConnectionBinding, ...] = ()
    activation_conversation_id: Ref | None = None
    activation_message_id: Ref | None = None
    capability_refs: tuple[str, ...] = ()
    enabled: bool = True
    schedule: ScheduleSpec | None = None
    created_at: Utc = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def _activation_pair(self) -> AgentDefinition:
        if bool(self.activation_conversation_id) != bool(self.activation_message_id):
            raise ValueError("definition activation must identify its Assistant and user message")
        if self.schedule is not None and self.enabled and not self.activation_message_id:
            raise ValueError("enabled schedules require an explicit user activation")
        return self


class RunContext(Versioned):
    run_id: Id
    dispatch_id: Id
    scope: Scope
    resolved_profile_home: Ref
    resolved_space_root: Ref
    backend_profile_name: Ref = "default"
    partition_key: Ref
    binding_revision: Revision
    allowed_workspace_roots: tuple[str, ...] = ()
    assistant_profile_revision: Revision | None = None
    assistant_profile_snapshot_ref: Id | None = None
    assistant_profile_snapshot: SpaceAssistantProfile | None = None
    agent_definition_revision: Revision = 1
    provider: ProviderSelection
    connection_bindings: tuple[ConnectionBinding, ...] = ()
    effective_permissions: PermissionScope
    permission_revision: Revision = 1
    runner_generation: Id
    cancellation_token: Id
    control_epoch: Annotated[int, Field(ge=0)] = 0
    resource_lease_refs: tuple[str, ...] = ()
    budget: Budget = Field(default_factory=Budget)
    inference_plan_ref: str | None = None
    inference_plan_revision: Revision | None = None

    @model_validator(mode="after")
    def _snapshot_scope(self) -> RunContext:
        snapshot = self.assistant_profile_snapshot
        if snapshot is not None and (snapshot.scope != self.scope or snapshot.profile_id != self.assistant_profile_snapshot_ref or snapshot.revision != self.assistant_profile_revision):
            raise ValueError("profile snapshot must match RunContext scope and reference")
        return self


class RunCounters(Contract):
    tool_calls: Annotated[int, Field(ge=0)] = 0
    provider_requests: Annotated[int, Field(ge=0)] = 0
    active_seconds: Annotated[float, Field(ge=0)] = 0.0
    measured_tokens: Annotated[int, Field(ge=0)] | None = None


class WaitingFor(Contract):
    kind: Literal["login", "approval", "resource", "clarification"]
    resource_id: str | None = None
    expires_at: Utc | None = None


class RunView(Versioned):
    run_id: Id
    dispatch_id: Id
    scope: Scope
    definition_id: Id
    definition_revision: Revision
    state: RunState = "queued"
    state_revision: Revision = 1
    reason_code: str | None = None
    created_at: Utc
    updated_at: Utc
    assistant_profile_revision: Revision | None = None
    target_session_id: Ref | None = None
    checkpoint_id: Id | None = None
    result_ref: str | None = None
    counters: RunCounters = Field(default_factory=RunCounters)
    waiting_for: WaitingFor | None = None
    control_epoch: Annotated[int, Field(ge=0)] = 0


class TaskDispatchRequest(Versioned):
    client_request_id: Id
    scope: Scope
    assistant_conversation_id: Ref
    source_message_id: Ref
    kind: Literal["prepare_chat", "start_chat", "start_agent"]
    title: Annotated[str, Field(min_length=1, max_length=500)]
    instruction: Annotated[str, Field(min_length=1, max_length=64000)]
    desired_result: str | None = None
    definition_id: Id | None = None
    definition_revision: Revision | None = None
    selected_context_refs: tuple[str, ...] = ()
    expected_permission_revision: Revision = 1


class TaskDispatchView(Versioned):
    dispatch_id: Id
    scope: Scope
    state: Literal["prepared", "materializing", "started", "failed"] = "prepared"
    assistant_conversation_id: Ref
    source_message_id: Ref
    target_session_id: Ref | None = None
    run_id: Id | None = None
    reason_code: str | None = None
    created_at: Utc = Field(default_factory=utc_now)
    updated_at: Utc = Field(default_factory=utc_now)


class BrowserLease(Versioned):
    lease_id: Id
    run_id: Id
    scope: Scope
    partition_key: Ref
    web_contents_id: Annotated[int, Field(ge=1)]
    target_id: Ref
    navigation_epoch: Annotated[int, Field(ge=0)] = 0
    main_generation: Id
    runner_generation: Id
    control_epoch: Annotated[int, Field(ge=0)] = 0
    expires_at: Utc
    state: Literal["active", "user_takeover", "revoked", "closed"] = "active"


class ActionRecord(Versioned):
    action_id: Id
    run_id: Id
    owner_kind: Literal["independent_run"] = "independent_run"
    owner_ref: Ref | None = None
    step_id: Ref
    attempt: Annotated[int, Field(ge=1, le=3)] = 1
    scope: Scope
    tool_id: Ref
    canonical_args_digest: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
    intended_effect: Effect
    resource_refs: tuple[str, ...] = ()
    # A browser mutation is authorized against one concrete Main-owned target
    # lease and both controller generations, not just its navigation epoch.
    lease_id: Ref | None = None
    target_id: Ref | None = None
    main_generation: Ref | None = None
    runner_generation: Ref | None = None
    authorization_ref: Ref
    approval_id: Id | None = None
    permission_revision: Revision
    connection_revisions: dict[str, int] = Field(default_factory=dict)
    navigation_epoch: Annotated[int, Field(ge=0)] | None = None
    control_epoch: Annotated[int, Field(ge=0)] = 0
    state: Literal["prepared", "claimed", "dispatched", "succeeded", "failed", "unknown", "denied"] = "prepared"
    created_at: Utc = Field(default_factory=utc_now)
    dispatched_at: Utc | None = None
    finished_at: Utc | None = None
    result_ref: str | None = None
    error_code: str | None = None


class ApprovalView(Versioned):
    approval_id: Id
    run_id: Id
    owner_kind: Literal["independent_run"] = "independent_run"
    owner_ref: Ref | None = None
    scope: Scope
    action_id: Id | None = None
    action_digest: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
    effect: Effect
    target_summary: str
    permission_revision: Revision
    navigation_epoch: Annotated[int, Field(ge=0)] | None = None
    control_epoch: Annotated[int, Field(ge=0)] = 0
    lease_id: Ref | None = None
    target_id: Ref | None = None
    main_generation: Ref | None = None
    runner_generation: Ref | None = None
    connection_revision: Revision | None = None
    expires_at: Utc
    state: Literal["pending", "approved", "consumed", "revoked", "expired"] = "pending"
    actor_ref: str | None = None


class NativeChatOwner(Contract):
    session_id: Ref
    stream_id: Ref
    writer_generation: Ref
    writer_lease_id: Ref


class NativeActionRecord(ActionRecord):
    run_id: None = None
    owner_kind: Literal["native_chat"] = "native_chat"
    owner_ref: NativeChatOwner
    session_id: Ref
    stream_id: Ref
    writer_generation: Ref
    writer_lease_id: Ref
    connection_bindings: tuple[ConnectionBinding, ...] = ()
    lease_id: Ref | None = None
    target_id: Ref | None = None
    main_generation: Ref | None = None
    runner_generation: Ref | None = None

    @model_validator(mode="after")
    def native_owner(self):
        if self.owner_ref != NativeChatOwner(session_id=self.session_id, stream_id=self.stream_id,
                writer_generation=self.writer_generation, writer_lease_id=self.writer_lease_id):
            raise ValueError("Native action owner fields disagree")
        return self


class NativeApprovalView(ApprovalView):
    run_id: None = None
    owner_kind: Literal["native_chat"] = "native_chat"
    owner_ref: NativeChatOwner
    session_id: Ref
    stream_id: Ref
    writer_generation: Ref
    writer_lease_id: Ref
    action_id: Id
    control_epoch: Annotated[int, Field(ge=0)]
    connection_revisions: dict[str, int] = Field(default_factory=dict)
    lease_id: Ref | None = None
    target_id: Ref | None = None
    main_generation: Ref | None = None
    runner_generation: Ref | None = None

    @model_validator(mode="after")
    def native_owner(self):
        if self.owner_ref != NativeChatOwner(session_id=self.session_id, stream_id=self.stream_id,
                writer_generation=self.writer_generation, writer_lease_id=self.writer_lease_id):
            raise ValueError("Native approval owner fields disagree")
        return self


class RunProgress(Versioned):
    run_id: Id
    scope: Scope
    target_session_id: str | None = None
    progress_revision: Revision
    observed_at: Utc
    run_state: RunState
    counters: RunCounters
    budget: Budget
    text: Annotated[str, Field(max_length=64000)] = ""
    text_truncated: bool = False
    source: Literal["sdk_output_text"] = "sdk_output_text"


class RunEvent(Versioned):
    event_id: Id
    scope: Scope
    seq: Annotated[int, Field(ge=1)]
    at: Utc
    kind: Literal["run_state", "run_progress", "checkpoint", "approval", "dispatch", "result", "connection_changed", "connection_setup_changed", "schedule", "activity_changed", "assistant", "assistant_control", "interview", "control", "action"]
    payload: dict[str, Any]

    @field_validator("payload")
    @classmethod
    def _bounded_payload(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(canonical_json(value).encode("utf-8")) > 32768:
            raise ValueError("event payload exceeds 32 KiB; store a result reference instead")
        return value


class NativeChatObservation(Contract):
    source_state: Literal["live", "partial", "unavailable"]
    observed_at: Utc


class ActivitySnapshot(Versioned):
    scope: Scope
    observed_at: Utc
    watermark: Annotated[int, Field(ge=0)]
    source_state: Literal["live", "stale", "unavailable"] = "live"
    last_successful_at: Utc | None = None
    runs: tuple[RunView, ...] = ()
    run_progress: tuple[RunProgress, ...] = ()
    dispatches: tuple[TaskDispatchView, ...] = ()
    active_chats: tuple[dict[str, Any], ...] = ()
    native_chat_observation: NativeChatObservation | None = None
    schedules: tuple[dict[str, Any], ...] = ()
    approvals: tuple[ApprovalView, ...] = ()
    native_approvals: tuple[NativeApprovalView, ...] = ()


class CapabilityCatalogEntry(Versioned):
    capability_id: Ref
    scope: Scope
    supported_tasks: tuple[str, ...]
    connection_kind: Literal["provider", "connector", "browser_account", "none"]
    connection_id: str | None = None
    status: Literal["not_configured", "connected", "reauth_required", "unavailable", "restricted"]
    required_permissions: tuple[str, ...] = ()
    verified_at: Utc | None = None
    evidence_kind: Literal["configuration", "credential_probe", "model_inference", "read_action"] = "configuration"


class ApiError(Versioned):
    code: Ref
    message: str
    retryable: bool = False
    current_revision: Revision | None = None
    request_id: str | None = None


class GlobalActivityPayload(Contract):
    all_browser_profiles: bool = False

