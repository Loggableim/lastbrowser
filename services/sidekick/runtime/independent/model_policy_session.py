"""One bounded native transcript-owner read, independent of UI profile globals."""
from __future__ import annotations

import codecs
import os
import re
import stat
from pathlib import Path

from .chat_activity import _linked, _metadata, _safe_directory
from .contracts import Scope
from .scope import ScopeError, same_path


def validate_native_session(resolved, session_id: str, *, actor: str):
    if not isinstance(session_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", session_id):
        raise ScopeError("Native chat identity is invalid")
    root = Path(resolved.space.sessions_dir)
    path = root / (session_id + ".json")
    try:
        if not _safe_directory(root) or _linked(path) or path.resolve().parent != root:
            raise ScopeError("Native chat storage cannot be verified")
        before = path.lstat()
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0))
        with os.fdopen(fd, "rb") as file:
            actual = os.fstat(file.fileno())
            if not stat.S_ISREG(actual.st_mode) or (actual.st_dev, actual.st_ino) != (before.st_dev, before.st_ino) or _linked(path) or not _safe_directory(root):
                raise ScopeError("Native chat changed its storage owner")
            prefix = file.read(65536)
            text = codecs.getincrementaldecoder("utf-8")().decode(prefix, final=False)
            metadata = _metadata(text.encode("utf-8"),
                required_fields=("session_id", "profile", "workspace", "space_scope"),
                stop_before_fields={
                    "space_profile_snapshot": ("{",),
                    "chat_mode_requests": ("[",), "child_parent_turns": ("[",),
                    "pending_user_message": ('"',), "pending_attachments": ("[",),
                    "compression_anchor_summary": ('"',),
                    "gateway_routing_history": ("[",), "composer_draft": ('"', "{"),
                    "grill_state": ("{",), "grill_history": ("[",),
                })
            after = os.fstat(file.fileno())
            if (after.st_size, after.st_mtime_ns) != (actual.st_size, actual.st_mtime_ns):
                raise ScopeError("Native chat changed during owner validation")
        if metadata is None or metadata.get("session_id") != session_id or metadata.get("profile") != actor:
            raise ScopeError("Native chat metadata cannot be verified")
        if Scope.model_validate(metadata.get("space_scope")) != resolved.binding.scope:
            raise ScopeError("Native chat belongs to another Space")
        workspace = metadata.get("workspace")
        if not isinstance(workspace, str) or not any(value and same_path(workspace, value)
                for value in (resolved.binding.workspace_locator, str(resolved.space_root))):
            raise ScopeError("Native chat workspace belongs to another Space")
        return metadata
    except (OSError, ValueError, UnicodeError, RecursionError) as error:
        raise ScopeError("Native chat owner metadata is unavailable") from error
