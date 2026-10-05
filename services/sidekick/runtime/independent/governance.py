"""Admission adapters for existing engines; no parallel governance ledger."""
from __future__ import annotations

import threading
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
import weakref

from .contracts import RunContext, TERMINAL_STATES, digest_json
from .policy import PolicyDenied

_MANAGERS = weakref.WeakValueDictionary()
_MANAGERS_LOCK = threading.RLock()


class LegacyComputeLease:
    """Actual same-host Swarm/Cron compute, released at safe wait points.

    These process-local resource slots do not replace Nova capability checks,
    workflow quorum, project execution claims or durable supervisor admission.
    Separate CLI processes require an app-wide host before sharing this pool.
    """
    def __init__(self, owner_key: str, *, scope_key: str | None = None, scope_keys=()):
        self.owner_key, self.scope_key = owner_key, scope_key
        self.scope_keys = tuple(scope_keys)

    def wait_acquire(self, cancelled: threading.Event | None = None) -> bool:
        from .manager import ComputeAdmission
        cancellation = cancelled or threading.Event()
        while not cancellation.is_set():
            if ComputeAdmission.acquire_legacy(self.owner_key, scope_key=self.scope_key, scope_keys=self.scope_keys):
                return True
            cancellation.wait(0.1)
        return False

    def release(self):
        from .manager import ComputeAdmission
        ComputeAdmission.release(self.owner_key)


