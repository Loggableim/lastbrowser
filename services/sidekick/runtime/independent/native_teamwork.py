"""Parent-owned provider admission for native Teamwork turns.

The worker receives only a parent-created role plan and frozen provider
decisions. Every SDK request still returns to the Parent for live policy,
quota, and compute admission; the worker cannot add a model or endpoint.
"""
from __future__ import annotations

import os
import threading
import time
import uuid
from pathlib import Path
from types import SimpleNamespace

from .contracts import ProviderSelection, canonical_json, digest_json, new_id, utc_now
from .model_selection import ModelPair, ModelRequirements, SelectionDecision
from .native_chat_protocol import verify_native_context
from .policy import PolicyDenied
from .scope import same_path
from .store import ResourceBusy


def _pair_key(provider: str, model: str) -> str:
    return provider + "\0" + model


_TEAMWORK_CANDIDATE_REJECTIONS = frozenset({
    "unsupported_native_adapter", "provider_not_configured", "catalog_model_missing", "independent_capability_missing",
    "context_length_unavailable", "cloud_policy_denied", "provider_connection_changed",
    "scope_provider_use_not_permitted", "candidate_capture_denied", "candidate_capture_failed",
    "catalog_pair_mismatch", "provider_binding_mismatch", "model_not_allowlisted",
})


def _candidate_diagnostics_valid(value) -> bool:
    return (isinstance(value, list) and len(value) <= 64
        and all(isinstance(row, dict) and set(row) == {"provider", "model", "code"}
            and isinstance(row.get("provider"), str) and 0 < len(row["provider"]) <= 160
            and isinstance(row.get("model"), str) and 0 < len(row["model"]) <= 240
            and row.get("code") in _TEAMWORK_CANDIDATE_REJECTIONS for row in value))


def _safe_candidate_label(value, limit):
    text = "".join(char for char in str(value or "") if char.isprintable()).strip()
    return text[:limit] or "unknown"


def _teamwork_cloud_allowed(policy, selection_policy_revision: int, *, local: bool,
                            data_classes: tuple[str, ...]) -> bool:
    """An explicit Teamwork start uses bound providers under the default policy.

    Once the user has saved a selection policy, its cloud decision is explicit
    and remains authoritative, including an explicit deny in fixed mode.
    AUTO has its own stricter opt-in path and never calls this helper.
    """
    if local:
        return True
    if policy.mode == "fixed" and policy.revision == 0 and selection_policy_revision == 0:
        return True
    return (policy.cloud_policy == "allow"
        and all(kind in policy.allowed_cloud_data_classes for kind in data_classes))


