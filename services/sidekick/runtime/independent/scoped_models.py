"""Profile-bound model catalogs and durable Space model preferences.

Discovery runs only in the existing isolated worker and shared interactive
queue. A model preference grants no tool permission and changes no live run.
"""
from __future__ import annotations

import copy
import hashlib
from typing import Any

from .contracts import PermissionScope, ProviderSelection, Scope, canonical_json
from .policy import PolicyDenied
from .scope import ScopeError
from .scope_binding import provider_selection
from .runner import provider_configuration_digest
from .store import RevisionConflict

_META = "lastbrowser_independent_selection"
_VIRTUAL = {"teamwork": "Teamwork", "smart-track": "Smart Track",
            "smart-track-low": "Smart Track Low",
            "smart-track-medium": "Smart Track Medium", "smart-track-high": "Smart Track High"}
NATIVE_AVAILABILITY_REASONS = frozenset({
    "adapter_unsupported", "provider_unconfigured", "pair_absent",
    "independent_unsupported", "context_missing", "cloud_denied", "binding_mismatch",
})


def _text(value, maximum=512):
    return value if isinstance(value, str) and len(value) <= maximum and not any(ord(c) < 32 for c in value) else ""


def public_catalog(raw: dict, accounts: dict, configuration: dict) -> dict:
    """Allowlist public fields; never return account emails, URLs or raw config."""
    providers = []
    connections = {}
    for row in accounts.get("providers", []) if isinstance(accounts, dict) else []:
        if not isinstance(row, dict) or not _text(row.get("id"), 128):
            continue
        pid = row["id"]
        entry = {"id": pid, "display_name": _text(row.get("display_name"), 256) or pid,
                 "has_key": row.get("has_key") is True, "oauth_connected": row.get("oauth_connected") is True,
                 "auth_state": _text(row.get("auth_state"), 64) or "not_connected",
                 "provider_available": row.get("provider_available") is not False,
                 "models": []}
        for model in row.get("models", []) if isinstance(row.get("models"), list) else []:
            mid = _text(model.get("id") if isinstance(model, dict) else model)
            if mid and mid not in entry["models"]:
                entry["models"].append(mid)
        providers.append(entry)
        connections[pid] = entry["provider_available"] and (entry["has_key"] or entry["oauth_connected"])
    # Explicitly configured compatible endpoints may intentionally use no key
    # (e.g. a local server). Configuration is not an inference health proof.
    model_config = configuration.get("model") or {}
    if isinstance(model_config, dict):
        active = _text(raw.get("active_provider"), 128) or _text(model_config.get("provider"), 128)
        if active and model_config.get("base_url"):
            connections[active] = True
    configured_providers = configuration.get("providers") or {}
    if isinstance(configured_providers, dict):
        for pid, config in configured_providers.items():
            if _text(pid, 128) and isinstance(config, dict) and (config.get("base_url") or config.get("api_key")):
                connections[pid] = True
    for config in configuration.get("custom_providers", []) if isinstance(configuration.get("custom_providers"), list) else []:
        if isinstance(config, dict) and config.get("base_url"):
            from web.api.providers import _custom_provider_slug_from_name
            pid = _custom_provider_slug_from_name(str(config.get("name") or ""))
            if pid:
                connections[pid] = True
    # Subscription Gemini CLI is disabled by the existing provider registry.
    connections["google-gemini-cli"] = False
    groups = []
    for group in raw.get("groups", []) if isinstance(raw.get("groups"), list) else []:
        if not isinstance(group, dict):
            continue
        pid = _text(group.get("provider_id"), 128)
        if not pid:
            continue
        clean = {"provider_id": pid, "provider": _text(group.get("provider"), 256) or pid,
                 "configured": connections.get(pid, False), "models": []}
        for bucket in ("models", "extra_models"):
            models = []
            for model in group.get(bucket, []) if isinstance(group.get(bucket), list) else []:
                if not isinstance(model, dict) or not _text(model.get("id")):
                    continue
                model_id = model["id"]
                # The ordinary provider picker qualifies same-name models
                # from non-active providers as `@<provider-id>:<model-id>`.
                # Here the provider is already separate; strip only that
                # exact prefix and preserve model-native colons.
                prefix = f"@{pid}:"
                if model_id.startswith(prefix):
                    model_id = model_id[len(prefix):]
                clean_model = {"id": model_id, "label": _text(model.get("label"), 256) or model_id,
                               "supportsIndependent": pid != "google-gemini-cli" and model_id not in _VIRTUAL}
                from .scope_binding import configured_context_length
                length = model.get("context_length")
                if type(length) is not int or not 1 <= length <= 16000000:
                    length = configured_context_length(configuration, model_id, pid)
                if length is not None:
                    clean_model["contextLength"] = length
                for source, public in (("supportsVision", "supportsVision"), ("supportsTools", "supportsTools"),
                                       ("supports_vision", "supportsVision"), ("supports_tools", "supportsTools")):
                    if type(model.get(source)) is bool and public not in clean_model:
                        clean_model[public] = model[source]
                if isinstance(model.get("reasoning_efforts"), list):
                    clean_model["reasoning_efforts"] = list(dict.fromkeys(effort for effort in model["reasoning_efforts"]
                        if isinstance(effort, str) and effort in {"none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"}))
                if model.get('reasoning_effort_source') in {'live_catalog', 'local_catalog', 'official_model_docs', 'catalog', 'provided_catalog', 'unknown'}:
                    clean_model['reasoning_effort_source'] = model['reasoning_effort_source']
                models.append(clean_model)
            if models or bucket == "models":
                clean[bucket] = models
        if clean["models"] or clean.get("extra_models"):
            groups.append(clean)
    groups.append({"provider_id": "", "provider": "Orchestration", "configured": True,
                   "models": [{"id": mid, "label": label, "supportsIndependent": False} for mid, label in _VIRTUAL.items()]})
    return {"groups": groups, "providers": providers}


