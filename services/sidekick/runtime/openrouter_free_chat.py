"""Keyless OpenRouter free route. Never reads or sends a user API key."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request

FREE_MODEL = "openrouter/free"
FREE_PROVIDER = "openrouter"
_URL = "https://openrouter.ai/api/v1/chat/completions"
_KEY_ERROR = "OpenRouter free requires an API key."


class OpenRouterFreeError(RuntimeError):
    pass


def free_default_choice() -> tuple[str, str]:
    return FREE_MODEL, FREE_PROVIDER


def is_openrouter_free_chat(provider: str | None, model: str | None) -> bool:
    provider_id = str(provider or "").strip().lower()
    model_id = str(model or "").strip()
    if provider_id not in {"", FREE_PROVIDER}:
        return False
    return model_id == FREE_MODEL


def attach_openrouter_free_catalog(catalog: dict) -> dict:
    """Expose the keyless default even when the profile has no provider key."""
    if not isinstance(catalog, dict):
        return catalog
    groups = catalog.get("groups")
    if not isinstance(groups, list):
        return catalog
    model = {
        "id": FREE_MODEL,
        "label": "OpenRouter Free",
        "supportsIndependent": True,
        "contextLength": 131072,
        "contextLengthSource": "catalog",
    }
    for group in groups:
        if not isinstance(group, dict) or group.get("provider_id") != FREE_PROVIDER:
            continue
        models = group.setdefault("models", [])
        if isinstance(models, list) and not any(isinstance(row, dict) and row.get("id") == FREE_MODEL for row in models):
            models.insert(0, dict(model))
        group["configured"] = True
        return catalog
    groups.insert(0, {
        "provider_id": FREE_PROVIDER,
        "provider": "OpenRouter",
        "configured": True,
        "models": [model],
    })
    return catalog


def _key_required(status: int, body: str) -> bool:
    if status in {401, 402, 403}:
        lowered = body.lower()
        return status == 401 or "api key" in lowered or "cookie auth" in lowered or "credential" in lowered
    return False


def stream_free_reply(*, prompt: str, on_text, cancel_event, timeout: float = 90) -> str:
    """POST openrouter/free with no Authorization header."""
    payload = json.dumps({
        "model": FREE_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
    }).encode()
    request = urllib.request.Request(
        _URL,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "HTTP-Referer": "https://lastbrowser.com",
            "X-Title": "Lastbrowser",
        },
    )
    visible = ""
    deadline = time.monotonic() + timeout
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            while time.monotonic() < deadline:
                if cancel_event is not None and cancel_event.is_set():
                    raise InterruptedError("OpenRouter free chat cancelled")
                line = response.readline()
                if not line:
                    break
                text = line.decode("utf-8", "replace").strip()
                if not text.startswith("data:"):
                    continue
                data = text[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    event = json.loads(data)
                except ValueError:
                    continue
                choices = event.get("choices") if isinstance(event, dict) else None
                if not isinstance(choices, list) or not choices:
                    continue
                delta = choices[0].get("delta") if isinstance(choices[0], dict) else None
                piece = delta.get("content") if isinstance(delta, dict) else None
                if isinstance(piece, str) and piece:
                    visible += piece
                    on_text(piece)
    except urllib.error.HTTPError as error:
        raw = error.read(800).decode("utf-8", "replace")
        if _key_required(error.code, raw):
            raise OpenRouterFreeError(_KEY_ERROR) from None
        raise OpenRouterFreeError("OpenRouter free could not answer.") from None
    except InterruptedError:
        raise
    except (OSError, ValueError):
        raise OpenRouterFreeError("OpenRouter free could not answer.") from None
    if not visible.strip():
        raise OpenRouterFreeError("OpenRouter free returned no answer.")
    return visible


def deliver_free_turn(*, session, text: str, put, cancel_event, profile_home=None, session_key: str = "") -> str:
    """Stream one keyless turn into the existing chat channel and save the transcript."""
    del profile_home, session_key

    def on_text(delta: str) -> None:
        if cancel_event is not None and cancel_event.is_set():
            return
        put("token", {"text": delta})

    answer = stream_free_reply(prompt=text, on_text=on_text, cancel_event=cancel_event)
    messages = getattr(session, "messages", None)
    if isinstance(messages, list):
        last = messages[-1] if messages else None
        if not isinstance(last, dict) or last.get("role") != "user" or last.get("content") != text:
            messages.append({"role": "user", "content": text, "timestamp": time.time()})
        messages.append({"role": "assistant", "content": answer, "timestamp": time.time()})
    session.model = FREE_MODEL
    session.model_provider = FREE_PROVIDER
    session.active_stream_id = None
    session.pending_user_message = None
    session.pending_attachments = []
    session.pending_started_at = None
    session.save()
    session_id = getattr(session, "session_id", "")
    put("done", {
        "session_id": session_id,
        "provider_evidence": {
            "provider_id": FREE_PROVIDER,
            "model_id": FREE_MODEL,
            "successful_chat": True,
        },
    })
    put("worker_exit", {"status": "completed", "processExited": True, "session_id": session_id})
    put("stream_end", {"session_id": session_id, "processExited": True})
    return answer