class NativeTeamworkSessionBroker:
    """Create the role plan in the Parent and broker every real provider call."""

    def __init__(self, context, session, prompt, *, profile_hub=None,
                 call_authorizer=None, service=None, execution_policy=None):
        verify_native_context(context)
        if (session.session_id != context.session_id
                or (session.profile or "default") != context.profile_name
                or session.space_scope != context.scope.model_dump(mode="json", by_alias=True)
                or not same_path(session.workspace, context.workspace)):
            raise PolicyDenied("native_teamwork_session_mismatch")
        if not isinstance(prompt, str) or len(prompt) > 24000:
            raise PolicyDenied("native_teamwork_prompt_bound")
        if context.teamwork is not True:
            raise PolicyDenied("native_teamwork_parent_capture_required")
        if service is None:
            from web.api.model_policy import service_for_native_chat
            service, _resolved = service_for_native_chat(
                session, session.space_scope, actor=context.profile_name, profile_hub=profile_hub)
        self.service = service
        self.context, self.session, self._authorize = context, session, call_authorizer
        self._lock = threading.RLock()
        self._stopping = threading.Event()
        self._closed = False
        self._claims = {}
        self._compute = set()
        self._client_claims = set()
        self._request_count = 0
        self._output_reserved = 0
        self._claim_reservations = {}
        self._turn_id = uuid.uuid5(uuid.NAMESPACE_URL, canonical_json([
            "native-teamwork", context.scope.key, context.session_id,
            context.stream_id, context.writer_generation])).hex
        self._plan = None
        self._decisions = {}
        self._decision_keys = {}
        self._candidate_diagnostics = []
        self._fixed_delegate = None
        self._auto_delegate = None
        self.execution_policy = execution_policy
        from runtime.teamwork_orchestrator import (
            get_teamwork_model_pool, load_teamwork_config, resolve_team_plan,
        )
        self.config = load_teamwork_config(reload=True, profile_name=context.profile_name)
        if self.config.get("enabled") is not True:
            raise PolicyDenied("teamwork_disabled")
        self.config_digest = digest_json(self.config)
        if context.selection_mode == "fixed":
            self._init_fixed(get_teamwork_model_pool, resolve_team_plan, prompt)
        elif context.selection_mode == "auto":
            self._init_auto(get_teamwork_model_pool, resolve_team_plan, prompt)
        else:
            raise PolicyDenied("native_teamwork_selection_mode_invalid")
        # Native file and browser operations retain their ordinary independent
        # fences; Teamwork itself does not receive a tool executor.
        if self._auto_delegate is not None:
            self.file_fence = self._auto_delegate.file_fence
            self.browser_fence = self._auto_delegate.browser_fence
        else:
            from .native_file_io import NativeFileIOFence
            from .native_browser import NativeBrowserFence
            self.file_fence = NativeFileIOFence(self, execution_policy)
            self.browser_fence = NativeBrowserFence(self, execution_policy)

    def _init_fixed(self, get_pool, resolve_team_plan, prompt):
        from .model_selection import ModelRequirements
        from .native_sdk_contracts import NativeSdkDecision
        from .model_selection import _local_provider
        from .runner import provider_configuration_digest
        from .contracts import ProviderSelection, utc_now
        from .native_chat_auto import native_sdk_supported
        from runtime.teamwork_orchestrator import classify_model_tier
        self._policy = self.service.get_policy(self.context.scope, self.context.session_id)
        if self._policy.mode != "fixed":
            raise PolicyDenied("native_teamwork_fixed_policy_changed")
        manager = self.service.manager
        catalog = self.service._catalog(self.context.scope)
        resolved, entries = self.service._entries(self.context.scope, catalog)
        if provider_configuration_digest(resolved.profile_home) != catalog.get("providerConfigurationDigest"):
            raise PolicyDenied("provider_connection_changed")
        teamwork_pool = get_pool(profile_name=self.context.profile_name)
        roles = self.config.get("roles") if isinstance(self.config.get("roles"), dict) else {}
        worker_allow = roles.get("worker_pool", "auto")
        if isinstance(worker_allow, list) and worker_allow and worker_allow[0] != "auto":
            explicit_ids = {str(value) for value in worker_allow if isinstance(value, str)}
            explicit_ids.update(str(roles.get(key)) for key in ("planner", "critic", "synthesizer")
                if roles.get(key) and roles.get(key) != "auto")
            teamwork_pool = [row for row in teamwork_pool if str(row.get("id")) in explicit_ids]
        pool = []
        self._candidate_diagnostics = []

        def reject(provider, model, code):
            if len(self._candidate_diagnostics) < 64:
                self._candidate_diagnostics.append({
                    "provider": _safe_candidate_label(provider, 160),
                    "model": _safe_candidate_label(model, 240),
                    "code": code,
                })

        requirements = ModelRequirements(data_class="private", data_classes=("workspace",),
            required_capabilities=("text",))
        for row in teamwork_pool:
            provider = str(row.get("provider") or "")
            model = str(row.get("call_model") or row.get("id") or "")
            if not native_sdk_supported(provider):
                reject(provider, model, "unsupported_native_adapter")
                continue
            pair = ModelPair(provider=provider, model=model)
            catalog_row = entries.get(pair)
            if not catalog_row:
                matching_group = next((group for group in catalog.get("groups", [])
                    if isinstance(group, dict) and group.get("provider_id") == provider), None)
                if not matching_group or matching_group.get("configured") is not True:
                    reject(provider, model, "provider_not_configured")
                else:
                    raw_rows = (*matching_group.get("models", []), *matching_group.get("extra_models", []))
                    raw_model = next((candidate for candidate in raw_rows
                        if isinstance(candidate, dict) and candidate.get("id") == model), None)
                    reject(provider, model, "catalog_model_missing" if raw_model is None
                        else "independent_capability_missing")
                continue
            length = catalog_row.get("contextLength")
            if type(length) is not int or length < 1:
                reject(provider, model, "context_length_unavailable")
                continue
            local = _local_provider(resolved.profile_home, provider)
            if not _teamwork_cloud_allowed(self._policy, self.context.selection_policy_revision,
                    local=local, data_classes=(requirements.data_class, *requirements.data_classes)):
                reject(provider, model, "cloud_policy_denied")
                continue
            try:
                selected = ProviderSelection(provider_config_ref=catalog["providerConfigurationDigest"],
                    provider=provider, model=model, context_length=length)
                if (selected.provider != pair.provider or selected.model != pair.model
                        or selected.context_length != length or not selected.provider_config_ref):
                    reject(provider, model, "catalog_pair_mismatch")
                    continue
                # Fixed-mode Teamwork is an explicit user choice and follows
                # the existing fixed native-SDK capture contract: capture a
                # real conversation capability from the canonical bound
                # catalog without requiring AUTO's separately persisted model
                # allowlist or silently minting new connection bindings.
                manager.capabilities.catalog(self.context.scope, refresh=True)
                refs = tuple(manager.capabilities.capture_provider(
                    self.context.scope, selected, purpose="conversation"))
                if any(ref.kind != "provider" or ref.capability_id != "assistant.conversation"
                        or ref.connection_id != "provider:" + provider
                        or ref.connection_revision < 0 for ref in refs):
                    reject(provider, model, "provider_binding_mismatch")
                    continue
                run_context = manager.make_context(self.context.scope, selected,
                    connection_bindings=refs, interactive=True)
                if (run_context.provider.provider != provider or run_context.provider.model != model
                        or run_context.provider.provider_config_ref != catalog["providerConfigurationDigest"]
                        or run_context.provider.context_length != length):
                    reject(provider, model, "catalog_pair_mismatch")
                    continue
                manager._validate_connections(run_context)
                manager._governance(run_context, prepare=True)
            except PolicyDenied as exc:
                raw_code = getattr(exc, "code", None)
                code = raw_code if isinstance(raw_code, str) and raw_code in _TEAMWORK_CANDIDATE_REJECTIONS else "candidate_capture_denied"
                reject(provider, model, code)
                continue
            except Exception:
                reject(provider, model, "candidate_capture_failed")
                continue
            current = manager.store.get_permission_state(self.context.scope)
            run_context = run_context.model_copy(update={"control_epoch": current["controlEpoch"]})
            identity = uuid.uuid5(uuid.NAMESPACE_URL, canonical_json([
                "native-teamwork-fixed", self._turn_id, self.config_digest, provider, model,
                self.context.selection_policy_revision])).hex
            decision = NativeSdkDecision(decision_id=identity, turn_id=self._turn_id,
                scope=self.context.scope, session_id=self.context.session_id,
                policy_revision=self.context.selection_policy_revision,
                selected_model=pair, context=run_context,
                capture_digest=digest_json({"teamwork": self.config_digest,
                    "provider": provider, "model": model,
                    "policyRevision": self.context.selection_policy_revision}))
            self._decisions[_pair_key(provider, model)] = decision
            self._decision_keys[identity] = _pair_key(provider, model)
            pool.append({"id": row.get("id") or model, "call_model": model,
                "provider": provider, "name": row.get("name") or model,
                "tier": row.get("tier") if row.get("tier") in {"fast", "balanced", "quality"}
                    else classify_model_tier(model, provider)})
        if not pool:
            raise PolicyDenied("native_teamwork_no_allowed_models")
        self._plan = resolve_team_plan(prompt, self.config, model_pool=pool)

    def _init_auto(self, get_pool, resolve_team_plan, prompt):
        from .native_chat_auto import NativeAutoSessionBroker
        from .model_selection import ModelRequirements, SelectionDecision
        from .contracts import ProviderSelection, new_id, utc_now
        from runtime.teamwork_orchestrator import classify_model_tier
        delegate = NativeAutoSessionBroker(self.context, self.session, service=self.service,
            execution_policy=self.execution_policy)
        self._auto_delegate = delegate
        policy = self.service.get_policy(self.context.scope, self.context.session_id)
        if not policy.revision or policy.mode != "auto":
            raise PolicyDenied("native_teamwork_auto_policy_required")
        manager = self.service.manager
        resolved, entries = self.service._entries(self.context.scope,
            self.service._catalog(self.context.scope))
        from .model_selection import _local_provider
        from .runner import provider_configuration_digest
        from .native_chat_auto import native_sdk_supported
        catalog = self.service._catalog(self.context.scope)
        if provider_configuration_digest(resolved.profile_home) != catalog.get("providerConfigurationDigest"):
            raise PolicyDenied("provider_connection_changed")
        teamwork_pool = get_pool(profile_name=self.context.profile_name)
        pool = []
        decisions = {}
        self._candidate_diagnostics = []

        def reject(provider, model, code):
            if len(self._candidate_diagnostics) < 64:
                self._candidate_diagnostics.append({
                    "provider": _safe_candidate_label(provider, 160),
                    "model": _safe_candidate_label(model, 240),
                    "code": code if code in _TEAMWORK_CANDIDATE_REJECTIONS else "candidate_capture_failed",
                })

        requirements = ModelRequirements(data_class="private", data_classes=("workspace",),
            required_capabilities=("text",))
        for row in teamwork_pool:
            provider = str(row.get("provider") or "")
            model = str(row.get("call_model") or row.get("id") or "")
            if not native_sdk_supported(provider):
                reject(provider, model, "unsupported_native_adapter")
                continue
            pair = ModelPair(provider=provider, model=model)
            catalog_row = entries.get(pair)
            if pair not in policy.allowed_models:
                reject(provider, model, "model_not_allowlisted")
                continue
            if not catalog_row:
                reject(provider, model, "catalog_model_missing")
                continue
            context_length = catalog_row.get("contextLength")
            if type(context_length) is not int or context_length < 1:
                reject(provider, model, "context_length_unavailable")
                continue
            local = _local_provider(resolved.profile_home, provider)
            if not local and (policy.cloud_policy != "allow"
                    or any(kind not in policy.allowed_cloud_data_classes
                        for kind in (requirements.data_class, *requirements.data_classes))):
                reject(provider, model, "cloud_policy_denied")
                continue
            try:
                refs = self.service._refs(self.context.scope, pair)
                selected = ProviderSelection(provider_config_ref=catalog["providerConfigurationDigest"],
                    provider=provider, model=model, context_length=context_length)
                run_context = manager.make_context(self.context.scope, selected,
                    connection_bindings=refs, interactive=True)
                manager._validate_connections(run_context)
                manager._governance(run_context, prepare=True)
            except PolicyDenied as exc:
                reject(provider, model, getattr(exc, "code", "candidate_capture_denied"))
                continue
            except Exception:
                reject(provider, model, "candidate_capture_failed")
                continue
            current = manager.store.get_permission_state(self.context.scope)
            run_context = run_context.model_copy(update={"control_epoch": current["controlEpoch"]})
            decision_id = uuid.uuid5(uuid.NAMESPACE_URL, canonical_json([
                "native-teamwork-decision", self._turn_id, provider, model,
                self.context.selection_policy_revision])).hex
            decision = SelectionDecision(decision_id=decision_id, turn_id=self._turn_id,
                scope=self.context.scope, session_id=self.context.session_id,
                policy_revision=policy.revision, selected_model=pair,
                locality="local" if local else "remote",
                route="orchestrator" if pair == policy.orchestrator else "model",
                reason="configured_orchestrator" if pair == policy.orchestrator else "first_eligible_allowed_model",
                requirements=requirements, context=run_context, captured_at=utc_now())
            try:
                self.service.validate_decision(decision)
            except PolicyDenied as exc:
                reject(provider, model, getattr(exc, "code", "candidate_capture_denied"))
                continue
            decisions[_pair_key(provider, model)] = decision
            self._decision_keys[decision_id] = _pair_key(provider, model)
            item = {"id": row.get("id") or model, "call_model": model,
                "provider": provider, "name": row.get("name") or model,
                "tier": row.get("tier") if row.get("tier") in {"fast", "balanced", "quality"}
                    else classify_model_tier(model, provider)}
            pool.append(item)
        if not pool:
            raise PolicyDenied("native_teamwork_no_allowed_models")
        self._plan = resolve_team_plan(prompt, self.config, model_pool=pool)
        self._plan["candidate_rejections"] = list(self._candidate_diagnostics)
        self._decisions.update(decisions)
        self._policy = policy

    def managed_model_choices(self):
        """Return only the Parent-captured models in this immutable Teamwork plan."""
        self._validate()
        choices = set()
        for decision in self._decisions.values():
            self._decision(decision.decision_id)
            choices.add((decision.selected_model.provider, decision.selected_model.model))
        if not choices:
            raise PolicyDenied("native_teamwork_no_allowed_models")
        return tuple(sorted(choices))

    def _validate(self):
        if self._closed or self._stopping.is_set():
            raise PolicyDenied("native_teamwork_turn_closed")
        verify_native_context(self.context)
        from runtime.teamwork_orchestrator import load_teamwork_config
        current = load_teamwork_config(reload=True, profile_name=self.context.profile_name)
        if current.get("enabled") is not True or digest_json(current) != self.config_digest:
            raise PolicyDenied("teamwork_configuration_changed")
        policy = self.service.get_policy(self.context.scope, self.context.session_id)
        if policy.mode != self.context.selection_mode or policy.revision != self.context.selection_policy_revision:
            raise PolicyDenied("native_teamwork_policy_changed")
        if self._auto_delegate is not None:
            self._auto_delegate._validate()
        return policy

    def _decision(self, identity):
        key = self._decision_keys.get(identity)
        decision = self._decisions.get(key) if key else None
        if decision is None:
            raise PolicyDenied("native_teamwork_decision_unknown")
        self._validate()
        if self.context.selection_mode == "auto":
            self.service.validate_decision(decision)
        else:
            manager = self.service.manager
            current = manager.store.get_permission_state(self.context.scope)
            captured = decision.context
            if (captured.permission_revision != current["revision"]
                    or captured.control_epoch != current["controlEpoch"]):
                raise PolicyDenied("native_teamwork_authority_changed")
            manager.resolver.validate_context(captured)
            from .runner import provider_configuration_digest
            if provider_configuration_digest(Path(self.context.profile_home)) != captured.provider.provider_config_ref:
                raise PolicyDenied("provider_connection_changed")
            manager._validate_connections(captured)
            manager._governance(captured, prepare=True)
        return decision

    def _owned_claim(self, claim_id):
        decision_id = self._claims.get(claim_id)
        if not decision_id:
            raise PolicyDenied("native_teamwork_claim_unknown")
        decision = self._decision(decision_id)
        claim = self.service.admission.get_claim(self.context.scope, claim_id)
        if (claim is None or claim.decision_id != decision.decision_id
                or claim.session_id != self.context.session_id
                or claim.scope != self.context.scope or claim.turn_id != self._turn_id):
            raise PolicyDenied("native_teamwork_claim_mismatch")
        return decision, claim

    def __call__(self, context, method, payload):
        from .native_chat_worker import validate_rpc_payload
        if context != self.context:
            raise PolicyDenied("native_teamwork_context_changed")
        validate_rpc_payload(method, payload)
        with self._lock:
            if method == "teamwork_plan" and payload == {}:
                self._validate()
                if self._plan is None:
                    raise PolicyDenied("native_teamwork_plan_missing")
                decisions = {}
                for key, decision in self._decisions.items():
                    decisions[key] = {"decision": decision.model_dump(mode="json", by_alias=True),
                        "policy": self._policy.model_dump(mode="json", by_alias=True)}
                return {"plan": self._plan, "config": self.config, "decisions": decisions,
                    "candidateDiagnostics": list(self._candidate_diagnostics)}
            if method == "teamwork_validate" and set(payload) == {"decision"}:
                decision = self._decision(payload["decision"])
                validator = getattr(self.authorize, "validate_turn", None)
                if validator is not None and validator(decision) is not True:
                    raise PolicyDenied("native_teamwork_turn_revoked")
                managed = self.service.manager._governance(decision.context, prepare=True)
                return {"validated": True, "managed": bool(managed)}
            if method == "teamwork_claim":
                required = {"decision", "outputTokens"}
                if not required.issubset(payload) or set(payload) - required - {"inputTokensUpperBound", "inputBoundSource", "requestPurpose"}:
                    raise PolicyDenied("native_teamwork_claim_payload_invalid")
                decision = self._decision(payload["decision"])
                bound = payload.get("inputTokensUpperBound")
                source = payload.get("inputBoundSource", "context_capacity")
                if source not in {"context_capacity", "serialized_text_bytes"} or source == "serialized_text_bytes" and (type(bound) is not int or bound < 1):
                    raise PolicyDenied("native_teamwork_input_bound_invalid")
                purpose = payload.get("requestPurpose", "conversation")
                self._reserve_call(payload)
                try:
                    claim = self._claim_request(decision, output_tokens=payload["outputTokens"],
                        input_tokens_upper_bound=bound, input_bound_source=source,
                        request_purpose=purpose)
                except ResourceBusy as error:
                    # Unknown shared provider origins conservatively admit
                    # one active request. Queue only that exact condition so
                    # sibling Teamwork workers can proceed after the active
                    # response settles; all other resource limits still fail
                    # closed. This is a pending pre-claim, so refund its stage
                    # reserve before asking the child to retry.
                    self._refund_call(payload)
                    if str(error) == "Shared provider concurrency is occupied":
                        return {"pending": True}
                    raise
                except BaseException:
                    self._refund_call(payload)
                    raise
                self._claims[claim.claim_id] = decision.decision_id
                self._claim_reservations[claim.claim_id] = (purpose, int(payload["outputTokens"]))
                return claim.model_dump(mode="json", by_alias=True)
            if method == "teamwork_authorize" and set(payload) == {"claimId"}:
                decision, claim = self._owned_claim(payload["claimId"])
                if self.authorize is None:
                    return {"authorized": True}
                return {"authorized": self.authorize(decision, claim) is True}
            if method == "teamwork_compute_acquire" and set(payload) == {"claimId"}:
                decision, claim = self._owned_claim(payload["claimId"])
                if claim.state != "reserved" or claim.claim_id in self._compute:
                    raise PolicyDenied("native_teamwork_compute_replay")
                managed = self.service.manager._governance(decision.context, prepare=True)
                if managed and (self.authorize is None or self.authorize(decision, claim) is not True):
                    raise PolicyDenied("native_nova_execution_adapter_required")
                if not managed and self.authorize is not None and self.authorize(decision, claim) is not True:
                    raise PolicyDenied("native_teamwork_dispatch_denied")
                from .manager import ComputeAdmission
                acquired = ComputeAdmission.acquire_native_child(
                    "teamwork-provider:" + claim.claim_id,
                    scope_key=self.context.scope.key, parent_session_id=self.context.session_id,
                    parent_turn_id=self._turn_id, writer_generation=self.context.writer_generation)
                if acquired:
                    self._compute.add(claim.claim_id)
                return {"acquired": bool(acquired), "authorized": bool(acquired)}
            if method == "teamwork_compute_release" and set(payload) == {"claimId"}:
                self._owned_claim(payload["claimId"])
                self._release(payload["claimId"])
                return {"released": True}
            if method == "teamwork_observe":
                if set(payload) - {"claimId", "headers", "status", "errorCode"}:
                    raise PolicyDenied("native_teamwork_observe_payload_invalid")
                _decision, claim = self._owned_claim(payload.get("claimId"))
                from .native_chat_auto import _public_headers
                self.service.admission.observe(self.context.scope, claim.claim_id,
                    _public_headers(payload.get("headers") or {}), status_code=payload.get("status"),
                    error_code=payload.get("errorCode"))
                return {"observed": True}
            if method == "teamwork_usage":
                if set(payload) - {"claimId", "state", "usage", "deliveredDelta", "acknowledged", "errorCode"}:
                    raise PolicyDenied("native_teamwork_usage_payload_invalid")
                decision, claim = self._owned_claim(payload.get("claimId"))
                if payload.get("state") == "started" and claim.claim_id not in self._compute:
                    raise PolicyDenied("native_teamwork_compute_not_held")
                def live():
                    self._decision(decision.decision_id)
                    if self.service.manager._governance(decision.context, prepare=True):
                        if self.authorize is None or self.authorize.validate(decision, claim) is not True:
                            raise PolicyDenied("native_nova_sdk_capability_changed")
                kwargs = {}
                for wire, key in (("state", "state"), ("usage", "measured_tokens"), ("deliveredDelta", "delivered_delta"),
                    ("acknowledged", "acknowledged"), ("errorCode", "error_code")):
                    if wire in payload:
                        kwargs[key] = payload[wire]
                self.service.admission.update(self.context.scope, claim.claim_id, **kwargs,
                    validate=live if payload.get("state") == "started" else None)
                return {"updated": True}
            raise PolicyDenied("native_teamwork_rpc_unknown")

    def _claim_request(self, decision, *, output_tokens, input_tokens_upper_bound,
                       input_bound_source, request_purpose):
        if self.context.selection_mode == "auto":
            return self.service.claim_request(decision, output_tokens=output_tokens,
                input_tokens_upper_bound=input_tokens_upper_bound,
                input_bound_source=input_bound_source, request_purpose=request_purpose)
        policy = self.service.get_policy(self.context.scope, self.context.session_id)
        proposal = self.service._request_proposal(decision, policy,
            input_tokens_upper_bound=input_tokens_upper_bound, output_tokens=output_tokens)
        from .provider_admission import ProviderClaim
        claim = ProviderClaim.model_validate({**proposal.model_dump(),
            "request_purpose": request_purpose, "input_bound_source": input_bound_source})
        if (claim.scope != decision.scope or claim.session_id != decision.session_id
                or claim.turn_id != decision.turn_id
                or (claim.provider, claim.model) != (decision.selected_model.provider, decision.selected_model.model)
                or (decision.context.provider.provider, decision.context.provider.model)
                    != (claim.provider, claim.model)):
            raise PolicyDenied("native_teamwork_claim_contract_mismatch")
        return self.service.admission.claim(claim, policy.budget,
            validate=lambda: self._decision(decision.decision_id))

    def _reserve_call(self, payload):
        from runtime.teamwork_orchestrator import (
            TEAMWORK_MAX_OUTPUT_TOKENS_PER_TURN, TEAMWORK_MAX_REQUESTS_PER_TURN,
            TEAMWORK_STAGE_OUTPUT_TOKENS,
        )
        purpose = payload.get("requestPurpose", "conversation")
        if not isinstance(purpose, str) or not purpose.startswith("teamwork:"):
            raise PolicyDenied("native_teamwork_request_purpose_invalid")
        stage = purpose.split(":", 1)[1]
        limit = TEAMWORK_STAGE_OUTPUT_TOKENS.get(stage)
        output = payload.get("outputTokens")
        if type(output) is not int or output < 1 or limit is None or output > limit:
            raise PolicyDenied("native_teamwork_stage_output_limit")
        with self._lock:
            if (self._request_count + 1 > TEAMWORK_MAX_REQUESTS_PER_TURN
                    or self._output_reserved + output > TEAMWORK_MAX_OUTPUT_TOKENS_PER_TURN):
                raise PolicyDenied("native_teamwork_turn_budget_exhausted")
            self._request_count += 1
            self._output_reserved += output

    def _refund_call(self, payload):
        # A failed admission never created a provider claim. Once a claim has
        # been minted its bounded request/output reserve remains spent for the
        # whole turn, including cancellations and provider failures.
        with self._lock:
            self._request_count = max(0, self._request_count - 1)
            self._output_reserved = max(0, self._output_reserved - int(payload.get("outputTokens") or 0))

    @property
    def authorize(self):
        return self._authorize

    @authorize.setter
    def authorize(self, value):
        self._authorize = value
        for delegate in (self._fixed_delegate, self._auto_delegate):
            if delegate is not None:
                delegate.authorize = value

    def _release(self, claim_id):
        from .manager import ComputeAdmission
        ComputeAdmission.release("teamwork-provider:" + claim_id)
        self._compute.discard(claim_id)

    def request_stop(self, reason="cancel"):
        self._stopping.set()
        delegate = self._auto_delegate
        if delegate is not None:
            return delegate.request_stop(reason)
        file_ack = self.file_fence.request_stop(reason)
        browser_ack = self.browser_fence.request_stop(reason)
        return {"acknowledged": file_ack.get("acknowledged") is True and browser_ack.get("acknowledged") is True,
            "processesExited": file_ack.get("processesExited") is True,
            "targetClosed": browser_ack.get("acknowledged") is True, "reasonCode": reason}

    def close_after_exit(self):
        if self._closed:
            return
        delegate = self._auto_delegate
        if delegate is not None:
            for claim_id in tuple(self._claims):
                try:
                    claim = self.service.admission.get_claim(self.context.scope, claim_id)
                    if claim and claim.state in {"reserved", "started", "unknown"}:
                        self.service.admission.update(self.context.scope, claim_id,
                            state="cancelled", acknowledged=True)
                finally:
                    self._release(claim_id)
            delegate.close_after_exit()
            self._closed = True
            return
        file_ack = self.file_fence.request_stop("process_exited")
        if file_ack.get("acknowledged") is not True or file_ack.get("processesExited") is not True:
            raise PolicyDenied("native_file_exit_not_confirmed")
        browser_ack = self.browser_fence.request_stop("process_exited")
        if browser_ack.get("acknowledged") is not True:
            raise PolicyDenied("native_browser_exit_not_confirmed")
        if self.browser_fence.retire_after_exit().get("acknowledged") is not True:
            raise PolicyDenied("native_browser_retirement_not_confirmed")
        with self.service.manager._lock:
            self.service.manager._native_file_fences.pop(id(self.file_fence), None)
        with self._lock:
            self._closed = True
            for claim_id in tuple(self._claims):
                try:
                    claim = self.service.admission.get_claim(self.context.scope, claim_id)
                    if claim and claim.state in {"reserved", "started", "unknown"}:
                        self.service.admission.update(self.context.scope, claim_id, state="cancelled", acknowledged=True)
                finally:
                    self._release(claim_id)
        finish = getattr(self._authorize, "close_after_exit", None)
        if finish:
            finish()


