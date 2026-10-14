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


def _local_store_capture(store, model, backend=None, compute_owner=None):
    if store is None:
        raise PolicyDenied('native_local_store_unavailable')
    value = store.provider_capability(model, agentic=True, backend=backend, compute_owner=compute_owner)
    if value.get('state') != 'ready' or value.get('toolCallingQualified') is not True:
        raise PolicyDenied('native_local_tool_quality_required')
    from runtime.local_ai.store_provider_host import capture_from_capability
    return capture_from_capability(value)


def _resolve_authoritative_account_id(session, resolved, explicit_account_id: str | None = None) -> str | None:
    """Return only a caller-supplied account ID with trusted selection provenance.

    Current chat sessions and Space snapshots do not carry an account selection;
    generic session/config aliases are preferences or stale data, not authority.
    """
    del session, resolved
    if explicit_account_id is None:
        return None
    value = str(explicit_account_id).strip()
    return value or None


def resolve_explicit_account_id(profile_home, *, account_id: str | None = None,
                                account_email: str | None = None) -> str | None:
    """Map an explicitly pinned account selection to its pool account ID.

    Fail-closed handoff helper for upstream call sites (chat-start API) that
    received a user-pinned account but not its pool ID: the pin is matched
    exactly once against the profile-local ``auth.json`` only — never the
    global pool — and anything missing, ambiguous, duplicated or empty returns
    ``None``. Callers must only pass a pin that came from an explicit user
    selection, never a rotated or default account. Full usable-entry
    validation (refresh grant, saved project, invalid_grant/exhausted) stays
    with ``resolve_native_account_binding`` at capture time, so a value
    resolved here can still fail closed there.
    """
    import json
    from runtime.antigravity_oauth import POOL_PROVIDER_ID

    pinned_id = str(account_id or "").strip()
    pinned_email = str(account_email or "").strip().casefold()
    if not pinned_id and not pinned_email:
        return None
    if profile_home is None or not str(profile_home).strip():
        return None
    auth_path = Path(profile_home).expanduser().resolve(strict=False) / "auth.json"
    try:
        if auth_path.is_symlink() or not auth_path.is_file():
            return None
        payload = json.loads(auth_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError):
        return None
    pool = payload.get("credential_pool") if isinstance(payload, dict) else None
    entries = pool.get(POOL_PROVIDER_ID) if isinstance(pool, dict) else None
    if not isinstance(entries, list):
        return None

    def _email_of(entry):
        email = entry.get("email")
        if not email and isinstance(entry.get("extra"), dict):
            email = entry["extra"].get("email")
        return str(email or "").strip().casefold()

    matches = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        entry_id = str(entry.get("id") or "").strip()
        if not entry_id:
            continue
        if pinned_id and entry_id != pinned_id:
            continue
        if pinned_email and _email_of(entry) != pinned_email:
            continue
        matches.append(entry_id)
    if len(matches) != 1:
        return None
    return matches[0]


