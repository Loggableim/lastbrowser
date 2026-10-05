"""Private host leaf for scoped setup and durable, single-purpose download tasks.

No route registration, global profile switch, model execution or second agent
engine. Main authenticates the caller; explicit human consent is a host callback.
"""
from __future__ import annotations
import os
import re
import threading
import time
import uuid
import weakref
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal
from pydantic import Field
from runtime.independent.contracts import Contract, Scope, Id, Ref, Utc, canonical_json, utc_now
from runtime.independent.store import ResourceBusy, RevisionConflict
from runtime.local_ai.contracts import Sha256
from runtime.local_ai.setup import LocalAiSetup, SetupChoice
from runtime.local_ai.installer import LocalAiInstaller, InstallCancelled

ACTIVE = frozenset(('pending', 'running', 'downloading', 'verifying', 'stopping'))


class GetRequest(Contract):
    operation: Literal['get']


class SelectRequest(Contract):
    operation: Literal['select']
    choice: SetupChoice


class PlanRequest(Contract):
    operation: Literal['plan']
    expected_revision: Annotated[int, Field(ge=0)]
    client_request_id: Id


class ConfirmRequest(Contract):
    operation: Literal['confirm']
    plan_digest: Sha256
    license_digests: tuple[Sha256, ...]
    client_request_id: Id


class StartRequest(Contract):
    operation: Literal['start']
    plan_digest: Sha256
    client_request_id: Id


class CancelRequest(Contract):
    operation: Literal['cancel']
    job_id: Id
    client_request_id: Id


class StatusRequest(Contract):
    operation: Literal['status']
    job_id: Id | None = None


REQUESTS = {'get': GetRequest, 'select': SelectRequest, 'plan': PlanRequest, 'confirm': ConfirmRequest,
    'start': StartRequest, 'cancel': CancelRequest, 'status': StatusRequest}


class InstallJob(Contract):
    schema_version: Literal[1] = 1
    job_id: Id
    scope: Scope
    plan_digest: Sha256
    revision: Annotated[int, Field(gt=0)]
    state: Literal['pending', 'running', 'downloading', 'verifying', 'stopping', 'complete', 'cancelled', 'interrupted', 'failed']
    total_bytes: Annotated[int, Field(ge=0)]
    downloaded_bytes: Annotated[int, Field(ge=0)] | None = None
    verified_bytes: Annotated[int, Field(ge=0)] | None = None
    owner_pid: Annotated[int, Field(gt=0)]
    owner_process_start: Ref
    owner_generation: Id
    lease_id: Id
    created_at: Utc
    updated_at: Utc
    error_code: Ref | None = None
    execution_unavailable: Literal[True] = True


def process_identity(pid: int) -> tuple[Literal['alive', 'dead', 'unknown'], str | None]:
    """OS creation identity distinguishes PID reuse from the original live process."""
    if os.name == 'nt':
        import ctypes
        from ctypes import wintypes
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        kernel.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
        kernel.GetProcessTimes.argtypes = [wintypes.HANDLE, *([ctypes.POINTER(wintypes.FILETIME)] * 4)]
        handle = kernel.OpenProcess(0x1000, False, pid)
        if not handle:
            return ('dead', None) if ctypes.get_last_error() == 87 else ('unknown', None)
        try:
            code = wintypes.DWORD()
            if not kernel.GetExitCodeProcess(handle, ctypes.byref(code)):
                return 'unknown', None
            if code.value != 259:
                return 'dead', None
            creation, end, cpu, user = (wintypes.FILETIME() for _ in range(4))
            if not kernel.GetProcessTimes(handle, ctypes.byref(creation), ctypes.byref(end), ctypes.byref(cpu), ctypes.byref(user)):
                return 'unknown', None
            return 'alive', str((creation.dwHighDateTime << 32) | creation.dwLowDateTime)
        finally:
            kernel.CloseHandle(handle)
    else:
        from pathlib import Path
        try:
            value = Path(f'/proc/{pid}/stat').read_text()
            tail = value[value.rfind(')') + 2:].split()
            if tail[0] == 'Z':
                return 'dead', None
            return 'alive', tail[19]
        except FileNotFoundError:
            try: os.kill(pid, 0)
            except ProcessLookupError: return 'dead', None
            except PermissionError: return 'unknown', None
            return 'unknown', None
        except (OSError, IndexError):
            return 'unknown', None


