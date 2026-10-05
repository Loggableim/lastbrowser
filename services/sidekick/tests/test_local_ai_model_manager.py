"""Actual synthetic local HTTP loader children, never real model downloads."""
import pathlib
import sys
import threading
import time
import uuid
from contextlib import contextmanager
import pytest
from test_local_ai_setup import setup_env, approved
from test_local_ai_installer import MemoryTransport
from test_local_ai_runtime_resources import resource_manager, manifest_fixture
from runtime.independent.manager import ComputeAdmission
from runtime.independent.store import ResourceBusy
from runtime.local_ai.installer import LocalAiInstaller
from runtime.local_ai.model_manager import ModelLoadRequest, ModelRuntimeManager, LlamaCppSession
from runtime.local_ai.role_adapters import RoleRequest, validate_result
from runtime.local_ai.benchmark import benchmark_operation

SERVER = '''
import os,sys,json,time
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
port=int(sys.argv[1]);alias=sys.argv[2];role=sys.argv[3]
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.headers.get('Authorization')!='Bearer '+os.environ['LLAMA_API_KEY']:self.send_error(403);return
  self.send_response(200);self.end_headers();self.wfile.write(json.dumps({'data':[{'id':alias}]}).encode())
 def do_POST(self):
  if self.headers.get('Authorization')!='Bearer '+os.environ['LLAMA_API_KEY']:self.send_error(403);return
  body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  if self.path=='/tokenize':value={'tokens':list(range(len(body['content'].split())))}
  elif self.path=='/v1/embeddings':value={'data':[{'index':i,'embedding':[0.0]*1024 if role=='embed' else [[0.0]*128]} for i,_ in enumerate(body['input'])]}
  else:
   text=body['messages'][0]['content']
   if text=='slow':time.sleep(.5)
   value={'choices':[{'message':{'content':json.dumps({'fixture':True}) if role=='extract' else 'fixture response'}}]}
  self.send_response(200);self.end_headers();self.wfile.write(json.dumps(value).encode())
ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
'''


class FixtureSession(LlamaCppSession):
    synthetic = True
    @classmethod
    def create(cls, manifest, request, artifact, cache, root):
        import socket
        with socket.socket() as sock: sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
        return cls(pathlib.Path(sys.executable).resolve(), ('-I', '-c', SERVER, str(port), artifact.artifact_id, request.role), artifact.artifact_id, port, uuid.uuid4().hex)


@contextmanager
def manager_env(environment, *, fixture=True, factory=FixtureSession.create, role='extract'):
    service, scope, other, cache, _ = environment; plan = approved(service, scope)
    if role != 'extract':
        from test_local_ai_setup import catalog
        from runtime.local_ai.setup import SetupChoice
        artifact = catalog().artifacts[0].model_copy(update={'roles': (role,), 'context_limit': 131072})
        service.catalog_provider = lambda: catalog().model_copy(update={'artifacts': (artifact,)})
        service.select(scope, SetupChoice(expected_revision=1, client_request_id=uuid.uuid4().hex, decision='local', preset='balanced', artifact_ids=(artifact.artifact_id,)), actor='default')
        plan = service.plan(scope, actor='default', expected_revision=2, client_request_id=uuid.uuid4().hex)
        service.confirm_plan(scope, actor='default', plan_digest=plan.plan_digest, license_digests=(artifact.license_digest,), client_request_id=uuid.uuid4().hex, private_human_action=lambda *_: True)
    LocalAiInstaller(service, lambda _: cache, transport=MemoryTransport()).install(scope, actor='default', plan_digest=plan.plan_digest)
    manifest = manifest_fixture(cache)
    resources = resource_manager(service, scope, cache); resources.manifest_provider = lambda _: (manifest,)
    owner = uuid.uuid4().hex; assert ComputeAdmission.acquire(owner, scope)
    manager = ModelRuntimeManager(resources, session_factory=factory, fixture_only=fixture)
    request = ModelLoadRequest(scope=scope, plan_digest=plan.plan_digest, artifact_id=plan.artifacts[0].artifact_id,
        artifact_revision=plan.artifacts[0].revision, runtime_build_ref=manifest.build_ref, runtime_sha256=manifest.files[0].sha256,
        role=role, context_tokens=65536 if role == 'agent' else 1024, existing_compute_owner_key=owner, admission_generation='generation-1', scan_id='scan-1')
    try: yield manager, request, scope, other, service, owner
    finally: assert manager.close(5); ComputeAdmission.release(owner)


