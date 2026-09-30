"""In-app OAuth flow implementations for onboarding.

The browser receives only WebUI-local flow metadata (flow_id, user_code,
verification_uri, high-level status). Provider device/auth codes and OAuth
tokens stay server-side and are persisted to the active Nova profile's
``auth.json`` credential_pool.
"""

from __future__ import annotations

import json
import logging
import os
import base64
import hashlib
import hmac
import secrets
import http.server
import stat
import threading
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from web.api._home import get_active_webui_home, get_webui_home

logger = logging.getLogger(__name__)

# Compatibility for older helper tests and self-heal code that import these.
AUTH_JSON_PATH = get_webui_home() / "auth.json"

CODEX_ISSUER = "https://auth.openai.com"
CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
CODEX_VERIFICATION_URI = f"{CODEX_ISSUER}/codex/device"
CODEX_USER_CODE_URL = f"{CODEX_ISSUER}/api/accounts/deviceauth/usercode"
CODEX_DEVICE_TOKEN_URL = f"{CODEX_ISSUER}/api/accounts/deviceauth/token"
CODEX_TOKEN_URL = f"{CODEX_ISSUER}/oauth/token"
CODEX_REDIRECT_URI = f"{CODEX_ISSUER}/deviceauth/callback"
CODEX_BROWSER_CALLBACK_PATH = "/auth/callback"
CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex"
CODEX_FLOW_MAX_WAIT_SECONDS = 15 * 60

_ALLOWED_ONBOARDING_OAUTH_PROVIDERS = {"openai-codex", "anthropic", "claude", "claude-code"}
_ANTHROPIC_PROVIDER_ALIASES = {"anthropic", "claude", "claude-code"}
_REJECTED_ONBOARDING_OAUTH_PROVIDERS = {
    "nous",
    "qwen-oauth",
    "gemini-cli",
    "minimax",
    "minimax-oauth",
    "copilot",
    "copilot-acp",
}

ANTHROPIC_CREDENTIAL_POLL_SECONDS = 5
ANTHROPIC_FLOW_MAX_WAIT_SECONDS = 15 * 60
ANTHROPIC_PUBLIC_LINK_ERROR = "Claude Code credential linking failed. Check server logs."

_OAUTH_FLOWS: dict[str, dict[str, Any]] = {}
_OAUTH_FLOWS_LOCK = threading.Lock()
_ANTHROPIC_ENV_KEYS = ("ANTHROPIC_TOKEN", "ANTHROPIC_API_KEY")
GOOGLE_FLOW_MAX_WAIT_SECONDS = 15 * 60


def _safe_google_oauth_error(exc: Exception, code: str) -> str:
    """Map OAuth failures to useful, secret-free sign-in guidance."""
    normalized_code = str(code or "").strip().lower()
    detail = str(exc or "").lower()
    if normalized_code == "google_oauth_client_id_missing":
        return "Gemini CLI OAuth is not configured in this installation."
    if "disallowed_useragent" in detail or "browser or this app may not be secure" in detail:
        return (
            "Google rejected this OAuth client as an untrusted app. Opening the "
            "sign-in page in a system browser cannot fix a client-policy rejection."
        )
    if normalized_code in {"google_oauth_cancelled", "google_oauth_no_code"}:
        return "Google sign-in was cancelled or did not complete."
    if normalized_code == "google_oauth_invalid_grant":
        return "Google rejected the authorization code. Restart sign-in and try again."
    if normalized_code.startswith("google_oauth_token_"):
        return "Google could not exchange the authorization code. Check the OAuth client configuration and try again."
    if normalized_code == "google_oauth_incomplete_token_response":
        return "Google did not return the required Gemini CLI credentials."
    return "Google sign-in failed. Check the Google OAuth flow and try again."


def _spawn_google_oauth_worker(flow_id: str, sidekick_home: Path) -> None:
    def worker() -> None:
        try:
            from web.api.profiles import cron_profile_context_for_home
            from runtime.google_oauth import start_oauth_flow
            with cron_profile_context_for_home(sidekick_home):
                def publish_auth_url(url: str) -> None:
                    with _OAUTH_FLOWS_LOCK:
                        current = _OAUTH_FLOWS.get(flow_id)
                        if current and current.get("status") == "pending":
                            current["auth_url"] = url
                            current["updated_at"] = time.time()
                creds = start_oauth_flow(force_relogin=True, open_browser=False,
                                         callback_wait_seconds=GOOGLE_FLOW_MAX_WAIT_SECONDS,
                                         on_auth_url=publish_auth_url,
                                         cancel_event=_OAUTH_FLOWS.get(flow_id, {}).get("cancel_event"))
            # start_oauth_flow persists this identity into the account pool;
            # retain an explicit call here for compatibility with mocked login
            # workers and ensure metadata reflects the completed flow.
            from runtime.google_oauth import save_account_credentials_to_pool
            save_account_credentials_to_pool(creds)
            with _OAUTH_FLOWS_LOCK:
                flow = _OAUTH_FLOWS.get(flow_id)
                if flow:
                    flow.update({"status": "success", "email": creds.email, "updated_at": time.time()})
        except Exception as exc:
            logger.warning("Google OAuth flow failed: %s", exc)
            with _OAUTH_FLOWS_LOCK:
                flow = _OAUTH_FLOWS.get(flow_id)
                if flow:
                    from runtime.google_oauth import GoogleOAuthError
                    code = exc.code if isinstance(exc, GoogleOAuthError) else "google_oauth_error"
                    reason = _safe_google_oauth_error(exc, code)
                    flow.update({"status": "error", "error_code": code,
                                 "error": reason, "updated_at": time.time()})
    threading.Thread(target=worker, name="sidekick-google-oauth", daemon=True).start()


