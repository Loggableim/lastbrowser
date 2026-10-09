"""Google OAuth PKCE flow for the Gemini (google-gemini-cli) inference provider.

This module implements Authorization Code + PKCE (S256) OAuth against Google's
accounts.google.com endpoints. The resulting access token is used by
``agent.gemini_cloudcode_adapter`` to talk to ``cloudcode-pa.googleapis.com``
(Google's Code Assist backend that powers the Gemini CLI's free and paid tiers).

Synthesized from:
- jenslys/opencode-gemini-auth (MIT) — overall flow shape, public OAuth creds, request format
- clawdbot/extensions/google/ — refresh-token rotation, VPC-SC handling reference
- PRs #10176 (@sliverp) and #10779 (@newarthur) — PKCE module structure, cross-process lock

Storage (``~/.sidekick/auth/google_oauth.json``, chmod 0o600):

    {
      "refresh": "refreshToken|projectId|managedProjectId",
      "access": "...",
      "expires": 1744848000000,   // unix MILLIseconds
      "email": "user@example.com"
    }

The ``refresh`` field packs the refresh_token together with the resolved GCP
project IDs so subsequent sessions don't need to re-discover the project.
This matches opencode-gemini-auth's storage contract exactly.

The packed format stays parseable even if no project IDs are present — just
a bare refresh_token is treated as "packed with empty IDs".

Public client credentials
-------------------------
The client_id and client_secret below are Google's PUBLIC desktop OAuth client
for their own open-source gemini-cli. They are baked into every copy of the
gemini-cli npm package and are NOT confidential — desktop OAuth clients have
no secret-keeping requirement (PKCE provides the security). Shipping them here
is consistent with opencode-gemini-auth and the official Google gemini-cli.

Policy note: Google considers using this OAuth client with third-party software
a policy violation. Users see an upfront warning with ``confirm(default=False)``
before authorization begins.
"""

from __future__ import annotations

import base64
import contextlib
import hashlib
import http.server
import json
import logging
import os
import secrets
import stat
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from runtime._compat.shim_constants import get_sidekick_home

logger = logging.getLogger(__name__)


# =============================================================================
# OAuth client credential resolution.
#
# Resolution order:
#   1. SIDEKICK_GEMINI_CLIENT_ID / SIDEKICK_GEMINI_CLIENT_SECRET env vars (power users)
#   2. Shipped defaults — Google's public gemini-cli desktop OAuth client
#      (baked into every copy of Google's open-source gemini-cli; NOT
#      confidential — desktop OAuth clients use PKCE, not client_secret, for
#      security). Using these matches opencode-gemini-auth behavior.
#   3. Fallback: scrape from a locally installed gemini-cli binary (helps forks
#      that deliberately wipe the shipped defaults).
#   4. Fail with a helpful error.
# =============================================================================

ENV_CLIENT_ID = "SIDEKICK_GEMINI_CLIENT_ID"
ENV_CLIENT_SECRET = "SIDEKICK_GEMINI_CLIENT_SECRET"

# Public gemini-cli desktop OAuth client (shipped in Google's open-source
# gemini-cli MIT repo). Composed piecewise to keep the constants readable and
# to pair each piece with an explicit comment about why it is non-confidential.
# See: https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/code_assist/oauth2.ts
_PUBLIC_CLIENT_ID_PROJECT_NUM = "681255809395"
_PUBLIC_CLIENT_ID_HASH = "oo8ft2oprdrnp9e3aqf6av3hmdib135j"
_PUBLIC_CLIENT_SECRET_SUFFIX = "4uHgMPm-1o7Sk-geV6Cu5clXFsxl"

_DEFAULT_CLIENT_ID = (
    f"{_PUBLIC_CLIENT_ID_PROJECT_NUM}-{_PUBLIC_CLIENT_ID_HASH}"
    ".apps.googleusercontent.com"
)
_DEFAULT_CLIENT_SECRET = f"GOCSPX-{_PUBLIC_CLIENT_SECRET_SUFFIX}"

# Regex patterns for fallback scraping from an installed gemini-cli.
import re as _re
from shared.utils import atomic_replace
_CLIENT_ID_PATTERN = _re.compile(
    r"OAUTH_CLIENT_ID\s*=\s*['\"]([0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com)['\"]"
)
_CLIENT_SECRET_PATTERN = _re.compile(
    r"OAUTH_CLIENT_SECRET\s*=\s*['\"](GOCSPX-[A-Za-z0-9_-]+)['\"]"
)
_CLIENT_ID_SHAPE = _re.compile(r"([0-9]{8,}-[a-z0-9]{20,}\.apps\.googleusercontent\.com)")
_CLIENT_SECRET_SHAPE = _re.compile(r"(GOCSPX-[A-Za-z0-9_-]{20,})")


# =============================================================================
# Endpoints & constants
# =============================================================================

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v1/userinfo"

OAUTH_SCOPES = (
    "https://www.googleapis.com/auth/cloud-platform "
    "https://www.googleapis.com/auth/userinfo.email "
    "https://www.googleapis.com/auth/userinfo.profile"
)

DEFAULT_REDIRECT_PORT = 8085
REDIRECT_HOST = "127.0.0.1"
CALLBACK_PATH = "/oauth2callback"

