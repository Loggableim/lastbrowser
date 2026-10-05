"""Bounded model-file downloader. Never installs/executes a runtime binary.

Host owns cache paths and consent authority. Tests inject a small transport;
production accepts only the exact previously validated pinned Hub manifests.
"""
from __future__ import annotations
import hashlib
import os
import re
import shutil
import stat
from contextlib import ExitStack, contextmanager
from pathlib import Path
from threading import Event
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from runtime.independent.contracts import Contract, Scope

ALLOWED_HOSTS = frozenset(('huggingface.co', 'cdn-lfs.huggingface.co', 'cdn-lfs-us-1.huggingface.co',
    'cdn-lfs-eu-1.huggingface.co', 'cas-bridge.xethub.hf.co', 'us.aws.cdn.hf.co'))
CHUNK = 256 * 1024


class InstallCancelled(RuntimeError):
    pass


class InstallResult(Contract):
    scope: Scope
    plan_digest: str
    installed_artifact_ids: tuple[str, ...]
    verified_bytes: int
    execution_unavailable: bool = True


def allowed_url(url: str):
    if url != url.strip() or any(ord(char) < 32 or ord(char) == 127 for char in url):
        raise ValueError('download_origin_rejected')
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname not in ALLOWED_HOSTS or parsed.port not in (None, 443) or parsed.username or parsed.password or parsed.fragment:
        raise ValueError('download_origin_rejected')


class StrictRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        allowed_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class HubTransport:
    def __init__(self, *, timeout=20):
        if type(timeout) not in (int, float) or not 0 < timeout <= 20:
            raise ValueError('invalid_download_transport_timeout')
        self.timeout = timeout

    @contextmanager
    def open(self, url: str, offset: int):
        allowed_url(url)
        # No inherited proxy/auth/account environment and no cookies.
        headers = {'Accept-Encoding': 'identity', 'User-Agent': 'Lastbrowser-local-model-installer/1'}
        if offset:
            headers['Range'] = f'bytes={offset}-'
        opener = build_opener(ProxyHandler({}), StrictRedirects())
        with opener.open(Request(url, headers=headers), timeout=self.timeout) as response:
            allowed_url(response.geturl())
            yield response


def _no_link(path: Path, *, directory=False):
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
        raise ValueError('cache_reparse_or_symlink_rejected')
    if directory and not stat.S_ISDIR(info.st_mode):
        raise ValueError('cache_directory_required')
    if not directory and (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1):
        raise ValueError('cache_file_type_or_hardlink_rejected')
    return info


def _safe_component(part):
    return bool(re.fullmatch(r'[a-zA-Z0-9._-]+', part)) and part not in ('.', '..') and not part.endswith('.') and not re.fullmatch(r'(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?', part, re.IGNORECASE)


@contextmanager
def _pin_directory(path: Path):
    """Prevent rename/junction replacement on Windows, nofollow directory on POSIX."""
    _no_link(path, directory=True)
    if os.name == 'nt':
        import ctypes
        from ctypes import wintypes
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
            wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
        kernel.CreateFileW.restype = wintypes.HANDLE
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        handle = kernel.CreateFileW(str(path), 0, 3, None, 3, 0x02200000, None)
        if handle == ctypes.c_void_p(-1).value:
            raise OSError(ctypes.get_last_error(), 'cache_directory_pin_failed')
        try:
            _no_link(path, directory=True)
            yield
        finally:
            kernel.CloseHandle(handle)
    else:
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            _no_link(path, directory=True)
            yield
        finally:
            os.close(fd)


@contextmanager
def _cache_directory(root: Path, relative: tuple[str, ...]):
    if not root.is_absolute() or '..' in root.parts:
        raise ValueError('absolute_canonical_cache_required')
    # Pin all ancestors, not just the leaf; never resolve away a link silently.
    with ExitStack() as stack:
        for parent in reversed((root, *root.parents)):
            stack.enter_context(_pin_directory(parent))
        if root.resolve() != root:
            raise ValueError('noncanonical_cache_root')
        leaf = root
        for part in relative:
            if not _safe_component(part):
                raise ValueError('unsafe_cache_component')
            leaf = leaf / part
            leaf.mkdir(exist_ok=True)
            stack.enter_context(_pin_directory(leaf))
        yield leaf


