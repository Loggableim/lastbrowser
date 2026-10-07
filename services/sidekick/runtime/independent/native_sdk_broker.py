"""Fixed native SDK calls use the same quota and compute admission as AUTO."""
from __future__ import annotations
import os
import threading
import uuid
from pathlib import Path

from .contracts import Scope, ProviderSelection, canonical_json, digest_json
from .model_selection import AutoSelectionService, ModelPair
from .native_chat_auto import NativeAutoBridge, NativeAutoSessionBroker, native_sdk_supported, _native_binding
from .native_sdk_contracts import NativeProviderCapture, NativeSdkDecision
from .native_chat_protocol import verify_native_context
from .policy import PolicyDenied
from .runner import provider_configuration_digest
from .scope import same_path


def capture_fixed_provider(session, *, profile_hub=None, service=None) -> NativeProviderCapture:
    """Private Parent capture only, from the saved own chat and scoped catalog."""
    from web.api.model_policy import service_for_native_chat
    from .scoped_models import probe_catalog, _entry
    from .scope_binding import provider_selection
    from runtime.model_metadata import MINIMUM_CONTEXT_LENGTH
    actor = session.profile or "default"
    if service is None:
        service, resolved = service_for_native_chat(session, session.space_scope, actor=actor, profile_hub=profile_hub)
    else:
        scope = Scope.model_validate(session.space_scope)
        resolved = service.manager.resolver.resolve(scope, authenticated_profile_name=actor)
        service.policies.validate_session(scope, session.session_id)
    scope = resolved.binding.scope
    policy = service.get_policy(scope, session.session_id)
    if policy.mode != "fixed":
        raise PolicyDenied("native_fixed_policy_changed")
    configured, _ = provider_selection(resolved)
    provider = session.model_provider or (configured.provider if configured else None)
    model = session.model or (configured.model if configured else None)
    antigravity_binding = None
    if provider == "antigravity":
        from runtime.antigravity_oauth import resolve_native_account_binding
        binding = resolve_native_account_binding(resolved.profile_home)
        if binding is not None:
            from .native_provider_capture import NativeAntigravityBinding
            antigravity_binding = NativeAntigravityBinding(account_id=binding["account_id"],
                project_id=binding["project_id"], digest=binding["digest"])
    if not model or not provider or (not native_sdk_supported(provider)
            and not (provider == "antigravity" and antigravity_binding is not None)):
        raise PolicyDenied("native_fixed_sdk_adapter_unavailable")
    catalog = probe_catalog(service.manager, scope, resolved=resolved, include_capabilities=False)
    group, entry = _entry(catalog, model, provider)
    if not group or group.get("configured") is not True or not entry or entry.get("supportsIndependent") is not True:
        raise PolicyDenied("native_fixed_model_not_in_bound_catalog")
    length = entry.get("contextLength")
    if type(length) is not int or length < MINIMUM_CONTEXT_LENGTH:
        raise PolicyDenied("context_metadata_required")
    selected = ProviderSelection(provider=provider, model=model, provider_config_ref=catalog["providerConfigurationDigest"], context_length=length)
    capabilities = service.manager.capabilities
    capabilities.catalog(scope, refresh=True)
    # A fixed UI-selected native call can use its explicit own-profile legacy
    # configuration. Existing confirmed bindings are captured, never minted.
    refs = tuple(capabilities.capture_provider(scope, selected, purpose="conversation"))
    if provider_configuration_digest(resolved.profile_home) != selected.provider_config_ref:
        raise PolicyDenied("provider_connection_changed")
    current = service.store.get_permission_state(scope)
    return NativeProviderCapture(scope=scope, session_id=session.session_id, provider=selected,
        antigravity_binding=antigravity_binding,
        connection_bindings=refs, permission_revision=current["revision"], control_epoch=current["controlEpoch"],
        policy_revision=policy.revision, budget=policy.budget)