# 60-second clock skew buffer (matches opencode-gemini-auth).
REFRESH_SKEW_SECONDS = 60

TOKEN_REQUEST_TIMEOUT_SECONDS = 20.0
CALLBACK_WAIT_SECONDS = 300
LOCK_TIMEOUT_SECONDS = 30.0

# Headless env detection
_HEADLESS_ENV_VARS = ("SSH_CONNECTION", "SSH_CLIENT", "SSH_TTY", "SIDEKICK_HEADLESS")


# =============================================================================
# Error type
# =============================================================================

class GoogleOAuthError(RuntimeError):
    """Raised for any failure in the Google OAuth flow."""

    def __init__(self, message: str, *, code: str = "google_oauth_error") -> None:
        super().__init__(message)
        self.code = code


# =============================================================================
# File paths & cross-process locking
# =============================================================================

def _credentials_path() -> Path:
    return get_sidekick_home() / "auth" / "google_oauth.json"


def _lock_path() -> Path:
    return _credentials_path().with_suffix(".json.lock")


_lock_state = threading.local()


@contextlib.contextmanager
def _credentials_lock(timeout_seconds: float = LOCK_TIMEOUT_SECONDS):
    """Cross-process lock around the credentials file (fcntl POSIX / msvcrt Windows)."""
    depth = getattr(_lock_state, "depth", 0)
    if depth > 0:
        _lock_state.depth = depth + 1
        try:
            yield
        finally:
            _lock_state.depth -= 1
        return

    lock_file_path = _lock_path()
    lock_file_path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(lock_file_path), os.O_CREAT | os.O_RDWR, 0o600)
    acquired = False
    try:
        try:
            import fcntl
        except ImportError:
            fcntl = None

        if fcntl is not None:
            deadline = time.monotonic() + max(0.0, float(timeout_seconds))
            while True:
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    acquired = True
                    break
                except BlockingIOError as exc:
                    if time.monotonic() >= deadline:
                        raise TimeoutError(
                            f"Timed out acquiring Google OAuth credentials lock at {lock_file_path}."
                        ) from exc
                    time.sleep(0.05)
        else:
            try:
                import msvcrt  # type: ignore[import-not-found]

                deadline = time.monotonic() + max(0.0, float(timeout_seconds))
                while True:
                    try:
                        msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
                        acquired = True
                        break
                    except OSError as exc:
                        if time.monotonic() >= deadline:
                            raise TimeoutError(
                                f"Timed out acquiring Google OAuth credentials lock at {lock_file_path}."
                            ) from exc
                        time.sleep(0.05)
            except ImportError:
                acquired = True

        _lock_state.depth = 1
        yield
    finally:
        try:
            if acquired:
                try:
                    import fcntl

                    fcntl.flock(fd, fcntl.LOCK_UN)
                except ImportError:
                    try:
                        import msvcrt  # type: ignore[import-not-found]

                        try:
                            msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
                        except OSError:
                            pass
                    except ImportError:
                        pass
        finally:
            os.close(fd)
            _lock_state.depth = 0


# =============================================================================
# Client ID resolution
# =============================================================================

_scraped_creds_cache: Dict[str, str] = {}


def _locate_gemini_cli_oauth_js() -> Optional[Path]:
    """Walk the user's gemini binary install to find its oauth2.js.

    Returns None if gemini isn't installed. Supports both the npm install
    (``node_modules/@google/gemini-cli-core/dist/**/code_assist/oauth2.js``)
    and the Homebrew ``bundle/`` layout.
    """
    import shutil

    gemini = shutil.which("gemini")
    if not gemini:
        return None

    try:
        real = Path(gemini).resolve()
    except OSError:
        return None

    # Walk up from the binary to find npm install root
    search_dirs: list[Path] = []
    cur = real.parent
    for _ in range(8):  # don't walk too far
        search_dirs.append(cur)
        if (cur / "node_modules").exists():
            search_dirs.append(cur / "node_modules" / "@google" / "gemini-cli-core")
            break
        if cur.parent == cur:
            break
        cur = cur.parent

    for root in search_dirs:
        if not root.exists():
            continue
        # Common known paths
        candidates = [
            root / "dist" / "src" / "code_assist" / "oauth2.js",
            root / "dist" / "code_assist" / "oauth2.js",
            root / "src" / "code_assist" / "oauth2.js",
        ]
        for c in candidates:
            if c.exists():
                return c
        # Recursive fallback: look for oauth2.js within 10 dirs deep
        try:
            for path in root.rglob("oauth2.js"):
                return path
        except (OSError, ValueError):
            continue

    return None


