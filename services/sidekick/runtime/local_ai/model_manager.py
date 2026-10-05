"""Scoped bounded model residency, reusing actual admission and host evidence.

No model download, second agent engine, cloud fallback or GPU guess. Test-only
child fixtures are explicitly synthetic and never make a model available.
"""
from __future__ import annotations
import hashlib
import json
import os
import signal
import socket
import subprocess
import threading
import time
import uuid
import re
from contextlib import ExitStack
from pathlib import Path
from typing import Annotated, Literal
from urllib.request import Request, ProxyHandler, build_opener
from pydantic import Field
from runtime.independent.contracts import Contract, Scope, Ref, Id, Utc, canonical_json, utc_now
from runtime.independent.store import ResourceBusy
from .contracts import Role, Sha256
from .runtime_probe import inspect_runtime_build, hash_contained_file, _WindowsProbeJob
from .installer import _pin_directory
from .role_adapters import RoleRequest, operation_payload, validate_result, prepared_texts


class ModelLoadRequest(Contract):
    scope: Scope
    plan_digest: Sha256
    artifact_id: Ref
    artifact_revision: Ref
    runtime_build_ref: Ref
    runtime_sha256: Sha256
    role: Role
    context_tokens: Annotated[int, Field(gt=0, le=131072)]
    parallel_requests: Annotated[int, Field(gt=0, le=2)] = 1
    existing_compute_owner_key: Ref
    admission_generation: Ref
    scan_id: Ref


class ModelRuntimeView(Contract):
    handle_id: Id
    request: ModelLoadRequest
    revision: Annotated[int, Field(gt=0)]
    state: Literal['uninstalled', 'downloaded', 'verified', 'loading', 'ready', 'evicting', 'stopped', 'failed']
    available: bool = False
    synthetic: bool = False
    process_pid: Annotated[int, Field(gt=0)] | None = None
    cold_start_ms: float | None = None
    updated_at: Utc
    reason_code: Ref | None = None


