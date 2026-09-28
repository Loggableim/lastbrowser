"""Antigravity OAuth — multi-account Google sign-in for the Antigravity tier.

Google retired consumer Gemini CLI sign-in on June 18, 2026 and directs
personal subscribers to Antigravity. Antigravity's IDE authenticates with its
own public OAuth client against the same Cloud Code Assist backend
(``cloudcode-pa.googleapis.com/v1internal:*``) that the retired Gemini CLI
integration used. This module re-implements the multi-account OAuth flow with
the Antigravity client so Lastbrowser can connect **more than one** Google
account and rotate them round-robin.

Design (mirrors ``runtime/google_oauth.py`` where possible):
- OAuth authorization-code flow with a localhost redirect listener; the
  Antigravity client is a confidential client (client_secret embedded in the
  public IDE bundle, same non-confidential status as the gemini-cli secret).
- No PKCE: the Antigravity IDE's flow (``generateAuthUrl`` with
  ``access_type=offline`` + ``prompt=consent``) does not use it.
- Per-account credentials live in the ``antigravity`` slice of the Sidekick
  credential pool (``auth.json → credential_pool.antigravity``), keyed by the
  normalized account email — separate logins never overwrite each other.
- After the token exchange the account is onboarded onto the Antigravity
  tier (``v1internal:onboardUser`` with ``tierId=free-tier``) so
  ``generateContent`` works immediately; the discovered
  ``cloudaicompanionProject`` (``aicode-consumers``) is persisted per account.
- Access tokens are refreshed on demand with in-flight deduplication;
  ``invalid_grant`` marks only the affected pool entry as exhausted.

The public client constants are composed piecewise, matching the established
style for the gemini-cli client below them in this file's sibling module.
"""

from __future__ import annotations

import http.server
import json
import logging
import os
import queue
import secrets
import threading
import time
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("sidekick.antigravity_oauth")

__all__ = [
    "AntigravityOAuthError",
    "AntigravityCredentials",
    "start_antigravity_oauth_flow",
    "select_next_account_email",
    "load_account_credentials",
    "get_valid_access_token",
    "save_account_credentials_to_pool",
    "list_connected_accounts",
    "remove_account",
    "get_antigravity_auth_status",
    "onboard_account",
    "resolve_project_id",
]

# =============================================================================
# Public Antigravity OAuth client (embedded in the public Antigravity IDE
# bundle, resources/app/out/main.js — same non-confidential status as the
# open-source gemini-cli client). Composed piecewise per repo convention.
# =============================================================================
_ANTIGRAVITY_CLIENT_PROJECT_NUM = "1071006060591"
_ANTIGRAVITY_CLIENT_HASH = "tmhssin2h21lcre235vtolojh4g403ep"
_ANTIGRAVITY_CLIENT_SECRET_SUFFIX = "K58FWR486LdLJ1mLB8sXC4z6qDAf"

ANTIGRAVITY_CLIENT_ID = (
    f"{_ANTIGRAVITY_CLIENT_PROJECT_NUM}-{_ANTIGRAVITY_CLIENT_HASH}"
    ".apps.googleusercontent.com"
)
ANTIGRAVITY_CLIENT_SECRET = f"GOCSPX-{_ANTIGRAVITY_CLIENT_SECRET_SUFFIX}"

# Environment overrides (mirrors SIDEKICK_GEMINI_CLIENT_ID convention).
ENV_CLIENT_ID = "SIDEKICK_ANTIGRAVITY_CLIENT_ID"
ENV_CLIENT_SECRET = "SIDEKICK_ANTIGRAVITY_CLIENT_SECRET"

# =============================================================================
# Endpoints & constants
# =============================================================================
AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v1/userinfo"
CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com"

# Scopes observed from the Antigravity IDE's oauthClient module (main.js,
# array ``Ats``). ``aicode`` is granted implicitly by the consent screen.
OAUTH_SCOPES = (
    "https://www.googleapis.com/auth/cloud-platform "
    "https://www.googleapis.com/auth/userinfo.email "
    "https://www.googleapis.com/auth/userinfo.profile "
    "https://www.googleapis.com/auth/cclog "
    "https://www.googleapis.com/auth/experimentsandconfigs"
)

