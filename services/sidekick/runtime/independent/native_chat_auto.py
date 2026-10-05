"""Private native AUTO builder and Parent-owned quota/compute RPC.

Only the accepted native context and its live transcript lease identify a turn.
The child resolves its own SDK credentials; the Parent sees only IDs, bounds,
allowlisted response headers and measured usage. No client/model monkeypatching.
"""
from __future__ import annotations

import copy
import os
import threading
import time
import uuid
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit

from .auto_provider_proxy import AutoProviderProxy
from .contracts import canonical_json
from .model_selection import ModelRequirements, SelectionDecision, SelectionPolicy
from .native_chat_protocol import NativeChatContext, verify_native_context
from .policy import PolicyDenied
from .provider_admission import ProviderClaim, provider_endpoint
from .runner import provider_configuration_digest
from .scope import same_path
from .store import ResourceBusy


def native_sdk_supported(provider: str, *, api_mode=None) -> bool:
    """The concrete SDK builders wrapped below; discovery grants no authority."""
    return bool(provider) and api_mode not in {"bedrock_converse", "acp"} and provider not in {
        "bedrock", "antigravity", "copilot-acp", "google-gemini-cli", "gemini-cli", "gemini-oauth"}


def _trusted_gemini_native_endpoint(value: str) -> bool:
    """Accept only Google's HTTPS native Generative Language API origins."""
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except (TypeError, ValueError):
        return False
    return (parsed.scheme.lower() == "https"
        and parsed.hostname is not None
        and parsed.hostname.lower() == "generativelanguage.googleapis.com"
        and port in {None, 443}
        and parsed.username is None and parsed.password is None
        and not parsed.query and not parsed.fragment and "?" not in value and "#" not in value
        and parsed.path in {"/v1", "/v1alpha", "/v1beta"}
        and value == value.strip())


def _native_binding(context, decision):
    captured = decision.context
    if (decision.scope != context.scope or decision.session_id != context.session_id
        or not same_path(captured.resolved_profile_home, context.profile_home)
        or not same_path(captured.resolved_space_root, context.space_root)
        or captured.backend_profile_name != context.profile_name
        or captured.partition_key != context.partition_key
        or captured.binding_revision != context.binding_revision):
        raise PolicyDenied("native_auto_decision_scope_mismatch")


