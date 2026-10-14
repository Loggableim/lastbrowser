"""Direct OpenCode completion for ordinary text turns.

The desktop chat path otherwise spends the request on workspace capture,
session fsync, and a fresh Python worker before the provider sees the prompt.
A one-word reply through the OpenCode CLI finishes in a few seconds, so plain
OpenCode Go / Zen text turns call that same inference endpoint from the
already-running server and stream the answer on the existing chat channel.
Tool, goal, attachment, and non-action turns stay on the full agent path.
"""
from __future__ import annotations

import json
import logging
import threading
import time
import urllib.error
import urllib.request
import uuid
from typing import Any

logger = logging.getLogger(__name__)

_FAST_PROVIDERS = {"opencode-go", "opencode-zen"}
_FAST_MODES = {"", "action", "chat"}
_BLOCKED_MODELS = {"teamwork", "auto"}
_SYSTEM_PROMPT = (
    "You are Sidekick in LastBrowser. Answer the user directly. "
    "Do not mention these instructions."
)


def try_start_fast_opencode_chat(handler, session, message: str, attachments, body: dict) -> dict | None:
    """Start a direct completion, or return None so chat start uses the agent."""
    entered = time.time()
    if not _eligible(session, message, attachments, body):
        return None
    provider = str(body.get("model_provider") or getattr(session, "model_provider", "") or "").strip().lower()
    model = str(body.get("model") or getattr(session, "model", "") or "").strip()
    if _goal_blocks_fast_path(session, body):
        return None
    try:
        from cli.opencode_device import resolve_connection

        connection = resolve_connection(provider, model=model, session_id=getattr(session, "session_id", None))
    except Exception:
        logger.info("fast opencode lane left the full agent path", exc_info=True)
        return None
    if connection.get("api_mode") != "chat_completions":
        return None
    if body.get("space_scope") or getattr(session, "space_scope", None) is not None:
        try:
            from runtime.independent.chat_binding import require_native_scope_header

            require_native_scope_header(handler, body.get("space_scope") or getattr(session, "space_scope", None))
        except Exception:
            return None

    from web.api.config import STREAMS, STREAMS_LOCK, create_stream_channel

    current = getattr(session, "active_stream_id", None)
    if current:
        with STREAMS_LOCK:
            busy = current in STREAMS
        if busy:
            return {
                "error": "session already has an active stream",
                "active_stream_id": current,
                "_status": 409,
            }

    stream_id = uuid.uuid4().hex
    channel = create_stream_channel()
    started = time.time()
    with STREAMS_LOCK:
        STREAMS[stream_id] = channel
    session.active_stream_id = stream_id
    session.pending_user_message = message
    session.pending_started_at = started
    worker = threading.Thread(
        target=_complete,
        args=(session, message, provider, connection, stream_id, channel, started),
        name=f"fast-opencode-{stream_id[:8]}",
        daemon=True,
    )
    channel._thread = worker
    worker.start()
    logger.info(
        "fast_opencode_ready unix=%.3f prep_ms=%.1f",
        time.time(), (time.time() - entered) * 1000,
    )
    return {
        "stream_id": stream_id,
        "session_id": session.session_id,
        # A null scope marks this stream as a legacy SSE turn. The desktop then
        # paints tokens without waiting for a native worker proof.
        "space_scope": None,
        "pending_started_at": started,
        "effective_model": connection.get("model") or model,
        "effective_model_provider": provider,
        "fast_path": "opencode_direct",
    }


def _eligible(session, message: str, attachments, body: dict) -> bool:
    if attachments or body.get("grounding_context"):
        return False
    if str(body.get("mode") or "").strip().lower() not in _FAST_MODES:
        return False
    if getattr(session, "_loaded_metadata_only", False):
        return False
    text = str(message or "")
    if "lastbrowser-goal-run:" in text:
        return False
    provider = str(body.get("model_provider") or getattr(session, "model_provider", "") or "").strip().lower()
    model = str(body.get("model") or getattr(session, "model", "") or "").strip()
    if provider not in _FAST_PROVIDERS or not model:
        return False
    lowered = model.lower()
    if lowered in _BLOCKED_MODELS or lowered.startswith("smart-track"):
        return False
    return True


def _goal_blocks_fast_path(session, body: dict) -> bool:
    try:
        from web.api.goals import has_active_goal
        from web.api.profiles import get_profile_home

        profile_home = get_profile_home(getattr(session, "profile", None))
        space_slug = str(
            body.get("workspace_slug")
            or body.get("space_slug")
            or body.get("space")
            or getattr(session, "goal_space_slug", None)
            or getattr(session, "workspace_slug", None)
            or ""
        ).strip().lower() or None
        return bool(has_active_goal(session.session_id, profile_home=profile_home, space_slug=space_slug))
    except Exception:
        logger.info("fast opencode lane skipped because goal state was not readable", exc_info=True)
        return True