DEFAULT_REDIRECT_PORT = 8087  # distinct from google_oauth's 8085
REDIRECT_HOST = "127.0.0.1"
CALLBACK_PATH = "/oauth-callback"  # matches the Antigravity IDE's redirect path

TOKEN_REQUEST_TIMEOUT_SECONDS = 30.0
REFRESH_SKEW_SECONDS = 60  # refresh 60s before expiry
CALLBACK_WAIT_SECONDS = 15 * 60
LOCK_TIMEOUT_SECONDS = 30

# Credential-pool slice. Separate from the retired "google-gemini-cli" slice
# so legacy pool entries are never mixed with Antigravity-tier credentials.
POOL_PROVIDER_ID = "antigravity"

# Default consumer project for the Antigravity tier (returned by
# v1internal:loadCodeAssist as cloudaicompanionProject after onboarding).
DEFAULT_ANTIGRAVITY_PROJECT = "aicode-consumers"


class AntigravityOAuthError(RuntimeError):
    """Raised for Antigravity OAuth / Code Assist failures."""

    def __init__(self, message: str, *, code: str = "antigravity_oauth_error") -> None:
        super().__init__(message)
        self.code = code


# =============================================================================
# Credentials model
# =============================================================================

class AntigravityCredentials:
    """One connected Antigravity account."""

    __slots__ = (
        "access_token", "refresh_token", "expires_ms", "email",
        "project_id", "managed_project_id",
    )

    def __init__(
        self,
        *,
        access_token: str = "",
        refresh_token: str = "",
        expires_ms: int = 0,
        email: str = "",
        project_id: str = "",
        managed_project_id: str = "",
    ) -> None:
        self.access_token = str(access_token or "")
        self.refresh_token = str(refresh_token or "")
        self.expires_ms = int(expires_ms or 0)
        self.email = str(email or "")
        self.project_id = str(project_id or "")
        self.managed_project_id = str(managed_project_id or "")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "expires_ms": self.expires_ms,
            "email": self.email,
            "project_id": self.project_id,
            "managed_project_id": self.managed_project_id,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AntigravityCredentials":
        return cls(
            access_token=str(data.get("access_token") or ""),
            refresh_token=str(data.get("refresh_token") or ""),
            expires_ms=int(data.get("expires_ms") or 0),
            email=str(data.get("email") or ""),
            project_id=str(data.get("project_id") or ""),
            managed_project_id=str(data.get("managed_project_id") or ""),
        )

    @property
    def expires_unix_seconds(self) -> float:
        return self.expires_ms / 1000.0

    def access_token_expired(self, skew_seconds: int = REFRESH_SKEW_SECONDS) -> bool:
        if not self.access_token:
            return True
        if not self.expires_ms:
            return True
        return (time.time() + skew_seconds) >= self.expires_unix_seconds


# =============================================================================
# Client-id resolution
# =============================================================================

def _get_client_id() -> str:
    env_val = (os.getenv(ENV_CLIENT_ID) or "").strip()
    return env_val or ANTIGRAVITY_CLIENT_ID


def _get_client_secret() -> str:
    env_val = (os.getenv(ENV_CLIENT_SECRET) or "").strip()
    return env_val or ANTIGRAVITY_CLIENT_SECRET


# =============================================================================
# Pool helpers (antigravity slice of auth.json → credential_pool)
# =============================================================================

def _normalized_account_email(email: str) -> str:
    return str(email or "").strip().casefold()


def _pool_entry_email(entry: Dict[str, Any]) -> str:
    email = entry.get("email")
    if not email and isinstance(entry.get("extra"), dict):
        email = entry["extra"].get("email")
    return _normalized_account_email(email)


def _read_pool_entries() -> List[Dict[str, Any]]:
    from runtime.credential_pool import read_credential_pool
    entries = read_credential_pool(POOL_PROVIDER_ID)
    return [e for e in entries if isinstance(e, dict)]


def _write_pool_entries(entries: List[Dict[str, Any]]) -> None:
    from runtime.credential_pool import write_credential_pool
    write_credential_pool(POOL_PROVIDER_ID, entries)