class NativeAutoSessionBroker:
    """One real native turn; never accepts renderer decisions or free claim IDs."""
    required_selection_mode = "auto"
    def __init__(self, context: NativeChatContext, session, *, profile_hub=None,
                 call_authorizer=None, service=None, execution_policy=None):
        verify_native_context(context)
        if (session.session_id != context.session_id or (session.profile or "default") != context.profile_name
            or session.space_scope != context.scope.model_dump(mode="json", by_alias=True)
            or not same_path(session.workspace, context.workspace)):
            raise PolicyDenied("native_auto_session_mismatch")
        if getattr(context, "selection_mode", "fixed") != self.required_selection_mode:
            raise PolicyDenied("native_auto_policy_not_captured")
        if service is None:
            from web.api.model_policy import service_for_native_chat
            service, _ = service_for_native_chat(session, session.space_scope,
                actor=context.profile_name, profile_hub=profile_hub)
        self.context, self.service, self.authorize = context, service, call_authorizer
        if getattr(service.manager, "_native_admissions_closed", False):
            raise PolicyDenied("native_chat_host_shutdown")
        self._lock = threading.RLock()
        self._decision = None
        self._claims = {}
        self._compute = set()
        self._closed = False
        self._stopping = threading.Event()
        self._turn_id = uuid.uuid5(uuid.NAMESPACE_URL,
            canonical_json([context.scope.key, context.session_id, context.stream_id, context.writer_generation])).hex
        self._validate()
        from .native_file_io import NativeFileIOFence
        self.file_fence = NativeFileIOFence(self, execution_policy)
        from .native_browser import NativeBrowserFence
        self.browser_fence = NativeBrowserFence(self, execution_policy)

    def _validate(self):
        if self._closed or self._stopping.is_set():
            raise PolicyDenied("native_auto_turn_closed")
        if getattr(self.service.manager, "_native_admissions_closed", False):
            raise PolicyDenied("native_chat_host_shutdown")
        verify_native_context(self.context)
        self.service.policies.validate_session(self.context.scope, self.context.session_id)
        policy = self.service.get_policy(self.context.scope, self.context.session_id)
        if policy.mode != "auto" or policy.revision != getattr(self.context, "selection_policy_revision", 0):
            raise PolicyDenied("native_auto_policy_changed")
        return policy

    def _owned_decision(self, identity):
        decision = self._decision
        if decision is None or identity != decision.decision_id:
            raise PolicyDenied("native_auto_decision_unknown")
        _native_binding(self.context, decision)
        self.service.validate_decision(decision)
        return decision

    def _owned_claim(self, claim_id):
        if claim_id not in self._claims:
            raise PolicyDenied("native_auto_claim_unknown")
        claim = self.service.admission.get_claim(self.context.scope, claim_id)
        if (claim is None or self._decision is None
            or claim.scope != self.context.scope
            or claim.decision_id != self._decision.decision_id
            or claim.session_id != self.context.session_id
            or claim.turn_id != self._turn_id
            or claim.owner_generation != self._decision.context.runner_generation):
            raise PolicyDenied("native_auto_claim_scope_mismatch")
        return claim

    def __call__(self, context, method, payload):
        from .native_chat_worker import validate_rpc_payload
        if context != self.context:
            raise PolicyDenied("native_auto_context_changed")
        if method == "file_execute":
            return self.file_fence.execute(payload)
        if method == "browser_execute":
            return self.browser_fence.dispatch(payload)
        validate_rpc_payload(method, payload)
        with self._lock:
            if self._closed:
                raise PolicyDenied("native_auto_turn_closed")
            # Quota observations/cleanup cannot dispatch SDK work and remain
            # recordable after a revoke. Starting a request is fenced below.
            if method not in {"auto_observe", "auto_usage", "compute_release"}:
                self._validate()
            if method == "auto_policy":
                if set(payload) - {"requirements"}:
                    raise PolicyDenied("native_auto_selection_payload_invalid")
                requirements = ModelRequirements.model_validate(payload.get("requirements") or {})
                from runtime.model_metadata import MINIMUM_CONTEXT_LENGTH
                if (requirements.data_class != "private" or "workspace" not in requirements.data_classes
                    or requirements.minimum_context_tokens < MINIMUM_CONTEXT_LENGTH):
                    raise PolicyDenied("native_auto_actual_requirements_missing")
                if self._decision is None:
                    self._decision = self.service.select_turn(context.scope, context.session_id,
                        self._turn_id, requirements)
                elif self._decision.requirements != requirements:
                    raise PolicyDenied("native_auto_requirements_changed")
                decision = self._owned_decision(self._decision.decision_id)
                return {"policy": self.service.get_policy(context.scope, context.session_id).model_dump(mode="json", by_alias=True),
                    "decision": decision.model_dump(mode="json", by_alias=True)}
            if method == "auto_validate":
                if set(payload) != {"decision"}:
                    raise PolicyDenied("native_auto_validation_payload_invalid")
                decision = self._owned_decision(payload["decision"])
                validator = getattr(self.authorize, "validate_turn", None)
                if validator is not None and validator(decision) is not True:
                    raise PolicyDenied("native_nova_sdk_capability_changed")
                return {"validated": True, "managed": self.service.manager._governance(decision.context, prepare=True)}
            if method == "auto_claim":
                if set(payload) - {"decision", "outputTokens", "inputTokensUpperBound", "inputBoundSource", "requestPurpose"} or not {"decision", "outputTokens"}.issubset(payload):
                    raise PolicyDenied("native_auto_claim_payload_invalid")
                if len(self._claims) >= 128:
                    raise ResourceBusy("Native AUTO turn receipt capacity exceeded",
                        diagnostic_reason="auto_receipt_capacity_exhausted")
                decision = self._owned_decision(payload["decision"])
                bound = payload.get("inputTokensUpperBound")
                source = payload.get("inputBoundSource", "context_capacity")
                if source not in {"context_capacity", "serialized_text_bytes"} or source == "serialized_text_bytes" and (type(bound) is not int or bound < 1):
                    raise PolicyDenied("native_auto_input_token_bound_invalid")
                try:
                    claim = self.service.claim_request(decision, output_tokens=payload["outputTokens"],
                        input_tokens_upper_bound=bound, input_bound_source=source,
                        request_purpose=payload.get("requestPurpose", "conversation"))
                except ResourceBusy as error:
                    # Child-side bounded wait keeps the RPC reader available
                    # to record the competing request's completion/cancel ACK.
                    if payload.get("requestPurpose") == "child" and str(error) == "Shared provider concurrency is occupied":
                        return {"pending": True}
                    raise
                self._claims[claim.claim_id] = True
                return claim.model_dump(mode="json", by_alias=True)
            if method == "compute_acquire":
                if set(payload) != {"claimId"}:
                    raise PolicyDenied("native_auto_compute_payload_invalid")
                claim = self._owned_claim(payload["claimId"])
                if claim.state != "reserved" or claim.claim_id in self._compute:
                    raise PolicyDenied("native_auto_compute_replay")
                decision = self._owned_decision(claim.decision_id)
                managed = self.service.manager._governance(decision.context, prepare=True)
                if managed and (self.authorize is None or self.authorize(decision, claim) is not True):
                    raise PolicyDenied("auto_nova_execution_adapter_required")
                if not managed and self.authorize is not None and self.authorize(decision, claim) is not True:
                    raise PolicyDenied("auto_provider_dispatch_denied")
                from .manager import ComputeAdmission
                owner_key = "auto-provider:" + claim.claim_id
                if claim.request_purpose == "child":
                    # Only child SDK builders created by the bound native
                    # parent agent reach this path. Keep their sibling
                    # inference slots tied to this exact writer turn.
                    acquired = ComputeAdmission.acquire_native_child(owner_key,
                        scope_key=context.scope.key, parent_session_id=context.session_id,
                        parent_turn_id=self._turn_id, writer_generation=context.writer_generation)
                else:
                    acquired = ComputeAdmission.acquire_legacy(owner_key,
                        scope_key=context.scope.key)
                if acquired:
                    self._compute.add(claim.claim_id)
                return {"acquired": acquired, "authorized": acquired}
            if method == "compute_release":
                if set(payload) != {"claimId"}:
                    raise PolicyDenied("native_auto_compute_payload_invalid")
                self._owned_claim(payload["claimId"])
                self._release(payload["claimId"])
                return {"released": True}
            if method == "auto_observe":
                if set(payload) - {"claimId", "headers", "status", "errorCode"}:
                    raise PolicyDenied("native_auto_response_payload_invalid")
                claim = self._owned_claim(payload["claimId"])
                headers = _public_headers(payload.get("headers") or {})
                self.service.admission.observe(context.scope, claim.claim_id, headers,
                    status_code=payload.get("status"), error_code=payload.get("errorCode"))
                return {"observed": True}
            if method == "auto_usage":
                if set(payload) - {"claimId", "state", "usage", "deliveredDelta", "acknowledged", "errorCode"}:
                    raise PolicyDenied("native_auto_usage_payload_invalid")
                claim = self._owned_claim(payload["claimId"])
                if payload.get("state") == "started" and claim.claim_id not in self._compute:
                    raise PolicyDenied("native_auto_compute_not_held")
                def authorize_start():
                    self._validate()
                    self._owned_decision(claim.decision_id)
                    validator = getattr(self.authorize, "validate", None)
                    if validator is not None and validator(self._decision, claim) is not True:
                        raise PolicyDenied("native_nova_sdk_capability_changed")
                kwargs = {}
                for wire, key in (("state", "state"), ("usage", "measured_tokens"),
                    ("deliveredDelta", "delivered_delta"), ("acknowledged", "acknowledged"), ("errorCode", "error_code")):
                    if wire in payload:
                        kwargs[key] = payload[wire]
                self.service.admission.update(context.scope, claim.claim_id, **kwargs,
                    validate=authorize_start if payload.get("state") == "started" else None)
                return {"updated": True}
            raise PolicyDenied("native_auto_rpc_unknown")

    def _release(self, claim_id):
        from .manager import ComputeAdmission
        ComputeAdmission.release("auto-provider:" + claim_id)
        self._compute.discard(claim_id)

    def close_after_exit(self):
        """Only the host calls this after confirmed OS process/Job teardown."""
        file_ack = self.file_fence.request_stop("process_exited")
        if file_ack.get("acknowledged") is not True or file_ack.get("processesExited") is not True:
            raise PolicyDenied("native_file_exit_not_confirmed")
        browser_ack = self.browser_fence.request_stop("process_exited")
        if browser_ack.get("acknowledged") is not True:
            raise PolicyDenied("native_browser_exit_not_confirmed")
        retired = self.browser_fence.retire_after_exit()
        if retired.get("acknowledged") is not True:
            raise PolicyDenied("native_browser_retirement_not_confirmed")
        with self.service.manager._lock:
            self.service.manager._native_file_fences.pop(id(self.file_fence), None)
        with self._lock:
            self._closed = True
            for claim_id in self._claims:
                try:
                    claim = self.service.admission.get_claim(self.context.scope, claim_id)
                    if claim and claim.state in {"reserved", "started", "unknown"}:
                        self.service.admission.update(self.context.scope, claim_id, state="cancelled", acknowledged=True)
                finally:
                    self._release(claim_id)
            finish = getattr(self.authorize, "close_after_exit", None)
            if finish is not None:
                finish()

    def request_stop(self, reason="cancel"):
        self._stopping.set()
        file_ack = self.file_fence.request_stop(reason)
        browser_ack = self.browser_fence.request_stop(reason)
        return {"acknowledged": file_ack.get("acknowledged") is True and browser_ack.get("acknowledged") is True,
            "processesExited": file_ack.get("processesExited") is True,
            "targetClosed": browser_ack.get("acknowledged") is True, "reasonCode": reason}


