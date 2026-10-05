"""AUTO is a user-authorized policy over actual bound models, never a model ID.

Selection is deterministic unless the user configures an eligible orchestrator.
Every decision freezes one actual model for a turn. Decisions do not authorize
tools and each SDK request still needs fresh connection/policy admission.
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Annotated, Callable, Literal
from urllib.parse import urlsplit

from pydantic import Field, model_validator

from .connections import ConnectionRepository
from .contracts import Contract, Id, Ref, Scope, Utc, RunContext, ProviderSelection, PermissionScope, canonical_json, digest_json, new_id, utc_now
from .policy import PolicyDenied
from .provider_admission import AdmissionBudget, ProviderAdmission, ProviderClaim, provider_endpoint, provider_group_key
from .runner import provider_configuration_digest
from .scope import ScopeError
from .store import RevisionConflict, ResourceBusy


class ModelPair(Contract):
    provider: Ref
    model: Ref


class SelectionPolicy(Contract):
    schema_version: Literal[1] = 1
    scope: Scope
    session_id: Ref
    revision: Annotated[int, Field(ge=0)] = 0
    mode: Literal["fixed", "auto"] = "fixed"
    allowed_models: tuple[ModelPair, ...] = ()
    orchestrator: ModelPair | None = None
    cloud_policy: Literal["deny", "allow"] = "deny"
    allowed_cloud_data_classes: tuple[Literal["public", "private", "workspace", "browsing"], ...] = ()
    budget: AdmissionBudget = Field(default_factory=AdmissionBudget)
    updated_at: Utc = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def _coherent(self):
        if len(set(self.allowed_models)) != len(self.allowed_models) or len(self.allowed_models) > 64:
            raise ValueError("Model allowlist must be unique and bounded")
        if self.mode == "auto" and not self.allowed_models:
            raise ValueError("AUTO requires explicit actual model choices")
        if self.orchestrator is not None and self.orchestrator not in self.allowed_models:
            raise ValueError("Orchestrator must be an allowed actual model")
        if self.cloud_policy == "deny" and self.allowed_cloud_data_classes:
            raise ValueError("Cloud deny cannot grant cloud data classes")
        return self


class ModelRequirements(Contract):
    data_class: Literal["public", "private", "workspace", "browsing"] = "private"
    data_classes: tuple[Literal["public", "private", "workspace", "browsing"], ...] = Field(default=(), max_length=4)
    minimum_context_tokens: Annotated[int, Field(ge=1, le=16000000)] = 1
    required_capabilities: tuple[Literal["text", "vision", "tools"], ...] = ("text",)


class SelectionDecision(Contract):
    schema_version: Literal[1] = 1
    decision_id: Id
    turn_id: Id
    scope: Scope
    session_id: Ref
    policy_revision: Annotated[int, Field(ge=1)]
    selected_model: ModelPair
    reason: Literal["configured_orchestrator", "first_eligible_allowed_model",
        "observed_provider_headroom", "fewest_active_claims", "fewest_recent_local_claims",
        "fallback_after_admission_unavailable"]
    route: Literal["orchestrator", "model"]
    locality: Literal["local", "remote"]
    active_claims: Annotated[int, Field(ge=0, le=4096)] = 0
    recent_local_claims: Annotated[int, Field(ge=0, le=4096)] = 0
    observed_limit_source: Literal["response_headers", "unknown"] = "unknown"
    observed_limit_at: Utc | None = None
    remaining_headroom_basis_points: Annotated[int, Field(ge=0, le=10000)] | None = None
    fallback_count: Annotated[int, Field(ge=0, le=64)] = 0
    requirements: ModelRequirements
    context: RunContext
    captured_at: Utc

    def public_view(self):
        return {key: value for key, value in self.model_dump(mode="json", by_alias=True).items() if key != "context"}


def _policy_key(scope, session_id):
    return uuid.uuid5(uuid.NAMESPACE_URL, "lastbrowser:model-policy:" + scope.key + ":" + session_id).hex


class SelectionPolicyRepository:
    def __init__(self, store, *, session_validator: Callable):
        self.store, self.validate_session = store, session_validator

    def get(self, scope: Scope, session_id: str) -> SelectionPolicy:
        self.validate_session(scope, session_id)
        row = self.store._one("SELECT result_json FROM ia_request_results WHERE scope_key=? AND operation='model_policy' AND request_id=?", (self.store._scope(scope), _policy_key(scope, session_id)))
        value = SelectionPolicy.model_validate_json(row[0]) if row else SelectionPolicy(scope=scope, session_id=session_id)
        if value.scope != scope or value.session_id != session_id:
            raise ScopeError("Saved selection policy belongs to another chat")
        return value

    def set(self, scope: Scope, session_id: str, draft: dict, *, expected_revision: int,
            client_request_id: str, validate: Callable[[SelectionPolicy], None]) -> SelectionPolicy:
        # All authority fields are server-derived, not taken from model/renderer.
        if set(draft) - {"mode", "allowedModels", "orchestrator", "cloudPolicy", "allowedCloudDataClasses", "budget"}:
            raise PolicyDenied("invalid_model_selection_policy")
        class RequestId(Contract):
            request_id: Id
        request_id = RequestId(request_id=client_request_id).request_id
        request = {"sessionId": session_id, "draft": draft, "expectedRevision": expected_revision}
        with self.store.transaction():
            cached = self.store.get_request_result(scope, "model_policy_set", request_id, request)
            if cached is not None:
                return SelectionPolicy.model_validate(cached)
            current = self.get(scope, session_id)
            if type(expected_revision) is not int or current.revision != expected_revision:
                raise RevisionConflict("Model policy changed; reload this chat")
            value = SelectionPolicy.model_validate({**draft, "scope": scope, "sessionId": session_id,
                "revision": current.revision + 1, "updatedAt": utc_now()})
            validate(value)
            binding = self.store.get_binding(scope)
            if binding is None or binding.tombstoned_at:
                raise ScopeError("Selection policy belongs to a retired Space")
            self.store._conn.execute("INSERT INTO ia_request_results VALUES(?,?,?,?,?,?) ON CONFLICT(scope_key,operation,request_id) DO UPDATE SET result_json=excluded.result_json,request_digest=excluded.request_digest",
                (scope.key, _policy_key(scope, session_id), "model_policy", digest_json(value), canonical_json(value), utc_now()))
            self.store._remember(scope, "model_policy_set", request_id, request, value)
            return value


def _local_provider(home: Path, provider: str) -> bool:
    """Only an explicit own-profile loopback endpoint proves local transport."""
    endpoint = provider_endpoint(home, provider)
    if endpoint is None:
        return False
    parsed = urlsplit(endpoint)
    return parsed.scheme in {"http", "https"} and parsed.hostname in {"127.0.0.1", "::1", "localhost"} and parsed.username is None and parsed.password is None


class AutoSelectionService:
    def __init__(self, manager, admission: ProviderAdmission, *, session_validator: Callable,
                 catalog_provider: Callable | None = None, pricing_bound: Callable | None = None):
        self.manager, self.store, self.admission = manager, manager.store, admission
        self.policies = SelectionPolicyRepository(self.store, session_validator=session_validator)
        self.catalog_provider = catalog_provider
        self.pricing_bound = pricing_bound

    def _catalog(self, scope):
        if self.catalog_provider:
            return self.catalog_provider(scope)
        from .scoped_models import probe_catalog
        return probe_catalog(self.manager, scope, include_capabilities=False)

    def _entries(self, scope, catalog):
        resolved = self.manager.resolver.resolve(scope)
        if provider_configuration_digest(resolved.profile_home) != catalog.get("providerConfigurationDigest"):
            raise PolicyDenied("provider_connection_changed")
        entries = {}
        for group in catalog.get("groups", []):
            provider = group.get("provider_id")
            if not isinstance(provider, str) or not provider or group.get("configured") is not True:
                continue
            for row in (*group.get("models", []), *group.get("extra_models", [])):
                if isinstance(row, dict) and isinstance(row.get("id"), str) and row.get("supportsIndependent") is True:
                    entries[ModelPair(provider=provider, model=row["id"])] = row
        return resolved, entries

    def _refs(self, scope, pair):
        bindings = [row for row in ConnectionRepository(self.store).list(scope)
                    if row.connection_id == "provider:" + pair.provider and row.capability_id == "assistant.conversation"
                    and row.connection_kind == "provider" and row.status == "active" and "conversation" in row.permitted_use]
        if len(bindings) != 1:
            raise PolicyDenied("auto_provider_binding_required")
        from .contracts import ConnectionBinding
        row = bindings[0]
        return (ConnectionBinding(connection_id=row.connection_id, kind="provider", capability_id=row.capability_id,
            revision=row.revision, binding_id=row.binding_id, connection_revision=row.connection_revision),)

    def get_policy(self, scope, session_id):
        return self.policies.get(scope, session_id)

    def set_policy(self, scope, session_id, draft, *, expected_revision, client_request_id):
        # Discovery outside the write transaction. Save validation uses only
        # the already obtained catalog and exact local evidence/records.
        capabilities = self.manager.capabilities
        capabilities.catalog(scope, refresh=True)
        catalog = self._catalog(scope)
        resolved, entries = self._entries(scope, catalog)
        def validate(value):
            if provider_configuration_digest(resolved.profile_home) != catalog["providerConfigurationDigest"]:
                raise PolicyDenied("provider_connection_changed")
            for pair in value.allowed_models:
                if pair not in entries:
                    raise PolicyDenied("auto_model_not_in_bound_catalog")
                refs = self._refs(scope, pair)
                provider = ProviderSelection(provider_config_ref=catalog["providerConfigurationDigest"], provider=pair.provider,
                    model=pair.model, context_length=entries[pair].get("contextLength"))
                context = self.manager.make_context(scope, provider, connection_bindings=refs, interactive=True)
                self.manager._validate_connections(context)
        return self.policies.set(scope, session_id, draft, expected_revision=expected_revision,
                                 client_request_id=client_request_id, validate=validate)

    def select_turn(self, scope: Scope, session_id: str, turn_id: str, requirements: ModelRequirements) -> SelectionDecision:
        policy = self.policies.get(scope, session_id)
        if policy.mode != "auto" or not policy.revision:
            raise PolicyDenied("auto_policy_not_enabled")
        class TurnId(Contract):
            turn_id: Id
        turn_id = TurnId(turn_id=turn_id).turn_id
        request = {"sessionId": session_id, "requirements": requirements.model_dump(mode="json", by_alias=True)}
        cached = self.store.get_request_result(scope, "auto_turn", turn_id, request)
        if cached is not None:
            decision = SelectionDecision.model_validate(cached)
            self.validate_decision(decision)
            return decision
        self.manager.capabilities.catalog(scope, refresh=True)
        catalog = self._catalog(scope)
        resolved, entries = self._entries(scope, catalog)
        ordered = (policy.orchestrator,) + tuple(pair for pair in policy.allowed_models if pair != policy.orchestrator) if policy.orchestrator else policy.allowed_models
        busy = False
        skipped = 0
        available = []
        for order_index, pair in enumerate(ordered):
            row = entries.get(pair)
            if row is None:
                skipped += 1
                continue
            length = row.get("contextLength")
            if type(length) is not int or length < requirements.minimum_context_tokens:
                skipped += 1
                continue
            if "vision" in requirements.required_capabilities and row.get("supportsVision") is not True or "tools" in requirements.required_capabilities and row.get("supportsTools") is not True:
                skipped += 1
                continue
            local = _local_provider(resolved.profile_home, pair.provider)
            if not local and (policy.cloud_policy != "allow" or any(kind not in policy.allowed_cloud_data_classes for kind in (requirements.data_class, *requirements.data_classes))):
                skipped += 1
                continue
            try:
                refs = self._refs(scope, pair)
                provider = ProviderSelection(provider_config_ref=catalog["providerConfigurationDigest"], model=pair.model, provider=pair.provider, context_length=length)
                context = self.manager.make_context(scope, provider, connection_bindings=refs, interactive=True)
                self.manager._validate_connections(context)
                self.manager._governance(context, prepare=True)
            except PolicyDenied:
                skipped += 1
                continue
            current = self.store.get_permission_state(scope)
            context = context.model_copy(update={"control_epoch": current["controlEpoch"]})
            decision = SelectionDecision(decision_id=new_id(), turn_id=turn_id, scope=scope, session_id=session_id,
                policy_revision=policy.revision, selected_model=pair, locality="local" if local else "remote",
                route="orchestrator" if pair == policy.orchestrator else "model",
                reason="configured_orchestrator" if pair == policy.orchestrator else "first_eligible_allowed_model",
                requirements=requirements, context=context, captured_at=utc_now())
            try:
                # Selection is not an SDK reservation. The complete rendered
                # input is known only at the private SDK boundary; admission
                # then claims its actual bound before IO. Context eligibility
                # must not pretend that every request consumes the full window.
                proposed = self._request_proposal(decision, policy, input_tokens_upper_bound=0)
                self.admission.check_available(proposed, policy.budget, validate=lambda: self.validate_decision(decision))
            except ResourceBusy:
                busy = True
                skipped += 1
                continue
            except PolicyDenied as error:
                if error.code not in {"provider_billing_action_required", "provider_cost_metadata_required"}:
                    raise
                skipped += 1
                continue
            available.append((order_index, decision))
        if not available and busy:
            raise ResourceBusy("AUTO eligible providers are waiting for resource admission")
        if not available:
            raise PolicyDenied("auto_no_eligible_model")

        loads = self.admission.selection_loads([decision.selected_model.provider for _, decision in available])
        headrooms = [loads.get(decision.selected_model.provider, {}).get("remainingHeadroomBasisPoints")
            for _, decision in available]
        all_headroom_observed = len(available) > 1 and all(value is not None for value in headrooms)
        if policy.orchestrator is not None:
            orchestrator = next((item for item in available if item[1].selected_model == policy.orchestrator), None)
        else:
            orchestrator = None
        if orchestrator is not None:
            chosen = orchestrator
            reason = "configured_orchestrator"
        else:
            def load_key(item):
                order_index, decision = item
                value = loads.get(decision.selected_model.provider, {})
                headroom = value.get("remainingHeadroomBasisPoints")
                return (-(headroom or 0) if all_headroom_observed else 0,
                    value.get("activeClaims", 0), value.get("recentLocalClaims", 0), order_index)
            chosen = min(available, key=load_key)
            if all_headroom_observed:
                reason = "observed_provider_headroom"
            elif len({loads.get(item.selected_model.provider, {}).get("activeClaims", 0)
                    for _, item in available}) > 1:
                reason = "fewest_active_claims"
            elif len({loads.get(item.selected_model.provider, {}).get("recentLocalClaims", 0)
                    for _, item in available}) > 1:
                reason = "fewest_recent_local_claims"
            else:
                reason = "fallback_after_admission_unavailable" if skipped else "first_eligible_allowed_model"

        order_index, decision = chosen
        load = loads.get(decision.selected_model.provider, {})
        decision = decision.model_copy(update={"reason": reason,
            "active_claims": load.get("activeClaims", 0),
            "recent_local_claims": load.get("recentLocalClaims", 0),
            "observed_limit_source": load.get("observedSource", "unknown"),
            "observed_limit_at": load.get("observedAt"),
            "remaining_headroom_basis_points": load.get("remainingHeadroomBasisPoints"),
            "fallback_count": min(64, skipped)})
        with self.store.transaction():
            self.validate_decision(decision)
            cached = self.store.get_request_result(scope, "auto_turn", turn_id, request)
            if cached is not None:
                return SelectionDecision.model_validate(cached)
            self.store._remember(scope, "auto_turn", turn_id, request, decision)
        return decision

    def validate_decision(self, decision: SelectionDecision):
        if decision.context.scope != decision.scope or decision.context.provider.model != decision.selected_model.model or decision.context.provider.provider != decision.selected_model.provider:
            raise PolicyDenied("auto_decision_binding_invalid")
        policy = self.policies.get(decision.scope, decision.session_id)
        if policy.mode != "auto" or policy.revision != decision.policy_revision or decision.selected_model not in policy.allowed_models:
            raise PolicyDenied("auto_selection_policy_changed")
        current = self.store.get_permission_state(decision.scope)
        if current["revision"] != decision.context.permission_revision or current["controlEpoch"] != decision.context.control_epoch:
            raise PolicyDenied("auto_scope_authority_changed")
        self.manager.resolver.validate_context(decision.context)
        if provider_configuration_digest(Path(decision.context.resolved_profile_home)) != decision.context.provider.provider_config_ref:
            raise PolicyDenied("provider_connection_changed")
        self.manager._validate_connections(decision.context)
        self.manager._governance(decision.context, prepare=True)

    def claim_request(self, decision: SelectionDecision, *, claim_id: str | None = None,
                      input_tokens_upper_bound: int | None = None, output_tokens: int | None = None,
                      request_purpose="conversation", input_bound_source="context_capacity"):
        policy = self.policies.get(decision.scope, decision.session_id)
        claim = self._request_proposal(decision, policy, claim_id=claim_id, input_tokens_upper_bound=input_tokens_upper_bound, output_tokens=output_tokens)
        claim = ProviderClaim.model_validate({**claim.model_dump(), "request_purpose": request_purpose,
            "input_bound_source": input_bound_source})
        return self.admission.claim(claim, policy.budget, validate=lambda: self.validate_decision(decision))

    def _request_proposal(self, decision, policy, *, claim_id=None, input_tokens_upper_bound=None, output_tokens=None):
        # Without an actual tokenizer/count adapter, reserve the captured
        # model context capacity rather than invent an exact token count.
        input_bound = decision.context.provider.context_length if input_tokens_upper_bound is None else input_tokens_upper_bound
        if type(input_bound) is not int or input_bound < 0 or input_bound > decision.context.provider.context_length:
            raise PolicyDenied("auto_input_token_bound_invalid")
        output = policy.budget.max_output_tokens if output_tokens is None else output_tokens
        cost = self.pricing_bound(decision.selected_model, input_bound, output) if self.pricing_bound else None
        now = self.admission.now()
        claim = ProviderClaim(claim_id=claim_id or new_id(), decision_id=decision.decision_id, turn_id=decision.turn_id,
            scope=decision.scope, session_id=decision.session_id, provider=decision.selected_model.provider,
            model=decision.selected_model.model, group_key=provider_group_key(Path(decision.context.resolved_profile_home), decision.selected_model.provider),
            owner_generation=decision.context.runner_generation, permission_revision=decision.context.permission_revision,
            control_epoch=decision.context.control_epoch, policy_revision=decision.policy_revision, created_at=now, updated_at=now,
            admission_budget=policy.budget,
            reserved_input_tokens=input_bound, reserved_output_tokens=output, reserved_cost_microusd=cost)
        return claim

    def status(self, scope):
        """The explicit status route uses actual backend data and zero SDK calls."""
        return self.manager.activity(scope)
