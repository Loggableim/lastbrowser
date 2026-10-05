"""Read child recovery data from the original native chat's saved ownership."""
from __future__ import annotations

import re
from typing import Any

from runtime.independent.child_contracts import ChildParentContext
from web.api.chat_modes import resolve_native_chat
from web.api.subagent_history import scoped_child_history


def child_history(session: Any, body: dict[str, Any], *, actor: str, profile_hub=None) -> dict[str, Any]:
    resolved = resolve_native_chat(session, body.get("space_scope"), actor=actor, profile_hub=profile_hub)
    saved_turns = getattr(session, "child_parent_turns", None)
    if saved_turns is not None and (not isinstance(saved_turns, list) or len(saved_turns) > 32):
        raise ValueError("Saved child parent turns cannot be verified")
    turns = list(saved_turns or [])
    if any(not isinstance(turn, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", turn) for turn in turns):
        raise ValueError("Saved child parent identity cannot be verified")
    requested = body.get("parent_turn_id")
    if requested is not None and requested not in turns:
        raise PermissionError("Child parent turn is not owned by this chat")
    cursors = body.get("after_sequence") or {}
    if not isinstance(cursors, dict) or len(cursors) > 128 or any(
        not isinstance(key, str) or len(key) > 200 or type(value) is not int or value < 0
        for key, value in cursors.items()
    ):
        raise ValueError("Invalid child recovery cursor")
    selected = [requested] if requested else turns[-8:]
    output = {"schemaVersion": 1, "scope": resolved.scope.model_dump(mode="json", by_alias=True),
              "parentSessionId": session.session_id, "parentTurns": turns,
              "runs": [], "events": [], "resyncNeeded": len(turns) > len(selected)}
    for turn in selected:
        captured = ChildParentContext(resolved.scope, resolved.profile_home, resolved.profile.name,
            resolved.space.sessions_dir, session.session_id, turn)
        actual = scoped_child_history(captured, after_sequence=cursors, limit=16)
        output["runs"].extend(actual["runs"])
        output["events"].extend(actual["events"])
        output["resyncNeeded"] = output["resyncNeeded"] or actual["resyncNeeded"]
    return output