def _scrape_client_credentials() -> Tuple[str, str]:
    """Extract client_id + client_secret from the local gemini-cli install."""
    if _scraped_creds_cache.get("resolved"):
        return _scraped_creds_cache.get("client_id", ""), _scraped_creds_cache.get("client_secret", "")

    oauth_js = _locate_gemini_cli_oauth_js()
    if oauth_js is None:
        _scraped_creds_cache["resolved"] = "1"  # Don't retry on every call
        return "", ""

    try:
        content = oauth_js.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        logger.debug("Failed to read oauth2.js at %s: %s", oauth_js, exc)
        _scraped_creds_cache["resolved"] = "1"
        return "", ""

    # Precise pattern first, then fallback shape match
    cid_match = _CLIENT_ID_PATTERN.search(content) or _CLIENT_ID_SHAPE.search(content)
    cs_match = _CLIENT_SECRET_PATTERN.search(content) or _CLIENT_SECRET_SHAPE.search(content)

    client_id = cid_match.group(1) if cid_match else ""
    client_secret = cs_match.group(1) if cs_match else ""

    _scraped_creds_cache["client_id"] = client_id
    _scraped_creds_cache["client_secret"] = client_secret
    _scraped_creds_cache["resolved"] = "1"

    if client_id:
        logger.info("Scraped Gemini OAuth client from %s", oauth_js)

    return client_id, client_secret


def _get_client_id() -> str:
    env_val = (os.getenv(ENV_CLIENT_ID) or "").strip()
    if env_val:
        return env_val
    if _DEFAULT_CLIENT_ID:
        return _DEFAULT_CLIENT_ID
    scraped, _ = _scrape_client_credentials()
    return scraped


def _get_client_secret() -> str:
    env_val = (os.getenv(ENV_CLIENT_SECRET) or "").strip()
    if env_val:
        return env_val
    if _DEFAULT_CLIENT_SECRET:
        return _DEFAULT_CLIENT_SECRET
    _, scraped = _scrape_client_credentials()
    return scraped


def _require_client_id() -> str:
    cid = _get_client_id()
    if not cid:
        raise GoogleOAuthError(
            "Google OAuth client ID is not available.\n"
            "Sidekick looks for a locally installed gemini-cli to source the OAuth client. "
            "Either:\n"
            "  1. Install it: npm install -g @google/gemini-cli  (or brew install gemini-cli)\n"
            "  2. Set SIDEKICK_GEMINI_CLIENT_ID and SIDEKICK_GEMINI_CLIENT_SECRET in ~/.sidekick/.env\n"
            "\n"
            "Register a Desktop OAuth client at:\n"
            "  https://console.cloud.google.com/apis/credentials\n"
            "(enable the Generative Language API on the project).",
            code="google_oauth_client_id_missing",
        )
    return cid


# =============================================================================
# PKCE
# =============================================================================

