"""Pinned official engine acquisition and allowlisted ZIP extraction."""
from __future__ import annotations

import os
import stat
import uuid
import zipfile
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from .installer import LocalAiInstaller, _cache_directory, _open_file, _verified, InstallCancelled
from .runtime_probe import hash_contained_file

# Microsoft Visual Studio 2022 VC143 CRT x64, version 14.44.35211.
# The VSIX hash is published in Microsoft's Visual Studio release manifest.
_WINDOWS_CRT_ARCHIVE = SimpleNamespace(
    relative_path='microsoft-vc143-crt-14.44.35211.vsix', bytes=3224191,
    sha256='4aaf54db0bfc9435f7c3660e1a00237a4b556042bfeea64bde44c2e0194e6ee5',
    source_url='https://download.visualstudio.microsoft.com/download/pr/45d3b8dd-bced-4b37-9974-142f748d710c/4aaf54db0bfc9435f7c3660e1a00237a4b556042bfeea64bde44c2e0194e6ee5/Microsoft.VC.14.44.17.14.CRT.Redist.X64.base.vsix')
_CRT_PREFIX = 'Contents/VC/Redist/MSVC/14.44.35112/x64/Microsoft.VC143.CRT/'
_WINDOWS_CRT_FILES = tuple((_CRT_PREFIX + name, SimpleNamespace(relative_path=name, bytes=size, sha256=digest)) for name, size, digest in (
    ('msvcp140.dll', 557728, '0f885b509a685d2bbfa652fed26b5fb31d88fbdab0a978c641d1c7b8aa460aa9'),
    ('vcruntime140.dll', 124544, 'd5e4d9a3e835fa679450145d6a7d94e36573a509317111904d9b3712c30d9066'),
    ('vcruntime140_1.dll', 49792, '1f2d41c4aa5db0bc33ebf7b66d72943a817d7ce6cbe880502a9403823633093f'),
))
_WINDOWS_CRT_CODEC = (_CRT_PREFIX + 'msvcp140_codecvt_ids.dll', SimpleNamespace(
    relative_path='msvcp140_codecvt_ids.dll', bytes=31872,
    sha256='f2069a52880ec885ee7f0511186100eb7fada0411a2b4948fafea7735b878a18'))


def _crt_files(engine):
    return _WINDOWS_CRT_FILES + ((_WINDOWS_CRT_CODEC,) if engine.get('engine') == 'stable-diffusion.cpp' else ())


