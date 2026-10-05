"""Real local sockets/IO and actual downloader shutdown, never external models."""
import io
import os
import socket
import threading
import time
import uuid
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, ProxyHandler, build_opener
import pytest
from test_local_ai_setup import setup_env, approved, DATA, catalog
from test_local_ai_setup_leaf import runner_for, make_plan, BlockingTransport
from runtime.independent.store import ResourceBusy
from runtime.local_ai.installer import LocalAiInstaller, StrictRedirects, HubTransport, allowed_url
from web.api.local_ai_setup import handle_local_ai_setup, shutdown_local_ai_setup, register_local_ai_setup_runner, _RUNNERS


@pytest.fixture
def local_http():
    release = threading.Event(); entered = threading.Event(); requests = []
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def do_GET(self):
            requests.append((self.path, self.headers.get('Range')))
            mode, filename = self.path.strip('/').split('/', 1); value = DATA[filename]
            offset = int(self.headers['Range'][6:-1]) if self.headers.get('Range') else 0
            if mode == 'redirect':
                self.send_response(302); self.send_header('Location', 'https://untrusted.invalid/weights'); self.end_headers(); return
            if mode == 'short': value = value[:-1]
            if mode == 'over': value += b'x'
            status = 206 if offset and mode != 'ignore-range' else 200
            if status == 200: offset = 0
            self.send_response(status)
            if status == 206:
                self.send_header('Content-Range', f'bytes {offset + (mode == "bad-range")}-{len(DATA[filename])-1}/{len(DATA[filename])}')
            if mode == 'encoding': self.send_header('Content-Encoding', 'gzip')
            if mode == 'bad-length': self.send_header('Content-Length', str(len(DATA[filename]) + 1))
            if mode == 'duplicate-length':
                self.send_header('Content-Length', str(len(DATA[filename]))); self.send_header('Content-Length', '999')
            self.end_headers()
            if mode == 'blocked':
                entered.set(); release.wait(5)
            try: self.wfile.write(value[offset:]); self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError): pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler); server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    try: yield server.server_address, release, entered, requests
    finally:
        release.set(); server.shutdown(); server.server_close(); thread.join(2)


class LoopbackFixtureTransport:
    """Test-only URL substitution. Product HubTransport still requires HTTPS."""
    def __init__(self, address, mode='normal', timeout=.2): self.address, self.mode, self.timeout = address, mode, timeout
    @contextmanager
    def open(self, manifest_url, offset):
        allowed_url(manifest_url)
        filename = manifest_url.rsplit('/', 1)[1]
        url = f'http://127.0.0.1:{self.address[1]}/{self.mode}/{filename}'
        headers = {'Accept-Encoding': 'identity'}
        if offset: headers['Range'] = f'bytes={offset}-'
        opener = build_opener(ProxyHandler({}), StrictRedirects())
        with opener.open(Request(url, headers=headers), timeout=self.timeout) as response: yield response


def test_actual_loopback_download_and_200_restart_of_partial(setup_env, local_http):
    from test_local_ai_installer import target, MemoryTransport
    service, scope, _, cache, _ = setup_env; plan = approved(service, scope)
    path = target(cache, plan).with_name('tiny.gguf.partial'); path.parent.mkdir(parents=True); path.write_bytes(DATA['tiny.gguf'][:5])
    transport = LoopbackFixtureTransport(local_http[0], 'ignore-range')
    result = LocalAiInstaller(service, lambda _: cache, transport=transport).install(scope, actor='default', plan_digest=plan.plan_digest)
    assert result.verified_bytes == sum(map(len, DATA.values()))
    assert local_http[3][0][1] == 'bytes=5-'
    assert target(cache, plan).read_bytes() == DATA['tiny.gguf']


@pytest.mark.parametrize('mode', ['short', 'over', 'encoding', 'bad-length', 'duplicate-length', 'redirect'])
def test_actual_http_manipulations_never_publish(setup_env, local_http, mode):
    from test_local_ai_installer import target
    service, scope, _, cache, _ = setup_env; plan = approved(service, scope)
    with pytest.raises(ValueError):
        LocalAiInstaller(service, lambda _: cache, transport=LoopbackFixtureTransport(local_http[0], mode)).install(scope, actor='default', plan_digest=plan.plan_digest)
    assert not target(cache, plan).exists()
    assert len(local_http[3]) == 1  # no connection to rejected redirect destination