def _generate_pkce_pair() -> Tuple[str, str]:
    """Generate a (verifier, challenge) pair using S256."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


# =============================================================================
# Packed refresh format:  refresh_token[|project_id[|managed_project_id]]
# =============================================================================

@dataclass
class RefreshParts:
    refresh_token: str
    project_id: str = ""
    managed_project_id: str = ""

    @classmethod
    def parse(cls, packed: str) -> "RefreshParts":
        if not packed:
            return cls(refresh_token="")
        parts = packed.split("|", 2)
        return cls(
            refresh_token=parts[0],
            project_id=parts[1] if len(parts) > 1 else "",
            managed_project_id=parts[2] if len(parts) > 2 else "",
        )

    def format(self) -> str:
        if not self.refresh_token:
            return ""
        if not self.project_id and not self.managed_project_id:
            return self.refresh_token
        return f"{self.refresh_token}|{self.project_id}|{self.managed_project_id}"


# =============================================================================
# Credentials (dataclass wrapping the on-disk format)
# =============================================================================

@dataclass
class GoogleCredentials:
    access_token: str
    refresh_token: str
    expires_ms: int  # unix milliseconds
    email: str = ""
    project_id: str = ""
    managed_project_id: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "refresh": RefreshParts(
                refresh_token=self.refresh_token,
                project_id=self.project_id,
                managed_project_id=self.managed_project_id,
            ).format(),
            "access": self.access_token,
            "expires": int(self.expires_ms),
            "email": self.email,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "GoogleCredentials":
        refresh_packed = str(data.get("refresh", "") or "")
        parts = RefreshParts.parse(refresh_packed)
        return cls(
            access_token=str(data.get("access", "") or ""),
            refresh_token=parts.refresh_token,
            expires_ms=int(data.get("expires", 0) or 0),
            email=str(data.get("email", "") or ""),
            project_id=parts.project_id,
            managed_project_id=parts.managed_project_id,
        )

    def expires_unix_seconds(self) -> float:
        return self.expires_ms / 1000.0

    def access_token_expired(self, skew_seconds: int = REFRESH_SKEW_SECONDS) -> bool:
        if not self.access_token or not self.expires_ms:
            return True
        return (time.time() + max(0, skew_seconds)) * 1000 >= self.expires_ms


# =============================================================================
# Credential I/O (atomic + locked)
# =============================================================================

def load_credentials() -> Optional[GoogleCredentials]:
    """Load credentials from disk. Returns None if missing or corrupt."""
    path = _credentials_path()
    if not path.exists():
        return None
    try:
        with _credentials_lock():
            raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
    except (json.JSONDecodeError, OSError, IOError) as exc:
        logger.warning("Failed to read Google OAuth credentials at %s: %s", path, exc)
        return None
    if not isinstance(data, dict):
        return None
    creds = GoogleCredentials.from_dict(data)
    if not creds.access_token:
        return None
    return creds


def _normalized_account_email(email: str) -> str:
    return str(email or "").strip().casefold()


def _pool_entry_email(entry: Dict[str, Any]) -> str:
    email = entry.get("email")
    if not email and isinstance(entry.get("extra"), dict):
        email = entry["extra"].get("email")
    return _normalized_account_email(email)


_account_round_robin_lock = threading.Lock()
_account_round_robin_index = 0


def select_next_account_email() -> Optional[str]:
    """Choose the next usable Gemini CLI account in stable pool order.

    Chat requests that do not explicitly select an account must still rotate
    across the multi-account pool. Invalidated Google refresh grants are
    excluded; quota errors are deliberately not persisted as a reason to
    disable an account, so the next request naturally advances to another.
    """
    from runtime.credential_pool import read_credential_pool

    candidates = []
    seen = set()
    for entry in read_credential_pool("google-gemini-cli"):
        if not isinstance(entry, dict):
            continue
        email = _pool_entry_email(entry)
        if (not email or email in seen or not str(entry.get("access_token") or "").strip()
                or str(entry.get("last_error_reason") or "").casefold() == "invalid_grant"):
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


def load_account_credentials(email: str) -> Optional[GoogleCredentials]:
    """Load one explicitly selected Google account from the provider pool.

    The singleton file remains authoritative for callers that do not provide an
    account selector. Account-aware chat requests use the pool so separate
    logins do not overwrite each other's refresh tokens or project IDs.
    """
    normalized = _normalized_account_email(email)
    if not normalized:
        return None
    from runtime.credential_pool import read_credential_pool

    for entry in read_credential_pool("google-gemini-cli"):
        if _pool_entry_email(entry) != normalized:
            continue
        if str(entry.get("last_error_reason") or "").casefold() == "invalid_grant":
            raise GoogleOAuthError(
                "The selected Google account needs to be reconnected.",
                code="google_oauth_account_reconnect_required",
            )
        access = str(entry.get("access_token") or "").strip()
        if not access:
            return None
        try:
            expires_ms = int(entry.get("expires_at_ms") or 0)
        except (TypeError, ValueError):
            expires_ms = 0
        return GoogleCredentials(
            access_token=access,
            refresh_token=str(entry.get("refresh_token") or "").strip(),
            expires_ms=expires_ms,
            email=str(entry.get("email") or "").strip(),
            project_id=str(entry.get("project_id") or "").strip(),
            managed_project_id=str(entry.get("managed_project_id") or "").strip(),
        )
    return None


def save_account_credentials(creds: GoogleCredentials) -> None:
    """Update only the matching Google account entry in the provider pool."""
    normalized = _normalized_account_email(creds.email)
    if not normalized:
        raise GoogleOAuthError("Google account email is required for account-scoped credentials.",
                               code="google_oauth_account_missing")
    from runtime.credential_pool import read_credential_pool, write_credential_pool

    entries = read_credential_pool("google-gemini-cli")
    matched = False
    for entry in entries:
        if _pool_entry_email(entry) != normalized:
            continue
        entry.update({
            "access_token": creds.access_token,
            "refresh_token": creds.refresh_token,
            "expires_at_ms": int(creds.expires_ms),
            "email": creds.email,
            "project_id": creds.project_id,
            "managed_project_id": creds.managed_project_id,
            "last_status": None,
            "last_status_at": None,
            "last_error_code": None,
            "last_error_reason": None,
            "last_error_message": None,
            "last_error_reset_at": None,
        })
        matched = True
        break
    if not matched:
        raise GoogleOAuthError("Selected Google account is no longer connected.",
                               code="google_oauth_account_not_found")
    write_credential_pool("google-gemini-cli", entries)


def save_credentials(creds: GoogleCredentials) -> Path:
    """Atomically write creds to disk with 0o600 permissions."""
    path = _credentials_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    # Tighten parent dir to 0o700 so siblings can't traverse to the creds file.
    # On Windows this is a no-op (POSIX mode bits aren't enforced); ignore failures.
    try:
        os.chmod(path.parent, 0o700)
    except OSError:
        pass
    payload = json.dumps(creds.to_dict(), indent=2, sort_keys=True) + "\n"

    with _credentials_lock():
        tmp_path = path.with_suffix(f".tmp.{os.getpid()}.{secrets.token_hex(4)}")
        try:
            # Create with 0o600 atomically to close the TOCTOU window where the
            # default umask (often 0o644) would briefly expose tokens to other
            # local users between open() and chmod().
            fd = os.open(
                str(tmp_path),
                os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                stat.S_IRUSR | stat.S_IWUSR,
            )
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(payload)
                fh.flush()
                os.fsync(fh.fileno())
            atomic_replace(tmp_path, path)
        finally:
            try:
                if tmp_path.exists():
                    tmp_path.unlink()
            except OSError:
                pass
    return path


def clear_credentials() -> None:
    """Remove the creds file. Idempotent."""
    path = _credentials_path()
    with _credentials_lock():
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        except OSError as exc:
            logger.warning("Failed to remove Google OAuth credentials at %s: %s", path, exc)


# =============================================================================
# HTTP helpers
# =============================================================================

def _mask_email(email: str) -> str:
    raw = str(email or "").strip()
    if "@" not in raw:
        return "[redacted]" if raw else "unknown"
    user, domain = raw.split("@", 1)
    if len(user) <= 2:
        masked_user = user[:1] + "*"
    else:
        masked_user = user[:2] + "***" + user[-1:]
    return f"{masked_user}@{domain}"


def _sanitize_error_message(text: str) -> str:
    """Redact any accidental email or token patterns from error strings."""
    if not text:
        return ""
    import re
    sanitized = re.sub(
        r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
        lambda m: _mask_email(m.group(0)),
        text,
    )
    sanitized = re.sub(
        r"\b(?:ya29\.[A-Za-z0-9_-]+|1//[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]+)\b",
        "[token-redacted]",
        sanitized,
    )
    return sanitized


def _post_form(url: str, data: Dict[str, str], timeout: float) -> Dict[str, Any]:
    """POST x-www-form-urlencoded and return parsed JSON response."""
    body = urllib.parse.urlencode(data).encode("ascii")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        raw_detail = ""
        try:
            raw_detail = exc.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        code = "google_oauth_token_http_error"
        error_msg = f"HTTP {exc.code}"
        if raw_detail:
            try:
                err_data = json.loads(raw_detail)
                err_code = str(err_data.get("error", "")).strip().lower()
                err_desc = str(err_data.get("error_description", "")).strip()
                if err_code == "invalid_grant" or "invalid_grant" in raw_detail.lower():
                    code = "google_oauth_invalid_grant"
                if err_desc:
                    error_msg = f"HTTP {exc.code}: {_sanitize_error_message(err_desc)}"
                elif err_code:
                    error_msg = f"HTTP {exc.code}: {_sanitize_error_message(err_code)}"
                else:
                    error_msg = f"HTTP {exc.code}: {exc.reason}"
            except Exception:
                if "invalid_grant" in raw_detail.lower():
                    code = "google_oauth_invalid_grant"
                error_msg = f"HTTP {exc.code}: {exc.reason}"
        else:
            error_msg = f"HTTP {exc.code}: {exc.reason}"
        raise GoogleOAuthError(
            f"Google OAuth token endpoint returned {error_msg}",
            code=code,
        ) from exc
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", None) or "connection failed"
        raise GoogleOAuthError(
            f"Google OAuth token request failed: {reason}",
            code="google_oauth_token_network_error",
        ) from exc


def exchange_code(
    code: str,
    verifier: str,
    redirect_uri: str,
    *,
    client_id: Optional[str] = None,
    client_secret: Optional[str] = None,
    timeout: float = TOKEN_REQUEST_TIMEOUT_SECONDS,
) -> Dict[str, Any]:
    """Exchange authorization code for access + refresh tokens."""
    cid = client_id if client_id is not None else _get_client_id()
    csecret = client_secret if client_secret is not None else _get_client_secret()
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "code_verifier": verifier,
        "client_id": cid,
        "redirect_uri": redirect_uri,
    }
    if csecret:
        data["client_secret"] = csecret
    return _post_form(TOKEN_ENDPOINT, data, timeout)


def refresh_access_token(
    refresh_token: str,
    *,
    client_id: Optional[str] = None,
    client_secret: Optional[str] = None,
    timeout: float = TOKEN_REQUEST_TIMEOUT_SECONDS,
) -> Dict[str, Any]:
    """Refresh the access token."""
    if not refresh_token:
        raise GoogleOAuthError(
            "Cannot refresh: refresh_token is empty. Re-run OAuth login.",
            code="google_oauth_refresh_token_missing",
        )
    cid = client_id if client_id is not None else _get_client_id()
    csecret = client_secret if client_secret is not None else _get_client_secret()
    data = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": cid,
    }
    if csecret:
        data["client_secret"] = csecret
    return _post_form(TOKEN_ENDPOINT, data, timeout)


def _fetch_user_email(access_token: str, timeout: float = TOKEN_REQUEST_TIMEOUT_SECONDS) -> str:
    """Best-effort userinfo fetch for display. Failures return empty string."""
    try:
        request = urllib.request.Request(
            USERINFO_ENDPOINT + "?alt=json",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
        data = json.loads(raw)
        return str(data.get("email", "") or "")
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
        raise GoogleOAuthError("The selected Google account is not connected. Reconnect it in Gemini Accounts.",
                               code="google_oauth_account_not_found")
    if not force_refresh and not creds.access_token_expired():
        return creds.access_token
    rt = creds.refresh_token
    if not rt:
        raise GoogleOAuthError("The selected Google account has no refresh token. Reconnect it in Gemini Accounts.",
                               code="google_oauth_refresh_missing")
    inflight_key = f"account:{_normalized_account_email(email)}:{rt}"
    with _refresh_inflight_lock:
        event = _refresh_inflight.get(inflight_key)
        if event is None:
            event = threading.Event()
            _refresh_inflight[inflight_key] = event
            owner = True
        else:
            owner = False
    if not owner:
        completed = event.wait(timeout=LOCK_TIMEOUT_SECONDS)
        fresh = load_account_credentials(email)
        if fresh is not None and not fresh.access_token_expired():
            return fresh.access_token
        if not completed:
            raise GoogleOAuthError(
                "Another Google OAuth token refresh is still in progress. Retry the request.",
                code="google_oauth_refresh_in_progress",
            )
        from runtime.credential_pool import read_credential_pool
        for entry in read_credential_pool("google-gemini-cli"):
            if _pool_entry_email(entry) == _normalized_account_email(email):
                if (
                    str(entry.get("last_status") or "").casefold() == "exhausted"
                    and str(entry.get("last_error_reason") or "").casefold() == "invalid_grant"
                ):
                    raise GoogleOAuthError(
                        "Google rejected the refresh token (revoked or expired). Reconnect the account.",
                        code="google_oauth_invalid_grant",
                    )
                break
        raise GoogleOAuthError(
            "The concurrent Google OAuth token refresh did not produce a usable access token. Retry the request.",
            code="google_oauth_refresh_failed",
        )
    try:
        response = refresh_access_token(rt)
        access = str(response.get("access_token", "") or "").strip()
        if not access:
            raise GoogleOAuthError("Refresh response did not include an access_token.",
                                   code="google_oauth_refresh_empty")
        creds.access_token = access
        creds.refresh_token = str(response.get("refresh_token", "") or "").strip() or rt
        expires_in = int(response.get("expires_in", 0) or 0)
        creds.expires_ms = int((time.time() + max(60, expires_in)) * 1000)
        save_account_credentials(creds)
        return creds.access_token
    except GoogleOAuthError as exc:
        # An invalid pooled account must not erase the singleton or other users.
        if exc.code == "google_oauth_invalid_grant":
            from runtime.credential_pool import read_credential_pool, write_credential_pool
            entries = read_credential_pool("google-gemini-cli")
            for entry in entries:
                if _pool_entry_email(entry) == _normalized_account_email(email):
                    entry["last_status"] = "exhausted"
                    entry["last_error_code"] = 401
                    entry["last_error_reason"] = "invalid_grant"
                    entry["last_status_at"] = time.time()
                    break
            write_credential_pool("google-gemini-cli", entries)
        raise
    finally:
        if owner:
            with _refresh_inflight_lock:
                _refresh_inflight.pop(inflight_key, None)
            event.set()


def get_valid_access_token(*, force_refresh: bool = False, account_email: Optional[str] = None) -> str:
    """Load creds, refreshing if near expiry, and return a valid bearer token.

    Dedupes concurrent refreshes by refresh_token. On ``invalid_grant``, the
    credential file is wiped and a ``google_oauth_invalid_grant`` error is raised
    (caller is expected to trigger a re-login flow).
    """
    if account_email:
        return _get_valid_account_access_token(account_email, force_refresh=force_refresh)
    creds = load_credentials()
    if creds is None:
        raise GoogleOAuthError(
            "No Google OAuth credentials found. Run `sidekick login --provider google-gemini-cli` first.",
            code="google_oauth_not_logged_in",
        )

    if not force_refresh and not creds.access_token_expired():
        return creds.access_token

    # Dedupe concurrent refreshes by refresh_token
    rt = creds.refresh_token
    with _refresh_inflight_lock:
        event = _refresh_inflight.get(rt)
        if event is None:
            event = threading.Event()
            _refresh_inflight[rt] = event
            owner = True
        else:
            owner = False

    if not owner:
        # Another thread is refreshing — wait, then re-read from disk.
        completed = event.wait(timeout=LOCK_TIMEOUT_SECONDS)
        fresh = load_credentials()
        if fresh is not None and not fresh.access_token_expired():
            return fresh.access_token
        if not completed:
            raise GoogleOAuthError(
                "Another Google OAuth token refresh is still in progress. Retry the request.",
                code="google_oauth_refresh_in_progress",
            )
        raise GoogleOAuthError(
            "The concurrent Google OAuth token refresh did not produce a usable access token. Retry the request.",
            code="google_oauth_refresh_failed",
        )

    try:
        try:
            resp = refresh_access_token(rt)
        except GoogleOAuthError as exc:
            if exc.code == "google_oauth_invalid_grant":
                logger.warning(
                    "Google OAuth refresh token invalid (revoked/expired). "
                    "Clearing credentials at %s — user must re-login.",
                    _credentials_path(),
                )
                clear_credentials()
            raise

        new_access = str(resp.get("access_token", "") or "").strip()
        if not new_access:
            raise GoogleOAuthError(
                "Refresh response did not include an access_token.",
                code="google_oauth_refresh_empty",
            )
        # Google sometimes rotates refresh_token; preserve existing if omitted.
        new_refresh = str(resp.get("refresh_token", "") or "").strip() or creds.refresh_token
        expires_in = int(resp.get("expires_in", 0) or 0)

        creds.access_token = new_access
        creds.refresh_token = new_refresh
        creds.expires_ms = int((time.time() + max(60, expires_in)) * 1000)
        save_credentials(creds)
        return creds.access_token
    finally:
        if owner:
            with _refresh_inflight_lock:
                _refresh_inflight.pop(rt, None)
            event.set()


# =============================================================================
# Update project IDs on stored creds
# =============================================================================

def update_project_ids(project_id: str = "", managed_project_id: str = "", *, account_email: Optional[str] = None) -> None:
    """Persist resolved/discovered project IDs back into the credential file."""
    if account_email:
        creds = load_account_credentials(account_email)
        if creds is None:
            return
        if project_id:
            creds.project_id = project_id
        if managed_project_id:
            creds.managed_project_id = managed_project_id
        save_account_credentials(creds)
        return
    creds = load_credentials()
    if creds is None:
        return
    if project_id:
        creds.project_id = project_id
    if managed_project_id:
        creds.managed_project_id = managed_project_id
    save_credentials(creds)
    save_account_credentials_to_pool(creds)


# =============================================================================
# Callback server
# =============================================================================

@dataclass
class _OAuthCallbackState:
    expected_state: str
    ready: threading.Event
    code: Optional[str] = None
    error: Optional[str] = None


class _OAuthCallbackHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002, N802
        # BaseHTTPRequestHandler includes the complete request path in its
        # default log arguments. OAuth callback URLs contain a short-lived
        # authorization code and state, so never log those arguments.
        logger.debug("OAuth callback request handled")

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

        # Read the expected state from the server instance, not the class.
        # `expected_state` is a class attribute, so two concurrent flows (or a
        # retried flow) would overwrite each other and the second callback
        # would fail with "state_mismatch" even though the user signed in
        # correctly. The server carries the state for its own flow.
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
            # Simple HTML-escape of the error value
            safe_err = (
                str(error)
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
            )
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
<html><head><meta charset="utf-8"><title>Sidekick — signed in</title>
<style>
body { font: 16px/1.5 system-ui, sans-serif; margin: 10vh auto; max-width: 32rem; text-align: center; color: #222; }
h1 { color: #1a7f37; } p { color: #555; }
</style></head>
<body><h1>Signed in to Google.</h1>
<p>You can close this tab and return to your terminal.</p></body></html>
"""

