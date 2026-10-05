"""Private manifest projection over the existing pinned release, no packager."""
import hashlib
from pathlib import Path
from .legacy_runtime import inspect_existing_runtime_lock
from .runtime_probe import RuntimeBuildManifest, RuntimeBuildFile

SOURCE_REVISION = '9bf55f4a3677af697d914d959eaa70f93cfdc494'

def private_cpu_manifest():
    return RuntimeBuildManifest.model_validate_json((Path(__file__).parent/'manifests/b11377-cpu.json').read_text(encoding='utf-8'))

def existing_cpu_manifest(vendor_root: Path):
    inventory = inspect_existing_runtime_lock(vendor_root)
    if inventory['version'] != 'b11377': raise ValueError('runtime_release_pin_changed')
    cpu = next(item for item in inventory['assets'] if item['backend'] == 'cpu')
    if not cpu['integrityVerified']: raise ValueError('runtime_existing_asset_integrity_failed')
    files = []
    for fact in cpu['files']:
        name = fact['relativePath'].removeprefix('cpu/')
        if name == 'llama-server.exe' or name.lower().endswith('.dll') or name.startswith('LICENSE'):
            files.append(RuntimeBuildFile(relative_path=name, bytes=fact['bytes'], sha256=fact['sha256'],
                kind='binary' if name == 'llama-server.exe' else 'library' if name.lower().endswith('.dll') else 'license'))
    license_path = vendor_root / 'LICENSE-llama.cpp'
    license_bytes = license_path.read_bytes()
    files.append(RuntimeBuildFile(relative_path='LICENSE-llama.cpp', bytes=len(license_bytes), sha256=hashlib.sha256(license_bytes).hexdigest(), kind='license'))
    return RuntimeBuildManifest(build_ref='llama-cpp-b11377-win-cpu-x64', source_revision=SOURCE_REVISION,
        package_relative_dir='apps/desktop/runtime/local-ai/b11377-cpu', os='win32', arch='x64', declared_backends=('cpu',),
        files=tuple(files), version_output_marker='11377', help_output_marker='--ctx-size',
        license_source='https://github.com/ggml-org/llama.cpp/blob/' + SOURCE_REVISION + '/LICENSE',
        redistribution_review_ref='b11377-inventory-only-license-closure-pending')
