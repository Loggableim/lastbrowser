"""Explicit, profile-bound setup and a separate trusted human credential form.

The existing Codex PKCE adapter lives in a dedicated immutable worker while
the Assistant remains usable. Only redacted flow metadata is durable; a lost
worker interrupts the flow instead of replaying an OAuth side effect.
"""
from __future__ import annotations

import json
import hashlib
import ipaddress
import os
import queue
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal
from contextlib import contextmanager
from urllib.parse import urlparse

from pydantic import Field, SecretStr, ValidationError

from .contracts import Contract, Id, ProviderSelection, PermissionScope, Scope, Utc, canonical_json, new_id, utc_now
from .policy import PolicyDenied
from .runner import provider_configuration_digest
from .scope import ScopeError
from .store import ResourceBusy, RevisionConflict
from .worker_host import WorkerHost, WorkerError

_TERMINAL = {"connected", "settings_required", "unavailable", "cancelled", "expired", "interrupted", "failed"}
_SETUP_LOCK = threading.RLock()
_SETUP_OWNERS: dict[tuple[str, str], tuple[object, str]] = {}

# Actual native key-writer IDs. Discovery and all writes are revalidated in the
# bound child; this pure adapter inventory never imports parent provider globals.
_KEY_PROVIDERS = frozenset({"openrouter", "anthropic", "openai", "alibaba", "google", "gemini", "zai", "kimi-coding",
                           "deepseek", "minimax", "minimax-cn", "mistralai", "x-ai", "xiaomi", "opencode-zen",
                           "opencode-go", "ollama-cloud", "lmstudio", "nvidia", "morph"})


def human_configuration_fields(provider_id):
    if provider_id not in _KEY_PROVIDERS and provider_id != "ollama" and not provider_id.startswith("custom:"):
        return None
    fields = ["apiKey", "model"]
    if provider_id in {"ollama", "lmstudio", "alibaba"} or provider_id.startswith("custom:"):
        fields.append("baseUrl")
    return fields


class SetupStart(Contract):
    action: Literal["start"] = "start"
    connection_id: str = Field(min_length=1, max_length=512)
    client_request_id: Id


class SetupControl(Contract):
    action: Literal["poll", "cancel"]
    flow_id: Id


class SetupEvidence(Contract):
    source: Literal["capability_catalog", "profile_auth_store", "setup_worker"]
    configuration_status: Literal["configured", "not_configured", "unknown"] = "unknown"
    authentication_status: Literal["connected", "not_connected", "pending", "unknown"] = "unknown"
    health_status: Literal["not_checked"] = "not_checked"
    observed_at: Utc


class SetupFlow(Contract):
    schema_version: Literal[1] = 1
    scope: Scope
    flow_id: Id
    connection_id: str
    provider_id: str | None = None
    setup_status: Literal["starting", "awaiting_user", "connected", "settings_required", "unavailable", "cancelled", "expired", "interrupted", "failed"]
    revision: int = Field(default=1, ge=1)
    created_at: Utc
    updated_at: Utc
    expires_at: Utc
    evidence: SetupEvidence
    reason_code: str | None = None
    next_step: dict | None = None


def _serialized(flow: SetupFlow):
    return flow.model_dump(mode="json", by_alias=True, exclude_none=True)


def _durable(flow):
    value = _serialized(flow)
    if value.get("nextStep"):
        value["nextStep"] = {key: item for key, item in value["nextStep"].items() if key != "authorizationUrl"}
    return value


def _authorization_url(value):
    if not isinstance(value, str) or len(value) > 8192 or any(ord(char) < 32 for char in value):
        raise PolicyDenied("invalid_setup_authorization_url")
    parsed = urlparse(value)
    if parsed.scheme != "https" or parsed.hostname != "auth.openai.com" or parsed.port not in {None, 443} or parsed.path != "/oauth/authorize" or parsed.username or parsed.password or parsed.fragment:
        raise PolicyDenied("invalid_setup_authorization_url")
    return value