_ERROR_PAGE = """<!doctype html>
<html><head><meta charset="utf-8"><title>Sidekick — sign-in failed</title>
<style>
body {{ font: 16px/1.5 system-ui, sans-serif; margin: 10vh auto; max-width: 32rem; text-align: center; color: #222; }}
h1 {{ color: #b42318; }} p {{ color: #555; }}
</style></head>
<body><h1>Sign-in failed</h1><p>{message}</p>
<p>Return to your terminal — Sidekick will walk you through a manual paste fallback.</p></body></html>
"""


def _bind_callback_server(preferred_port: int = DEFAULT_REDIRECT_PORT) -> Tuple[http.server.HTTPServer, int]:
    try:
        server = http.server.HTTPServer((REDIRECT_HOST, preferred_port), _OAuthCallbackHandler)
        return server, preferred_port
    except OSError as exc:
        logger.info(
            "Preferred OAuth callback port %d unavailable (%s); requesting ephemeral port",
            preferred_port, exc,
        )
    server = http.server.HTTPServer((REDIRECT_HOST, 0), _OAuthCallbackHandler)
    return server, server.server_address[1]


def _is_headless() -> bool:
    return any(os.getenv(k) for k in _HEADLESS_ENV_VARS)


# =============================================================================
# Main login flow
# =============================================================================

