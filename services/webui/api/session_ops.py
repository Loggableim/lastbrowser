"""Session-mutation operations for slash commands (/retry, /undo) and
read-only aggregators (/status, /usage). Operates on the webui's own
JSON Session store (api/models.py), not on hermes-agent's SQLite.

Behavior parity reference: gateway/run.py:_handle_*_command in
the hermes-agent repo.
"""
from __future__ import annotations
import logging
from typing import Any

from api.config import LOCK, _get_session_agent_lock
from api.models import get_session, SESSIONS

logger = logging.getLogger(__name__)


def _truncate_at_last_user(messages):
    history = messages or []
    last_user_idx = None
    for i in range(len(history) - 1, -1, -1):
        if isinstance(history[i], dict) and history[i].get('role') == 'user':
            last_user_idx = i
            break
    if last_user_idx is None:
        return None
    return history[:last_user_idx]


def retry_last(session_id: str) -> dict[str, Any]:
    """Truncate the session to before the last user message, return its text.

    Mirrors gateway/run.py:_handle_retry_command. Caller (webui frontend)
    is expected to put the returned text back in the composer and call
    send() to resume the conversation -- the agent's gateway calls its own
    _handle_message; the webui has no equivalent in-process pipeline.

    Raises:
        KeyError: session not found
        ValueError: no user message in transcript
    """
    # Acquire the per-session agent lock as the outermost lock so that the
    # read-modify-write of s.messages is serialised with the periodic
    # checkpoint thread, cancel_stream, and all other session writers.
    # Lock ordering: _agent_lock → LOCK → _write_session_index (LOCK).
    with _get_session_agent_lock(session_id):
        # get_session() and Session.save() both acquire the module-level LOCK
        # internally (the latter via _write_session_index()), and LOCK is a
        # non-reentrant threading.Lock — so they MUST be called outside our
        # own `with LOCK:` block to avoid self-deadlocking.
        #
        # The race we close is the read-modify-write of s.messages: two
        # concurrent /api/session/retry calls could otherwise both compute the
        # same last_user_idx from the same history and double-truncate. We
        # serialize just the in-memory mutation; persistence happens inside
        # the per-session lock so the checkpoint thread cannot race us.
        #
        # Stale-object guard: on a cache miss, two concurrent get_session()
        # calls can each load and cache a *different* Session instance for the
        # same session_id (the second store clobbers the first). Re-bind to
        # the canonical cached instance inside the lock so the mutation lands
        # on the object the next reader will see, not a stale parallel copy.
        s = get_session(session_id)  # raises KeyError if missing
        with LOCK:
            s = SESSIONS.get(session_id, s)
            history = s.messages or []
            last_user_idx = None
            for i in range(len(history) - 1, -1, -1):
                if history[i].get('role') == 'user':
                    last_user_idx = i
                    break
            if last_user_idx is None:
                raise ValueError('No previous message to retry.')

            last_user_text = _extract_text(history[last_user_idx].get('content', ''))
            removed_count = len(history) - last_user_idx
            s.messages = history[:last_user_idx]
            if isinstance(getattr(s, 'context_messages', None), list) and s.context_messages:
                truncated_context = _truncate_at_last_user(s.context_messages)
                if truncated_context is not None:
                    s.context_messages = truncated_context
        s.save()
    return {'last_user_text': last_user_text, 'removed_count': removed_count}


def undo_last(session_id: str) -> dict[str, Any]:
    """Remove the most recent user message and everything after it.

    Mirrors gateway/run.py:_handle_undo_command. Returns a preview of the
    removed text so the UI can confirm to the user.

    Raises:
        KeyError: session not found
        ValueError: no user message in transcript
    """
    # Acquire the per-session agent lock as the outermost lock so that the
    # read-modify-write of s.messages is serialised with the periodic
    # checkpoint thread, cancel_stream, and all other session writers.
    # Lock ordering: _agent_lock → LOCK → _write_session_index (LOCK).
    with _get_session_agent_lock(session_id):
        s = get_session(session_id)  # acquires LOCK transiently
        with LOCK:
            # Stale-object guard — see retry_last for the rationale.
            s = SESSIONS.get(session_id, s)
            history = s.messages or []
            last_user_idx = None
            for i in range(len(history) - 1, -1, -1):
                if history[i].get('role') == 'user':
                    last_user_idx = i
                    break
            if last_user_idx is None:
                raise ValueError('Nothing to undo.')

            removed_text = _extract_text(history[last_user_idx].get('content', ''))
            removed_count = len(history) - last_user_idx
            s.messages = history[:last_user_idx]
            if isinstance(getattr(s, 'context_messages', None), list) and s.context_messages:
                truncated_context = _truncate_at_last_user(s.context_messages)
                if truncated_context is not None:
                    s.context_messages = truncated_context
        s.save()  # outside LOCK -- save() re-acquires LOCK via _write_session_index()
    preview = (removed_text[:40] + '...') if len(removed_text) > 40 else removed_text
    return {
        'removed_count': removed_count,
        'removed_preview': preview,
    }