def list_connected_accounts() -> List[Dict[str, Any]]:
    """Return metadata for every connected Antigravity account (no secrets)."""
    accounts: List[Dict[str, Any]] = []
    for entry in _read_pool_entries():
        email = _pool_entry_email(entry)
        if not email:
            continue
        accounts.append({
            "email": email,
            "label": str(entry.get("label") or email),
            "project_id": str(entry.get("project_id") or ""),
            "last_status": entry.get("last_status"),
            "last_error_reason": entry.get("last_error_reason"),
            "expires_at_ms": int(entry.get("expires_at_ms") or 0),
            "has_refresh_token": bool(str(entry.get("refresh_token") or "").strip()),
        })
    return accounts


def remove_account(email: str) -> bool:
    """Remove one account from the pool. Returns True when an entry was removed."""
    normalized = _normalized_account_email(email)
    if not normalized:
        return False
    entries = _read_pool_entries()
    remaining = [e for e in entries if _pool_entry_email(e) != normalized]
    removed = len(remaining) < len(entries)
    if removed:
        _write_pool_entries(remaining)
    return removed


# =============================================================================
# Round-robin selection
# =============================================================================

_account_round_robin_lock = threading.Lock()
_account_round_robin_index = 0


def select_next_account_email() -> Optional[str]:
    """Choose the next usable Antigravity account in stable pool order.

    Chat requests that do not pin an account rotate across the whole pool.
    Accounts whose refresh grant was invalidated (``invalid_grant``) are
    skipped; quota errors deliberately do NOT disable an account — the next
    request simply advances to another one.
    """
    candidates: List[str] = []
    seen = set()
    for entry in _read_pool_entries():
        email = _pool_entry_email(entry)
        if (
            not email
            or email in seen
            or not str(entry.get("refresh_token") or "").strip()
            or str(entry.get("last_error_reason") or "").casefold() == "invalid_grant"
        ):
            continue
        seen.add(email)
        candidates.append(email)
    if not candidates:
        return None

    global _account_round_robin_index
    with _account_round_robin_lock:
        selected = candidates[_account_round_robin_index % len(candidates)]
        _account_round_robin_index = (_account_round_robin_index + 1) % len(candidates)
    return selected


def load_account_credentials(email: str) -> Optional[AntigravityCredentials]:
    """Load one explicitly selected Antigravity account from the pool."""
    normalized = _normalized_account_email(email)
    if not normalized:
        return None
    for entry in _read_pool_entries():
        if _pool_entry_email(entry) != normalized:
            continue
        if str(entry.get("last_error_reason") or "").casefold() == "invalid_grant":
            raise AntigravityOAuthError(
                "The selected Antigravity account needs to be reconnected.",
                code="antigravity_account_reconnect_required",
            )
        refresh = str(entry.get("refresh_token") or "").strip()
        if not refresh:
            return None
        try:
            expires_ms = int(entry.get("expires_at_ms") or 0)
        except (TypeError, ValueError):
            expires_ms = 0
        return AntigravityCredentials(
            access_token=str(entry.get("access_token") or "").strip(),
            refresh_token=refresh,
            expires_ms=expires_ms,
            email=str(entry.get("email") or ""),
            project_id=str(entry.get("project_id") or ""),
            managed_project_id=str(entry.get("managed_project_id") or ""),
        )
    return None


def save_account_credentials_to_pool(creds: AntigravityCredentials) -> None:
    """Upsert one account's tokens by normalized email, keeping all others."""
    normalized = _normalized_account_email(creds.email)
    if not normalized:
        raise AntigravityOAuthError(
            "Google did not return an account email; credentials cannot be added.",
            code="antigravity_account_missing",
        )
    entries = _read_pool_entries()
    matching = next(
        (entry for entry in entries if _pool_entry_email(entry) == normalized), None
    )
    fields = {
        "access_token": creds.access_token,
        "refresh_token": creds.refresh_token,
        "expires_at_ms": int(creds.expires_ms),
        "email": creds.email,
        "project_id": creds.project_id,
        "managed_project_id": creds.managed_project_id,
        "auth_type": "oauth",
        "source": "antigravity_oauth",
        "label": creds.email,
        "last_status": None,
        "last_status_at": None,
        "last_error_code": None,
        "last_error_reason": None,
        "last_error_message": None,
        "last_error_reset_at": None,
    }
    if matching is None:
        entries.append({"id": secrets.token_hex(8), **fields})
    else:
        matching.update(fields)
        matching.pop("extra", None)
    _write_pool_entries(entries)