def start_oauth_flow(
    *,
    force_relogin: bool = False,
    open_browser: bool = True,
    callback_wait_seconds: float = CALLBACK_WAIT_SECONDS,
    project_id: str = "",
    on_auth_url=None,
    cancel_event=None,
) -> GoogleCredentials:
    """Run the interactive browser OAuth flow and persist credentials.

    Args:
        force_relogin: If False and valid creds already exist, return them.
        open_browser: If False, skip webbrowser.open and print the URL only.
        callback_wait_seconds: Max seconds to wait for the browser callback.
        project_id: Initial GCP project ID to bake into the stored creds.
                    Can be discovered/updated later via update_project_ids().
    """
    if not force_relogin:
        existing = load_credentials()
        if existing and existing.access_token:
            logger.info("Google OAuth credentials already present; skipping login.")
            return existing

    client_id = _require_client_id()  # raises GoogleOAuthError with install hints
    client_secret = _get_client_secret()

    verifier, challenge = _generate_pkce_pair()
    state = secrets.token_urlsafe(16)

    # If headless, skip the listener and go straight to paste mode
    if _is_headless() and open_browser:
        logger.info("Headless environment detected; using paste-mode OAuth fallback.")
        return _paste_mode_login(verifier, challenge, state, client_id, client_secret, project_id)

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
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "access_type": "offline",
        "prompt": "select_account consent",
    }
    auth_url = AUTH_ENDPOINT + "?" + urllib.parse.urlencode(params) + "#sidekick"
    if callable(on_auth_url):
        on_auth_url(auth_url)

    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    print()
    print("Opening your browser to sign in to Google…")
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
                raise GoogleOAuthError("Google OAuth cancelled.", code="google_oauth_cancelled")
            callback_state.ready.wait(timeout=min(1.0, max(0.05, deadline - time.time())))
        if callback_state.ready.is_set():
            code = callback_state.code
            error = callback_state.error
            if error:
                raise GoogleOAuthError(
                    f"Authorization failed: {error}",
                    code="google_oauth_authorization_failed",
                )
        else:
            logger.info("Callback server timed out — offering manual paste fallback.")
            code = _prompt_paste_fallback()
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

    if not code:
        raise GoogleOAuthError(
            "No authorization code received. Aborting.",
            code="google_oauth_no_code",
        )

    if cancel_event is not None and cancel_event.is_set():
        raise GoogleOAuthError("Google OAuth cancelled.", code="google_oauth_cancelled")

    token_resp = exchange_code(
        code, verifier, redirect_uri,
        client_id=client_id, client_secret=client_secret,
    )
    # The token request may take several seconds. A cancellation received while
    # it is in flight must win before any credentials are persisted.
    if cancel_event is not None and cancel_event.is_set():
        raise GoogleOAuthError("Google OAuth cancelled.", code="google_oauth_cancelled")
    return _persist_token_response(token_resp, project_id=project_id)


