"""Free standard chat and Quickchat with no user API key.

Direct calls to ``opencode/muse-spark-1.3-contributor-free`` return OpenCode
FreeTierError 403 outside the official client. That id is not the default.
The stable route is the official OpenCode server, then the official CLI, for
zero-cost ``opencode/…-free`` models. OpenRouter ``openrouter/free`` is used
only when selected, with no Authorization header, and only accepted when the
answer is a free model. This module never reads a user API key and never selects
a paid model.
"""
from __future__ import annotations

import base64
import atexit
import json
import os
import queue
import re
import shutil
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
FALLBACK_MODELS = ("nemotron-3.5-lightning-free", "mimo-v2.6-flash-free")
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
_SERVER_FAILED: dict[str, float] = {}
_SERVER_RETRY_COOLDOWN_SECONDS = 30
_SERVER_LOCK = threading.Lock()
_SESSIONS_LOCK = threading.Lock()


def _stop_free_server(process) -> None:
    try:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=2)
    except (OSError, subprocess.TimeoutExpired):
        pass


def _shutdown_free_servers() -> None:
    with _SERVER_LOCK:
        servers = list(_SERVERS.values())
        _SERVERS.clear()
    for server in servers:
        _stop_free_server(server["process"])


atexit.register(_shutdown_free_servers)


class FreeChatError(RuntimeError):
    """The official free client could not answer this turn."""


class UnverifiedClientError(FreeChatError):
    """The client version cannot be matched to a tested safety contract."""


class FreeModelLimitError(FreeChatError):
    """The provider reports that the free model's quota is exhausted."""


_FREE_LIMIT_MESSAGE = "The free OpenCode model has reached its usage limit. Try again later or choose another model."


def free_chat_error_payload(error: Exception, session_id: str) -> dict:
    if isinstance(error, FreeModelLimitError):
        return {"error": _FREE_LIMIT_MESSAGE, "code": "opencode_free_limit", "session_id": session_id}
    return {"error": str(error)[:500], "session_id": session_id}


def free_client_path() -> str | None:
    """Return the official client binary, or None when it is not installed."""
    executable = "opencode.exe" if os.name == "nt" else "opencode"
    candidates = [
        os.environ.get("LASTBROWSER_OPENCODE_BIN", ""),
        str(Path(os.environ.get("SIDEKICK_AGENT_DIR", "")) / "vendor" / "opencode" / executable),
        str(Path(__file__).resolve().parents[1] / "vendor" / "opencode" / executable),
        str(Path.home() / ".opencode" / "bin" / executable),
    ]
    if os.name == "nt" and os.environ.get("APPDATA"):
        npm = Path(os.environ["APPDATA"]) / "npm"
        candidates.extend([
            str(npm / "node_modules" / "opencode-ai" / "bin" / executable),
            str(npm / executable),
        ])
    candidates.append(shutil.which(executable) or "")
    for candidate in candidates:
        path = str(candidate or "").strip()
        if path and os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    return None


def free_client_available() -> bool:
    return free_client_path() is not None


def free_default_choice() -> tuple[str, str]:
    """Select the official free client when available; otherwise require setup."""
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
    if provider_id == "openrouter" and model_id in {"free", "openrouter/free"}:
        return True
    if model_id.startswith("opencode/"):
        model_id = model_id.split("/", 1)[1]
    if model_id in FORBIDDEN_DEFAULTS:
        return False
    # opencode-go-free is the connection's zero-cost group. It never uses the Go key.
    if provider_id in {FREE_PROVIDER, "opencode-go-free"} and (model_id in CANDIDATE_MODELS or model_id.endswith("-free")):
        return True
    return False