# =============================================================================
# Token exchange / refresh
# =============================================================================

def _post_form(url: str, data: Dict[str, str], timeout: float) -> Dict[str, Any]:
    encoded = urllib.parse.urlencode(data).encode("utf-8")
    request = urllib.request.Request(url, data=encoded, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
        return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        if "invalid_grant" in body:
            raise AntigravityOAuthError(
                "Google rejected the refresh token (revoked or expired). Reconnect the account.",
                code="google_oauth_invalid_grant",
            ) from exc
        raise AntigravityOAuthError(
            f"Token endpoint HTTP {exc.code}: {body[:200] or exc.reason}",
            code="antigravity_token_http_error",
        ) from exc
    except urllib.error.URLError as exc:
        raise AntigravityOAuthError(
            f"Token request failed: {exc}",
            code="antigravity_token_network_error",
        ) from exc


def exchange_code(
    code: str,
    redirect_uri: str,
    *,
    client_id: Optional[str] = None,
    client_secret: Optional[str] = None,
    timeout: float = TOKEN_REQUEST_TIMEOUT_SECONDS,
) -> Dict[str, Any]:
    """Exchange the authorization code for access + refresh tokens (no PKCE)."""
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": client_id if client_id is not None else _get_client_id(),
        "client_secret": client_secret if client_secret is not None else _get_client_secret(),
        "redirect_uri": redirect_uri,
    }
    return _post_form(TOKEN_ENDPOINT, data, timeout)


def refresh_access_token(
    refresh_token: str,
    *,
    client_id: Optional[str] = None,
    client_secret: Optional[str] = None,
    timeout: float = TOKEN_REQUEST_TIMEOUT_SECONDS,
) -> Dict[str, Any]:
    if not refresh_token:
        raise AntigravityOAuthError(
            "Cannot refresh: refresh_token is empty. Re-run the Antigravity login.",
            code="antigravity_refresh_token_missing",
        )
    data = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id if client_id is not None else _get_client_id(),
    }
    secret = client_secret if client_secret is not None else _get_client_secret()
    if secret:
        data["client_secret"] = secret
    return _post_form(TOKEN_ENDPOINT, data, timeout)


