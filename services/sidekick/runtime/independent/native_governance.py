"""Native human turns admitted by the existing durable Nova issuer.

The host supplies an authenticated human and a real reserved transcript. The
issuer reads the saved ingress itself; a namespace or RPC DTO grants nothing.
SDK, file and browser proposals share the actual ProjectSwarmStore, role budget,
quorum, durable action claims and supervisor admission slot.
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import threading
import time
from uuid import NAMESPACE_URL, uuid5

from runtime.chat_modes import ChatExecutionPolicy, tool_denial
from .contracts import NativeActionRecord, NativeApprovalView, NativeChatOwner, digest_json
from .native_chat_protocol import NativeChatContext, verify_native_context
from .policy import PolicyDenied
from .store import ResourceBusy

FAMILIES = ("native_sdk", "native_file", "native_browser")


class NativeManagedGovernance:
    def __init__(self, manager, context: NativeChatContext, session, *, actor_ref: str,
                 execution_policy: ChatExecutionPolicy, ingress_kind="human", goal_ingress_validator=None):
        if not isinstance(context, NativeChatContext) or not isinstance(execution_policy, ChatExecutionPolicy):
            raise PolicyDenied("native_nova_captured_turn_required")
        if not isinstance(actor_ref, str) or not actor_ref.startswith("user:"):
            raise PolicyDenied("native_nova_human_ingress_required")
        verify_native_context(context)
        self.manager, self.context, self.actor_ref, self.policy = manager, context, actor_ref, execution_policy
        if ingress_kind not in {"human", "goal_continuation", "goal_judge_retry"}:
            raise PolicyDenied("native_nova_ingress_kind_invalid")
        if ingress_kind != "human" and not callable(goal_ingress_validator):
            raise PolicyDenied("native_nova_goal_ingress_adapter_required")
        self.ingress_kind, self.goal_ingress_validator = ingress_kind, goal_ingress_validator
        self._goal_authorization = None
        if ingress_kind != "human":
            self._goal_authorization = goal_ingress_validator(context)
            if (not isinstance(self._goal_authorization, dict)
                or not isinstance(self._goal_authorization.get("authorizationRef"), str)
                or not isinstance(self._goal_authorization.get("authorizationDigest"), str)
                or self._goal_authorization.get("scope") != context.scope.model_dump(mode="json", by_alias=True)
                or self._goal_authorization.get("sessionId") != context.session_id
                or type(self._goal_authorization.get("goalRevision")) is not int):
                raise PolicyDenied("native_nova_goal_authorization_required")
            if ingress_kind == "goal_continuation" and type(self._goal_authorization.get("goalTurn")) is not int:
                raise PolicyDenied("native_nova_goal_authorization_required")
            if ingress_kind == "goal_judge_retry":
                proof = self._goal_authorization
                if (proof.get("streamId") != context.stream_id or proof.get("requestPurpose") != "goal_judge"
                    or any(not isinstance(proof.get(key), str) or not proof[key] for key in
                        ("goalRunId", "goalDigest", "requestId"))):
                    raise PolicyDenied("native_nova_goal_retry_authorization_required")
        self._lock = threading.RLock()
        self._capability = self._project = self._run_id = self._binding = None
        self._model_choices = None
        self._claims = set()
        self._file_claims = set()
        self._closed = False
        self.context_digest = digest_json(context)
        if ingress_kind == "goal_judge_retry":
            self.ingress_digest = digest_json({"kind": ingress_kind, "authorization": self._goal_authorization})
            self.ingress_ref = self._goal_authorization["authorizationRef"] + ":judge:" + self._goal_authorization["requestId"]
        else:
            self.ingress_digest, self.ingress_ref = self._ingress(session)
        self.resolved = manager.resolver.resolve(context.scope, authenticated_profile_name=context.profile_name)
        self.managed = self._managed()
        from .governance import ManagedBrowserAdmission
        adapter = manager.governance_admission
        if self.managed and not isinstance(adapter, ManagedBrowserAdmission):
            raise PolicyDenied("native_nova_authoritative_project_adapter_required")
        self.adapter = adapter
        from nova.space_supervisor import ManagedSpaceSupervisor
        self.supervisor = ManagedSpaceSupervisor(
            ledger_path=manager.store.profile_home / "state" / "nova-space-supervisor.sqlite",
            governance_resolver=self.adapter._resolve_target if self.managed else lambda _: None,
            native_ingress_validator=self._validate_ingress)
        self._live()

    @staticmethod
    def _ingress(session):
        pending = getattr(session, "pending_user_message", None)
        if isinstance(pending, str) and (pending.strip() or getattr(session, "pending_attachments", None)):
            digest = digest_json({"kind": "pending_user_message", "content": pending,
                "attachments": getattr(session, "pending_attachments", None)})
            return digest, "session:" + session.session_id + ":pending:" + digest
        messages = getattr(session, "messages", ())
        last = next((message for message in reversed(messages) if isinstance(message, dict)
            and message.get("role") == "user" and message.get("content")), None)
        if last is None: raise PolicyDenied("native_nova_saved_human_message_required")
        digest = digest_json({"kind": "user_message", "message": last})
        return digest, "session:" + session.session_id + ":message:" + str(last.get("id") or digest)

    def _managed(self):
        config = self.resolved.space.load_config()
        if config.get("_nova_management_malformed") or config.get("_space_config_malformed"):
            raise PolicyDenied("native_nova_management_malformed")
        return bool((config.get("nova_management") or {}).get("enrolled"))

    def _live(self):
        if self._closed: raise PolicyDenied("native_nova_turn_closed")
        verify_native_context(self.context)
        if self._managed() != self.managed: raise PolicyDenied("native_nova_governance_changed")
        # This is the actual saved owner, never a provider prompt/RPC payload.
        path = Path(self.context.sessions_dir) / (self.context.session_id + ".json")
        with path.open("rb") as file:
            content = file.read(32 * 1024 * 1024 + 1)
        if len(content) > 32 * 1024 * 1024: raise PolicyDenied("native_nova_ingress_too_large")
        raw = json.loads(content)
        if (raw.get("profile") != self.context.profile_name or raw.get("session_id") != self.context.session_id
            or raw.get("space_scope") != self.context.scope.model_dump(mode="json", by_alias=True)
            or raw.get("active_stream_id") != self.context.stream_id):
            raise PolicyDenied("native_nova_ingress_owner_changed")
        from types import SimpleNamespace
        actual = SimpleNamespace(**raw)
        if self.ingress_kind != "goal_judge_retry" and self._ingress(actual) != (self.ingress_digest, self.ingress_ref):
            raise PolicyDenied("native_nova_human_ingress_changed")
        if self.ingress_kind != "human" and self.goal_ingress_validator(self.context) != self._goal_authorization:
            raise PolicyDenied("native_nova_goal_authorization_changed")

    def _validate_ingress(self, target, captured):
        self._live()
        return (self.managed and target == self.resolved.binding.native_slug and captured == self._binding
            and captured["actorRef"] == self.actor_ref and captured["ingressDigest"] == self.ingress_digest)

    def _ensure(self, decision):
        self._live()
        if not self.managed: return None
        self.manager.resolver.validate_context(decision.context)
        if decision.scope != self.context.scope or decision.session_id != self.context.session_id:
            raise PolicyDenied("native_nova_decision_owner_changed")
        pair = (decision.selected_model.provider, decision.selected_model.model)
        choices = self._authorized_model_choices(decision)
        if self._model_choices is not None and choices != self._model_choices:
            raise PolicyDenied("native_nova_model_choices_changed")
        if pair not in choices:
            raise PolicyDenied("native_nova_model_not_in_captured_plan")
        if self._capability is None:
            from swarm_core.config import load_project_config, SwarmProjectNotInitializedError
            governance = self.adapter._resolve_target(self.resolved.binding.native_slug)
            try: autonomy = load_project_config(governance.canonical_root).default_autonomy
            except SwarmProjectNotInitializedError: autonomy = "reviewed_execution"
            policy = self.manager.store.get_permission_state(self.context.scope)
            if (policy["revision"] != decision.context.permission_revision
                or policy["controlEpoch"] != decision.context.control_epoch or (policy["permissions"] or {}).get("revoked")):
                raise PolicyDenied("native_nova_permission_changed")
            max_calls = min(48, decision.context.budget.max_provider_requests)
            self._binding = {"scope": self.context.scope.model_dump(mode="json", by_alias=True),
                "sessionId": self.context.session_id, "streamId": self.context.stream_id,
                "writerGeneration": self.context.writer_generation, "writerLeaseId": self.context.writer_lease_id,
                "contextDigest": self.context_digest, "ingressDigest": self.ingress_digest, "ingressRef": self.ingress_ref,
                "actorRef": self.actor_ref, "model": pair[1], "modelProvider": pair[0],
                "modelChoices": [{"provider": provider, "model": model} for provider, model in choices],
                "modelChoiceDigest": digest_json([{"provider": provider, "model": model}
                    for provider, model in choices]),
                "callBudget": max_calls, "autonomy": autonomy,
                "executionPolicy": self.policy.view(), "ingressKind": self.ingress_kind,
                "goalAuthorization": self._goal_authorization}
            admission = self.supervisor.admit_native_chat(self.resolved.binding.native_slug,
                {"goal": ("Evaluate only the saved pending Goal response" if self.ingress_kind == "goal_judge_retry"
                          else "Execute the actual saved human chat turn"), "streamId": self.context.stream_id,
                 "ingressDigest": self.ingress_digest, "contextDigest": self.context_digest}, binding=self._binding)
            if admission.capability is None:
                if admission.reason == "active_limit": raise ResourceBusy("Native Nova supervisor slot is occupied")
                raise PolicyDenied("nova_" + str(admission.reason or "native_capability_recovery_required"))
            self._capability, self._project, self._run_id = admission.capability, governance.canonical_root, admission.run_id
            self._model_choices = choices
            if not self.supervisor.start_admitted_run(self._capability, dispatcher=lambda *_: True):
                raise PolicyDenied("native_nova_host_start_rejected")
        issued = self.supervisor.resolve_action_context(self._capability)
        if issued is None or issued.allowed_action_families != FAMILIES:
            raise PolicyDenied("native_nova_capability_not_current")
        return issued

    def _authorized_model_choices(self, decision):
        broker = getattr(self, "broker", None)
        resolver = getattr(broker, "managed_model_choices", None)
        if callable(resolver):
            raw = resolver()
        else:
            raw = ((decision.selected_model.provider, decision.selected_model.model),)
        try:
            choices = tuple(sorted({(provider, model) for provider, model in raw
                if isinstance(provider, str) and provider and isinstance(model, str) and model}))
        except (TypeError, ValueError):
            raise PolicyDenied("native_nova_model_choices_invalid") from None
        if not choices or len(choices) > 64 or (decision.selected_model.provider, decision.selected_model.model) not in choices:
            raise PolicyDenied("native_nova_model_choices_invalid")
        return choices

    @contextmanager
    def _boundary(self, decision):
        from web.api.space_engine import space_config_lock
        with space_config_lock(self.resolved.space), self._lock, self.supervisor.independent_action_boundary():
            self._ensure(decision)
            yield

    def _proposal(self, identity, family, tool_name, action_digest, *, effect="read", cost=False, extra=None):
        from swarm_core.types import ActionProposal, RequestedToolAction
        from swarm_core.store import ProjectSwarmStore
        store = ProjectSwarmStore(self._project)
        run = store.get_run(self._run_id)
        verifier = store.get_workflow_role_checkpoints(run.run_id).get("verifier")
        evidence = tuple(verifier.data.get("evidence", ())) if verifier else ()
        arguments = {key: self._binding[key] for key in
            ("scope", "sessionId", "streamId", "writerGeneration", "writerLeaseId", "contextDigest")}
        arguments.update(actionDigest=action_digest, **(extra or {}))
        proposal = ActionProposal(proposal_id="native:" + identity, category=family, reversible=effect == "read",
            external=effect != "read", cost_increasing=cost, evidence_refs=evidence,
            requested_action=RequestedToolAction(name=family + "." + tool_name, workspace=self._project, arguments=arguments))
        return store, run, proposal

    @staticmethod
    def _claim(store, run, proposal, *, actor=None, evidence=()):
        from swarm_core.policy import PolicyGate, PolicyStatus, proposal_digest
        if actor and not store.list_approvals(run.run_id, proposal_id=proposal.proposal_id):
            store.record_approval(run.run_id, proposal.proposal_id, proposal_digest(proposal), "human", actor, evidence_refs=evidence)
        decision = PolicyGate(store, default_autonomy=run.metadata["autonomy"]).authorize_and_claim(
            proposal, run, proposal.declared_capabilities())
        if decision.status is not PolicyStatus.ALLOWED: raise PolicyDenied("nova_" + decision.reason)

    def __call__(self, decision, claim):
        with self._boundary(decision):
            if not self.managed: return True
            self._validate_claim(decision, claim)
            if claim.claim_id in self._claims: return self.validate(decision, claim)
            from swarm_core.workflow import CallBudget, WorkflowPaused
            store, run, proposal = self._proposal(claim.claim_id, "native_sdk", claim.request_purpose,
                digest_json(claim), cost=True, extra={"claimId": claim.claim_id, "provider": claim.provider,
                    "model": claim.model, "requestPurpose": claim.request_purpose, "tokensBound": claim.reserved_tokens,
                    "permissionRevision": claim.permission_revision, "controlEpoch": claim.control_epoch})
            # A human's saved turn is ingress for its bounded model request;
            # it cannot approve a browser/file mutation or a model review vote.
            self._claim(store, run, proposal, actor=self.actor_ref,
                evidence=((self._goal_authorization["authorizationRef"],) if self._goal_authorization else (self.ingress_ref,)))
            used = sum(event.event_type == "model.attempt_started" for event in store.list_events(run.run_id))
            try: CallBudget(self._binding["callBudget"], initial_used=used).claim(role="builder", attempted_models=())
            except WorkflowPaused as error: raise PolicyDenied("nova_role_call_budget_exhausted") from error
            store.append_event_once(run.run_id, "model.attempt_started", {"role": "builder", "model": claim.model,
                "nativeClaimId": claim.claim_id, "requestPurpose": claim.request_purpose,
                "scope": self._binding["scope"], "writerLeaseId": self.context.writer_lease_id},
                idempotency_key="native-sdk:" + claim.claim_id)
            self._claims.add(claim.claim_id)
            return self.validate(decision, claim)

    def _validate_claim(self, decision, claim):
        if self.ingress_kind == "goal_judge_retry" and claim.request_purpose != "goal_judge":
            raise PolicyDenied("native_nova_goal_retry_purpose_required")
        if (claim.scope != self.context.scope or claim.session_id != self.context.session_id
            or claim.decision_id != decision.decision_id or claim.provider != decision.selected_model.provider
            or claim.model != decision.selected_model.model or claim.state != "reserved"):
            raise PolicyDenied("native_nova_sdk_claim_changed")
        current = self.manager.store.get_permission_state(self.context.scope)
        if current["revision"] != claim.permission_revision or current["controlEpoch"] != claim.control_epoch:
            raise PolicyDenied("native_nova_sdk_permission_changed")

    def validate(self, decision, claim):
        with self._lock:
            self._ensure(decision)
            self._validate_claim(decision, claim)
            if not self.managed: return True
            if claim.claim_id not in self._claims: return False
            from swarm_core.store import ProjectSwarmStore
            store = ProjectSwarmStore.open_read_only(self._project)
            return any(event.event_type == "model.attempt_started" and event.payload.get("nativeClaimId") == claim.claim_id
                for event in store.list_events(self._run_id))

    def validate_turn(self, decision):
        # Also used during stream reads: native Nova pause/revoke must stop
        # delivery, not merely reject the next model request.
        with self._boundary(decision):
            return True

    def browser_authorizer(self, context, request, policy):
        if self.ingress_kind == "goal_judge_retry": return False
        if context != self.context or policy != self.policy: return False
        decision = getattr(self.broker, "_decision", None)
        if decision is None: return False
        # Main calls this while another Parent thread may be waiting on its
        # HTTP action ACK. No dispatch/fence lock may be acquired here.
        # Initial native SDK validation already issued the real attachment.
        if self.managed and self._capability is None: return False
        self._ensure(decision)
        return tool_denial(policy, request.tool_name, request.arguments) is None

    @contextmanager
    def action_boundary(self, context, record, args, approval_id):
        if self.ingress_kind == "goal_judge_retry":
            raise PolicyDenied("native_nova_goal_retry_effect_denied")
        if context != self.context or not isinstance(record, NativeActionRecord):
            raise PolicyDenied("native_nova_action_owner_changed")
        decision = self.broker._decision
        if decision is None: raise PolicyDenied("native_nova_sdk_decision_required")
        with self._boundary(decision):
            if not self.managed:
                yield; return
            actual = self.manager.store.get_native_action(record.action_id)
            if actual is None or actual.scope != context.scope or actual.owner_ref != self.manager.store._native_owner(context):
                raise PolicyDenied("native_nova_actual_action_required")
            self.manager.store._native_authority(context, actual)
            if actual.state not in {"claimed", "dispatched"}: raise PolicyDenied("native_nova_action_not_claimed")
            family = "native_browser" if actual.lease_id else "native_file"
            store, run, proposal = self._proposal(actual.action_id, family, actual.tool_id,
                actual.canonical_args_digest, effect=actual.intended_effect,
                extra={"permissionRevision": actual.permission_revision, "controlEpoch": actual.control_epoch,
                    "navigationEpoch": actual.navigation_epoch, "connectionRevisions": actual.connection_revisions,
                    "leaseId": actual.lease_id, "targetId": actual.target_id,
                    "mainGeneration": actual.main_generation, "runnerGeneration": actual.runner_generation})
            actor = None
            if approval_id:
                approval = self.manager.store.get_native_approval(approval_id)
                if (approval is None or approval.state != "consumed" or actual.approval_id != approval_id
                    or not self.manager.store._native_approval_matches(actual, approval)
                    or not (approval.actor_ref or "").startswith("user:")):
                    raise PolicyDenied("nova_concrete_human_approval_required")
                actor = approval.actor_ref
            self._claim(store, run, proposal, actor=actor, evidence=(approval_id,) if approval_id else ())
            if not self.supervisor.revalidate_action_boundary(self._capability):
                raise PolicyDenied("native_nova_capability_not_current")
            yield

    def bind(self, broker):
        if broker.context != self.context or broker.service.manager is not self.manager:
            raise PolicyDenied("native_nova_broker_owner_changed")
        self.broker = broker
        broker.native_governance = self
        return self

    def file_authorizer(self, context, request, policy):
        if self.ingress_kind == "goal_judge_retry": return False
        if context != self.context or policy != self.policy: return False
        self._live()
        self._ensure(self.broker._decision)
        if not self.managed: return tool_denial(policy, request.tool_name, request.arguments) is None
        identity = str(uuid5(NAMESPACE_URL, self.context_digest + ":file:" + request.operation_id))
        action = self.manager.store.get_native_action(identity)
        return (identity in self._file_claims and action is not None and action.state in {"dispatched", "succeeded"}
            and action.canonical_args_digest == digest_json(request.arguments))

    @contextmanager
    def file_boundary(self, context, request, policy):
        if self.ingress_kind == "goal_judge_retry":
            raise PolicyDenied("native_nova_goal_retry_effect_denied")
        if context != self.context or policy != self.policy or tool_denial(policy, request.tool_name, request.arguments):
            raise PolicyDenied("native_nova_file_mode_changed")
        decision = self.broker._decision
        if decision is None: raise PolicyDenied("native_nova_sdk_decision_required")
        if not self.managed:
            yield; return
        identity = str(uuid5(NAMESPACE_URL, self.context_digest + ":file:" + request.operation_id))
        old = self.manager.store.get_native_action(identity)
        if old is not None and old.state == "succeeded":
            # Return the actual existing known IO receipt; no second Nova claim.
            self._file_claims.add(identity)
            try: yield
            finally: self._file_claims.discard(identity)
            return
        owner = NativeChatOwner(session_id=context.session_id, stream_id=context.stream_id,
            writer_generation=context.writer_generation, writer_lease_id=context.writer_lease_id)
        state = self.manager.store.get_permission_state(context.scope)
        action = NativeActionRecord(action_id=identity, owner_ref=owner, session_id=context.session_id,
            stream_id=context.stream_id, writer_generation=context.writer_generation, writer_lease_id=context.writer_lease_id,
            step_id=request.operation_id, scope=context.scope, tool_id=request.tool_name,
            canonical_args_digest=digest_json(request.arguments), intended_effect="write" if request.tool_name in {"write_file", "patch"} else "read",
            resource_refs=(request.arguments["path"],), authorization_ref=context.writer_lease_id,
            permission_revision=state["revision"], control_epoch=state["controlEpoch"],
            connection_bindings=decision.context.connection_bindings,
            connection_revisions={ref.binding_id: ref.revision for ref in decision.context.connection_bindings})
        if old is None: self.manager.store.prepare_native_action(context, action)
        elif old.canonical_args_digest != action.canonical_args_digest or old.state != "prepared":
            raise PolicyDenied("native_nova_file_no_replay")
        else: action = old
        approval_id = None
        if action.intended_effect != "read":
            approval_id = str(uuid5(NAMESPACE_URL, identity + ":approval"))
            approval = self.manager.store.get_native_approval(approval_id)
            if approval is None:
                approval = NativeApprovalView(approval_id=approval_id, owner_ref=owner, session_id=context.session_id,
                    stream_id=context.stream_id, writer_generation=context.writer_generation, writer_lease_id=context.writer_lease_id,
                    action_id=identity, scope=context.scope, action_digest=action.canonical_args_digest, effect=action.intended_effect,
                    target_summary=request.tool_name + ": " + request.arguments["path"], permission_revision=action.permission_revision,
                    control_epoch=action.control_epoch, connection_revisions=action.connection_revisions,
                    expires_at=(datetime.now(timezone.utc) + timedelta(seconds=15)).isoformat().replace("+00:00", "Z"))
                self.manager.store.create_native_approval(context, approval)
            # No SQL, Space or supervisor dispatch lock is held while the
            # real authenticated user answers the concrete approval.
            deadline = time.monotonic() + 10
            while approval.state == "pending" and time.monotonic() < deadline:
                if self.broker._stopping.wait(.1): break
                self._live()
                approval = self.manager.store.get_native_approval(approval_id)
            if approval is None or approval.state != "approved":
                self.manager.store.finish_native_action(context, identity, "denied", error_code="native_file_approval_not_granted")
                raise PolicyDenied("native_file_concrete_approval_required")
        claimed = self.manager.store.claim_native_action(context, identity,
            expected_permission_revision=action.permission_revision, expected_control_epoch=action.control_epoch,
            approval_id=approval_id)
        try:
            with self.action_boundary(context, claimed, request.arguments, approval_id):
                self.manager.store.finish_native_action(context, identity, "dispatched")
                self._file_claims.add(identity)
                yield
            self.manager.store.finish_native_action(context, identity, "succeeded")
        except BaseException:
            current = self.manager.store.get_native_action(identity)
            if current.state in {"claimed", "dispatched"}:
                self.manager.store.finish_native_action(context, identity,
                    "denied" if current.state == "claimed" else "unknown", error_code="native_file_effect_not_confirmed")
            raise
        finally:
            self._file_claims.discard(identity)

    def decide_file_approval(self, approval_id, **kwargs):
        self._live()
        approval = self.manager.store.get_native_approval(approval_id)
        if approval is None or approval.lease_id is not None:
            raise PolicyDenied("native_file_approval_not_found")
        return self.manager.store.decide_native_approval(self.context, approval_id, **kwargs)

    def close_after_exit(self):
        if not self.managed or self._capability is None:
            self._closed = True; return
        actions = self.manager.store._many("SELECT data_json,state FROM ia_action_journal WHERE scope_key=? AND run_id IS NULL", (self.context.scope.key,))
        actual = [NativeActionRecord.model_validate_json(row[0]).model_copy(update={"state": row[1]}) for row in actions]
        actual = [row for row in actual if row.stream_id == self.context.stream_id and row.writer_generation == self.context.writer_generation]
        if any(row.state in {"claimed", "dispatched", "unknown"} for row in actual):
            self.supervisor._pause(self._capability, "native_action_result_unknown")
            return
        journal = digest_json({"scope": self.context.scope, "stream": self.context.stream_id,
            "actions": actual, "claims": sorted(self._claims)})
        # A host exit releases a stopped workflow. It does not fabricate a
        # production coding verifier/quorum or mark a chat as a completed Git task.
        self.supervisor.finish_native_host(self._capability, journal_digest=journal)
        self._closed = True