def test_actual_socket_timeout_bounds_read_without_publishing(setup_env, local_http):
    from test_local_ai_installer import target
    service, scope, _, cache, _ = setup_env; plan = approved(service, scope)
    before = time.monotonic()
    with pytest.raises((TimeoutError, socket.timeout)):
        LocalAiInstaller(service, lambda _: cache, transport=LoopbackFixtureTransport(local_http[0], 'blocked', timeout=.05)).install(scope, actor='default', plan_digest=plan.plan_digest)
    assert time.monotonic() - before < 2
    assert local_http[2].is_set() and not target(cache, plan).exists()


def test_shutdown_hook_keeps_real_blocked_runner_until_fd_ack(setup_env):
    service, scope, _, cache, _ = setup_env; transport = BlockingTransport(); runner = runner_for(service, cache, transport)
    plan = make_plan(service, scope, runner)
    payload = {'operation': 'start', 'planDigest': plan['planDigest'], 'clientRequestId': uuid.uuid4().hex}
    job = handle_local_ai_setup(service.profile_hub, scope, 'default', payload, installer_runner=runner)['job']
    try:
        assert transport.entered.wait(5)
        assert shutdown_local_ai_setup(service.profile_hub, timeout=.01) is False
        assert _RUNNERS.get(service.profile_hub) is runner
        assert runner.status(scope, actor='default', job_id=job['jobId']).state == 'stopping'
        with pytest.raises(ResourceBusy): handle_local_ai_setup(service.profile_hub, scope, 'default', payload, installer_runner=runner)
        assert service.read(scope, actor='default').revision == 1  # Hub remains actually open
    finally:
        transport.release.set(); assert runner.wait(job['jobId'], 5)
    assert shutdown_local_ai_setup(service.profile_hub, timeout=.01) is True
    assert _RUNNERS.get(service.profile_hub) is None
    assert runner.status(scope, actor='default', job_id=job['jobId']).state == 'cancelled'


def test_shutdown_unknown_persistence_never_returns_false_stopped_proof(setup_env):
    service, scope, _, _, _ = setup_env
    service.read(scope, actor='default')
    store, _ = service.profile_hub.by_scope(scope, 'default')
    store._conn.execute("UPDATE ia_profile_refs SET name='unverifiable-profile'")
    assert shutdown_local_ai_setup(service.profile_hub, timeout=.01) is False


def test_product_timeout_contract_and_https_origin_unchanged():
    assert HubTransport().timeout == 20
    with pytest.raises(ValueError): HubTransport(timeout=21)
    with pytest.raises(ValueError): allowed_url('http://127.0.0.1/file')
    with pytest.raises(ValueError): allowed_url(' https://huggingface.co/file')


def test_registered_trusted_setup_is_shared_by_every_leaf_operation(setup_env):
    service, scope, _, cache, _ = setup_env; runner = runner_for(service, cache)
    register_local_ai_setup_runner(service.profile_hub, runner)
    register_local_ai_setup_runner(service.profile_hub, runner)  # idempotent same object
    def call(payload, **kwargs):
        return handle_local_ai_setup(service.profile_hub, scope, 'default', payload, **kwargs)
    assert call({'operation': 'get'})['preferences']['revision'] == 0
    call({'operation': 'select', 'choice': {'expectedRevision': 0, 'clientRequestId': uuid.uuid4().hex,
        'decision': 'local', 'preset': 'lightweight', 'artifactIds': [catalog().artifacts[0].artifact_id]}})
    plan = call({'operation': 'plan', 'expectedRevision': 1, 'clientRequestId': uuid.uuid4().hex})['plan']
    assert plan['catalogRevision'] == 'controlled-catalog-1'
    call({'operation': 'confirm', 'planDigest': plan['planDigest'], 'licenseDigests': [catalog().artifacts[0].license_digest],
        'clientRequestId': uuid.uuid4().hex}, private_human_action=lambda *_: True)
    job = call({'operation': 'start', 'planDigest': plan['planDigest'], 'clientRequestId': uuid.uuid4().hex})['job']
    assert runner.wait(job['jobId'], 5)
    assert call({'operation': 'status', 'jobId': job['jobId']})['job']['state'] == 'complete'
    with pytest.raises(ResourceBusy): register_local_ai_setup_runner(service.profile_hub, runner_for(service, cache))
    assert shutdown_local_ai_setup(service.profile_hub, timeout=.01) is True
    with pytest.raises(ResourceBusy): register_local_ai_setup_runner(service.profile_hub, runner)