def _official_url(url):
    if not isinstance(url, str) or url != url.strip() or any(ord(char) < 32 or ord(char) == 127 for char in url):
        raise ValueError('engine_download_origin_rejected')
    if url == _WINDOWS_CRT_ARCHIVE.source_url:
        return
    parsed = urlsplit(url)
    if (parsed.scheme != 'https' or parsed.hostname not in {'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'raw.githubusercontent.com'}
            or parsed.port not in (None, 443) or parsed.username or parsed.password or parsed.fragment):
        raise ValueError('engine_download_origin_rejected')


class EngineTransport:
    @contextmanager
    def open(self, url, offset):
        _official_url(url)
        class Redirects(HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                _official_url(newurl)
                return super().redirect_request(req, fp, code, msg, headers, newurl)
        headers = {'Accept-Encoding': 'identity', 'User-Agent': 'Lastbrowser-pinned-engine-installer/1'}
        if offset:
            headers['Range'] = f'bytes={offset}-'
        with build_opener(ProxyHandler({}), Redirects()).open(Request(url, headers=headers), timeout=20) as response:
            _official_url(response.geturl())
            yield response


def verify_engine(directory, engine, *, require_crt=False):
    manifest = engine['manifestObject']
    for fact in manifest.files:
        if hash_contained_file(directory, fact.relative_path, fact.bytes) != (fact.bytes, fact.sha256):
            raise ValueError('runtime_integrity_failed')
    if require_crt and getattr(manifest, 'os', None) == 'win32':
        for _, fact in _crt_files(engine):
            if not (directory / fact.relative_path).exists():
                raise ValueError('runtime_crt_missing')
            if hash_contained_file(directory, fact.relative_path, fact.bytes) != (fact.bytes, fact.sha256):
                raise ValueError('runtime_integrity_failed')
    binary = next(fact for fact in manifest.files if fact.kind == 'binary')
    return directory / binary.relative_path


def engine_directory(root, repository, engine):
    packaged = Path(repository) / engine['manifestObject'].package_relative_dir
    if packaged.is_dir():
        verify_engine(packaged, engine)
        return packaged
    cached = Path(root) / 'engines' / engine['id']
    if cached.is_dir() and (cached / '.inventory-verified').is_file():
        verify_engine(cached, engine, require_crt=True)
        return cached
    raise ValueError('pinned_runtime_unavailable')


def prepare_engine(root, repository, engine, cancel, progress):
    try:
        return engine_directory(root, repository, engine)
    except (OSError, ValueError) as exc:
        # A changed package or cache is rejected; only absent CRT files are added.
        if str(exc) == 'runtime_crt_missing':
            with _cache_directory(Path(root), ('engines', engine['id'])) as destination:
                _prepare_windows_crt(root, engine, destination, cancel, progress)
                verify_engine(destination, engine, require_crt=True)
                return destination
        if str(exc) != 'pinned_runtime_unavailable':
            raise
    archive = engine['archiveObject']
    installer = LocalAiInstaller(None, None, transport=EngineTransport())
    with _cache_directory(Path(root), ('engine-staging', engine['id'])) as stage:
        partial = stage / archive.relative_path
        installer._download(archive, partial, cancel, progress, lambda: None, source_validator=_official_url)
        with _open_file(partial) as stream:
            _verified(stream, archive, cancel)
        supplemental={fact.relative_path:fact for fact in engine.get('supplementalObjects',())}
        files = {fact.relative_path: fact for fact in engine['manifestObject'].files if fact.relative_path not in supplemental}
        with _open_file(partial) as stream, zipfile.ZipFile(stream) as package:
            members = {}
            total = 0
            for item in package.infolist():
                name = item.filename
                parts = name.replace('\\', '/').rstrip('/').split('/')
                if (name.startswith(('/', '\\')) or ':' in name or '\\' in name
                        or any(part in ('', '.', '..') for part in parts)
                        or stat.S_ISLNK(item.external_attr >> 16)):
                    raise ValueError('engine_archive_path_rejected')
                if not item.is_dir():
                    if name in members:
                        raise ValueError('engine_archive_duplicate_file')
                    members[name] = item
                    total += item.file_size
            if total > 4 * 1024**3 or not set(files) <= set(members):
                raise ValueError('engine_archive_inventory_incomplete')
            with _cache_directory(Path(root), ('engines', engine['id'])) as destination:
                for name, fact in files.items():
                    if cancel.is_set():
                        raise InstallCancelled()
                    member = members[name]
                    if member.file_size != fact.bytes:
                        raise ValueError('engine_archive_file_size_mismatch')
                    with _cache_directory(destination, tuple(Path(name).parts[:-1])) as parent:
                        target = parent / Path(name).name
                        if target.exists():
                            if hash_contained_file(destination, name, fact.bytes) != (fact.bytes, fact.sha256):
                                raise ValueError('runtime_integrity_failed')
                            continue
                        temporary = parent / ('.engine-' + uuid.uuid4().hex + '.partial')
                        try:
                            with package.open(member) as source, _open_file(temporary, create=True) as output:
                                while chunk := source.read(256 * 1024):
                                    if cancel.is_set():
                                        raise InstallCancelled()
                                    output.write(chunk)
                                output.flush(); os.fsync(output.fileno())
                            if hash_contained_file(parent, temporary.name, fact.bytes) != (fact.bytes, fact.sha256):
                                raise ValueError('engine_archive_file_digest_mismatch')
                            if target.exists() or target.is_symlink():
                                raise ValueError('engine_destination_appeared')
                            os.replace(temporary, target)
                        finally:
                            temporary.unlink(missing_ok=True)
                for name,fact in supplemental.items():
                    with _cache_directory(destination,tuple(Path(name).parts[:-1])) as parent:
                        target=parent/Path(name).name
                        if target.exists():
                            if hash_contained_file(destination,name,fact.bytes)!=(fact.bytes,fact.sha256):raise ValueError('runtime_integrity_failed')
                            continue
                        temporary=target.with_name(target.name+'.partial')
                        installer._download(fact,temporary,cancel,progress,lambda:None,source_validator=_official_url)
                        if target.exists() or target.is_symlink():raise ValueError('engine_destination_appeared')
                        os.replace(temporary,target)
                _prepare_windows_crt(root, engine, destination, cancel, progress)
                verify_engine(destination, engine, require_crt=True)
                with _open_file(destination / '.inventory-verified', create=True) as marker:
                    marker.seek(0); marker.truncate(); marker.write(b'inventory-verified\n')
                    marker.flush(); os.fsync(marker.fileno())
                return destination


def _prepare_windows_crt(root, engine, destination, cancel, progress):
    if getattr(engine['manifestObject'], 'os', None) != 'win32':
        return
    missing = []
    for member, fact in _crt_files(engine):
        target = destination / fact.relative_path
        if target.exists() or target.is_symlink():
            if hash_contained_file(destination, fact.relative_path, fact.bytes) != (fact.bytes, fact.sha256):
                raise ValueError('runtime_integrity_failed')
        else:
            missing.append((member, fact))
    if not missing:
        return
    with _cache_directory(Path(root), ('engine-staging', engine['id'])) as stage:
        partial = stage / _WINDOWS_CRT_ARCHIVE.relative_path
        installer = LocalAiInstaller(None, None, transport=EngineTransport())
        installer._download(_WINDOWS_CRT_ARCHIVE, partial, cancel, progress, lambda: None, source_validator=_official_url)
        with _open_file(partial) as stream, zipfile.ZipFile(stream) as archive:
            for member, fact in missing:
                if cancel.is_set():
                    raise InstallCancelled()
                entries = [item for item in archive.infolist() if item.filename == member]
                if len(entries) != 1 or entries[0].file_size != fact.bytes or stat.S_ISLNK(entries[0].external_attr >> 16):
                    raise ValueError('runtime_crt_archive_invalid')
                temporary = destination / ('.crt-' + uuid.uuid4().hex + '.partial')
                target = destination / fact.relative_path
                try:
                    with archive.open(entries[0]) as source, _open_file(temporary, create=True) as output:
                        while chunk := source.read(256 * 1024):
                            if cancel.is_set(): raise InstallCancelled()
                            output.write(chunk)
                        output.flush(); os.fsync(output.fileno())
                    if hash_contained_file(destination, temporary.name, fact.bytes) != (fact.bytes, fact.sha256):
                        raise ValueError('runtime_integrity_failed')
                    if target.exists() or target.is_symlink():
                        raise ValueError('engine_destination_appeared')
                    os.replace(temporary, target)
                finally:
                    temporary.unlink(missing_ok=True)