def _paste_mode_login(
    verifier: str,
    challenge: str,
    state: str,
    client_id: str,
    client_secret: str,
    project_id: str,
) -> GoogleCredentials:
    """Run OAuth flow without a local callback server."""
    # Use a placeholder redirect URI; user will paste the full URL back
    redirect_uri = f"http://{REDIRECT_HOST}:{DEFAULT_REDIRECT_PORT}{CALLBACK_PATH}"
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": OAUTH_SCOPES,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "access_type": "offline",
        "prompt": "select_account consent",
    }
    auth_url = AUTH_ENDPOINT + "?" + urllib.parse.urlencode(params) + "#sidekick"

    print()
    print("Open this URL in a browser on any device:")
    print(f"  {auth_url}")
    print()
    print("After signing in, Google will redirect to localhost (which won't load).")
    print("Copy the full URL from your browser and paste it below.")
    print()

    code = _prompt_paste_fallback()
    if not code:
        raise GoogleOAuthError("No authorization code provided.", code="google_oauth_no_code")

    token_resp = exchange_code(
        code, verifier, redirect_uri,
        client_id=client_id, client_secret=client_secret,
    )
    return _persist_token_response(token_resp, project_id=project_id)


def _prompt_paste_fallback() -> Optional[str]:
    print()
    print("Paste the full redirect URL Google showed you, OR just the 'code=' parameter value.")
    raw = input("Callback URL or code: ").strip()
    if not raw:
        return None
    if raw.startswith("http://") or raw.startswith("https://"):
        parsed = urllib.parse.urlparse(raw)
        params = urllib.parse.parse_qs(parsed.query)
        return (params.get("code") or [""])[0] or None
    # Accept a bare query string as well
    if raw.startswith("?"):
        params = urllib.parse.parse_qs(raw[1:])
        return (params.get("code") or [""])[0] or None
    return raw


