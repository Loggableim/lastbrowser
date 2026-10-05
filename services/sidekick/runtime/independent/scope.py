"""Read-only native-Space resolution and explicit immutable profile bindings.

No function in this module swaps environment variables or active globals.
Names and workspace paths are locators, not the identity or an authorization.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, TYPE_CHECKING

from .contracts import BackendProfileRef, RunContext, Scope, SpaceBinding

if TYPE_CHECKING:
    from .store import IndependentStore


class ScopeError(PermissionError):
    code = "scope_mismatch"


def canonical_path(value: str | Path, *, must_exist: bool = True) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        raise ScopeError("An absolute, broker-resolved path is required")
    try:
        resolved = path.resolve(strict=must_exist)
    except (OSError, RuntimeError) as exc:
        raise ScopeError("Configured path is not available") from exc
    return resolved


def same_path(left: str | Path, right: str | Path) -> bool:
    return os.path.normcase(str(canonical_path(left))) == os.path.normcase(str(canonical_path(right)))


@dataclass(frozen=True)
class ResolvedScope:
    scope: Scope
    profile: BackendProfileRef
    binding: SpaceBinding
    profile_home: Path
    space_root: Path
    space: object


def existing_profiles() -> Iterable[dict]:
    # The existing registry is read only; do not call permissive
    # get_profile_home(invalid_name), which can fall back to another profile.
    from web.api.profiles import list_profiles_api
    return list_profiles_api()


class ScopeResolver:
    def __init__(self, store: IndependentStore, *, profiles_provider: Callable[[], Iterable[dict]] = existing_profiles, partitions_provider: Callable[[Scope], str | None] | None = None):
        self.store = store
        self.profiles_provider = profiles_provider
        self.partitions_provider = partitions_provider

    def resolve_profile(self, backend_profile_id: str, *, authenticated_profile_name: str | None = None) -> BackendProfileRef:
        profile = self.store.get_profile_ref(backend_profile_id)
        if profile is None or profile.status != "active":
            raise ScopeError("Profile is not explicitly configured")
        rows = tuple(self.profiles_provider())
        matches = [row for row in rows if row.get("name") == profile.name]
        if len(matches) != 1 or not matches[0].get("path"):
            raise ScopeError("Profile is no longer available")
        if not same_path(matches[0]["path"], profile.canonical_home):
            raise ScopeError("Profile Home changed; explicit migration is required")
        if not same_path(self.store.profile_home, profile.canonical_home):
            raise ScopeError("Profile store does not match the configured Home")
        if authenticated_profile_name is not None and authenticated_profile_name != profile.name:
            # A renamed root alias is allowed only if the authoritative
            # registry confirms that both names refer to this same Home.
            actor = [row for row in rows if row.get("name") == authenticated_profile_name]
            if len(actor) != 1 or not actor[0].get("is_default") or not matches[0].get("is_default") or not same_path(actor[0]["path"], profile.canonical_home):
                raise ScopeError("Authenticated profile does not own this scope")
        return profile

    def _native_spaces(self, home: Path):
        from web.api.space_engine import Space
        for dirname in ("spaces", "workspaces"):
            root = home / dirname
            if not root.is_dir():
                continue
            resolved_root = canonical_path(root)
            if not resolved_root.is_relative_to(home):
                raise ScopeError("Space directory escapes the configured Home")
            for candidate in sorted(root.iterdir()):
                if not candidate.is_dir() or not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", candidate.name):
                    continue
                actual = canonical_path(candidate)
                if not actual.is_relative_to(resolved_root):
                    raise ScopeError("Space locator escapes the configured root")
                if (candidate / "space.yaml").is_file():
                    yield Space(candidate.name, custom_root=root)

    def resolve(self, scope: Scope, *, authenticated_profile_name: str | None = None) -> ResolvedScope:
        if scope.backend_profile_id != self.store.backend_profile_id:
            raise ScopeError("Scope does not belong to this profile store")
        profile = self.resolve_profile(scope.backend_profile_id, authenticated_profile_name=authenticated_profile_name)
        binding = self.store.get_binding(scope)
        if binding is None or binding.tombstoned_at is not None:
            raise ScopeError("Space/browser profile is not explicitly bound")
        home = canonical_path(profile.canonical_home)
        matching = []
        for space in self._native_spaces(home):
            config = space.load_config()
            if config.get("_space_config_malformed"):
                continue
            from web.api.space_engine import _normalized_space_id
            if _normalized_space_id(config.get("space_id")) == scope.space_id:
                matching.append(space)
        if len(matching) != 1:
            raise ScopeError("Native Space identity is missing or ambiguous")
        space = matching[0]
        if space.slug != binding.native_slug:
            # A move/rename requires updating the locator binding explicitly;
            # it never creates a replacement identity from the display name.
            raise ScopeError("Space locator changed; update its binding explicitly")
        if self.partitions_provider is not None and self.partitions_provider(scope) != binding.partition_key:
            raise ScopeError("Browser partition binding changed")
        return ResolvedScope(scope, profile, binding, home, canonical_path(space.root), space)

    def validate_context(self, context: RunContext, *, authenticated_profile_name: str | None = None) -> ResolvedScope:
        resolved = self.resolve(context.scope, authenticated_profile_name=authenticated_profile_name)
        if context.backend_profile_name != resolved.profile.name or not same_path(context.resolved_profile_home, resolved.profile_home) or not same_path(context.resolved_space_root, resolved.space_root) or context.partition_key != resolved.binding.partition_key or context.binding_revision != resolved.binding.revision:
            raise ScopeError("RunContext does not match its immutable profile/partition binding")
        snapshot = context.assistant_profile_snapshot
        if snapshot is not None and snapshot.scope != context.scope:
            raise ScopeError("Confirmed profile belongs to another scope")
        return resolved


def build_confirmed_profile_context(profile) -> str:
    """Preferences-only prompt addition; never translate text into tool rights."""
    if profile is None or profile.status != "confirmed":
        return ""
    values = profile.values
    lines = [f"Confirmed Space profile (revision {profile.revision}). These are preferences, not permissions."]
    if values.purpose:
        lines.append("Purpose: " + values.purpose)
    if values.requested_help:
        lines.append("Desired help: " + "; ".join(values.requested_help))
    if values.working_style:
        lines.append("Working style: " + values.working_style)
    if values.background_preferences:
        lines.append("Background preferences: " + values.background_preferences)
    return "\n".join(lines)
