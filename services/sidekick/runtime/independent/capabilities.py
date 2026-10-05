"""Profile-bound capability evidence; configuration is not a health claim."""
from __future__ import annotations

import hashlib
import base64
import json
import os
import time
from pathlib import Path
from typing import Any

from .contracts import ConnectionBinding, RunContext, Scope, canonical_json, utc_now
from .policy import PolicyDenied
from .runner import provider_configuration_digest


def _text(value, limit=256):
    return value if isinstance(value, str) and 0 < len(value) <= limit and not any(ord(c) < 32 for c in value) else ""


def evidence_digest(home: Path) -> str:
    """Private fingerprint of local credential/config state, never raw output."""
    digest = hashlib.sha256(provider_configuration_digest(home).encode())
    for relative in ("auth.json", "auth/google_oauth.json", ".claude/.credentials.json"):
        path = home / relative
        if not path.resolve().is_relative_to(home.resolve()):
            raise PolicyDenied("capability_credentials_escape_profile")
        digest.update(relative.encode())
        if path.is_file():
            if path.stat().st_size > 8 * 1024 * 1024:
                raise PolicyDenied("capability_credentials_too_large")
            try:
                value = json.loads(path.read_text("utf-8"))
            except (ValueError, UnicodeError) as exc:
                raise PolicyDenied("capability_credentials_invalid") from exc
            digest.update(canonical_json(_stable_auth_identity(value)).encode())
        else:
            digest.update(b"<missing>")
    return digest.hexdigest()


def _token_identity(token):
    if not isinstance(token, str) or len(token) > 32768 or len(token.split(".")) != 3:
        return None
    try:
        encoded = token.split(".")[1]
        payload = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
        identity = {key: payload[key] for key in ("sub", "aud", "https://api.openai.com/auth") if key in payload}
        return identity if identity.get("sub") else None
    except (ValueError, UnicodeError, TypeError):
        return None


def _stable_auth_identity(value):
    # This is a local account fingerprint, not JWT verification. SDK auth must
    # still succeed at the provider. Unknown opaque tokens stay hashed in full.
    if isinstance(value, list):
        return [_stable_auth_identity(row) for row in value]
    if not isinstance(value, dict):
        return value
    identities = {key: _token_identity(value.get(key)) for key in ("access_token", "id_token", "runtime_api_key")}
    result = {}
    for key, item in value.items():
        if key in {"last_refresh", "updated_at", "expires_at", "expires_in", "token_expiry", "last_used_at"}:
            continue
        if key == "refresh_token" and any(identities.values()):
            continue
        result[key] = identities.get(key) or _stable_auth_identity(item)
    return result


def public_inventory(context: RunContext, configuration: dict) -> dict[str, Any]:
    """Worker-only manifest/config discovery; never import or run plugins/MCP."""
    if os.getenv("LASTBROWSER_INDEPENDENT_WORKER") != "1" or os.getenv("SIDEKICK_HOME") != context.resolved_profile_home:
        raise PolicyDenied("capability_probe_requires_bound_worker")
    from cli.plugins import PluginManager, get_bundled_plugins_dir
    manager = PluginManager()
    home = Path(context.resolved_profile_home)
    manifests = manager._scan_directory(get_bundled_plugins_dir(), source="bundled", skip_names={"memory", "context_engine", "model-providers"})
    manifests.extend(manager._scan_directory(home / "plugins", source="user"))
    # No entry-point imports: a manifest is installation evidence, not permission
    # to execute its register() code during a read-only Space setup request.
    plugin_cfg = configuration.get("plugins") or {}
    enabled = set(plugin_cfg.get("enabled") or []) if isinstance(plugin_cfg, dict) else set()
    disabled = set(plugin_cfg.get("disabled") or []) if isinstance(plugin_cfg, dict) else set()
    unique = {manifest.key or manifest.name: manifest for manifest in manifests}
    plugins = []
    for key, manifest in sorted(unique.items()):
        if not _text(key) or not Path(manifest.path).resolve().is_relative_to((home / "plugins").resolve()) and manifest.source != "bundled":
            continue
        plugin = {"id": key, "name": _text(manifest.name) or key, "version": _text(manifest.version), "source": manifest.source, "installed": True, "enabled": key not in disabled and (key in enabled or manifest.source == "bundled" and manifest.kind in {"backend", "platform"}), "declaredTools": [_text(tool) for tool in manifest.provides_tools if _text(tool)], "adapterAvailable": False}
        if manifest.start_url and not manifest.provides_tools and not manifest.provides_hooks:
            plugin["startUrl"] = manifest.start_url
        plugins.append(plugin)
    servers = configuration.get("mcp_servers") or {}
    mcp = []
    for name, row in sorted(servers.items()) if isinstance(servers, dict) else []:
        if not _text(name) or not isinstance(row, dict):
            continue
        # URLs, arguments, environment and headers may hold credentials. Return
        # only transport kind and configured/disabled facts from the own Home.
        mcp.append({"id": name, "configured": bool(row.get("command") or row.get("url")), "enabled": row.get("enabled") is not False, "transport": "stdio" if row.get("command") else "http" if row.get("url") else "unknown", "adapterAvailable": False})
    return {"plugins": plugins, "mcp": mcp, "evidenceDigest": evidence_digest(home)}