def test_actual_loader_lifecycle_typed_extraction_and_benchmark_is_synthetic(setup_env):
    with manager_env(setup_env) as (manager, request, scope, other, service, owner):
        start = manager.acquire(request, actor='default')
        view = manager.wait(start.handle_id, scope, 5)
        assert view.state == 'ready' and view.synthetic and not view.available and view.process_pid
        assert manager.acquire(request, actor='default').handle_id == view.handle_id
        call = RoleRequest(role='extract', texts=('extract these fields',), max_output_tokens=16)
        assert manager.execute(view.handle_id, scope, call)['extraction'] == {'fixture': True}
        report = benchmark_operation(manager, view.handle_id, scope, call, opt_in=True, samples=2, warmups=1)
        assert report['synthetic'] and not report['recommendationEligible'] and report['qualityPassed'] is None
        assert report['p95Ms'] > 0 and report['coldStartMs'] > 0 and report['peakObservedResidentBytes'] > 0
        with pytest.raises(PermissionError): manager.execute(view.handle_id, other, call)
        store = service._store(scope, 'default'); before = store.get_permission_state(scope)
        assert manager.unload(view.handle_id, scope, 5)
        assert manager.inspect(scope)[0].state == 'stopped'
        assert store.get_permission_state(scope) == before and owner in ComputeAdmission._owners
        from web.api.local_ai_setup import process_identity
        assert process_identity(view.process_pid)[0] == 'dead'


def test_product_without_real_operation_proof_never_launches_fixture(setup_env):
    with manager_env(setup_env, fixture=False) as (manager, request, scope, *_):
        with pytest.raises(ResourceBusy): manager.acquire(request, actor='default')
        assert manager.inspect(scope) == ()


def test_native_loader_preserves_bounded_child_exit_code(monkeypatch):
    class ExitedProcess:
        def poll(self): return 0xC0000135

    class Job:
        def __init__(self, **_kwargs): pass
        def assign(self, _process): pass

    monkeypatch.setattr('runtime.local_ai.model_manager.subprocess.Popen', lambda *_args, **_kwargs: ExitedProcess())
    monkeypatch.setattr('runtime.local_ai.model_manager._WindowsProbeJob', Job)
    session = LlamaCppSession(pathlib.Path(sys.executable).resolve(), (), 'model', 12345, 'ephemeral-test-token')
    with pytest.raises(RuntimeError, match='model_loader_exited_c0000135'):
        session.start(threading.Event())


def test_actual_health_timeout_and_cleanup(setup_env):
    class Hung(FixtureSession):
        @classmethod
        def create(cls, manifest, request, artifact, cache, root):
            return cls(pathlib.Path(sys.executable).resolve(), ('-I', '-c', 'import time;time.sleep(30)'), artifact.artifact_id, 1, uuid.uuid4().hex)
        def start(self, cancel, timeout=10): return super().start(cancel, timeout=.2)
    with manager_env(setup_env, factory=Hung.create) as (manager, request, scope, *_):
        view = manager.acquire(request, actor='default'); result = manager.wait(view.handle_id, scope, 5)
        assert result.state == 'failed' and not result.available


def test_idle_owner_revoke_drains_real_child_automatically(setup_env):
    with manager_env(setup_env) as (manager, request, scope, other, service, owner):
        view = manager.wait(manager.acquire(request, actor='default').handle_id, scope, 5)
        ComputeAdmission.release(owner)
        deadline = time.monotonic() + 4
        while manager.inspect(scope)[0].state != 'stopped' and time.monotonic() < deadline: time.sleep(.02)
        assert manager.inspect(scope)[0].state == 'stopped'
        from web.api.local_ai_setup import process_identity
        assert process_identity(view.process_pid)[0] == 'dead'