class _FixedSelectionService(AutoSelectionService):
    """Existing admission, but a fixed decision has no routing/allowed-model fiction."""
    def validate_decision(self, decision):
        capture = self.capture
        policy = self.policies.get(decision.scope, decision.session_id)
        if policy.mode != "fixed" or policy.revision != capture.policy_revision or policy.budget != capture.budget:
            raise PolicyDenied("native_fixed_policy_changed")
        if (decision.capture_digest != digest_json(capture) or decision.scope != capture.scope
            or decision.session_id != capture.session_id or decision.context.provider != capture.provider
            or decision.context.connection_bindings != capture.connection_bindings
            or decision.selected_model != ModelPair(provider=capture.provider.provider, model=capture.provider.model)):
            raise PolicyDenied("native_fixed_capture_changed")
        current = self.store.get_permission_state(decision.scope)
        if current["revision"] != capture.permission_revision or current["controlEpoch"] != capture.control_epoch:
            raise PolicyDenied("native_fixed_authority_changed")
        self.manager.resolver.validate_context(decision.context)
        if provider_configuration_digest(Path(decision.context.resolved_profile_home)) != capture.provider.provider_config_ref:
            raise PolicyDenied("provider_connection_changed")
        self.manager._validate_connections(decision.context)
        self.manager._governance(decision.context, prepare=True)


class NativeSdkSessionBroker(NativeAutoSessionBroker):
    required_selection_mode = "fixed"

    def __init__(self, context, session, *, profile_hub=None, call_authorizer=None, service=None, execution_policy=None):
        capture = getattr(context, "provider_capture", None)
        if not isinstance(capture, NativeProviderCapture) or capture.scope != context.scope or capture.session_id != context.session_id:
            raise PolicyDenied("native_fixed_provider_capture_required")
        if service is None:
            from web.api.model_policy import service_for_native_chat
            service, _ = service_for_native_chat(session, session.space_scope, actor=context.profile_name, profile_hub=profile_hub)
        fixed = _FixedSelectionService(service.manager, service.admission,
            session_validator=service.policies.validate_session, catalog_provider=service.catalog_provider,
            pricing_bound=service.pricing_bound)
        fixed.capture = capture
        self.capture = capture
        super().__init__(context, session, profile_hub=profile_hub, call_authorizer=call_authorizer, service=fixed,
            execution_policy=execution_policy)
        captured = fixed.manager.make_context(context.scope, capture.provider,
            connection_bindings=capture.connection_bindings, interactive=True)
        captured = captured.model_copy(update={"control_epoch": capture.control_epoch})
        identity = uuid.uuid5(uuid.NAMESPACE_URL, canonical_json(["native-fixed", self._turn_id, digest_json(capture)])).hex
        decision = NativeSdkDecision(decision_id=identity, turn_id=self._turn_id, scope=context.scope,
            session_id=context.session_id, policy_revision=capture.policy_revision,
            selected_model=ModelPair(provider=capture.provider.provider, model=capture.provider.model),
            context=captured, capture_digest=digest_json(capture))
        request = {"streamId": context.stream_id, "writerGeneration": context.writer_generation, "captureDigest": digest_json(capture)}
        with fixed.store.transaction():
            existing = fixed.store.get_request_result(context.scope, "native_fixed_turn", identity, request)
            self._decision = NativeSdkDecision.model_validate(existing) if existing is not None else decision
            self._validate()
            fixed.validate_decision(self._decision)
            if existing is None:
                fixed.store._remember(context.scope, "native_fixed_turn", identity, request, self._decision)

    def _validate(self):
        if self._closed or self._stopping.is_set():
            raise PolicyDenied("native_fixed_turn_closed")
        if getattr(self.service.manager, "_native_admissions_closed", False):
            raise PolicyDenied("native_chat_host_shutdown")
        verify_native_context(self.context)
        if getattr(self.context, "provider_capture", None) != self.capture:
            raise PolicyDenied("native_fixed_capture_changed")
        if self.capture.provider.provider == "antigravity":
            from runtime.antigravity_oauth import resolve_native_account_binding
            binding = self.capture.antigravity_binding
            current = resolve_native_account_binding(self.context.profile_home,
                binding.account_id if binding is not None else None)
            if (binding is None or current is None or current.get("project_id") != binding.project_id
                    or current.get("digest") != binding.digest):
                raise PolicyDenied("native_antigravity_binding_changed")
        policy = self.service.get_policy(self.context.scope, self.context.session_id)
        if policy.mode != "fixed" or policy.revision != self.capture.policy_revision or policy.budget != self.capture.budget:
            raise PolicyDenied("native_fixed_policy_changed")
        if self._decision is not None:
            self.service.validate_decision(self._decision)
        return policy

    def validate_selection(self, model, provider, *, api_mode=None):
        if provider != "antigravity":
            return super().validate_selection(model, provider, api_mode=api_mode)
        self._require_private()
        binding = self.capture.antigravity_binding
        if (model != self.capture.provider.model or self.capture.provider.provider != provider
                or binding is None or api_mode not in {None, "chat_completions"}):
            raise PolicyDenied("native_antigravity_binding_changed")
        self._validate()

    def __call__(self, context, method, payload):
        allowed = {"fixed_validate": "auto_validate", "fixed_claim": "auto_claim",
            "fixed_observe": "auto_observe", "fixed_usage": "auto_usage",
            "compute_acquire": "compute_acquire", "compute_release": "compute_release", "file_execute": "file_execute", "browser_execute": "browser_execute"}
        if method not in allowed or context != self.context:
            raise PolicyDenied("native_fixed_rpc_not_allowed")
        if method == "fixed_validate" and payload == {}:
            with self._lock:
                policy = self._validate()
                managed = self.service.manager._governance(self._decision.context, prepare=True)
                validator = getattr(self.authorize, "validate_turn", None)
                if validator is not None and validator(self._decision) is not True:
                    raise PolicyDenied("native_nova_sdk_capability_changed")
                return {"validated": True, "managed": managed, "decision": self._decision.model_dump(mode="json", by_alias=True),
                    "policy": policy.model_dump(mode="json", by_alias=True)}
        return super().__call__(context, allowed[method], payload)


