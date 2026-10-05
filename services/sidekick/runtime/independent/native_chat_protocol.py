"""Private ordinary-chat transport; never an independent RunContext or engine."""
from __future__ import annotations

from pathlib import Path
import stat
from typing import Any, Literal
from pydantic import Field, model_validator

from .contracts import Versioned, Scope, Ref, canonical_json
from .scope import ScopeError, canonical_path, same_path
from .native_provider_capture import NativeProviderCapture


class NativeChatContext(Versioned):
    scope: Scope
    profile_name: Ref
    profile_home: Ref
    space_root: Ref
    sessions_dir: Ref
    workspace: Ref
    partition_key: Ref
    session_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    stream_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    writer_lease_id: Ref
    writer_generation: Ref
    store_path: Ref
    binding_revision: int = Field(ge=1)
    selection_mode: Literal["fixed", "auto"] = "fixed"
    selection_policy_revision: int = Field(ge=0, default=0)
    provider_capture: NativeProviderCapture | None = None
    teamwork: bool = False

    @model_validator(mode="after")
    def paths(self):
        if self.provider_capture is not None and (self.selection_mode != "fixed"
                or self.provider_capture.scope != self.scope
                or self.provider_capture.session_id != self.session_id
                or self.provider_capture.policy_revision != self.selection_policy_revision):
            raise ValueError("Native provider capture belongs to another fixed chat")
        home = canonical_path(self.profile_home)
        for raw in (self.profile_home, self.space_root, self.sessions_dir, self.store_path, self.workspace):
            path = Path(raw)
            if not path.is_absolute() or _linked(path):
                raise ValueError("Native chat requires absolute non-symlink paths")
            # Reject symlinked ancestors, not only the final path component.
            if any(_linked(parent) for parent in path.parents):
                raise ValueError("Native chat path contains a symlink")
        space = canonical_path(self.space_root)
        sessions = canonical_path(self.sessions_dir)
        if not space.is_relative_to(home) or sessions != space / "sessions":
            raise ValueError("Native chat session directory must belong to its actual Space")
        if canonical_path(self.store_path) != home / "state.db":
            raise ValueError("Native chat must use its existing profile store")
        if not self.partition_key.startswith("persist:"):
            raise ValueError("Native chat requires a persisted partition binding")
        canonical_path(self.workspace)
        return self

    @property
    def run_id(self):
        # Transport cleanup adapter only. No independent engine run is minted.
        return self.stream_id

    @property
    def control_epoch(self):
        return 0

    def envelope(self, kind: str, **payload) -> dict[str, Any]:
        return {"schemaVersion": 1, "kind": kind,
                "scope": self.scope.model_dump(mode="json", by_alias=True),
                "sessionId": self.session_id, "streamId": self.stream_id,
                "writerGeneration": self.writer_generation, **payload}

    def validate_envelope(self, value: Any) -> None:
        if not isinstance(value, dict) or any(value.get(key) != expected for key, expected in
            self.envelope(str(value.get("kind", ""))).items()):
            raise ScopeError("Native chat message belongs to another worker")


def _linked(path: Path) -> bool:
    info=path.lstat()
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info,"st_file_attributes",0) & 0x400)


def verify_native_context(context: NativeChatContext, *, check_selection_policy=True) -> None:
    """Read-only persisted binding and writer verification in both processes."""
    from .store import IndependentStore
    from .scope import ScopeResolver
    store = IndependentStore(context.profile_home, context.scope.backend_profile_id, initialize=False)
    try:
        resolver = ScopeResolver(store, profiles_provider=lambda: [
            {"name": context.profile_name, "path": context.profile_home}])
        resolved = resolver.resolve(context.scope, authenticated_profile_name=context.profile_name)
        if (not same_path(resolved.space_root, context.space_root)
            or resolved.binding.partition_key != context.partition_key
            or resolved.binding.revision != context.binding_revision
            or not any(path and same_path(path, context.workspace) for path in
                       (resolved.binding.workspace_locator, str(resolved.space_root)))):
            raise ScopeError("Native chat binding changed")
        matches = [lease for lease in store.list_leases() if lease["leaseId"] == context.writer_lease_id]
        if len(matches) != 1:
            raise ScopeError("Native chat writer is no longer active")
        lease = matches[0]
        if (lease["resourceKey"] != "session_writer:" + context.session_id
            or lease["scope"] != context.scope.model_dump(mode="json", by_alias=True)
            or lease.get("ownerKind") != "legacy_chat" or lease.get("runId") is not None
            or lease["ownerGeneration"] != context.writer_generation):
            raise ScopeError("Native chat does not own its session writer")
        from .model_selection import SelectionPolicyRepository
        from .model_policy_session import validate_native_session
        policy = SelectionPolicyRepository(store, session_validator=lambda selected, sid:
            validate_native_session(resolved, sid, actor=context.profile_name)).get(context.scope, context.session_id)
        if check_selection_policy and (policy.mode != context.selection_mode or policy.revision != context.selection_policy_revision):
            raise ScopeError("Native chat selection policy changed")
    finally:
        store.close()