def session_status(session_id: str) -> dict[str, Any]:
    """Return a snapshot of session state for /status.

    Webui equivalent of gateway/run.py:_handle_status_command. The agent's
    "agent_running" comes from `session_key in self._running_agents`; the
    webui equivalent is whether the session has an active stream
    (active_stream_id is set).
    """
    s = get_session(session_id)
    inp = int(s.input_tokens or 0)
    out = int(s.output_tokens or 0)
    profile = getattr(s, 'profile', None) or 'default'
    try:
        from api.profiles import get_hermes_home_for_profile
        hermes_home = str(get_hermes_home_for_profile(profile))
    except Exception:
        hermes_home = ''
    return {
        'session_id': s.session_id,
        'title': s.title,
        'model': s.model,
        'profile': profile,
        'hermes_home': hermes_home,
        'workspace': s.workspace,
        'personality': s.personality,
        'message_count': len(s.messages or []),
        'created_at': s.created_at,
        'updated_at': s.updated_at,
        'agent_running': bool(getattr(s, 'active_stream_id', None)),
        'input_tokens': inp,
        'output_tokens': out,
        'total_tokens': inp + out,
        'estimated_cost': s.estimated_cost,
    }


def session_usage(session_id: str) -> dict[str, Any]:
    """Return token usage and cost for /usage.

    Mirrors gateway/run.py:_handle_usage_command's basic counters. The
    agent shows additional fields (rate-limit headroom etc.) that depend
    on provider API responses we don't have in webui -- those are deferred.
    """
    s = get_session(session_id)
    inp = int(s.input_tokens or 0)
    out = int(s.output_tokens or 0)
    return {
        'input_tokens': inp,
        'output_tokens': out,
        'total_tokens': inp + out,
        'estimated_cost': s.estimated_cost,
        'model': s.model,
    }


