#!/usr/bin/env python3
"""Create a source-bound dependency metadata snapshot for the license draft."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from typing import Any

PYTHON_METADATA_SCRIPT = r'''import importlib.metadata as metadata, json
rows = []
for dist in metadata.distributions():
    md = dist.metadata
    rows.append({
        "name": md.get("Name") or "UNKNOWN",
        "version": dist.version,
        "license_expression": md.get("License-Expression"),
        "license_metadata": md.get("License"),
        "project_urls": md.get_all("Project-URL") or [],
    })
print(json.dumps(rows, ensure_ascii=False))'''


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def package_name(lock_path: str) -> str:
    node_modules = "node_modules/"
    if node_modules not in lock_path:
        return lock_path
    suffix = lock_path.rsplit(node_modules, 1)[-1]
    parts = suffix.split("/")
    return "/".join(parts[:2]) if parts and parts[0].startswith("@") else parts[0]


def python_pins(path: Path) -> list[dict[str, str]]:
    pins = []
    pattern = re.compile(r"^([A-Za-z0-9_.-]+)(?:\[[^]]+\])?==([^;\s]+)")
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        match = pattern.match(line)
        if match:
            pins.append({"name": match.group(1), "version": match.group(2)})
    return pins


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, required=True)
    parser.add_argument("--python-runtime", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = args.repo_root.resolve()

    lock_path = root / "package-lock.json"
    pyproject_path = root / "services/sidekick/pyproject.toml"
    requirements_path = root / "apps/desktop/scripts/requirements-runtime.txt"
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    npm_rows: list[dict[str, Any]] = []
    for path, record in lock.get("packages", {}).items():
        if not path:
            continue
        npm_rows.append({
            "name": record.get("name") or package_name(path),
            "version": record.get("version") or "UNKNOWN",
            "license_metadata": record.get("license") or "UNKNOWN",
            "resolved": record.get("resolved") or "WORKSPACE_OR_UNKNOWN",
            "integrity": record.get("integrity") or None,
            "lock_path": path,
            "scope": "workspace" if "node_modules/" not in path or (record.get("name") or package_name(path)) == "@lastbrowser/desktop" else "third_party",
        })
    npm_rows.sort(key=lambda row: (row["name"].lower(), row["version"], row["lock_path"]))

    command = [str(args.python_runtime.resolve()), "-c", PYTHON_METADATA_SCRIPT]
    process = subprocess.run(command, check=True, capture_output=True, text=True)
    installed = json.loads(process.stdout)
    runtime_by_name = {row["name"].lower().replace("_", "-"): row for row in installed}
    pins = python_pins(requirements_path)
    python_rows = []
    for pin in pins:
        key = pin["name"].lower().replace("_", "-")
        row = runtime_by_name.get(key)
        python_rows.append({
            **pin,
            "installed_version": row["version"] if row else "NOT_INSTALLED",
            "license_expression_metadata": row.get("license_expression") if row else None,
            "license_metadata": row.get("license_metadata") if row else None,
            "project_urls": row.get("project_urls", []) if row else [],
            "evidence": "requirements-runtime.txt pin + importlib.metadata in supplied interpreter",
        })
    python_rows.sort(key=lambda row: row["name"].lower())

    unknown_npm = [row for row in npm_rows if row["license_metadata"] == "UNKNOWN"]
    unknown_python = [row for row in python_rows if not (row["license_expression_metadata"] or row["license_metadata"])]
    mismatched_python = [row for row in python_rows if row["installed_version"] != row["version"]]
    snapshot = {
        "schema_version": 1,
        "snapshot_date": "2026-10-11",
        "source_commit": subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, check=True, capture_output=True, text=True).stdout.strip(),
        "purpose": "Draft inventory of package-lock and pinned desktop Python runtime metadata; metadata is not a legal license-text verification or rights-chain finding.",
        "inputs": {
            "package_lock": {"path": "package-lock.json", "sha256": sha256(lock_path), "lockfile_version": lock.get("lockfileVersion")},
            "python_runtime_requirements": {"path": "apps/desktop/scripts/requirements-runtime.txt", "sha256": sha256(requirements_path)},
            "sidekick_pyproject": {"path": "services/sidekick/pyproject.toml", "sha256": sha256(pyproject_path)},
            "python_executable": {"path": str(args.python_runtime.resolve()), "sha256": sha256(args.python_runtime.resolve())},
        },
        "counts": {
            "npm_lock_entries": len(npm_rows),
            "npm_third_party_entries": sum(row["scope"] == "third_party" for row in npm_rows),
            "npm_workspace_entries": sum(row["scope"] == "workspace" for row in npm_rows),
            "npm_unknown_third_party_license_metadata": sum(row["license_metadata"] == "UNKNOWN" and row["scope"] == "third_party" for row in npm_rows),
            "npm_unknown_workspace_license_metadata": sum(row["license_metadata"] == "UNKNOWN" and row["scope"] == "workspace" for row in npm_rows),
            "python_pinned_runtime_entries": len(python_rows),
            "python_missing_or_mismatched_pins": len(mismatched_python),
            "python_unknown_license_metadata": len(unknown_python),
        },
        "npm_packages": npm_rows,
        "python_runtime_packages": python_rows,
        "unresolved_review_items": [
            {"name": "mcp", "reported_version": "1.26.0", "status": "not found in this source lock, pyproject, pinned runtime requirements, or supplied runtime metadata", "license": "UNKNOWN", "origin": "UNKNOWN", "action": "confirm whether this is a shipped dependency and provide source evidence before any compatibility conclusion"},
            {"name": "services/sidekick inherited code", "status": "upstream/fork rights chain not established by Git authorship or the local MIT file alone", "action": "obtain provenance and rights evidence; do not claim commercial relicensing rights until reviewed"},
            {"name": "services/sidekick/tools/neutts_samples/jo.wav", "status": "origin and license evidence absent", "license": "UNKNOWN", "action": "keep unknown until source/license evidence is recorded"},
        ],
        "limitations": [
            "npm license values are package-lock metadata, not inspected license texts; each non-project package still needs notice and obligation review.",
            "Python rows cover the exact pinned desktop runtime requirements and metadata reported by the supplied interpreter; pyproject optional groups and any non-runtime development environment are not claimed complete by this snapshot.",
            "This inventory makes no GPL compatibility, copyright ownership, CLA sufficiency, or dual-licensing determination.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(snapshot["counts"], sort_keys=True))


if __name__ == "__main__":
    main()

