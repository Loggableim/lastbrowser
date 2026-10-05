"""Retire a known native workspace before removing its UI registry entry.

No directory, transcript or cookie deletion is implied. A failed cleanup keeps
the registry entry available for an exact retry, with authority already revoked.
"""
from __future__ import annotations

import os
import sqlite3
from contextlib import closing
from pathlib import Path

from .contracts import Scope
from .scope import ScopeError, ScopeResolver, canonical_path
from .store import ResourceBusy


def _locator(value: str) -> str:
    return os.path.normcase(str(canonical_path(value, must_exist=False)))


def legacy_removal_requires_scope(home: Path, workspace: str) -> bool:
    """Read existing bindings without minting a backend or Space identity."""
    database = Path(home) / "state.db"
    if not database.is_file():
        return False
    with closing(sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True)) as db:
        present = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ia_space_bindings'").fetchone()
        if not present:
            return False
        rows = db.execute("SELECT workspace_locator, partition_key FROM ia_space_bindings").fetchall()
    target = _locator(workspace)
    return any(path and not partition.startswith("persist:space_home_") and _locator(path) == target
               for path, partition in rows)


def retire_workspace(*, profile_hub, actor: str, raw_scope, workspace: str, service_pair):
    scope = Scope.model_validate(raw_scope)
    store = profile_hub.get(actor)
    resolver = ScopeResolver(store, profiles_provider=profile_hub.profiles)
    resolver.resolve_profile(scope.backend_profile_id, authenticated_profile_name=actor)
    binding = store.get_binding(scope)
    target = _locator(workspace)
    if binding is None or not binding.workspace_locator or _locator(binding.workspace_locator) != target or binding.partition_key.startswith("persist:space_home_"):
        raise ScopeError("Workspace removal does not match its saved native binding")
    # One registry workspace can have several browser-profile bindings. Each
    # owns a lease; retiring only the visible profile would leave hidden runs.
    targets = tuple(row for row in store.list_bindings(include_tombstoned=True)
                    if not row.partition_key.startswith("persist:space_home_")
                    and (row.scope.space_id == scope.space_id or row.workspace_locator and _locator(row.workspace_locator) == target))
    for row in targets:
        if row.tombstoned_at is None:
            resolver.resolve(row.scope, authenticated_profile_name=actor)
    manager, assistant = service_pair(store, resolver)
    receipts = []
    for row in targets:
        assistant.cancel_scope(row.scope)
        receipt = manager.retire_scope(row.scope, expected_revision=row.revision)
        assistant.cancel_scope(row.scope)
        receipts.append(receipt)
    if any(not receipt["acknowledged"] for receipt in receipts):
        raise ResourceBusy("Workspace authority retired; browser cleanup awaits acknowledgement. Retry removal.")
    return tuple(receipts)