class LlamaCppSession:
    """Actual pinned local CPU server. Only a proven build may invoke this adapter."""
    synthetic = False

    def __init__(self, binary, arguments, artifact_id, port, token, *, timeout=20):
        self.binary, self.arguments = binary, tuple(arguments)
        self.artifact_id, self.port, self.token = artifact_id, port, token
        self.timeout, self.process, self.job = timeout, None, None
        self.stderr_target = subprocess.DEVNULL
        self._process_lock = threading.RLock()
        self._stderr_lock = threading.Lock()
        self._stderr_tail = bytearray()
        self._stderr_reader = None

    def _drain_stderr(self, stream):
        try:
            while chunk := stream.read(4096):
                with self._stderr_lock:
                    self._stderr_tail.extend(chunk)
                    if len(self._stderr_tail) > 16384:
                        del self._stderr_tail[:-16384]
        except OSError:
            return

    def stderr_tail(self):
        """Return the bounded private child diagnostic tail, when capture is enabled."""
        with self._stderr_lock:
            return bytes(self._stderr_tail)

    @classmethod
    def create(cls, manifest, request, artifact, cache, root):
        binary = root / manifest.package_relative_dir / next(file.relative_path for file in manifest.files if file.kind == 'binary')
        weights = [file for file in artifact.files if file.kind == 'weights']
        if len(weights) != 1 or artifact.format != 'gguf': raise ValueError('native_loader_requires_one_gguf')
        with socket.socket() as reservation:
            reservation.bind(('127.0.0.1', 0)); port = reservation.getsockname()[1]
        args = ['--model', str(cache / weights[0].relative_path), '--ctx-size', str(request.context_tokens),
            '--parallel', str(request.parallel_requests), '--host', '127.0.0.1', '--port', str(port),
            '--alias', request.artifact_id, '--n-gpu-layers', '0', '--threads', str(min(4,os.cpu_count() or 1))]
        adapter = next((item for item in manifest.role_adapters if item.role == request.role), None)
        if adapter is None: raise ValueError('native_role_adapter_unverified')
        from .model_adapters import adapter_binding_valid
        if not adapter_binding_valid(adapter, artifact): raise ValueError('native_role_adapter_artifact_mismatch')
        if request.role in ('embed', 'retrieve'):
            if adapter.pooling is None: raise ValueError('native_embedding_pooling_unverified')
            args += ['--embedding', '--pooling', adapter.pooling]
        projector = next((file for file in artifact.files if file.kind == 'projector'), None)
        if projector: args += ['--mmproj', str(cache / projector.relative_path), '--no-mmproj-offload']
        return cls(binary, args, request.artifact_id, port, uuid.uuid4().hex + uuid.uuid4().hex)

    def start(self, cancel, timeout=10):
        if cancel.is_set(): raise RuntimeError('model_start_cancelled')
        environment = {key: value for key, value in os.environ.items() if key.upper() in ('SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP')}
        # Private ephemeral own-server credential only; never a user's account secret.
        environment['LLAMA_API_KEY'] = self.token
        with self._process_lock:
            if cancel.is_set(): raise RuntimeError('model_start_cancelled')
            self.job = _WindowsProbeJob(memory_limit_bytes=getattr(self, 'memory_limit_bytes', None)) if os.name == 'nt' else None
            self.process = subprocess.Popen([str(self.binary), *self.arguments], cwd=self.binary.parent, env=environment,
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=self.stderr_target, shell=False,
                creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0,
                start_new_session=os.name != 'nt')
            if self.stderr_target == subprocess.PIPE and self.process.stderr is not None:
                self._stderr_reader = threading.Thread(target=self._drain_stderr, args=(self.process.stderr,),
                    name='local-model-stderr-' + uuid.uuid4().hex[:8], daemon=True)
                self._stderr_reader.start()
            if self.job: self.job.assign(self.process)
            callback = getattr(self, 'on_spawn', None)
            if callback: callback(self.process.pid)
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline and not cancel.is_set():
            exit_code = self.process.poll()
            if exit_code is not None:
                # Preserve a bounded, non-sensitive child status in the private
                # runtime reason so bootstrap diagnostics can distinguish loader
                # exits without exposing command arguments or model paths.
                raise RuntimeError(f'model_loader_exited_{int(exit_code) & 0xFFFFFFFF:08x}')
            try:
                values = self.call('/v1/models', None, timeout=1)
                if any(item.get('id') == self.artifact_id for item in values.get('data', ())):
                    from urllib.error import HTTPError
                    try: self.call('/v1/models', None, auth_token='invalid-' + uuid.uuid4().hex, timeout=1)
                    except HTTPError as error:
                        if error.code in (401, 403): return
                        raise
                    raise RuntimeError('model_private_auth_unverified')
            except (OSError, ValueError): pass
            time.sleep(.03)
        raise RuntimeError('model_start_cancelled' if cancel.is_set() else 'model_health_timeout')

    def call(self, endpoint, payload, *, auth_token=None, timeout=None):
        if endpoint not in ('/v1/models', '/tokenize', '/v1/chat/completions', '/v1/embeddings', '/embedding'):
            raise ValueError('local_runtime_endpoint_rejected')
        if self.process is None or self.process.poll() is not None: raise RuntimeError('model_process_not_alive')
        url = f'http://127.0.0.1:{self.port}{endpoint}'
        data = json.dumps(payload, allow_nan=False).encode() if payload is not None else None
        request = Request(url, data=data, headers={'Authorization': 'Bearer ' + (auth_token or self.token), 'Content-Type': 'application/json'})
        # Redirects are forbidden; there is only this exact authenticated own origin.
        from urllib.request import HTTPRedirectHandler
        class NoRedirect(HTTPRedirectHandler):
            def redirect_request(self, *args): raise ValueError('local_runtime_redirect_rejected')
        budget = min(30, timeout or self.timeout)
        watchdog = threading.Timer(budget, self.stop); watchdog.daemon = True; watchdog.start()
        try:
            with build_opener(ProxyHandler({}), NoRedirect()).open(request, timeout=budget) as response:
                content = response.read(4194305)
                if len(content) > 4194304: raise ValueError('local_runtime_response_budget_exceeded')
                value = json.loads(content)
                if not isinstance(value, dict) and not (endpoint == '/embedding' and isinstance(value, list)):
                    raise ValueError('local_runtime_response_shape_invalid')
                return value
        finally:
            watchdog.cancel()

    def stop(self, timeout=2):
        with self._process_lock:
            return self._stop_locked(timeout)

    def _stop_locked(self, timeout):
        if self.job: self.job.close()
        if self.process is not None and self.process.poll() is None:
            if os.name == 'nt': self.process.kill()
            else:
                try: os.killpg(self.process.pid, signal.SIGKILL)
                except ProcessLookupError: pass
        if self.process is not None:
            try: self.process.wait(timeout=max(.01, timeout))
            except subprocess.TimeoutExpired: return False
            if self._stderr_reader is not None and self._stderr_reader is not threading.current_thread():
                self._stderr_reader.join(timeout=.5)
        if hasattr(self.stderr_target, 'close'):
            self.stderr_target.close()
        return True


