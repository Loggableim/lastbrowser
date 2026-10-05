"""Own ephemeral staging of existing local pins; no download/install/model load."""
import shutil
import uuid
from pathlib import Path
from .runtime_bundle import existing_cpu_manifest
from .runtime_probe import inspect_runtime_build
from runtime.independent.contracts import utc_now

def probe_existing_cpu(vendor_root, scope, *, staging_parent):
    vendor_root = Path(vendor_root).resolve()
    manifest = existing_cpu_manifest(vendor_root)
    staging_parent = Path(staging_parent).resolve()
    staging_parent.mkdir(parents=True, exist_ok=True)
    root = staging_parent / ('lastbrowser-owned-native-probe-' + uuid.uuid4().hex)
    root.mkdir()
    try:
        destination = root / manifest.package_relative_dir
        destination.mkdir(parents=True)
        for file in manifest.files:
            source = vendor_root / ('LICENSE-llama.cpp' if file.relative_path == 'LICENSE-llama.cpp' else 'cpu/' + file.relative_path)
            shutil.copyfile(source, destination / file.relative_path)
        proof = inspect_runtime_build(root, manifest, scope, utc_now(), run_preflight=True, timeout=3)
        return manifest, proof
    finally:
        if root.resolve() != root or not root.is_relative_to(staging_parent): raise ValueError('native_staging_cleanup_rejected')
        shutil.rmtree(root)