def _clear_process_anthropic_env_values() -> None:
    """Clear Anthropic process env fallbacks under the streaming env lock."""
    from web.api.streaming import _ENV_LOCK

    with _ENV_LOCK:
        for key in _ANTHROPIC_ENV_KEYS:
            os.environ.pop(key, None)


def resolve_runtime_provider_with_anthropic_env_lock(resolver, *args, **kwargs):
    """Resolve runtime credentials under the Anthropic onboarding env lock.

    Request paths must resolve Anthropic env fallbacks per outbound request,
    not cache ANTHROPIC_TOKEN or ANTHROPIC_API_KEY across onboarding. Sharing
    the process-env lock prevents a chat stream from observing one stale
    Anthropic env value while onboarding has already cleared the other.
    """
    from web.api.streaming import _ENV_LOCK

    with _ENV_LOCK:
        return resolver(*args, **kwargs)


def _normalize_onboarding_oauth_provider(provider: str) -> str:
    provider = str(provider or "").strip().lower()
    if provider in _ANTHROPIC_PROVIDER_ALIASES:
        return "anthropic"
    return provider or "openai-codex"


def _get_active_profile_home() -> Path:
    try:
        from web.api.profiles import get_active_profile_home

        return Path(get_active_profile_home())
    except Exception as exc:
        # Per Opus advisor on stage-296: log the silent fallback so a corrupt
        # profile state ending up writing tokens to the fallback WebUI home is
        # observable in logs rather than failing silently.
        logger.warning(
            "Falling back to the WebUI home for OAuth credential storage: "
            "active-profile resolution failed: %s",
            exc,
        )
        return get_webui_home()


def _auth_json_path() -> Path:
    """Return the current auth.json path for the active home."""
    try:
        return Path(get_active_webui_home()).expanduser().resolve() / "auth.json"
    except Exception:
        return Path(AUTH_JSON_PATH)


# ── legacy auth.json helpers ────────────────────────────────────────────────

def _read_auth_json(auth_path: Path | None = None) -> dict[str, Any]:
    """Read auth.json and return parsed dict, or an empty compatible store."""
    path = auth_path or _auth_json_path()
    if path.exists():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
            return loaded if isinstance(loaded, dict) else {}
        except json.JSONDecodeError as exc:
            logger.warning("Failed to parse %s: %s", path, exc)
            return {}
    return {}


def read_auth_json():
    """Public wrapper for streaming credential self-heal code."""
    return _read_auth_json()


def _write_auth_json(data: dict[str, Any], auth_path: Path | None = None) -> Path:
    """Atomically write auth.json with owner-only permissions.

    OAuth access/refresh tokens live in this file. The temp file is chmod 0600
    before rename so the final path never inherits a permissive process umask.
    """
    path = auth_path or _auth_json_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.tmp.{os.getpid()}.{uuid.uuid4().hex}")
    try:
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        try:
            tmp.chmod(0o600)
        except OSError as exc:
            logger.warning("Failed to chmod 0600 on %s: %s", tmp, exc)
        tmp.replace(path)
        try:
            path.chmod(stat.S_IRUSR | stat.S_IWUSR)
        except OSError:
            pass
        return path
    finally:
        try:
            if tmp.exists():
                tmp.unlink()
        except OSError:
            pass


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _persist_codex_credentials(sidekick_home: Path, token_data: dict[str, Any]) -> Path:
    """Persist Codex OAuth credentials to active-profile auth.json."""
    access_token = str(token_data.get("access_token") or "").strip()
    refresh_token = str(token_data.get("refresh_token") or "").strip()
    if not access_token:
        raise RuntimeError("Codex token exchange did not return an access_token")

    auth_path = Path(sidekick_home) / "auth.json"
    auth = _read_auth_json(auth_path)
    auth.setdefault("version", 1)
    pool = auth.setdefault("credential_pool", {})
    if not isinstance(pool, dict):
        pool = {}
        auth["credential_pool"] = pool
    entries = pool.setdefault("openai-codex", [])
    if not isinstance(entries, list):
        entries = []
        pool["openai-codex"] = entries

    now = _now_iso()
    entry = None
    # Per Opus advisor on stage-296: also accept the legacy `source ==
    # "oauth_device"` value so users with prior Codex OAuth credentials
    # (written by older WebUI versions before this PR's source-key change)
    # get their existing entry updated in-place rather than accumulating a
    # stale duplicate pool entry.
    _accept_sources = {"manual:device_code", "oauth_device"}
    for candidate in entries:
        if isinstance(candidate, dict) and candidate.get("source") in _accept_sources:
            entry = candidate
            break
    if entry is None:
        entry = {
            "id": "codex-oauth-" + uuid.uuid4().hex[:12],
            "label": "Codex OAuth",
            "auth_type": "oauth",
            "priority": 0,
            "source": "manual:device_code",
            "base_url": CODEX_BASE_URL,
            "created_at": now,
        }
        entries.insert(0, entry)

    entry.update(
        {
            "label": "Codex OAuth",
            "auth_type": "oauth",
            "priority": 0,
            "source": "manual:device_code",
            "access_token": access_token,
            "refresh_token": refresh_token,
            "base_url": CODEX_BASE_URL,
            "last_refresh": now,
            "updated_at": now,
        }
    )
    auth["updated_at"] = now
    path = _write_auth_json(auth, auth_path)

    try:
        from web.api.config import invalidate_credential_pool_cache

        invalidate_credential_pool_cache("openai-codex")
    except Exception:
        logger.debug("Failed to invalidate openai-codex credential cache", exc_info=True)

    return path