class ManagedBrowserAdmission:
    """Native Nova admission at the immutable profile/project boundary."""
    def __init__(self, supervisor=None):
        self.manager = None
        self.supervisor = supervisor
        self._authorities = {}
        self._lock = threading.RLock()

    def bind(self, manager):
        if self.manager is not None and self.manager is not manager:
            raise TypeError("Governance adapter belongs to one profile manager")
        self.manager = manager
        if self.supervisor is None:
            from nova.space_supervisor import ManagedSpaceSupervisor
            self.supervisor = ManagedSpaceSupervisor(
                ledger_path=manager.store.profile_home / "state" / "nova-space-supervisor.sqlite",
                governance_resolver=self._resolve_target)
        with _MANAGERS_LOCK:
            _MANAGERS[id(manager)] = manager

    def _resolve_target(self, target):
        from nova.space_supervisor import ManagedSpaceGovernance
        from web.api.space_engine import list_nova_management_audit, nova_enrollment_readiness
        bindings = [row for row in self.manager.store.list_bindings() if row.native_slug == target]
        if not bindings:
            raise PolicyDenied("nova_project_scope_unavailable")
        results = []
        for binding in bindings:
            resolved = self.manager.resolver.resolve(binding.scope)
            if not binding.workspace_locator:
                raise PolicyDenied("nova_registered_project_required")
            root = Path(binding.workspace_locator).resolve(strict=True)
            config = resolved.space.load_config()
            configured = config.get("project_dir")
            if not root.is_dir() or not configured or Path(configured).resolve(strict=True) != root:
                raise PolicyDenied("nova_project_scope_mismatch")
            readiness = nova_enrollment_readiness(resolved.space, trusted_project_root=root)
            if readiness.get("state") != "enrolled":
                raise PolicyDenied("nova_governance_not_enrolled")
            audit = list_nova_management_audit(resolved.space)
            if not audit:
                raise PolicyDenied("nova_audit_evidence_required")
            management = config["nova_management"]
            results.append(ManagedSpaceGovernance.from_values(space_id=binding.scope.space_id,
                canonical_root=root, root_fingerprint=audit[-1].get("root_fingerprint"),
                yolo=management["yolo"], enrolled=management["enrolled"], revision=management["revision"],
                policy_identity="space-governance:" + str(management["revision"])))
        if any(value != results[0] for value in results[1:]):
            raise PolicyDenied("nova_project_scope_ambiguous")
        return results[0]

    def prepare(self, context):
        """Read-only preflight; no capability or model/tool dispatch yet."""
        if self.manager is None or not isinstance(context, RunContext):
            return False
        resolved = self.manager.resolver.validate_context(context)
        governance = self._resolve_target(resolved.binding.native_slug)
        return governance.space_id == context.scope.space_id

    def __call__(self, context) -> bool:
        try:
            if not self.prepare(context):
                return False
        except PolicyDenied:
            with self._lock:
                authority = self._authorities.get(context.run_id) if isinstance(context, RunContext) else None
                if authority is not None:
                    self.supervisor._pause(authority.capability, "governance_revoked")
            raise
        run = self.manager.store.get_run(context.run_id)
        if run is None or run.state in TERMINAL_STATES or self.manager.store.get_run_context(context.run_id) != context:
            return False
        with self._lock:
            authority = self._authorities.get(context.run_id)
            if authority is None:
                from swarm_core.config import load_project_config, SwarmProjectNotInitializedError
                resolved = self.manager.resolver.validate_context(context)
                governance = self._resolve_target(resolved.binding.native_slug)
                try:
                    autonomy = load_project_config(governance.canonical_root).default_autonomy
                except SwarmProjectNotInitializedError:
                    autonomy = "reviewed_execution"
                captured = {"runId": context.run_id, "scope": context.scope.model_dump(mode="json", by_alias=True),
                    "contextDigest": digest_json(context), "runnerGeneration": context.runner_generation,
                    "model": context.provider.model, "callBudget": min(48, context.budget.max_provider_requests),
                    "autonomy": autonomy}
                definition = self.manager.store.get_definition(run.definition_id, run.definition_revision)
                admission = self.supervisor.admit_independent_browser(resolved.binding.native_slug,
                    {"goal": definition.instruction, "runId": run.run_id, "contextDigest": captured["contextDigest"]}, binding=captured)
                if admission.capability is None:
                    if admission.reason == "active_limit":
                        from .store import ResourceBusy
                        raise ResourceBusy("Native Nova supervisor slot is occupied")
                    raise PolicyDenied("nova_" + str(admission.reason or "capability_recovery_required"))
                authority = _BrowserAuthority(admission.capability, governance.canonical_root,
                    admission.run_id, captured["contextDigest"], captured["callBudget"])
                self._authorities[context.run_id] = authority
                if not self.supervisor.start_admitted_run(admission.capability, dispatcher=lambda *_: True):
                    raise PolicyDenied("nova_browser_start_rejected")
            if authority.context_digest != digest_json(context):
                raise PolicyDenied("nova_immutable_context_changed")
            action_context = self.supervisor.resolve_action_context(authority.capability)
            return action_context is not None and action_context.allowed_action_families == ("independent_browser",)

    def claim_provider(self, context, request_id):
        from swarm_core.store import ProjectSwarmStore
        from swarm_core.workflow import CallBudget, WorkflowPaused
        with self._lock:
            if not self(context):
                raise PolicyDenied("nova_capability_not_current")
            authority = self._authorities[context.run_id]
            store = ProjectSwarmStore(authority.project_root)
            events = store.list_events(authority.native_run_id)
            if any(event.event_type == "model.attempt_started" and event.payload.get("independentRequestId") == request_id for event in events):
                raise PolicyDenied("nova_provider_request_already_claimed")
            used = sum(event.event_type == "model.attempt_started" for event in events)
            try:
                CallBudget(authority.call_budget, initial_used=used).claim(role="builder", attempted_models=())
            except WorkflowPaused as exc:
                raise PolicyDenied("nova_role_call_budget_exhausted") from exc
            store.append_event_once(authority.native_run_id, "model.attempt_started",
                {"role": "builder", "model": context.provider.model, "independentRunId": context.run_id,
                 "contextDigest": authority.context_digest, "independentRequestId": request_id}, idempotency_key="independent-provider:" + request_id)

    @contextmanager
    def action_boundary(self, context, record, args, approval_id):
        from swarm_core.policy import PolicyGate, PolicyStatus, proposal_digest
        from swarm_core.store import ProjectSwarmStore
        from swarm_core.types import ActionProposal, RequestedToolAction
        from web.api.space_engine import space_config_lock
        resolved = self.manager.resolver.validate_context(context)
        # The native enrollment/revocation transaction uses this same bounded,
        # cross-process lock. Its order is claim -> dispatch -> acknowledge.
        with space_config_lock(resolved.space), self._lock, self.supervisor.independent_action_boundary():
            if not self(context):
                raise PolicyDenied("nova_capability_not_current")
            authority = self._authorities[context.run_id]
            if record.tool_id == "independent_file_read" and not Path(args["path"]).resolve(strict=True).is_relative_to(authority.project_root):
                raise PolicyDenied("nova_file_outside_registered_project")
            store = ProjectSwarmStore(authority.project_root)
            run = store.get_run(authority.native_run_id)
            checkpoints = store.get_workflow_role_checkpoints(run.run_id)
            verifier = checkpoints.get("verifier")
            evidence = tuple(verifier.data.get("evidence", ())) if verifier else ()
            proposal = ActionProposal(proposal_id="independent:" + record.action_id, category="independent_browser",
                reversible=record.intended_effect == "read", external=record.intended_effect != "read", cost_increasing=False,
                evidence_refs=evidence, requested_action=RequestedToolAction(name="independent_browser." + record.tool_id,
                    workspace=authority.project_root, arguments={"scope": context.scope.model_dump(mode="json", by_alias=True),
                    "contextDigest": authority.context_digest, "actionDigest": record.canonical_args_digest,
                    "permissionRevision": context.permission_revision, "controlEpoch": record.control_epoch}))
            if approval_id:
                approval = self.manager.store.get_approval(approval_id)
                claimed = self.manager.store.get_action(record.action_id)
                if approval is None or approval.state != "consumed" or claimed is None or claimed.state not in {"claimed", "dispatched"} or claimed.approval_id != approval_id or claimed.run_id != context.run_id or claimed.scope != context.scope or approval.run_id != context.run_id or approval.scope != context.scope or not (approval.actor_ref or "").startswith("user:") or approval.action_digest != record.canonical_args_digest or claimed.canonical_args_digest != record.canonical_args_digest or approval.effect != record.intended_effect or approval.permission_revision != context.permission_revision or approval.navigation_epoch != record.navigation_epoch:
                    raise PolicyDenied("nova_concrete_human_approval_required")
                if not store.list_approvals(run.run_id, proposal_id=proposal.proposal_id):
                    store.record_approval(run.run_id, proposal.proposal_id, proposal_digest(proposal), "human", approval.actor_ref,
                                          evidence_refs=(approval_id,))
            decision = PolicyGate(store, default_autonomy=run.metadata["autonomy"]).authorize_and_claim(proposal, run, proposal.declared_capabilities())
            if decision.status is not PolicyStatus.ALLOWED:
                raise PolicyDenied("nova_" + decision.reason)
            if not self.supervisor.revalidate_action_boundary(authority.capability):
                raise PolicyDenied("nova_capability_not_current")
            yield

    def finish(self, context):
        """Reconcile actual terminal journal after the execution worker stopped."""
        with self._lock:
            authority = self._authorities.get(context.run_id)
            if authority is None:
                return
            run = self.manager.store.get_run(context.run_id)
            if run is None or run.state not in TERMINAL_STATES:
                return
            actions = self.manager.store.list_actions(run.run_id)
            if any(action.state in {"claimed", "dispatched", "unknown"} for action in actions):
                self.supervisor._pause(authority.capability, "independent_action_result_unknown")
                return
            from swarm_core.store import ProjectSwarmStore
            from swarm_core.engine import PreCompletionContext
            native = ProjectSwarmStore(authority.project_root)
            child = native.get_run(authority.native_run_id)
            if child.status in {"cancelled", "abandoned", "completed"}:
                self._authorities.pop(context.run_id, None)
                return
            if run.state == "completed":
                if not run.result_ref:
                    raise PolicyDenied("nova_terminal_result_required")
                artifact = Path(run.result_ref).resolve(strict=True)
                if not artifact.is_relative_to(Path(context.resolved_profile_home).resolve()) or not artifact.is_file():
                    raise PolicyDenied("nova_terminal_result_scope_mismatch")
                evidence = ["independent-result:" + digest_json({"runId": run.run_id, "result": artifact.read_text("utf-8"), "journal": [a.model_dump(mode="json", by_alias=True) for a in actions]})]
                from swarm_core.verifier import VerificationResult
                verified = VerificationResult(
                    work="Local host validated bound terminal artifact and durable action journal; no in-flight or unknown action remains",
                    evidence=tuple(evidence), decision="verified", provenance={"adapter": "independent-journal-v1", "mode": "read_only"})
                native.record_workflow_role_checkpoint(child.run_id, "verifier", model=None, data=verified.to_checkpoint_data())
                hook = self.supervisor.pre_completion_hook_for_run(child.run_id)
                checked = hook.run(PreCompletionContext(child, authority.project_root, native,
                    "Bound browser work", "independent-browser", child.metadata["autonomy"],
                    run.counters.provider_requests, "verified", {"verifier": evidence}))
                if not checked.continue_completion:
                    raise PolicyDenied("nova_" + checked.pause_reason)
                native.set_run_status(child.run_id, "completed")
                if not self.supervisor.record_completion(child.run_id):
                    raise PolicyDenied("nova_completion_reconciliation_required")
            else:
                if not self.supervisor.finish_independent_host(authority.capability, parent_state=run.state,
                    journal_digest=digest_json([action.model_dump(mode="json", by_alias=True) for action in actions])):
                    return
            self._authorities.pop(context.run_id, None)

    @contextmanager
    def completion_boundary(self, context):
        # Parent durable completion and the native verifier completion must be
        # acknowledged in one control order before a native cancel can win.
        with self._lock, self.supervisor.independent_action_boundary():
            if not self(context):
                raise PolicyDenied("nova_capability_not_current")
            yield
            run = self.manager.store.get_run(context.run_id)
            if run.state == "completed":
                self.finish(context)

    def close(self):
        with _MANAGERS_LOCK:
            if self.manager is not None:
                _MANAGERS.pop(id(self.manager), None)

    def poll(self, context):
        """Read native controls; a cancelled capability cannot finish later."""
        with self._lock:
            if context.run_id not in self._authorities:
                return None
            try:
                if self(context):
                    return None
            except PolicyDenied as exc:
                return exc.code
            return "nova_capability_not_current"


@dataclass(frozen=True)
class _BrowserAuthority:
    capability: object
    project_root: Path
    native_run_id: str
    context_digest: str
    call_budget: int


def authoritative_scope_keys_for_project(project_root):
    """Host registry of actual native bindings; never guess a Space ID."""
    project = Path(project_root).resolve(strict=True)
    with _MANAGERS_LOCK:
        managers = tuple(_MANAGERS.values())
    scopes = set()
    for manager in managers:
        try:
            for binding in manager.store.list_bindings():
                if binding.workspace_locator and Path(binding.workspace_locator).resolve(strict=True) == project:
                    manager.resolver.resolve(binding.scope)
                    scopes.add(binding.scope.key)
        except (OSError, ValueError, RuntimeError, sqlite3.Error):
            continue
    return tuple(sorted(scopes))