def _estimate_tokens(text: str) -> int:
    """Rough token estimation: ~4 chars per token."""
    if not text:
        return 0
    return max(1, len(text) // 4)


def _is_file_attachment(msg: dict) -> bool:
    """Check if a message contains a file attachment."""
    content = msg.get('content', '')
    if isinstance(content, list):
        for part in content:
            if isinstance(part, dict):
                if part.get('type') in ('file', 'image', 'document'):
                    return True
                if part.get('source', {}).get('type') in ('file', 'image'):
                    return True
    return False


def _is_memory_reference(msg: dict) -> bool:
    """Check if a message references memory entries."""
    text = _extract_text(msg.get('content', ''))
    # Heuristic: memory references often have "memory" patterns
    memory_keywords = ['[memory]', '[mem]', '#memory', 'from memory:',
                       'recalled:', 'memory entry']
    for kw in memory_keywords:
        if kw in text.lower():
            return True
    return False


def session_context_info(session_id: str) -> dict[str, Any]:
    """Return a breakdown of what's in the agent's context window.

    Returns estimated token counts per segment type (chat_history, system_prompt,
    files, memory) and their percentage of the total context window.

    Raises:
        KeyError: session not found
    """
    s = get_session(session_id)

    # Context window data from session (may be 0 if never reported by agent)
    context_length = int(getattr(s, 'context_length', 0) or 0)
    last_prompt_tokens = int(getattr(s, 'last_prompt_tokens', 0) or 0)
    threshold_tokens = int(getattr(s, 'threshold_tokens', 0) or 0)
    messages = s.messages or []

    # Default context window (128K)
    if context_length == 0:
        context_length = 128 * 1024

    # Estimate segment tokens by scanning messages
    system_prompt_chars = 0
    chat_history_chars = 0
    files_chars = 0
    memory_chars = 0
    file_attachment_count = 0
    memory_entry_count = 0
    total_message_chars = 0

    for msg in messages:
        role = msg.get('role', '')
        content = msg.get('content', '')
        text = _extract_text(content)
        chars = len(text)

        total_message_chars += chars

        if role == 'system':
            system_prompt_chars += chars
        elif _is_file_attachment(msg):
            files_chars += chars
            file_attachment_count += 1
        elif _is_memory_reference(msg):
            memory_chars += chars
            memory_entry_count += 1
        else:
            chat_history_chars += chars

    # Calculate rough token estimates from character counts
    system_prompt_tokens = _estimate_tokens(system_prompt_chars)
    files_tokens = _estimate_tokens(files_chars)
    memory_tokens = _estimate_tokens(memory_chars)
    chat_history_tokens = _estimate_tokens(chat_history_chars)

    # If no messages, use the context_messages field
    if total_message_chars == 0:
        ctx_msgs = getattr(s, 'context_messages', None) or []
        for msg in ctx_msgs:
            text = _extract_text(msg.get('content', ''))
            role = msg.get('role', '')
            chars = len(text)
            if role == 'system':
                system_prompt_chars += chars
            else:
                chat_history_chars += chars
        system_prompt_tokens = _estimate_tokens(system_prompt_chars)
        chat_history_tokens = _estimate_tokens(chat_history_chars)

    # If we have actual last_prompt_tokens from the compressor, use it.
    # Scale our character-based estimates to match the real token count.
    total_estimated = system_prompt_tokens + chat_history_tokens + files_tokens + memory_tokens
    if last_prompt_tokens > 0 and total_estimated > 0:
        ratio = last_prompt_tokens / total_estimated
        system_prompt_tokens = max(1, round(system_prompt_tokens * ratio))
        chat_history_tokens = max(1, round(chat_history_tokens * ratio))
        files_tokens = max(0, round(files_tokens * ratio))
        memory_tokens = max(0, round(memory_tokens * ratio))
        total_estimated = last_prompt_tokens
    else:
        # No real data — use our own estimate
        total_estimated = max(1, total_estimated)

    # Build segments
    segments = [
        {"id": "chat_history", "label": "Chat History", "icon": "💬",
         "tokens": chat_history_tokens,
         "color": "#4fc3f7"},
        {"id": "system_prompt", "label": "System Prompt", "icon": "⚙️",
         "tokens": system_prompt_tokens,
         "color": "#ffb74d"},
        {"id": "files", "label": "Files", "icon": "📎",
         "tokens": files_tokens,
         "color": "#81c784"},
        {"id": "memory", "label": "Memory", "icon": "🧠",
         "tokens": memory_tokens,
         "color": "#ce93d8"},
    ]

    # Calculate percentages
    for seg in segments:
        seg["pct"] = round((seg["tokens"] / total_estimated) * 100, 1) if total_estimated > 0 else 0

    # Only include non-zero segments in stacked chart
    stacked = [
        {"id": seg["id"], "label": seg["label"],
         "tokens": seg["tokens"], "pct": seg["pct"],
         "color": seg["color"]}
        for seg in segments if seg["tokens"] > 0
    ]

    return {
        "context_length": context_length,
        "total_tokens": total_estimated,
        "threshold_tokens": threshold_tokens,
        "pct_used": round((total_estimated / context_length) * 100, 1) if context_length > 0 else 0,
        "has_real_data": last_prompt_tokens > 0,
        "segments": segments,
        "stacked": stacked,
        "metadata": {
            "message_count": len(messages),
            "file_attachment_count": file_attachment_count,
            "memory_entry_count": memory_entry_count,
            "workspace": getattr(s, 'workspace', None),
        }
    }


def _extract_text(content: Any) -> str:
    """Flatten message content to plain text. Agent stores either a string
    or a list of {type, text|...} parts; webui needs the user-typed text."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for p in content:
            if isinstance(p, dict) and p.get('type') == 'text':
                parts.append(p.get('text', ''))
        return ' '.join(parts)
    return str(content)