class DurableCancel(threading.Event):
    def __init__(self, reader):
        super().__init__(); self.reader = reader

    def is_set(self):
        if super().is_set(): return True
        job = self.reader()
        if job.state == 'stopping': self.set()
        return super().is_set()


class LocalAiInstallJobs:
    def __init__(self, setup: LocalAiSetup, cache_resolver, *, installer_factory=LocalAiInstaller, process_probe=process_identity):
        self.setup, self.cache_resolver = setup, cache_resolver
        self.installer_factory, self.process_probe = installer_factory, process_probe
        self.generation = uuid.uuid4().hex
        state, identity = process_probe(os.getpid())
        if state != 'alive' or identity is None:
            raise RuntimeError('download_process_identity_unavailable')
        self.pid, self.process_start = os.getpid(), identity
        self._lock = threading.RLock()
        self._threads: dict[str, threading.Thread] = {}
        self._cancels: dict[str, DurableCancel] = {}
        self._contexts: dict[str, tuple] = {}
        self._closing = False

    def _get(self, store, scope, job_id):
        value = self.setup._read_flow(store, scope, 'job:' + job_id)
        if not value: raise ValueError('download_job_not_bound_to_scope')
        job = InstallJob.model_validate(value)
        if job.scope != scope: raise PermissionError('download_job_scope_mismatch')
        return job

    def _save(self, store, job):
        self.setup._write_flow(store, job.scope, 'job:' + job.job_id, job)
        store._emit(job.scope, 'connection_setup_changed', {'capabilityId': 'local-ai', 'job': job.model_dump(mode='json', by_alias=True)})

    def _recover(self, store, job):
        if job.state not in ACTIVE: return job
        state, identity = self.process_probe(job.owner_pid)
        if state != 'dead' and not (state == 'alive' and identity is not None and identity != job.owner_process_start):
            return job  # Empty local thread registry is NEVER crash proof.
        result = job.model_copy(update={'state': 'interrupted', 'revision': job.revision + 1,
            'updated_at': utc_now(), 'error_code': 'download_owner_process_exited'})
        self._save(store, result)
        store.release_lease(job.lease_id, owner_generation=job.owner_generation)
        return result

    def status(self, scope, *, actor, job_id=None):
        store = self.setup._store(scope, actor)
        with store.transaction():
            if job_id:
                return self._recover(store, self._get(store, scope, job_id))
            rows = store._many("SELECT data_json FROM ia_connection_setup_flows WHERE scope_key=? AND capability_id='local-ai' AND state='job' ORDER BY updated_at DESC", (store._scope(scope),))
            return tuple(self._recover(store, InstallJob.model_validate_json(row[0])) for row in rows)

    def start(self, scope, request: StartRequest, *, actor):
        store = self.setup._store(scope, actor)
        plan = self.setup.approved_plan(scope, request.plan_digest, actor=actor)
        if not callable(self.cache_resolver): raise ValueError('download_cache_not_configured')
        captured_cache = self.cache_resolver(scope)
        with self._lock:
            if self._closing:
                raise ResourceBusy('download_host_shutting_down')
            with store.transaction():
                replay = store._idempotent(scope, 'local_ai_install_start', request.client_request_id, request)
                if replay is not None:
                    return self._recover(store, self._get(store, scope, replay['jobId']))
                resource = 'local_ai_download:' + scope.key + ':' + plan.plan_digest
                lease = store._one("SELECT * FROM ia_resource_leases WHERE resource_key=? AND state='active'", (resource,))
                if lease:
                    import json
                    previous_id = json.loads(lease['data_json']).get('jobId')
                    if previous_id:
                        previous = self._recover(store, self._get(store, scope, previous_id))
                        if previous.state in ACTIVE: raise ResourceBusy('download_plan_already_running')
                    else: raise ResourceBusy('download_lease_already_owned')
                # Repeat approval under the same DB transaction; no network/IO here.
                self.setup._plan(store, scope, request.plan_digest)
                job_id, lease_id, now = uuid.uuid4().hex, uuid.uuid4().hex, utc_now()
                job = InstallJob(job_id=job_id, scope=scope, plan_digest=plan.plan_digest, revision=1,
                    state='pending', total_bytes=plan.total_bytes, owner_pid=self.pid, owner_process_start=self.process_start,
                    owner_generation=self.generation, lease_id=lease_id, created_at=now, updated_at=now)
                expires = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
                data = {'leaseId': lease_id, 'resourceKey': resource, 'runId': None, 'ownerGeneration': self.generation,
                    'revision': 1, 'expiresAt': expires, 'state': 'active', 'jobId': job_id,
                    'ownerKind': 'local_ai_download', 'scope': scope.model_dump(mode='json', by_alias=True)}
                store._conn.execute('INSERT INTO ia_resource_leases VALUES(?,?,?,?,?,?,?,?,?)',
                    (lease_id, resource, scope.key, None, self.generation, 1, expires, 'active', canonical_json(data)))
                self._save(store, job)
                store._remember(scope, 'local_ai_install_start', request.client_request_id, request, {'jobId': job_id})
            cancel = DurableCancel(lambda: self._get(store, scope, job_id))
            worker = threading.Thread(target=self._worker, args=(store, job, actor, captured_cache, cancel),
                name='local-ai-download-' + job_id[:8], daemon=True)
            self._threads[job_id] = worker; self._cancels[job_id] = cancel
            self._contexts[job_id] = (store, scope)
            try: worker.start()
            except BaseException:
                self._finish(store, job, 'failed', error='download_thread_start_failed')
                self._threads.pop(job_id, None); self._cancels.pop(job_id, None)
                self._contexts.pop(job_id, None)
                raise
        return job

    def cancel(self, scope, request: CancelRequest, *, actor):
        store = self.setup._store(scope, actor)
        with store.transaction():
            replay = store._idempotent(scope, 'local_ai_install_cancel', request.client_request_id, request)
            job = self._recover(store, self._get(store, scope, request.job_id))
            if replay is not None: return job
            if job.state in ACTIVE and job.state != 'stopping':
                job = job.model_copy(update={'state': 'stopping', 'revision': job.revision + 1, 'updated_at': utc_now()})
                self._save(store, job)
            store._remember(scope, 'local_ai_install_cancel', request.client_request_id, request, {'jobId': job.job_id})
        # No joining while holding DB transaction or UI request.
        with self._lock:
            event = self._cancels.get(job.job_id)
            if event: event.set()
        return job

    def _progress(self, store, job, progress):
        if progress.get('stage') not in ('downloading', 'verifying'): raise ValueError('invalid_download_progress')
        with store.transaction():
            current = self._get(store, job.scope, job.job_id)
            if current.state not in ACTIVE or current.owner_generation != self.generation:
                raise RuntimeError('download_owner_changed')
            values = {'state': current.state if current.state == 'stopping' else progress['stage'],
                'revision': current.revision + 1, 'updated_at': utc_now()}
            for key, alias in (('downloaded_bytes', 'downloadedBytes'), ('verified_bytes', 'verifiedBytes')):
                value = progress.get(alias)
                if type(value) is not int or value < 0 or value > current.total_bytes:
                    raise ValueError('download_progress_out_of_bounds')
                values[key] = value
            self._save(store, current.model_copy(update=values))

    def _finish(self, store, job, state, *, error=None, result=None):
        with store.transaction():
            current = self._get(store, job.scope, job.job_id)
            if current.owner_generation != self.generation or current.state not in ACTIVE: return
            values = {'state': state, 'revision': current.revision + 1, 'updated_at': utc_now(), 'error_code': error}
            if result is not None: values['verified_bytes'] = result.verified_bytes
            final = current.model_copy(update=values)
            self._save(store, final)
            store.release_lease(current.lease_id, owner_generation=self.generation)

    def _worker(self, store, job, actor, cache, cancel):
        try:
            with store.transaction():
                current = self._get(store, job.scope, job.job_id)
                if current.state != 'stopping':
                    self._save(store, current.model_copy(update={'state': 'running', 'revision': current.revision + 1, 'updated_at': utc_now()}))
            def cache_path(actual):
                if actual != job.scope: raise PermissionError('download_scope_changed')
                return cache
            installer = self.installer_factory(self.setup, cache_path)
            last = [None, 0.0, 0]
            def progress(value):
                # Coalesce byte updates; stage changes are always durable immediately.
                now = time.monotonic()
                if value['stage'] != last[0] or now - last[1] >= .25 or value['downloadedBytes'] - last[2] >= 1048576 or value['verifiedBytes'] == job.total_bytes:
                    self._progress(store, job, value)
                    last[:] = [value['stage'], now, value['downloadedBytes']]
            result = installer.install(job.scope, actor=actor, plan_digest=job.plan_digest, cancel=cancel, progress=progress)
            if result.scope != job.scope or result.plan_digest != job.plan_digest or result.verified_bytes != job.total_bytes:
                raise ValueError('download_result_mismatch')
            self._finish(store, job, 'complete', result=result)
        except InstallCancelled:
            self._finish(store, job, 'cancelled')
        except Exception as exc:
            if cancel.is_set():
                self._finish(store, job, 'cancelled')  # Actual transport/FD context already exited.
            else:
                code = ('download_setup_or_consent_changed' if isinstance(exc, RevisionConflict) else
                    'download_scope_or_consent_revoked' if isinstance(exc, PermissionError) else
                    str(exc) if isinstance(exc, ValueError) and re.fullmatch(r'[a-z_]{1,128}', str(exc)) else 'download_failed')
                self._finish(store, job, 'failed', error=code)
        finally:
            with self._lock:
                self._cancels.pop(job.job_id, None); self._threads.pop(job.job_id, None)
                self._contexts.pop(job.job_id, None)

    def wait(self, job_id, timeout=20):
        """Trusted host shutdown/test helper, never an HTTP blocking request."""
        with self._lock: worker = self._threads.get(job_id)
        if worker: worker.join(timeout)
        return worker is None or not worker.is_alive()

    def close(self, timeout=20):
        """Host calls before closing ProfileHub; returns false if IO still owns FDs."""
        with self._lock:
            self._closing = True
            tasks = [(identity, worker, self._cancels[identity], self._contexts[identity])
                for identity, worker in self._threads.items()]
        for identity, _, cancel, (store, scope) in tasks:
            cancel.set()
            with store.transaction():
                job = self._get(store, scope, identity)
                if job.state in ACTIVE and job.state != 'stopping':
                    self._save(store, job.model_copy(update={'state': 'stopping', 'revision': job.revision + 1, 'updated_at': utc_now()}))
        deadline = time.monotonic() + max(0, timeout)
        for _, worker, _, _ in tasks:
            worker.join(max(0, deadline - time.monotonic()))
        return all(not worker.is_alive() for _, worker, _, _ in tasks)