# Backward-compatible wrapper used by older code/tests.
def _save_codex_credentials(token_data):
    return _persist_codex_credentials(_get_active_profile_home(), token_data)


# ── Anthropic / Claude Code credential linking ─────────────────────────────

def _read_claude_code_credentials() -> dict[str, Any] | None:
    """Read Claude Code OAuth credentials from the host without exposing them.

    Delegates to the agent adapter which knows about ~/.claude/.credentials.json
    and macOS Keychain. Returns the credential dict or None.
    """
    try:
        from runtime.anthropic_adapter import (
            is_claude_code_token_valid,
            read_claude_code_credentials,
        )

        creds = read_claude_code_credentials()
        if creds and (
            is_claude_code_token_valid(creds) or bool(creds.get("refreshToken"))
        ):
            return creds
    except Exception as exc:
        logger.debug("Could not read Claude Code credentials: %s", exc)
    return None


def _clear_anthropic_env_values(sidekick_home: Path) -> None:
    """Clear Anthropic API/setup-token env values in the active profile only.

    The .env write path already clears os.environ while holding the streaming
    env lock. Keep a locked process-env clear here too so import/write failures
    cannot leave or partially clear stale Anthropic fallbacks.
    """
    try:
        from web.api.providers import _write_env_file

        _write_env_file(
            Path(sidekick_home) / ".env",
            {key: None for key in _ANTHROPIC_ENV_KEYS},
        )
    except Exception as exc:
        logger.warning("Failed to clear Anthropic env values: %s", exc)
    _clear_process_anthropic_env_values()


def _link_anthropic_credentials(sidekick_home: Path) -> None:
    """Link Sidekick to use Claude Code's credential store.

    Clears ANTHROPIC_TOKEN and ANTHROPIC_API_KEY from the Sidekick .env so
    that resolve_anthropic_token() falls through to reading Claude Code's
    ~/.claude/.credentials.json directly — the same thing the CLI's
    ``use_anthropic_claude_code_credentials()`` does.

    Also writes a marker entry in auth.json credential_pool so that
    ``_provider_oauth_authenticated("anthropic", ...)`` can detect the
    linked state without touching the actual credential files.
    """
    _clear_anthropic_env_values(sidekick_home)

    # Write a pool marker (no secrets) so onboarding status can detect linkage.
    auth_path = Path(sidekick_home) / "auth.json"
    auth = _read_auth_json(auth_path)
    auth.setdefault("version", 1)
    pool = auth.setdefault("credential_pool", {})
    if not isinstance(pool, dict):
        pool = {}
        auth["credential_pool"] = pool
    entries = pool.setdefault("anthropic", [])
    if not isinstance(entries, list):
        entries = []
        pool["anthropic"] = entries

    now = _now_iso()
    entry = None
    for candidate in entries:
        if isinstance(candidate, dict) and candidate.get("source") == "claude_code_linked":
            entry = candidate
            break
    if entry is None:
        entry = {
            "id": "anthropic-claude-code-" + uuid.uuid4().hex[:12],
            "label": "Claude Code (linked)",
            "auth_type": "oauth",
            "priority": 0,
            "source": "claude_code_linked",
            "created_at": now,
        }
        entries.insert(0, entry)

    entry.update({
        "label": "Claude Code (linked)",
        "auth_type": "oauth",
        "priority": 0,
        "source": "claude_code_linked",
        "updated_at": now,
    })
    auth["updated_at"] = now
    _write_auth_json(auth, auth_path)

    try:
        from web.api.config import invalidate_credential_pool_cache
        invalidate_credential_pool_cache("anthropic")
    except Exception:
        logger.debug("Failed to invalidate anthropic credential cache", exc_info=True)


def _anthropic_public_start_payload(flow_id: str, flow: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "ok": True,
        "provider": "anthropic",
        "flow_id": flow_id,
        "status": flow.get("status", "pending"),
        "poll_interval_seconds": flow.get("poll_interval_seconds", ANTHROPIC_CREDENTIAL_POLL_SECONDS),
    }
    if flow.get("status") == "pending":
        payload["action_required"] = (
            "Lastbrowser does not run a Claude OAuth browser login yet. Install Claude Code and run "
            "'claude login' on this device, then return here. Lastbrowser will detect its local credentials."
        )
    if flow.get("expires_at"):
        payload["expires_at"] = flow["expires_at"]
    return payload


def _anthropic_public_status_payload(flow_id: str, flow: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "ok": True,
        "provider": "anthropic",
        "flow_id": flow_id,
        "status": flow.get("status", "error"),
    }
    if flow.get("status") == "error" and flow.get("error"):
        payload["error"] = ANTHROPIC_PUBLIC_LINK_ERROR
    return payload


def _spawn_anthropic_credential_worker(flow_id: str) -> None:
    worker = threading.Thread(
        target=_run_anthropic_credential_worker, args=(flow_id,), daemon=True,
    )
    worker.start()