def probe_catalog(manager, scope: Scope, resolved=None, *, include_capabilities=True) -> dict:
    """Read public model/account metadata using the existing two worker slots."""
    resolved = resolved or manager.resolver.resolve(scope)
    selection, digest = provider_selection(resolved)
    provider = selection or ProviderSelection(provider_config_ref=digest, model="__catalog__", provider="")
    context = manager.make_context(scope, provider, permissions=PermissionScope(allowed_effects=()), allow_virtual_for_catalog=True, interactive=True)
    result = manager.run_interactive(context, {"mode": "model_catalog", "includeCapabilities": include_capabilities,
                                               "providerConfigurationDigest": digest})
    if provider_configuration_digest(resolved.profile_home) != digest:
        raise PolicyDenied("provider_connection_changed")
    if not isinstance(result, dict) or result.get("providerConfigurationDigest") != digest or not isinstance(result.get("groups"), list):
        raise PolicyDenied("invalid_model_catalog")
    return result


def _choice(resolved, config):
    model_config = config.get("model") or {}
    if not isinstance(model_config, dict):
        raise ScopeError("Space model configuration is malformed")
    selection, _ = provider_selection(resolved, space_config=config)
    return (selection.model, selection.provider) if selection else ("", "")


def _fingerprint(model, provider):
    return hashlib.sha256(canonical_json({"model": model, "provider": provider}).encode()).hexdigest()


def _revision(config, model, provider):
    meta = (config.get("model") or {}).get(_META) or {}
    revision = meta.get("revision", 1) if isinstance(meta, dict) else 1
    if type(revision) is not int or revision < 1:
        raise ScopeError("Space model revision is malformed")
    # Legacy/native editors may update a choice without this new metadata.
    # Their change is a revision conflict rather than a silent overwrite.
    if meta.get("fingerprint") and meta["fingerprint"] != _fingerprint(model, provider):
        # Include the observed choice in this opaque CAS value: two legacy
        # writes before a new owned commit must not share the same revision.
        revision += 1 + int(_fingerprint(model, provider)[:10], 16)
    return revision


def _entry(catalog, model, provider):
    for group in catalog["groups"]:
        if group.get("provider_id") == provider:
            for row in (*group.get("models", []), *group.get("extra_models", [])):
                if row.get("id") == model:
                    return group, row
    return None, None


