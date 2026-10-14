"""Explicit, profile-owned consent for optional memory and assistants.

Old memory configuration is not consent: upgrades default to off, keep all data,
and require a deliberate Hub activation. Cloud processing has separate consent.
"""
from __future__ import annotations

import json
import os
import threading
import uuid
from pathlib import Path

_lock = threading.RLock()
_FIELDS = ("enabled", "cloud_search_enabled", "assistants_enabled", "gmail_ai_enabled", "discord_agents_enabled", "kanban_enabled", "tasks_enabled")


def profile_home() -> Path:
    # Native workers bind their own verified profile before running tools.
    if os.environ.get("LASTBROWSER_NATIVE_CHAT_WORKER") == "1":
        from runtime.independent.native_chat_policy import get_bound_native_context
        context = get_bound_native_context()
        if context is None:
            raise PermissionError("memory_profile_binding_required")
        return Path(context.profile_home).resolve()
    from web.api.profiles import get_active_profile_home
    return Path(get_active_profile_home()).resolve()


def read_policy(home: Path | None = None) -> dict:
    result = {field: False for field in _FIELDS}
    result.update(scope="profile", supported_scopes=["profile"])
    try:
        data = json.loads(((home or profile_home()) / "memory-policy.json").read_text(encoding="utf-8"))
        if isinstance(data, dict):
            for field in _FIELDS:
                result[field] = data.get(field) is True
    except (OSError, ValueError, PermissionError):
        pass  # Missing/corrupt/unbound consent always fails closed.
    return result


def update_policy(patch: dict, home: Path | None = None) -> dict:
    if not isinstance(patch, dict) or set(patch) - {*_FIELDS, "scope"}:
        raise ValueError("invalid_memory_policy_fields")
    if any(type(patch[key]) is not bool for key in _FIELDS if key in patch):
        raise ValueError("memory_policy_requires_booleans")
    if patch.get("scope", "profile") != "profile":
        raise ValueError("memory_policy_supports_profile_only")
    home = (home or profile_home()).resolve()
    with _lock:
        policy = read_policy(home)
        policy.update(patch)
        home.mkdir(parents=True, exist_ok=True)
        temporary = home / (".memory-policy-" + uuid.uuid4().hex + ".tmp")
        try:
            temporary.write_text(json.dumps({key: policy[key] for key in (*_FIELDS, "scope")}), encoding="utf-8")
            os.replace(temporary, home / "memory-policy.json")
        finally:
            temporary.unlink(missing_ok=True)
        return policy


def memory_enabled(home: Path | None = None) -> bool:
    return read_policy(home)["enabled"]


def cloud_enabled(home: Path | None = None) -> bool:
    policy = read_policy(home)
    return policy["enabled"] and policy["cloud_search_enabled"]


def require_assistants(home: Path | None = None) -> None:
    if not read_policy(home)["assistants_enabled"]:
        raise PermissionError("assistants_disabled_enable_in_hub")