def _fetch_user_email(access_token: str, timeout: float = TOKEN_REQUEST_TIMEOUT_SECONDS) -> str:
    """Best-effort userinfo fetch; failures return an empty string."""
    try:
        request = urllib.request.Request(
            USERINFO_ENDPOINT + "?alt=json",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
        return str(json.loads(raw).get("email", "") or "")
    except Exception as exc:
        logger.debug("Userinfo fetch failed (non-fatal): %s", exc)
        return ""


# =============================================================================
# In-flight refresh deduplication
# =============================================================================

_refresh_inflight: Dict[str, threading.Event] = {}
_refresh_inflight_lock = threading.Lock()


def _get_valid_account_access_token(email: str, *, force_refresh: bool = False) -> str:
    creds = load_account_credentials(email)
    if creds is None:
        raise AntigravityOAuthError(
            "The selected Antigravity account is not connected. Reconnect it in settings.",
            code="antigravity_account_not_found",
        )
    if not force_refresh and not creds.access_token_expired():
        return creds.access_token
    rt = creds.refresh_token
    if not rt:
        raise AntigravityOAuthError(
            "The selected Antigravity account has no refresh token. Reconnect it.",
            code="antigravity_refresh_missing",
        )
    inflight_key = f"antigravity:{_normalized_account_email(email)}:{rt}"
    with _refresh_inflight_lock:
        event = _refresh_inflight.get(inflight_key)
        if event is None:
            event = threading.Event()
            _refresh_inflight[inflight_key] = event
            owner = True
        else:
            owner = False
    if not owner:
        event.wait(timeout=LOCK_TIMEOUT_SECONDS)
        fresh = load_account_credentials(email)
        if fresh is not None and not fresh.access_token_expired():
            return fresh.access_token
    try:
        response = refresh_access_token(rt)
        access = str(response.get("access_token", "") or "").strip()
        if not access:
            raise AntigravityOAuthError(
                "Refresh response did not include an access_token.",
                code="antigravity_refresh_empty",
            )
        creds.access_token = access
        creds.refresh_token = str(response.get("refresh_token", "") or "").strip() or rt
        expires_in = int(response.get("expires_in", 0) or 0)
        creds.expires_ms = int((time.time() + max(60, expires_in)) * 1000)
        save_account_credentials_to_pool(creds)
        return creds.access_token
    except AntigravityOAuthError as exc:
        if exc.code == "google_oauth_invalid_grant":
            # Mark ONLY this account as exhausted; other pool entries stay usable.
            entries = _read_pool_entries()
            for entry in entries:
                if _pool_entry_email(entry) == _normalized_account_email(email):
                    entry["last_status"] = "exhausted"
                    entry["last_error_code"] = 401
                    entry["last_error_reason"] = "invalid_grant"
                    entry["last_status_at"] = time.time()
                    break
            _write_pool_entries(entries)
        raise
    finally:
        if owner:
            with _refresh_inflight_lock:
                _refresh_inflight.pop(inflight_key, None)
            event.set()


def get_valid_access_token(*, force_refresh: bool = False, account_email: Optional[str] = None) -> str:
    """Return a valid bearer token, refreshing when near expiry.

    With ``account_email`` the matching pool entry is used; without it the
    round-robin selector picks the next account.
    """
    email = _normalized_account_email(account_email or "")
    if not email:
        email = select_next_account_email() or ""
        if not email:
            raise AntigravityOAuthError(
                "No Antigravity account is connected. Add one in Settings → Providers.",
                code="antigravity_not_logged_in",
            )
    return _get_valid_account_access_token(email, force_refresh=force_refresh)


# =============================================================================
# Code Assist onboarding (Antigravity tier)
# =============================================================================

def _code_assist_headers(access_token: str) -> Dict[str, str]:
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {access_token}",
        "User-Agent": "antigravity-ide/1.107.0 sidekick-agent",
    }


def _post_code_assist(path: str, body: Dict[str, Any], access_token: str, timeout: float = 60.0) -> Dict[str, Any]:
    url = f"{CODE_ASSIST_ENDPOINT}{path}"
    encoded = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url, data=encoded, method="POST", headers=_code_assist_headers(access_token)
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
        return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        raise AntigravityOAuthError(
            f"Code Assist HTTP {exc.code}: {detail[:300] or exc.reason}",
            code=f"code_assist_http_{exc.code}",
        ) from exc
    except urllib.error.URLError as exc:
        raise AntigravityOAuthError(
            f"Code Assist request failed: {exc}",
            code="code_assist_network_error",
        ) from exc


def resolve_project_id(access_token: str) -> str:
    """Discover the consumer project via loadCodeAssist (no secrets returned)."""
    resp = _post_code_assist(
        "/v1internal:loadCodeAssist",
        {
            "metadata": {
                "ideType": "IDE_UNSPECIFIED",
                "platform": "PLATFORM_UNSPECIFIED",
                "pluginType": "GEMINI",
            }
        },
        access_token,
    )
    project = str(resp.get("cloudaicompanionProject") or "")
    return project or DEFAULT_ANTIGRAVITY_PROJECT


def onboard_account(access_token: str, *, tier_id: str = "free-tier") -> str:
    """Onboard the account onto the Antigravity tier; returns the project id.

    Mirrors the IDE's login sequence: onboardUser("free-tier") → the response
    carries ``cloudaicompanionProject`` ("aicode-consumers" for consumer
    accounts). Safe to call repeatedly — Google treats it as idempotent.
    """
    resp = _post_code_assist(
        "/v1internal:onboardUser",
        {
            "tierId": tier_id,
            "metadata": {
                "ideType": "IDE_UNSPECIFIED",
                "platform": "PLATFORM_UNSPECIFIED",
                "pluginType": "GEMINI",
            },
        },
        access_token,
        timeout=90.0,
    )
    inner = resp.get("response") if isinstance(resp.get("response"), dict) else resp
    project = ""
    if isinstance(inner, dict):
        companion = inner.get("cloudaicompanionProject")
        if isinstance(companion, dict):
            project = str(companion.get("id") or "")
    return project or DEFAULT_ANTIGRAVITY_PROJECT