def _public_headers(headers):
    if not hasattr(headers, "items"):
        raise PolicyDenied("native_auto_response_headers_invalid")
    result = {}
    for name, value in headers.items():
        key = str(name).lower()
        if key == "retry-after" or key.startswith(("x-ratelimit-", "anthropic-ratelimit-")):
            if not isinstance(value, str) or len(key) > 128 or len(value) > 256 or len(result) >= 32:
                raise PolicyDenied("native_auto_response_headers_invalid")
            result[key] = value
    return result


class _RemoteAdmission:
    def __init__(self, bridge):
        self.bridge = bridge

    def update(self, scope, claim_id, **kwargs):
        if scope != self.bridge.context.scope:
            raise PolicyDenied("native_auto_claim_scope_mismatch")
        wire = {"claimId": claim_id}
        for key, value in kwargs.items():
            target = {"state": "state", "measured_tokens": "usage", "delivered_delta": "deliveredDelta",
                "acknowledged": "acknowledged", "error_code": "errorCode"}.get(key)
            if target is None:
                raise PolicyDenied("native_auto_usage_field_invalid")
            wire[target] = value
        return self.bridge.rpc.call(self.bridge._rpc_operation("usage"), wire)

    def observe(self, scope, claim_id, headers, *, status_code=None, error_code=None):
        if scope != self.bridge.context.scope:
            raise PolicyDenied("native_auto_claim_scope_mismatch")
        # Billing/spend denial remains a permanent user-action state in Parent.
        return self.bridge.rpc.call(self.bridge._rpc_operation("observe"), {"claimId": claim_id,
            "headers": _public_headers(headers), "status": status_code, "errorCode": error_code})