def test_real_windows_parent_pin_blocks_cache_replacement_during_http_read(setup_env, local_http):
    from web.api.local_ai_setup import LocalAiInstallJobs, StartRequest
    if os.name != 'nt': pytest.skip('native Windows directory handle exclusion')
    service, scope, _, cache, _ = setup_env
    runner = LocalAiInstallJobs(service, lambda _: cache, installer_factory=lambda setup, resolver:
        LocalAiInstaller(setup, resolver, transport=LoopbackFixtureTransport(local_http[0], 'blocked', timeout=.5)))
    plan = make_plan(service, scope, runner)
    job = runner.start(scope, StartRequest(operation='start', plan_digest=plan['planDigest'], client_request_id=uuid.uuid4().hex), actor='default')
    try:
        assert local_http[2].wait(5)
        with pytest.raises(OSError): cache.rename(cache.with_name('controlled-replaced-cache'))
        assert cache.is_dir()
    finally:
        local_http[1].set(); assert runner.wait(job.job_id, 5)
    assert runner.status(scope, actor='default', job_id=job.job_id).state == 'complete'


def test_actual_http_wrong_resume_range_rejected(setup_env, local_http):
    from test_local_ai_installer import target
    service, scope, _, cache, _ = setup_env; plan = approved(service, scope)
    partial = target(cache, plan).with_name('tiny.gguf.partial'); partial.parent.mkdir(parents=True); partial.write_bytes(DATA['tiny.gguf'][:5])
    with pytest.raises(ValueError, match='range'):
        LocalAiInstaller(service, lambda _: cache, transport=LoopbackFixtureTransport(local_http[0], 'bad-range')).install(scope, actor='default', plan_digest=plan.plan_digest)
    assert partial.read_bytes() == DATA['tiny.gguf'][:5] and not target(cache, plan).exists()


def test_actual_setup_change_during_blocked_io_prevents_publish(setup_env):
    from test_local_ai_installer import target
    from runtime.local_ai.setup import SetupChoice, InstallPlan
    from web.api.local_ai_setup import StartRequest
    service, scope, _, cache, _ = setup_env; transport = BlockingTransport(); runner = runner_for(service, cache, transport)
    plan = make_plan(service, scope, runner)
    job = runner.start(scope, StartRequest(operation='start', plan_digest=plan['planDigest'], client_request_id=uuid.uuid4().hex), actor='default')
    try:
        assert transport.entered.wait(5)
        service.select(scope, SetupChoice(expected_revision=1, client_request_id=uuid.uuid4().hex, decision='skip'), actor='default')
    finally:
        transport.release.set(); assert runner.wait(job.job_id, 5)
    result = runner.status(scope, actor='default', job_id=job.job_id)
    assert result.state == 'failed' and result.error_code == 'download_setup_or_consent_changed'
    assert not target(cache, InstallPlan.model_validate(plan)).exists()