class _NativeTeamworkProviderBridge:
    """One immutable model pair, adapted to the already-proven SDK proxy."""
    def __init__(self, context, rpc, decision, policy, request_purpose):
        from .native_chat_auto import NativeAutoBridge
        class _TeamworkCallBridge(NativeAutoBridge):
            def _rpc_operation(self, operation):
                return "teamwork_" + operation
            def _require_private(self):
                if (os.getenv("LASTBROWSER_NATIVE_CHAT_WORKER") != "1"
                        or os.getenv("LASTBROWSER_INDEPENDENT_WORKER") != "1"
                        or not same_path(os.getenv("SIDEKICK_HOME", ""), self.context.profile_home)):
                    raise PolicyDenied("native_teamwork_private_worker_required")
                verify_native_context(self.context)
            def _compute_acquire(self, claim):
                deadline = time.monotonic() + 30
                while time.monotonic() < deadline:
                    result = self.rpc.call("teamwork_compute_acquire", {"claimId": claim.claim_id})
                    if isinstance(result, dict) and result.get("acquired") is True and result.get("authorized") is True:
                        return True
                    time.sleep(.1)
                return False
            def _compute_release(self, claim):
                return self.rpc.call("teamwork_compute_release", {"claimId": claim.claim_id})
            def claim_request(self, decision, *, output_tokens=None, input_tokens_upper_bound=None,
                              request_purpose="conversation", input_bound_source="context_capacity"):
                return super().claim_request(decision, output_tokens=output_tokens,
                    input_tokens_upper_bound=input_tokens_upper_bound,
                    request_purpose=self.teamwork_request_purpose,
                    input_bound_source=input_bound_source)
        self.bridge = _TeamworkCallBridge(context, rpc)
        self.bridge.decision = decision
        self.bridge.policy = policy
        self.bridge.teamwork_request_purpose = request_purpose

    def wrap_client(self, client, *, provider, model):
        decision = self.bridge.decision
        if (provider != decision.selected_model.provider or model != decision.selected_model.model):
            raise PolicyDenied("native_teamwork_sdk_selection_changed")
        from .native_chat_auto import NativeAutoBridge
        with self.bridge._lock:
            return self.bridge._wrap_proven(client, agent=SimpleNamespace(
                model=model, provider=provider, api_mode=None,
                base_url=str(getattr(client, "base_url", "")),
                api_key=getattr(client, "api_key", None) or getattr(client, "auth_token", None),
                _native_auto_purpose="conversation", _flush_stream_delivery_tails=lambda: None))

    def mark_visible_delta(self):
        self.bridge.mark_visible_delta()

    def close(self):
        self.bridge.close()