class NativeAutoBridge:
    def __init__(self, context, rpc):
        self.context, self.rpc = context, rpc
        self._lock = threading.RLock()
        self.decision = self.policy = None
        self._clients = []
        self._builders = {}
        self.admission = _RemoteAdmission(self)
        self.manager = SimpleNamespace(_governance=self._governance)
        self._require_private()

    def _rpc_operation(self, operation):
        return "auto_" + operation

    def _require_private(self):
        if (os.getenv("LASTBROWSER_NATIVE_CHAT_WORKER") != "1"
            or os.getenv("LASTBROWSER_INDEPENDENT_WORKER") != "1"
            or not same_path(os.getenv("SIDEKICK_HOME", ""), self.context.profile_home)
            or getattr(self.context, "selection_mode", "fixed") != "auto"):
            raise PolicyDenied("native_auto_private_worker_required")
        verify_native_context(self.context)

    def prepare(self, args, kwargs, *, requirements=None):
        self._require_private()
        values = list(args)
        if values[0] != self.context.session_id or values[4] != self.context.stream_id:
            raise PolicyDenied("native_auto_turn_mismatch")
        requirement = ModelRequirements.model_validate(requirements or {})
        from runtime.model_metadata import MINIMUM_CONTEXT_LENGTH
        capabilities = set(requirement.required_capabilities)
        attachments = values[5] if len(values) > 5 else kwargs.get("attachments")
        if any(isinstance(row, dict) and (row.get("is_image") is True
            or str(row.get("mime", "")).lower().startswith("image/")) for row in attachments or []):
            capabilities.add("vision")
        requirement = requirement.model_copy(update={"data_class": "private",
            "data_classes": tuple(sorted(set(requirement.data_classes) | {"workspace"})),
            "minimum_context_tokens": max(requirement.minimum_context_tokens, MINIMUM_CONTEXT_LENGTH),
            "required_capabilities": tuple(sorted(capabilities))})
        result = self.rpc.call("auto_policy", {"requirements": requirement.model_dump(mode="json", by_alias=True)})
        policy = SelectionPolicy.model_validate(result["policy"])
        decision = SelectionDecision.model_validate(result["decision"])
        _native_binding(self.context, decision)
        if (policy.scope != self.context.scope or policy.session_id != self.context.session_id
            or policy.mode != "auto" or policy.revision != getattr(self.context, "selection_policy_revision", 0)
            or decision.policy_revision != policy.revision or decision.requirements != requirement):
            raise PolicyDenied("native_auto_policy_changed")
        with self._lock:
            if self.decision is not None and self.decision != decision:
                raise PolicyDenied("native_auto_decision_changed")
            self.decision, self.policy = decision, policy
        values[2] = decision.selected_model.model
        options = dict(kwargs)
        options["model_provider"] = decision.selected_model.provider
        return tuple(values), options

    def validate_selection(self, model, provider, *, api_mode=None):
        self._require_private()
        if self.decision is None or model != self.decision.selected_model.model or provider != self.decision.selected_model.provider:
            raise PolicyDenied("native_auto_agent_selection_changed")
        if not native_sdk_supported(provider, api_mode=api_mode):
            raise PolicyDenied("native_auto_sdk_adapter_unavailable")
        if provider_configuration_digest(Path(self.context.profile_home)) != self.decision.context.provider.provider_config_ref:
            raise PolicyDenied("provider_connection_changed")
        self.validate_decision(self.decision)

    def runtime_config(self):
        from web.api.config import get_config
        configuration = copy.deepcopy(get_config())
        configuration["runtime_hooks_enabled"] = False
        configuration["provider_metadata_prewarm"] = False
        configuration["agent"] = {**(configuration.get("agent") or {}), "api_max_retries": 1}
        configuration["model"] = {**(configuration.get("model") or {}),
            "default": self.decision.selected_model.model, "provider": self.decision.selected_model.provider,
            "context_length": self.decision.context.provider.context_length}
        return configuration

    def wrap(self, client, *, agent, purpose=None):
        try:
            return self._wrap_proven(client, agent=agent, purpose=purpose)
        except BaseException:
            with self._lock: self._builders.pop(id(client), None)
            client.close()
            raise

    def _wrap_proven(self, client, *, agent, purpose=None):
        from openai import OpenAI
        from anthropic import Anthropic
        from runtime.gemini_native_adapter import GeminiNativeClient
        self.validate_selection(agent.model, agent.provider, api_mode=agent.api_mode)
        if type(client) not in {OpenAI, Anthropic, GeminiNativeClient}:
            raise PolicyDenied("native_auto_sdk_adapter_unavailable")
        endpoint = provider_endpoint(Path(self.context.profile_home), agent.provider)
        actual_endpoint = str(client.base_url).rstrip("/")
        expected_endpoint = str(endpoint or agent.base_url or client.base_url).rstrip("/")
        credential = getattr(client, "api_key", None) or getattr(client, "auth_token", None)
        gemini_headers = None
        if type(client) is GeminiNativeClient:
            # This is the synchronous Google AI Studio REST adapter only. Its
            # OpenAI-shaped Python surface must still resolve to Google's
            # native API host, and the captured profile endpoint (when set)
            # must match exactly. Gemini OAuth/CLI clients use other types.
            if not _trusted_gemini_native_endpoint(actual_endpoint):
                raise PolicyDenied("native_auto_sdk_endpoint_mismatch")
            custom_headers = getattr(client, "_default_headers", {})
            if (not isinstance(custom_headers, dict)
                    or any(str(name).strip().lower() == "x-goog-api-key" for name in custom_headers)):
                raise PolicyDenied("native_auto_sdk_credential_mismatch")
            gemini_headers = dict(custom_headers)
        if actual_endpoint != expected_endpoint:
            raise PolicyDenied("native_auto_sdk_endpoint_mismatch")
        if credential != agent.api_key:
            raise PolicyDenied("native_auto_sdk_credential_mismatch")
        proof = (agent, client, actual_endpoint, agent.api_key, gemini_headers)
        with self._lock: self._builders[id(client)] = proof
        def validate(actual, captured):
            self.validate_selection(agent.model, agent.provider, api_mode=agent.api_mode)
            return (self._builders.get(id(actual)) is proof and actual is client
                and captured == self.decision.context and str(actual.base_url).rstrip("/") == proof[2]
                and (getattr(actual, "api_key", None) or getattr(actual, "auth_token", None)) == proof[3]
                and (type(actual) is not GeminiNativeClient
                    or getattr(actual, "_default_headers", None) == proof[4]))
        purpose = purpose or getattr(agent, "_native_auto_purpose", "conversation")
        if purpose not in {"conversation", "child", "goal_judge", "teamwork:planner",
                           "teamwork:worker", "teamwork:critic", "teamwork:synthesizer",
                           "teamwork:single_provider"}:
            raise PolicyDenied("native_auto_request_purpose_invalid")
        from .native_token_bounds import serialized_text_bound
        def request_metadata(request, path):
            return {"input_tokens_upper_bound": serialized_text_bound(request, path),
                "input_bound_source": "serialized_text_bytes", "request_purpose": purpose}
        proxy = AutoProviderProxy(client, self, self.decision,
            client_binding_validator=validate, call_authorizer=lambda *_: True,
            compute_acquire=self._compute_acquire, compute_release=self._compute_release,
            request_metadata=request_metadata,
            stream_complete=agent._flush_stream_delivery_tails if purpose != "goal_judge" else None)
        proxy._native_delivery_owner = agent
        proxy._native_delivery_purpose = purpose
        with self._lock: self._clients.append(proxy)
        return proxy

    def validate_decision(self, decision):
        if decision != self.decision:
            raise PolicyDenied("native_auto_decision_changed")
        result = self.rpc.call(self._rpc_operation("validate"), {"decision": decision.decision_id})
        if not isinstance(result, dict) or result.get("validated") is not True:
            raise PolicyDenied("native_auto_decision_denied")
        return result

    def _governance(self, context, *, prepare=False):
        if self.decision is None or context != self.decision.context:
            raise PolicyDenied("native_auto_decision_changed")
        return self.validate_decision(self.decision).get("managed") is True

    def get_policy(self, scope, session_id):
        if scope != self.context.scope or session_id != self.context.session_id:
            raise PolicyDenied("native_auto_policy_scope_mismatch")
        self.validate_decision(self.decision)
        return self.policy

    def claim_request(self, decision, *, output_tokens=None, input_tokens_upper_bound=None,
                      request_purpose="conversation", input_bound_source="context_capacity"):
        self.validate_decision(decision)
        payload = {"decision": decision.decision_id, "outputTokens": output_tokens,
            "inputTokensUpperBound": input_tokens_upper_bound, "requestPurpose": request_purpose,
            "inputBoundSource": input_bound_source}
        deadline = time.monotonic() + 30
        while True:
            result = self.rpc.call(self._rpc_operation("claim"), payload)
            if not isinstance(result, dict) or result.get("pending") is not True:
                break
            if time.monotonic() >= deadline:
                raise ResourceBusy("Native AUTO provider admission is waiting for resource capacity",
                    diagnostic_reason="provider_admission_wait_expired")
            time.sleep(.1)
        claim = ProviderClaim.model_validate(result)
        if claim.scope != self.context.scope or claim.session_id != self.context.session_id or claim.decision_id != decision.decision_id:
            raise PolicyDenied("native_auto_claim_scope_mismatch")
        return claim

    def _compute_acquire(self, claim):
        deadline = time.monotonic() + 30
        while True:
            result = self.rpc.call("compute_acquire", {"claimId": claim.claim_id})
            if isinstance(result, dict) and result.get("acquired") is True and result.get("authorized") is True:
                return True
            if time.monotonic() >= deadline:
                return False
            time.sleep(.1)

    def goal_judge(self, *, system, prompt, timeout=30) -> str:
        """Fresh SDK transport using the already proven private builder identity."""
        self._require_private()
        self.validate_decision(self.decision)
        with self._lock:
            candidates = [proof for proof in self._builders.values()
                          if getattr(proof[0], "_native_auto_purpose", "conversation") == "conversation"]
        if not candidates:
            raise PolicyDenied("native_auto_goal_builder_required")
        agent, source, endpoint, key = candidates[0][:4]
        from openai import OpenAI
        from anthropic import Anthropic
        kwargs = {"base_url": endpoint, "max_retries": 0, "timeout": min(max(float(timeout), 1), 30)}
        headers = getattr(source, "_custom_headers", None)
        if headers: kwargs["default_headers"] = dict(headers)
        if type(source) is OpenAI:
            kwargs.update(api_key=key, organization=source.organization, project=source.project)
        elif type(source) is Anthropic:
            kwargs.update(api_key=source.api_key, auth_token=source.auth_token)
        else:
            raise PolicyDenied("native_auto_goal_sdk_adapter_unavailable")
        client = type(source)(**kwargs)
        proxy = None
        try:
            proxy = self.wrap(client, agent=agent, purpose="goal_judge")
            model = self.decision.selected_model.model
            if agent.api_mode == "anthropic_messages":
                response = proxy.messages.create(model=model, system=system,
                    messages=[{"role": "user", "content": prompt}], max_tokens=768, temperature=0)
                return "".join(getattr(block, "text", "") for block in response.content)
            if agent.api_mode == "codex_responses":
                response = proxy.responses.create(model=model, instructions=system,
                    input=[{"role": "user", "content": prompt}], max_output_tokens=768)
                return response.output_text or ""
            response = proxy.chat.completions.create(model=model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                max_tokens=768, temperature=0)
            return response.choices[0].message.content or ""
        finally:
            if proxy is not None: proxy.close()
            else: client.close()
            with self._lock:
                self._builders.pop(id(client), None)
                if proxy in self._clients: self._clients.remove(proxy)

    def _compute_release(self, claim):
        return self.rpc.call("compute_release", {"claimId": claim.claim_id})

    def mark_visible_delta(self, *, agent=None):
        # Request-local transports are freshly built and closed by AIAgent;
        # its stable client attribute does not identify the request that
        # produced this actual filtered callback. Never mark other children
        # or the Goal judge merely because the Parent rendered some text.
        with self._lock:
            clients = tuple(reversed(self._clients))
        for client in clients:
            if agent is not None:
                if getattr(client, "_native_delivery_owner", None) is not agent:
                    continue
            elif getattr(client, "_native_delivery_purpose", None) != "conversation":
                continue
            if getattr(client, "_native_delivery_purpose", None) == "goal_judge":
                continue
            with client._state["lock"]:
                produced_response = bool(client._state["active"] or client._state.get("last_response"))
            if produced_response:
                client.mark_visible_delta()
                return

    def close(self):
        for client in tuple(self._clients):
            client.close()
        self._clients.clear()
        self._builders.clear()


_BRIDGE: NativeAutoBridge | None = None


def install_native_auto_bridge(context, rpc) -> NativeAutoBridge:
    """Register before stdin reader startup; do not perform any RPC here."""
    global _BRIDGE
    if _BRIDGE is not None:
        if _BRIDGE.context != context or _BRIDGE.rpc is not rpc:
            raise PolicyDenied("native_auto_worker_rebind_denied")
        return _BRIDGE
    _BRIDGE = NativeAutoBridge(context, rpc)
    return _BRIDGE


def get_bound_native_auto_bridge() -> NativeAutoBridge | None:
    if os.getenv("LASTBROWSER_NATIVE_CHAT_WORKER") != "1":
        return None
    return _BRIDGE


def prepare_native_auto_turn(args, kwargs, *, requirements=None):
    bridge = get_bound_native_auto_bridge()
    if bridge is None:
        raise PolicyDenied("native_auto_bridge_missing")
    return bridge.prepare(args, kwargs, requirements=requirements)