def capture_native_chat_context(session, stream_id: str, native_writer, *, profile_hub=None, teamwork=False) -> NativeChatContext:
    """Only the Parent's accepted session and actual reserved writer can mint this."""
    saved = getattr(session, "space_scope", None)
    if not saved or native_writer is None:
        raise ScopeError("Native chat requires an actual saved scope and writer")
    if profile_hub is None:
        from web.api.independent import hub
        profile_hub = hub()
    actor = getattr(session, "profile", None) or "default"
    scope = Scope.model_validate(saved)
    store, resolver = profile_hub.by_scope(scope, actor)
    resolved = resolver.resolve(scope, authenticated_profile_name=actor)
    if not same_path(store.db_path, native_writer.store.db_path):
        raise ScopeError("Native chat writer belongs to another profile store")
    from .model_selection import SelectionPolicyRepository
    from .model_policy_session import validate_native_session
    policy = SelectionPolicyRepository(store, session_validator=lambda selected, sid:
        validate_native_session(resolved, sid, actor=actor)).get(scope, session.session_id)
    provider_capture = None
    if policy.mode == "fixed" and not teamwork:
        from .native_sdk_broker import capture_fixed_provider
        provider_capture = capture_fixed_provider(session, profile_hub=profile_hub)
    context = NativeChatContext(scope=scope, profile_name=resolved.profile.name,
        profile_home=str(resolved.profile_home), space_root=str(resolved.space_root),
        sessions_dir=str(resolved.space_root / "sessions"), workspace=str(session.workspace),
        partition_key=resolved.binding.partition_key, session_id=session.session_id,
        stream_id=stream_id, writer_lease_id=native_writer.lease_id,
        writer_generation=native_writer.generation, store_path=str(store.db_path),
        binding_revision=resolved.binding.revision, selection_mode=policy.mode,
        selection_policy_revision=policy.revision, provider_capture=provider_capture,
        teamwork=teamwork is True)
    verify_native_context(context)
    return context


def encode_turn(context: NativeChatContext, args, kwargs) -> dict:
    """Preserve the existing engine signature, while binding its actual IDs."""
    from runtime.chat_modes import ChatExecutionPolicy
    values = list(args)
    if len(values) < 5 or values[0] != context.session_id or values[3] != context.workspace or values[4] != context.stream_id:
        raise ScopeError("Native turn arguments do not match their accepted context")
    options = dict(kwargs)
    if options.get("goal_claim_profile_home") is not None and not same_path(options["goal_claim_profile_home"], context.profile_home):
        raise ScopeError("Native goal claim belongs to another profile")
    if options.get("goal_claim_space_slug") is not None and options["goal_claim_space_slug"] != Path(context.space_root).name:
        raise ScopeError("Native goal claim belongs to another Space")
    policy = options.get("execution_policy")
    if not isinstance(policy, ChatExecutionPolicy):
        raise ScopeError("Native chat requires its captured execution policy")
    options["execution_policy"] = policy.view()
    value = {"args": values, "kwargs": options}
    if "native_goal_retry" in options:
        if options.get("goal_claim_turn") is not None:
            raise ScopeError("Native judge retry cannot own a continuation turn")
        from .native_goal_retry import NativeGoalRetryRequest
        request = NativeGoalRetryRequest.model_validate(options["native_goal_retry"])
        if request.scope != context.scope or request.session_id != context.session_id or request.stream_id != context.stream_id:
            raise ScopeError("Native goal retry belongs to another accepted chat")
        options["native_goal_retry"] = request.model_dump(mode="json", by_alias=True)
        value["turnKind"] = "goal_judge_retry"
    if len(canonical_json(value).encode("utf-8")) > 900_000:
        raise ValueError("Native turn exceeds bounded transport")
    return value


def decode_turn(context: NativeChatContext, payload: dict):
    from runtime.chat_modes import ChatExecutionPolicy
    args, kwargs = payload["args"], dict(payload["kwargs"])
    raw = kwargs["execution_policy"]
    if set(raw) != {"schemaVersion", "mode", "revision", "maxParallelChildren", "maxChildIterations"} or raw["schemaVersion"] != 1:
        raise ScopeError("Invalid frozen native chat policy")
    kwargs["execution_policy"] = ChatExecutionPolicy(raw["mode"], raw["revision"],
        raw["maxParallelChildren"], raw["maxChildIterations"])
    encoded = encode_turn(context, args, kwargs)
    if payload.get("turnKind", "chat") != encoded.get("turnKind", "chat"):
        raise ScopeError("Native turn purpose changed")
    if encoded.get("turnKind") != "goal_judge_retry":
        from web.api.streaming import _run_agent_streaming
        import inspect
        inspect.signature(_run_agent_streaming).bind(*args, **kwargs)
    return args, kwargs
