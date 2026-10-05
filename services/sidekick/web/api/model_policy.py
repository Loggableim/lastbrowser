"""Leaf adapter for private, human-selected native AUTO policies.

The route authenticates the Main bridge and passes the actual backend actor.
No renderer operation can select a turn, claim quota or supply SDK authority.
"""
from __future__ import annotations

from typing import Any

from runtime.independent.chat_binding import native_chat_writer
from runtime.independent.contracts import Scope
from runtime.independent.model_policy_session import validate_native_session
from runtime.independent.model_selection import AutoSelectionService
from runtime.independent.provider_admission import ProviderAdmission
from runtime.independent.scope import ScopeError
from web.api.chat_modes import resolve_native_chat


def service_for_native_chat(session, raw_scope, *, actor, profile_hub=None):
    from web.api import independent as api
    profile_hub = profile_hub or api.hub()
    resolved = resolve_native_chat(session, raw_scope, actor=actor, profile_hub=profile_hub)
    scope = resolved.binding.scope
    # Inventory is a pure read and proves that no unknown profile/store is
    # being created as a side effect of model-policy configuration.
    if not any(profile_id == scope.backend_profile_id for profile_id, _ in profile_hub.existing_store_paths()):
        raise ScopeError("Native model policy requires an existing registered profile store")
    store, resolver = profile_hub.by_scope(scope, actor)
    manager, _ = api._service_pair(store, resolver)
    def validate(expected_scope, session_id):
        if expected_scope != scope or session_id != session.session_id:
            raise ScopeError("Model policy belongs to another native chat")
        actual = resolver.resolve(scope, authenticated_profile_name=actor)
        validate_native_session(actual, session_id, actor=actor)
    admission = ProviderAdmission(store, base_home=profile_hub.base_home,
        existing_store_paths=profile_hub.existing_store_paths)
    service = AutoSelectionService(manager, admission, session_validator=validate)
    return service, resolved


def _execution_availability(manager, resolved, session):
    # A module/file being present is not an execution proof. The active host
    # must explicitly advertise its sealed worker and actual governance gate.
    probe = getattr(manager, "native_auto_execution_availability", None)
    if callable(probe):
        value = probe(resolved, session)
        if isinstance(value, dict) and set(value) <= {"available", "reasonCode", "sealedWorker", "managedCallAuthorizer"} and type(value.get("available")) is bool:
            managed = bool((resolved.space.load_config().get("nova_management") or {}).get("enrolled"))
            if value.get("available") is False or value.get("sealedWorker") is True and (not managed or value.get("managedCallAuthorizer") is True):
                return value
    return {"available": False, "sealedWorker": False, "managedCallAuthorizer": False,
            "reasonCode": "native_auto_execution_adapter_required"}


def handle_model_policy(session, body: dict[str, Any], actor: str, profile_hub=None) -> dict:
    if not isinstance(body, dict) or set(body) - {"action", "session_id", "space_scope", "draft", "expectedRevision", "clientRequestId"}:
        raise ValueError("Invalid native model policy request")
    if body.get("session_id", session.session_id) != session.session_id:
        raise ScopeError("Model policy belongs to another native chat")
    action = body.get("action", "get")
    if action not in {"get", "set"}:
        raise ValueError("Unsupported native model policy action")
    if action == "get" and any(key in body for key in ("draft", "expectedRevision", "clientRequestId")):
        raise ValueError("Read-only model policy request contains mutation fields")
    service, resolved = service_for_native_chat(session, body.get("space_scope"), actor=actor, profile_hub=profile_hub)
    scope = resolved.binding.scope
    if action == "set":
        if not isinstance(body.get("draft"), dict) or type(body.get("expectedRevision")) is not int or not isinstance(body.get("clientRequestId"), str):
            raise ValueError("Model policy save requires a draft, revision and request identity")
        with native_chat_writer(session, actor=actor, owner_ref="model_policy:" + body["clientRequestId"], profile_hub=profile_hub):
            policy = service.set_policy(scope, session.session_id, body["draft"],
                expected_revision=body["expectedRevision"], client_request_id=body["clientRequestId"])
    else:
        policy = service.get_policy(scope, session.session_id)
    status = [{"provider": provider, "snapshots": service.admission.limits(provider)}
              for provider in dict.fromkeys(pair.provider for pair in policy.allowed_models)]
    return {"schemaVersion": 1, "scope": scope.model_dump(mode="json", by_alias=True),
            "sessionId": session.session_id, "policy": policy.model_dump(mode="json", by_alias=True),
            "status": status, "executionAvailability": _execution_availability(service.manager, resolved, session)}