def test_two_actual_processes_busy_crash_resume_and_stale_consent(setup_env):
    import json
    import pathlib
    import subprocess
    import sys
    from test_local_ai_installer import target
    from runtime.independent.scope_binding import ProfileHub
    from runtime.local_ai.setup import LocalAiSetup, SetupChoice
    from web.api.local_ai_setup import StartRequest, process_identity
    service, scope, other, cache, home = setup_env; runner = runner_for(service, cache)
    plan = make_plan(service, scope, runner)
    marker = cache.parent / 'download-child-chunk-ready.json'
    root = pathlib.Path(__file__).resolve().parents[3]
    code = '''
import sys,pathlib,threading,uuid,json
from contextlib import contextmanager
sys.path[:0]=[str(pathlib.Path(sys.argv[1])/'services/sidekick'),str(pathlib.Path(sys.argv[1])/'services/sidekick/tests')]
sys.path.append(sys.argv[7])
from runtime.independent.scope_binding import ProfileHub
from runtime.independent.contracts import Scope
from runtime.local_ai.setup import LocalAiSetup
from test_local_ai_setup import catalog
from test_local_ai_installer import MemoryTransport
from test_local_ai_setup_leaf import runner_for
from web.api.local_ai_setup import StartRequest
class ChunkThenBlock(MemoryTransport):
    def __init__(self):super().__init__();self.entered=threading.Event()
    @contextmanager
    def open(self,url,offset):
        with super().open(url,offset) as response:
            original=response.read;count=[0]
            def read(size):
                count[0]+=1
                if count[0]==1:return original(min(size,5))
                self.entered.set();threading.Event().wait(60);return original(size)
            response.read=read;yield response
home=pathlib.Path(sys.argv[2]);hub=ProfileHub(home,default_state_dir=home/'webui');scope=Scope.model_validate_json(sys.argv[3])
transport=ChunkThenBlock();runner=runner_for(LocalAiSetup(hub,catalog_provider=catalog),pathlib.Path(sys.argv[4]),transport)
job=runner.start(scope,StartRequest(operation='start',plan_digest=sys.argv[5],client_request_id=uuid.uuid4().hex),actor='default')
assert transport.entered.wait(5)
pathlib.Path(sys.argv[6]).write_text(json.dumps({'jobId':job.job_id,'pid':job.owner_pid,'start':job.owner_process_start}))
threading.Event().wait(60)
'''
    child = subprocess.Popen([sys.executable, '-I', '-B', '-c', code, str(root), str(home), scope.model_dump_json(by_alias=True), str(cache),
        plan['planDigest'], str(marker), str(pathlib.Path(pytest.__file__).parent.parent)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    new_hub = None
    try:
        deadline = time.monotonic() + 8
        while not marker.exists() and child.poll() is None and time.monotonic() < deadline: time.sleep(.02)
        if not marker.exists():
            child.kill(); _, error = child.communicate(timeout=5); pytest.fail(error.decode(errors='replace'))
        data = json.loads(marker.read_text())
        assert process_identity(data['pid']) == ('alive', data['start'])
        live = runner.status(scope, actor='default', job_id=data['jobId'])
        assert live.state == 'downloading' and live.downloaded_bytes == 5
        with pytest.raises(ResourceBusy): runner.start(scope, StartRequest(operation='start', plan_digest=plan['planDigest'], client_request_id=uuid.uuid4().hex), actor='default')
        with pytest.raises(ValueError): runner.status(other, actor='default', job_id=data['jobId'])
        # An empty local registry cannot ACK somebody else's live FD ownership.
        assert shutdown_local_ai_setup(service.profile_hub, timeout=.01) is False
        child.kill(); child.wait(timeout=5)
        assert runner.status(scope, actor='default', job_id=data['jobId']).state == 'interrupted'
        from runtime.local_ai.setup import InstallPlan
        bound_plan = InstallPlan.model_validate(plan)
        assert target(cache, bound_plan).with_name('tiny.gguf.partial').stat().st_size == 5
        service.profile_hub.close()
        new_hub = ProfileHub(home, default_state_dir=home / 'webui')
        from test_local_ai_installer import MemoryTransport
        setup2 = LocalAiSetup(new_hub, catalog_provider=catalog); transport = MemoryTransport()
        runner2 = runner_for(setup2, cache, transport)
        resumed = runner2.start(scope, StartRequest(operation='start', plan_digest=plan['planDigest'], client_request_id=uuid.uuid4().hex), actor='default')
        assert runner2.wait(resumed.job_id, 5)
        assert runner2.status(scope, actor='default', job_id=resumed.job_id).state == 'complete'
        assert transport.calls[0] == ('tiny.gguf', 5)
        setup2.select(scope, SetupChoice(expected_revision=1, client_request_id=uuid.uuid4().hex, decision='skip'), actor='default')
        from runtime.independent.store import RevisionConflict
        with pytest.raises(RevisionConflict):
            runner2.start(scope, StartRequest(operation='start', plan_digest=plan['planDigest'], client_request_id=uuid.uuid4().hex), actor='default')
    finally:
        if child.poll() is None: child.kill()
        child.communicate(timeout=5)
        if new_hub: new_hub.close()
