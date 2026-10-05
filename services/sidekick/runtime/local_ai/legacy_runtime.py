"""Read-only projection of the existing onboarding runtime-lock, not a second packager."""
from __future__ import annotations
import hashlib
import json
import re
import zipfile
from pathlib import Path
from .runtime_probe import hash_contained_file


def inspect_existing_runtime_lock(vendor_root: Path) -> dict:
    """Trusted host supplies the existing vendor directory; no extraction/execution.

    Preserve the existing release/archive/file pins. Report missing provenance
    separately instead of inventing a new build or silently accepting capabilities.
    """
    lock_path = vendor_root / 'runtime-lock.json'
    if lock_path.stat().st_size > 2097152: raise ValueError('runtime_lock_size_rejected')
    lock = json.loads(lock_path.read_text(encoding='utf-8'))
    if lock.get('platform') != 'win32' or lock.get('arch') != 'x64' or not isinstance(lock.get('assets'), list):
        raise ValueError('runtime_lock_platform_invalid')
    assets = []
    for item in lock['assets']:
        if item.get('backend') not in ('cpu', 'vulkan') or not isinstance(item.get('files'), list): raise ValueError('runtime_lock_backend_invalid')
        archive_name = item.get('archive', '')
        if Path(archive_name).name != archive_name or not re.fullmatch(r'[a-zA-Z0-9_.-]+\.zip', archive_name): raise ValueError('runtime_lock_archive_path_invalid')
        archive = vendor_root / archive_name; size = archive.stat().st_size
        if size > 268435456: raise ValueError('runtime_archive_budget_exceeded')
        actual_size, archive_hash = hash_contained_file(vendor_root, archive_name, size)
        if archive_hash != item.get('sha256'): raise ValueError('runtime_archive_hash_changed')
        facts = []
        with zipfile.ZipFile(archive) as bundle:
            entries = {entry.filename: entry for entry in bundle.infolist()}
            for file in item['files']:
                name = file.get('path', '')
                if any(part in ('', '.', '..') for part in name.replace('\\', '/').split('/')) or ':' in name or name not in entries:
                    raise ValueError('runtime_lock_file_path_invalid')
                expected = file.get('sha256', '')
                if not re.fullmatch(r'[0-9a-f]{64}', expected): raise ValueError('runtime_lock_file_hash_invalid')
                entry = entries[name]
                if not 0 < entry.file_size <= 2147483648: raise ValueError('runtime_lock_file_size_invalid')
                try:
                    bytes_seen, digest = hash_contained_file(vendor_root, item['backend'] + '/' + name, entry.file_size)
                    status = 'verified' if bytes_seen == entry.file_size and digest == expected else 'changed'
                except FileNotFoundError: status = 'missing'
                facts.append({'relativePath': item['backend'] + '/' + name, 'bytes': entry.file_size, 'sha256': expected, 'status': status})
        assets.append({'backend': item['backend'], 'archive': archive_name, 'archiveBytes': actual_size,
            'archiveSha256': archive_hash, 'files': facts, 'integrityVerified': all(file['status'] == 'verified' for file in facts)})
    licenses = []
    for name in ('LICENSE-llama.cpp', 'LICENSE-LFM', 'LICENSE-Qwen'):
        path = vendor_root / name
        if path.is_file():
            size, digest = hash_contained_file(vendor_root, name, path.stat().st_size)
            licenses.append({'relativePath': name, 'bytes': size, 'sha256': digest})
    return {'version': lock.get('version'), 'platform': lock['platform'], 'arch': lock['arch'], 'assets': assets,
        'licenses': licenses, 'operationVerified': False, 'sourceRevision': None,
        'missingInputs': ['exact-source-revision', 'runtime-license-closure-review', 'actual-role-operation-proof',
            'actual-context-and-process-memory-budget'], 'redistributionApproved': False}