_RUNNERS = weakref.WeakKeyDictionary()
_RUNNERS_LOCK = threading.RLock()
_SHUTTING_DOWN = weakref.WeakSet()


def register_local_ai_setup_runner(profile_hub, runner: LocalAiInstallJobs) -> None:
    """Trusted bootstrap/test factory only; never exposed in a request payload."""
    if not isinstance(runner, LocalAiInstallJobs) or runner.setup.profile_hub is not profile_hub:
        raise PermissionError('download_runner_profile_hub_mismatch')
    with _RUNNERS_LOCK:
        if profile_hub in _SHUTTING_DOWN:
            raise ResourceBusy('download_host_shutting_down')
        current = _RUNNERS.get(profile_hub)
        if current is not None and current is not runner:
            raise ResourceBusy('download_runner_already_bound')
        _RUNNERS[profile_hub] = runner


def shutdown_local_ai_setup(profile_hub, timeout=20) -> bool:
    """Host lifecycle hook: do NOT close ProfileHub unless this returns true.

    Shutting down rejects new starts. A false result retains the runner and its
    cancellation context until actual IO exits; repeated calls can obtain ACK.
    Jobs persisted by other live OS owners cannot be acknowledged as stopped by
    an empty local registry, so those active records make this return false.
    """
    if type(timeout) not in (int, float) or timeout < 0 or timeout > 60:
        raise ValueError('invalid_download_shutdown_timeout')
    with _RUNNERS_LOCK:
        _SHUTTING_DOWN.add(profile_hub)
        runner = _RUNNERS.get(profile_hub)
    try:
        if runner is not None and not runner.close(timeout):
            return False
        # Inventory registered EXISTING databases readonly, including other OS
        # owners and homes not opened in this process. Never instantiate a DB.
        import sqlite3
        from contextlib import closing
        for _, path in profile_hub.existing_store_paths():
            with closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=.1)) as connection:
                rows = connection.execute("SELECT data_json FROM ia_connection_setup_flows WHERE capability_id='local-ai' AND state='job'").fetchall()
                if any(InstallJob.model_validate_json(row[0]).state in ACTIVE for row in rows):
                    return False
    except Exception:
        return False  # Unknown/closed/corrupt persistence is never a stopped proof.
    with _RUNNERS_LOCK:
        if _RUNNERS.get(profile_hub) is runner:
            _RUNNERS.pop(profile_hub, None)
    return True


