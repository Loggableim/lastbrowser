"""Profile-bound OpenCode Console device OAuth; credentials never cross the API."""
from __future__ import annotations

import contextlib
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from cli.config import get_sidekick_home

_BASE = "https://opencode.ai"
_CLIENT = "lastbrowser"
_PROVIDERS = {"opencode-go": ("opencode-go", "go", "opencode"), "opencode-zen": ("opencode", "opencode-zen", "zen")}
_LOCK = threading.RLock()
_PENDING = {}


class DeviceError(RuntimeError):
    pass


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def _request(path, *, data=None, token=None):
    headers = {"User-Agent": "LastBrowser/0.1.55", "Accept": "application/json"}
    payload = None
    if data is not None:
        payload = urllib.parse.urlencode(data).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(_BASE + path, data=payload, headers=headers)
    try:
        with urllib.request.build_opener(_NoRedirect()).open(request, timeout=15) as response:
            result = json.loads(response.read(2_000_001))
    except urllib.error.HTTPError as error:
        try:
            result = json.loads(error.read(4096))
            code = result.get("error", "device_request_failed")
        except (ValueError, TypeError):
            code = "device_request_failed"
        raise DeviceError(code if code in {"authorization_pending", "slow_down", "access_denied", "expired_token", "invalid_grant"}
                          else "device_request_failed") from None
    except (OSError, ValueError):
        raise DeviceError("device_request_failed") from None
    if not isinstance(result, dict):
        raise DeviceError("invalid_device_response")
    return result


def _path(home):
    return Path(home) / "opencode-device.json"


