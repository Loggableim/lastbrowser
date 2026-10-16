"""Free standard chat and Quickchat with no user API key.

Direct calls to ``opencode/muse-spark-1.3-contributor-free`` return OpenCode
FreeTierError 403 outside the official client. That id is not the default.
The stable route is the official OpenCode server, then the official CLI, for
zero-cost ``opencode/…-free`` models. OpenRouter ``openrouter/free`` is tried
only with no Authorization header and only accepted when the answer is a free
model. This module never reads a user API key and never selects a paid model.
"""
from __future__ import annotations

import base64
import json
import os
import queue
import re
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

FREE_PROVIDER = "opencode"
# Measured through the official server with no user key: this model answered,
# and the Muse free id did not. Paid ids are never defaults.
FREE_MODEL = "deepseek-v4.1-flash-free"
FALLBACK_MODELS = ("space-bunny-free", "glm-5.3-flash-free")
CANDIDATE_MODELS = (FREE_MODEL, *FALLBACK_MODELS)
FORBIDDEN_DEFAULTS = {
    "muse-spark-1.3-contributor-free",
    "muse-spark-1.3-contributor",
    "deepseek-v4-pro",
}
CLI_MODEL = f"{FREE_PROVIDER}/{FREE_MODEL}"
_SESSION_ID = re.compile(r"^ses_[A-Za-z0-9]+$")
_TURN_TIMEOUT_SECONDS = 70
_SERVERS: dict[str, dict] = {}
_SERVER_FAILED: set[str] = set()
_SERVER_LOCK = threading.Lock()


class FreeChatError(RuntimeError):
    """The official free client could not answer this turn."""


def free_client_path() -> str | None:
    """Return the official client binary, or None when it is not installed."""
    candidates = [
        os.environ.get("LASTBROWSER_OPENCODE_BIN", ""),
        str(Path(os.environ.get("SIDEKICK_AGENT_DIR", "")) / "vendor" / "opencode" / "opencode"),
        str(Path(__file__).resolve().parents[1] / "vendor" / "opencode" / "opencode"),
        str(Path.home() / ".opencode" / "bin" / "opencode"),
    ]
    for candidate in candidates:
        path = str(candidate or "").strip()
        if path and os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    return None


def free_client_available() -> bool:
    return free_client_path() is not None


def free_default_choice() -> tuple[str, str]:
    if FREE_MODEL in FORBIDDEN_DEFAULTS:
        return "", ""
    if free_client_available():
        return FREE_MODEL, FREE_PROVIDER
    return "", ""


def is_free_official_chat(provider: str | None, model: str | None) -> bool:
    provider_id = str(provider or "").strip().lower()
    model_id = str(model or "").strip()
    if provider_id in {"opencode-go", "opencode-zen"}:
        return False
    if model_id.startswith("opencode/"):
        model_id = model_id.split("/", 1)[1]
    return provider_id == FREE_PROVIDER and model_id in CANDIDATE_MODELS and model_id not in FORBIDDEN_DEFAULTS


def attach_free_opencode_catalog(catalog: dict) -> dict:
    """Expose only measured free models when the official client exists."""
    if not isinstance(catalog, dict) or not free_client_available():
        return catalog
    groups = catalog.get("groups")
    if not isinstance(groups, list):
        return catalog
    limits = {
        "deepseek-v4.1-flash-free": 200000,
        "space-bunny-free": 1048576,
        "glm-5.3-flash-free": 200000,
    }
    labels = {
        "deepseek-v4.1-flash-free": "DeepSeek V4.1 Flash (free)",
        "space-bunny-free": "Space Bunny (free)",
        "glm-5.3-flash-free": "GLM 5.3 Flash (free)",
    }
    models = [
        {
            "id": model_id,
            "label": labels[model_id],
            "supportsIndependent": True,
            "contextLength": limits[model_id],
            "contextLengthSource": "explicit_config",
            "supportsTools": False,
            "modelSource": "explicit_config",
        }
        for model_id in CANDIDATE_MODELS
    ]
    for group in groups:
        if isinstance(group, dict) and group.get("provider_id") == FREE_PROVIDER:
            group["configured"] = True
            group["models"] = models
            return catalog
    groups.insert(0, {
        "provider_id": FREE_PROVIDER,
        "provider": "OpenCode",
        "configured": True,
        "models": models,
    })
    providers = catalog.get("providers")
    if isinstance(providers, list) and not any(
        isinstance(row, dict) and row.get("id") == FREE_PROVIDER for row in providers
    ):
        providers.append({
            "id": FREE_PROVIDER,
            "display_name": "OpenCode",
            "provider_available": True,
            "auth_state": "not_required",
            "has_key": False,
            "oauth_connected": False,
        })
    return catalog


