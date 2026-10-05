"""Read-only Nova facts from the accepted native Space, never lifecycle work.

This projection is not a NovaRoleContext, permission, model claim or admission.
It intentionally imports no Nova kernel, paths, lifecycle or user modules.
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import stat

from .contracts import Scope
from .native_chat_protocol import NativeChatContext, verify_native_context
from .scope import ScopeResolver, same_path
from .store import IndependentStore

MAX_SOURCE_BYTES = 256 * 1024
MAX_CONTEXT_BYTES = 8192
_SOURCE = Path("nova_data") / "entity" / "entity_state.json"
_PRESENCE = frozenset({"available", "idle", "busy", "thinking", "speaking", "listening", "resting", "offline"})


class _SourceUnavailable(ValueError):
    pass


def _utc(value):
    if not isinstance(value, str) or len(value) > 64:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if parsed.tzinfo else None
    except (ValueError, OverflowError):
        return None


def _file_identity(info):
    return info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns


def _read_owned_source(root: Path):
    path = root / _SOURCE
    for node in (path, *path.parents):
        try:
            info = node.lstat()
        except FileNotFoundError:
            raise _SourceUnavailable("entity_state_missing") from None
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
            raise _SourceUnavailable("entity_state_path_linked")
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode):
        raise _SourceUnavailable("entity_state_not_regular")
    if before.st_nlink > 1:
        raise _SourceUnavailable("entity_state_path_linked")
    if before.st_size > MAX_SOURCE_BYTES:
        raise _SourceUnavailable("entity_state_too_large")
    with os.fdopen(os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)), "rb") as stream:
        opened = os.fstat(stream.fileno())
        if not stat.S_ISREG(opened.st_mode) or _file_identity(opened) != _file_identity(before):
            raise _SourceUnavailable("entity_state_changed")
        data = stream.read(MAX_SOURCE_BYTES + 1)
        after_read = os.fstat(stream.fileno())
    after = path.lstat()
    if len(data) > MAX_SOURCE_BYTES:
        raise _SourceUnavailable("entity_state_too_large")
    if (_file_identity(before) != _file_identity(after_read)
            or _file_identity(before) != _file_identity(after)
            or stat.S_ISLNK(after.st_mode) or getattr(after, "st_file_attributes", 0) & 0x400):
        raise _SourceUnavailable("entity_state_changed")
    try:
        raw = json.loads(data.decode("utf-8"))
    except (ValueError, UnicodeError, RecursionError):
        raise _SourceUnavailable("entity_state_invalid") from None
    return raw, {"kind":"entity_state_v2", "relativePath":_SOURCE.as_posix(),
        "modifiedAt":datetime.fromtimestamp(after.st_mtime,timezone.utc).isoformat().replace("+00:00","Z"),
        "bytes":len(data)}


def _status(raw, context):
    if (not isinstance(raw, dict) or type(raw.get("schema_version")) is not int
            or raw["schema_version"] != 2 or type(raw.get("revision")) is not int
            or not 1 <= raw["revision"] <= 2**53-1 or not isinstance(raw.get("dynamic"), dict)):
        raise _SourceUnavailable("entity_state_invalid")
    if "scope" in raw:
        try:
            source_scope = Scope.model_validate(raw["scope"])
        except ValueError:
            raise _SourceUnavailable("entity_state_scope_invalid") from None
        if source_scope != context.scope:
            raise _SourceUnavailable("entity_state_scope_mismatch")
    result = {"stateRevision":raw["revision"]}
    updated = _utc(raw.get("updated_at"))
    if updated is not None:
        result["sourceUpdatedAt"] = updated
    presence = raw["dynamic"].get("presence")
    if isinstance(presence, str) and presence in _PRESENCE:
        result["presence"] = presence
    values = {}
    for key in ("mood", "energy", "focus", "fatigue", "restlessness"):
        value = raw["dynamic"].get(key)
        if type(value) in (int, float) and (-1 if key == "mood" else 0) <= value <= 1 and math.isfinite(value):
            values[key] = value
    if values:
        result["dynamic"] = values
    return result


def native_nova_context(context: NativeChatContext) -> dict | None:
    """Existing scope/lease proof, own stored status only, bounded facts DTO.

    Scope/lease failures propagate; missing status never runs a repair/fallback.
    An enabled linked Space reads only its own entity artifact, never source_space.
    """
    if not isinstance(context, NativeChatContext):
        raise TypeError("Native Nova context requires the accepted chat context")
    verify_native_context(context)
    store = IndependentStore(context.profile_home,context.scope.backend_profile_id,initialize=False)
    try:
        resolver = ScopeResolver(store,profiles_provider=lambda:[{"name":context.profile_name,"path":context.profile_home}])
        resolved = resolver.resolve(context.scope,authenticated_profile_name=context.profile_name)
        if not same_path(resolved.space_root,context.space_root):
            raise PermissionError("Native Nova Space changed")
        config = resolved.space.load_config()
        enabled = isinstance(config.get("nova"),dict) and config["nova"].get("enabled") is True
        is_nova = resolved.binding.native_slug == "nova"
        if not is_nova and not enabled:
            return None
    finally:
        store.close()
    snapshot = {"schemaVersion":1,"scope":context.scope.model_dump(mode="json",by_alias=True),
        "sessionId":context.session_id,"streamId":context.stream_id,
        "sourceObservedAt":datetime.now(timezone.utc).isoformat().replace("+00:00","Z"),
        "readOnly":True,"spaceMode":"native_nova" if is_nova else "nova_enabled",
        "novaEnabled":enabled,"statusAvailable":False}
    try:
        raw, source = _read_owned_source(Path(context.space_root))
        snapshot.update(status=_status(raw,context),source=source,statusAvailable=True)
    except _SourceUnavailable as error:
        snapshot["unavailableReason"] = str(error)
    except OSError:
        snapshot["unavailableReason"] = "entity_state_unreadable"
    verify_native_context(context)
    if len(json.dumps(snapshot,ensure_ascii=False,allow_nan=False).encode("utf-8")) > MAX_CONTEXT_BYTES:
        raise ValueError("Native Nova facts exceed the context bound")
    return snapshot
