"""Durable run ownership, bounded admission and effect broker.

The existing AIAgent executes in a bound worker. The manager owns its queue,
policy boundary, leases, checkpoints and result delivery, never the renderer.
"""
from __future__ import annotations

import json
import os
import threading
import time
import uuid
from contextlib import nullcontext
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from .browser_gateway import BrowserGatewayClient, GatewayError, GatewayLease, action_digest
from .contracts import (
    ActionRecord, ActivitySnapshot, AgentDefinition, ApprovalView, Budget,
    PermissionScope, ProviderSelection, RunContext, RunView, Scope,
    TaskDispatchRequest, TaskDispatchView, WaitingFor, TERMINAL_STATES,
    canonical_json, digest_json, new_id, utc_now,
)
from .policy import PolicyDenied, TOOL_SPECS, intersect_permissions, read_authorized_file, require_effect, require_origin, validate_tool
from .runner import provider_configuration_digest
from .scope import ScopeError, ScopeResolver
from .store import IndependentStore, ResourceBusy, RevisionConflict, StateConflict, StoreError
from .worker_host import WorkerError, WorkerHost


class ComputeAdmission:
    """Shared across profile managers; legacy admission is supplied by host.

    Ownership while waiting is not a compute slot. This is an adapter to host
    resource admission, not a second scheduler or agent execution engine.
    """
    _lock = threading.RLock()
    _owners: dict[str, str] = {}
    _scope_claims: dict[str, frozenset[str]] = {}
    _native_child_families: dict[str, tuple[str, str, str, str]] = {}

    @classmethod
    def acquire(cls, run_id: str, scope: Scope, legacy_active_count: int = 0) -> bool:
        with cls._lock:
            if run_id in cls._owners:
                return True
            if len(cls._owners) + legacy_active_count >= 2 or any(scope.key in keys for keys in cls._scope_claims.values()):
                return False
            cls._owners[run_id] = scope.key
            cls._scope_claims[run_id] = frozenset((scope.key,))
            return True

    @classmethod
    def release(cls, run_id: str):
        with cls._lock:
            cls._owners.pop(run_id, None)
            cls._scope_claims.pop(run_id, None)
            cls._native_child_families.pop(run_id, None)

    @classmethod
    def acquire_native_child(cls, owner_key: str, *, scope_key: str,
                             parent_session_id: str, parent_turn_id: str,
                             writer_generation: str) -> bool:
        """Admit only sibling inference claims from one bound native parent turn.

        This is deliberately narrower than the legacy/native-run admission:
        Browser and writer leases stay exclusive, and no other same-scope
        owner can share this inference family.
        """
        family = (scope_key, parent_session_id, parent_turn_id, writer_generation)
        if not all(isinstance(value, str) and value for value in (owner_key, *family)):
            return False
        with cls._lock:
            if owner_key in cls._owners:
                return (cls._owners[owner_key] == scope_key
                    and cls._native_child_families.get(owner_key) == family)
            if len(cls._owners) >= 2:
                return False
            for other_owner, scopes in cls._scope_claims.items():
                if scope_key in scopes and cls._native_child_families.get(other_owner) != family:
                    return False
            cls._owners[owner_key] = scope_key
            cls._scope_claims[owner_key] = frozenset((scope_key,))
            cls._native_child_families[owner_key] = family
            return True

    @classmethod
    def acquire_legacy(cls, owner_key: str, *, scope_key: str | None = None, scope_keys=()) -> bool:
        """Existing host engines share actual compute slots with new runs.

        A canonical project key is ownership, not a fabricated Space identity.
        Nova's existing durable narrower limits and capabilities remain active.
        """
        with cls._lock:
            if owner_key in cls._owners:
                return True
            requested = frozenset(scope_keys) | (frozenset((scope_key,)) if scope_key else frozenset())
            if len(cls._owners) >= 2 or any(requested & keys for keys in cls._scope_claims.values()):
                return False
            cls._owners[owner_key] = scope_key or "legacy:" + owner_key
            cls._scope_claims[owner_key] = requested
            return True