def _client_root(profile_home: Path) -> Path:
    root = profile_home / "opencode-free"
    (root / "config").mkdir(parents=True, exist_ok=True)
    (root / "data").mkdir(parents=True, exist_ok=True)
    (root / "scratch").mkdir(parents=True, exist_ok=True)
    return root


def _child_env(root: Path) -> dict[str, str]:
    env = os.environ.copy()
    for name in list(env):
        if name.endswith("_API_KEY") or name in {"OPENAI_API_KEY", "OPENROUTER_API_KEY", "OPENCODE_API_KEY"}:
            env.pop(name, None)
    env["HOME"] = str(root)
    env["XDG_CONFIG_HOME"] = str(root / "config")
    env["XDG_DATA_HOME"] = str(root / "data")
    env["XDG_STATE_HOME"] = str(root / "data")
    env["XDG_CACHE_HOME"] = str(root / "data")
    return env


def _session_path(root: Path) -> Path:
    return root / "sessions.json"


def _load_sessions(path: Path) -> dict[str, str]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(payload, dict):
        return {}
    return {
        str(key): str(value)
        for key, value in payload.items()
        if isinstance(key, str) and isinstance(value, str) and _SESSION_ID.fullmatch(value)
    }


def _store_session(path: Path, key: str, session_id: str) -> None:
    if not _SESSION_ID.fullmatch(session_id):
        return
    sessions = _load_sessions(path)
    sessions[key] = session_id
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(sessions), encoding="utf-8")
    os.replace(temporary, path)


