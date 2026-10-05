"""Sanitized, isolated reproduction of the 2026-10-05 test-profile scope bind.

Run only with the named disposable UI test profile present. Copies only the
workspace locator, filtered workspace setting, native Space YAML metadata and
the backend profile identity; it never copies credentials or profile state.
"""
from __future__ import annotations

import json
import os
import sqlite3
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
import yaml


ROOT = Path(__file__).resolve().parents[3]
PROFILE = ROOT / "output" / "root-host-ui-unrestricted-20261005"
SOURCE_RUNTIME = PROFILE / "user-data" / "runtime"
WORKSPACE = PROFILE / "user-home" / "workspace"
PARTITION_SOURCE = ROOT / "apps" / "desktop" / "src" / "main" / "space-partition.ts"


def _partition(browser_profile: str, workspace: str, known_paths: list[str]) -> str:
    script = (
        "import { pathToFileURL } from 'node:url';"
        "const m=await import(pathToFileURL(process.argv[1]));"
        "console.log(m.computeSpacePartition(process.argv[2],process.argv[3],false,JSON.parse(process.argv[4])));"
    )
    return subprocess.check_output(
        ["node", "--experimental-strip-types", "--input-type=module", "-e", script,
         str(PARTITION_SOURCE), browser_profile, workspace, json.dumps(known_paths)],
        cwd=ROOT, text=True, encoding="utf-8", timeout=10,
    ).strip()


def _safe_reason(error: BaseException) -> str:
    message = str(error).lower()
    categories = (
        ("workspace is not uniquely registered", "workspace_not_registered"),
        ("workspace is not registered", "workspace_not_registered"),
        ("workspace is not available", "workspace_unavailable"),
        ("existing default workspace", "default_workspace_missing"),
        ("historical partition", "partition_mismatch"),
        ("home partition", "partition_mismatch"),
        ("unknown space identity", "unknown_native_space_identity"),
        ("native space identity", "final_scope_resolution"),
        ("space locator", "final_scope_resolution"),
        ("profile does not own", "profile_ownership"),
        ("backend profile", "backend_profile_context"),
    )
    return next((category for needle, category in categories if needle in message), "scope_error_other")


def _copy_minimal_profile(source: Path, destination: Path, workspace: Path) -> str:
    """Copy only the fields ProfileHub uses; omit all auth/config/credential data."""
    source_db = source / "state.db"
    if not source_db.is_file():
        pytest.skip("test-profile independent state DB is absent")
    with sqlite3.connect(f"file:{source_db.as_posix()}?mode=ro", uri=True) as db:
        tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "ia_profile_refs" not in tables:
            pytest.skip("test-profile has no independent profile identity")
        refs = db.execute("SELECT backend_profile_id,name,status,canonical_home FROM ia_profile_refs").fetchall()
        binding_count = (db.execute("SELECT COUNT(*) FROM ia_space_bindings").fetchone()[0]
                         if "ia_space_bindings" in tables else 0)
    if (len(refs) != 1 or refs[0][1:3] != ("default", "active")
            or os.path.normcase(os.path.realpath(refs[0][3])) != os.path.normcase(os.path.realpath(source))
            or binding_count != 0):
        pytest.skip("test-profile profile identity is not the expected single active default")
    profile_id = refs[0][0]

    destination.mkdir(parents=True)
    (destination / "webui").mkdir()
    (destination / "webui" / "settings.json").write_text(
        json.dumps({"default_workspace": str(workspace)}), encoding="utf-8"
    )

    # Only the resolver's nonsecret locator fields are used; no other Space
    # config values, memory, sessions, prompts or credentials leave the source.
    for dirname in ("spaces", "workspaces"):
        source_root = source / dirname
        if not source_root.is_dir():
            continue
        target_root = destination / dirname
        for candidate in source_root.iterdir():
            config = candidate / "space.yaml"
            if candidate.is_dir() and config.is_file():
                target = target_root / candidate.name
                target.mkdir(parents=True, exist_ok=True)
                try:
                    values = yaml.safe_load(config.read_text(encoding="utf-8"))
                except (OSError, yaml.YAMLError):
                    continue
                if not isinstance(values, dict):
                    continue
                locator = {key: values[key] for key in
                           ("space_id", "project_dir", "lastbrowser_browser_home", "name")
                           if isinstance(values.get(key), (str, bool))}
                (target / "space.yaml").write_text(yaml.safe_dump(locator), encoding="utf-8")

    # Create a fresh isolated store with the observed profile identity and a
    # relocated canonical Home; never copy state.db, WALs, chats or tokens.
    from runtime.independent.contracts import BackendProfileRef
    from runtime.independent.store import IndependentStore

    store = IndependentStore(destination, profile_id)
    try:
        store.register_profile(BackendProfileRef(
            backend_profile_id=profile_id, name="default", canonical_home=str(destination)
        ))
    finally:
        store.close()
    return profile_id


@pytest.mark.skipif(not SOURCE_RUNTIME.is_dir() or not WORKSPACE.is_dir(),
                    reason="authorized disposable UI test profile is not present")
def test_root_security_reproduces_or_clears_test_profile_resolve_scope_403(tmp_path):
    from runtime.independent.scope_binding import ProfileHub

    _copy_minimal_profile(SOURCE_RUNTIME, tmp_path / "runtime", WORKSPACE)
    profile_home = tmp_path / "runtime"
    webui_state = profile_home / "webui"
    hub = ProfileHub(profile_home, default_state_dir=webui_state,
                     default_workspace_hint=WORKSPACE)
    try:
        known_paths = [row["path"] for row in hub.workspace_rows("default")]
        partition = _partition("default", str(WORKSPACE), known_paths)
        try:
            payload = {
                "workspacePath": str(WORKSPACE),
                "browserProfileId": "default",
                "partitionKey": partition,
                "backendProfileName": "default",
            }
            # The observed UI made two overlapping resolveScope requests.
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: hub.bind("default", payload), range(2)))
            resolved = results[0]
            assert results[1]["scope"] == resolved["scope"]
            from runtime.independent.contracts import Scope
            hub.by_scope(Scope.model_validate(resolved["scope"]), "default")
        except (PermissionError, OSError, ValueError) as error:
            reason = _safe_reason(error)
            print(f"scope_error_code=scope_mismatch sanitized_reason={reason} knownSpacePaths={json.dumps(known_paths)}")
            pytest.fail("isolated ProfileHub bind failed; see sanitized result above")
        print(f"scope_error_code=none sanitized_reason=bind_and_final_resolver_passed knownSpacePaths={json.dumps(known_paths)}")
        assert resolved["workspacePath"] == str(WORKSPACE)
    finally:
        hub.close()