def attach_free_opencode_catalog(catalog: dict) -> dict:
    """Expose published free models when the official client exists."""
    if not isinstance(catalog, dict) or not free_client_available():
        return catalog
    groups = catalog.get("groups")
    if not isinstance(groups, list):
        return catalog
    # The connection already published the free group. Do not replace it
    # with the small hardcoded client list.
    if any(isinstance(group, dict) and group.get("provider_id") == "opencode-go-free" for group in groups):
        return catalog
    limits = {
        "deepseek-v4.1-flash-free": 200000,
        "nemotron-3.5-lightning-free": 262144,
        "mimo-v2.6-flash-free": 200000,
    }
    labels = {
        "deepseek-v4.1-flash-free": "DeepSeek V4.1 Flash (free)",
        "nemotron-3.5-lightning-free": "Nemotron 3.5 Lightning (free)",
        "mimo-v2.6-flash-free": "MiMo V2.6 Flash (free)",
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
            # The desktop model-selection decoder requires this array. Omitting
            # it rejects the whole catalog, including the free models above.
            "models": list(CANDIDATE_MODELS),
        })
    return catalog


def _client_root(profile_home: Path) -> Path:
    root = profile_home / "opencode-free"
    (root / "config").mkdir(parents=True, exist_ok=True)
    (root / "data").mkdir(parents=True, exist_ok=True)
    (root / "scratch").mkdir(parents=True, exist_ok=True)
    return root