def handle_local_ai_setup(profile_hub, scope: Scope, actor: str, payload: dict, *,
    private_human_action=None, cache_resolver=None, installer_runner=None) -> dict:
    """Caller MUST be privately Main-authenticated; scope/actor are trusted context."""
    model = REQUESTS.get(payload.get('operation')) if isinstance(payload, dict) else None
    if model is None: raise ValueError('unknown_local_ai_setup_operation')
    request = model.model_validate(payload)
    with _RUNNERS_LOCK:
        if installer_runner is not None and _RUNNERS.get(profile_hub) is not installer_runner:
            register_local_ai_setup_runner(profile_hub, installer_runner)
        owned_runner = _RUNNERS.get(profile_hub)
    setup = owned_runner.setup if owned_runner else LocalAiSetup(profile_hub)
    response = {'operation': request.operation, 'skipAvailable': True, 'existingProviderAvailable': True}
    if request.operation == 'get': value, key = setup.read(scope, actor=actor), 'preferences'
    elif request.operation == 'select': value, key = setup.select(scope, request.choice, actor=actor), 'preferences'
    elif request.operation == 'plan':
        value, key = setup.plan(scope, actor=actor, expected_revision=request.expected_revision, client_request_id=request.client_request_id), 'plan'
    elif request.operation == 'confirm':
        value, key = setup.confirm_plan(scope, actor=actor, plan_digest=request.plan_digest, license_digests=request.license_digests,
            client_request_id=request.client_request_id, private_human_action=private_human_action), 'consent'
    else:
        with _RUNNERS_LOCK:
            if request.operation == 'start' and profile_hub in _SHUTTING_DOWN:
                raise ResourceBusy('download_host_shutting_down')
            runner = installer_runner or _RUNNERS.get(profile_hub)
            if runner is None:
                if request.operation == 'start' and not callable(cache_resolver): raise ValueError('download_cache_not_configured')
                runner = LocalAiInstallJobs(setup, cache_resolver)
                _RUNNERS[profile_hub] = runner
            elif request.operation == 'start' and runner.cache_resolver is None and callable(cache_resolver):
                runner.cache_resolver = cache_resolver
            if installer_runner is not None and request.operation == 'start':
                existing = _RUNNERS.get(profile_hub)
                if existing is not None and existing is not runner:
                    raise ResourceBusy('download_runner_already_bound')
                _RUNNERS[profile_hub] = runner
        if request.operation == 'start': value, key = runner.start(scope, request, actor=actor), 'job'
        elif request.operation == 'cancel': value, key = runner.cancel(scope, request, actor=actor), 'job'
        else:
            value = runner.status(scope, actor=actor, job_id=request.job_id)
            key = 'job' if request.job_id else 'jobs'
    response[key] = [item.model_dump(mode='json', by_alias=True) for item in value] if isinstance(value, tuple) else value.model_dump(mode='json', by_alias=True)
    return response
