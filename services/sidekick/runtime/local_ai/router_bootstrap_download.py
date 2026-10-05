"""Installation-wide first-run download for one pinned router artifact.

This product policy grants only the fixed file download below. It is separate
from a Space install plan and never represents private human consent or model
execution readiness.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import uuid
from pathlib import Path
from urllib.error import URLError
from pydantic import Field

from runtime.independent.contracts import Contract, utc_now
from runtime.local_ai.contracts import ArtifactFile, ModelArtifact
from runtime.local_ai.installer import InstallCancelled, LocalAiInstaller, _cache_directory, _no_link

BOOTSTRAP_POLICY_ID = 'first_run_default_router_v1'
BOOTSTRAP_INSTALL_KEY = 'router-lfm2.5-230m-qad-q4_0-v1'
BOOTSTRAP_REPOSITORY = 'LiquidAI/LFM2.5-230M-GGUF'
BOOTSTRAP_REVISION = 'b27f8147d98080b0d6f063ff41de6e381ea9a530'
BOOTSTRAP_FILENAME = 'LFM2.5-230M-QAD-Q4_0.gguf'
BOOTSTRAP_SHA256 = 'e75f83268de11b2a1bcfab5f3b5c5c0c97569ddbbc0990aad88437e45b8ba292'
BOOTSTRAP_BYTES = 149081056
LICENSE_SHA256 = '30adf9d6478191fb87f2424f63ba0728598335aaf99cd2848ef17e8e545fe94b'
LICENSE_BYTES = 10574
BOOTSTRAP_TOTAL_BYTES = BOOTSTRAP_BYTES + LICENSE_BYTES
BOOTSTRAP_LICENSE_URL = f'https://huggingface.co/{BOOTSTRAP_REPOSITORY}/blob/{BOOTSTRAP_REVISION}/LICENSE'
MAX_ATTEMPTS = 3
ACTIVE = frozenset(('pending', 'downloading', 'verifying', 'cancelling'))


def bootstrap_artifact() -> ModelArtifact:
    base = f'https://huggingface.co/{BOOTSTRAP_REPOSITORY}/resolve/{BOOTSTRAP_REVISION}/'
    license_download = f'https://huggingface.co/{BOOTSTRAP_REPOSITORY}/raw/{BOOTSTRAP_REVISION}/LICENSE'
    return ModelArtifact(
        artifact_id=f'{BOOTSTRAP_REPOSITORY}:LFM2.5-230M-QAD-Q4_0', provider='LiquidAI', model_id=BOOTSTRAP_REPOSITORY,
        revision=BOOTSTRAP_REVISION, format='gguf', quantization='Q4_0', architecture='lfm2', roles=('agent',),
        files=(ArtifactFile(relative_path=BOOTSTRAP_FILENAME, bytes=BOOTSTRAP_BYTES, sha256=BOOTSTRAP_SHA256,
                source_url=base + BOOTSTRAP_FILENAME, kind='weights'),
            ArtifactFile(relative_path='LICENSE', bytes=LICENSE_BYTES, sha256=LICENSE_SHA256,
                source_url=license_download, kind='license')),
        manifest_complete=True, license_ref=BOOTSTRAP_LICENSE_URL, license_digest=LICENSE_SHA256,
        evidence_refs=(f'https://huggingface.co/{BOOTSTRAP_REPOSITORY}/blob/{BOOTSTRAP_REVISION}/{BOOTSTRAP_FILENAME}',
            BOOTSTRAP_LICENSE_URL))


def bootstrap_plan_key(artifact: ModelArtifact | None = None) -> str:
    manifest = (artifact or bootstrap_artifact()).model_dump(mode='json', by_alias=True)
    canonical = json.dumps({'policyId': BOOTSTRAP_POLICY_ID, 'artifact': manifest}, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()


class BootstrapRequest(Contract):
    action: str
    client_request_id: str | None = None
    job_id: str | None = None


class BootstrapStatus(Contract):
    schema_version: int = 1
    install_key: str = BOOTSTRAP_INSTALL_KEY
    revision: int = 0
    state: str = 'idle'
    job_id: str | None = None
    attempt: int = 0
    downloaded_bytes: int = 0
    verified_bytes: int = 0
    total_bytes: int = BOOTSTRAP_TOTAL_BYTES
    artifact_id: str = f'{BOOTSTRAP_REPOSITORY}:LFM2.5-230M-QAD-Q4_0'
    artifact_revision: str = BOOTSTRAP_REVISION
    sha256: str = BOOTSTRAP_SHA256
    license_label: str = 'LFM Open License v1.0'
    license_url: str = BOOTSTRAP_LICENSE_URL
    commercial_threshold_usd: int = 10_000_000
    execution_unavailable: bool = True
    error_code: str | None = None
    updated_at: str = Field(default_factory=utc_now)
    last_request_ids: tuple[str, ...] = ()


def _default_state() -> BootstrapStatus:
    return BootstrapStatus()


class LocalAiBootstrapManager:
    """One durable job record; the existing LocalAiInstaller owns file transfer."""

    def __init__(self, state_root: Path, cache_root: Path, *, installer_factory=LocalAiInstaller,
        process_generation: str | None = None):
        self.state_root = Path(state_root)
        self.cache_root = Path(cache_root)
        self.installer_factory = installer_factory
        self.generation = process_generation or uuid.uuid4().hex
        self._lock = threading.RLock()
        self._worker: threading.Thread | None = None
        self._cancel: threading.Event | None = None
        self._closed = False

    @property
    def _artifact(self):
        value = bootstrap_artifact()
        if value.files[0].bytes != BOOTSTRAP_BYTES or value.files[0].sha256 != BOOTSTRAP_SHA256:
            raise ValueError('local_ai_bootstrap_manifest_changed')
        return value

    def _read(self) -> BootstrapStatus:
        with _cache_directory(self.state_root, ('local-ai-bootstrap',)) as directory:
            path = directory / 'router.json'
            try:
                _no_link(path)
                raw = json.loads(path.read_text(encoding='utf-8'))
            except FileNotFoundError:
                return _default_state()
            value = BootstrapStatus.model_validate(raw)
        if value.install_key != BOOTSTRAP_INSTALL_KEY or value.total_bytes != BOOTSTRAP_TOTAL_BYTES:
            raise ValueError('local_ai_bootstrap_state_invalid')
        return value

    def _write(self, value: BootstrapStatus) -> BootstrapStatus:
        value = value.model_copy(update={'revision': value.revision + 1, 'updated_at': utc_now()})
        with _cache_directory(self.state_root, ('local-ai-bootstrap',)) as directory:
            path = directory / 'router.json'
            temporary = directory / ('.router-' + uuid.uuid4().hex + '.tmp')
            try:
                flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0)
                fd = os.open(temporary, flags, 0o600)
                with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as stream:
                    stream.write(value.model_dump_json(by_alias=True))
                    stream.flush(); os.fsync(stream.fileno())
                if path.exists() or path.is_symlink():
                    _no_link(path)
                os.replace(temporary, path)
                if os.name != 'nt':
                    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
                    try: os.fsync(fd)
                    finally: os.close(fd)
            finally:
                try: temporary.unlink(missing_ok=True)
                except OSError: pass
        return value

    def _current(self) -> BootstrapStatus:
        value = self._read()
        if value.state in ACTIVE and (self._worker is None or not self._worker.is_alive()):
            value = self._write(value.model_copy(update={'state': 'failed', 'error_code': 'download_interrupted'}))
        return value

    def handle(self, payload: dict) -> BootstrapStatus:
        request = BootstrapRequest.model_validate(payload)
        allowed = {'status': {'action'}, 'start': {'action', 'clientRequestId'},
            'retry': {'action', 'clientRequestId'}, 'cancel': {'action', 'jobId', 'clientRequestId'}}
        expected = allowed.get(request.action)
        if expected is None or set(payload) != expected:
            raise ValueError('invalid_local_ai_bootstrap_request')
        if request.action in ('start', 'retry') and not _uuid(request.client_request_id):
            raise ValueError('invalid_local_ai_bootstrap_request')
        if request.action == 'cancel' and (not _uuid(request.job_id) or not _uuid(request.client_request_id)):
            raise ValueError('invalid_local_ai_bootstrap_request')
        with self._lock:
            if self._closed:
                raise ValueError('local_ai_bootstrap_host_shutting_down')
            current = self._current()
            if request.client_request_id and request.client_request_id in current.last_request_ids:
                return current
            if request.action == 'status':
                return current
            if request.action == 'cancel':
                if current.job_id != request.job_id:
                    raise ValueError('local_ai_bootstrap_job_mismatch')
                request_ids = tuple((*current.last_request_ids, request.client_request_id)[-64:])
                if current.state in ACTIVE:
                    if current.state == 'cancelling': return current
                    updated = self._write(current.model_copy(update={'state': 'cancelling', 'error_code': None,
                        'last_request_ids': request_ids}))
                    if self._cancel is not None: self._cancel.set()
                    return updated
                return current
            if request.action == 'retry' and current.state not in ('failed', 'offline', 'cancelled'):
                return current
            if request.action == 'start' and current.state != 'idle':
                return current
            if current.state in ACTIVE or current.state == 'complete':
                return current
            if current.attempt >= MAX_ATTEMPTS:
                return current.model_copy(update={'error_code': 'download_retry_limit_reached'})
            request_ids = tuple((*current.last_request_ids, request.client_request_id)[-64:])
            next_state = current.model_copy(update={'state': 'pending', 'job_id': uuid.uuid4().hex,
                'attempt': current.attempt + 1, 'downloaded_bytes': 0, 'verified_bytes': 0, 'error_code': None,
                'last_request_ids': request_ids})
            started = self._write(next_state)
            cancel = threading.Event(); self._cancel = cancel
            worker = threading.Thread(target=self._run, args=(started, cancel), name='local-ai-router-bootstrap', daemon=True)
            self._worker = worker
            try: worker.start()
            except BaseException:
                self._write(started.model_copy(update={'state': 'failed', 'error_code': 'download_thread_start_failed'}))
                self._worker = None; self._cancel = None
                raise
            return started

    def _run(self, started: BootstrapStatus, cancel: threading.Event) -> None:
        def progress(value):
            with self._lock:
                current = self._read()
                if current.job_id != started.job_id or current.state not in ACTIVE: return
                stage = value.get('stage')
                if stage not in ('downloading', 'verifying'): raise ValueError('invalid_download_progress')
                downloaded = value.get('downloadedBytes'); verified = value.get('verifiedBytes')
                if type(downloaded) is not int or not 0 <= downloaded <= BOOTSTRAP_TOTAL_BYTES \
                    or type(verified) is not int or not 0 <= verified <= BOOTSTRAP_TOTAL_BYTES:
                    raise ValueError('download_progress_out_of_bounds')
                if current.state != 'cancelling':
                    self._write(current.model_copy(update={'state': stage, 'downloaded_bytes': downloaded,
                        'verified_bytes': verified, 'error_code': None}))
        try:
            installer = self.installer_factory(None, lambda _scope: self.cache_root)
            verified = installer.install_bootstrap(self._artifact, self.cache_root,
                policy_id=BOOTSTRAP_POLICY_ID, cancel=cancel, progress=progress)
            with self._lock:
                current = self._read()
                if current.job_id == started.job_id and current.state in ACTIVE:
                    if verified != BOOTSTRAP_TOTAL_BYTES: raise ValueError('local_ai_bootstrap_verification_mismatch')
                    self._write(current.model_copy(update={'state': 'complete', 'verified_bytes': verified,
                        'downloaded_bytes': BOOTSTRAP_TOTAL_BYTES, 'error_code': None}))
        except InstallCancelled:
            self._finish(started, 'cancelled', None)
        except Exception as exc:
            code = _error_code(exc)
            self._finish(started, 'offline' if code == 'download_offline' else 'failed', code)
        finally:
            with self._lock:
                if self._worker is threading.current_thread(): self._worker = None
                if self._cancel is cancel: self._cancel = None

    def _finish(self, started: BootstrapStatus, state: str, error: str | None) -> None:
        with self._lock:
            current = self._read()
            if current.job_id == started.job_id and current.state in ACTIVE:
                self._write(current.model_copy(update={'state': state, 'error_code': error}))

    def auto_start(self) -> BootstrapStatus:
        current = self.handle({'action': 'status'})
        if current.state == 'idle':
            return self.handle({'action': 'start', 'clientRequestId': str(uuid.uuid4())})
        if current.state in ('failed', 'offline') and current.attempt < MAX_ATTEMPTS:
            return self.handle({'action': 'retry', 'clientRequestId': str(uuid.uuid4())})
        return current

    def close(self, timeout: float = 5) -> bool:
        with self._lock:
            self._closed = True
            worker, cancel = self._worker, self._cancel
            if cancel: cancel.set()
        if worker: worker.join(max(0, timeout))
        return worker is None or not worker.is_alive()


def _uuid(value):
    if not isinstance(value, str): return False
    try: uuid.UUID(value); return True
    except (ValueError, AttributeError, TypeError): return False


def _error_code(exc: Exception) -> str:
    if isinstance(exc, (URLError, TimeoutError, ConnectionError)) or getattr(exc, 'reason', None) is not None:
        return 'download_offline'
    value = str(exc)
    return value if re.fullmatch(r'[a-z_]{1,128}', value) else 'download_failed'