def _run_anthropic_credential_worker(flow_id: str) -> None:
    """Poll for Claude Code credential appearance until found, cancelled, or expired."""
    while True:
        with _OAUTH_FLOWS_LOCK:
            flow = dict(_OAUTH_FLOWS.get(flow_id) or {})
        if not flow:
            return
        status = flow.get("status")
        if status != "pending":
            return
        if float(flow.get("expires_at") or 0) <= time.time():
            _set_flow_status(flow_id, "expired")
            return

        time.sleep(max(1, int(flow.get("poll_interval_seconds") or 5)))

        with _OAUTH_FLOWS_LOCK:
            live = dict(_OAUTH_FLOWS.get(flow_id) or {})
        if live.get("status") != "pending":
            return
        if flow.get("status") != "pending":
            return
        if float(flow.get("expires_at") or 0) <= time.time():
            _set_flow_status(flow_id, "expired")
            return

        time.sleep(max(1, int(flow.get("poll_interval_seconds") or ANTHROPIC_CREDENTIAL_POLL_SECONDS)))

        # Re-check status under lock (cancel may have arrived during sleep)
        with _OAUTH_FLOWS_LOCK:
            live = _OAUTH_FLOWS.get(flow_id)
            if not live or live.get("status") != "pending":
                return

        try:
            creds = _read_claude_code_credentials()
            if creds is None:
                continue

            # Re-check status under lock before linking — cancel must win
            with _OAUTH_FLOWS_LOCK:
                current = _OAUTH_FLOWS.get(flow_id)
                if not current or current.get("status") != "pending":
                    return

            sidekick_home = Path(flow["sidekick_home"])
            _link_anthropic_credentials(sidekick_home)
            with _OAUTH_FLOWS_LOCK:
                current = _OAUTH_FLOWS.get(flow_id)
                if not current or current.get("status") != "pending":
                    cancelled = bool(current and current.get("status") == "cancelled")
                else:
                    current["status"] = "success"
                    current["updated_at"] = time.time()
                    _drop_sensitive_flow_fields(current)
                    cancelled = False
            if cancelled:
                _remove_anthropic_link_marker(sidekick_home)
            return
        except Exception as exc:
            logger.warning("Anthropic credential polling failed: %s", exc)
            with _OAUTH_FLOWS_LOCK:
                current = _OAUTH_FLOWS.get(flow_id)
                if current and current.get("status") == "pending":
                    current["status"] = "error"
                    current["updated_at"] = time.time()
                    current["error"] = str(exc)
                    _drop_sensitive_flow_fields(current)
            return


def _remove_anthropic_link_marker(sidekick_home: Path) -> None:
    """Remove the secret-free Claude Code linked marker after a cancelled race."""
    auth_path = Path(sidekick_home) / "auth.json"
    auth = _read_auth_json(auth_path)
    pool = auth.get("credential_pool")
    if not isinstance(pool, dict):
        return
    entries = pool.get("anthropic")
    if not isinstance(entries, list):
        return
    kept = [entry for entry in entries if not (isinstance(entry, dict) and entry.get("source") == "claude_code_linked")]
    if len(kept) == len(entries):
        return
    if kept:
        pool["anthropic"] = kept
    else:
        pool.pop("anthropic", None)
    auth["updated_at"] = _now_iso()
    _write_auth_json(auth, auth_path)
    try:
        from web.api.config import invalidate_credential_pool_cache
        invalidate_credential_pool_cache("anthropic")
    except Exception:
        logger.debug("Failed to invalidate anthropic credential cache", exc_info=True)


# ── Codex protocol ──────────────────────────────────────────────────────────

def _json_request(url: str, payload: dict[str, Any], *, form: bool = False) -> dict[str, Any]:
    if form:
        data = urllib.parse.urlencode(payload).encode("utf-8")
        content_type = "application/x-www-form-urlencoded"
    else:
        data = json.dumps(payload).encode("utf-8")
        content_type = "application/json"
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": content_type, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _request_codex_user_code() -> dict[str, Any]:
    return _json_request(CODEX_USER_CODE_URL, {"client_id": CODEX_CLIENT_ID})


def _poll_codex_authorization(device_auth_id: str, user_code: str) -> dict[str, Any] | None:
    try:
        return _json_request(
            CODEX_DEVICE_TOKEN_URL,
            {"device_auth_id": device_auth_id, "user_code": user_code},
        )
    except urllib.error.HTTPError as exc:
        if exc.code in (403, 404):
            return None
        raise


def _exchange_codex_authorization(
    authorization_code: str,
    code_verifier: str,
    redirect_uri: str = CODEX_REDIRECT_URI,
) -> dict[str, Any]:
    return _json_request(
        CODEX_TOKEN_URL,
        {
            "grant_type": "authorization_code",
            "code": authorization_code,
            "redirect_uri": redirect_uri,
            "client_id": CODEX_CLIENT_ID,
            "code_verifier": code_verifier,
        },
        form=True,
    )


class _CodexBrowserCallbackState:
    def __init__(self, expected_state: str) -> None:
        self.expected_state = expected_state
        self.ready = threading.Event()
        self.code = ""
        self.error = ""


