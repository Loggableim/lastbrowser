"""Human-selected companion identity owned by an exact persisted Space scope.

Separate state avoids mutating Space governance, model choices or agent SOUL.
The historic `quickchat` purpose is a UI contract; callers decide how lightly
the same choice affects an ordinary chat's tone.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import threading
import uuid

from .contracts import canonical_json
from .store import RevisionConflict

PERSONAS = {"nova": "Nova", "analytical": "Orion", "developer": "Patch", "creative": "Spark", "mentor": "Zen"}
_LOCK = threading.RLock()
DIRECTORY = ".lastbrowser-companions"


def _name(value, personality):
    if value is None or value == "":
        return PERSONAS[personality]
    if not isinstance(value, str):
        raise ValueError("companion_name_requires_text")
    name = value.strip()
    if not name:
        return PERSONAS[personality]
    if len(name) > 80 or any(ord(char) < 32 or ord(char) == 127 for char in name):
        raise ValueError("companion_name_invalid")
    return name


def _default(scope):
    return {"schemaVersion": 1, "purpose": "quickchat", "scope": scope.model_dump(mode="json", by_alias=True),
        "personality": "nova", "botName": "Nova", "avatarKey": "nova", "revision": 1}


def _path(root, scope):
    root = Path(root).resolve()
    path = root / DIRECTORY / (scope.browser_profile_id + ".json")
    for node in (path.parent, path):
        if node.exists() and (node.is_symlink() or getattr(node.stat(), "st_file_attributes", 0) & 0x400):
            raise PermissionError("companion_linked_state_denied")
    return path


def _read(path, scope):
    if not path.exists():
        return None
    if path.stat().st_size > 8192:
        raise ValueError("companion_state_too_large")
    value = json.loads(path.read_text(encoding="utf-8"))
    if (not isinstance(value, dict) or value.get("scope") != scope.model_dump(mode="json", by_alias=True)
            or type(value.get("schemaVersion")) is not int or value.get("schemaVersion") != 1 or value.get("purpose") != "quickchat"
            or not isinstance(value.get("personality"), str) or value.get("personality") not in PERSONAS
            or type(value.get("revision")) is not int or value["revision"] < 1):
        raise ValueError("companion_state_invalid_or_foreign")
    value["botName"] = _name(value.get("botName"), value["personality"])
    value["avatarKey"] = value["personality"]
    return value


def _write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.parent / (".companion-" + uuid.uuid4().hex + ".tmp")
    try:
        temporary.write_text(canonical_json(value), encoding="utf-8")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _public(value):
    return {key: value[key] for key in ("schemaVersion", "purpose", "scope", "personality", "botName", "avatarKey", "revision")}


def _initial(store, resolved):
    value = _default(resolved.scope)
    marker = resolved.profile_home / "state" / "quickchat-companion-migration.json"
    if marker.is_file() and not marker.is_symlink() and marker.stat().st_size <= 8192:
        try:
            decision = json.loads(marker.read_text(encoding="utf-8"))
            if decision.get("migratedScope") == resolved.scope.key:
                style = decision.get("personality")
                if isinstance(style, str) and style in PERSONAS:
                    value.update(personality=style, avatarKey=style, botName=_name(decision.get("botName"), style))
        except (OSError, ValueError, AttributeError):
            pass
    if not marker.exists():
        # Existing bindings have no creation timestamp. Only an unambiguous
        # single Space can inherit legacy profile appearance; never guess one.
        spaces = {binding.scope.space_id for binding in store.list_bindings()}
        migrated = None
        if spaces == {resolved.scope.space_id}:
            for settings_path in (resolved.profile_home / "state" / "webui" / "settings.json",
                                  resolved.profile_home / "state" / "settings.json"):
                if not settings_path.is_file() or settings_path.is_symlink() or settings_path.stat().st_size > 1024 * 1024:
                    continue
                try:
                    settings = json.loads(settings_path.read_text(encoding="utf-8"))
                    personality = settings.get("personality", "nova")
                    if not isinstance(personality, str) or personality not in PERSONAS:
                        personality = "nova"
                    value.update(personality=personality, avatarKey=personality,
                                 botName=_name(settings.get("bot_name"), personality))
                    migrated = resolved.scope.key
                    break
                except (OSError, ValueError, AttributeError):
                    continue
        _write(marker, {"schemaVersion": 1, "migratedScope": migrated,
                        "personality": value["personality"], "botName": value["botName"],
                        "reason": "single_existing_space" if len(spaces) == 1 else "ambiguous_or_no_legacy_space"})
    return value


def companion_operation(store, resolver, scope, actor, payload):
    if not isinstance(payload, dict) or payload.get("action") not in {"get", "set"}:
        raise ValueError("companion_action_invalid")
    action = payload["action"]
    allowed = {"action"} if action == "get" else {"action", "personality", "botName", "expectedRevision", "clientRequestId"}
    if set(payload) - allowed:
        raise ValueError("companion_fields_invalid")
    with _LOCK:
        resolved = resolver.resolve(scope, authenticated_profile_name=actor)
        path = _path(resolved.space_root, scope)
        current = _read(path, scope)
        if current is None:
            current = _initial(store, resolved)
            resolver.resolve(scope, authenticated_profile_name=actor)
            _write(path, current)
        if action == "get":
            return _public(current)
        request_id = payload.get("clientRequestId")
        if request_id is not None:
            if not isinstance(request_id, str):
                raise ValueError("companion_request_id_invalid")
            request_id = uuid.UUID(request_id).hex
        request_digest = hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()
        if request_id and current.get("_lastRequestId") == request_id:
            if current.get("_lastRequestDigest") != request_digest:
                raise ValueError("companion_request_id_reused")
            return _public(current)
        expected = payload.get("expectedRevision")
        if expected is not None and (type(expected) is not int or expected != current["revision"]):
            raise RevisionConflict("companion_revision_changed")
        personality = payload.get("personality")
        if not isinstance(personality, str) or personality not in PERSONAS:
            raise ValueError("companion_personality_invalid")
        updated = {**_default(scope), "personality": personality, "avatarKey": personality,
                   "botName": _name(payload.get("botName"), personality), "revision": current["revision"] + 1}
        if request_id:
            updated.update(_lastRequestId=request_id, _lastRequestDigest=request_digest)
        accepted = resolver.resolve(scope, authenticated_profile_name=actor)
        if accepted.space_root != resolved.space_root:
            raise PermissionError("companion_space_changed")
        _path(accepted.space_root, scope)
        _write(path, updated)
        return _public(updated)


def read_quickchat_companion(context):
    """Read only from a verified native turn, without migration or writes."""
    from .native_chat_protocol import verify_native_context
    verify_native_context(context)
    value = _read(_path(context.space_root, context.scope), context.scope)
    verify_native_context(context)
    return _public(value) if value is not None else _default(context.scope)