class ModelRuntimeManager:
    def __init__(self, resources, *, session_factory=None, fixture_only=False, registry=None, max_models=2):
        if max_models not in (1, 2): raise ValueError('model_residency_limit_invalid')
        self.resources, self.setup = resources, resources.setup
        self.session_factory = session_factory or LlamaCppSession.create
        self.fixture_only, self.registry, self.max_models = fixture_only, registry, max_models
        self._condition = threading.Condition(threading.RLock())
        self._handles = {}; self._closing = False

    def _owner_valid(self, request):
        from runtime.independent.manager import ComputeAdmission
        with ComputeAdmission._lock:
            return request.existing_compute_owner_key in ComputeAdmission._owners and request.scope.key in ComputeAdmission._scope_claims.get(request.existing_compute_owner_key, ()) and self.resources.generation_provider(request.scope) == request.admission_generation

    def _get(self, handle_id, scope):
        item = self._handles.get(handle_id)
        if item is None or item['view'].request.scope != scope: raise PermissionError('model_handle_not_bound_to_scope')
        return item

    def _transition(self, item, state, **values):
        with self._condition:
            if state in ('verified', 'loading', 'ready') and item['cancel'].is_set(): raise RuntimeError('model_load_revoked')
            old = item['view']; item['view'] = old.model_copy(update={'state': state, 'revision': old.revision + 1,
                  'updated_at': utc_now(), 'available': state == 'ready' and not self.fixture_only and not item.get('bootstrap'), **values})
            self._condition.notify_all()

    def inspect(self, scope, artifact_id=None, *, request=None, actor=None):
        with self._condition:
            views = tuple(item['view'] for item in self._handles.values() if item['view'].request.scope == scope and (artifact_id is None or item['view'].request.artifact_id == artifact_id))
        if views or request is None: return views
        if request.scope != scope or actor is None: raise PermissionError('model_inspection_requires_bound_scope')
        report = self.resources.inspect(scope, actor=actor, scan_id=request.scan_id, plan_digest=request.plan_digest,
            artifact_id=request.artifact_id, role=request.role, existing_compute_owner_key=request.existing_compute_owner_key,
            admission_generation=request.admission_generation)
        state = 'uninstalled' if report.artifact_integrity == 'missing' else 'downloaded' if report.artifact_integrity == 'verified' else 'failed'
        return (ModelRuntimeView(handle_id=uuid.uuid5(uuid.NAMESPACE_URL, canonical_json(request)).hex, request=request,
            revision=1, state=state, synthetic=self.fixture_only, updated_at=utc_now(), reason_code='model_not_acquired'),)

    def acquire(self, request: ModelLoadRequest, *, actor: str, _bootstrap_permit=None):
        bootstrap = _bootstrap_permit is not None
        if bootstrap:
            from .bootstrap import consume_permit
            bootstrap_ram_limit = consume_permit(_bootstrap_permit, self, request)
        plan = self.setup.approved_plan(request.scope, request.plan_digest, actor=actor)
        artifact = next((item for item in plan.artifacts if item.artifact_id == request.artifact_id), None)
        if artifact is None or artifact.revision != request.artifact_revision or request.role not in artifact.roles: raise ValueError('model_artifact_binding_changed')
        # The private, explicit bootstrap benchmark is a bounded operation
        # probe, not product agent admission. Its 4K ceiling is validated by
        # bootstrap_benchmark; ordinary loads still require the 64K agent floor.
        if request.role == 'agent' and request.context_tokens < 65536 and not bootstrap:
            raise ValueError('agent_requires_64k_context')
        if request.role == 'chat' and (request.context_tokens > 1024 or request.parallel_requests != 1):
            raise ValueError('bounded_chat_context_or_parallelism_exceeded')
        if artifact.context_limit is not None and request.context_tokens > artifact.context_limit: raise ValueError('model_context_exceeded')
        if not self._owner_valid(request): raise PermissionError('existing_compute_owner_unverified')
        report = self.resources.inspect(request.scope, actor=actor, scan_id=request.scan_id, plan_digest=request.plan_digest,
            artifact_id=request.artifact_id, role=request.role, existing_compute_owner_key=request.existing_compute_owner_key,
            admission_generation=request.admission_generation, context_tokens=request.context_tokens, parallel_requests=request.parallel_requests, placement='cpu')
        if not self.fixture_only and not bootstrap and not report.execution_ready: raise ResourceBusy('model_resources_or_runtime_unavailable')
        if self.registry is not None:
            # Existing ModelRegistry is metadata only; no provider is invoked here.
            try: self.registry.get(artifact.model_id)
            except KeyError: raise ValueError('model_registry_entry_missing') from None
        manifests = tuple(self.resources.manifest_provider(request.scope))
        from .model_adapters import select_bound_manifest
        manifest = select_bound_manifest(manifests, request, fixture_only=self.fixture_only)
        if manifest is None or next(file.sha256 for file in manifest.files if file.kind == 'binary') != request.runtime_sha256:
            raise ValueError('model_runtime_manifest_mismatch')
        if not self.fixture_only and not bootstrap:
            adapter = next((item for item in manifest.role_adapters if item.role == request.role), None)
            runtimes, profiles = self.resources.operation_provider(request.scope)
            if adapter is not None and (adapter.artifact_id != artifact.artifact_id or adapter.artifact_revision != artifact.revision):
                raise ValueError('model_role_adapter_artifact_binding_missing')
            if adapter is None or not any(operation.adapter_ref == adapter.adapter_ref and operation.role == request.role and operation.artifact_id == request.artifact_id and operation.artifact_revision == request.artifact_revision
                for runtime in runtimes if runtime.build_ref == request.runtime_build_ref for operation in runtime.operations):
                raise ValueError('model_role_adapter_proof_missing')
            if not any(profile.adapter_ref == adapter.adapter_ref and profile.artifact_id == request.artifact_id and profile.runtime_build_ref == request.runtime_build_ref for profile in profiles):
                raise ValueError('model_role_adapter_memory_proof_missing')
        proof = inspect_runtime_build(self.resources.repository_root, manifest, request.scope, utc_now())
        if proof.state != 'integrity_verified': raise ValueError('model_runtime_files_changed')
        root = Path(self.resources.cache_resolver(request.scope)); cache = root / request.plan_digest / hashlib.sha256(request.artifact_id.encode()).hexdigest()
        with self._condition:
            if self._closing: raise ResourceBusy('model_manager_closing')
            for item in self._handles.values():
                if item['view'].state in ('loading', 'ready', 'evicting') and item['view'].request.existing_compute_owner_key == request.existing_compute_owner_key:
                    if item['view'].request == request and item['view'].state != 'evicting': return item['view']
                    raise ResourceBusy('existing_compute_owner_already_has_model')
            if sum(item['view'].state in ('loading', 'ready', 'evicting') for item in self._handles.values()) >= self.max_models: raise ResourceBusy('model_residency_capacity_busy')
            identity = uuid.uuid4().hex
            view = ModelRuntimeView(handle_id=identity, request=request, revision=1, state='downloaded', synthetic=self.fixture_only, updated_at=utc_now())
            item = {'view': view, 'actor': actor, 'cancel': threading.Event(), 'done': threading.Event(), 'active': 0,
                'session': None, 'stack': None, 'lease': None, 'manifest': manifest, 'artifact': artifact, 'cache': cache,
                'bootstrap': bootstrap, 'bootstrap_ram_limit': bootstrap_ram_limit if bootstrap else None}
            self._handles[identity] = item
            worker = threading.Thread(target=self._load, args=(item,), name='local-model-' + identity[:8], daemon=True)
            item['worker'] = worker
            try: worker.start()
            except BaseException:
                self._transition(item, 'failed', reason_code='model_load_thread_failed'); item['done'].set(); raise
            return view

    def _load(self, item):
        request = item['view'].request; started = time.monotonic(); stack = ExitStack()
        try:
            item['stack'] = stack
            roots = [item['cache'], self.resources.repository_root / item['manifest'].package_relative_dir]
            seen = set()
            for root in roots:
                for directory in reversed((root, *root.parents)):
                    if directory not in seen: stack.enter_context(_pin_directory(directory)); seen.add(directory)
            for file in item['artifact'].files:
                if hash_contained_file(item['cache'], file.relative_path, file.bytes) != (file.bytes, file.sha256): raise ValueError('model_artifact_hash_changed')
                stack.enter_context(open(item['cache'] / file.relative_path, 'rb'))
            runtime_root = self.resources.repository_root / item['manifest'].package_relative_dir
            for file in item['manifest'].files:
                stream = stack.enter_context(open(runtime_root / file.relative_path, 'rb'))
                if hash_contained_file(runtime_root, file.relative_path, file.bytes) != (file.bytes, file.sha256):
                    raise ValueError('model_runtime_files_changed')
                digest = hashlib.sha256()
                for chunk in iter(lambda: stream.read(1048576), b''): digest.update(chunk)
                if stream.tell() != file.bytes or digest.hexdigest() != file.sha256:
                    raise ValueError('model_runtime_handle_changed')
                stream.seek(0)
            self.setup.approved_plan(request.scope, request.plan_digest, actor=item['actor'])
            if not self._owner_valid(request) or item['cancel'].is_set(): raise RuntimeError('model_load_revoked')
            store = self.setup._store(request.scope, item['actor'])
            lease = uuid.uuid4().hex
            with store.transaction():
                resource = 'local_ai_model:' + request.scope.key + ':' + request.existing_compute_owner_key
                if store._one("SELECT 1 FROM ia_resource_leases WHERE resource_key=? AND state='active'", (resource,)): raise ResourceBusy('model_owner_lease_busy')
                from web.api.local_ai_setup import process_identity
                host_state, host_creation = process_identity(os.getpid())
                if host_state != 'alive' or host_creation is None: raise RuntimeError('model_host_identity_unknown')
                value = {'leaseId': lease, 'resourceKey': resource, 'ownerKind': 'local_ai_model', 'handleId': item['view'].handle_id,
                    'scopeKey': request.scope.key, 'hostPid': os.getpid(), 'hostCreationIdentity': host_creation,
                    'childPid': None, 'childCreationIdentity': None, 'launchPending': True}
                store._conn.execute('INSERT INTO ia_resource_leases VALUES(?,?,?,?,?,?,?,?,?)', (lease, resource, request.scope.key, None,
                    request.admission_generation, 1, '2099-01-01T00:00:00Z', 'active', canonical_json(value)))
                item['lease'] = (store, lease)
            self._transition(item, 'verified')
            session = self.session_factory(item['manifest'], request, item['artifact'], item['cache'], self.resources.repository_root)
            if bool(session.synthetic) != self.fixture_only: raise ValueError('model_fixture_boundary_mismatch')
            # The bounded short-chat role always keeps the measured single-call
            # envelope; the caller cannot raise this host-owned process cap.
            session.memory_limit_bytes = item['bootstrap_ram_limit'] or (768 * 1024 * 1024 if request.role == 'chat' else None)
            def record_child(pid):
                state, creation = process_identity(pid)
                if state != 'alive' or creation is None: raise RuntimeError('model_child_identity_unknown')
                with store.transaction():
                    value.update(childPid=pid, childCreationIdentity=creation, launchPending=False)
                    store._conn.execute('UPDATE ia_resource_leases SET data_json=?,revision=revision+1 WHERE lease_id=? AND state=?',
                        (canonical_json(value), lease, 'active'))
            session.on_spawn = record_child
            item['session'] = session; self._transition(item, 'loading')
            session.start(item['cancel'], timeout=10)
            if not self._owner_valid(request) or item['cancel'].is_set(): raise RuntimeError('model_load_revoked')
            self.setup.approved_plan(request.scope, request.plan_digest, actor=item['actor'])
            self._transition(item, 'ready', process_pid=session.process.pid, cold_start_ms=(time.monotonic() - started) * 1000)
            guard = threading.Thread(target=self._guard, args=(item,), name='local-model-guard-' + item['view'].handle_id[:8], daemon=True)
            item['guard'] = guard; guard.start()
            return
        except Exception as exc:
            detail = str(exc)
            reason = detail if re.fullmatch(r'[a-z][a-z0-9_]{0,95}', detail) else 'model_loader_or_proof_failed'
            self._transition(item, 'evicting', reason_code=reason)
            if self._stop(item, 2): self._transition(item, 'stopped' if item['cancel'].is_set() else 'failed', process_pid=None)
        finally:
            item['done'].set()

    def wait(self, handle_id, scope, timeout=10):
        if not 0 <= timeout <= 20: raise ValueError('model_wait_budget_invalid')
        item = self._get(handle_id, scope); item['done'].wait(timeout)
        return item['view']

    def execute(self, handle_id, scope, request: RoleRequest):
        item = self._get(handle_id, scope); binding = item['view'].request
        self.setup.approved_plan(scope, binding.plan_digest, actor=item['actor'])
        if not self._owner_valid(binding):
            self.unload(handle_id, scope, timeout=2); raise PermissionError('model_compute_owner_revoked')
        if request.role != binding.role: raise ValueError('model_role_lease_mismatch')
        with self._condition:
            if item['view'].state != 'ready' or item['active'] >= binding.parallel_requests: raise ResourceBusy('model_not_ready_or_parallel_busy')
            item['active'] += 1
        try:
            session = item['session']
            adapter = next((value for value in item['manifest'].role_adapters if value.role == request.role), None)
            for text in prepared_texts(request, adapter):
                tokens = session.call('/tokenize', {'content': text, 'add_special': True}).get('tokens')
                reserve = 0 if request.role in ('embed', 'retrieve') else request.max_output_tokens + 256
                if not isinstance(tokens, list) or len(tokens) + reserve > binding.context_tokens: raise ValueError('model_input_context_exceeded')
                if adapter and adapter.max_input_tokens and len(tokens) > adapter.max_input_tokens:
                    raise ValueError('model_adapter_input_context_exceeded')
            endpoint, payload = operation_payload(request, binding.artifact_id, adapter)
            result = validate_result(request, session.call(endpoint, payload))
            if not self._owner_valid(binding): raise PermissionError('model_compute_owner_revoked')
            self.setup.approved_plan(scope, binding.plan_digest, actor=item['actor'])
            return {**result, 'synthetic': self.fixture_only, 'handleId': handle_id}
        finally:
            with self._condition: item['active'] -= 1; self._condition.notify_all()
            if item['view'].state == 'evicting' and item['active'] == 0 or item['session'].process.poll() is not None:
                self.unload(handle_id, scope, timeout=2)

    def refresh(self, handle_id, scope):
        item = self._get(handle_id, scope); request = item['view'].request
        try:
            report = self.resources.inspect(scope, actor=item['actor'], scan_id=request.scan_id, plan_digest=request.plan_digest,
                artifact_id=request.artifact_id, role=request.role, existing_compute_owner_key=request.existing_compute_owner_key,
                admission_generation=request.admission_generation, context_tokens=request.context_tokens, parallel_requests=request.parallel_requests, placement='cpu')
        except Exception:
            self.unload(handle_id, scope, timeout=2); raise
        if not self._owner_valid(request) or report.pressure in ('pressure', 'unknown') or not self.fixture_only and not report.execution_ready:
            self.unload(handle_id, scope, timeout=2)
        return report

    def _guard(self, item):
        request = item['view'].request
        while not item['cancel'].wait(.1):
            try:
                self.setup.approved_plan(request.scope, request.plan_digest, actor=item['actor'])
                valid = self._owner_valid(request)
            except Exception:
                valid = False
            if not valid or item['session'].process.poll() is not None:
                self.unload(item['view'].handle_id, request.scope, timeout=2); return

    def _stop(self, item, timeout):
        session = item['session']
        if session is not None and not session.stop(timeout): return False
        with self._condition:
            if item['active']: return False
        if item['stack']: item['stack'].close(); item['stack'] = None
        if item['lease']:
            store, lease = item['lease']; store.release_lease(lease, owner_generation=item['view'].request.admission_generation); item['lease'] = None
        return True

    def unload(self, handle_id, scope, timeout=5):
        if not 0 <= timeout <= 20: raise ValueError('model_unload_budget_invalid')
        item = self._get(handle_id, scope)
        if item['view'].state in ('stopped', 'failed'):
            # A failure label is not an exit/IO/lease cleanup acknowledgement.
            if not item['done'].is_set():return False
            return self._stop(item,timeout)
        item['cancel'].set(); self._transition(item, 'evicting')
        deadline = time.monotonic() + timeout
        item['done'].wait(max(0, deadline - time.monotonic()))
        if not item['done'].is_set():
            if item['session']: item['session'].stop(max(.01, deadline - time.monotonic()))
            return False
        with self._condition:
            while item['active'] and time.monotonic() < deadline: self._condition.wait(max(0, deadline - time.monotonic()))
        if not self._stop(item, max(.01, deadline - time.monotonic())): return False
        self._transition(item, 'stopped', process_pid=None)
        return True

    def close(self, timeout=10):
        with self._condition: self._closing = True; items = tuple(self._handles.values())
        deadline = time.monotonic() + min(20, max(0, timeout)); ok = True
        for item in items:
            if not self.unload(item['view'].handle_id, item['view'].request.scope, max(0, deadline - time.monotonic())): ok = False
        return ok
