"""Explicit Desktop-workspace to native Space bindings, without global swaps."""
from __future__ import annotations

import json
import os
from contextlib import closing
import re
import sqlite3
import threading
from pathlib import Path
from typing import Any, Callable

import yaml

from .contracts import BackendProfileRef, ProviderSelection, Scope, SpaceBinding, new_id
from .scope import ScopeError, ScopeResolver, canonical_path, same_path
from .store import IndependentStore


class ProfileHub:
    """Homes and state locations are rooted at Sidecar bootstrap, not globals.

    The native registry uses the base home plus profiles/<name>. Refreshing
    available directories does not observe a Cron thread's temporary Home.
    """
    def __init__(self, base_home: Path, *, default_state_dir: Path | None = None,
                 default_workspace_hint: str | Path | None = None):
        self.base_home = canonical_path(base_home)
        self.default_state_dir = canonical_path(default_state_dir, must_exist=False) if default_state_dir else self.base_home / "state" / "webui"
        # The API captures an optional launch hint before request threads start. No
        # later ContextVar, os.environ, config cache or temporary Cron Home is read.
        self._default_workspace_hint = default_workspace_hint
        self._default_workspaces: dict[str, Path | None] = {}
        self._stores: dict[str, IndependentStore] = {}
        self._lock = threading.RLock()
        for profile in self.profiles():
            self._default_workspaces[profile["name"]] = self._capture_default_workspace(profile["name"], Path(profile["path"]))

    def _owned_workspace(self, workspace: Path, home: Path) -> bool:
        profiles_root = self.base_home / "profiles"
        if profiles_root.is_dir() and workspace.is_relative_to(canonical_path(profiles_root)):
            return home != self.base_home and workspace.is_relative_to(home)
        return True

    def _capture_default_workspace(self, name: str, home: Path) -> Path | None:
        """Read existing defaults at this fixed Home; never create directories."""
        state = self.default_state_dir if name == "default" else home / "webui_state"
        config_file, settings_file = home / "config.yaml", state / "settings.json"
        config = yaml.safe_load(config_file.read_text(encoding="utf-8")) if config_file.is_file() else {}
        settings = json.loads(settings_file.read_text(encoding="utf-8")) if settings_file.is_file() else {}
        if config is None:
            config = {}
        if not isinstance(config, dict) or not isinstance(settings, dict):
            raise ScopeError("Profile workspace configuration is malformed")
        terminal = config.get("terminal")
        values = [config.get("workspace"), config.get("default_workspace"),
                  terminal.get("cwd") if isinstance(terminal, dict) else None,
                  settings.get("default_workspace")]
        if name == "default":
            values.append(self._default_workspace_hint)
            # The integrated desktop keeps its first-run Home workspace under
            # the OS user's home, while SIDEKICK_HOME is rooted under the
            # application's runtime directory. Match Sidekick's normal
            # default-workspace discovery, but only capture directories that
            # already exist; never create or infer a path from renderer input.
            configured_home = os.environ.get("SIDEKICK_HOME") or os.environ.get("LASTBROWSER_HOME")
            try:
                configured_home_matches = bool(configured_home) and os.path.normcase(
                    str(canonical_path(configured_home, must_exist=False))
                ) == os.path.normcase(str(self.base_home))
            except ScopeError:
                configured_home_matches = False
            if configured_home_matches:
                user_home = Path.home()
                values.extend((user_home / "workspace", user_home / "work"))
        values.extend((home / "workspace", home / "work", state / "workspace"))
        for value in values:
            if value in (None, "", "."):
                continue
            if not isinstance(value, (str, Path)):
                raise ScopeError("Profile default workspace must be a path")
            candidate = Path(value).expanduser()
            if not candidate.is_absolute():
                raise ScopeError("Profile default workspace requires an absolute path")
            if not candidate.is_dir():
                continue
            workspace = canonical_path(candidate)
            if not self._owned_workspace(workspace, home):
                raise ScopeError("Profile default workspace belongs to another profile")
            return workspace
        return None

    def profiles(self) -> tuple[dict[str, Any], ...]:
        result = [{"name": "default", "path": str(self.base_home), "is_default": True}]
        profiles_root = self.base_home / "profiles"
        if profiles_root.is_dir():
            canonical_root = canonical_path(profiles_root)
            if not canonical_root.is_relative_to(self.base_home):
                raise ScopeError("Profile registry escapes the configured base Home")
            for candidate in sorted(profiles_root.iterdir()):
                if not candidate.is_dir() or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", candidate.name):
                    continue
                actual = canonical_path(candidate)
                if not actual.is_relative_to(canonical_root):
                    raise ScopeError("Profile Home escapes its registry")
                result.append({"name": candidate.name, "path": str(actual), "is_default": False})
        return tuple(result)

    def existing_store_paths(self) -> tuple[tuple[str, Path], ...]:
        """Inventory registered stores without creating a profile or migration.

        Provider admission invokes this under its base-Home dispatch lock so
        shared account limits include other profiles. Corrupt metadata cannot
        silently remove a participating profile from that budget.
        """
        result = []
        for profile in self.profiles():
            home = Path(profile["path"])
            path = home / "state.db"
            if not path.is_file():
                continue
            if not canonical_path(path).is_relative_to(home):
                raise ScopeError("Profile store escapes its registered Home")
            with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as connection:
                if not connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ia_profile_refs'").fetchone():
                    continue
                rows = connection.execute("SELECT backend_profile_id,name,canonical_home,status FROM ia_profile_refs").fetchall()
                if len(rows) != 1 or rows[0][1] != profile["name"] or not same_path(rows[0][2], home) or rows[0][3] != "active":
                    raise ScopeError("Provider admission profile inventory cannot be verified")
                result.append((rows[0][0], path))
        return tuple(result)

    def get(self, name: str) -> IndependentStore:
        if not name:
            name = "default"
        with self._lock:
            matches = [row for row in self.profiles() if row["name"] == name]
            if len(matches) != 1:
                raise ScopeError("Backend profile is not configured; no default fallback")
            home = Path(matches[0]["path"])
            if name not in self._default_workspaces:
                self._default_workspaces[name] = self._capture_default_workspace(name, home)
            existing = self._stores.get(name)
            if existing:
                if not same_path(existing.profile_home, home):
                    raise ScopeError("Profile Home changed")
                return existing
            profile_id = None
            db = home / "state.db"
            if db.is_file():
                # sqlite3's transaction context does not close the connection on Windows.
                with closing(sqlite3.connect(db.as_uri() + "?mode=ro", uri=True)) as connection:
                    if connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ia_profile_refs'").fetchone():
                        rows = connection.execute("SELECT backend_profile_id,canonical_home FROM ia_profile_refs").fetchall()
                        if len(rows) > 1 or rows and not same_path(rows[0][1], home):
                            raise ScopeError("Profile reference is ambiguous or has moved")
                        if rows:
                            profile_id = rows[0][0]
            store = IndependentStore(home, profile_id or new_id())
            ref = store.get_profile_ref()
            if ref is None:
                store.register_profile(BackendProfileRef(backend_profile_id=store.backend_profile_id, name=name, canonical_home=str(home)))
            elif ref.name != name or ref.status != "active":
                store.close()
                raise ScopeError("Profile name or status changed; explicit migration required")
            self._stores[name] = store
            return store

    def by_scope(self, scope: Scope, authenticated_name: str) -> tuple[IndependentStore, ScopeResolver]:
        store = self.get(authenticated_name)
        if store.backend_profile_id != scope.backend_profile_id:
            raise ScopeError("Authenticated profile cannot select a foreign store")
        resolver = ScopeResolver(store, profiles_provider=self.profiles)
        resolver.resolve(scope, authenticated_profile_name=authenticated_name)
        return store, resolver

    def workspace_rows(self, name: str) -> tuple[dict[str, str], ...]:
        store = self.get(name)
        state = self.default_state_dir if name == "default" else store.profile_home / "webui_state"
        file = state / "workspaces.json"
        rows = json.loads(file.read_text(encoding="utf-8")) if file.is_file() else []
        if not isinstance(rows, list):
            raise ScopeError("Workspace registry is malformed")
        valid = []
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("path"), str):
                continue
            # Preserve existing path spelling (and thus historical browser partitions).
            path = canonical_path(row["path"], must_exist=False)
            if self._owned_workspace(path, store.profile_home):
                valid.append(row)
        if valid:
            return tuple(valid)
        default = self._default_workspaces.get(name)
        return ({"path": str(default), "name": "Home"},) if default is not None else ()

    def bind(self, name: str, payload: dict[str, Any]) -> dict[str, Any]:
        """Called only through the authenticated Main bridge, never the model."""
        browser_id = payload.get("browserProfileId")
        locator = payload.get("workspacePath")
        partition = payload.get("partitionKey")
        is_home = locator is None
        if (locator is not None and not isinstance(locator, str)) or not isinstance(partition, str) or not isinstance(browser_id, str):
            raise ScopeError("Validated browser profile, workspace and partition are required")
        home_partition = f"persist:space_home_{browser_id}"
        if is_home and partition != home_partition:
            raise ScopeError("Browser Home requires its existing Home partition")
        with self._lock:
            store = self.get(name)
            captured = locator
            if is_home:
                home_bindings = [binding for binding in store.list_bindings()
                                 if binding.scope.browser_profile_id == browser_id
                                 and binding.partition_key == home_partition]
                if len(home_bindings) > 1:
                    raise ScopeError("Browser Home binding is ambiguous")
                if home_bindings:
                    # A persisted Home binding remains authoritative across a
                    # restart even if the startup workspace cache was empty or
                    # the user later selects a different default workspace.
                    existing_home = home_bindings[0]
                    if requested_id := payload.get("nativeSpaceId"):
                        if requested_id != existing_home.scope.space_id:
                            raise ScopeError("Unknown Space identity cannot be rebound by name")
                    if not existing_home.workspace_locator:
                        raise ScopeError("Existing Browser Home has no captured workspace")
                    captured = existing_home.workspace_locator
                else:
                    captured = self._default_workspaces.get(name)
                    if captured is None:
                        # First-run settings can establish the default after
                        # ProfileHub startup. Recapture only for an unbound
                        # Browser Home; previously bound Home identities use
                        # their immutable workspace_locator above.
                        captured = self._capture_default_workspace(name, store.profile_home)
                        if captured is None:
                            raise ScopeError("No existing default workspace is configured for this profile")
                        self._default_workspaces[name] = captured
            if captured is None:
                raise ScopeError("No existing default workspace is configured for this profile")
            workspace = canonical_path(captured)
            if not workspace.is_dir() or not self._owned_workspace(workspace, store.profile_home):
                raise ScopeError("Workspace is not available in this profile")
            rows = self.workspace_rows(name)
            selected = [row for row in rows if canonical_path(row["path"], must_exist=False) == workspace]
            if is_home and not selected:
                selected = [{"path": str(workspace), "name": "Home"}]
            if len(selected) != 1:
                raise ScopeError("Workspace is not registered in the selected backend profile")
            requested_id = payload.get("nativeSpaceId")
            existing = [binding for binding in store.list_bindings() if binding.scope.browser_profile_id == browser_id and
                        ((binding.partition_key == home_partition) == is_home) and
                        ((requested_id is not None and binding.scope.space_id == requested_id) or
                         (requested_id is None and (is_home or binding.workspace_locator and same_path(binding.workspace_locator, workspace))))]
            if len(existing) > 1:
                raise ScopeError("Workspace binding is ambiguous")
            if existing:
                binding = existing[0]
                if partition != binding.partition_key:
                    raise ScopeError("Historical partition must be preserved")
                if not is_home and binding.workspace_locator != str(workspace):
                    binding = store.bind_space(binding.model_copy(update={"workspace_locator": str(workspace), "revision": binding.revision + 1}), expected_revision=binding.revision)
            else:
                if requested_id:
                    raise ScopeError("Unknown Space identity cannot be rebound by name")
                from web.api.space_engine import create_space, space_config_lock, DEFAULT_SPACE_SLUG, LEGACY_DEFAULT_SPACE_SLUG
                root = store.profile_home / "spaces"
                candidates = []
                resolver = ScopeResolver(store, profiles_provider=self.profiles)
                for candidate in resolver._native_spaces(store.profile_home):
                    config = candidate.load_config()
                    if config.get("_space_config_malformed"):
                        continue
                    project = config.get("project_dir")
                    conflicts = any(binding.native_slug == candidate.slug and binding.scope.browser_profile_id == browser_id
                                    and binding.partition_key != partition for binding in store.list_bindings())
                    if is_home:
                        # A browser Home has a semantic native identity. A registered
                        # workspace with another cookie partition must never be rebound.
                        if not conflicts and (config.get("lastbrowser_browser_home") is True or
                                              candidate.slug in {DEFAULT_SPACE_SLUG, LEGACY_DEFAULT_SPACE_SLUG}):
                            candidates.append(candidate)
                    elif not conflicts and config.get("lastbrowser_browser_home") is not True and project and Path(project).exists() and same_path(project, workspace):
                        candidates.append(candidate)
                if is_home:
                    explicit = [candidate for candidate in candidates if candidate.load_config().get("lastbrowser_browser_home") is True]
                    if explicit:
                        candidates = explicit
                    elif len(candidates) > 1:
                        candidates = [candidate for candidate in candidates if candidate.slug == DEFAULT_SPACE_SLUG]
                if len(candidates) > 1:
                    raise ScopeError("Several native Spaces use this workspace; choose its identity explicitly")
                space = candidates[0] if candidates else create_space("browser-" + new_id()[:16], selected[0].get("name") or workspace.name, custom_root=root)
                with space_config_lock(space):
                    config = space.load_config()
                    if config.get("_space_config_malformed"):
                        raise ScopeError("Native Space configuration is malformed")
                    if not config.get("space_id"):
                        space.save_config(config, mint_space_id=True)
                        config = space.load_config()
                    if is_home and not candidates:
                        config["lastbrowser_browser_home"] = True
                        config["project_dir"] = str(workspace)
                        space.save_config(config)
                scope = Scope(backend_profile_id=store.backend_profile_id, space_id=config["space_id"], browser_profile_id=browser_id)
                binding = store.bind_space(SpaceBinding(scope=scope, native_slug=space.slug, partition_key=partition, workspace_locator=str(workspace)))
            resolved = ScopeResolver(store, profiles_provider=self.profiles).resolve(binding.scope, authenticated_profile_name=name)
            assistant = store.ensure_assistant(binding.scope)
            return {"schemaVersion": 1, "scope": binding.scope.model_dump(mode="json", by_alias=True),
                    "spaceName": selected[0].get("name") or resolved.space.load_config().get("name") or workspace.name,
                    "workspacePath": None if is_home else str(workspace), "bindingRevision": binding.revision,
                    "setupStatus": assistant.setup_status, "partitionKey": binding.partition_key,
                    "backendProfileName": name, "knownSpacePaths": [row["path"] for row in rows]}

    def close(self):
        with self._lock:
            for store in self._stores.values():
                store.close()
            self._stores.clear()