def capture_fixed_provider(session, *, profile_hub=None, service=None, account_id: str | None = None) -> NativeProviderCapture:
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
        authoritative_account = _resolve_authoritative_account_id(
            session, resolved, explicit_account_id=account_id
        )
        binding = resolve_native_account_binding(resolved.profile_home, account_id=authoritative_account)
        if binding is not None:
            from .native_provider_capture import NativeAntigravityBinding
            antigravity_binding = NativeAntigravityBinding(account_id=binding["account_id"],
                project_id=binding["project_id"], digest=binding["digest"])
    if not model or not provider or (not native_sdk_supported(provider)
            and not (provider == "antigravity" and antigravity_binding is not None)):
        raise PolicyDenied("native_fixed_sdk_adapter_unavailable")
    catalog = probe_catalog(service.manager, scope, resolved=resolved, include_capabilities=True)
    group, entry = _entry(catalog, model, provider)
    if not group or group.get("configured") is not True or not entry or entry.get("supportsIndependent") is not True:
        raise PolicyDenied("native_fixed_model_not_in_bound_catalog")
    length = entry.get("contextLength")
    local_runtime = None
    if provider == 'local-store':
        from runtime.local_ai.store_provider_host import scoped_store
        local_runtime = _local_store_capture(scoped_store(scope, actor), model)
        if length != local_runtime.context_tokens:
            raise PolicyDenied('native_local_context_changed')
    elif type(length) is not int or length < MINIMUM_CONTEXT_LENGTH:
        raise PolicyDenied("context_metadata_required")
    selected = ProviderSelection(provider=provider, model=model, provider_config_ref=catalog["providerConfigurationDigest"], context_length=length)
    capabilities = service.manager.capabilities
    capabilities.catalog(scope, refresh=True, discovered_catalog=catalog)
    # A fixed UI-selected native call can use its explicit own-profile legacy
    # configuration. Existing confirmed bindings are captured, never minted.
    refs = tuple(capabilities.capture_provider(scope, selected, purpose="conversation"))
    if provider_configuration_digest(resolved.profile_home) != selected.provider_config_ref:
        raise PolicyDenied("provider_connection_changed")
    current = service.store.get_permission_state(scope)
    return NativeProviderCapture(scope=scope, session_id=session.session_id, provider=selected,
        antigravity_binding=antigravity_binding, local_runtime=local_runtime,
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
        self._local_store = self._local_prepared = None
        self._local_leases = {}
        self._local_cancel = threading.Event()
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
        if self.capture.local_runtime is not None:
            from runtime.local_ai.store_provider_host import scoped_store
            store = self._local_store or scoped_store(self.context.scope, self.context.profile_name)
            owner = 'auto-provider:' + next(iter(self._local_leases)) if self._local_leases else None
            if _local_store_capture(store, self.capture.provider.model, self.capture.local_runtime.backend, owner) != self.capture.local_runtime:
                raise PolicyDenied('native_local_runtime_changed')
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
        if method == 'fixed_local_runtime':
            with self._lock:
                if context != self.context or payload != {} or self.capture.local_runtime is None:
                    raise PolicyDenied('native_local_private_rpc_invalid')
                self._validate()
                if self._local_prepared is None:
                    from runtime.local_ai.store_provider_host import scoped_store
                    self._local_store = scoped_store(context.scope, context.profile_name)
                    prepared, _ = self._local_store.prepare_provider_session(self.capture.provider.model,
                        cancel=self._local_cancel, agentic=True, backend=self.capture.local_runtime.backend)
                    self._local_prepared = prepared
                return {'endpoint': f'http://127.0.0.1:{self._local_prepared.port}/v1',
                        'credential': self._local_prepared.token}
        if method == 'compute_acquire' and self.capture.local_runtime is not None:
            with self._lock:
                if context != self.context or set(payload) != {'claimId'} or self._local_prepared is None:
                    raise PolicyDenied('native_local_prepared_session_required')
                self._validate()
                result = super().__call__(context, method, payload)
                if result.get('acquired') is not True:
                    return result
                claim_id = payload['claimId']
                try:
                    lease = self._local_store.provider_session(self.capture.provider.model,
                        cancel=self._local_cancel, agentic=True, backend=self.capture.local_runtime.backend,
                        compute_owner='auto-provider:' + claim_id, prepared=self._local_prepared)
                    lease.__enter__()
                    self._local_leases[claim_id] = lease
                    self._validate()
                except BaseException:
                    self._release(claim_id)
                    raise
                return result
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

    def _release(self, claim_id):
        lease = self._local_leases.get(claim_id)
        if lease is not None:
            # Throw a sentinel through the generator to skip post-turn work;
            # its finally must confirm own-session exit before borrowed admission ends.
            error = RuntimeError('native_local_request_finished')
            lease.__exit__(RuntimeError, error, None)
            self._local_leases.pop(claim_id, None)
        super()._release(claim_id)

    def request_stop(self, reason='cancel'):
        self._local_cancel.set()
        result = super().request_stop(reason)
        if self._local_prepared is not None:
            self._local_prepared.stop()
        return result


class NativeFixedSdkBridge(NativeAutoBridge):
    """The shared proven SDK wrapper; fixed native calls never select a model."""
    def _rpc_operation(self, operation):
        return "fixed_" + operation

    def _compute_acquire(self, claim):
        if self.context.provider_capture.local_runtime is None:
            return super()._compute_acquire(claim)
        result = self.rpc.call('compute_acquire', {'claimId': claim.claim_id}, timeout=60)
        return isinstance(result, dict) and result.get('acquired') is True and result.get('authorized') is True

    def close(self):
        try:
            super().close()
        finally:
            token = getattr(self, '_local_runtime_token', None)
            if token is not None:
                from runtime.local_ai.store_provider_host import reset_store_runtime
                reset_store_runtime(token)
                self._local_runtime_token = None

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
        if capture.local_runtime is not None and getattr(self, '_local_runtime_token', None) is None:
            from runtime.local_ai.store_provider_host import bind_store_runtime
            connection = self.rpc.call('fixed_local_runtime', {})
            if not isinstance(connection, dict) or set(connection) != {'endpoint', 'credential'}:
                raise PolicyDenied('native_local_private_connection_invalid')
            self._local_runtime_token = bind_store_runtime(self.context, connection['endpoint'], connection['credential'])
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