class RunManager:
    # Assistant inference is separately bounded across all profile managers;
    # independent background runs keep their own shared admission accounting.
    _interactive_slots = threading.BoundedSemaphore(2)
    _interactive_waiters = threading.BoundedSemaphore(8)
    _interactive_wait_seconds = 10.0

    def __init__(self, store: IndependentStore, resolver: ScopeResolver, gateway: BrowserGatewayClient | None = None, *, generation: str | None = None, governance_admission: Callable[[RunContext], bool] | None = None, permission_provider: Callable[[Scope], PermissionScope] | None = None, legacy_active_count: Callable[[], int] | None = None, connection_validator: Callable[[RunContext], bool] | None = None, worker_factory=WorkerHost):
        self.store, self.resolver = store, resolver
        self.gateway = gateway if gateway is not None else BrowserGatewayClient.from_environment()
        self.generation = generation or new_id()
        self.governance_admission = governance_admission
        self.permission_provider = permission_provider
        self.connection_validator = connection_validator
        self.legacy_active_count = legacy_active_count or (lambda: 0)
        self.worker_factory = worker_factory
        self._lock = threading.RLock()
        self._condition = threading.Condition(self._lock)
        self._stop = threading.Event()
        self._ticker: threading.Thread | None = None
        self._threads: dict[str, threading.Thread] = {}
        self._workers: dict[str, Any] = {}
        self._projection_handles: dict[int, tuple[RunContext, Any]] = {}
        self._native_file_fences: dict[int, Any] = {}
        self._native_browser_fences: dict[int, Any] = {}
        self._native_admissions_closed = False
        self._leases: dict[str, GatewayLease] = {}
        self._revoking_targets: dict[str, dict[str, GatewayLease]] = {}
        self._browser_creating: set[str] = set()
        self._early_browser_events: dict[str, list[dict[str, Any]]] = {}
        self._retired_browser_leases: dict[str, tuple[float, dict[str, Any]]] = {}
        self._active_since: dict[str, float] = {}
        self._provider_started: dict[str, float] = {}
        self._dispatch_locks: dict[str, threading.Lock] = {}
        self._control_locks: dict[str, threading.RLock] = {}
        self._session_projection_locks: dict[str, threading.RLock] = {}
        self._progress_buffers: dict[str, dict[str, Any]] = {}
        if callable(getattr(self.governance_admission, "bind", None)):
            self.governance_admission.bind(self)

    def attach_gateway(self, gateway: BrowserGatewayClient):
        with self._lock:
            changed = self.gateway is not None and self.gateway is not gateway
            self.gateway = gateway
            if changed:
                self.interrupt_active("main_gateway_replaced")

    def native_auto_execution_availability(self, resolved, session) -> dict[str, Any]:
        """Advertise the installed private broker, never prepared tool authority.

        This is discovery: it validates the real transcript owner and local
        connection evidence but creates no selection decision or quota claim.
        The native host still revalidates its live writer before every SDK call.
        """
        from .native_chat_auto import NativeAutoSessionBroker, native_sdk_supported
        from .model_policy_session import validate_native_session
        from .model_selection import ModelPair, SelectionPolicyRepository, _local_provider
        from .scoped_models import probe_catalog
        from .scope_binding import provider_selection
        from runtime.model_metadata import MINIMUM_CONTEXT_LENGTH

        result = {"available": False, "sealedWorker": False, "managedCallAuthorizer": False,
                  "reasonCode": "native_auto_execution_adapter_required"}
        if getattr(self, "native_auto_broker_factory", None) is not NativeAutoSessionBroker:
            return result
        scope = resolved.binding.scope
        try:
            current = self.resolver.resolve(scope, authenticated_profile_name=resolved.profile.name)
            if current.binding != resolved.binding or current.profile != resolved.profile:
                raise ScopeError("Native AUTO discovery scope changed")
            validate_native_session(current, session.session_id, actor=current.profile.name)
            if (session.space_scope != scope.model_dump(mode="json", by_alias=True)
                or (session.profile or "default") != current.profile.name):
                raise ScopeError("Native AUTO session belongs to another profile")
            result["sealedWorker"] = True
            space_config = current.space.load_config()
            if space_config.get("_nova_management_malformed") or space_config.get("_space_config_malformed"):
                raise ScopeError("Native AUTO management state is malformed")
            if bool((space_config.get("nova_management") or {}).get("enrolled")):
                from .native_governance import NativeManagedGovernance
                from .governance import ManagedBrowserAdmission
                if (getattr(self, "native_governance_factory", None) is not NativeManagedGovernance
                    or not isinstance(self.governance_admission, ManagedBrowserAdmission)):
                    result["reasonCode"] = "auto_nova_execution_adapter_required"
                    return result
                self.governance_admission._resolve_target(current.binding.native_slug)
            capabilities = getattr(self, "capabilities", None)
            if capabilities is None:
                result["reasonCode"] = "auto_provider_binding_required"
                return result
            capabilities.catalog(scope)
            catalog = probe_catalog(self, scope, resolved=current, include_capabilities=False)
            def owner(expected_scope, session_id):
                if expected_scope != scope or session_id != session.session_id:
                    raise ScopeError("AUTO policy belongs to another native chat")
                validate_native_session(current, session_id, actor=current.profile.name)
            policy = SelectionPolicyRepository(self.store, session_validator=owner).get(scope, session.session_id)
            selected, _ = provider_selection(current)
            pairs = policy.allowed_models if policy.mode == "auto" else (
                (ModelPair(provider=selected.provider, model=selected.model),) if selected and selected.provider else ())
            for pair in pairs:
                if not native_sdk_supported(pair.provider):
                    continue
                group = next((row for row in catalog["groups"] if row.get("provider_id") == pair.provider), None)
                row = next((row for row in (*group.get("models", []), *group.get("extra_models", []))
                    if row.get("id") == pair.model), None) if group else None
                if (not group or group.get("configured") is not True or not row
                    or row.get("supportsIndependent") is not True
                    or type(row.get("contextLength")) is not int or row["contextLength"] < MINIMUM_CONTEXT_LENGTH):
                    continue
                if policy.mode == "auto" and not _local_provider(current.profile_home, pair.provider) and (
                    policy.cloud_policy != "allow" or not {"private", "workspace"}.issubset(policy.allowed_cloud_data_classes)):
                    continue
                provider = ProviderSelection(provider_config_ref=catalog["providerConfigurationDigest"],
                    provider=pair.provider, model=pair.model, context_length=row["contextLength"])
                refs = capabilities.capture_provider(scope, provider, purpose="conversation")
                if not refs:
                    continue
                context = self.make_context(scope, provider, connection_bindings=refs, interactive=True)
                self._validate_connections(context)
                result.update(available=True)
                result.pop("reasonCode", None)
                return result
            result["reasonCode"] = "auto_no_eligible_bound_sdk_model"
        except (ScopeError, PolicyDenied, StoreError, WorkerError) as error:
            result["reasonCode"] = getattr(error, "code", None) or "native_auto_binding_unavailable"
        return result

    def interrupt_active(self, reason: str):
        self.stop_native_file_effects(reason=reason)
        self.stop_native_browser_effects(reason=reason)
        for run in self.store.list_runs(include_terminal=False):
            if run.state != "queued" or run.run_id in self._workers or self.store.list_actions(run.run_id):
                self._interrupt(run.run_id, reason)

    def set_permissions(self, scope: Scope, permissions: PermissionScope, *, expected_revision: int) -> dict[str, Any]:
        self.resolver.resolve(scope)
        result = self.store.set_permission_state(scope, permissions, expected_revision=expected_revision)
        file_ack = self.stop_native_file_effects(scope, reason="scope_permissions_changed")
        browser_ack = self.stop_native_browser_effects(scope, reason="scope_permissions_changed")
        result["nativeFileEffectsAcknowledged"] = file_ack["acknowledged"]
        result["nativeBrowserEffectsAcknowledged"] = browser_ack["acknowledged"]
        # An existing immutable RunContext never acquires newly added rights.
        # Changed authorization closes further old permits immediately.
        for run in self.store.list_runs(scope, include_terminal=False):
            self._interrupt(run.run_id, "scope_permissions_changed")
        return result

    def stop_native_file_effects(self, scope: Scope | None = None, *, reason="cancel"):
        with self._lock:
            fences = tuple(fence for fence in self._native_file_fences.values()
                if scope is None or fence.context.scope == scope)
        acknowledgements = [fence.request_stop(reason) for fence in fences]
        from .native_file_io import recover_native_file_leases
        scopes = (scope,) if scope is not None else tuple(binding.scope for binding in self.store.list_bindings())
        for actual in scopes:
            recover_native_file_leases(self.store, actual)
        pending = [lease for lease in self.store.list_leases() if lease.get("ownerKind") == "native_file"
            and (scope is None or lease.get("scope") == scope.model_dump(mode="json", by_alias=True))]
        return {"acknowledged": not pending and all(row["acknowledged"] for row in acknowledgements),
            "processesExited": not pending and all(row["processesExited"] for row in acknowledgements)}

    def stop_native_browser_effects(self, scope: Scope | None = None, *, reason="cancel"):
        with self._lock:
            fences = tuple(fence for fence in self._native_browser_fences.values()
                if scope is None or fence.context.scope == scope)
        acknowledgements = []
        for fence in fences:
            try:
                acknowledgements.append(fence.request_stop(reason))
            except (OSError, RuntimeError, ValueError):
                acknowledgements.append({"acknowledged": False})
        # A lost Main ACK leaves the actual native target lease durable. No
        # manager generation change can manufacture a successful revoke.
        pending = [lease for lease in self.store.list_leases() if lease.get("ownerKind") == "native_chat"
            and lease.get("resourceKey", "").startswith("target:")
            and (scope is None or lease.get("scope") == scope.model_dump(mode="json", by_alias=True))]
        return {"acknowledged": not pending and all(row.get("acknowledged") is True for row in acknowledgements),
            "pendingLeaseIds": [lease["leaseId"] for lease in pending]}

    def approve(self, approval_id: str, *, approved: bool, actor_ref: str, action_digest: str, expected_permission_revision: int, scope: Scope | None = None) -> ApprovalView:
        existing = self.store.get_approval(approval_id)
        if not existing or scope is not None and existing.scope != scope:
            raise PolicyDenied("approval_not_found")
        self.resolver.resolve(existing.scope)
        lease = self._leases.get(existing.run_id)
        target_bound = existing.lease_id is not None or existing.navigation_epoch is not None
        if approved and target_bound:
            complete = all((existing.action_id, existing.lease_id, existing.target_id,
                existing.main_generation, existing.runner_generation))
            snapshot = None
            if complete and lease is not None and self.gateway is not None:
                try:
                    snapshot = self.gateway.snapshot(lease)
                except Exception:
                    snapshot = None
            if snapshot is None or not self._approval_target_matches(existing, lease, snapshot):
                # Treat an obsolete browser approval as an explicit denial and
                # fail its run. The UI receives a terminal approval record and
                # must obtain a fresh review for any replacement target.
                result = self.store.decide_approval(approval_id, approved=False, actor_ref=actor_ref,
                    action_digest=action_digest, expected_permission_revision=expected_permission_revision)
                self._fail(existing.run_id, "approval_target_changed")
                with self._condition:
                    self._condition.notify_all()
                return result
        result = self.store.decide_approval(approval_id, approved=approved, actor_ref=actor_ref, action_digest=action_digest, expected_permission_revision=expected_permission_revision)
        run = self.store.get_run(existing.run_id)
        if run and run.state == "waiting_for_approval":
            if approved:
                self.control(run.run_id, "resume", expected_revision=run.state_revision)
            else:
                self._fail(run.run_id, "approval_denied")
                with self._condition:
                    self._condition.notify_all()
        return result

    @staticmethod
    def _approval_target_matches(approval: ApprovalView, lease: GatewayLease, snapshot: dict[str, Any]) -> bool:
        return (lease.lease_id == approval.lease_id and snapshot.get("leaseId") == approval.lease_id
            and snapshot.get("runId") == approval.run_id
            and snapshot.get("scope") == approval.scope.model_dump(mode="json", by_alias=True)
            and snapshot.get("targetId") == approval.target_id
            and snapshot.get("mainGeneration") == approval.main_generation
            and snapshot.get("runnerGeneration") == approval.runner_generation
            and snapshot.get("navigationEpoch") == approval.navigation_epoch)

    def browser_snapshot(self, run_id: str) -> dict[str, Any] | None:
        run = self.store.get_run(run_id)
        if not run:
            raise StoreError("Unknown run")
        self.resolver.resolve(run.scope)
        lease = self._leases.get(run_id)
        return self.gateway.snapshot(lease) if lease and self.gateway else None

    def browser_control(self, run_id: str, operation: str) -> dict[str, Any]:
        run = self.store.get_run(run_id)
        if not run:
            raise StoreError("Unknown run")
        self.resolver.resolve(run.scope)
        lease = self._leases.get(run_id)
        if not lease or not self.gateway:
            raise PolicyDenied("browser_target_missing")
        if operation == "takeover":
            if run.state == "running":
                self.control(run_id, "pause", expected_revision=run.state_revision)
            if self.store.get_run(run_id).state != "paused":
                return {"state": "pausing", "runId": run_id}
        elif operation != "pause":
            raise PolicyDenied("browser_control_not_authorized")
        return self.gateway.control(lease, operation, control_sequence=self.store.next_control_sequence(run.scope))

    def browser_event(self, event: dict[str, Any]):
        snapshot = event.get("lease") or {}
        run_id = snapshot.get("runId")
        with self._lock:
            lease = self._leases.get(run_id)
            retired = self._retired_browser_leases.get(snapshot.get("leaseId"))
            if lease is None and retired is not None and retired[0] >= time.monotonic():
                if event.get("kind") not in {"lost", "revoked", "closed", "navigation_denied"} or any(snapshot.get(key) != value for key, value in retired[1].items()):
                    raise PolicyDenied("browser_event_scope_mismatch")
                return  # Exact terminal acknowledgement has no new authority.
        if lease is None:
            # Main emits created/lost before the create HTTP response can
            # return. Accept only a currently pending, immutable own scope.
            context = self.store.get_run_context(run_id) if isinstance(run_id, str) else None
            with self._lock:
                if run_id not in self._browser_creating or context is None or snapshot.get("scope") != context.scope.model_dump(mode="json", by_alias=True) or snapshot.get("runnerGeneration") != context.runner_generation:
                    raise PolicyDenied("browser_event_scope_mismatch")
                events = self._early_browser_events.setdefault(run_id, [])
                if len(events) >= 16:
                    raise PolicyDenied("browser_event_overflow")
                events.append(event)
            return
        if (not lease or lease.lease_id != snapshot.get("leaseId")
            or lease.snapshot.get("scope") != snapshot.get("scope")
            or lease.snapshot.get("targetId") != snapshot.get("targetId")
            or lease.snapshot.get("mainGeneration") != snapshot.get("mainGeneration")
            or lease.snapshot.get("runnerGeneration") != snapshot.get("runnerGeneration")
            or type(snapshot.get("navigationEpoch")) is not int
            or snapshot["navigationEpoch"] < lease.snapshot.get("navigationEpoch", -1)):
            raise PolicyDenied("browser_event_scope_mismatch")
        lease.snapshot = snapshot
        self.store.update_browser_lease_navigation(lease.lease_id, run_id, self.store.get_run(run_id).scope,
            self.generation, self._capture_browser_identity(self.store.get_run_context(run_id), lease, snapshot),
            snapshot["navigationEpoch"])
        if event.get("kind") in {"lost", "revoked", "closed", "navigation_denied"}:
            self._interrupt(run_id, str(event.get("reason") or "browser_target_lost")[:128])

    @staticmethod
    def _require_independent_model(provider: ProviderSelection):
        if provider.model == "teamwork" or provider.model.startswith("smart-track-") or provider.provider == "teamwork":
            raise PolicyDenied("independent_orchestration_not_supported")

    def make_context(self, scope: Scope, provider: ProviderSelection, *, dispatch_id: str | None = None, run_id: str | None = None, definition: AgentDefinition | None = None, permissions: PermissionScope | None = None, connection_bindings=(), allow_virtual_for_catalog: bool = False, interactive: bool = False) -> RunContext:
        if not allow_virtual_for_catalog:
            self._require_independent_model(provider)
        resolved = self.resolver.resolve(scope)
        current = self.store.get_permission_state(scope)
        if (current["permissions"] or {}).get("revoked") and not interactive:
            raise PolicyDenied("scope_permissions_revoked")
        permission = permissions or (definition.permission_scope if definition else PermissionScope(allowed_effects=()))
        empty = PermissionScope(allowed_effects=())
        if interactive and (definition is not None or permission != empty):
            raise PolicyDenied("interactive_tool_authority_forbidden")
        if not interactive and self.permission_provider is not None:
            permission = intersect_permissions(permission, self.permission_provider(scope))
        if not interactive and current["permissions"] and "allowedEffects" in current["permissions"]:
            permission = intersect_permissions(permission, PermissionScope.model_validate(current["permissions"]))
        profile = self.store.get_profile_snapshot(definition.profile_snapshot_ref) if definition and definition.profile_snapshot_ref else self.store.get_confirmed_profile(scope)
        if profile is not None and (profile.scope != scope or profile.status != "confirmed") or definition and definition.profile_snapshot_ref and profile is None:
            raise PolicyDenied("definition_profile_snapshot_unavailable")
        roots = tuple(str(Path(root).resolve(strict=True)) for root in permission.allowed_workspace_roots)
        return RunContext(run_id=run_id or new_id(), dispatch_id=dispatch_id or new_id(), scope=scope, resolved_profile_home=str(resolved.profile_home), resolved_space_root=str(resolved.space_root), backend_profile_name=resolved.profile.name, partition_key=resolved.binding.partition_key, binding_revision=resolved.binding.revision, allowed_workspace_roots=roots, assistant_profile_revision=profile.revision if profile else None, assistant_profile_snapshot_ref=profile.profile_id if profile else None, assistant_profile_snapshot=profile, agent_definition_revision=definition.revision if definition else 1, provider=provider, connection_bindings=definition.connection_bindings if definition else connection_bindings, effective_permissions=permission, permission_revision=current["revision"], runner_generation=self.generation, cancellation_token=new_id(), budget=definition.budget if definition else Budget())

    def _governance(self, context: RunContext, *, prepare: bool = False):
        resolved = self.resolver.validate_context(context)
        self._validate_connections(context)
        config = resolved.space.load_config()
        if config.get("_nova_management_malformed"):
            raise PolicyDenied("space_governance_invalid")
        managed = bool((config.get("nova_management") or {}).get("enrolled"))
        admission = self.governance_admission
        gate = getattr(admission, "prepare", admission) if prepare else admission
        if managed and (gate is None or not gate(context)):
            raise PolicyDenied("nova_governance_admission_required")
        return managed

    def _validate_connections(self, context: RunContext):
        if not context.connection_bindings:
            return
        from .connections import ConnectionRepository
        current = {row.binding_id: row for row in ConnectionRepository(self.store).list(context.scope)}
        for captured in context.connection_bindings:
            binding = current.get(captured.binding_id)
            if binding is None or binding.status != "active" or binding.scope != context.scope or binding.connection_kind != captured.kind or binding.revision != captured.revision or binding.connection_revision != captured.connection_revision or binding.connection_id != captured.connection_id or binding.capability_id != captured.capability_id:
                raise PolicyDenied("scope_connection_changed")
        # Live adapter evidence is distinct from a persisted connection record.
        if self.connection_validator is None or not self.connection_validator(context):
            raise PolicyDenied("scope_connection_adapter_required")

    def start(self):
        with self._lock:
            if self._ticker and self._ticker.is_alive():
                return
            self.store.recover_after_restart(self.generation)
            self._stop.clear()
            self._ticker = threading.Thread(target=self._loop, name="IndependentRunManager", daemon=True)
            self._ticker.start()

    def shutdown(self):
        self._native_admissions_closed = True
        self._stop.set()
        from .connection_setup import close_connection_setup
        close_connection_setup(self)
        self.stop_native_file_effects(reason="app_shutdown")
        self.stop_native_browser_effects(reason="app_shutdown")
        with self._lock:
            projections = tuple(self._projection_handles.values())
        for _, handle in projections:
            handle.terminate(grace_seconds=.25, hard_seconds=2)
        with self._condition:
            self._condition.notify_all()
        for run in self.store.list_runs(include_terminal=False):
            if run.state == "queued" and run.run_id not in self._workers:
                continue  # durable never-started work remains queued
            self._interrupt(run.run_id, "app_shutdown")
        if self._ticker:
            self._ticker.join(timeout=2)
        with self._lock:
            threads = tuple(self._threads.values())
        deadline = time.monotonic() + 5
        for thread in threads:
            if thread is not threading.current_thread():
                thread.join(timeout=max(0.0, deadline - time.monotonic()))
        close = getattr(self.governance_admission, "close", None)
        if close is not None:
            close()

    def _loop(self):
        while not self._stop.is_set():
            try:
                self.tick()
            except (OSError, StoreError, ScopeError):
                # Availability is observed by ActivityService; a failing DB
                # does not authorize starting unpersisted work.
                pass
            self._stop.wait(0.1)

    def dispatch(self, request: TaskDispatchRequest, *, provider: ProviderSelection, permissions: PermissionScope, budget: Budget | None = None, connection_bindings=(), enqueue_only: bool = False, _authorized_definition: AgentDefinition | None = None) -> TaskDispatchView:
        if _authorized_definition is not None and not enqueue_only:
            raise PolicyDenied("scheduled_authorization_requires_native_enqueue")
        self._require_independent_model(provider)
        self.resolver.resolve(request.scope)
        if self.store.get_permission_state(request.scope)["revision"] != request.expected_permission_revision:
            raise RevisionConflict("Authorization changed before dispatch")
        with self._lock:
            gate = self._dispatch_locks.setdefault(request.scope.key + ":" + request.client_request_id, threading.Lock())
        with gate:
            with self.store.transaction():
                target_session = uuid.uuid5(uuid.NAMESPACE_URL, f"lastbrowser:definition-chat:{request.scope.key}:{request.definition_id}").hex if request.definition_id else None
                dispatch, created = self.store.reserve_dispatch(request, target_session_id=target_session, authorized_definition=_authorized_definition)
                plan = self.store.get_outbox("plan:" + dispatch.dispatch_id)
                if plan is None:
                    if request.definition_id:
                        definition = self.store.get_definition(request.definition_id, request.definition_revision)
                        if not definition or definition.scope != request.scope:
                            raise PolicyDenied("definition_scope_mismatch")
                        latest = self.store.get_definition(request.definition_id)
                        if not latest or latest.revision != definition.revision or not latest.enabled:
                            raise PolicyDenied("definition_revision_unavailable")
                    else:
                        definition = AgentDefinition(definition_id=new_id(), scope=request.scope, title=request.title, instruction=request.instruction, desired_result=request.desired_result, provider=provider, permission_scope=permissions, budget=budget or Budget(), connection_bindings=connection_bindings)
                        self.store.put_definition(definition)
                    run_id = new_id()
                    context = self.make_context(request.scope, definition.provider, dispatch_id=dispatch.dispatch_id, run_id=run_id, definition=definition, permissions=permissions)
                    self._governance(context, prepare=True)
                    dispatch = self.store.update_dispatch(dispatch.dispatch_id, "materializing", run_id=run_id if request.kind != "prepare_chat" else None)
                    plan_payload = {"context": context.model_dump(mode="json", by_alias=True), "definitionId": definition.definition_id, "definitionRevision": definition.revision, "request": request.model_dump(mode="json", by_alias=True), "providerConfigurationDigest": provider_configuration_digest(Path(context.resolved_profile_home))}
                    self.store.put_outbox("plan:" + dispatch.dispatch_id, request.scope, "dispatch_plan", plan_payload)
                    plan = self.store.get_outbox("plan:" + dispatch.dispatch_id)
                else:
                    context = RunContext.model_validate(plan["payload"]["context"])
                    definition = self.store.get_definition(plan["payload"]["definitionId"], plan["payload"]["definitionRevision"])
                if dispatch.state == "started":
                    return dispatch
                if request.definition_id:
                    if any(run.definition_id == definition.definition_id and run.dispatch_id != dispatch.dispatch_id and run.state not in TERMINAL_STATES for run in self.store.list_runs(request.scope)):
                        raise ResourceBusy("Definition already owns an active workchat")
                    if request.kind != "prepare_chat":
                        # Reserve one durable writer before updating a reused
                        # transcript, including while the run is only queued.
                        self._ensure_queued_run(dispatch, definition, context)
                        self.store.acquire_lease(request.scope, context.run_id, "session_writer:" + dispatch.target_session_id, self.generation, "2099-01-01T00:00:00Z")
                if dispatch.state == "failed":
                    dispatch = self.store.update_dispatch(dispatch.dispatch_id, "materializing")
                if enqueue_only:
                    if request.kind == "prepare_chat":
                        raise PolicyDenied("scheduled_chat_must_start")
                    self._ensure_queued_run(dispatch, definition, context)
                    # The native Cron tick commits only queue ownership. The
                    # manager materializes the real workchat before inference.
                    return dispatch
            # Cross-file materialization is deliberately OUTSIDE the DB lock.
            projection = self.store.get_outbox("session:" + dispatch.dispatch_id)
            try:
                if projection["state"] != "delivered":
                    resolved = self.resolver.validate_context(context)
                    self._run_projection(context, {"mode": "materialize_session", "nativeSlug": resolved.binding.native_slug, "targetSessionId": dispatch.target_session_id, "assistantConversationId": dispatch.assistant_conversation_id, "title": request.title, "instruction": request.instruction, "definitionId": request.definition_id})
                    self.store.finish_outbox(projection["deliveryKey"], success=True)
                with self.store.transaction():
                    if request.kind == "prepare_chat":
                        return self.store.update_dispatch(dispatch.dispatch_id, "prepared")
                    self._ensure_queued_run(dispatch, definition, context)
                    dispatch = self.store.update_dispatch(dispatch.dispatch_id, "started", run_id=context.run_id)
                with self._condition:
                    self._condition.notify_all()
                return dispatch
            except (PolicyDenied, WorkerError, StoreError, OSError, ScopeError) as exc:
                self.store.finish_outbox(projection["deliveryKey"], success=False, error_code=getattr(exc, "code", "session_materialization_failed"))
                self.store.update_dispatch(dispatch.dispatch_id, "failed", reason_code=getattr(exc, "code", "session_materialization_failed"))
                raise

    def _ensure_queued_run(self, dispatch, definition, context):
        if not self.store.get_run(context.run_id):
            now = utc_now()
            run = RunView(run_id=context.run_id, dispatch_id=dispatch.dispatch_id, scope=context.scope, definition_id=definition.definition_id, definition_revision=definition.revision, created_at=now, updated_at=now, target_session_id=dispatch.target_session_id, assistant_profile_revision=context.assistant_profile_revision)
            self.store.create_run(run, context)

    def enqueue(self, request: TaskDispatchRequest, *, provider: ProviderSelection, permissions: PermissionScope, authorized_definition: AgentDefinition | None = None) -> TaskDispatchView:
        return self.dispatch(request, provider=provider, permissions=permissions, enqueue_only=True, _authorized_definition=authorized_definition)

    def _run_projection(self, context: RunContext, payload: dict[str, Any]) -> dict[str, Any]:
        # Materialize and delayed terminal reports share one existing task
        # transcript. Never race read/modify/write projections in two children.
        key = context.scope.key + ":" + payload["targetSessionId"]
        with self._lock:
            gate = self._session_projection_locks.setdefault(key, threading.RLock())
        with gate:
            projection_lease = None
            writer = next((lease for lease in self.store.list_leases() if lease["resourceKey"] == "session_writer:" + payload["targetSessionId"]), None)
            owns_writer = writer is not None and writer.get("runId") == context.run_id and writer.get("ownerGeneration") == context.runner_generation
            historical_report = False
            if writer is not None and not owns_writer and payload.get("mode") == "update_session" and payload.get("progress") is None:
                current = self.store.get_run(writer.get("runId")) if writer.get("runId") else None
                original = self.store.get_run(context.run_id)
                receipt = self.store.get_outbox(payload.get("deliveryKey", ""))
                historical_report = bool(current and original and receipt and receipt["kind"] == "terminal_result"
                    and receipt["payload"].get("runId") == original.run_id and original.state in TERMINAL_STATES
                    and writer.get("ownerGeneration") == self.generation
                    and current.scope == original.scope == context.scope
                    and current.target_session_id == original.target_session_id == payload["targetSessionId"]
                    and current.definition_id == original.definition_id)
            if not owns_writer and not historical_report:
                projection_lease = self.store.acquire_session_projection(context.scope, payload["targetSessionId"],
                    "projection:" + context.run_id, self.generation)
            try:
                return self._run_projection_owned(context, payload)
            finally:
                if projection_lease is not None:
                    self.store.release_lease(projection_lease["leaseId"], owner_generation=self.generation)

    def _run_projection_owned(self, context: RunContext, payload: dict[str, Any]) -> dict[str, Any]:
        # Retirement takes the same SQLite scope boundary. Register the actual
        # process while that read boundary is held, before a tombstone can
        # commit and snapshot the process owners it has to stop.
        with self.store.transaction(write=False):
            self.resolver.validate_context(context)
            if self._stop.is_set():
                raise WorkerError("session_projection_interrupted")
            handle = self.worker_factory(context).start(payload=payload)
            with self._lock:
                self._projection_handles[id(handle)] = (context, handle)
        deadline = time.monotonic() + 15
        try:
            while time.monotonic() < deadline:
                if self._stop.is_set():
                    raise WorkerError("session_projection_interrupted")
                event = handle.read_event(timeout=0.1)
                if not event:
                    if not handle.is_alive:
                        raise WorkerError("Session projection worker ended without confirmation")
                    continue
                if event.get("kind") == "result":
                    return event.get("value") or {}
                if event.get("kind") in {"error", "eof"}:
                    code = str(event.get("code") or "worker_ended")
                    if event.get("kind") == "eof":
                        code += "_" + handle.safe_exit_diagnostic()
                    raise WorkerError("Session projection failed: " + code)
            raise WorkerError("Session projection timed out")
        finally:
            try:
                handle.terminate(grace_seconds=0.25, hard_seconds=2)
            finally:
                with self._lock:
                    self._projection_handles.pop(id(handle), None)

    def tick(self):
        self._deliver_outbox()
        poll = getattr(self.governance_admission, "poll", None)
        if poll is not None:
            for active in self.store.list_runs(include_terminal=False):
                if active.state != "queued":
                    reason = poll(self.store.get_run_context(active.run_id))
                    if reason:
                        self._interrupt(active.run_id, reason)
        for run in self.store.list_runs(states=("queued",)):
            if self._stop.is_set():
                return
            context = self.store.get_run_context(run.run_id)
            try:
                if context.runner_generation != self.generation:
                    context = self.store.adopt_queued_generation(run.run_id, self.generation)
                self._governance(context, prepare=True)
                current = self.store.get_permission_state(run.scope)
                if current["revision"] != context.permission_revision or (current["permissions"] or {}).get("revoked"):
                    raise PolicyDenied("scope_permissions_changed")
                plan = self.store.get_outbox("plan:" + run.dispatch_id)
                if plan is None or provider_configuration_digest(Path(context.resolved_profile_home)) != plan["payload"]["providerConfigurationDigest"]:
                    raise PolicyDenied("provider_configuration_changed")
                projection = self.store.get_outbox("session:" + run.dispatch_id)
                if projection is None:
                    raise PolicyDenied("workchat_projection_unavailable")
                if projection["state"] != "delivered":
                    # This runs in the existing queue owner, never Cron's
                    # enqueue callback. Its worker has no inference mode.
                    request = self.store.get_dispatch_request(run.dispatch_id)
                    self.dispatch(request, provider=context.provider, permissions=context.effective_permissions)
                    continue
                legacy = int(self.legacy_active_count())
                if legacy < 0 or not ComputeAdmission.acquire(run.run_id, run.scope, legacy):
                    continue
                self._governance(context)
                self.store.transition_run(run.run_id, "running", expected_revision=run.state_revision)
                self._active_since[run.run_id] = time.monotonic()
                if run.run_id in self._workers:
                    lease = self._leases.get(run.run_id)
                    if lease and self.gateway:
                        snapshot = self.gateway.snapshot(lease)
                        if snapshot["state"] == "paused":
                            self.gateway.control(lease, "resume", control_sequence=self.store.next_control_sequence(run.scope))
                    with self._condition:
                        self._condition.notify_all()
                else:
                    thread = threading.Thread(target=self._run_worker, args=(run.run_id,), name="IndependentRun-" + run.run_id[:8], daemon=True)
                    with self._lock:
                        self._threads[run.run_id] = thread
                    thread.start()
            except ResourceBusy:
                ComputeAdmission.release(run.run_id)
                continue
            except (PolicyDenied, RevisionConflict, GatewayError, WorkerError, ScopeError) as exc:
                self._fail(run.run_id, getattr(exc, "code", "admission_failed"))

    def _run_worker(self, run_id: str):
        context = self.store.get_run_context(run_id)
        run = self.store.get_run(run_id)
        definition = self.store.get_definition(run.definition_id, run.definition_revision)
        plan = self.store.get_outbox("plan:" + run.dispatch_id)
        handle = None
        result = None
        try:
            resolved = self.resolver.validate_context(context)
            self.store.acquire_lease(run.scope, run_id, "execution:" + run_id, self.generation, "2099-01-01T00:00:00Z")
            self.store.acquire_lease(run.scope, run_id, "session_writer:" + run.target_session_id, self.generation, "2099-01-01T00:00:00Z")
            checkpoint = self.store.latest_checkpoint(run_id)
            payload = {"mode": "run", "instruction": definition.instruction, "targetSessionId": run.target_session_id, "nativeSlug": resolved.binding.native_slug, "providerConfigurationDigest": plan["payload"]["providerConfigurationDigest"], "history": (checkpoint or {}).get("state", {}).get("conversationHistory", [])}
            handle = self.worker_factory(context).start(payload=payload)
            with self._lock:
                self._workers[run_id] = handle
            while not self._stop.is_set():
                current = self.store.get_run(run_id)
                if current.state in TERMINAL_STATES or current.state == "cancelling":
                    return
                self._check_deadlines(run_id)
                event = handle.read_event(timeout=0.1)
                if not event:
                    if not handle.is_alive:
                        raise WorkerError("worker_ended_without_result")
                    continue
                kind = event.get("kind")
                if event.get("runId") not in {None, run_id}:
                    raise PolicyDenied("worker_run_mismatch")
                if kind == "request":
                    try:
                        value = self._handle_request(run_id, event)
                        handle.send({"kind": "reply", "requestId": event["requestId"], "value": value})
                    except (PolicyDenied, StoreError, GatewayError, ScopeError) as exc:
                        handle.send({"kind": "reply", "requestId": event["requestId"], "error": getattr(exc, "code", "broker_denied")})
                        raise
                elif kind == "checkpoint":
                    self.store.save_checkpoint(run_id, event.get("state") or {}, safe_boundary=event.get("safeBoundary") is True)
                elif kind == "delta":
                    self._accept_run_delta(run_id, event.get("delta"), truncated=event.get("truncated") is True)
                elif kind == "result":
                    result = event.get("value") or {}
                    break
                elif kind in {"error", "eof"}:
                    raise WorkerError(str(event.get("code") or event.get("errorCode") or "worker_ended_without_result"))
            if result is not None:
                self._safe_boundary(run_id, {"summary": "Final model response", "conversationHistory": result.get("messages", []), "final": True})
                current = self.store.get_run(run_id)
                if current.state == "running":
                    managed = self._governance(context)
                    boundary = getattr(self.governance_admission, "completion_boundary", None)
                    if managed and boundary is None:
                        raise PolicyDenied("nova_completion_adapter_required")
                    with boundary(context) if managed else nullcontext():
                        artifact = self._write_artifact(context, "result", result)
                        self._leave_compute(run_id)
                        self.store.transition_run(run_id, "interrupted" if result.get("interrupted") else "completed", expected_revision=current.state_revision, expected_control_epoch=current.control_epoch, result_ref=artifact, reason_code="model_interrupted" if result.get("interrupted") else None)
        except (PolicyDenied, GatewayError, StoreError, WorkerError, OSError, ScopeError) as exc:
            self._fail(run_id, getattr(exc, "code", str(exc) if isinstance(exc, WorkerError) else "run_failed"))
        except Exception:
            self._fail(run_id, "run_internal_error")
        finally:
            self._leave_compute(run_id)
            if handle:
                handle.terminate(grace_seconds=0.25, hard_seconds=2)
            self._close_browser(run_id)
            self._flush_run_progress(run_id, force=True, project=False)
            self._progress_buffers.pop(run_id, None)
            with self._condition:
                self._workers.pop(run_id, None)
                self._threads.pop(run_id, None)
                self._provider_started.pop(run_id, None)
                self._condition.notify_all()

    def _accept_run_delta(self, run_id: str, delta, *, truncated: bool = False):
        # Runner subscribes exclusively to AIAgent.stream_delta_callback. Its
        # stateful scrubber removes reasoning tags; reasoning and tool JSON
        # callbacks are never connected to this wire.
        if not isinstance(delta, str) or not delta:
            return
        buffer = self._progress_buffers.setdefault(run_id, {"text": "", "truncated": False, "savedAt": 0.0,
            "projectedAt": 0.0, "savedChars": 0, "projections": 0})
        remaining = 64000 - len(buffer["text"])
        buffer["text"] += delta[:remaining]
        buffer["truncated"] = buffer["truncated"] or truncated or len(delta) > remaining
        self._flush_run_progress(run_id)

    def _flush_run_progress(self, run_id: str, *, force=False, project=True):
        buffer = self._progress_buffers.get(run_id)
        if buffer is None:
            return
        now = time.monotonic()
        if not force and now - buffer["savedAt"] < .75 and len(buffer["text"]) - buffer["savedChars"] < 2000:
            return
        run = self.store.get_run(run_id)
        if run is None:
            return
        active = run.counters.active_seconds + (now - self._active_since[run_id] if run_id in self._active_since else 0)
        progress = self.store.save_run_progress(run_id, buffer["text"], truncated=buffer["truncated"], active_seconds=active)
        buffer.update(savedAt=now, savedChars=len(buffer["text"]))
        if project and run.state not in TERMINAL_STATES and buffer["projections"] < 64 and now - buffer["projectedAt"] >= 4:
            context = self.store.get_run_context(run_id)
            try:
                resolved = self.resolver.validate_context(context)
                self._run_projection(context, {"mode": "update_session", "nativeSlug": resolved.binding.native_slug,
                    "targetSessionId": run.target_session_id, "deliveryKey": "progress:" + run_id,
                    "progress": progress.model_dump(mode="json", by_alias=True)})
                self.store.finish_outbox("progress:" + run_id, success=True)
            except (StoreError, WorkerError, PolicyDenied, OSError, ScopeError):
                pass  # Durable latest snapshot remains available to reconnect.
            buffer.update(projectedAt=now, projections=buffer["projections"] + 1)

    def _leave_compute(self, run_id: str):
        started = self._active_since.pop(run_id, None)
        current = self.store.get_run(run_id)
        if started is not None and current and current.state not in TERMINAL_STATES:
            try:
                self.store.update_counters(run_id, active_seconds=time.monotonic() - started)
            except StoreError:
                pass
        from web.api.independent import local_ai_core_release_ready
        if local_ai_core_release_ready(self,run_id):ComputeAdmission.release(run_id)

    def _safe_boundary(self, run_id: str, state: dict[str, Any] | None = None):
        current = self.store.get_run(run_id)
        if current is None or current.state in TERMINAL_STATES or current.state == "cancelling":
            raise PolicyDenied("run_cancelled")
        if current.state == "pausing":
            self.store.save_checkpoint(run_id, state or {"summary": "Before the next provider/tool dispatch"})
            self.store.transition_run(run_id, "paused", expected_revision=current.state_revision)
            self._leave_compute(run_id)
        while True:
            with self._condition:
                current = self.store.get_run(run_id)
                if self._stop.is_set() or current.state in TERMINAL_STATES or current.state == "cancelling":
                    raise PolicyDenied("run_cancelled")
                if current.state == "running":
                    break
                if current.state not in {"paused", "queued", "waiting_for_approval", "waiting_for_user"}:
                    raise PolicyDenied("run_not_dispatchable")
                self._condition.wait(timeout=0.25)
        # The governance gate is outside the condition lock. A native control
        # during an in-flight provider call is checked at its next safe point.
        self._validate_current(self.store.get_run_context(run_id))

    def _check_deadlines(self, run_id: str):
        run = self.store.get_run(run_id)
        context = self.store.get_run_context(run_id)
        active = run.counters.active_seconds + (time.monotonic() - self._active_since[run_id] if run_id in self._active_since else 0)
        if active >= context.budget.max_active_seconds:
            raise PolicyDenied("active_time_budget_exhausted")
        if run_id in self._provider_started and time.monotonic() - self._provider_started[run_id] > context.budget.provider_timeout_seconds:
            raise PolicyDenied("provider_timeout")

    def _handle_request(self, run_id: str, event: dict[str, Any]) -> dict[str, Any]:
        context = self.store.get_run_context(run_id)
        if event.get("runnerGeneration") not in {None, context.runner_generation}:
            raise PolicyDenied("runner_generation_stale")
        self._safe_boundary(run_id)
        self._check_deadlines(run_id)
        kind = event.get("requestKind")
        if kind == "provider_request":
            self._validate_current(context)
            run = self.store.get_run(run_id)
            if run.counters.provider_requests >= context.budget.max_provider_requests:
                raise PolicyDenied("provider_request_budget_exhausted")
            if self._governance(context) and callable(getattr(self.governance_admission, "claim_provider", None)):
                self.governance_admission.claim_provider(context, event["requestId"])
            self.store.update_counters(run_id, provider_requests=1)
            self._flush_run_progress(run_id, force=True, project=False)
            self._provider_started[run_id] = time.monotonic()
            return {"authorized": True}
        self._provider_started.pop(run_id, None)
        if kind == "usage":
            tokens = event.get("measuredTokens")
            if type(tokens) is not int or tokens < 0:
                raise PolicyDenied("invalid_token_usage")
            run = self.store.update_counters(run_id, measured_tokens=tokens)
            self._flush_run_progress(run_id, force=True, project=False)
            if run.counters.measured_tokens >= context.budget.max_measured_tokens:
                raise PolicyDenied("measured_token_budget_exhausted")
            return {"recorded": True}
        if kind == "tool":
            if event.get("scope") != context.scope.model_dump(mode="json", by_alias=True) or event.get("controlEpoch") != self.store.get_run(run_id).control_epoch:
                raise PolicyDenied("worker_action_scope_mismatch")
            return self._execute_tool(context, event["requestId"], event.get("tool"), event.get("args"))
        if kind == "clarification":
            run = self.store.get_run(run_id)
            self.store.save_checkpoint(run_id, {"summary": "Waiting for your answer", "question": str(event.get("question", ""))[:8000]})
            self.store.transition_run(run_id, "waiting_for_user", expected_revision=run.state_revision, waiting_for=WaitingFor(kind="clarification"))
            self._leave_compute(run_id)
            self._safe_boundary(run_id)
            checkpoint = self.store.latest_checkpoint(run_id)
            return {"answer": checkpoint["state"].get("answer", "")}
        raise PolicyDenied("worker_request_not_authorized")

    def _validate_current(self, context: RunContext):
        self._governance(context)
        current = self.store.get_permission_state(context.scope)
        if current["revision"] != context.permission_revision or (current["permissions"] or {}).get("revoked"):
            raise PolicyDenied("scope_permissions_changed")
        plan = self.store.get_outbox("plan:" + context.dispatch_id)
        if plan and provider_configuration_digest(Path(context.resolved_profile_home)) != plan["payload"]["providerConfigurationDigest"]:
            raise PolicyDenied("provider_configuration_changed")

    def _browser(self, context: RunContext) -> GatewayLease:
        gateway = self.gateway
        if gateway is None:
            raise PolicyDenied("browser_gateway_unavailable")
        existing = self._leases.get(context.run_id)
        if existing:
            snapshot = gateway.snapshot(existing)
            if snapshot["state"] not in {"ready", "paused", "pausing"}:
                raise PolicyDenied("browser_target_lost")
            identity = self._capture_browser_identity(context, existing, snapshot)
            self.store.update_browser_lease_navigation(existing.lease_id, context.run_id, context.scope,
                self.generation, identity, snapshot["navigationEpoch"])
            existing.snapshot = snapshot
            return existing
        if not context.effective_permissions.browser_origins:
            raise PolicyDenied("browser_origin_not_authorized")
        permission = self.store.get_permission_state(context.scope)
        before = self.store.get_run(context.run_id)
        with self._lock:
            self._browser_creating.add(context.run_id)
        lease, ready = None, False
        try:
            lease = gateway.create_lease(context, control_sequence=self.store.next_control_sequence(context.scope), permission_epoch=permission["controlEpoch"], title=self.store.get_definition(before.definition_id).title)
            if self.gateway is not gateway:
                raise PolicyDenied("browser_gateway_changed")
            with self._lock:
                self._leases[context.run_id] = lease
                events = self._early_browser_events.pop(context.run_id, [])
            identity = self._capture_browser_identity(context, lease, lease.snapshot)
            self.store.acquire_lease(context.scope, context.run_id, "target:" + lease.lease_id, self.generation,
                datetime.fromtimestamp(lease.snapshot["expiresAt"] / 1000, timezone.utc).isoformat(),
                lease_id=lease.lease_id, identity={"targetId": identity["target_id"],
                    "mainGeneration": identity["main_generation"], "runnerGeneration": identity["runner_generation"],
                    "navigationEpoch": lease.snapshot["navigationEpoch"]})
            for event in events:
                self.browser_event(event)
            current = self.store.get_run(context.run_id)
            if current.state != "running" or current.control_epoch != before.control_epoch or self.store.get_permission_state(context.scope)["revision"] != context.permission_revision:
                gateway.control(lease, "stop", control_sequence=self.store.next_control_sequence(context.scope))
                self.store.release_lease(lease.lease_id, owner_generation=self.generation)
                raise PolicyDenied("browser_creation_cancelled")
            # A lost-target event before response cannot be overwritten by the
            # stale ready response returned by Main's creation call.
            if lease.snapshot.get("state") != "ready":
                raise PolicyDenied("browser_target_lost")
            ready = True
        finally:
            if lease is not None and not ready:
                self._retire_browser_lease(lease)
                try:
                    gateway.control(lease, "stop", control_sequence=self.store.next_control_sequence(context.scope))
                except GatewayError:
                    binding = self.store.get_binding(context.scope)
                    if binding is not None and binding.tombstoned_at is not None:
                        self._revoking_targets.setdefault(context.scope.key, {})[context.run_id] = lease
                with self._lock:
                    if self._leases.get(context.run_id) is lease:
                        self._leases.pop(context.run_id, None)
            with self._lock:
                self._browser_creating.discard(context.run_id)
                self._early_browser_events.pop(context.run_id, None)
        return lease

    @staticmethod
    def _capture_browser_identity(context: RunContext, lease: GatewayLease, snapshot: dict[str, Any]) -> dict[str, str]:
        if (not isinstance(snapshot, dict) or snapshot.get("leaseId") != lease.lease_id
            or snapshot.get("runId") != context.run_id
            or snapshot.get("scope") != context.scope.model_dump(mode="json", by_alias=True)
            or snapshot.get("runnerGeneration") != context.runner_generation):
            raise PolicyDenied("browser_target_identity_invalid")
        identity = {"lease_id": lease.lease_id, "target_id": snapshot.get("targetId"),
            "main_generation": snapshot.get("mainGeneration"), "runner_generation": snapshot.get("runnerGeneration")}
        if not all(isinstance(value, str) and value for value in identity.values()):
            raise PolicyDenied("browser_target_identity_invalid")
        return identity

    def _refresh_action_browser_identity(self, context: RunContext, lease: GatewayLease | None, record: ActionRecord) -> None:
        if record.lease_id is None:
            return
        if lease is None or self.gateway is None:
            raise PolicyDenied("browser_target_identity_unavailable")
        expected = {"lease_id": record.lease_id, "target_id": record.target_id,
            "main_generation": record.main_generation, "runner_generation": record.runner_generation}
        try:
            snapshot = self.gateway.snapshot(lease)
            current = self._capture_browser_identity(context, lease, snapshot)
        except Exception as error:
            raise PolicyDenied("browser_target_identity_unavailable") from error
        if current != expected or snapshot.get("navigationEpoch") != record.navigation_epoch:
            raise PolicyDenied("approval_target_changed")
        try:
            self.store.update_browser_lease_navigation(lease.lease_id, context.run_id, context.scope,
                self.generation, current, snapshot["navigationEpoch"])
            lease.snapshot = snapshot
        except Exception as error:
            raise PolicyDenied("browser_target_identity_unavailable") from error

    def _execute_tool(self, context: RunContext, step_id: str, name: str, args: dict[str, Any]) -> dict[str, Any]:
        spec = validate_tool(name, args)
        self._validate_current(context)
        require_effect(spec, context.effective_permissions)
        run = self.store.get_run(context.run_id)
        if run.counters.tool_calls >= context.budget.max_tool_calls:
            raise PolicyDenied("tool_budget_exhausted")
        self.store.update_counters(run.run_id, tool_calls=1)
        action = None
        lease = None
        if spec.resource_kind == "browser":
            lease = self._browser(context)
            operations = {"independent_browser_navigate": {"kind": "navigate", "url": args.get("url"), "effect": "read"}, "independent_browser_read": {"kind": "read", "effect": "read", **({"selector": args["selector"]} if "selector" in args else {})}, "independent_browser_screenshot": {"kind": "screenshot", "effect": "read"}, "independent_browser_click": {"kind": "click", "selector": args.get("selector"), "effect": "write"}, "independent_browser_type": {"kind": "type", "selector": args.get("selector"), "text": args.get("text"), "effect": "write"}}
            operations.update({
                'independent_browser_extract': {'kind':'read','effect':'read',**({'selector':args['selector']} if 'selector' in args else {})},
                'independent_browser_vision': {'kind':'screenshot','effect':'read'},
            })
            action = operations[name]
            if name == "independent_browser_navigate":
                require_origin(args["url"], context.effective_permissions.browser_origins)
            elif lease.snapshot.get("url") and lease.snapshot["url"] != "about:blank":
                require_origin(lease.snapshot["url"], context.effective_permissions.browser_origins)
        canonical_digest = action_digest(action) if action else digest_json({"tool": name, "args": args, "effect": spec.effect})
        if name in {'independent_browser_extract','independent_browser_vision'}:
            canonical_digest=digest_json({'tool':name,'args':args,'action':action})
        identity = self._capture_browser_identity(context, lease, lease.snapshot) if lease else {}
        record = ActionRecord(action_id=new_id(), run_id=run.run_id, step_id=step_id, scope=run.scope,
            tool_id=name, canonical_args_digest=canonical_digest, intended_effect=spec.effect,
            resource_refs=(lease.lease_id,) if lease else (), authorization_ref=run.dispatch_id,
            permission_revision=context.permission_revision, navigation_epoch=lease.snapshot["navigationEpoch"] if lease else None,
            control_epoch=run.control_epoch, **identity)
        self.store.prepare_action(record)
        if spec.effect != "read":
            self.store.acquire_lease(run.scope, run.run_id, "account:browser:" + run.scope.key, self.generation, "2099-01-01T00:00:00Z")
            approval = ApprovalView(approval_id=new_id(), run_id=run.run_id, scope=run.scope,
                action_id=record.action_id, action_digest=record.canonical_args_digest, effect=spec.effect,
                target_summary=(str(lease.snapshot.get("url", "")) + " " + str(args.get("selector", "")))[:2000],
                permission_revision=record.permission_revision, navigation_epoch=record.navigation_epoch,
                control_epoch=record.control_epoch, lease_id=record.lease_id, target_id=record.target_id,
                main_generation=record.main_generation, runner_generation=record.runner_generation,
                expires_at=(datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat())
            self.store.create_approval(approval)
            self.store.transition_run(run.run_id, "waiting_for_approval", expected_revision=self.store.get_run(run.run_id).state_revision, waiting_for=WaitingFor(kind="approval", resource_id=approval.approval_id, expires_at=approval.expires_at))
            self._leave_compute(run.run_id)
            self._safe_boundary(run.run_id)
            decided = self.store.get_approval(approval.approval_id)
            if decided.state != "approved":
                raise PolicyDenied("approval_not_granted")
            if lease:
                self._refresh_action_browser_identity(context, lease, record)
            approval_id = approval.approval_id
        else:
            approval_id = None
        self._validate_current(context)
        if lease:
            self._refresh_action_browser_identity(context, lease, record)
        self.store.claim_action(record.action_id, expected_permission_revision=context.permission_revision, expected_control_epoch=run.control_epoch, approval_id=approval_id)
        retries = context.budget.max_safe_read_retries if name in {"independent_browser_read", "independent_browser_screenshot", "independent_file_read"} else 0
        for attempt in range(retries + 1):
            active_record = record
            if attempt:
                active_record = record.model_copy(update={"action_id": new_id(), "attempt": attempt + 1, "state": "prepared"})
                self._safe_boundary(run.run_id)
                self._validate_current(context)
                self.store.prepare_action(active_record)
                self.store.claim_action(active_record.action_id, expected_permission_revision=context.permission_revision, expected_control_epoch=run.control_epoch)
            self.store.finish_action(active_record.action_id, "dispatched")
            try:
                managed = self._governance(context)
                boundary = getattr(self.governance_admission, "action_boundary", None)
                if managed and boundary is None:
                    raise PolicyDenied("nova_action_adapter_required")
                with boundary(context, active_record, args, approval_id) if managed else nullcontext():
                    self._validate_current(context)
                    if action:
                        self._refresh_action_browser_identity(context, lease, active_record)
                        result = self.gateway.execute(lease, action,
                            control_sequence=self.store.next_control_sequence(context.scope),
                            permission_epoch=self.store.get_permission_state(context.scope)["controlEpoch"],
                            allow_mutation=spec.effect != "read", expected_identity={
                                "lease_id": active_record.lease_id, "target_id": active_record.target_id,
                                "main_generation": active_record.main_generation,
                                "runner_generation": active_record.runner_generation,
                                "scope": active_record.scope.model_dump(mode="json", by_alias=True),
                                "navigation_epoch": active_record.navigation_epoch})
                        if name in {'independent_browser_extract','independent_browser_vision'}:
                            from web.api.independent import consume_local_ai_tool
                            result=consume_local_ai_tool(self,context,name,args,source=result,lease=lease,
                                source_epoch=lease.snapshot['navigationEpoch'])
                    elif name=='independent_memory_recall':
                        from web.api.independent import consume_local_ai_tool
                        result=consume_local_ai_tool(self,context,name,args)
                    else:
                        result = read_authorized_file(args["path"], context.allowed_workspace_roots, args.get("maxBytes", 262144))
                ref = self._write_artifact(context, "action", result)
                self.store.finish_action(active_record.action_id, "succeeded", result_ref=ref)
                self.store.save_checkpoint(run.run_id, {"summary": "Tool completed: " + name}, journal_watermark=active_record.action_id)
                if spec.effect != "read":
                    self._release_account_after_known_result(run.run_id)
                if len(canonical_json(result).encode("utf-8")) > 800000:
                    return {"artifactRef": ref, "omittedLargePayload": True}
                return result
            except GatewayError as exc:
                state = "unknown" if exc.in_flight and spec.effect != "read" else "failed"
                self.store.finish_action(active_record.action_id, state, error_code=exc.code)
                if attempt >= retries or not exc.retryable:
                    raise
                # A bounded safe-read backoff cannot hold a DB/scopelock.
                if self._stop.wait((1, 3)[attempt]):
                    raise PolicyDenied("app_shutdown")
            except (PolicyDenied, OSError):
                self.store.finish_action(active_record.action_id, "failed", error_code="tool_failed")
                raise
        raise PolicyDenied("read_retry_exhausted")

    def _release_account_after_known_result(self, run_id: str):
        if any(action.intended_effect != "read" and action.state in {"claimed", "dispatched", "unknown"} for action in self.store.list_actions(run_id)):
            return
        for lease in self.store.list_leases(run_id=run_id):
            if lease["resourceKey"].startswith("account:"):
                self.store.release_lease(lease["leaseId"], owner_generation=self.generation)

    def control(self, run_id: str, command: str, *, expected_revision: int, client_request_id: str | None = None, answer: str | None = None, question_identity: str | None = None, control_epoch: int | None = None, actor_ref: str | None = None, expected_scope: Scope | None = None, expected_permission_revision: int | None = None, expected_permission_epoch: int | None = None) -> RunView:
        with self._lock:
            gate = self._control_locks.setdefault(run_id, threading.RLock())
        with gate:
            return self._control_request(run_id, command, expected_revision=expected_revision,
                client_request_id=client_request_id, answer=answer, question_identity=question_identity, control_epoch=control_epoch, actor_ref=actor_ref,
                expected_scope=expected_scope, expected_permission_revision=expected_permission_revision, expected_permission_epoch=expected_permission_epoch)

    def _control_request(self, run_id: str, command: str, *, expected_revision: int, client_request_id: str | None, answer: str | None, question_identity: str | None, control_epoch: int | None, actor_ref: str | None, expected_scope: Scope | None, expected_permission_revision: int | None, expected_permission_epoch: int | None) -> RunView:
        current = self.store.get_run(run_id)
        if current is None:
            raise StoreError("Unknown run")
        request = {"runId": run_id, "command": command, "expectedRevision": expected_revision, "answer": answer,
            "questionIdentity": question_identity, "controlEpoch": control_epoch, "actorRef": actor_ref}
        guards = {"expected_scope": expected_scope, "expected_permission_revision": expected_permission_revision,
            "expected_permission_epoch": expected_permission_epoch}
        if any(value is not None for value in guards.values()):
            if expected_scope is None or type(expected_permission_revision) is not int or type(expected_permission_epoch) is not int:
                raise PolicyDenied("control_scope_permission_binding_required")
            if current.scope != expected_scope or not isinstance(actor_ref, str) or not actor_ref.startswith("user:"):
                raise PolicyDenied("control_human_scope_required")
            request.update(expectedScope=expected_scope.model_dump(mode="json", by_alias=True),
                expectedPermissionRevision=expected_permission_revision, expectedPermissionEpoch=expected_permission_epoch)
        if command == "answer":
            # Validation, answer checkpoint, state CAS and request idempotency
            # commit together. No browser/provider I/O occurs in this claim.
            with self.store.transaction():
                if client_request_id:
                    cached = self.store.get_request_result(current.scope, "manager_control", client_request_id, request)
                    if cached is not None:
                        return RunView.model_validate(cached)
                result = self._control(run_id, command, expected_revision=expected_revision, answer=answer,
                    question_identity=question_identity, control_epoch=control_epoch, actor_ref=actor_ref, **guards)
                if client_request_id:
                    self.store.record_request_result(current.scope, "manager_control", client_request_id, request, result)
            with self._condition:
                self._condition.notify_all()
            return result
        if client_request_id:
            cached = self.store.get_request_result(current.scope, "manager_control", client_request_id, request)
            if cached is not None:
                return RunView.model_validate(cached)
        result = self._control(run_id, command, expected_revision=expected_revision, answer=answer,
            control_epoch=control_epoch, **guards)
        if client_request_id:
            self.store.record_request_result(current.scope, "manager_control", client_request_id, request, result)
        return result

    def _control(self, run_id: str, command: str, *, expected_revision: int, answer: str | None = None, question_identity: str | None = None, control_epoch: int | None = None, actor_ref: str | None = None, expected_scope: Scope | None = None, expected_permission_revision: int | None = None, expected_permission_epoch: int | None = None) -> RunView:
        run = self.store.get_run(run_id)
        if not run:
            raise StoreError("Unknown run")
        if run.state_revision != expected_revision:
            raise RevisionConflict("Run state changed")
        if command != "answer" and control_epoch is not None and (type(control_epoch) is not int or run.control_epoch != control_epoch):
            raise RevisionConflict("Run control epoch changed")
        guards = {"expected_scope": expected_scope, "expected_permission_revision": expected_permission_revision,
            "expected_permission_epoch": expected_permission_epoch}
        self.resolver.resolve(run.scope)
        if command == "answer":
            if not isinstance(actor_ref, str) or not actor_ref.startswith("user:") or len(actor_ref) > 256 or len(actor_ref) <= 5 or any(ord(char) < 32 for char in actor_ref):
                raise PolicyDenied("clarification_human_actor_required")
            checkpoint = self.store.latest_checkpoint(run_id)
            if run.state != "waiting_for_user" or run.waiting_for is None or run.waiting_for.kind != "clarification":
                raise PolicyDenied("clarification_not_current")
            if type(control_epoch) is not int or control_epoch != run.control_epoch:
                raise PolicyDenied("clarification_control_epoch_stale")
            if checkpoint is None or checkpoint["checkpointId"] != question_identity or not isinstance(checkpoint["state"].get("question"), str) or not checkpoint["state"]["question"].strip():
                raise PolicyDenied("clarification_question_stale")
            if not isinstance(answer, str) or not answer.strip() or len(answer) > 16000:
                raise PolicyDenied("clarification_answer_invalid")
            self.store.save_checkpoint(run_id, {"summary": "User clarification received", "questionIdentity": question_identity,
                "question": checkpoint["state"]["question"], "answer": answer, "actorRef": actor_ref})
            result = self.store.transition_run(run_id, "queued", expected_revision=expected_revision,
                expected_control_epoch=control_epoch, **guards)
            return result
        if command == "pause":
            with self.store.transaction():
                if run.state == "queued" and run_id not in self._workers:
                    # The complete no-I/O claim rolls back on any stale scope,
                    # permission or run epoch. No rejected checkpoint remains.
                    self.store.transition_run(run_id, "running", expected_revision=run.state_revision, expected_control_epoch=control_epoch, **guards)
                    self.store.save_checkpoint(run_id, {"summary": "Paused before first dispatch"})
                    run = self.store.get_run(run_id)
                result = self.store.transition_run(run_id, "pausing", expected_revision=run.state_revision, expected_control_epoch=control_epoch, **guards)
                if run_id not in self._workers:
                    self.store.save_checkpoint(run_id, {"summary": "Paused before first dispatch"})
                    result = self.store.transition_run(run_id, "paused", expected_revision=result.state_revision, expected_control_epoch=control_epoch, **guards)
            lease = self._leases.get(run_id)
            if lease and self.gateway:
                self.gateway.control(lease, "pause", control_sequence=self.store.next_control_sequence(run.scope))
            return result
        if command == "resume":
            if answer is not None or run.state == "waiting_for_user" and run.waiting_for and run.waiting_for.kind == "clarification":
                raise PolicyDenied("clarification_question_identity_required")
            if run.state == "waiting_for_approval":
                approval_id = run.waiting_for.resource_id if run.waiting_for else None
                approval = self.store.get_approval(approval_id) if approval_id else None
                if approval is None or approval.state != "approved":
                    raise PolicyDenied("approval_not_granted")
            result = self.store.transition_run(run_id, "queued", expected_revision=expected_revision, expected_control_epoch=control_epoch, **guards)
            with self._condition:
                self._condition.notify_all()
            return result
        if command in {"cancel", "stop"}:
            result = self.store.transition_run(run_id, "cancelling", expected_revision=expected_revision, expected_control_epoch=control_epoch, **guards)
            self._close_browser(run_id)
            with self._condition:
                self._condition.notify_all()
            handle = self._workers.get(run_id)
            if handle:
                handle.terminate(grace_seconds=5, hard_seconds=15)
            self._leave_compute(run_id)
            current = self.store.get_run(run_id)
            for action in self.store.list_actions(run_id):
                if action.state in {"claimed", "dispatched"}:
                    self.store.finish_action(action.action_id, "unknown", error_code="cancelled_in_flight")
            if current.state == "cancelling":
                return self.store.transition_run(run_id, "cancelled", expected_revision=current.state_revision)
            return current
        raise PolicyDenied("unknown_control_command")

    def revoke(self, scope: Scope, *, expected_revision: int) -> dict[str, Any]:
        self.resolver.resolve(scope)
        state = self.store.revoke_permissions(scope, expected_revision=expected_revision)
        file_ack = self.stop_native_file_effects(scope, reason="permission_revoked")
        browser_ack = self.stop_native_browser_effects(scope, reason="permission_revoked")
        if not file_ack["acknowledged"] or not browser_ack["acknowledged"]:
            state.update(acknowledged=False, state="revoking")
        acknowledgements = []
        for run in self.store.list_runs(scope, include_terminal=False):
            lease = self._leases.get(run.run_id)
            if lease and self.gateway:
                try:
                    self.gateway.control(lease, "revoke", control_sequence=self.store.next_control_sequence(scope), permission_epoch=state["controlEpoch"])
                    acknowledgements.append(run.run_id)
                except GatewayError:
                    state["acknowledged"] = False
                    state["state"] = "revoking"
            self._interrupt(run.run_id, "permission_revoked")
        if "acknowledged" not in state:
            state.update(acknowledged=True, state="revoked")
        state["acknowledgedRuns"] = acknowledgements
        return state

    def revoke_connections(self, scope: Scope) -> dict[str, Any]:
        """Acknowledge a repository revocation; its epoch already committed."""
        self.resolver.resolve(scope)
        state = {**self.store.get_permission_state(scope), "acknowledged": True, "state": "revoked"}
        file_ack = self.stop_native_file_effects(scope, reason="connection_revoked")
        browser_ack = self.stop_native_browser_effects(scope, reason="connection_revoked")
        if not file_ack["acknowledged"] or not browser_ack["acknowledged"]:
            state.update(acknowledged=False, state="revoking")
        acknowledged = []
        # Include targets of already interrupted runs: a prior transport loss
        # must not turn the next request into an acknowledged no-op.
        pending = self._revoking_targets.setdefault(scope.key, {})
        for run in self.store.list_runs(scope):
            lease = self._leases.get(run.run_id) or pending.get(run.run_id)
            if lease:
                if self.gateway is None:
                    state.update(acknowledged=False, state="revoking")
                    pending[run.run_id] = lease
                else:
                    try:
                        self.gateway.control(lease, "revoke", control_sequence=self.store.next_control_sequence(scope), permission_epoch=state["controlEpoch"])
                        acknowledged.append(run.run_id)
                        pending.pop(run.run_id, None)
                    except GatewayError:
                        state.update(acknowledged=False, state="revoking")
                        pending[run.run_id] = lease
            self._interrupt(run.run_id, "connection_revoked")
        state["acknowledgedRuns"] = acknowledged
        return state

    def retire_scope(self, scope: Scope, *, expected_revision: int) -> dict[str, Any]:
        """Revoke the durable scope before stopping its real runtime owners.

        A retry uses the existing tombstone and retained target handles. It
        must not resolve a deleted native Space, mint new authority or treat a
        missing gateway as an acknowledgement of an earlier lost revoke.
        """
        with self.store.transaction():
            binding = self.store.get_binding(scope)
            profile = self.store.get_profile_ref(scope.backend_profile_id)
            if binding is None or profile is None or scope.backend_profile_id != self.store.backend_profile_id:
                raise PolicyDenied("scope_binding_not_found")
            if binding.tombstoned_at is None:
                for definition in self.store.list_definitions(scope):
                    if definition.enabled:
                        disabled = definition.model_copy(update={"enabled": False, "revision": definition.revision + 1})
                        self.store.put_definition(disabled, expected_revision=definition.revision)
                        self.store.put_outbox(f"schedule:{disabled.definition_id}:{disabled.revision}", scope,
                            "schedule_projection", {"definitionId": disabled.definition_id, "definitionRevision": disabled.revision})
                binding = self.store.tombstone_binding(scope, expected_revision=expected_revision)
            elif expected_revision not in {binding.revision, binding.revision - 1}:
                raise RevisionConflict("Retired scope binding revision changed")
            for run in self.store.list_runs(scope):
                for action in self.store.list_actions(run.run_id):
                    if action.state in {"claimed", "dispatched"}:
                        self.store.finish_action(action.action_id, "unknown", error_code="space_deleted")
            permission = self.store.get_permission_state(scope)
        file_ack = self.stop_native_file_effects(scope, reason="space_deleted")
        browser_ack = self.stop_native_browser_effects(scope, reason="space_deleted")
        runs = self.store.list_runs(scope)
        pending = self._revoking_targets.setdefault(scope.key, {})
        with self._lock:
            for run in runs:
                lease = self._leases.get(run.run_id)
                if lease is not None:
                    pending[run.run_id] = lease
            creating = {run.run_id for run in runs if run.run_id in self._browser_creating}
            projections = tuple((context, handle) for context, handle in self._projection_handles.values() if context.scope == scope)
        for _, handle in projections:
            handle.terminate(grace_seconds=.25, hard_seconds=2)
        from .scheduling import IndependentScheduleAdapter
        pending_definitions = IndependentScheduleAdapter(lambda: ()).retire_scope(self, scope)
        acknowledged = []
        for run in runs:
            from web.api.independent import local_ai_core_release_ready
            if local_ai_core_release_ready(self,run.run_id):ComputeAdmission.release(run.run_id)
            handle = self._workers.get(run.run_id)
            if handle is not None:
                handle.terminate(grace_seconds=.25, hard_seconds=2)
            lease = pending.get(run.run_id)
            if lease is None or self.gateway is None:
                continue
            try:
                self.gateway.control(lease, "revoke", control_sequence=self.store.next_control_sequence(scope),
                    permission_epoch=permission["controlEpoch"])
            except GatewayError:
                continue
            pending.pop(run.run_id, None)
            acknowledged.append(run.run_id)
            with self._lock:
                if self._leases.get(run.run_id) is lease:
                    self._retire_browser_lease(lease)
                    self._leases.pop(run.run_id, None)
        with self._condition:
            self._condition.notify_all()
        waiting = sorted(set(pending) | creating)
        return {"scope": scope.model_dump(mode="json", by_alias=True), "bindingRevision": binding.revision,
            "permissionRevision": permission["revision"], "controlEpoch": permission["controlEpoch"],
            "acknowledged": not waiting and not pending_definitions and file_ack["acknowledged"] and browser_ack["acknowledged"], "state": "revoking" if waiting or pending_definitions or not file_ack["acknowledged"] or not browser_ack["acknowledged"] else "retired",
            "acknowledgedRuns": acknowledged, "pendingRuns": waiting, "pendingDefinitions": list(pending_definitions)}

    def _close_browser(self, run_id: str):
        with self._lock:
            lease = self._leases.pop(run_id, None)
            if lease:
                self._retire_browser_lease(lease)
        if lease:
            run = self.store.get_run(run_id)
            binding = self.store.get_binding(run.scope)
            if binding is not None and binding.tombstoned_at is not None:
                # Retirement requires a real revoke acknowledgement. Terminal
                # DB state or a lost stop response cannot erase its retry handle.
                self._revoking_targets.setdefault(run.scope.key, {})[run_id] = lease
                return
            if self.gateway is None:
                return
            try:
                self.gateway.control(lease, "stop", control_sequence=self.store.next_control_sequence(run.scope))
            except GatewayError:
                # Target IDs remain diagnostic only; fail closed in journal.
                pass

    def _retire_browser_lease(self, lease):
        with self._lock:
            now = time.monotonic()
            self._retired_browser_leases = {key: value for key, value in self._retired_browser_leases.items() if value[0] >= now}
            if len(self._retired_browser_leases) >= 256:
                oldest = next(iter(self._retired_browser_leases))
                self._retired_browser_leases.pop(oldest)
            identity = {key: lease.snapshot.get(key) for key in ("leaseId", "runId", "scope", "mainGeneration", "runnerGeneration")}
            self._retired_browser_leases[lease.lease_id] = (now + 120, identity)

    def _interrupt(self, run_id: str, reason: str):
        with self.store.transaction():
            current = self.store.get_run(run_id)
            if not current or current.state in TERMINAL_STATES:
                return
            for action in self.store.list_actions(run_id):
                if action.state in {"claimed", "dispatched"}:
                    self.store.finish_action(action.action_id, "unknown", error_code=reason)
            self._leave_compute(run_id)
            self.store.transition_run(run_id, "interrupted", expected_revision=current.state_revision, reason_code=reason, force_recovery=True)
        with self._condition:
            self._condition.notify_all()
        handle = self._workers.get(run_id)
        if handle:
            handle.terminate(grace_seconds=0.25, hard_seconds=2)
        self._close_browser(run_id)

    def _fail(self, run_id: str, reason: str):
        with self.store.transaction():
            current = self.store.get_run(run_id)
            if not current or current.state in TERMINAL_STATES or current.state == "cancelling":
                return
            for action in self.store.list_actions(run_id):
                if action.state in {"claimed", "dispatched"}:
                    self.store.finish_action(action.action_id, "unknown", error_code=reason)
            self._leave_compute(run_id)
            self._release_account_after_known_result(run_id)
            self.store.transition_run(run_id, "failed", expected_revision=current.state_revision, reason_code=reason[:128])

    def _write_artifact(self, context: RunContext, kind: str, value: Any) -> str:
        directory = Path(context.resolved_profile_home) / "state" / "independent-artifacts" / context.run_id
        directory.mkdir(parents=True, exist_ok=True)
        if not directory.resolve().is_relative_to(Path(context.resolved_profile_home).resolve()):
            raise PolicyDenied("artifact_root_changed")
        path = directory / (kind + "-" + new_id() + ".json")
        temporary = path.with_suffix(".partial")
        data = canonical_json(value).encode("utf-8")
        if len(data) > 16 * 1024 * 1024:
            raise PolicyDenied("result_artifact_too_large")
        try:
            with temporary.open("xb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
        return str(path)

    def _deliver_outbox(self):
        for item in self.store.pending_outbox():
            if item["kind"] != "terminal_result":
                continue
            run = self.store.get_run(item["payload"]["runId"])
            context = self.store.get_run_context(run.run_id)
            binding = self.store.get_binding(run.scope)
            if binding is None or binding.tombstoned_at is not None:
                # The recipient was intentionally retired. Retain its artifact
                # and explicit failed delivery; never recreate a deleted chat.
                self.store.finish_outbox(item["deliveryKey"], success=False, error_code="scope_retired",
                    terminal=True)
                continue
            try:
                if run.run_id in self._workers:
                    continue
                finish = getattr(self.governance_admission, "finish", None)
                if finish is not None:
                    finish(context)
                resolved = self.resolver.validate_context(context)
                result = {}
                if run.result_ref:
                    path = Path(run.result_ref).resolve(strict=True)
                    if not path.is_relative_to(Path(context.resolved_profile_home).resolve()):
                        raise PolicyDenied("result_scope_mismatch")
                    result = json.loads(path.read_text("utf-8"))
                response = str(result.get("response") or result.get("final_response") or run.reason_code or run.state)
                progress = self.store.get_run_progress(run.run_id)
                self._run_projection(context, {"mode": "update_session", "nativeSlug": resolved.binding.native_slug, "targetSessionId": run.target_session_id, "deliveryKey": item["deliveryKey"], "status": run.state, "stateRevision": run.state_revision, "resultRef": run.result_ref, "reasonCode": run.reason_code, "response": response,
                    "partialProgress": progress.model_dump(mode="json", by_alias=True) if progress is not None else None})
                with self.store.transaction():
                    assistant = self.store.ensure_assistant(run.scope)
                    callback = {"id": new_id(), "role": "assistant", "content": response[:1000], "runId": run.run_id, "dispatchId": run.dispatch_id, "targetSessionId": run.target_session_id, "deliveryKey": item["deliveryKey"], "status": run.state, "at": utc_now()}
                    if not any(message.get("deliveryKey") == item["deliveryKey"] for message in assistant.messages):
                        self.store.update_assistant(run.scope, assistant.revision, lambda state: state.model_copy(update={"messages": (*state.messages, callback)}))
                    self.store.append_event(run.scope, "result", {"runId": run.run_id, "status": run.state, "resultRef": run.result_ref, "targetSessionId": run.target_session_id, "deliveryKey": item["deliveryKey"]})
                    self.store.finish_outbox(item["deliveryKey"], success=True)
                    if progress is not None:
                        self.store.finish_outbox("progress:" + run.run_id, success=True)
            except (StoreError, WorkerError, OSError, PolicyDenied, ScopeError):
                delay = (1, 3, 10, 30, 60)[min(item["attempts"], 4)]
                next_at = (datetime.now(timezone.utc) + timedelta(seconds=delay)).isoformat().replace("+00:00", "Z")
                self.store.finish_outbox(item["deliveryKey"], success=False, error_code="result_projection_failed", next_attempt_at=next_at)

    def activity(self, scope: Scope) -> ActivitySnapshot:
        from .native_activity import observe_native_activity
        resolved = self.resolver.resolve(scope)
        return observe_native_activity(resolved, self.store.activity_snapshot(scope))

    def _acquire_interactive(self, context: RunContext, cancel_event: threading.Event | None) -> None:
        """Bound both running workers and callers waiting for their release."""
        def check_cancelled():
            if self._stop.is_set() or (cancel_event is not None and cancel_event.is_set()):
                raise PolicyDenied("assistant_turn_cancelled")

        check_cancelled()
        if self._interactive_slots.acquire(blocking=False):
            return
        if not self._interactive_waiters.acquire(blocking=False):
            raise ResourceBusy("Interactive assistant queue is busy")
        deadline = time.monotonic() + min(self._interactive_wait_seconds, context.budget.provider_timeout_seconds)
        try:
            while True:
                check_cancelled()
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise ResourceBusy("Interactive assistant queue is busy")
                if self._interactive_slots.acquire(timeout=min(0.1, remaining)):
                    return
        finally:
            self._interactive_waiters.release()

    def run_interactive(self, context: RunContext, payload: dict[str, Any], *, on_delta: Callable[[str], None] | None = None, cancel_event: threading.Event | None = None) -> dict[str, Any]:
        if payload.get("mode") not in {"assistant", "interview", "model_catalog", "connection_configure"}:
            raise PolicyDenied("invalid_interactive_mode")
        if payload.get("mode") != "model_catalog":
            self._require_independent_model(context.provider)
        started_at = time.monotonic()
        self._acquire_interactive(context, cancel_event)
        handle = None
        requests, tokens = 0, 0
        try:
            if self._stop.is_set() or (cancel_event is not None and cancel_event.is_set()):
                raise PolicyDenied("assistant_turn_cancelled")
            captured = provider_configuration_digest(Path(context.resolved_profile_home))
            self.resolver.validate_context(context)
            self._validate_connections(context)
            deadline = started_at + context.budget.provider_timeout_seconds
            if time.monotonic() >= deadline:
                raise PolicyDenied("assistant_turn_timeout")
            handle = self.worker_factory(context).start(payload={**payload, "providerConfigurationDigest": captured})
            while time.monotonic() < deadline:
                if self._stop.is_set() or (cancel_event is not None and cancel_event.is_set()):
                    raise PolicyDenied("assistant_turn_cancelled")
                event = handle.read_event(timeout=0.1)
                if not event:
                    if not handle.is_alive:
                        raise WorkerError("assistant_worker_ended")
                    continue
                if event.get("kind") == "request":
                    kind = event.get("requestKind")
                    self.resolver.validate_context(context)
                    self._validate_connections(context)
                    if provider_configuration_digest(Path(context.resolved_profile_home)) != captured:
                        raise PolicyDenied("provider_connection_changed")
                    if kind == "provider_request":
                        requests += 1
                        if requests > context.budget.max_provider_requests:
                            raise PolicyDenied("provider_request_budget_exhausted")
                    elif kind == "usage":
                        value = event.get("measuredTokens")
                        if type(value) is not int or value < 0:
                            raise PolicyDenied("invalid_token_usage")
                        tokens += value
                        if tokens >= context.budget.max_measured_tokens:
                            raise PolicyDenied("measured_token_budget_exhausted")
                    else:
                        raise PolicyDenied("assistant_tools_not_authorized")
                    handle.send({"kind": "reply", "requestId": event["requestId"], "value": {"authorized": True}})
                elif event.get("kind") == "delta" and on_delta:
                    on_delta(str(event.get("delta", ""))[:16000])
                elif event.get("kind") == "result":
                    return event.get("value") or {}
                elif event.get("kind") in {"error", "eof"}:
                    code = str(event.get("code") or "assistant_worker_ended")
                    if event.get("kind") == "eof":
                        code += "_" + handle.safe_exit_diagnostic()
                    raise WorkerError(code)
            raise PolicyDenied("assistant_turn_timeout")
        finally:
            try:
                if handle:
                    handle.terminate(grace_seconds=0.25, hard_seconds=2)
            finally:
                self._interactive_slots.release()