def _child_env(root: Path) -> dict[str, str]:
    # The keyless client must not inherit unrelated host credentials or
    # OpenCode configuration. Keep only OS/network settings needed to launch.
    allowed = {"PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "SYSTEMDRIVE", "COMSPEC",
               "LANG", "LC_ALL", "LC_CTYPE", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"}
    env = {name: value for name, value in os.environ.items() if name.upper() in allowed}
    env["HOME"] = str(root)
    env["USERPROFILE"] = str(root)
    env["APPDATA"] = str(root / "config")
    env["LOCALAPPDATA"] = str(root / "data")
    temp = root / "data" / "tmp"
    temp.mkdir(parents=True, exist_ok=True)
    env["TEMP"] = str(temp)
    env["TMP"] = str(temp)
    env["XDG_CONFIG_HOME"] = str(root / "config")
    env["XDG_DATA_HOME"] = str(root / "data")
    env["XDG_STATE_HOME"] = str(root / "data")
    env["XDG_CACHE_HOME"] = str(root / "data")
    env["OPENCODE_PURE"] = "1"
    env["OPENCODE_DISABLE_PROJECT_CONFIG"] = "1"
    env["OPENCODE_DISABLE_CLAUDE_CODE"] = "1"
    env["OPENCODE_DISABLE_AUTOUPDATE"] = "1"
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
    with _SESSIONS_LOCK:
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


def _v2_stream_event(event: object, session_id: str) -> tuple[str, str]:
    """Decode only events for the active v2 session; never expose raw errors."""
    if not isinstance(event, dict) or not isinstance(event.get("data"), dict):
        return "ignore", ""
    data = event["data"]
    if data.get("sessionID") != session_id:
        return "ignore", ""
    kind = event.get("type")
    if kind == "session.text.delta":
        delta = data.get("delta")
        return ("text", delta) if isinstance(delta, str) and delta else ("ignore", "")
    if kind == "session.execution.succeeded":
        return "done", ""
    if kind == "session.execution.failed":
        error = data.get("error")
        if isinstance(error, dict) and error.get("type") == "provider.free-limit":
            return "rate_limit", ""
        return "error", ""
    if kind == "session.execution.interrupted":
        return "interrupted", ""
    return "ignore", ""


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _client_api_version(binary: str, root: Path) -> int:
    """Use the v2 safety configuration only with the version verified locally."""
    for attempt in range(2):
        try:
            result = subprocess.run([binary, "--version"], cwd=str(root / "scratch"),
                                    env=_child_env(root), stdin=subprocess.DEVNULL,
                                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                    text=True, timeout=5, check=False)
            break
        except subprocess.TimeoutExpired:
            if attempt == 0:
                continue
            raise UnverifiedClientError("This OpenCode version has not been verified for free chat.") from None
        except OSError:
            raise UnverifiedClientError("This OpenCode version has not been verified for free chat.") from None
    match = re.search(r"(?<![\w.])v?(\d+)\.(\d+)\.(\d+)\b", result.stdout or "")
    if result.returncode != 0 or not match:
        raise UnverifiedClientError("This OpenCode version has not been verified for free chat.")
    if match.group(1) == "2":
        if match.groups() != ("2", "4", "2"):
            raise UnverifiedClientError("This OpenCode version has not been verified for free chat.")
        return 2
    if match.group(1) == "1":
        return 1
    raise UnverifiedClientError("This OpenCode version has not been verified for free chat.")


def _ensure_server(binary: str, root: Path) -> dict:
    key = str(root.resolve())
    with _SERVER_LOCK:
        failed_at = _SERVER_FAILED.get(key)
        if failed_at is not None:
            if time.monotonic() - failed_at < _SERVER_RETRY_COOLDOWN_SECONDS:
                raise FreeChatError("The official OpenCode server did not start.")
            _SERVER_FAILED.pop(key, None)
        current = _SERVERS.get(key)
        if current and current["process"].poll() is None:
            owner = False
        else:
            owner = True
            api_version = _client_api_version(binary, root)
            port = _free_port()
            password = base64.urlsafe_b64encode(os.urandom(18)).decode("ascii")
            env = _child_env(root)
            env["OPENCODE_SERVER_PASSWORD"] = password
            if api_version == 2:
                env["OPENCODE_CONFIG_CONTENT"] = json.dumps({
                    "permissions": [{"action": "*", "resource": "*", "effect": "deny"}],
                    "policies": [{"action": action, "resource": "*", "effect": "deny"}
                                 for action in ("tool.use", "plugin.use", "mcp.use", "skill.use")],
                })
            command = [binary, "serve", "--hostname", "127.0.0.1", "--port", str(port)]
            if api_version == 1:
                command.append("--pure")
            try:
                process = subprocess.Popen(
                    command,
                    cwd=str(root / "scratch"),
                    env=env,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            except OSError:
                _SERVER_FAILED[key] = time.monotonic()
                raise FreeChatError("The official OpenCode server could not start.") from None
            token = base64.b64encode(f"opencode:{password}".encode()).decode("ascii")
            current = {
                "process": process,
                "base": f"http://127.0.0.1:{port}",
                "auth": "Basic " + token,
                "ready": threading.Event(),
                "healthy": False,
                "api_version": api_version,
            }
            _SERVERS[key] = current
    if not owner:
        if not current["ready"].wait(timeout=35) or not current["healthy"] or current["process"].poll() is not None:
            raise FreeChatError("The official OpenCode server did not start.")
        return current
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if process.poll() is not None:
            with _SERVER_LOCK:
                _SERVER_FAILED[key] = time.monotonic()
                if _SERVERS.get(key) is current:
                    _SERVERS.pop(key, None)
            current["ready"].set()
            raise FreeChatError("The official OpenCode server stopped.")
        try:
            health = _server_json(current, "GET", "/api/session?limit=1" if api_version == 2 else "/global/health", timeout=2)
            if api_version == 2 and (not isinstance(health, dict) or not isinstance(health.get("data"), list)):
                raise FreeChatError("The official OpenCode server did not start.")
            current["healthy"] = True
            current["ready"].set()
            return current
        except FreeChatError:
            time.sleep(0.2)
    with _SERVER_LOCK:
        _SERVER_FAILED[key] = time.monotonic()
        if _SERVERS.get(key) is current:
            _SERVERS.pop(key, None)
    _stop_free_server(process)
    current["ready"].set()
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


def _interrupt_v2_turn(server: dict, session_id: str) -> None:
    try:
        _server_json(server, "POST", f"/api/session/{session_id}/interrupt", {}, timeout=2)
    except FreeChatError:
        # A failed interrupt must not leave the owned server generating unseen.
        with _SERVER_LOCK:
            for key, value in list(_SERVERS.items()):
                if value is server:
                    _SERVERS.pop(key, None)
        process = server.get("process")
        if process is not None:
            _stop_free_server(process)


def _serve_turn(*, binary: str, root: Path, prompt: str, model: str, on_text, cancel_event, session_key: str | None = None) -> str:
    stop_listener = threading.Event()
    try:
        return _serve_turn_impl(binary=binary, root=root, prompt=prompt, model=model,
                                on_text=on_text, cancel_event=cancel_event,
                                session_key=session_key, stop_listener=stop_listener)
    finally:
        stop_listener.set()


def _serve_turn_impl(*, binary: str, root: Path, prompt: str, model: str, on_text,
                     cancel_event, session_key: str | None, stop_listener: threading.Event) -> str:
    server = _ensure_server(binary, root)
    v2 = server.get("api_version") == 2
    events: queue.Queue = queue.Queue()
    listener_ready = threading.Event()
    listener_connected = threading.Event()

    def _listen() -> None:
        request = urllib.request.Request(
            server["base"] + ("/api/event" if v2 else "/event"),
            headers={"Accept": "text/event-stream", "Authorization": server["auth"]},
        )
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                listener_connected.set()
                listener_ready.set()
                buffer = b""
                while not stop_listener.is_set():
                    # HTTPResponse.read(n) may wait for n bytes, delaying small
                    # SSE events until the stream closes. read1 returns bytes
                    # available from the underlying buffered connection.
                    chunk = response.read1(4096)
                    if not chunk or stop_listener.is_set():
                        break
                    # SSE allows CRLF as well as LF, including when a pair
                    # arrives across reads.
                    buffer = (buffer + chunk).replace(b"\r\n", b"\n")
                    while b"\n\n" in buffer:
                        block, buffer = buffer.split(b"\n\n", 1)
                        events.put(block)
        except (OSError, ValueError):
            pass
        finally:
            listener_ready.set()
            events.put(None)

    threading.Thread(target=_listen, daemon=True).start()
    if not listener_ready.wait(timeout=5) or not listener_connected.is_set():
        raise FreeChatError("The official OpenCode event stream could not connect.")
    if cancel_event is not None and cancel_event.is_set():
        raise InterruptedError("Free chat cancelled")
    storage_key = "v2:" + json.dumps([session_key, model], separators=(",", ":")) if v2 and session_key else None
    session_id = _load_sessions(_session_path(root)).get(storage_key, "") if storage_key else ""
    if not session_id:
        created = _server_json(server, "POST", "/api/session" if v2 else "/session", {})
        if v2 and isinstance(created, dict):
            created = created.get("data")
        session_id = created.get("id") if isinstance(created, dict) else ""
    if not isinstance(session_id, str) or not session_id.startswith("ses_"):
        raise FreeChatError("The official OpenCode server could not answer.")
    if v2:
        _server_json(server, "POST", f"/api/session/{session_id}/model", {"model": {"providerID": "opencode", "id": model}})
        _server_json(server, "POST", f"/api/session/{session_id}/prompt", {"text": prompt})
    else:
        _server_json(server, "POST", f"/session/{session_id}/prompt_async", {
            "model": {"providerID": "opencode", "modelID": model},
            "parts": [{"type": "text", "text": prompt}],
        })
    assistant: set[str] = set()
    text_parts: dict[tuple[str, str], str] = {}
    visible = ""
    deadline = time.monotonic() + 25
    while time.monotonic() < deadline:
        if cancel_event is not None and cancel_event.is_set():
            if v2:
                _interrupt_v2_turn(server, session_id)
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
        if v2:
            kind, delta = _v2_stream_event(event, session_id)
            if kind == "text":
                visible += delta
                on_text(delta)
            elif kind == "done":
                if visible.strip():
                    if storage_key:
                        _store_session(_session_path(root), storage_key, session_id)
                    return visible
                raise FreeChatError("The official OpenCode server returned no answer.")
            elif kind == "error":
                raise FreeChatError("The official OpenCode server rejected the free model.")
            elif kind == "rate_limit":
                raise FreeModelLimitError(_FREE_LIMIT_MESSAGE)
            elif kind == "interrupted":
                raise InterruptedError("Free chat cancelled")
            continue
        props = event.get("properties") if isinstance(event, dict) else None
        if not isinstance(props, dict):
            continue
        nested = props.get("info") if event.get("type") == "message.updated" else props.get("part") if event.get("type") == "message.part.updated" else None
        session_ids = [value for value in (props.get("sessionID"), nested.get("sessionID") if isinstance(nested, dict) else None) if value is not None]
        if not session_ids or any(value != session_id for value in session_ids):
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
                part_key = (part["messageID"], str(part.get("id") or ""))
                text = part.get("text") if isinstance(part.get("text"), str) else ""
                previous = text_parts.get(part_key, "")
                delta = text[len(previous):] if text.startswith(previous) else "" if previous.startswith(text) else text
                if not previous.startswith(text) or len(text) >= len(previous):
                    text_parts[part_key] = text
                if delta:
                    visible += delta
                    on_text(delta)
        if event.get("type") == "message.part.delta" and props.get("field") == "text":
            part_key = (props.get("messageID"), props.get("partID"))
            delta = props.get("delta")
            if part_key in text_parts and part_key[0] in assistant and isinstance(delta, str) and delta:
                text_parts[part_key] += delta
                visible += delta
                on_text(delta)
        if event.get("type") == "session.status":
            status = props.get("status") if isinstance(props.get("status"), dict) else {}
            if status.get("type") == "idle" and visible.strip():
                return visible
    if v2:
        _interrupt_v2_turn(server, session_id)
    if visible.strip():
        raise FreeChatError("The official OpenCode response was interrupted before completion.")
    raise FreeChatError("The official OpenCode server returned no answer.")


def _cli_turn(*, binary: str, root: Path, session_key: str, prompt: str, model: str, on_text, cancel_event) -> str:
    stored = _load_sessions(_session_path(root)).get(f"{session_key}:{model}")
    command = [binary, "run", "--pure", "--format", "json", "-m", f"{FREE_PROVIDER}/{model}"]
    if stored:
        command.extend(["--session", stored])
    command.extend(["--", prompt])
    try:
        process = subprocess.Popen(
            command,
            cwd=str(root / "scratch"),
            env=_child_env(root),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except OSError:
        raise FreeChatError("The official OpenCode client could not start.") from None
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


def _models_for_turn(model: str | None) -> tuple[str, ...]:
    selected = str(model or "").strip()
    if selected.startswith("opencode/"):
        selected = selected.split("/", 1)[1]
    ordered: list[str] = []
    if selected and selected not in FORBIDDEN_DEFAULTS and (
        selected in CANDIDATE_MODELS or selected.endswith("-free")
    ):
        ordered.append(selected)
    for candidate in CANDIDATE_MODELS:
        if candidate not in ordered and candidate not in FORBIDDEN_DEFAULTS:
            ordered.append(candidate)
    return tuple(ordered)


def prewarm_free_server(profile_home: Path) -> None:
    """Start the official server before the first turn when the client exists."""
    binary = free_client_path()
    if not binary:
        return
    _ensure_server(binary, _client_root(Path(profile_home)))


def stream_free_reply(*, profile_home: Path, session_key: str, prompt: str,
                      on_text, cancel_event=None, model: str | None = None,
                      route_out: dict | None = None, provider: str | None = None) -> str:
    """Answer through the selected free provider without crossing providers."""
    text = str(prompt or "").strip()
    if not text:
        raise FreeChatError("Chat message is empty.")
    provider_id = str(provider or ("openrouter" if model in {"free", "openrouter/free"} else FREE_PROVIDER)).strip().lower()
    if provider_id == "openrouter":
        if model not in {"free", "openrouter/free"}:
            raise FreeChatError("The selected free model is not available through OpenRouter.")
        answer = _openrouter_free(text, on_text)
        if route_out is not None:
            route_out.update(provider="openrouter", model="openrouter/free", route="openrouter-free")
        return answer
    if provider_id not in {FREE_PROVIDER, "opencode-go-free"}:
        raise FreeChatError("The selected free provider is not supported.")
    binary = free_client_path()
    emitted = False

    def emit(chunk: str) -> None:
        nonlocal emitted
        if chunk:
            emitted = True
        on_text(chunk)

    failure = "The official OpenCode client is not available."
    limit_failure: FreeModelLimitError | None = None
    if binary:
        root = _client_root(Path(profile_home))
        failure = "The official OpenCode client could not answer."
        for candidate in _models_for_turn(model):
            try:
                answer = _serve_turn(binary=binary, root=root, prompt=text, model=candidate,
                                     on_text=emit, cancel_event=cancel_event, session_key=session_key)
            except InterruptedError:
                raise
            except UnverifiedClientError:
                raise
            except FreeModelLimitError as exc:
                if emitted:
                    raise
                limit_failure = exc
                failure = str(exc)
            except FreeChatError as exc:
                if emitted:
                    raise
                failure = str(exc)
            else:
                if route_out is not None:
                    route_out["provider"] = FREE_PROVIDER
                    route_out["model"] = candidate
                    route_out["route"] = "opencode-server"
                return answer
            # The v2 client no longer accepts the v1-only --pure CLI flag.
            # Do not launch a fallback command that is known to fail.
            with _SERVER_LOCK:
                current_server = _SERVERS.get(str(root.resolve()))
                v2_server = bool(current_server and current_server.get("api_version") == 2)
            if v2_server:
                continue
            try:
                answer = _cli_turn(binary=binary, root=root, session_key=session_key, prompt=text,
                                   model=candidate, on_text=emit, cancel_event=cancel_event)
            except InterruptedError:
                raise
            except FreeChatError as exc:
                if emitted:
                    raise
                failure = str(exc)
            else:
                if route_out is not None:
                    route_out["provider"] = FREE_PROVIDER
                    route_out["model"] = candidate
                    route_out["route"] = "opencode-cli"
                return answer
    if limit_failure is not None:
        raise limit_failure
    raise FreeChatError(failure)


def deliver_free_turn(*, session, text: str, put, cancel_event, profile_home, session_key: str) -> str:
    """Stream one free turn into the existing chat channel and save the transcript."""
    home = Path(profile_home) if profile_home else None
    if home is None:
        from web.api.profiles import get_profile_home
        home = Path(get_profile_home(getattr(session, "profile", None)))
    used = {"model": FREE_MODEL, "provider": FREE_PROVIDER, "route": "opencode-server"}

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
        model=str(getattr(session, "model", "") or FREE_MODEL),
        provider=str(getattr(session, "model_provider", "") or FREE_PROVIDER),
        route_out=used,
    )
    messages = getattr(session, "messages", None)
    if isinstance(messages, list):
        last = messages[-1] if messages else None
        if not isinstance(last, dict) or last.get("role") != "user" or last.get("content") != text:
            messages.append({"role": "user", "content": text, "timestamp": time.time()})
        messages.append({"role": "assistant", "content": answer, "timestamp": time.time()})
    session.model = used["model"]
    session.model_provider = used["provider"]
    session.active_stream_id = None
    session.pending_user_message = None
    session.pending_attachments = []
    session.pending_started_at = None
    session.save()
    session_id = getattr(session, "session_id", session_key)
    put("done", {
        "session_id": session_id,
        "provider_evidence": {
            "provider_id": used["provider"],
            "model_id": used["model"],
            "route": used.get("route"),
            "successful_chat": True,
        },
    })
    put("worker_exit", {"status": "completed", "processExited": True, "session_id": session_id})
    put("stream_end", {"session_id": session_id, "processExited": True})
    return answer
