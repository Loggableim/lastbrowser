"""Native, scoped chat-mode controls on the existing Session transcript."""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from runtime.chat_modes import ChatModeConflict, settings_view, update_settings
from runtime.independent.chat_binding import capture_chat_profile, native_chat_writer
from runtime.independent.scope import ScopeError

CAPABILITIES = {"plan": True, "grill_me": True, "boost": True, "goal": True,
                "gquota": False, "plugins": False}
_REQUEST_ID = re.compile(r"[A-Za-z0-9_-]{8,96}\Z")


def resolve_native_chat(session: Any, raw_scope: Any, *, actor: str, profile_hub=None):
    from runtime.independent.contracts import Scope
    from runtime.independent.scope import same_path
    if profile_hub is None:
        from web.api.independent import hub
        profile_hub = hub()
    saved = getattr(session, "space_scope", None)
    if not raw_scope or not saved or Scope.model_validate(raw_scope) != Scope.model_validate(saved):
        raise ScopeError("Chat mode belongs to the existing native chat scope")
    scope = Scope.model_validate(saved)
    _, resolver = profile_hub.by_scope(scope, actor)
    resolved = resolver.resolve(scope, authenticated_profile_name=actor)
    if (getattr(session, "profile", None) or "default") != actor or not any(
        path and same_path(session.workspace, path)
        for path in (resolved.binding.workspace_locator, str(resolved.space_root))
    ):
        raise ScopeError("Chat mode scope cannot be verified")
    return resolved


def read_chat_mode(session: Any, raw_scope: Any, *, actor: str, profile_hub=None) -> dict[str, Any]:
    resolve_native_chat(session, raw_scope, actor=actor, profile_hub=profile_hub)
    return {"ok": True, "mode": settings_view(getattr(session, "chat_execution_mode", None)),
            "capabilities": dict(CAPABILITIES)}


def change_chat_mode(session: Any, body: dict[str, Any], *, actor: str,
                     profile_hub=None) -> dict[str, Any]:
    """Caller holds the short per-session lock; no model call runs here."""
    if not body.get("space_scope") or getattr(session, "space_scope", None) is None:
        raise ScopeError("Chat modes require the existing native chat binding")
    request_id = body.get("client_request_id")
    if not isinstance(request_id, str) or not _REQUEST_ID.fullmatch(request_id):
        raise ValueError("client_request_id must identify this user command")
    digest = hashlib.sha256(json.dumps({"mode": body.get("mode"),
        "lifetime": body.get("lifetime"), "expected_revision": body.get("expected_revision")},
        sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    with native_chat_writer(session, actor=actor, owner_ref="chat_mode:" + request_id,
                            profile_hub=profile_hub):
        capture_chat_profile(session=session, raw_scope=body["space_scope"], actor=actor,
                             workspace=session.workspace, profile_hub=profile_hub)
        current = settings_view(getattr(session, "chat_execution_mode", None))
        receipts = getattr(session, "chat_mode_requests", None)
        if receipts is not None and not isinstance(receipts, list):
            raise ValueError("Saved chat mode requests cannot be verified")
        receipts = list(receipts or [])
        for receipt in receipts:
            if not isinstance(receipt, dict):
                raise ValueError("Saved chat mode request cannot be verified")
            if receipt.get("requestId") == request_id:
                if receipt.get("digest") != digest:
                    raise ChatModeConflict("Request identity was reused for a different mode command")
                return {"ok": True, "replayed": True, "mode": current,
                        "commandResult": receipt["mode"], "capabilities": dict(CAPABILITIES)}
        updated = update_settings(current, mode=body.get("mode"), lifetime=body.get("lifetime"),
                                  expected_revision=body.get("expected_revision"))
        session.chat_execution_mode = updated
        session.chat_mode_requests = [*receipts[-31:], {"requestId": request_id,
                                                       "digest": digest, "mode": updated}]
        session.save(touch_updated_at=True)
        return {"ok": True, "mode": updated, "capabilities": dict(CAPABILITIES)}