def _native_availability(scope, revision, catalog, provider, model, *, profile_home=None, account_id=None):
    """Compute a model-row capability from this exact bound Space catalog."""
    from .native_chat_auto import native_sdk_supported
    from runtime.model_metadata import MINIMUM_CONTEXT_LENGTH

    antigravity_binding_available = False
    if provider == "antigravity" and profile_home is not None:
        try:
            from runtime.antigravity_oauth import resolve_native_account_binding
            antigravity_binding_available = bool(resolve_native_account_binding(profile_home, account_id=account_id))
        except Exception:
            antigravity_binding_available = False

    group, entry = _entry(catalog, model, provider)
    if model in _VIRTUAL:
        supported, reason = False, "independent_unsupported"
    else:
        supported = bool(provider and (native_sdk_supported(provider)
            or provider == "antigravity"))
        reason = None
    if reason is not None:
        pass
    elif not supported:
        reason = "adapter_unsupported"
    elif not group or not entry:
        reason = "pair_absent"
    elif group.get("configured") is not True:
        reason = "provider_unconfigured"
    elif provider == "antigravity" and not antigravity_binding_available:
        reason = "binding_mismatch"
    elif entry.get("supportsIndependent") is not True:
        reason = "independent_unsupported"
    elif type(entry.get("contextLength")) is not int or entry["contextLength"] < MINIMUM_CONTEXT_LENGTH:
        reason = "context_missing"
    else:
        reason = None
    if reason is not None and reason not in NATIVE_AVAILABILITY_REASONS:
        reason = "pair_absent"
    return {
        "schemaVersion": 1,
        "supported": supported,
        "available": reason is None,
        "reasonCode": reason,
        "provider": provider,
        "model": model,
        "scope": scope.model_dump(mode="json", by_alias=True),
        "selectionRevision": revision,
    }


def _catalog_with_native_availability(scope, revision, catalog, *, profile_home=None, account_id=None):
    groups = copy.deepcopy(catalog.get("groups") or [])
    for group in groups:
        if not isinstance(group, dict):
            continue
        provider = group.get("provider_id")
        for bucket in ("models", "extra_models"):
            for row in group.get(bucket, []) if isinstance(group.get(bucket), list) else []:
                if isinstance(row, dict) and isinstance(row.get("id"), str):
                    row["nativeAvailability"] = _native_availability(
                        scope, revision, catalog, provider, row["id"], profile_home=profile_home, account_id=account_id)
    return groups


def _response(scope, revision, model, provider, catalog, *, profile_home=None, account_id=None):
    group, entry = _entry(catalog, model, provider)
    configured = bool(model and group and group.get("configured"))
    supported = configured and bool(entry and entry.get("supportsIndependent", True))
    reason = "independent_orchestration_not_supported" if model in _VIRTUAL else (
        "provider_unavailable" if provider == "google-gemini-cli" else
        "model_not_in_bound_catalog" if model and not entry else "provider_not_configured" if not configured else None)
    return {"schemaVersion": 1, "scope": scope.model_dump(mode="json", by_alias=True), "revision": revision,
            "model": model, "provider": provider, "configured": configured, "supportsIndependent": supported,
            "nativeAvailability": _native_availability(scope, revision, catalog, provider, model,
                profile_home=profile_home, account_id=account_id),
            **({"reasonCode": reason} if reason else {}),
            "groups": _catalog_with_native_availability(scope, revision, catalog,
                profile_home=profile_home, account_id=account_id),
            "providers": catalog.get("providers", [])}