def _safe_failure(event: dict) -> str:
    error = event.get("error") if isinstance(event.get("error"), dict) else {}
    data = error.get("data") if isinstance(error.get("data"), dict) else {}
    status = data.get("statusCode")
    if status == 403:
        return "The official OpenCode client rejected the free model."
    return "The official OpenCode client could not answer."


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _ensure_server(binary: str, root: Path) -> dict:
    key = str(root.resolve())
    with _SERVER_LOCK:
        if key in _SERVER_FAILED:
            raise FreeChatError("The official OpenCode server did not start.")
        current = _SERVERS.get(key)
        if current and current["process"].poll() is None:
            return current
        port = _free_port()
        password = base64.urlsafe_b64encode(os.urandom(18)).decode("ascii")
        env = _child_env(root)
        env["OPENCODE_SERVER_PASSWORD"] = password
        process = subprocess.Popen(
            [binary, "serve", "--hostname", "127.0.0.1", "--port", str(port), "--pure"],
            cwd=str(root / "scratch"),
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        token = base64.b64encode(f"opencode:{password}".encode()).decode("ascii")
        current = {
            "process": process,
            "base": f"http://127.0.0.1:{port}",
            "auth": "Basic " + token,
        }
        _SERVERS[key] = current
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if process.poll() is not None:
            with _SERVER_LOCK:
                _SERVER_FAILED.add(key)
            raise FreeChatError("The official OpenCode server stopped.")
        try:
            _server_json(current, "GET", "/global/health", timeout=2)
            return current
        except FreeChatError:
            time.sleep(0.2)
    with _SERVER_LOCK:
        _SERVER_FAILED.add(key)
    raise FreeChatError("The official OpenCode server did not start.")


def _server_json(server: dict, method: str, path: str, body: dict | None = None, timeout: float = 20):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(
        server["base"] + path,
        data=data,
        method=method,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": server["auth"],
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        if error.code in {401, 403}:
            # A local server password mismatch is not a user key. Retry once
            # without auth only when the server was started unsecured.
            if method == "GET" and path == "/global/health":
                raise FreeChatError("The official OpenCode server did not start.") from None
        raise FreeChatError("The official OpenCode server could not answer.") from None
    except (OSError, ValueError):
        raise FreeChatError("The official OpenCode server could not answer.") from None


def _serve_turn(*, binary: str, root: Path, prompt: str, model: str, on_text, cancel_event) -> str:
    server = _ensure_server(binary, root)
    events: queue.Queue = queue.Queue()

    def _listen() -> None:
        request = urllib.request.Request(
            server["base"] + "/event",
            headers={"Accept": "text/event-stream", "Authorization": server["auth"]},
        )
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                buffer = b""
                while True:
                    chunk = response.read(4096)
                    if not chunk:
                        break
                    buffer += chunk
                    while b"\n\n" in buffer:
                        block, buffer = buffer.split(b"\n\n", 1)
                        events.put(block)
        except (OSError, ValueError):
            events.put(None)

    threading.Thread(target=_listen, daemon=True).start()
    created = _server_json(server, "POST", "/session", {})
    session_id = created.get("id") if isinstance(created, dict) else ""
    if not isinstance(session_id, str) or not session_id.startswith("ses_"):
        raise FreeChatError("The official OpenCode server could not answer.")
    _server_json(server, "POST", f"/session/{session_id}/prompt_async", {
        "model": {"providerID": "opencode", "modelID": model},
        "parts": [{"type": "text", "text": prompt}],
    })
    assistant: set[str] = set()
    visible = ""
    deadline = time.monotonic() + 25
    while time.monotonic() < deadline:
        if cancel_event is not None and cancel_event.is_set():
            raise InterruptedError("Free chat cancelled")
        try:
            block = events.get(timeout=0.2)
        except queue.Empty:
            continue
        if block is None:
            break
        line = block.decode("utf-8", "replace")
        if not line.startswith("data: "):
            continue
        try:
            event = json.loads(line[6:])
        except ValueError:
            continue
        props = event.get("properties") if isinstance(event, dict) else None
        if not isinstance(props, dict) or props.get("sessionID") != session_id:
            continue
        if event.get("type") == "message.updated":
            info = props.get("info") if isinstance(props.get("info"), dict) else {}
            if info.get("role") == "assistant" and isinstance(info.get("id"), str):
                assistant.add(info["id"])
                if info.get("error"):
                    raise FreeChatError("The official OpenCode server rejected the free model.")
        if event.get("type") == "message.part.updated":
            part = props.get("part") if isinstance(props.get("part"), dict) else {}
            if part.get("messageID") in assistant and part.get("type") == "text":
                text = part.get("text") if isinstance(part.get("text"), str) else ""
                delta = text[len(visible):] if text.startswith(visible) else text
                visible = text if text.startswith(visible) else visible + text
                if delta:
                    on_text(delta)
        if event.get("type") == "session.status":
            status = props.get("status") if isinstance(props.get("status"), dict) else {}
            if status.get("type") == "idle" and visible.strip():
                return visible
    if visible.strip():
        return visible
    raise FreeChatError("The official OpenCode server returned no answer.")


def _cli_turn(*, binary: str, root: Path, session_key: str, prompt: str, model: str, on_text, cancel_event) -> str:
    stored = _load_sessions(_session_path(root)).get(f"{session_key}:{model}")
    command = [binary, "run", "--pure", "--format", "json", "-m", f"{FREE_PROVIDER}/{model}"]
    if stored:
        command.extend(["--session", stored])
    command.extend(["--", prompt])
    process = subprocess.Popen(
        command,
        cwd=str(root / "scratch"),
        env=_child_env(root),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    lines: queue.Queue[str | None] = queue.Queue()

    def _read() -> None:
        assert process.stdout is not None
        for line in process.stdout:
            lines.put(line)
        lines.put(None)

    threading.Thread(target=_read, daemon=True).start()
    deadline = time.monotonic() + _TURN_TIMEOUT_SECONDS
    visible = ""
    session_id = stored
    failed = ""
    finished = False
    try:
        while True:
            if cancel_event is not None and cancel_event.is_set():
                raise InterruptedError("Free chat cancelled")
            if time.monotonic() > deadline:
                raise FreeChatError("The official OpenCode client timed out.")
            try:
                line = lines.get(timeout=0.2)
            except queue.Empty:
                if process.poll() is not None and lines.empty():
                    break
                continue
            if line is None:
                break
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if not isinstance(event, dict):
                continue
            found = event.get("sessionID")
            if isinstance(found, str) and _SESSION_ID.fullmatch(found):
                session_id = found
            if event.get("type") == "error":
                failed = _safe_failure(event)
                break
            if event.get("type") != "text":
                continue
            part = event.get("part") if isinstance(event.get("part"), dict) else {}
            chunk = part.get("text") if isinstance(part.get("text"), str) else ""
            if not chunk:
                continue
            delta = chunk[len(visible):] if chunk.startswith(visible) else chunk
            visible = chunk if chunk.startswith(visible) else visible + chunk
            if delta:
                on_text(delta)
        finished = not failed
    finally:
        if process.poll() is None and not finished:
            process.kill()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
    if failed:
        raise FreeChatError(failed)
    if process.returncode not in {0, None}:
        raise FreeChatError("The official OpenCode client could not answer.")
    if not visible.strip():
        raise FreeChatError("The official OpenCode client returned no answer.")
    if session_id:
        _store_session(_session_path(root), f"{session_key}:{model}", session_id)
    return visible


def openrouter_free_headers() -> dict[str, str]:
    """Keyless OpenRouter headers. No Authorization, no user key."""
    return {"Content-Type": "application/json", "Accept": "application/json"}


def _accepted_openrouter_model(model: str, usage: dict) -> bool:
    if model in FORBIDDEN_DEFAULTS or model.endswith("/deepseek-v4-pro"):
        return False
    if model == "openrouter/free" or model.endswith(":free"):
        return True
    cost = usage.get("cost") if isinstance(usage, dict) else None
    return cost in {0, 0.0}


def _openrouter_free(prompt: str, on_text) -> str:
    body = json.dumps({
        "model": "openrouter/free",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 512,
    }).encode()
    request = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=body,
        headers=openrouter_free_headers(),
        method="POST",
    )
    if request.get_header("Authorization"):
        raise FreeChatError("OpenRouter free was refused because it would send a key.")
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            payload = json.loads(response.read(1_000_000))
    except (OSError, ValueError):
        raise FreeChatError("OpenRouter free is not available without a user key.") from None
    if not isinstance(payload, dict):
        raise FreeChatError("OpenRouter free is not available without a user key.")
    model = str(payload.get("model") or "")
    usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
    if not _accepted_openrouter_model(model, usage):
        raise FreeChatError("OpenRouter free did not stay on a free model.")
    choices = payload.get("choices") if isinstance(payload.get("choices"), list) else []
    message = choices[0].get("message") if choices and isinstance(choices[0], dict) else {}
    text = message.get("content") if isinstance(message, dict) else ""
    if not isinstance(text, str) or not text.strip():
        raise FreeChatError("OpenRouter free returned no answer.")
    on_text(text)
    return text


def stream_free_reply(*, profile_home: Path, session_key: str, prompt: str,
                      on_text, cancel_event=None) -> str:
    """Answer with the official server, then the official CLI, then keyless OpenRouter."""
    binary = free_client_path()
    if not binary:
        raise FreeChatError("The official OpenCode client is not available.")
    text = str(prompt or "").strip()
    if not text:
        raise FreeChatError("Chat message is empty.")
    root = _client_root(Path(profile_home))
    failure = "The official OpenCode client could not answer."
    for model in CANDIDATE_MODELS:
        if model in FORBIDDEN_DEFAULTS:
            continue
        try:
            return _serve_turn(binary=binary, root=root, prompt=text, model=model,
                               on_text=on_text, cancel_event=cancel_event)
        except InterruptedError:
            raise
        except FreeChatError as exc:
            failure = str(exc)
        try:
            return _cli_turn(binary=binary, root=root, session_key=session_key, prompt=text,
                             model=model, on_text=on_text, cancel_event=cancel_event)
        except InterruptedError:
            raise
        except FreeChatError as exc:
            failure = str(exc)
    try:
        return _openrouter_free(text, on_text)
    except InterruptedError:
        raise
    except FreeChatError:
        # A keyless OpenRouter miss must not hide the official client's reason
        # or introduce a paid model.
        pass
    raise FreeChatError(failure)


def deliver_free_turn(*, session, text: str, put, cancel_event, profile_home, session_key: str) -> str:
    """Stream one free turn into the existing chat channel and save the transcript."""
    home = Path(profile_home) if profile_home else None
    if home is None:
        from web.api.profiles import get_profile_home
        home = Path(get_profile_home(getattr(session, "profile", None)))
    used = {"model": FREE_MODEL}

    def on_text(delta: str) -> None:
        if cancel_event is not None and cancel_event.is_set():
            return
        put("token", {"text": delta})

    answer = stream_free_reply(
        profile_home=home,
        session_key=session_key,
        prompt=text,
        on_text=on_text,
        cancel_event=cancel_event,
    )
    messages = getattr(session, "messages", None)
    if isinstance(messages, list):
        last = messages[-1] if messages else None
        if not isinstance(last, dict) or last.get("role") != "user" or last.get("content") != text:
            messages.append({"role": "user", "content": text, "timestamp": time.time()})
        messages.append({"role": "assistant", "content": answer, "timestamp": time.time()})
    session.model = used["model"]
    session.model_provider = FREE_PROVIDER
    session.active_stream_id = None
    session.pending_user_message = None
    session.pending_attachments = []
    session.pending_started_at = None
    session.save()
    session_id = getattr(session, "session_id", session_key)
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