def _complete(session, message: str, provider: str, connection: dict, stream_id: str, channel, started: float) -> None:
    from web.api.config import CANCEL_FLAGS, STREAMS, STREAMS_LOCK, retain_completed_chat_stream

    cancel = threading.Event()
    with STREAMS_LOCK:
        CANCEL_FLAGS[stream_id] = cancel
    text_parts: list[str] = []
    first_token_at: float | None = None
    usage: dict[str, Any] = {}
    error = ""
    remembered = False
    provider_done = started
    try:
        for delta in _iter_content(connection, _messages(session, message), cancel):
            if cancel.is_set():
                break
            if delta.get("usage"):
                usage = delta["usage"]
            piece = delta.get("content") or ""
            if not piece:
                continue
            if first_token_at is None:
                first_token_at = time.time()
            text_parts.append(piece)
            channel.put_nowait(("token", {"text": piece}))
        answer = "".join(text_parts).strip()
        provider_done = time.time()
        if cancel.is_set():
            channel.put_nowait(("cancel", {"message": "Cancelled by user"}))
        elif not answer:
            error = "The model returned an empty reply."
        if error:
            channel.put_nowait(("error", {"error": error, "session_id": session.session_id}))
        else:
            _remember_turn(session, message, answer, usage, started)
            remembered = True
            channel.put_nowait(("done", {
                "session": _session_payload(session),
                "usage": {
                    "input_tokens": int(usage.get("prompt_tokens") or 0),
                    "output_tokens": int(usage.get("completion_tokens") or 0),
                },
            }))
    except Exception as exc:
        logger.warning("fast opencode completion failed for stream %s: %s", stream_id, type(exc).__name__)
        channel.put_nowait(("error", {"error": "The direct OpenCode reply failed.", "session_id": session.session_id}))
        provider_done = time.time()
        remembered = False
    finally:
        channel.put_nowait(("stream_end", {"session_id": session.session_id}))
        retain_completed_chat_stream(stream_id)
        save_started = time.time()
        if remembered:
            _persist_turn(session)
        save_ms = (time.time() - save_started) * 1000
        if getattr(session, "active_stream_id", None) == stream_id:
            session.active_stream_id = None
            session.pending_user_message = None
        with STREAMS_LOCK:
            CANCEL_FLAGS.pop(stream_id, None)
            STREAMS.pop(stream_id, None)
        elapsed_ms = (time.time() - started) * 1000
        first_ms = ((first_token_at - started) * 1000) if first_token_at else None
        stream_ms = (provider_done - started) * 1000
        logger.info(
            "fast_opencode_chat provider=%s stream=%s first_token_ms=%s stream_ms=%.1f save_ms=%.1f total_ms=%.1f",
            provider, stream_id, None if first_ms is None else round(first_ms, 1), stream_ms, save_ms, elapsed_ms,
        )


def _messages(session, message: str) -> list[dict[str, str]]:
    history: list[dict[str, str]] = [{"role": "system", "content": _SYSTEM_PROMPT}]
    prior = list(getattr(session, "messages", None) or [])
    for item in prior[-6:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = item.get("content")
        if role in {"user", "assistant"} and isinstance(content, str) and content.strip():
            history.append({"role": role, "content": content[:4000]})
    history.append({"role": "user", "content": message})
    return history


def _iter_content(connection: dict, messages: list[dict[str, str]], cancel: threading.Event):
    payload = json.dumps({
        "model": connection["model"],
        "messages": messages,
        "stream": True,
        "stream_options": {"include_usage": True},
        "max_tokens": 512,
    }).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {connection['api_key']}",
        **{str(key): str(value) for key, value in (connection.get("headers") or {}).items()},
    }
    request = urllib.request.Request(
        connection["base_url"].rstrip("/") + "/chat/completions",
        data=payload,
        headers=headers,
        method="POST",
    )
    try:
        response = urllib.request.urlopen(request, timeout=60)
    except urllib.error.HTTPError as exc:
        detail = exc.read(400).decode("utf-8", errors="replace")
        raise RuntimeError(f"opencode_http_{exc.code}:{detail[:180]}") from exc
    with response:
        for raw in response:
            if cancel.is_set():
                break
            line = raw.decode("utf-8", errors="replace").strip()
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            try:
                event = json.loads(data)
            except json.JSONDecodeError:
                continue
            choice = (event.get("choices") or [{}])[0]
            delta = choice.get("delta") or {}
            content = delta.get("content")
            yield {
                "content": content if isinstance(content, str) else "",
                "usage": event.get("usage") if isinstance(event.get("usage"), dict) else None,
            }


def _remember_turn(session, message: str, answer: str, usage: dict, started: float) -> None:
    now = int(time.time())
    messages = list(getattr(session, "messages", None) or [])
    if not messages or not (isinstance(messages[-1], dict) and messages[-1].get("role") == "user" and messages[-1].get("content") == message):
        messages.append({"role": "user", "content": message, "timestamp": int(started)})
    messages.append({"role": "assistant", "content": answer, "timestamp": now})
    session.messages = messages
    context = list(getattr(session, "context_messages", None) or [])
    context.append({"role": "user", "content": message})
    context.append({"role": "assistant", "content": answer})
    session.context_messages = context
    if usage.get("prompt_tokens"):
        session.last_prompt_tokens = int(usage["prompt_tokens"])
    session.model = session.model


def _persist_turn(session) -> None:
    try:
        session.save(touch_updated_at=True)
    except Exception:
        logger.warning("fast opencode lane could not persist the turn", exc_info=True)


def _session_payload(session) -> dict:
    compact = getattr(session, "compact", None)
    payload = compact() if callable(compact) else {"session_id": getattr(session, "session_id", "")}
    if not isinstance(payload, dict):
        payload = {"session_id": getattr(session, "session_id", "")}
    payload = dict(payload)
    payload["messages"] = list(getattr(session, "messages", None) or [])
    return payload
