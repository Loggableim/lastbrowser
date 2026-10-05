"""Merge parent-observed native streams into a fixed-owner activity snapshot."""
from __future__ import annotations

from .chat_activity import snapshot_native_chats
from .contracts import NativeChatObservation, utc_now


def observe_native_activity(resolved, snapshot):
    # The registry is process-local evidence of live parent execution. Persisted
    # pending flags alone are deliberately insufficient to call a chat active.
    from web.api.config import STREAMS, STREAMS_LOCK
    observed_at = utc_now()
    with STREAMS_LOCK:
        active_ids = tuple(STREAMS)
    existing = tuple(row.get("sessionId") or row.get("session_id") for row in snapshot.active_chats
                     if row.get("sessionId") or row.get("session_id"))
    if active_ids:
        native = snapshot_native_chats(
            resolved_scope=resolved.scope,
            actor_profile_name=resolved.profile.name,
            sessions_dir=resolved.space.sessions_dir,
            active_stream_ids=active_ids,
            existing_session_ids=existing,
            observed_at=observed_at,
        )
        rows = tuple(row.as_dict() for row in native.rows)
        source = native.source_actuality
    else:
        rows, source = (), "live"
    return snapshot.model_copy(update={
        "active_chats": (*snapshot.active_chats, *rows),
        "native_chat_observation": NativeChatObservation(source_state=source, observed_at=observed_at),
    })