def _persist_token_response(
    token_resp: Dict[str, Any],
    *,
    project_id: str = "",
) -> GoogleCredentials:
    access_token = str(token_resp.get("access_token", "") or "").strip()
    refresh_token = str(token_resp.get("refresh_token", "") or "").strip()
    expires_in = int(token_resp.get("expires_in", 0) or 0)
    if not access_token or not refresh_token:
        raise GoogleOAuthError(
            "Google token response missing access_token or refresh_token.",
            code="google_oauth_incomplete_token_response",
        )
    email = _fetch_user_email(access_token)
    if not email:
        raise GoogleOAuthError(
            "Google did not return an account email; credentials cannot be added to the multi-account pool.",
            code="google_oauth_account_missing",
        )
    creds = GoogleCredentials(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_ms=int((time.time() + max(60, expires_in)) * 1000),
        email=email,
        project_id=project_id,
        managed_project_id="",
    )
    save_credentials(creds)
    save_account_credentials_to_pool(creds)
    logger.info("Google OAuth credentials saved to %s", _credentials_path())
    return creds


def save_account_credentials_to_pool(creds: GoogleCredentials) -> None:
    """Upsert OAuth tokens by normalized email without replacing other accounts."""
    normalized = _normalized_account_email(creds.email)
    if not normalized:
        raise GoogleOAuthError(
            "Google did not return an account email; credentials cannot be added to the multi-account pool.",
            code="google_oauth_account_missing",
        )
    from runtime.credential_pool import read_credential_pool, write_credential_pool

    entries = read_credential_pool("google-gemini-cli")
    matching = next((entry for entry in entries if _pool_entry_email(entry) == normalized), None)
    fields = {
        "access_token": creds.access_token,
        "refresh_token": creds.refresh_token,
        "expires_at_ms": int(creds.expires_ms),
        "email": creds.email,
        "project_id": creds.project_id,
        "managed_project_id": creds.managed_project_id,
        "auth_type": "oauth",
        "source": "google_pkce",
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
    write_credential_pool("google-gemini-cli", entries)


# =============================================================================
# Pool-compatible variant
# =============================================================================

def run_gemini_oauth_login_pure() -> Dict[str, Any]:
    """Run the login flow and return a dict matching the credential pool shape."""
    creds = start_oauth_flow(force_relogin=True)
    return {
        "access_token": creds.access_token,
        "refresh_token": creds.refresh_token,
        "expires_at_ms": creds.expires_ms,
        "email": creds.email,
        "project_id": creds.project_id,
    }


# =============================================================================
# Project ID resolution
# =============================================================================

def resolve_project_id_from_env() -> str:
    """Return a GCP project ID from env vars, in priority order."""
    for var in (
        "SIDEKICK_GEMINI_PROJECT_ID",
        "GOOGLE_CLOUD_PROJECT",
        "GOOGLE_CLOUD_PROJECT_ID",
    ):
        val = (os.getenv(var) or "").strip()
        if val:
            return val
    return ""