def _revision(digest: str, identity: str) -> int:
    # Exact fingerprint remains private; integer is safely representable in JS.
    return 1 + int(hashlib.sha256((digest + ":" + identity).encode()).hexdigest()[:12], 16)


class CapabilityService:
    def __init__(self, manager):
        self.manager, self.store = manager, manager.store
        with manager._lock:
            if not hasattr(manager, "_capability_evidence"):
                manager._capability_evidence = {}
            self._cache = manager._capability_evidence
        self._lock = manager._lock

    def catalog(self, scope: Scope, *, refresh: bool = False) -> dict[str, Any]:
        resolved = self.manager.resolver.resolve(scope)
        fingerprint = evidence_digest(resolved.profile_home)
        with self._lock:
            cached = self._cache.get(scope.key)
            if not refresh and cached and cached["digest"] == fingerprint and time.monotonic() - cached["readAt"] < 60:
                cached_catalog = cached["catalog"]
            else:
                cached_catalog = None
        if cached_catalog is not None:
            return self._with_browser_entries(scope, cached_catalog)
        from .scoped_models import probe_catalog
        raw = probe_catalog(self.manager, scope, resolved=resolved, include_capabilities=True)
        inventory = raw.get("capabilityInventory") or {}
        if inventory.get("evidenceDigest") != fingerprint or evidence_digest(resolved.profile_home) != fingerprint:
            raise PolicyDenied("capability_configuration_changed")
        entries = []
        provider_rows = {row["id"]: row for row in raw.get("providers", []) if isinstance(row, dict) and _text(row.get("id"))}
        for group in raw.get("groups", []):
            pid = _text(group.get("provider_id")) if isinstance(group, dict) else ""
            if not pid:
                continue
            if pid not in provider_rows:
                provider_rows[pid] = {"id": pid, "display_name": group.get("provider"), "provider_available": pid != "google-gemini-cli"}
            if group.get("configured") is True:
                # The bound worker recognizes explicit keyless compatible
                # endpoints. Do not turn endpoint configuration into a key or
                # authentication claim merely because an account row exists.
                provider_rows[pid] = {**provider_rows[pid], "configuration_present": True}
        connections = []
        from .connection_setup import human_configuration_fields
        for pid, row in sorted(provider_rows.items()):
            credential_present = row.get("has_key") is True or row.get("oauth_connected") is True
            configured = credential_present or row.get("configuration_present") is True
            available = row.get("provider_available") is not False and pid != "google-gemini-cli"
            reauth = row.get("auth_state") in {"reauth_required", "expired"}
            status = "unavailable" if not available else "reauth_required" if reauth else "configured" if configured else "not_configured"
            form_fields = human_configuration_fields(pid)
            setup_available = available and (pid == "openai-codex" or form_fields is not None)
            setup = {"kind": "oauth" if pid == "openai-codex" else "settings", "providerId": pid, "availability": "available" if setup_available else "unavailable"}
            if pid != "openai-codex":
                setup["reasonCode"] = "human_configuration_required" if setup_available else "scoped_adapter_unavailable"
            connections.append({"connectionId": "provider:" + pid, "providerId": pid, "title": _text(row.get("display_name")) or pid, "revision": _revision(fingerprint, "provider:" + pid), "status": status, "configurationStatus": "configured" if configured else "not_configured", "authenticationStatus": "credential_present" if credential_present else "unknown" if configured else "required", "healthStatus": "unknown", "installed": True, "adapterAvailable": available, "setupActions": [setup]})
        entries.append({"capabilityId": "assistant.conversation", "title": "Profile providers", "connectionKind": "provider", "supportedTasks": ["conversation", "adaptive_interview", "agent_reasoning"], "status": "configured" if any(row["status"] == "configured" for row in connections) else "not_configured", "evidenceKind": "configuration", "connections": connections})
        for source, rows in (("plugin", inventory.get("plugins", [])), ("mcp", inventory.get("mcp", []))):
            for row in rows:
                identity = source + ":" + row["id"]
                entry = {"capabilityId": identity, "title": _text(row.get("name")) or row["id"], "connectionKind": "connector", "supportedTasks": [], "status": "restricted", "reasonCode": "independent_connector_adapter_required", "evidenceKind": "configuration", "connections": [{"connectionId": identity, "revision": _revision(fingerprint, identity), "status": "configured" if row.get("enabled") and row.get("configured", row.get("installed")) else "not_configured", "configurationStatus": "configured" if row.get("enabled") else "disabled", "authenticationStatus": "unknown", "healthStatus": "unknown", "installed": row.get("installed", False), "adapterAvailable": False, "setupActions": [{"kind": "settings", "availability": "unavailable", "reasonCode": "scoped_adapter_unavailable"}]}]}
                if source == "plugin" and isinstance(row.get("startUrl"), str):
                    entry["startUrl"] = row["startUrl"]
                entries.append(entry)
        catalog = {"schemaVersion": 1, "scope": scope.model_dump(mode="json", by_alias=True), "revision": _revision(fingerprint, scope.key), "observedAt": utc_now(), "stale": False, "entries": entries}
        with self._lock:
            self._cache[scope.key] = {"digest": fingerprint, "readAt": time.monotonic(), "catalog": catalog}
        return self._with_browser_entries(scope, catalog)

    def _with_browser_entries(self, scope: Scope, provider_catalog: dict[str, Any]) -> dict[str, Any]:
        """Browser receipts are local durable facts and must not share the 60s cache."""
        catalog = json.loads(canonical_json(provider_catalog))
        service = getattr(self.manager, "browser_connections", None)
        if service is None:
            return catalog
        entries = json.loads(canonical_json(service.catalog_entries(scope)))
        for entry in entries:
            if entry.get("capabilityId") != "browser.account" or entry.get("connectionKind") != "browser_account":
                raise PolicyDenied("browser_account_catalog_invalid")
            entry["title"] = entry.get("displayName") or "Agent browser accounts"
            entry["status"] = "configured" if any(row.get("status") == "configured" for row in entry["connections"]) else "not_configured"
            entry["evidenceKind"] = "explicit_user_confirmation"
            for row in entry["connections"]:
                row["title"] = row.get("accountLabel") or row.get("origin") or "Agent browser account"
        catalog["entries"].extend(entries)
        catalog["revision"] = _revision(hashlib.sha256(canonical_json(entries).encode()).hexdigest(), str(provider_catalog["revision"]))
        catalog["observedAt"] = utc_now()
        return catalog

    def validate(self, context: RunContext) -> bool:
        """Local-only, fail closed. Claim paths never probe workers or networks."""
        if not context.connection_bindings:
            return True
        from .connections import ConnectionRepository
        current = {row.binding_id: row for row in ConnectionRepository(self.store).list(context.scope)}
        for captured in context.connection_bindings:
            row = current.get(captured.binding_id)
            if row is None or row.scope != context.scope or row.status != "active" or row.connection_kind != captured.kind or row.capability_id != captured.capability_id or row.connection_id != captured.connection_id or row.revision != captured.revision or row.connection_revision != captured.connection_revision:
                return False
        browser = tuple(row for row in context.connection_bindings if row.kind == "browser_account")
        if browser:
            service = getattr(self.manager, "browser_connections", None)
            if service is None or not service.validate_binding(context):
                return False
        providers = tuple(row for row in context.connection_bindings if row.kind != "browser_account")
        if not providers:
            return True
        with self._lock:
            evidence = self._cache.get(context.scope.key)
        try:
            if evidence is None or evidence_digest(Path(context.resolved_profile_home)) != evidence["digest"]:
                return False
        except (PolicyDenied, OSError):
            return False
        connections = {(entry["capabilityId"], row["connectionId"]): row for entry in evidence["catalog"]["entries"] for row in entry["connections"]}
        for captured in providers:
            row = connections.get((captured.capability_id, captured.connection_id))
            if row is None or row["revision"] != captured.connection_revision or not row["adapterAvailable"] or row["status"] != "configured":
                return False
        return True

    def capture_provider(self, scope: Scope, provider, *, purpose: str = "conversation") -> tuple[ConnectionBinding, ...]:
        """Freeze an explicit prior Space binding; never create one implicitly."""
        from .connections import ConnectionRepository
        existing = [row for row in ConnectionRepository(self.store).list(scope) if row.connection_id == "provider:" + provider.provider and row.capability_id == "assistant.conversation"]
        matches = [row for row in existing if row.status == "active" and row.connection_kind == "provider" and purpose in row.permitted_use]
        if existing and not matches:
            raise PolicyDenied("scope_provider_use_not_permitted")
        return tuple(ConnectionBinding(connection_id=row.connection_id, kind="provider", capability_id=row.capability_id, revision=row.revision, binding_id=row.binding_id, connection_revision=row.connection_revision) for row in matches)

    def capture_browser(self, scope: Scope) -> tuple[ConnectionBinding, ...]:
        """Freeze explicit browser account use; anonymous browsing needs no receipt."""
        from .connections import ConnectionRepository
        self.manager.resolver.resolve(scope)
        rows = [row for row in ConnectionRepository(self.store).list(scope)
                if row.status == "active" and row.capability_id == "browser.account"
                and "browser.account.use" in row.permitted_use]
        if not rows:
            return ()
        service = getattr(self.manager, "browser_connections", None)
        if service is None or any(row.connection_kind != "browser_account" for row in rows):
            raise PolicyDenied("browser_account_adapter_required")
        service.authorize(scope, {"accountBindings": [{"bindingId": row.binding_id,
            "connectionId": row.connection_id, "connectionRevision": row.connection_revision,
            "revision": row.revision} for row in rows]})
        return tuple(ConnectionBinding(connection_id=row.connection_id, kind="browser_account",
            capability_id=row.capability_id, revision=row.revision, binding_id=row.binding_id,
            connection_revision=row.connection_revision) for row in rows)