def handle_model_selection(store, resolver, manager, scope: Scope, payload: dict[str, Any]) -> dict:
    from web.api.space_engine import space_config_lock
    action = payload.get("action", "get")
    if action not in {"get", "set"} or set(payload) - {"action", "model", "provider", "expectedRevision", "clientRequestId", "includeCatalog"}:
        raise PolicyDenied("invalid_model_selection_request")
    if "includeCatalog" in payload and (action != "get" or type(payload["includeCatalog"]) is not bool):
        raise PolicyDenied("invalid_model_selection_request")
    resolved = resolver.resolve(scope)
    if resolved.binding.scope != scope:
        raise PolicyDenied("scope_mismatch")
    if action == "get" and payload.get("includeCatalog") is False:
        config = resolved.space.load_config()
        if config.get("_space_config_malformed"):
            raise ScopeError("Space configuration is malformed")
        model, provider = _choice(resolved, config)
        return {"schemaVersion": 1, "scope": scope.model_dump(mode="json", by_alias=True),
                "revision": _revision(config, model, provider), "model": model, "provider": provider,
                "configurationOnly": True, "configured": bool(model), "supportsIndependent": False,
                "reasonCode": "independent_orchestration_not_supported" if model in _VIRTUAL else "catalog_not_checked"}
    if action == "set":
        model, provider = payload.get("model"), payload.get("provider", "")
        request_id, expected = payload.get("clientRequestId"), payload.get("expectedRevision")
        if not _text(model) or not isinstance(provider, str) or _text(provider, 128) != provider or not _text(request_id, 128) or type(expected) is not int or expected < 1:
            raise PolicyDenied("invalid_model_selection_request")
        request_digest = hashlib.sha256(canonical_json(payload).encode()).hexdigest()
        # A committed retry does not need new discovery/network or a free slot.
        with space_config_lock(resolved.space):
            cached = ((resolved.space.load_config().get("model") or {}).get(_META) or {}).get("requests", {}).get(request_id)
            if cached:
                if cached.get("digest") != request_digest:
                    raise PolicyDenied("model_selection_request_id_reused")
                return copy.deepcopy(cached["response"])
    catalog = probe_catalog(manager, scope, resolved)
    with space_config_lock(resolved.space):
        resolver.resolve(scope)
        config = resolved.space.load_config()
        if config.get("_space_config_malformed"):
            raise ScopeError("Space configuration is malformed")
        current_model, current_provider = _choice(resolved, config)
        revision = _revision(config, current_model, current_provider)
        # No canonical Space account-selection field is currently produced by
        # the UI/session lifecycle. Saved generic IDs are not selection proof.
        target_account = None
        if action == "get":
            return _response(scope, revision, current_model, current_provider, catalog,
                profile_home=resolved.profile_home, account_id=target_account)
        metadata = (config.get("model") or {}).get(_META) or {}
        cached = metadata.get("requests", {}).get(request_id)
        if cached:
            if cached.get("digest") != request_digest:
                raise PolicyDenied("model_selection_request_id_reused")
            return copy.deepcopy(cached["response"])
        if revision != expected:
            raise RevisionConflict("Space model changed; reload before selecting")
        if provider_configuration_digest(resolved.profile_home) != catalog["providerConfigurationDigest"]:
            raise PolicyDenied("provider_connection_changed")
        availability = _native_availability(scope, revision + 1, catalog, provider, model,
            profile_home=resolved.profile_home, account_id=target_account)
        if not availability["available"] and model not in _VIRTUAL:
            # Keep the established model-selection mutation error stable for
            # API callers. The more granular nativeAvailability reason is a
            # picker/catalog hint, not a replacement for the mutation contract.
            legacy_error = {
                "pair_absent": "model_not_in_bound_catalog",
                "provider_unconfigured": "provider_not_configured",
                "context_missing": "context_metadata_required",
            }.get(availability["reasonCode"], availability["reasonCode"])
            raise PolicyDenied(legacy_error)
        original_config = copy.deepcopy(config)
        next_revision = revision + 1
        response = _response(scope, next_revision, model, provider, catalog,
            profile_home=resolved.profile_home, account_id=target_account)
        requests = dict(metadata.get("requests") or {})
        # Keep the idempotency record in the same atomic config write as choice.
        # Catalogs can be large; retain only the small acknowledgement per key.
        requests[request_id] = {"digest": request_digest, "response": {key: value for key, value in response.items() if key not in {"groups", "providers"}}}
        while len(requests) > 64:
            del requests[next(iter(requests))]
        config["model"] = {**(config.get("model") or {}), "default": model, "model": model, "provider": provider,
                           _META: {"revision": next_revision, "fingerprint": _fingerprint(model, provider), "requests": requests}}
        resolved.space.save_config(config)
        readback = resolved.space.load_config()
        readback_model, readback_provider = _choice(resolved, readback)
        readback_revision = _revision(readback, readback_model, readback_provider)
        if (readback_model, readback_provider, readback_revision) != (model, provider, next_revision):
            # Roll back only while the config still equals our just-written
            # value; never overwrite a concurrent external writer.
            if canonical_json(readback) == canonical_json(config):
                resolved.space.save_config(original_config)
            raise PolicyDenied("config_changed")
        return response