class _CodexBrowserCallbackHandler(http.server.BaseHTTPRequestHandler):
    """Receive only the one-time loopback callback; never log its query string."""

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002, N802
        logger.debug("Codex OAuth callback request handled")

    def do_GET(self) -> None:  # noqa: N802
        from urllib.parse import parse_qs, urlparse

        parsed = urlparse(self.path)
        if parsed.path != CODEX_BROWSER_CALLBACK_PATH:
            self.send_error(404)
            return
        state = getattr(self.server, "codex_callback_state", None)
        params = parse_qs(parsed.query)
        returned_state = (params.get("state") or [""])[0]
        code = (params.get("code") or [""])[0]
        error = (params.get("error") or [""])[0]
        if state is None or not hmac.compare_digest(returned_state, state.expected_state):
            # Any local process or cross-origin page can probe a loopback port.
            # A bad state must not be able to abort a legitimate sign-in.
            self._respond(400, "Sign-in could not be verified. Close this tab and restart Codex sign-in.")
            return
        if error:
            state.error = "authorization_denied"
            state.ready.set()
            self._respond(400, "Codex sign-in was cancelled or denied. Return to Lastbrowser and try again.")
            return
        if not code:
            state.error = "missing_authorization_code"
            state.ready.set()
            self._respond(400, "OpenAI did not return an authorization code. Restart Codex sign-in.")
            return
        if state.ready.is_set():
            self._respond(400, "This Codex sign-in callback has already been used. Restart sign-in if needed.")
            return
        state.code = code
        state.ready.set()
        self._respond(200, "Codex sign-in completed. You can close this tab and return to Lastbrowser.")

    def _respond(self, status: int, message: str) -> None:
        safe = (message.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
        body = (
            "<!doctype html><html><meta charset='utf-8'><title>Lastbrowser Codex sign-in</title>"
            "<style>body{font:16px system-ui;max-width:36rem;margin:12vh auto;padding:0 1rem;"
            "background:#10141c;color:#eaf2ff}h1{color:#25d9f8}</style>"
            f"<h1>Lastbrowser</h1><p>{safe}</p></html>"
        ).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def _bind_codex_callback_server() -> tuple[http.server.HTTPServer, int]:
    # Match the loopback callback contract used by the official Codex CLI.
    try:
        server = http.server.HTTPServer(("127.0.0.1", 1455), _CodexBrowserCallbackHandler)
        return server, 1455
    except OSError:
        server = http.server.HTTPServer(("127.0.0.1", 0), _CodexBrowserCallbackHandler)
        return server, int(server.server_address[1])


def _build_codex_browser_auth_url(redirect_uri: str, state: str, code_challenge: str) -> str:
    params = {
        "response_type": "code",
        "client_id": CODEX_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "scope": "openid profile email offline_access api.connectors.read api.connectors.invoke",
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
        "id_token_add_organizations": "true",
        "codex_cli_simplified_flow": "true",
        "originator": "codex_cli_rs",
    }
    return f"{CODEX_ISSUER}/oauth/authorize?{urllib.parse.urlencode(params)}"


def _codex_public_start_payload(flow_id: str, flow: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "ok": True,
        "provider": "openai-codex",
        "flow_id": flow_id,
        "status": flow.get("status", "pending"),
        "expires_at": flow.get("expires_at"),
        "poll_interval_seconds": flow.get("poll_interval_seconds", 5),
    }
    if flow.get("auth_url"):
        payload["auth_url"] = flow["auth_url"]
        payload["action_required"] = "Sign in to ChatGPT in your system browser. Lastbrowser will finish connecting automatically."
    else:
        payload["verification_uri"] = CODEX_VERIFICATION_URI
        payload["user_code"] = flow.get("user_code", "")
    return payload


def _codex_public_status_payload(flow_id: str, flow: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "ok": True,
        "provider": "openai-codex",
        "flow_id": flow_id,
        "status": flow.get("status", "error"),
    }
    if flow.get("status") == "error" and flow.get("error"):
        payload["error"] = str(flow.get("error"))[:200]
    return payload


def _public_start_payload(flow_id: str, flow: dict[str, Any]) -> dict[str, Any]:
    provider = flow.get("provider", "openai-codex")
    if provider == "anthropic":
        return _anthropic_public_start_payload(flow_id, flow)
    if provider == "antigravity":
        return _antigravity_public_start_payload(flow_id, flow)
    return _codex_public_start_payload(flow_id, flow)


def _antigravity_public_start_payload(flow_id: str, flow: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "ok": True,
        "provider": "antigravity",
        "flow_id": flow_id,
        "status": flow.get("status", "pending"),
        "poll_interval_seconds": flow.get("poll_interval_seconds", 3),
    }
    if flow.get("auth_url"):
        payload["auth_url"] = flow["auth_url"]
        payload["action_required"] = (
            "Sign in with your Google account in the browser window that opened. "
            "Each login adds one account to the Antigravity round-robin pool."
        )
    if flow.get("expires_at"):
        payload["expires_at"] = flow["expires_at"]
    return payload


def _antigravity_public_status_payload(flow_id: str, flow: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "ok": flow.get("status") == "success",
        "provider": "antigravity",
        "flow_id": flow_id,
        "status": flow.get("status", "error"),
    }
    if flow.get("status") == "pending" and flow.get("auth_url"):
        payload["auth_url"] = flow["auth_url"]
        payload["action_required"] = (
            "Complete the Google sign-in in your browser to connect this account."
        )
    if flow.get("status") == "success" and flow.get("email"):
        payload["email"] = flow["email"]
    if flow.get("status") == "error" and flow.get("error"):
        payload["error_code"] = flow.get("error_code", "antigravity_oauth_error")
        payload["error"] = flow["error"]
    return payload


def _public_status_payload(flow_id: str, flow: dict[str, Any]) -> dict[str, Any]:
    provider = flow.get("provider", "openai-codex")
    if provider == "anthropic":
        return _anthropic_public_status_payload(flow_id, flow)
    if provider == "antigravity":
        return _antigravity_public_status_payload(flow_id, flow)
    if provider == "google-gemini-cli":
        return {
            "ok": False,
            "provider": provider,
            "flow_id": flow_id,
            "status": "error",
            "error_code": "unsupported_third_party_oauth",
            "error": "Google sign-in for consumer Gemini Code Assist accounts ended on June 18, 2026. Google directs personal subscribers to Antigravity; Lastbrowser cannot connect to Antigravity under Google's third-party access terms.",
        }
    return _codex_public_status_payload(flow_id, flow)


def _drop_sensitive_flow_fields(flow: dict[str, Any]) -> None:
    for key in (
        "device_auth_id",
        "authorization_code",
        "code_verifier",
        "access_token",
        "refresh_token",
        "token_data",
        "code_challenge",
        "callback_state",
        "callback_server",
        "callback_thread",
        "redirect_uri",
    ):
        flow.pop(key, None)


def _cleanup_oauth_flows(now: float | None = None) -> None:
    now = now or time.time()
    cutoff = now - 300
    with _OAUTH_FLOWS_LOCK:
        for fid, flow in list(_OAUTH_FLOWS.items()):
            status = flow.get("status")
            if status == "pending" and float(flow.get("expires_at") or 0) <= now:
                flow["status"] = "expired"
                _drop_sensitive_flow_fields(flow)
            if status in {"success", "expired", "cancelled", "error"} and float(flow.get("updated_at") or 0) < cutoff:
                _OAUTH_FLOWS.pop(fid, None)


def _spawn_codex_oauth_worker(flow_id: str) -> None:
    worker = threading.Thread(target=_run_codex_oauth_worker, args=(flow_id,), daemon=True)
    worker.start()


def _set_flow_status(flow_id: str, status: str, **fields: Any) -> None:
    with _OAUTH_FLOWS_LOCK:
        flow = _OAUTH_FLOWS.get(flow_id)
        if not flow:
            return
        flow["status"] = status
        flow["updated_at"] = time.time()
        flow.update(fields)
        if status in {"success", "expired", "cancelled", "error"}:
            _drop_sensitive_flow_fields(flow)


def _run_codex_oauth_worker(flow_id: str) -> None:
    with _OAUTH_FLOWS_LOCK:
        initial = dict(_OAUTH_FLOWS.get(flow_id) or {})
    if initial.get("auth_mode") == "browser":
        _run_codex_browser_oauth_worker(flow_id, initial)
    # Device-code flows from earlier app versions cannot survive a backend
    # restart because their state was process-local. New Codex logins always
    # use the browser PKCE flow above.


def _run_codex_browser_oauth_worker(flow_id: str, flow: dict[str, Any]) -> None:
    callback_state = flow.get("callback_state")
    callback_server = flow.get("callback_server")
    callback_thread = flow.get("callback_thread")
    if not isinstance(callback_state, _CodexBrowserCallbackState) or callback_server is None:
        _set_flow_status(flow_id, "error", error="Codex OAuth callback listener was not initialized.")
        return
    try:
        deadline = float(flow.get("expires_at") or 0)
        cancel_event = flow.get("cancel_event")
        while time.time() < deadline and not callback_state.ready.wait(timeout=0.5):
            if cancel_event is not None and cancel_event.is_set():
                _set_flow_status(flow_id, "cancelled")
                return
            with _OAUTH_FLOWS_LOCK:
                if (_OAUTH_FLOWS.get(flow_id) or {}).get("status") != "pending":
                    return
        if not callback_state.ready.is_set():
            _set_flow_status(flow_id, "expired")
            return
        if callback_state.error:
            raise RuntimeError("Codex sign-in could not be verified. Restart the login flow.")
        authorization_code = callback_state.code
        if not authorization_code:
            raise RuntimeError("OpenAI did not return an authorization code. Restart sign-in.")
        tokens = _exchange_codex_authorization(
            authorization_code,
            str(flow.get("code_verifier") or ""),
            str(flow.get("redirect_uri") or ""),
        )
        if not tokens.get("access_token"):
            raise RuntimeError("OpenAI token response did not include an access token.")
        with _OAUTH_FLOWS_LOCK:
            current = _OAUTH_FLOWS.get(flow_id)
            if not current or current.get("status") != "pending":
                return
            _persist_codex_credentials(Path(flow["sidekick_home"]), tokens)
            current["status"] = "success"
            current["updated_at"] = time.time()
            _drop_sensitive_flow_fields(current)
    except Exception as exc:
        # Never return raw provider response bodies or callback values to the UI.
        logger.warning("Codex browser OAuth flow failed (%s)", type(exc).__name__)
        _set_flow_status(flow_id, "error", error=_safe_codex_oauth_error(exc))
    finally:
        try:
            callback_server.shutdown()
        except Exception:
            pass
        try:
            callback_server.server_close()
        except Exception:
            pass
        if callback_thread and callback_thread is not threading.current_thread():
            callback_thread.join(timeout=2)


def _safe_codex_oauth_error(exc: Exception) -> str:
    if isinstance(exc, urllib.error.HTTPError):
        if exc.code == 530:
            return "OpenAI's Codex sign-in endpoint returned HTTP 530. Retry from the system browser; the service may be blocking this network route."
        return f"OpenAI Codex sign-in failed with HTTP {exc.code}. Restart sign-in and try again."
    return str(exc)[:200] or "OpenAI Codex sign-in failed. Restart sign-in and try again."


def _start_anthropic_flow(sidekick_home: Path) -> dict[str, Any]:
    """Start or immediately complete the Anthropic credential-linking flow."""
    creds = _read_claude_code_credentials()
    flow_id = uuid.uuid4().hex

    if creds:
        # Credentials already exist — link and return success immediately.
        _link_anthropic_credentials(sidekick_home)
        flow = {
            "provider": "anthropic",
            "status": "success",
            "sidekick_home": str(sidekick_home),
            "created_at": time.time(),
            "updated_at": time.time(),
        }
        with _OAUTH_FLOWS_LOCK:
            _OAUTH_FLOWS[flow_id] = flow
        return _public_start_payload(flow_id, flow)

    # No credentials found — create a pending flow that polls for them.
    expires_at = time.time() + ANTHROPIC_FLOW_MAX_WAIT_SECONDS
    flow = {
        "provider": "anthropic",
        "status": "pending",
        "expires_at": expires_at,
        "poll_interval_seconds": ANTHROPIC_CREDENTIAL_POLL_SECONDS,
        "sidekick_home": str(sidekick_home),
        "created_at": time.time(),
        "updated_at": time.time(),
    }
    with _OAUTH_FLOWS_LOCK:
        _OAUTH_FLOWS[flow_id] = flow
    _spawn_anthropic_credential_worker(flow_id)
    return _public_start_payload(flow_id, flow)


def _spawn_antigravity_oauth_worker(flow_id: str) -> None:
    """Run the Antigravity browser OAuth in a background thread.

    The flow publishes the auth URL into the flow record so the frontend can
    open it; on success the account lands in the antigravity credential pool
    (round-robin). Multiple sequential logins add multiple accounts.
    """
    def worker() -> None:
        try:
            from runtime.antigravity_oauth import start_antigravity_oauth_flow
            from web.api.profiles import cron_profile_context_for_home

            with _OAUTH_FLOWS_LOCK:
                flow = _OAUTH_FLOWS.get(flow_id) or {}
                sidekick_home = Path(flow.get("sidekick_home") or _get_active_profile_home())
                cancel_event = flow.get("cancel_event")

            def publish_auth_url(url: str) -> None:
                with _OAUTH_FLOWS_LOCK:
                    current = _OAUTH_FLOWS.get(flow_id)
                    if current and current.get("status") == "pending":
                        current["auth_url"] = url
                        current["updated_at"] = time.time()

            def persist_credentials(creds) -> None:
                # Serialize the final credential write against cancel requests.
                # If cancellation wins, the account is never added to the pool;
                # if persistence wins, the flow is already terminal-success and
                # a late cancel cannot misreport it as cancelled.
                from runtime.antigravity_oauth import (
                    AntigravityOAuthError,
                    save_account_credentials_to_pool,
                )

                with _OAUTH_FLOWS_LOCK:
                    current = _OAUTH_FLOWS.get(flow_id)
                    if (
                        not current
                        or current.get("status") != "pending"
                        or (cancel_event is not None and cancel_event.is_set())
                    ):
                        raise AntigravityOAuthError(
                            "Antigravity OAuth cancelled.",
                            code="antigravity_oauth_cancelled",
                        )
                    save_account_credentials_to_pool(creds)
                    current.update({
                        "status": "success",
                        "email": creds.email,
                        "updated_at": time.time(),
                    })

            with cron_profile_context_for_home(sidekick_home):
                creds = start_antigravity_oauth_flow(
                    open_browser=False,
                    callback_wait_seconds=GOOGLE_FLOW_MAX_WAIT_SECONDS,
                    on_auth_url=publish_auth_url,
                    on_credentials=persist_credentials,
                    cancel_event=cancel_event,
                )
            with _OAUTH_FLOWS_LOCK:
                flow = _OAUTH_FLOWS.get(flow_id)
                if flow and flow.get("status") == "pending":
                    flow.update({
                        "status": "success",
                        "email": creds.email,
                        "updated_at": time.time(),
                    })
        except Exception as exc:
            logger.warning("Antigravity OAuth flow failed: %s", exc)
            with _OAUTH_FLOWS_LOCK:
                flow = _OAUTH_FLOWS.get(flow_id)
                if flow and flow.get("status") == "pending":
                    code = getattr(exc, "code", "antigravity_oauth_error")
                    if code == "antigravity_oauth_cancelled":
                        flow.update({
                            "status": "cancelled",
                            "updated_at": time.time(),
                        })
                    else:
                        flow.update({
                            "status": "error",
                            "error_code": code,
                            "error": str(exc),
                            "updated_at": time.time(),
                        })

    threading.Thread(target=worker, name="sidekick-antigravity-oauth", daemon=True).start()


def start_onboarding_oauth_flow(body: dict[str, Any] | None) -> dict[str, Any]:
    """Start the supported onboarding OAuth flow.

    Supports OpenAI Codex (device-code flow) and Anthropic/Claude Code
    (credential-linking flow). Other providers are rejected.
    """
    _cleanup_oauth_flows()
    provider = str((body or {}).get("provider") or "").strip().lower()
    if provider == "antigravity":
        # Antigravity multi-account OAuth: each completed login adds one
        # Google account to the round-robin pool.
        flow_id = uuid.uuid4().hex
        flow = {
            "provider": "antigravity",
            "sidekick_home": str(_get_active_profile_home()),
            "status": "pending",
            "expires_at": time.time() + GOOGLE_FLOW_MAX_WAIT_SECONDS,
            "poll_interval_seconds": 3,
            "cancel_event": threading.Event(),
            "created_at": time.time(),
            "updated_at": time.time(),
        }
        with _OAUTH_FLOWS_LOCK:
            _OAUTH_FLOWS[flow_id] = flow
        _spawn_antigravity_oauth_worker(flow_id)
        return _antigravity_public_start_payload(flow_id, flow)
    if provider not in _ALLOWED_ONBOARDING_OAUTH_PROVIDERS:
        if provider in _REJECTED_ONBOARDING_OAUTH_PROVIDERS or provider:
            raise ValueError(
                "Only OpenAI Codex, Anthropic/Claude, and Antigravity OAuth are supported "
                "in WebUI onboarding right now"
            )
        raise ValueError("provider is required")

    # Normalize Claude aliases to canonical "anthropic"
    if provider in _ANTHROPIC_PROVIDER_ALIASES:
        return _start_anthropic_flow(_get_active_profile_home())

    if provider == "google-gemini-cli":
        raise ValueError(
            "Google sign-in for consumer Gemini Code Assist accounts ended on June 18, 2026. "
            "Google directs personal subscribers to Antigravity; Lastbrowser cannot connect "
            "to Antigravity under Google's third-party access terms."
        )

    # Use the same authorization-code + PKCE loopback flow as the official
    # Codex CLI. The device-code endpoint currently returns Cloudflare 530 for
    # this install, while the supported browser authorization route avoids that
    # failing device-auth API entirely.
    sidekick_home = _get_active_profile_home()
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode("ascii")
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")
    state = secrets.token_urlsafe(32)
    try:
        callback_server, port = _bind_codex_callback_server()
    except Exception as exc:
        raise RuntimeError(f"Failed to start Codex OAuth callback listener: {exc}") from exc
    redirect_uri = f"http://127.0.0.1:{port}{CODEX_BROWSER_CALLBACK_PATH}"
    callback_state = _CodexBrowserCallbackState(state)
    callback_server.codex_callback_state = callback_state
    callback_thread = threading.Thread(
        target=callback_server.serve_forever,
        name="sidekick-codex-oauth-callback",
        daemon=True,
    )
    callback_thread.start()
    auth_url = _build_codex_browser_auth_url(redirect_uri, state, challenge)
    flow_id = uuid.uuid4().hex
    flow = {
        "provider": "openai-codex",
        "auth_mode": "browser",
        "status": "pending",
        "auth_url": auth_url,
        "code_verifier": verifier,
        "code_challenge": challenge,
        "redirect_uri": redirect_uri,
        "callback_state": callback_state,
        "callback_server": callback_server,
        "callback_thread": callback_thread,
        "cancel_event": threading.Event(),
        "expires_at": time.time() + CODEX_FLOW_MAX_WAIT_SECONDS,
        "poll_interval_seconds": 2,
        "sidekick_home": str(sidekick_home),
        "created_at": time.time(),
        "updated_at": time.time(),
    }
    with _OAUTH_FLOWS_LOCK:
        _OAUTH_FLOWS[flow_id] = flow
    _spawn_codex_oauth_worker(flow_id)
    return _public_start_payload(flow_id, flow)


def poll_onboarding_oauth_flow(flow_id: str) -> dict[str, Any]:
    _cleanup_oauth_flows()
    fid = str(flow_id or "").strip()
    if not fid:
        raise ValueError("flow_id is required")
    with _OAUTH_FLOWS_LOCK:
        flow = _OAUTH_FLOWS.get(fid)
        if not flow:
            raise KeyError("OAuth flow not found")
        if flow.get("status") == "pending" and float(flow.get("expires_at") or 0) <= time.time():
            flow["status"] = "expired"
            flow["updated_at"] = time.time()
            _drop_sensitive_flow_fields(flow)
        return _public_status_payload(fid, dict(flow))


def cancel_onboarding_oauth_flow(body: dict[str, Any] | None) -> dict[str, Any]:
    fid = str((body or {}).get("flow_id") or "").strip()
    if not fid:
        raise ValueError("flow_id is required")
    requested_provider = _normalize_onboarding_oauth_provider(str((body or {}).get("provider") or ""))
    if requested_provider not in {"openai-codex", "anthropic", "antigravity"}:
        requested_provider = "openai-codex"
    with _OAUTH_FLOWS_LOCK:
        flow = _OAUTH_FLOWS.get(fid)
        if not flow:
            return {"ok": True, "provider": requested_provider, "flow_id": fid, "status": "cancelled"}
        if flow.get("status") == "pending":
            cancel_event = flow.get("cancel_event")
            if cancel_event is not None and hasattr(cancel_event, "set"):
                cancel_event.set()
            flow["status"] = "cancelled"
            flow["updated_at"] = time.time()
            _drop_sensitive_flow_fields(flow)
        result = _public_status_payload(fid, dict(flow))
    return result


def disconnect_google_oauth() -> dict[str, Any]:
    """Legacy credentials are deliberately preserved; never mutate user login state here."""
    return {
        "ok": False,
        "provider": "google-gemini-cli",
        "disconnected": False,
        "error_code": "unsupported_third_party_oauth",
    }


# Backward-compatible names from the abandoned spike. They intentionally do not
# expose provider device secrets to callers anymore.
def start_codex_device_code():
    return start_onboarding_oauth_flow({"provider": "openai-codex"})


def poll_codex_token(device_code, interval=5):
    yield {"status": "error", "error": "Use /api/onboarding/oauth/poll with flow_id"}