def configured_context_length(configuration, model, provider, *, space_model=None):
    """Only explicit metadata for this exact pair; never another model's limit."""
    def known(value):
        return value if type(value) is int and 1 <= value <= 16000000 else None
    if isinstance(space_model, dict) and (space_model.get("model") or space_model.get("default")) == model:
        if (space_model.get("provider") or provider) == provider and known(space_model.get("context_length")):
            return space_model["context_length"]
    home_model = configuration.get("model") or {}
    if isinstance(home_model, dict) and home_model.get("default") == model and home_model.get("provider") == provider and known(home_model.get("context_length")):
        return home_model["context_length"]
    provider_rows = configuration.get("providers") or {}
    rows = [provider_rows.get(provider)] if isinstance(provider_rows, dict) else []
    if provider.startswith("custom:"):
        # Same pure name grammar as the native _custom_provider_slug_from_name;
        # importing web.api.config here would initialize mutable parent caches.
        import re
        for row in configuration.get("custom_providers", []) if isinstance(configuration.get("custom_providers"), list) else []:
            if not isinstance(row, dict):
                continue
            name = str(row.get("name") or "").strip().lower()
            slug = name if name.startswith("custom:") else "custom:" + re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9._-]+", "-", name).strip("-"))
            if slug == provider:
                rows.append(row)
    matches = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        models = row.get("models") or {}
        entry = models.get(model) if isinstance(models, dict) else None
        if isinstance(entry, dict) and known(entry.get("context_length")):
            matches.append(entry["context_length"])
        elif row.get("model") == model and known(row.get("context_length")):
            matches.append(row["context_length"])
    return matches[0] if len(matches) == 1 else None


def provider_selection(resolved, *, space_config=None) -> tuple[ProviderSelection | None, str]:
    """Read a bound Home and native Space; no environment/provider mutation."""
    from .runner import provider_configuration_digest
    path = resolved.profile_home / "config.yaml"
    config = yaml.safe_load(path.read_text(encoding="utf-8")) if path.is_file() else {}
    if not isinstance(config, dict):
        raise ScopeError("Provider configuration is malformed")
    home_model = config.get("model") if isinstance(config.get("model"), dict) else {}
    space_model = (space_config if space_config is not None else resolved.space.load_config()).get("model") or {}
    model = str(space_model.get("model") or space_model.get("default") or home_model.get("default") or "").strip()
    provider = str((space_model.get("provider") or "") if space_model.get("model")
                   else space_model.get("provider") or home_model.get("provider") or "").strip()
    digest = provider_configuration_digest(resolved.profile_home)
    if not model:
        return None, digest
    return ProviderSelection(provider_config_ref=digest, model=model, provider=provider,
                             context_length=configured_context_length(config, model, provider, space_model=space_model)), digest