# =============================================================================
# Localhost OAuth callback listener
# =============================================================================

@dataclass
class _OAuthCallbackState:
    expected_state: str
    ready: threading.Event
    code: Optional[str] = None
    error: Optional[str] = None


class _OAuthCallbackHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002, N802
        logger.debug("Antigravity OAuth callback request handled")

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != CALLBACK_PATH:
            self.send_response(404)
            self.end_headers()
            return
        params = urllib.parse.parse_qs(parsed.query)
        state = (params.get("state") or [""])[0]
        error = (params.get("error") or [""])[0]
        code = (params.get("code") or [""])[0]
        callback_state = getattr(self.server, "oauth_callback_state", None)
        expected = getattr(callback_state, "expected_state", "")
        if state != expected:
            if callback_state is not None:
                callback_state.error = "state_mismatch"
                callback_state.ready.set()
            self._respond_html(400, _ERROR_PAGE.format(message="State mismatch — aborting for safety."))
        elif error:
            if callback_state is not None:
                callback_state.error = error
                callback_state.ready.set()
            safe_err = str(error).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            self._respond_html(400, _ERROR_PAGE.format(message=f"Authorization denied: {safe_err}"))
        elif code:
            if callback_state is not None:
                callback_state.code = code
                callback_state.ready.set()
            self._respond_html(200, _SUCCESS_PAGE)
        else:
            if callback_state is not None:
                callback_state.error = "no_code"
                callback_state.ready.set()
            self._respond_html(400, _ERROR_PAGE.format(message="Callback received no authorization code."))

    def _respond_html(self, status: int, body: str) -> None:
        payload = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


_SUCCESS_PAGE = """<!doctype html>
<html><head><meta charset="utf-8"><title>Lastbrowser — Antigravity connected</title>
<style>
body { font: 16px/1.5 system-ui, sans-serif; margin: 10vh auto; max-width: 32rem; text-align: center; color: #222; }
h1 { color: #1a7f37; } p { color: #555; }
</style></head>
<body><h1>Antigravity account connected.</h1>
<p>You can close this tab and return to Lastbrowser.</p></body></html>
"""

_ERROR_PAGE = """<!doctype html>
<html><head><meta charset="utf-8"><title>Lastbrowser — sign-in failed</title>
<style>
body {{ font: 16px/1.5 system-ui, sans-serif; margin: 10vh auto; max-width: 32rem; text-align: center; color: #222; }}
h1 {{ color: #b42318; }} p {{ color: #555; }}
</style></head>
<body><h1>Sign-in failed</h1><p>{message}</p>
<p>Return to Lastbrowser and retry, or paste the code manually.</p></body></html>
"""


def _bind_callback_server(preferred_port: int = DEFAULT_REDIRECT_PORT) -> Tuple[http.server.HTTPServer, int]:
    last_error: Optional[Exception] = None
    for port in range(preferred_port, preferred_port + 10):
        try:
            server = http.server.HTTPServer((REDIRECT_HOST, port), _OAuthCallbackHandler)
            return server, port
        except OSError as exc:
            last_error = exc
            continue
    raise AntigravityOAuthError(
        f"Could not bind a localhost OAuth callback port starting at {preferred_port}: {last_error}",
        code="antigravity_callback_bind_failed",
    )


def _is_headless() -> bool:
    return not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY") or os.name == "nt")


# =============================================================================
# Interactive login flow
# =============================================================================