@contextmanager
def _open_file(path: Path, *, create=False):
    flags = os.O_RDWR | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOFOLLOW', 0)
    if create:
        try:
            fd = os.open(path, flags | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            _no_link(path)
            fd = os.open(path, flags)
    else:
        _no_link(path)
        fd = os.open(path, flags)
    try:
        actual = os.fstat(fd); current = _no_link(path)
        if (actual.st_dev, actual.st_ino) != (current.st_dev, current.st_ino):
            raise ValueError('cache_file_replaced')
        with os.fdopen(fd, 'r+b') as stream:
            fd = -1
            yield stream
    finally:
        if fd >= 0:
            os.close(fd)


@contextmanager
def _install_lock(path: Path):
    with _open_file(path, create=True) as stream:
        if stream.seek(0, 2) == 0:
            stream.write(b'0'); stream.flush()
        stream.seek(0)
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            try: yield
            finally:
                stream.seek(0); msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            try: yield
            finally: fcntl.flock(stream, fcntl.LOCK_UN)


def _check_cancel(cancel):
    if cancel.is_set():
        raise InstallCancelled('installation_cancelled')


def _verified(stream, file, cancel, progress=None):
    stream.seek(0); digest = hashlib.sha256(); count = 0
    while chunk := stream.read(CHUNK):
        _check_cancel(cancel); count += len(chunk)
        if count > file.bytes:
            raise ValueError('cached_file_size_mismatch')
        digest.update(chunk)
        if progress:
            progress()
    if count != file.bytes or digest.hexdigest() != file.sha256:
        raise ValueError('cached_file_hash_or_size_mismatch')


class LocalAiInstaller:
    def __init__(self, setup, cache_resolver, *, transport=None, disk_usage=shutil.disk_usage):
        self.setup = setup
        self.cache_resolver = cache_resolver
        self.transport = transport or HubTransport()
        self.disk_usage = disk_usage

    def install(self, scope: Scope, *, actor: str, plan_digest: str, cancel: Event | None = None, progress=None) -> InstallResult:
        cancel = cancel if cancel is not None else Event()
        plan = self.setup.approved_plan(scope, plan_digest, actor=actor)
        root = Path(self.cache_resolver(scope))
        verified, installed = self._install_files(plan.artifacts, root, plan.plan_digest, cancel,
            lambda: self.setup.approved_plan(scope, plan_digest, actor=actor), progress)
        return InstallResult(scope=scope, plan_digest=plan.plan_digest, installed_artifact_ids=tuple(installed), verified_bytes=verified)

    def install_bootstrap(self, artifact, cache_root: Path, *, policy_id: str, cancel: Event | None = None, progress=None) -> int:
        """Install the one compiled-in first-run artifact under its distinct product policy.

        This is not an InstallConsent and does not create/approve a Space plan.
        Callers cannot supply or change the model manifest; bootstrap.py validates
        it against the static allowlist before invoking this method.
        """
        from runtime.local_ai.router_bootstrap_download import BOOTSTRAP_POLICY_ID, bootstrap_artifact, bootstrap_plan_key
        if policy_id != BOOTSTRAP_POLICY_ID or artifact != bootstrap_artifact():
            raise PermissionError('local_ai_bootstrap_policy_rejected')
        cancel = cancel if cancel is not None else Event()
        verified, _ = self._install_files((artifact,), Path(cache_root), bootstrap_plan_key(artifact), cancel,
            lambda: self._validate_bootstrap_policy(policy_id, artifact), progress)
        return verified

    @staticmethod
    def _validate_bootstrap_policy(policy_id, artifact):
        from runtime.local_ai.router_bootstrap_download import BOOTSTRAP_POLICY_ID, bootstrap_artifact
        if policy_id != BOOTSTRAP_POLICY_ID or artifact != bootstrap_artifact():
            raise PermissionError('local_ai_bootstrap_policy_revoked')

    def _install_files(self, artifacts, root: Path, plan_digest: str, cancel: Event, authorize, progress=None):
        # Paths/transport are trusted constructor dependencies, never body fields.
        verified = 0; transferred = 0; installed = []
        def notify(stage):
            if progress:
                progress({'stage': stage, 'downloadedBytes': transferred, 'verifiedBytes': verified})
        def transferred_chunk(size):
            nonlocal transferred
            transferred += size
            notify('downloading')
        with _cache_directory(root, (plan_digest,)) as directory:
            with _install_lock(directory / '.install.lock'):
                _check_cancel(cancel)
                authorize()
                pending_bytes = sum(file.bytes for artifact in artifacts for file in artifact.files
                    if not (directory / hashlib.sha256(artifact.artifact_id.encode()).hexdigest() / file.relative_path).exists())
                if self.disk_usage(directory).free < pending_bytes * 2:
                    raise ValueError('cache_disk_insufficient_for_staging')
                for artifact in artifacts:
                    identity = hashlib.sha256(artifact.artifact_id.encode()).hexdigest()
                    for file in artifact.files:
                        _check_cancel(cancel)
                        # Ordinary jobs revalidate consent; bootstrap jobs revalidate
                        # the fixed product policy. Neither path accepts renderer authority.
                        authorize()
                        parts = tuple(file.relative_path.replace('\\', '/').split('/'))
                        with _cache_directory(directory, (identity, *parts[:-1])) as target_dir:
                            filename = parts[-1]
                            if not _safe_component(filename):
                                raise ValueError('unsafe_cache_filename')
                            final = target_dir / filename; partial = target_dir / (filename + '.partial')
                            if final.exists() or final.is_symlink():
                                with _open_file(final) as stream:
                                    _verified(stream, file, cancel, lambda: notify('verifying'))
                            else:
                                self._download(file, partial, cancel, transferred_chunk, lambda: notify('verifying'))
                                _check_cancel(cancel)
                                authorize()
                                if final.exists() or final.is_symlink():
                                    raise ValueError('cache_destination_appeared')
                                _no_link(partial)
                                os.replace(partial, final)
                                # Revalidate the published object before claiming installation.
                                with _open_file(final) as stream:
                                    _verified(stream, file, cancel, lambda: notify('verifying'))
                            verified += file.bytes
                            notify('verifying')
                    installed.append(artifact.artifact_id)
        return verified, installed

    def _download(self, file, partial, cancel, transferred_chunk=None, verifying=None):
        allowed_url(file.source_url)
        with _open_file(partial, create=True) as stream:
            offset = stream.seek(0, 2)
            if offset > file.bytes:
                raise ValueError('partial_size_exceeds_manifest')
            if offset == file.bytes:
                _verified(stream, file, cancel, verifying)
                return
            _check_cancel(cancel)
            with self.transport.open(file.source_url, offset) as response:
                status = response.status
                if status == 200:
                    if response.headers.get('Content-Range'):
                        raise ValueError('unexpected_full_response_range')
                    stream.seek(0); stream.truncate(); offset = 0
                elif status == 206:
                    match = re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)', response.headers.get('Content-Range', ''))
                    if not match or int(match[1]) != offset or int(match[3]) != file.bytes or int(match[2]) != file.bytes - 1:
                        raise ValueError('resume_range_mismatch')
                else:
                    raise ValueError('download_status_rejected')
                encoding = response.headers.get('Content-Encoding', 'identity')
                get_all = getattr(response.headers, 'get_all', None)
                if get_all and any(len(get_all(name, [])) > 1 for name in ('Content-Length', 'Content-Range', 'Content-Encoding')):
                    raise ValueError('ambiguous_download_headers')
                if encoding != 'identity':
                    raise ValueError('download_encoding_rejected')
                length = response.headers.get('Content-Length')
                if length is not None and (not length.isdigit() or int(length) != file.bytes - offset):
                    raise ValueError('download_length_mismatch')
                count = offset
                while True:
                    _check_cancel(cancel)
                    chunk = response.read(min(CHUNK, file.bytes - count + 1))
                    if not chunk:
                        break
                    if not isinstance(chunk, bytes) or len(chunk) > CHUNK or count + len(chunk) > file.bytes:
                        raise ValueError('download_exceeds_manifest')
                    stream.write(chunk); count += len(chunk)
                    # Progress must describe actual OS writes, not Python's buffer;
                    # process-kill resume can only retain flushed partial bytes.
                    stream.flush()
                    if transferred_chunk:
                        transferred_chunk(len(chunk))
                stream.flush(); os.fsync(stream.fileno())
            _verified(stream, file, cancel, verifying)
