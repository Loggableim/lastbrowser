"""Profile-scoped Xiaomi MiMo credentials and safe connection probes."""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from urllib.parse import urlsplit


DEFAULT_MIMO_BASE_URL = "https://api.xiaomimimo.com/v1"
MIMO_BASE_URLS_BY_KEY_TYPE = {
    "pay_as_you_go": frozenset({"api.xiaomimimo.com"}),
    "token_plan": frozenset({
        "token-plan-ams.xiaomimimo.com",
        "token-plan-cn.xiaomimimo.com",
    }),
}
MIMO_TEST_MODEL = "mimo-v2.6-flash"


def classify_mimo_key(value: str) -> str | None:
    key = str(value or "").strip()
    if key.startswith("sk-"):
        return "pay_as_you_go"
    if key.startswith(("tp-", "ttp-")):
        return "token_plan"
    return None


def validate_mimo_base_url(value: str, *, key_type: str | None = None,
                           require_explicit: bool = False) -> tuple[str | None, str | None]:
    """Return a validated OpenAI-compatible MiMo URL and stable error code."""
    raw = str(value or "").strip()
    if not raw:
        if require_explicit or key_type == "token_plan":
            return None, "mimo_token_plan_base_url_required" if key_type == "token_plan" else "mimo_base_url_required"
        raw = DEFAULT_MIMO_BASE_URL
    try:
        parsed = urlsplit(raw)
        port = parsed.port
    except (TypeError, ValueError):
        return None, "mimo_base_url_invalid"
    host = (parsed.hostname or "").lower()
    allowed_hosts = MIMO_BASE_URLS_BY_KEY_TYPE.get(key_type)
    if (parsed.scheme.lower() != "https" or host not in (allowed_hosts or ()) or parsed.username or parsed.password
            or port not in (None, 443) or parsed.query or parsed.fragment
            or parsed.path.rstrip("/") != "/v1" or raw != raw.strip()):
        return None, "mimo_base_url_invalid"
    normalized = raw.rstrip("/")
    return normalized, None


def validate_mimo_settings(api_key: str, base_url: str, *, require_explicit: bool = False):
    key = str(api_key or "").strip()
    key_type = classify_mimo_key(key)
    if not key_type:
        return None, None, "mimo_key_type_invalid"
    if len(key) < 8 or any(ord(char) < 33 or ord(char) > 126 for char in key):
        return None, None, "mimo_key_type_invalid"
    normalized, error = validate_mimo_base_url(base_url, key_type=key_type,
        require_explicit=require_explicit)
    if error:
        return None, None, error
    return key, normalized, None


def load_profile_mimo_settings() -> tuple[str, str]:
    """Read only the active Sidekick profile's .env; never process env fallback."""
    try:
        from cli.config import load_env
        values = load_env()
    except Exception:
        values = {}
    key = str(values.get("XIAOMI_API_KEY") or "").strip()
    base_url = str(values.get("XIAOMI_BASE_URL") or "").strip()
    return key, base_url


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def probe_mimo_connection(api_key: str, base_url: str, *, opener_factory=None) -> dict:
    """Authenticate with one minimal chat request to the explicitly bound host.

    The remote response is never returned or logged; only a closed result code
    crosses the API boundary. The probe is intentionally non-streaming so no
    partial answer or tool call can occur.
    """
    key, endpoint, error = validate_mimo_settings(api_key, base_url, require_explicit=True)
    if error:
        return {"ok": False, "error": error}
    request = urllib.request.Request(
        endpoint + "/chat/completions",
        data=json.dumps({"model": MIMO_TEST_MODEL, "messages": [{"role": "user", "content": "ping"}],
                         "max_completion_tokens": 1, "stream": False}).encode("utf-8"),
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        opener = (opener_factory or (lambda: urllib.request.build_opener(_NoRedirect())))()
        with opener.open(request, timeout=8) as response:
            if not 200 <= response.status < 300:
                return {"ok": False, "error": "mimo_provider_unavailable"}
            try:
                payload = json.loads(response.read().decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                return {"ok": False, "error": "mimo_invalid_response"}
            if not isinstance(payload, dict) or not isinstance(payload.get("choices"), list) or not payload["choices"]:
                return {"ok": False, "error": "mimo_invalid_response"}
            return {"ok": True, "provider": "xiaomi", "verified": True}
    except urllib.error.HTTPError as exc:
        if exc.code in {401, 403}:
            code = "mimo_auth_failed"
        elif exc.code == 429:
            code = "mimo_rate_limited"
        else:
            code = "mimo_provider_unavailable"
        return {"ok": False, "error": code}
    except (urllib.error.URLError, TimeoutError, OSError):
        return {"ok": False, "error": "mimo_provider_unavailable"}