def _local_provider_auth_present(home):
    """Evidence from the exact bound file, never the legacy global fallback."""
    root = Path(home).resolve(strict=True)
    path = root / "auth.json"
    if not path.is_file() or not path.resolve(strict=True).is_relative_to(root) or path.stat().st_size > 4 * 1024 * 1024:
        return False
    auth = json.loads(path.read_text("utf-8"))
    entries = (auth.get("credential_pool") or {}).get("openai-codex") or []
    return any(isinstance(entry, dict) and entry.get("access_token") for entry in entries)


class _LiveFlow:
    def __init__(self, flow, context, handle):
        self.flow, self.context, self.handle = flow, context, handle
        self.lock = threading.RLock()
        self.changed = threading.Event()
        self.thread = None
        self.cleanup_lock = threading.Lock()

    def terminate(self):
        with self.cleanup_lock:
            self.handle.terminate(grace_seconds=0.5, hard_seconds=2)


class ConnectionSetupService:
    def __init__(self, manager, *, catalog_provider=None, worker_factory=None):
        self.manager, self.store, self.resolver = manager, manager.store, manager.resolver
        self.worker_factory = worker_factory or manager.worker_factory
        self.catalog_provider = catalog_provider
        self._lock = threading.RLock()
        self._live: dict[str, _LiveFlow] = {}
        self._closed = False

    def _catalog(self, scope):
        if self.catalog_provider is not None:
            return self.catalog_provider(scope)
        from .capabilities import CapabilityService
        return CapabilityService(self.manager).catalog(scope, refresh=True)

    def _write(self, flow):
        payload = {"flowId": flow.flow_id}
        with self.store.transaction():
            existing = self.store.get_request_result(flow.scope, "connection_setup_flow", flow.flow_id, payload)
            if existing is None:
                self.store._remember(flow.scope, "connection_setup_flow", flow.flow_id, payload, _durable(flow))
            else:
                if existing.get("revision") != flow.revision - 1:
                    raise RevisionConflict("Connection setup state changed")
                self.store._conn.execute("UPDATE ia_request_results SET result_json=? WHERE scope_key=? AND operation='connection_setup_flow' AND request_id=?",
                                         (canonical_json(_durable(flow)), flow.scope.key, flow.flow_id))
            self.store.append_event(flow.scope, "connection_setup_changed", {"flowId": flow.flow_id, "connectionId": flow.connection_id,
                                                                            "setupStatus": flow.setup_status, "revision": flow.revision})

    def _load(self, scope, flow_id):
        self.resolver.resolve(scope)
        value = self.store.get_request_result(scope, "connection_setup_flow", flow_id, {"flowId": flow_id})
        if value is None:
            raise ScopeError("Setup flow does not belong to this Space")
        flow = SetupFlow.model_validate(value)
        if flow.scope != scope:
            raise ScopeError("Setup flow does not belong to this Space")
        return flow

    def start(self, scope: Scope, request: SetupStart):
        self.resolver.resolve(scope)
        payload = request.model_dump(mode="json", by_alias=True)
        with self._lock:
            if self._closed:
                raise PolicyDenied("connection_setup_closed")
            cached = self.store.get_request_result(scope, "connection_setup_start", request.client_request_id, payload)
            if cached is not None:
                return self.poll(scope, cached["flowId"])
            catalog = self._catalog(scope)
            if Scope.model_validate(catalog["scope"]) != scope:
                raise ScopeError("Setup catalog belongs to another Space")
            candidates = [(entry, connection) for entry in catalog["entries"] for connection in entry.get("connections", [])
                          if connection.get("connectionId") == request.connection_id]
            if not candidates:
                raise ScopeError("Connection is not present in this profile catalog")
            entry, connection = candidates[0]
            provider = request.connection_id.removeprefix("provider:") if request.connection_id.startswith("provider:") else None
            created = utc_now()
            flow = SetupFlow(scope=scope, flow_id=new_id(), connection_id=request.connection_id, provider_id=provider,
                             setup_status="starting", created_at=created, updated_at=created,
                             expires_at=(datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat().replace("+00:00", "Z"),
                             evidence=SetupEvidence(source="capability_catalog", observed_at=created,
                                                    configuration_status="configured" if connection.get("status") in {"configured", "connected"} else "not_configured"))
            if provider in {"google-gemini-cli", "antigravity"}:
                flow = flow.model_copy(update={"setup_status": "unavailable", "reason_code": "unsupported_third_party_oauth"})
            elif provider != "openai-codex":
                fields = human_configuration_fields(provider) if provider else None
                if fields is None:
                    flow = flow.model_copy(update={"setup_status": "unavailable", "reason_code": "scoped_adapter_unavailable"})
                else:
                    if type(connection.get("revision")) is not int or connection["revision"] < 1:
                        raise PolicyDenied("connection_revision_missing")
                    flow = flow.model_copy(update={"setup_status": "settings_required", "reason_code": "human_configuration_required",
                        "next_step": {"kind": "human_form", "backendProfileId": scope.backend_profile_id,
                                      "connectionId": request.connection_id, "providerId": provider,
                                      "expectedConnectionRevision": connection.get("revision"), "fields": fields}})
            else:
                resolved = self.resolver.resolve(scope)
                digest = provider_configuration_digest(resolved.profile_home)
                selection = ProviderSelection(provider_config_ref=digest, model="__connection_setup__", provider=provider)
                context = self.manager.make_context(scope, selection, permissions=PermissionScope(allowed_effects=()), interactive=True)
                self.resolver.validate_context(context)
                owner = (scope.backend_profile_id, provider)
                with _SETUP_LOCK:
                    if owner in _SETUP_OWNERS or len(_SETUP_OWNERS) >= 4:
                        raise ResourceBusy("A connection setup flow already owns this provider profile")
                    _SETUP_OWNERS[owner] = (self, flow.flow_id)
                try:
                    handle = self.worker_factory(context).start(payload={"mode": "connection_setup", "flowId": flow.flow_id,
                                                                          "providerId": provider, "providerConfigurationDigest": digest})
                except BaseException:
                    with _SETUP_LOCK:
                        _SETUP_OWNERS.pop(owner, None)
                    raise
                live = _LiveFlow(flow, context, handle)
                self._live[flow.flow_id] = live
            try:
                with self.store.transaction():
                    self._write(flow)
                    self.store._remember(scope, "connection_setup_start", request.client_request_id, payload, {"flowId": flow.flow_id})
            except BaseException:
                if flow.flow_id in self._live:
                    self._live.pop(flow.flow_id).handle.terminate(grace_seconds=0, hard_seconds=2)
                    with _SETUP_LOCK:
                        _SETUP_OWNERS.pop((scope.backend_profile_id, provider), None)
                raise
            if flow.setup_status == "starting":
                live.thread = threading.Thread(target=self._watch, args=(live,), name="ScopedConnectionSetup", daemon=True)
                live.thread.start()
            return _serialized(flow)

    def _transition(self, live, **changes):
        with live.lock:
            if live.flow.setup_status in _TERMINAL:
                return
            updated = live.flow.model_copy(update={**changes, "revision": live.flow.revision + 1, "updated_at": utc_now()})
            self._write(updated)
            live.flow = updated
            live.changed.set()

    def _watch(self, live):
        try:
            while live.flow.setup_status not in _TERMINAL:
                self.resolver.validate_context(live.context)
                if datetime.now(timezone.utc) >= datetime.fromisoformat(live.flow.expires_at.replace("Z", "+00:00")):
                    self._transition(live, setup_status="expired", reason_code="connection_setup_expired", next_step=None)
                    break
                event = live.handle.read_event(timeout=0.2)
                if not event:
                    if not live.handle.is_alive:
                        self._transition(live, setup_status="interrupted", reason_code="connection_setup_worker_lost", next_step=None)
                    continue
                if event.get("kind") == "setup_state":
                    if event.get("runId") != live.context.run_id or event.get("flowId") != live.flow.flow_id or Scope.model_validate(event.get("scope")) != live.flow.scope:
                        raise PolicyDenied("connection_setup_worker_scope_mismatch")
                    state = event.get("state") or {}
                    if state.get("setupStatus") not in {"awaiting_user", "connected", "cancelled", "expired", "failed"}:
                        raise PolicyDenied("invalid_connection_setup_state")
                    evidence = SetupEvidence.model_validate(state["evidence"])
                    if state["setupStatus"] == "connected" and (evidence.source != "profile_auth_store" or evidence.authentication_status != "connected"):
                        raise PolicyDenied("connection_setup_evidence_missing")
                    if state["setupStatus"] == "connected" and not _local_provider_auth_present(live.context.resolved_profile_home):
                        raise PolicyDenied("connection_setup_evidence_missing")
                    next_step = {"kind": "oauth", "authorizationUrl": _authorization_url(state["authorizationUrl"]), "requiresUserNavigation": True} if state.get("authorizationUrl") else None
                    self._transition(live, setup_status=state["setupStatus"], evidence=evidence, next_step=next_step,
                                     reason_code=state.get("reasonCode"))
                elif event.get("kind") in {"error", "eof"}:
                    self._transition(live, setup_status="interrupted", reason_code="connection_setup_worker_lost", next_step=None)
        except Exception:
            try:
                self._transition(live, setup_status="interrupted", reason_code="connection_setup_scope_or_worker_changed", next_step=None)
            except Exception:
                pass  # A newer durable transition wins; still close this worker.
        finally:
            live.terminate()
            with _SETUP_LOCK:
                if _SETUP_OWNERS.get((live.flow.scope.backend_profile_id, live.flow.provider_id)) == (self, live.flow.flow_id):
                    _SETUP_OWNERS.pop((live.flow.scope.backend_profile_id, live.flow.provider_id), None)
            with self._lock:
                self._live.pop(live.flow.flow_id, None)
            live.changed.set()

    def poll(self, scope: Scope, flow_id: str):
        with self._lock:
            flow = self._load(scope, flow_id)
            live = self._live.get(flow_id)
            if live:
                with live.lock:
                    return _serialized(flow if flow.revision > live.flow.revision else live.flow)
            if flow.setup_status not in _TERMINAL:
                flow = flow.model_copy(update={"setup_status": "interrupted", "reason_code": "connection_setup_restart",
                                               "revision": flow.revision + 1, "updated_at": utc_now(), "next_step": None})
                self._write(flow)
            return _serialized(flow)

    def cancel(self, scope: Scope, flow_id: str):
        current = self.poll(scope, flow_id)
        if current["setupStatus"] in _TERMINAL:
            return current
        with self._lock:
            live = self._live.get(flow_id)
        if live:
            try:
                live.handle.cancel()
            except WorkerError:
                self._transition(live, setup_status="interrupted", reason_code="connection_setup_worker_lost", next_step=None)
            # The child's existing OAuth lock decides cancel-vs-persist. A late
            # cancel preserves a committed connected state, never deletes creds.
            deadline = time.monotonic() + 2.5
            while time.monotonic() < deadline:
                live.changed.wait(0.1)
                live.changed.clear()
                with live.lock:
                    if live.flow.setup_status in _TERMINAL:
                        break
            if live.flow.setup_status not in _TERMINAL:
                self._transition(live, setup_status="interrupted", reason_code="connection_setup_cancel_unconfirmed", next_step=None)
            live.terminate()
            if live.thread:
                live.thread.join(timeout=2)
        return self.poll(scope, flow_id)

    def close(self):
        with self._lock:
            self._closed = True
            live = list(self._live.values())
        for item in live:
            try:
                self.cancel(item.flow.scope, item.flow.flow_id)
            except Exception:
                # Scope deletion/revocation must not prevent closing the exact
                # already-owned worker and its callback socket.
                item.terminate()
                if item.thread:
                    item.thread.join(timeout=3)


def get_connection_setup_service(manager):
    with _SETUP_LOCK:
        service = getattr(manager, "_connection_setup_service", None)
        if service is None:
            service = ConnectionSetupService(manager)
            manager._connection_setup_service = service
        return service


def close_connection_setup(manager):
    service = getattr(manager, "_connection_setup_service", None)
    if service is not None:
        service.close()


def handle_connection_setup(store, resolver, manager, scope, payload):
    if manager.store is not store or manager.resolver is not resolver:
        raise ScopeError("Setup manager belongs to another profile")
    service = get_connection_setup_service(manager)
    if payload.get("action") == "start":
        return service.start(scope, SetupStart.model_validate(payload))
    request = SetupControl.model_validate(payload)
    return service.poll(scope, request.flow_id) if request.action == "poll" else service.cancel(scope, request.flow_id)


def run_connection_setup(context, payload, channel):
    """Called only after runner.bind_worker_context; no parent global switches."""
    if payload.get("providerId") != "openai-codex" or provider_configuration_digest(Path(context.resolved_profile_home)) != payload.get("providerConfigurationDigest"):
        raise PolicyDenied("invalid_connection_setup_bootstrap")
    from web.api import oauth
    if Path(oauth._get_active_profile_home()).resolve() != Path(context.resolved_profile_home).resolve():
        raise PolicyDenied("connection_setup_home_mismatch")
    commands = queue.Queue(maxsize=8)
    def read_commands():
        try:
            while line := channel.input.readline(1048577):
                if len(line.encode("utf-8")) > 1048576:
                    break
                command = json.loads(line)
                if command.get("kind") in {"cancel", "shutdown"} or command.get("kind") == "control" and command.get("command") == "cancel":
                    commands.put("cancel", timeout=0.1)
                    return
        except Exception:
            pass
        try:
            commands.put("cancel", timeout=0.1)
        except queue.Full:
            pass
    reader = threading.Thread(target=read_commands, name="ScopedOAuthControl", daemon=True)
    reader.start()
    result = oauth.start_onboarding_oauth_flow({"provider": "openai-codex"})
    internal_id = result["flow_id"]
    with oauth._OAUTH_FLOWS_LOCK:
        original = dict(oauth._OAUTH_FLOWS[internal_id])
    last_status = None
    try:
        while True:
            if not commands.empty():
                result = oauth.cancel_onboarding_oauth_flow({"flow_id": internal_id, "provider": "openai-codex"})
            else:
                result = oauth.poll_onboarding_oauth_flow(internal_id)
            status = result["status"]
            mapped = {"pending": "awaiting_user", "success": "connected", "cancelled": "cancelled", "expired": "expired", "error": "failed"}.get(status, "failed")
            evidence = SetupEvidence(source="setup_worker", observed_at=utc_now(), authentication_status="pending" if status == "pending" else "not_connected")
            if status == "success":
                if not _local_provider_auth_present(context.resolved_profile_home):
                    mapped = "failed"
                else:
                    evidence = SetupEvidence(source="profile_auth_store", observed_at=utc_now(), configuration_status="configured", authentication_status="connected")
            if mapped != last_status:
                state = {"setupStatus": mapped, "evidence": evidence.model_dump(mode="json", by_alias=True)}
                if mapped == "awaiting_user":
                    state["authorizationUrl"] = _authorization_url(result.get("auth_url") or original.get("auth_url"))
                if mapped == "failed":
                    state["reasonCode"] = "provider_oauth_failed"
                channel.emit({"kind": "setup_state", "runId": context.run_id, "flowId": payload["flowId"],
                              "scope": context.scope.model_dump(mode="json", by_alias=True), "state": state})
                last_status = mapped
            if mapped in _TERMINAL:
                return {"setupStatus": mapped}
            time.sleep(0.1)
    finally:
        oauth.cancel_onboarding_oauth_flow({"flow_id": internal_id, "provider": "openai-codex"})
        # Cancellation drops module references, so retain the exact own server
        # and thread captured before cancellation for bounded cleanup.
        server = original.get("callback_server")
        if server:
            server.shutdown(); server.server_close()
        thread = original.get("callback_thread")
        if thread and thread is not threading.current_thread():
            thread.join(timeout=2)


class HumanConfiguration(Contract):
    api_key: SecretStr | None = None
    base_url: str | None = Field(default=None, min_length=1, max_length=2048)
    model: str | None = Field(default=None, min_length=1, max_length=512)


class HumanConfigure(Contract):
    connection_id: str = Field(min_length=1, max_length=512)
    expected_connection_revision: int = Field(ge=1, le=9007199254740991)
    client_request_id: Id
    configuration: HumanConfiguration


class ConfigurationAck(Contract):
    schema_version: Literal[1] = 1
    scope: Scope
    connection_id: str
    provider_id: str
    applied: Literal[True] = True
    connection_revision: int = Field(ge=1, le=9007199254740991)
    configuration_status: Literal["configured", "not_configured"]
    authentication_status: Literal["credential_present", "unknown"]
    health_status: Literal["not_checked"] = "not_checked"


def _human_request(payload, scope):
    try:
        request = HumanConfigure.model_validate(payload)
    except ValidationError:
        raise PolicyDenied("invalid_human_connection_configuration") from None
    configuration = request.configuration.model_dump(mode="python", by_alias=True, exclude_none=True)
    if request.configuration.api_key is not None:
        key = request.configuration.api_key.get_secret_value()
        if key != key.strip() or not 8 <= len(key) <= 8192 or any(ord(char) < 32 for char in key):
            raise PolicyDenied("invalid_human_connection_configuration")
        configuration["apiKey"] = key
    if not configuration or not request.connection_id.startswith("provider:") or request.connection_id != request.connection_id.strip():
        raise PolicyDenied("invalid_human_connection_configuration")
    if request.configuration.model is not None and (request.configuration.model != request.configuration.model.strip() or any(ord(char) < 32 for char in request.configuration.model)):
        raise PolicyDenied("invalid_human_connection_configuration")
    if request.configuration.base_url is not None:
        value = request.configuration.base_url
        try:
            parsed = urlparse(value)
            port = parsed.port
            try:
                local = ipaddress.ip_address(parsed.hostname or "").is_loopback
            except ValueError:
                local = parsed.hostname == "localhost"
            if value != value.strip() or any(ord(char) < 32 for char in value) or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.scheme not in {"http", "https"} or parsed.scheme == "http" and not local or port is not None and not 1 <= port <= 65535:
                raise ValueError()
        except ValueError:
            raise PolicyDenied("invalid_provider_endpoint") from None
    public_request = {"connectionId": request.connection_id, "expectedConnectionRevision": request.expected_connection_revision,
                      "clientRequestId": request.client_request_id}
    digest = hashlib.sha256(canonical_json({**public_request, "scope": scope.model_dump(mode="json", by_alias=True), "configuration": configuration}).encode()).hexdigest()
    return request, configuration, {**public_request, "requestDigest": digest}


def handle_connection_configure(store, resolver, manager, scope, payload):
    """Dedicated trusted HUMAN form route; never an Assistant/model tool."""
    if manager.store is not store or manager.resolver is not resolver:
        raise ScopeError("Configuration manager belongs to another profile")
    request, configuration, redacted = _human_request(payload, scope)
    resolved = resolver.resolve(scope)
    existing = store.get_request_result(scope, "connection_configure", request.client_request_id, redacted)
    if existing is not None:
        return existing
    selection = ProviderSelection(provider_config_ref=provider_configuration_digest(resolved.profile_home),
                                  model="__connection_configure__", provider=request.connection_id.removeprefix("provider:"))
    context = manager.make_context(scope, selection, permissions=PermissionScope(allowed_effects=()), connection_bindings=(), interactive=True)
    # The existing shared two-slot admission owns this short file operation.
    # New secret material travels only over the private worker stdin pipe.
    result = manager.run_interactive(context, {"mode": "connection_configure", **redacted, "configuration": configuration})
    resolver.validate_context(context)
    try:
        ack = ConfigurationAck.model_validate(result)
    except ValidationError:
        raise PolicyDenied("invalid_connection_configuration_response") from None
    if ack.connection_id != request.connection_id or ack.scope != scope or ack.provider_id != request.connection_id.removeprefix("provider:"):
        raise PolicyDenied("invalid_connection_configuration_response")
    return store.record_request_result(scope, "connection_configure", request.client_request_id, redacted, ack.model_dump(mode="json", by_alias=True))


@contextmanager
def _profile_configuration_lock(home):
    """Serialize native setup writes across different Space worker processes."""
    path = home / ".independent-connection.lock"
    if not path.resolve().is_relative_to(home):
        raise PolicyDenied("provider_configuration_escape_profile")
    fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        if os.fstat(fd).st_size == 0:
            os.write(fd, b"0")
        deadline = time.monotonic() + 5
        while True:
            try:
                if os.name == "nt":
                    import msvcrt
                    os.lseek(fd, 0, os.SEEK_SET); msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise PolicyDenied("provider_configuration_busy")
                time.sleep(0.05)
        yield
    finally:
        try:
            if os.name == "nt":
                import msvcrt
                os.lseek(fd, 0, os.SEEK_SET); msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(fd, fcntl.LOCK_UN)
        except OSError:
            pass
        os.close(fd)


def _atomic_json(path, value):
    temporary = path.with_name(path.name + "." + new_id() + ".tmp")
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            output.write(canonical_json(value)); output.flush(); os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def run_connection_configure(context, payload):
    """Existing config/key writers are confined to this one bound child."""
    from web.api import config as cfg, providers
    from .capabilities import evidence_digest, _revision
    home = Path(context.resolved_profile_home).resolve(strict=True)
    if os.getenv("LASTBROWSER_INDEPENDENT_WORKER") != "1" or os.getenv("SIDEKICK_HOME") != context.resolved_profile_home:
        raise PolicyDenied("configuration_requires_bound_worker")
    request, fields, redacted = _human_request({key: payload[key] for key in ("connectionId", "expectedConnectionRevision", "clientRequestId", "configuration")}, context.scope)
    if redacted["requestDigest"] != payload.get("requestDigest"):
        raise PolicyDenied("configuration_request_digest_mismatch")
    pid = request.connection_id.removeprefix("provider:")
    config_path = cfg._get_config_path()
    journal_path = home / "independent-connection-configure.json"
    if config_path.resolve() != home / "config.yaml":
        raise PolicyDenied("provider_configuration_escape_profile")
    for path in (config_path, home / ".env", journal_path):
        if not path.resolve().is_relative_to(home):
            raise PolicyDenied("provider_configuration_escape_profile")
    with _profile_configuration_lock(home):
        journal = json.loads(journal_path.read_text("utf-8")) if journal_path.is_file() else {"schemaVersion": 1, "requests": {}}
        previous = journal["requests"].get(request.client_request_id)
        if previous:
            if previous.get("requestDigest") != redacted["requestDigest"]:
                raise PolicyDenied("connection_configuration_request_id_reused")
            if previous.get("phase") == "applied":
                ack = ConfigurationAck.model_validate(previous["response"])
                if ack.scope != context.scope or ack.connection_id != request.connection_id:
                    raise PolicyDenied("invalid_connection_configuration_response")
                return ack.model_dump(mode="json", by_alias=True)
            raise PolicyDenied("connection_configuration_commit_uncertain")
        if _revision(evidence_digest(home), request.connection_id) != request.expected_connection_revision:
            raise PolicyDenied("connection_revision_changed")
        config = cfg._load_yaml_config_file(config_path)
        custom = [row for row in config.get("custom_providers", []) if isinstance(row, dict)
                  and providers._custom_provider_slug_from_name(row.get("name")) == pid]
        local = pid in {"ollama", "lmstudio"}
        if providers._provider_is_oauth(pid) or pid not in providers._PROVIDER_ENV_VAR and not local and len(custom) != 1:
            raise PolicyDenied("scoped_provider_configuration_unavailable")
        if "baseUrl" in fields and not local and not custom and pid != "alibaba":
            raise PolicyDenied("provider_endpoint_override_not_supported")
        if not isinstance(config.get("providers", {}), dict) or not isinstance(config.get("model", {}), dict) or not isinstance(config.get("providers", {}).get(pid, {}), dict):
            raise PolicyDenied("invalid_provider_configuration")
        if "baseUrl" in fields and pid == "alibaba":
            endpoint = urlparse(fields["baseUrl"])
            if endpoint.scheme != "https" or endpoint.port not in {None, 443} or not (endpoint.hostname == "dashscope-intl.aliyuncs.com" or (endpoint.hostname or "").endswith(".maas.aliyuncs.com")) or endpoint.path.rstrip("/") != "/compatible-mode/v1":
                raise PolicyDenied("invalid_provider_endpoint")
        # Prepare before any credential write: a killed partial transaction is
        # reported uncertain rather than automatically repeating a side effect.
        record = {"requestDigest": redacted["requestDigest"], "phase": "prepared"}
        journal["requests"][request.client_request_id] = record
        while len(journal["requests"]) > 64:
            del journal["requests"][next(iter(journal["requests"]))]
        _atomic_json(journal_path, journal)
        if custom:
            target = custom[0]
            for source, destination in (("apiKey", "api_key"), ("baseUrl", "base_url"), ("model", "model")):
                if source in fields:
                    target[destination] = fields[source]
        else:
            if "apiKey" in fields or pid == "alibaba" and "baseUrl" in fields:
                answer = providers.set_provider_key(pid, fields.get("apiKey"), fields.get("baseUrl") if pid == "alibaba" else None)
                if not answer.get("ok"):
                    raise PolicyDenied("provider_configuration_write_failed")
                config = cfg._load_yaml_config_file(config_path)
            provider_config = config.setdefault("providers", {}).setdefault(pid, {})
            if "model" in fields:
                provider_config["models"] = [fields["model"]]
            if "baseUrl" in fields:
                provider_config["base_url"] = fields["baseUrl"]
            # The actual bare local runtime consumes model.base_url, while
            # named custom providers own their own entry above. This explicit
            # local setup selects the default in this bound Backend Home only.
            if local:
                model_config = config.setdefault("model", {})
                model_config["provider"] = pid
                if "baseUrl" in fields:
                    model_config["base_url"] = fields["baseUrl"]
                if "model" in fields:
                    model_config["default"] = fields["model"]
            elif "model" in fields and not (config.get("model") or {}).get("default"):
                config.setdefault("model", {}).update({"provider": pid, "default": fields["model"]})
        # Reuse the native YAML serialization but publish by atomic rename;
        # the legacy helper itself writes in place and can expose truncation.
        temporary = config_path.with_name(config_path.name + "." + new_id() + ".tmp")
        try:
            fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600); os.close(fd)
            cfg._save_yaml_config_file(temporary, config)
            os.replace(temporary, config_path)
        finally:
            temporary.unlink(missing_ok=True)
        cfg.reload_config(); cfg.invalidate_models_cache()
        configured = bool(providers._provider_has_key(pid) or local and (config.get("model") or {}).get("base_url")
                          or custom and custom[0].get("base_url"))
        response = {"schemaVersion": 1, "scope": context.scope.model_dump(mode="json", by_alias=True), "connectionId": request.connection_id,
                    "providerId": pid, "applied": True, "connectionRevision": _revision(evidence_digest(home), request.connection_id),
                    "configurationStatus": "configured" if configured else "not_configured", "authenticationStatus": "credential_present" if providers._provider_has_key(pid) else "unknown",
                    "healthStatus": "not_checked"}
        record.update({"phase": "applied", "response": response})
        _atomic_json(journal_path, journal)
        return response