def test_unknown_pressure_evicts_and_freezes_cache_until_actual_stop(setup_env):
    with manager_env(setup_env) as (manager, request, scope, *_):
        view = manager.wait(manager.acquire(request, actor='default').handle_id, scope, 5)
        import os
        if os.name == 'nt':
            with pytest.raises(OSError): manager._get(view.handle_id, scope)['cache'].rename(manager._get(view.handle_id, scope)['cache'].with_name('changed-cache'))
        original = manager.resources.inspect
        manager.resources.inspect = lambda *args, **kwargs: original(*args, **kwargs).model_copy(update={'pressure': 'unknown'})
        assert manager.refresh(view.handle_id, scope).pressure == 'unknown'
        assert manager.inspect(scope)[0].state == 'stopped'


def test_role_vector_matrix_and_extraction_shapes_fail_closed():
    embed = RoleRequest(role='embed', texts=('x',))
    assert len(validate_result(embed, {'data': [{'index': 0, 'embedding': [0.0] * 1024}]})['embeddings'][0]) == 1024
    with pytest.raises(ValueError): validate_result(embed, {'data': [{'index': 0, 'embedding': [0.0] * 128}]})
    retrieve = RoleRequest(role='retrieve', texts=('x',))
    assert validate_result(retrieve, {'data': [{'index': 0, 'embedding': [[0.0] * 128]}]})['role'] == 'retrieve'
    with pytest.raises(ValueError): validate_result(retrieve, {'data': [{'index': 0, 'embedding': [0.0] * 128}]})


@pytest.mark.parametrize('role', ['agent', 'embed', 'retrieve', 'vision'])
def test_actual_fixture_role_endpoints_never_become_smart_quality(setup_env, role):
    import base64
    with manager_env(setup_env, role=role) as (manager, request, scope, *_):
        view = manager.wait(manager.acquire(request, actor='default').handle_id, scope, 5)
        image = base64.b64encode(b'\x89PNG\r\n\x1a\ncontrolled-fixture').decode() if role == 'vision' else None
        call = RoleRequest(role=role, texts=('controlled input',), max_output_tokens=16, image_base64=image)
        result = manager.execute(view.handle_id, scope, call)
        assert result['role'] == role and result['synthetic']
        report = benchmark_operation(manager, view.handle_id, scope, call, opt_in=True, samples=1, warmups=0)
        assert report['qualityPassed'] is None and not report['recommendationEligible']


def test_stop_during_actual_request_keeps_eviction_until_io_ack(setup_env):
    import threading
    with manager_env(setup_env) as (manager, request, scope, *_):
        view = manager.wait(manager.acquire(request, actor='default').handle_id, scope, 5)
        done = threading.Event(); errors = []
        def call():
            try: manager.execute(view.handle_id, scope, RoleRequest(role='extract', texts=('slow',), max_output_tokens=16))
            except Exception as exc: errors.append(type(exc).__name__)
            finally: done.set()
        thread = threading.Thread(target=call); thread.start()
        deadline = time.monotonic() + 2
        while manager._get(view.handle_id, scope)['active'] == 0 and time.monotonic() < deadline: time.sleep(.01)
        assert manager._get(view.handle_id, scope)['active'] == 1
        stopped = manager.unload(view.handle_id, scope, timeout=0)
        if not stopped: assert manager.inspect(scope)[0].state == 'evicting'
        assert done.wait(3); thread.join(1)
        assert manager.unload(view.handle_id, scope, timeout=2)
        assert manager.inspect(scope)[0].state == 'stopped'


def test_benchmark_requires_explicit_optin(setup_env):
    with manager_env(setup_env) as (manager, request, scope, *_):
        view = manager.wait(manager.acquire(request, actor='default').handle_id, scope, 5)
        with pytest.raises(PermissionError): benchmark_operation(manager, view.handle_id, scope, RoleRequest(role='extract', texts=('x',)))
