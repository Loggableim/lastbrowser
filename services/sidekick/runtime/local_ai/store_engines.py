"""Pinned official engine acquisition and allowlisted ZIP extraction."""
from __future__ import annotations

import os
import stat
import uuid
import zipfile
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from .installer import LocalAiInstaller, _cache_directory, _open_file, _verified, InstallCancelled
from .runtime_probe import hash_contained_file


def _official_url(url):
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


def verify_engine(directory, engine):
    manifest = engine['manifestObject']
    for fact in manifest.files:
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
        verify_engine(cached, engine)
        return cached
    raise ValueError('pinned_runtime_unavailable')


def prepare_engine(root, repository, engine, cancel, progress):
    try:
        return engine_directory(root, repository, engine)
    except (OSError, ValueError) as exc:
        # A changed packaged or completed cache is never repaired silently.
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
                verify_engine(destination, engine)
                with _open_file(destination / '.inventory-verified', create=True) as marker:
                    marker.seek(0); marker.truncate(); marker.write(b'inventory-verified\n')
                    marker.flush(); os.fsync(marker.fileno())
                return destination