@contextlib.contextmanager
def _credential_lock(home):
    """Serialize single-use refresh across both threads and worker processes."""
    with _LOCK:
        home = Path(home)
        home.mkdir(parents=True, exist_ok=True)
        with (home / ".opencode-device.lock").open("a+b") as file:
            deadline = time.monotonic() + 30
            while True:
                try:
                    file.seek(0)
                    if os.name == "nt":
                        import msvcrt
                        msvcrt.locking(file.fileno(), msvcrt.LK_NBLCK, 1)
                    else:
                        import fcntl
                        fcntl.flock(file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except OSError:
                    if time.monotonic() >= deadline:
                        raise DeviceError("credential_refresh_busy") from None
                    time.sleep(.05)
            try:
                yield
            finally:
                file.seek(0)
                if os.name == "nt":
                    import msvcrt
                    msvcrt.locking(file.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(file.fileno(), fcntl.LOCK_UN)


def _read(home):
    try:
        result = json.loads(_path(home).read_text("utf-8"))
        return result if isinstance(result, dict) else {}
    except FileNotFoundError:
        return {}
    except (OSError, ValueError):
        raise DeviceError("invalid_device_credentials") from None


def _write(home, records):
    descriptor, temporary = tempfile.mkstemp(prefix=".opencode-device-", dir=home)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as file:
            json.dump(records, file)
            file.flush()
            os.fsync(file.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, _path(home))
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def has_credentials(provider_id):
    return provider_id in _read(get_sidekick_home())


def credential_status(provider_id):
    try:
        credential = _read(get_sidekick_home()).get(provider_id)
        valid = isinstance(credential, dict) and not credential.get("refresh_in_flight") and all(
            isinstance(credential.get(key), str) and credential[key] for key in ("access_token", "refresh_token", "org_id"))
        if valid:
            try:
                _supported_models(credential, provider_id)
            except DeviceError:
                return {"logged_in": False, "error_code": "unsupported_workspace_gateway"}
        return {"logged_in": bool(valid), **({} if valid else {"error_code": "device_login_required"})}
    except DeviceError:
        return {"logged_in": False, "error_code": "device_login_required"}


def start_login(provider_id):
    if provider_id not in _PROVIDERS:
        return {"ok": False, "error_code": "unsupported_provider"}
    try:
        payload = _request("/console/auth/device/code", data={"client_id": _CLIENT, "supports_org_scope": "true"})
        url = urllib.parse.urljoin(_BASE, payload["verification_uri_complete"])
        parsed = urllib.parse.urlsplit(url)
        query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
        valid_query = (len(query) in (1, 2) and len(dict(query)) == len(query)
                       and dict(query).get("user_code") == payload.get("user_code")
                       and all(key in {"user_code", "client_id"} for key, _ in query)
                       and ("client_id" not in dict(query) or dict(query)["client_id"] == _CLIENT))
        if parsed.scheme != "https" or parsed.netloc != "opencode.ai" or parsed.path != "/console/device" or parsed.fragment or not valid_query:
            raise DeviceError("invalid_verification_url")
        expiry = min(max(int(payload["expires_in"]), 1), 3600)
        interval = min(max(int(payload.get("interval", 5)), 1), 60)
        if not all(isinstance(payload.get(key), str) and payload[key] for key in ("device_code", "user_code")):
            raise DeviceError("invalid_device_response")
        login_id = uuid.uuid4().hex
        with _LOCK:
            _PENDING[login_id] = {"home": str(get_sidekick_home().resolve()), "provider": provider_id,
                "device_code": payload["device_code"], "expires": time.monotonic() + expiry,
                "next_poll": time.monotonic() + interval, "interval": interval, "status": "running"}
        return {"ok": True, "login_id": login_id, "provider": provider_id, "status": "running",
                "verification_url": url, "user_code": payload["user_code"], "expires_in": expiry, "interval": interval}
    except (DeviceError, KeyError, ValueError, TypeError) as error:
        return {"ok": False, "error_code": str(error) if isinstance(error, DeviceError) else "invalid_device_response"}


def _token_record(payload):
    if not all(isinstance(payload.get(key), str) and payload[key] for key in ("access_token", "refresh_token", "org_id")):
        raise DeviceError("invalid_token_response")
    try:
        expiry = int(payload["expires_in"])
        if expiry <= 0:
            raise ValueError()
    except (ValueError, KeyError, TypeError):
        raise DeviceError("invalid_token_response") from None
    return {key: payload[key] for key in ("access_token", "refresh_token", "org_id")} | {"expires_at": time.time() + expiry}


def login_status(login_id):
    with _LOCK:
        login = _PENDING.get(login_id)
        if not login or login["home"] != str(get_sidekick_home().resolve()):
            return {"ok": False, "error_code": "login_not_found"}
        if login["status"] == "running" and time.monotonic() >= login["expires"]:
            login["status"] = "expired"
        should_poll = login["status"] == "running" and not login.get("polling") and time.monotonic() >= login["next_poll"]
        if should_poll:
            login["next_poll"] = time.monotonic() + login["interval"]
            login["polling"] = True
            device_code = login["device_code"]
    if should_poll:
        try:
            payload = _request("/console/auth/device/token", data={"client_id": _CLIENT,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code", "device_code": device_code})
            credential = _token_record(payload)
            config = _request("/console/api/v2/config", token=credential["access_token"])
            credential["config"] = config
            with _LOCK:
                if login["status"] != "running":
                    return _public_status(login)
                if time.monotonic() >= login["expires"]:
                    login["status"] = "expired"
                    login.pop("device_code", None)
                    return _public_status(login)
                with _credential_lock(login["home"]):
                    records = _read(login["home"])
                    records[login["provider"]] = credential
                    _write(login["home"], records)
                # Keep a successful OAuth grant even if a newly returned SDK
                # config is not yet supported. It remains unavailable for chat
                # until validated; fixing config support need not reauthorize.
                _supported_models(credential, login["provider"])
                login["status"] = "connected"
        except DeviceError as error:
            with _LOCK:
                if login["status"] != "running":
                    return _public_status(login)
                if str(error) == "slow_down":
                    login["interval"] += 5
                    login["next_poll"] = time.monotonic() + login["interval"]
                elif str(error) != "authorization_pending":
                    login["status"] = "expired" if str(error) == "expired_token" else "failed"
                    login["error_code"] = str(error)
                    if "credential" in locals() and "config" in credential:
                        login["diagnostic"] = _config_diagnostic(credential["config"], login["provider"])
        finally:
            with _LOCK:
                login["polling"] = False
    with _LOCK:
        if login["status"] != "running":
            login.pop("device_code", None)
        return _public_status(login)


def _public_status(login):
    return {"ok": True, "provider": login["provider"], "status": login["status"],
            "configured": login["status"] == "connected", **({"error_code": login["error_code"]} if "error_code" in login else {}),
            **({"diagnostic": login["diagnostic"]} if "diagnostic" in login else {})}


def _config_diagnostic(config, provider_id):
    """Only schema field names and known public package/route names, no values."""
    try:
        entry = _select_provider(config, provider_id)
    except DeviceError:
        return {"provider_match": False}
    fields = {"package", "npm", "settings", "options", "headers", "models", "canonical", "api", "modelID", "disabled"}
    model_fields = set()
    packages = set()
    routes = set()
    for row in [entry, *entry["models"].values()]:
        if not isinstance(row, dict):
            continue
        model_fields.update(set(row) & fields)
        package = row.get("package", row.get("npm", ""))
        if isinstance(package, str) and package in {
            "@opencode/ai/providers/openai-compatible", "@opencode/ai/providers/openai/chat",
            "@opencode/ai/providers/openai", "@opencode/ai/providers/openai/responses",
            "@opencode/ai/providers/openai-compatible/responses", "@opencode/ai/providers/anthropic",
            "@opencode/ai/providers/anthropic-compatible", "@opencode/ai/providers/google",
            "aisdk:@ai-sdk/openai-compatible", "aisdk:@ai-sdk/openai", "aisdk:@ai-sdk/anthropic",
            "@ai-sdk/openai-compatible", "@ai-sdk/openai", "@ai-sdk/anthropic"}:
            packages.add(package)
        for name in ("settings", "options"):
            settings = row.get(name, {})
            if isinstance(settings, dict) and isinstance(settings.get("baseURL"), str):
                parsed = urllib.parse.urlsplit(settings["baseURL"])
                if parsed.netloc == "opencode.ai" and parsed.path in {"/inference/openai/v1", "/inference/anthropic/v1", "/inference/google/v1beta", "/inference/go/openai/v1", "/inference/go/anthropic/v1"}:
                    routes.add(parsed.path)
    return {"provider_match": True, "field_names": sorted(model_fields), "packages": sorted(packages), "gateway_paths": sorted(routes)}


def cancel_login(login_id):
    with _LOCK:
        login = _PENDING.get(login_id)
        if not login or login["home"] != str(get_sidekick_home().resolve()):
            return {"ok": False, "error_code": "login_not_found"}
        if login["status"] == "connected":
            return {"ok": True, "status": "connected"}
        login["status"] = "cancelled"
        login.pop("device_code", None)
        return {"ok": True, "status": "cancelled"}


def _provider_entries(config, provider_id):
    """Every configured workspace provider for this login, in preference order.

    OpenCode Go credentials can list the subscription catalog and the free
    catalog as sibling provider entries. The first entry stays preferred when
    a model id exists in both; models that exist only on a later entry remain
    selectable.
    """
    providers = config.get("providers", {})
    if not isinstance(providers, dict):
        raise DeviceError("invalid_workspace_config")
    entries = []
    for key in _PROVIDERS.get(provider_id, ()):
        entry = providers.get(key)
        if isinstance(entry, dict) and isinstance(entry.get("models"), dict) and entry["models"]:
            entries.append(entry)
    if not entries:
        raise DeviceError("workspace_provider_unavailable")
    return entries


def _select_provider(config, provider_id):
    return _provider_entries(config, provider_id)[0]


def _owning_provider_entry(config, provider_id, model):
    entries = _provider_entries(config, provider_id)
    if model is None:
        return entries[0], next(iter(entries[0]["models"]))
    for entry in entries:
        if model in entry["models"]:
            return entry, model
    matches = []
    for entry in entries:
        for key, row in entry["models"].items():
            if isinstance(row, dict) and row.get("modelID") == model:
                matches.append((entry, key))
    if len(matches) != 1:
        raise DeviceError("workspace_model_unavailable")
    return matches[0]


def _current_credentials(provider_id):
    home = get_sidekick_home().resolve()
    with _credential_lock(home):
        records = _read(home)
        credential = records.get(provider_id)
        if not isinstance(credential, dict):
            raise DeviceError("device_login_required")
        if credential.get("refresh_in_flight"):
            raise DeviceError("device_login_required")
        if float(credential.get("expires_at", 0)) <= time.time() + 60:
            # Persist the consumed-token boundary before network I/O. A crash
            # or uncertain transport failure must never reuse a single-use token.
            credential["refresh_in_flight"] = True
            _write(home, records)
            refreshed = _token_record(_request("/console/auth/device/token", data={"client_id": _CLIENT,
                "grant_type": "refresh_token", "refresh_token": credential["refresh_token"]}))
            if refreshed["org_id"] != credential["org_id"]:
                raise DeviceError("workspace_binding_changed")
            # Persist rotation before optional config lookup so config failure
            # cannot cause reuse of the old refresh token.
            refreshed["config"] = credential.get("config", {})
            records[provider_id] = refreshed
            _write(home, records)
            refreshed["config"] = _request("/console/api/v2/config", token=refreshed["access_token"])
            _select_provider(refreshed["config"], provider_id)
            _write(home, records)
            credential = refreshed
        return credential


def discovered_models(provider_id):
    credential = _current_credentials(provider_id)
    return _supported_models(credential, provider_id)


def _connection_cost_is_free(row):
    """True when the connection's own price list is present and entirely zero."""
    if not isinstance(row, dict):
        return False
    cost = row.get("cost")
    if not isinstance(cost, list) or not cost:
        return False
    priced = False

    def walk(node):
        nonlocal priced
        if isinstance(node, dict):
            return all(walk(value) for key, value in node.items() if key != "tier")
        if isinstance(node, list):
            return all(walk(item) for item in node) if node else False
        if isinstance(node, bool) or not isinstance(node, (int, float)):
            return False
        priced = True
        return node == 0

    return all(walk(item) for item in cost) and priced


def _entry_is_paid_go(key, entry):
    """The subscription catalog is the Go provider entry or the Go inference gateway."""
    if key in {"opencode-go", "go"}:
        return True
    settings = entry.get("settings") if isinstance(entry, dict) and isinstance(entry.get("settings"), dict) else {}
    base = settings.get("baseURL") if isinstance(settings, dict) else ""
    if not isinstance(base, str) or not base:
        return False
    return "/inference/go/" in urllib.parse.urlsplit(base).path


def _connection_model_row(model_id, row):
    if not isinstance(model_id, str) or not model_id or len(model_id) > 256 or any(ord(char) < 32 for char in model_id):
        return None
    if isinstance(row, dict) and row.get("disabled") is True:
        return None
    name = row.get("name") if isinstance(row, dict) else None
    label = name.strip() if isinstance(name, str) else ""
    if not label or len(label) > 256 or any(ord(char) < 32 for char in label):
        label = model_id
    item = {"id": model_id, "label": label}
    limit = row.get("limit") if isinstance(row, dict) else None
    context = limit.get("context") if isinstance(limit, dict) else None
    if type(context) is int and 1 <= context <= 16_000_000:
        item["context_length"] = context
        item["context_length_source"] = "provided_catalog"
    return item


def connection_picker_groups(provider_id="opencode-go"):
    """Split the stored connection into paid and free picker groups.

    Membership comes from the connection's provider entries and price list.
    This does not refresh tokens and does not return credentials.
    """
    if provider_id != "opencode-go":
        return []
    try:
        record = _read(get_sidekick_home()).get(provider_id)
        config = record.get("config") if isinstance(record, dict) else None
        providers = config.get("providers") if isinstance(config, dict) else None
        if not isinstance(providers, dict):
            return []
    except (DeviceError, OSError, ValueError, TypeError):
        return []
    paid, free = [], []
    seen_paid, seen_free = set(), set()
    for key in _PROVIDERS.get(provider_id, ()):
        entry = providers.get(key)
        if not isinstance(entry, dict) or not isinstance(entry.get("models"), dict) or not entry["models"]:
            continue
        paid_entry = _entry_is_paid_go(key, entry)
        for model_id, row in entry["models"].items():
            item = _connection_model_row(model_id, row)
            if item is None:
                continue
            if paid_entry:
                if item["id"] not in seen_paid:
                    paid.append(item)
                    seen_paid.add(item["id"])
            elif _connection_cost_is_free(row) and item["id"] not in seen_free:
                free.append(item)
                seen_free.add(item["id"])
    groups = []
    if paid:
        groups.append({"provider": "OpenCode Go", "provider_id": "opencode-go", "catalog_tier": "paid",
                       "catalog_source": "connection", "models": paid})
    if free:
        groups.append({"provider": "OpenCode Go Free", "provider_id": "opencode-go-free", "catalog_tier": "free",
                       "catalog_source": "connection", "models": free})
    return groups


def device_model_context_length(provider_id, model_id):
    """Public context window from the device catalog. No credentials are returned."""
    try:
        record = _read(get_sidekick_home()).get(provider_id)
        config = record.get("config") if isinstance(record, dict) else None
        if not isinstance(config, dict):
            return None
        entry, key = _owning_provider_entry(config, provider_id, model_id)
    except (DeviceError, OSError, ValueError, TypeError):
        return None
    row = entry["models"].get(key)
    limit = row.get("limit") if isinstance(row, dict) else None
    value = limit.get("context") if isinstance(limit, dict) else None
    if type(value) is int and 1 <= value <= 16_000_000:
        return value
    return None


def _supported_models(credential, provider_id):
    result = []
    errors = []
    seen = set()
    for entry in _provider_entries(credential["config"], provider_id):
        for model in entry["models"]:
            if model in seen:
                continue
            try:
                _validated_connection(credential, provider_id, model, None)
                result.append(model)
                seen.add(model)
            except DeviceError as error:
                errors.append(str(error))
                continue
    if not result:
        for reason in ("workspace_binding_changed", "unsupported_workspace_header", "invalid_workspace_config"):
            if reason in errors:
                raise DeviceError(reason)
        raise DeviceError("unsupported_workspace_gateway")
    return result


def resolve_connection(provider_id, model=None, session_id=None):
    credential = _current_credentials(provider_id)
    return _validated_connection(credential, provider_id, model, session_id)


def _validated_connection(credential, provider_id, model, session_id):
    entry, model = _owning_provider_entry(credential["config"], provider_id, model)
    models = []
    for candidate in _provider_entries(credential["config"], provider_id):
        for key in candidate["models"]:
            if key not in models:
                models.append(key)
    model_config = entry["models"][model] if isinstance(entry["models"][model], dict) else {}
    if model_config.get("disabled") is True:
        raise DeviceError("workspace_model_unavailable")
    for record in (entry, model_config):
        if not isinstance(record.get("settings", {}), dict) or not isinstance(record.get("headers", {}), dict):
            raise DeviceError("invalid_workspace_config")
    settings = {**entry.get("settings", {}), **model_config.get("settings", {})}
    package = model_config.get("package", model_config.get("npm", entry.get("package", entry.get("npm", ""))))
    modes = {"aisdk:@ai-sdk/openai-compatible": "chat_completions", "@ai-sdk/openai-compatible": "chat_completions",
             "aisdk:@ai-sdk/openai": "codex_responses", "@ai-sdk/openai": "codex_responses",
             "aisdk:@ai-sdk/anthropic": "anthropic_messages", "@ai-sdk/anthropic": "anthropic_messages",
             "@opencode/ai/providers/openai-compatible": "chat_completions",
             "@opencode/ai/providers/openai/chat": "chat_completions",
             "@opencode/ai/providers/openai": "codex_responses",
             "@opencode/ai/providers/openai/responses": "codex_responses",
             "@opencode/ai/providers/openai-compatible/responses": "codex_responses",
             "@opencode/ai/providers/anthropic": "anthropic_messages",
             "@opencode/ai/providers/anthropic-compatible": "anthropic_messages"}
    base = settings.get("baseURL", "")
    if not isinstance(base, str) or not isinstance(package, str):
        raise DeviceError("invalid_workspace_config")
    mode = modes.get(package)
    parsed = urllib.parse.urlsplit(base)
    family = "anthropic" if mode == "anthropic_messages" else "openai"
    allowed_paths = {f"/inference/{family}/v1"}
    if provider_id == "opencode-go":
        allowed_paths.add(f"/inference/go/{family}/v1")
    if not mode or parsed.scheme != "https" or parsed.netloc != "opencode.ai" or parsed.path.rstrip("/") not in allowed_paths or parsed.query or parsed.fragment:
        raise DeviceError("unsupported_workspace_gateway")
    supplied_headers = {**entry.get("headers", {}), **model_config.get("headers", {})}
    headers = {}
    for key, value in supplied_headers.items():
        if not isinstance(key, str) or not isinstance(value, str):
            raise DeviceError("invalid_workspace_config")
        if key.lower() in {"x-opencode-org-id", "x-org-id"}:
            if value != credential["org_id"]:
                raise DeviceError("workspace_binding_changed")
            headers[key] = value
        else:
            raise DeviceError("unsupported_workspace_header")
    headers["User-Agent"] = "LastBrowser/0.1.55"
    if session_id:
        headers["x-opencode-session"] = uuid.uuid5(uuid.NAMESPACE_URL, str(get_sidekick_home().resolve()) + ":" + str(session_id)).hex
    sdk_base = base.rstrip("/")
    if mode == "anthropic_messages":
        # Anthropic SDK appends /v1/messages; runtime capture must use the
        # same SDK base as its client so request authority remains exact.
        sdk_base = sdk_base[:-3]
    wire_model = model_config.get("modelID", model)
    if not isinstance(wire_model, str) or not wire_model or len(wire_model) > 256 or any(ord(char) < 32 for char in wire_model):
        raise DeviceError("invalid_workspace_config")
    return {"api_key": credential["access_token"], "base_url": sdk_base, "headers": headers,
            "models": list(models), "model": wire_model, "api_mode": mode}