class NativeFixedSdkBridge(NativeAutoBridge):
    """The shared proven SDK wrapper; fixed native calls never select a model."""
    def _rpc_operation(self, operation):
        return "fixed_" + operation

    def _require_private(self):
        if (os.getenv("LASTBROWSER_NATIVE_CHAT_WORKER") != "1" or os.getenv("LASTBROWSER_INDEPENDENT_WORKER") != "1"
            or not same_path(os.getenv("SIDEKICK_HOME", ""), self.context.profile_home)
            or self.context.selection_mode != "fixed" or not isinstance(getattr(self.context, "provider_capture", None), NativeProviderCapture)):
            raise PolicyDenied("native_fixed_private_worker_required")
        verify_native_context(self.context)

    def prepare(self, args, kwargs, **_):
        self._require_private()
        values, options = tuple(args), dict(kwargs)
        capture = self.context.provider_capture
        if (values[0] != self.context.session_id or values[4] != self.context.stream_id
            or values[2] != capture.provider.model or options.get("model_provider") != capture.provider.provider):
            raise PolicyDenied("native_fixed_agent_selection_changed")
        result = self.rpc.call("fixed_validate", {})
        from .model_selection import SelectionPolicy
        decision = NativeSdkDecision.model_validate(result["decision"])
        _native_binding(self.context, decision)
        if decision.capture_digest != digest_json(capture):
            raise PolicyDenied("native_fixed_capture_changed")
        with self._lock:
            if self.decision is not None and self.decision != decision:
                raise PolicyDenied("native_fixed_capture_changed")
            self.decision, self.policy = decision, SelectionPolicy.model_validate(result["policy"])
        self.validate_selection(values[2], options["model_provider"])
        return values, options


_bound_bridge = None
_bind_lock = threading.Lock()


def install_native_sdk_bridge(context, rpc):
    global _bound_bridge
    with _bind_lock:
        if _bound_bridge is not None:
            raise PolicyDenied("native_fixed_bridge_already_bound")
        bridge = NativeFixedSdkBridge(context, rpc)
        _bound_bridge = bridge
        return bridge


def get_bound_native_sdk_bridge():
    return _bound_bridge if os.getenv("LASTBROWSER_NATIVE_CHAT_WORKER") == "1" else None


def prepare_native_fixed_turn(args, kwargs):
    bridge = get_bound_native_sdk_bridge()
    if bridge is None:
        raise PolicyDenied("native_fixed_bridge_required")
    return bridge.prepare(args, kwargs)