def start_antigravity_oauth_flow(
    *,
    open_browser: bool = True,
    callback_wait_seconds: float = CALLBACK_WAIT_SECONDS,
    on_auth_url=None,
    cancel_event=None,
) -> AntigravityCredentials:
    """Run the browser OAuth flow and persist the account into the pool.

    The flow always requests ``prompt=consent`` + ``access_type=offline`` so
    every login yields a fresh refresh token — repeated logins with different
    Google accounts therefore never overwrite each other's grants.
    """
    client_id = _get_client_id()
    client_secret = _get_client_secret()

    state = secrets.token_urlsafe(16)

    server, port = _bind_callback_server(DEFAULT_REDIRECT_PORT)
    redirect_uri = f"http://{REDIRECT_HOST}:{port}{CALLBACK_PATH}"

    callback_state = _OAuthCallbackState(expected_state=state, ready=threading.Event())
    server.oauth_callback_state = callback_state

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": OAUTH_SCOPES,
        "state": state,
        "access_type": "offline",
        "prompt": "select_account consent",
    }
    auth_url = AUTH_ENDPOINT + "?" + urllib.parse.urlencode(params)
    if callable(on_auth_url):
        on_auth_url(auth_url)

    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    print()
    print("Opening your browser to sign in to Google (Antigravity)…")
    print(f"If it does not open automatically, visit:\n  {auth_url}")
    print()

    if open_browser:
        try:
            import webbrowser
            webbrowser.open(auth_url, new=1, autoraise=True)
        except Exception as exc:
            logger.debug("webbrowser.open failed: %s", exc)

    code: Optional[str] = None
    try:
        deadline = time.time() + callback_wait_seconds
        while not callback_state.ready.is_set() and time.time() < deadline:
            if cancel_event is not None and cancel_event.is_set():
                raise AntigravityOAuthError("Antigravity OAuth cancelled.", code="antigravity_oauth_cancelled")
            callback_state.ready.wait(timeout=min(1.0, max(0.05, deadline - time.time())))
        if callback_state.ready.is_set():
            code = callback_state.code
            error = callback_state.error
            if error:
                raise AntigravityOAuthError(
                    f"Authorization failed: {error}",
                    code="antigravity_oauth_authorization_failed",
                )
        else:
            raise AntigravityOAuthError(
                "No authorization code received in time. Aborting.",
                code="antigravity_oauth_no_code",
            )
    finally:
        try:
            server.shutdown()
        except Exception:
            pass
        try:
            server.server_close()
        except Exception:
            pass
        server_thread.join(timeout=2.0)

    if cancel_event is not None and cancel_event.is_set():
        raise AntigravityOAuthError("Antigravity OAuth cancelled.", code="antigravity_oauth_cancelled")

    token_resp = exchange_code(code, redirect_uri, client_id=client_id, client_secret=client_secret)
    if cancel_event is not None and cancel_event.is_set():
        raise AntigravityOAuthError("Antigravity OAuth cancelled.", code="antigravity_oauth_cancelled")

    access_token = str(token_resp.get("access_token", "") or "").strip()
    refresh_token = str(token_resp.get("refresh_token", "") or "").strip()
    expires_in = int(token_resp.get("expires_in", 0) or 0)
    if not access_token or not refresh_token:
        raise AntigravityOAuthError(
            "Google token response missing access_token or refresh_token. "
            "Retry the login and make sure you approve the consent screen.",
            code="antigravity_incomplete_token_response",
        )

    email = _fetch_user_email(access_token)
    creds = AntigravityCredentials(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_ms=int((time.time() + max(60, expires_in)) * 1000),
        email=email,
        project_id="",
        managed_project_id="",
    )

    # Onboard onto the Antigravity tier and persist the discovered project so
    # generateContent works immediately on the first chat request.
    try:
        creds.project_id = onboard_account(access_token)
    except AntigravityOAuthError as exc:
        # VALIDATION_REQUIRED (403) means Google wants an account verification
        # in a browser first. Keep the account connected — the user can verify
        # and it will work on the next request; surface the reason.
        logger.warning("Antigravity onboarding pending for %s: %s", email or "unknown", exc.code)
        creds.project_id = DEFAULT_ANTIGRAVITY_PROJECT

    save_account_credentials_to_pool(creds)
    logger.info("Antigravity account %s connected (project=%s)", creds.email, creds.project_id)
    return creds


# =============================================================================
# Status
# =============================================================================

def get_antigravity_auth_status() -> Dict[str, Any]:
    """Report connected accounts without exposing any secrets."""
    accounts = list_connected_accounts()
    return {
        "provider_available": True,
        "connected_accounts": len(accounts),
        "accounts": accounts,
        "round_robin": True,
    }
