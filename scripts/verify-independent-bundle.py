"""Verify independent-agent modules in an unpacked Lastbrowser resource tree.

This verifier is deliberately artifact-only: it neither starts a Sidekick server
nor contacts a provider.  Give it ``win-unpacked/resources`` after an offline
``electron-builder --dir`` probe.  It verifies the exact in-tree module paths,
compares their hashes to the source snapshot used for the probe, and imports
them with the packaged Python in isolated mode.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


MODULE_PATHS = (
    "runtime/chat_modes.py",
    "runtime/independent/__init__.py",
    "runtime/independent/manager.py",
    "runtime/independent/child_runtime.py",
    "web/api/chat_modes.py",
    "web/api/child_streams.py",
    "runtime/independent/native_chat_protocol.py", "runtime/independent/native_chat_host.py", "runtime/independent/native_chat_worker.py", "runtime/independent/native_chat_policy.py", "runtime/independent/native_chat_auto.py", "runtime/independent/native_tool_paths.py", "runtime/independent/model_policy_session.py", "runtime/independent/grill.py",
    "runtime/local_ai/__init__.py", "runtime/local_ai/contracts.py", "runtime/local_ai/registry.py", "runtime/local_ai/setup.py", "runtime/local_ai/installer.py", "runtime/local_ai/runtime_probe.py", "runtime/local_ai/resources.py", "runtime/local_ai/model_manager.py", "runtime/local_ai/role_adapters.py", "runtime/local_ai/benchmark.py", "runtime/local_ai/legacy_runtime.py",
    "web/api/native_chats.py", "web/api/model_policy.py", "web/api/local_ai.py", "web/api/local_ai_setup.py", "web/api/grill.py", "web/api/models.py", "web/api/routes.py", "web/api/streaming.py",
    "runtime/independent/native_chat_nova.py", "runtime/independent/native_provider_capture.py", "runtime/independent/native_sdk_contracts.py", "runtime/independent/native_sdk_broker.py", "runtime/bootstrap.py", "runtime/model_recovery.py", "runtime/runtime_bundle.py", "runtime/native_stage.py", "runtime/native_dependencies.py", "web/api/local_ai_runtime.py",
)
IMPORTS = (
    "runtime.chat_modes",
    "runtime.independent.manager",
    "runtime.independent.child_runtime",
    "web.api.chat_modes",
    "web.api.child_streams",
    "runtime.independent.native_chat_protocol", "runtime.independent.native_chat_host", "runtime.independent.native_chat_auto", "runtime.local_ai", "runtime.local_ai.contracts", "runtime.local_ai.registry", "runtime.local_ai.setup", "runtime.local_ai.installer", "web.api.native_chats", "web.api.local_ai", "web.api.local_ai_setup", "web.api.models",
    "runtime.independent.native_chat_nova", "runtime.independent.native_provider_capture", "runtime.independent.native_sdk_contracts", "runtime.independent.native_sdk_broker", "runtime.bootstrap", "runtime.model_recovery", "runtime.runtime_bundle", "runtime.native_stage", "runtime.native_dependencies", "web.api.local_ai_runtime",
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sidekick_root(resources: Path) -> Path:
    return resources / "services" / "sidekick"


def module_snapshot(root: Path) -> dict[str, str]:
    missing = [relative for relative in MODULE_PATHS if not (root / relative).is_file()]
    if missing:
        raise FileNotFoundError("Missing independent-agent files: " + ", ".join(missing))
    return {relative: sha256(root / relative) for relative in MODULE_PATHS}


def packaged_inventory(resources: Path) -> dict[str, Any]:
    """Return names only; never read credential or database contents."""
    services = resources / "services"
    files = [path for path in services.rglob("*") if path.is_file()]
    relative = lambda path: path.relative_to(services).as_posix()
    tests = [relative(path) for path in files if "test" in path.name.lower() or "/tests/" in f"/{relative(path)}"]
    databases = [relative(path) for path in files if path.suffix.lower() in {".db", ".db-shm", ".db-wal"}]
    credentials = [relative(path) for path in files if path.name.lower() in {"auth.json", "config.yaml"}]
    return {"file_count": len(files), "test_count": len(tests), "tests": tests, "database_count": len(databases), "databases": databases, "credential_config_count": len(credentials), "credential_config_paths": credentials}


def import_with_packaged_python(resources: Path) -> dict[str, Any]:
    python = resources / "runtime" / "python" / "python.exe"
    app_root = sidekick_root(resources)
    if not python.is_file():
        raise FileNotFoundError(f"Bundled Python is missing: {python}")
    if not app_root.is_dir():
        raise FileNotFoundError(f"Bundled Sidekick tree is missing: {app_root}")

    code = "\n".join((
        "import json, sqlite3, sys",
        "from pathlib import Path",
        f"sys.path.insert(0, {str(app_root)!r})",
        f"bundled_runtime = Path({str(resources / 'runtime' / 'python')!r}).resolve()",
        "import pydantic",
        *(f"import {module}" for module in IMPORTS),
        "print(json.dumps({'python': sys.version.split()[0], 'sqlite': sqlite3.sqlite_version, "
        "'pydantic': pydantic.__version__, 'imports': 'ok', "
        "'external_site_packages': any('site-packages' in entry.lower() and "
        "not str(Path(entry).resolve()).lower().startswith(str(bundled_runtime).lower()) "
        "for entry in sys.path)}))",
    ))
    completed = subprocess.run(
        [str(python), "-I", "-c", code],
        cwd=app_root,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode:
        raise RuntimeError(
            f"Bundled isolated import failed (exit {completed.returncode}):\n{completed.stderr.strip()}"
        )
    try:
        result = json.loads(completed.stdout.strip())
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Bundled import did not emit JSON: {completed.stdout!r}") from error
    if result.get("external_site_packages"):
        raise RuntimeError("Bundled import observed an external site-packages path")
    return result


def verify(resources: Path, source_services: Path) -> dict[str, Any]:
    resources = resources.resolve()
    source_services = source_services.resolve()
    source_sidekick = source_services / "sidekick"
    manifest = resources / "services" / "sidekick-source.json"
    if not manifest.is_file():
        raise FileNotFoundError(f"Bundled manifest is missing: {manifest}")
    source_hashes = module_snapshot(source_sidekick)
    bundled_hashes = module_snapshot(sidekick_root(resources))
    mismatches = [path for path in MODULE_PATHS if source_hashes[path] != bundled_hashes[path]]
    if mismatches:
        raise RuntimeError("Bundled module hash mismatch: " + ", ".join(mismatches))
    return {
        "resources": str(resources),
        "manifest": str(manifest),
        "source_hashes": source_hashes,
        "bundled_hashes": bundled_hashes,
        "inventory": packaged_inventory(resources),
        "isolated_import": import_with_packaged_python(resources),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resources", type=Path, required=True, help="Path to win-unpacked/resources")
    parser.add_argument("--source-services", type=Path, default=Path(__file__).resolve().parents[1] / "services")
    parser.add_argument("--report", type=Path, required=True, help="New JSON report path")
    args = parser.parse_args()
    report: dict[str, Any] = {"ok": False, "resources": str(args.resources)}
    try:
        report.update(verify(args.resources, args.source_services))
        report["ok"] = True
    except Exception as error:  # Report failures for the offline packaging handoff.
        report["error"] = str(error)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