class _NativeTeamworkRoleAdapter:
    def __init__(self, owner, provider, model, role, worker_id, attempt):
        self.owner, self.provider, self.model = owner, provider, model
        self.role, self.worker_id, self.attempt = role, worker_id, attempt

    def wrap_client(self, client, *, provider, model):
        if provider != self.provider or model != self.model:
            raise PolicyDenied("native_teamwork_role_selection_changed")
        return self.owner.provider_bridge(provider, model, self.role, self.worker_id, self.attempt).wrap_client(client, provider=provider, model=model)

    def mark_visible_delta(self):
        self.owner.provider_bridge(self.provider, self.model, self.role, self.worker_id, self.attempt).mark_visible_delta()


class NativeTeamworkBridge:
    def __init__(self, context, rpc):
        if (os.getenv("LASTBROWSER_NATIVE_CHAT_WORKER") != "1"
                or not same_path(os.getenv("SIDEKICK_HOME", ""), context.profile_home)):
            raise PolicyDenied("native_teamwork_private_worker_required")
        self.context, self.rpc = context, rpc
        self._lock = threading.RLock()
        self._plan = None
        self._config = None
        self._candidate_diagnostics = []
        self._decisions = {}
        self._bridges = {}

    def get_plan(self):
        with self._lock:
            if self._plan is None:
                result = self.rpc.call("teamwork_plan", {})
                from .model_selection import SelectionPolicy
                from .native_sdk_contracts import NativeSdkDecision
                from .native_chat_auto import _native_binding
                from .model_selection import SelectionDecision
                plan, config, decisions = result.get("plan"), result.get("config"), result.get("decisions")
                if not isinstance(plan, dict) or not isinstance(config, dict) or not isinstance(decisions, dict):
                    raise PolicyDenied("native_teamwork_parent_plan_invalid")
                diagnostics = result.get("candidateDiagnostics", [])
                if not _candidate_diagnostics_valid(diagnostics):
                    raise PolicyDenied("native_teamwork_candidate_diagnostics_invalid")
                plan.pop("candidate_rejections", None)
                if diagnostics:
                    plan["candidate_rejections"] = diagnostics
                for key, entry in decisions.items():
                    if not isinstance(key, str) or not isinstance(entry, dict):
                        raise PolicyDenied("native_teamwork_parent_decision_invalid")
                    policy = SelectionPolicy.model_validate(entry["policy"])
                    raw = entry["decision"]
                    decision = (SelectionDecision.model_validate(raw) if "requirements" in raw
                        else NativeSdkDecision.model_validate(raw))
                    if (decision.scope != self.context.scope or decision.session_id != self.context.session_id
                            or policy.scope != self.context.scope or policy.session_id != self.context.session_id):
                        raise PolicyDenied("native_teamwork_parent_decision_scope_invalid")
                    if isinstance(decision, SelectionDecision):
                        _native_binding(self.context, decision)
                    self._decisions[key] = (decision, policy)
                if not self._decisions:
                    raise PolicyDenied("native_teamwork_parent_decision_missing")
                self._plan, self._config = plan, config
                self._candidate_diagnostics = diagnostics
            return {"plan": self._plan, "config": self._config,
                "candidateDiagnostics": getattr(self, "_candidate_diagnostics", [])}

    def _role_pair(self, role, worker_id):
        self.get_plan()
        plan = self._plan
        if role == "planner": item = plan.get("planner")
        elif role == "worker": item = next((row for row in plan.get("workers", []) if row.get("worker_id") == worker_id), None)
        elif role == "critic": item = next((row for row in plan.get("pool", []) if row.get("id") == plan.get("critic")), None)
        elif role == "synthesizer": item = next((row for row in plan.get("pool", []) if row.get("id") == plan.get("synthesizer")), None)
        elif role == "single_provider": item = next(iter(plan.get("pool", [])), None)
        else: item = None
        if role == "planner" and isinstance(item, dict):
            model = item.get("call_model") or item.get("id")
            provider = item.get("provider")
        elif isinstance(item, dict):
            model = item.get("call_model") or item.get("model") or item.get("id")
            provider = item.get("provider") or item.get("provider_id")
        else:
            provider, model = None, None
        if not provider or not model:
            raise PolicyDenied("native_teamwork_role_not_in_parent_plan")
        return str(provider), str(model)

    def for_role(self, role, worker_id, provider, model, attempt):
        expected_provider, expected_model = self._role_pair(role, worker_id)
        backup_allowed = False
        if role == "worker" and (provider != expected_provider or model != expected_model):
            self.get_plan()
            backup_allowed = any(
                str(item.get("provider") or "") == provider
                and str(item.get("call_model") or item.get("id") or "") == model
                for item in self._plan.get("worker_pool", []) if isinstance(item, dict))
        if ((provider != expected_provider or model != expected_model) and not backup_allowed
                or type(attempt) is not int or attempt < 1):
            raise PolicyDenied("native_teamwork_role_not_in_parent_plan")
        return _NativeTeamworkRoleAdapter(self, provider, model, role, worker_id, attempt)

    def provider_bridge(self, provider, model, role="single_provider", worker_id="", attempt=1):
        self.get_plan()
        key = _pair_key(provider, model)
        with self._lock:
            bridge_key = (key, role, worker_id, attempt)
            bridge = self._bridges.get(bridge_key)
            if bridge is None:
                entry = self._decisions.get(key)
                if entry is None:
                    raise PolicyDenied("native_teamwork_model_not_in_parent_plan")
                decision, policy = entry
                bridge = _NativeTeamworkProviderBridge(self.context, self.rpc, decision, policy,
                    "teamwork:" + ("single_provider" if role == "single_provider" else role))
                self._bridges[bridge_key] = bridge
            return bridge

    def close(self):
        with self._lock:
            bridges = tuple(self._bridges.values())
            self._bridges.clear()
        for bridge in bridges:
            bridge.close()


_BRIDGE = None
_BIND_LOCK = threading.Lock()


def install_native_teamwork_bridge(context, rpc):
    global _BRIDGE
    with _BIND_LOCK:
        if _BRIDGE is not None:
            if _BRIDGE.context != context or _BRIDGE.rpc is not rpc:
                raise PolicyDenied("native_teamwork_worker_rebind_denied")
            return _BRIDGE
        _BRIDGE = NativeTeamworkBridge(context, rpc)
        return _BRIDGE


def get_bound_native_teamwork_bridge():
    return _BRIDGE if os.getenv("LASTBROWSER_NATIVE_CHAT_WORKER") == "1" else None
