"""Actual tiny background IO and existing ProfileHub DB; no external downloads."""
import uuid
import threading
import pytest
from pydantic import ValidationError
from test_local_ai_setup import setup_env, catalog, DATA
from test_local_ai_installer import MemoryTransport
from runtime.local_ai.installer import LocalAiInstaller
from runtime.independent.store import ResourceBusy
from web.api.local_ai_setup import handle_local_ai_setup, LocalAiInstallJobs, StartRequest, CancelRequest, process_identity


def runner_for(service, cache, transport=None, probe=process_identity):
    return LocalAiInstallJobs(service, lambda _: cache, process_probe=probe,
        installer_factory=lambda setup, resolver: LocalAiInstaller(setup, resolver, transport=transport or MemoryTransport()))


def make_plan(service, scope, runner):
    def call(payload, **kwargs):
        return handle_local_ai_setup(service.profile_hub, scope, 'default', payload, installer_runner=runner, **kwargs)
    prefs = call({'operation': 'select', 'choice': {'expectedRevision': 0, 'clientRequestId': uuid.uuid4().hex,
        'decision': 'local', 'preset': 'lightweight', 'artifactIds': [catalog().artifacts[0].artifact_id]}})
    assert prefs['preferences']['revision'] == 1
    plan = call({'operation': 'plan', 'expectedRevision': 1, 'clientRequestId': uuid.uuid4().hex})['plan']
    call({'operation': 'confirm', 'planDigest': plan['planDigest'], 'licenseDigests': [catalog().artifacts[0].license_digest],
        'clientRequestId': uuid.uuid4().hex}, private_human_action=lambda actual, digest: actual == scope and digest == plan['planDigest'])
    return plan


def test_leaf_full_tiny_flow_progress_events_replay_and_existing_permissions(setup_env):
    service, scope, _, cache, _ = setup_env; transport = MemoryTransport(); runner = runner_for(service, cache, transport)
    store, _ = service.profile_hub.by_scope(scope, 'default'); permissions = store.get_permission_state(scope)
    plan = make_plan(service, scope, runner)
    payload = {'operation': 'start', 'planDigest': plan['planDigest'], 'clientRequestId': uuid.uuid4().hex}
    started = handle_local_ai_setup(service.profile_hub, scope, 'default', payload, installer_runner=runner)['job']
    assert started['state'] == 'pending' and started['downloadedBytes'] is None
    assert runner.wait(started['jobId'], 5)
    final = runner.status(scope, actor='default', job_id=started['jobId'])
    assert final.state == 'complete' and final.verified_bytes == sum(map(len, DATA.values()))
    assert final.downloaded_bytes == final.total_bytes and final.execution_unavailable
    replay = handle_local_ai_setup(service.profile_hub, scope, 'default', payload, installer_runner=runner)['job']
    assert replay['jobId'] == started['jobId'] and replay['state'] == 'complete' and len(transport.calls) == 2
    events = [event for event in store.events_after(scope, 0) if event.kind == 'connection_setup_changed' and event.payload.get('capabilityId') == 'local-ai']
    states = [event.payload['job']['state'] for event in events]
    assert states[0] == 'pending' and 'downloading' in states and 'verifying' in states and states[-1] == 'complete'
    assert store.get_permission_state(scope) == permissions
    assert not [lease for lease in store.list_leases() if lease['resourceKey'].startswith('local_ai_download:')]


class BlockingTransport(MemoryTransport):
    def __init__(self): super().__init__(); self.entered = threading.Event(); self.release = threading.Event()
    def open(self, url, offset):
        original = super().open(url, offset)
        transport = self
        class Context:
            def __enter__(self):
                self.response = original.__enter__(); self.read = self.response.read
                def blocked(size):
                    transport.entered.set()
                    if not transport.release.wait(5): raise RuntimeError('controlled_block_timeout')
                    return self.read(size)
                self.response.read = blocked
                return self.response
            def __exit__(self, *args): return original.__exit__(*args)
        return Context()


def test_cancel_stopping_until_actual_io_exit_and_single_plan_lease(setup_env):
    service, scope, _, cache, _ = setup_env; transport = BlockingTransport(); runner = runner_for(service, cache, transport)
    plan = make_plan(service, scope, runner)
    job = runner.start(scope, StartRequest(operation='start', plan_digest=plan['planDigest'], client_request_id=uuid.uuid4().hex), actor='default')
    try:
        assert transport.entered.wait(5)
        with pytest.raises(ResourceBusy):
            runner.start(scope, StartRequest(operation='start', plan_digest=plan['planDigest'], client_request_id=uuid.uuid4().hex), actor='default')
        stopped = runner.cancel(scope, CancelRequest(operation='cancel', job_id=job.job_id, client_request_id=uuid.uuid4().hex), actor='default')
        assert stopped.state == 'stopping'
        assert not runner.wait(job.job_id, .01)
        store, _ = service.profile_hub.by_scope(scope, 'default')
        assert any(lease['leaseId'] == job.lease_id for lease in store.list_leases())
    finally:
        transport.release.set(); assert runner.wait(job.job_id, 5)
    final = runner.status(scope, actor='default', job_id=job.job_id)
    assert final.state == 'cancelled'
    assert not any(lease['leaseId'] == job.lease_id for lease in store.list_leases())


def test_two_spaces_cannot_read_cancel_or_inherit_job_and_cache_capture(setup_env):
    service, scope, other, cache, _ = setup_env; transport = BlockingTransport(); runner = runner_for(service, cache, transport)
    plan = make_plan(service, scope, runner)
    job = runner.start(scope, StartRequest(operation='start', plan_digest=plan['planDigest'], client_request_id=uuid.uuid4().hex), actor='default')
    try:
        assert transport.entered.wait(5)
        assert runner.status(other, actor='default') == ()
        with pytest.raises(ValueError): runner.status(other, actor='default', job_id=job.job_id)
        with pytest.raises(ValueError): runner.cancel(other, CancelRequest(operation='cancel', job_id=job.job_id, client_request_id=uuid.uuid4().hex), actor='default')
        runner.cache_resolver = lambda _: (_ for _ in ()).throw(RuntimeError('profile_switched'))
    finally:
        transport.release.set(); assert runner.wait(job.job_id, 5)
    assert runner.status(scope, actor='default', job_id=job.job_id).state == 'complete'


def test_empty_registry_and_new_generation_do_not_interrupt_live_process(setup_env):
    service, scope, _, cache, _ = setup_env; transport = BlockingTransport(); runner = runner_for(service, cache, transport)
    plan = make_plan(service, scope, runner)
    job = runner.start(scope, StartRequest(operation='start', plan_digest=plan['planDigest'], client_request_id=uuid.uuid4().hex), actor='default')
    try:
        assert transport.entered.wait(5)
        reopened = runner_for(service, cache)
        assert reopened.status(scope, actor='default', job_id=job.job_id).state in ('running', 'downloading')
        assert reopened._threads == {}
    finally:
        transport.release.set(); assert runner.wait(job.job_id, 5)


@pytest.mark.parametrize('field', ['scope', 'url', 'exePath', 'privateHumanAction', 'explicitValidatedConsent'])
def test_leaf_strict_get_rejects_renderer_context_or_authority(setup_env, field):
    service, scope, _, _, _ = setup_env
    with pytest.raises(ValidationError): handle_local_ai_setup(service.profile_hub, scope, 'default', {'operation': 'get', field: 'forged'})


def test_confirm_without_private_human_callback_cannot_authorize_download(setup_env):
    from test_local_ai_setup import choose
    service, scope, _, cache, _ = setup_env; runner = runner_for(service, cache); choose(service, scope)
    plan = service.plan(scope, actor='default', expected_revision=1, client_request_id=uuid.uuid4().hex)
    with pytest.raises(PermissionError):
        handle_local_ai_setup(service.profile_hub, scope, 'default', {'operation': 'confirm', 'planDigest': plan.plan_digest,
            'licenseDigests': [plan.artifacts[0].license_digest], 'clientRequestId': uuid.uuid4().hex}, installer_runner=runner)
    with pytest.raises(PermissionError): runner.start(scope, StartRequest(operation='start', plan_digest=plan.plan_digest, client_request_id=uuid.uuid4().hex), actor='default')


def test_completed_status_survives_actual_profile_hub_reopen(setup_env):
    from runtime.independent.scope_binding import ProfileHub
    from runtime.local_ai.setup import LocalAiSetup
    service, scope, _, cache, home = setup_env; runner = runner_for(service, cache)
    plan = make_plan(service, scope, runner)
    job = runner.start(scope, StartRequest(operation='start', plan_digest=plan['planDigest'], client_request_id=uuid.uuid4().hex), actor='default')
    assert runner.wait(job.job_id, 5)
    service.profile_hub.close()
    hub = ProfileHub(home, default_state_dir=home / 'webui')
    try:
        another = runner_for(LocalAiSetup(hub, catalog_provider=catalog), cache)
        assert another.status(scope, actor='default', job_id=job.job_id).state == 'complete'
    finally: hub.close()


def test_actual_download_process_crash_is_os_proven_interrupted(setup_env):
    import json
    import os
    import pathlib
    import subprocess
    import sys
    import time
    service, scope, _, cache, home = setup_env; runner = runner_for(service, cache)
    plan = make_plan(service, scope, runner)
    marker = cache.parent / 'controlled-child-ready.json'
    root = pathlib.Path(__file__).resolve().parents[3]
    code = '''
import sys,pathlib,json,threading,uuid
sys.path[:0]=[str(pathlib.Path(sys.argv[1])/'services/sidekick'),str(pathlib.Path(sys.argv[1])/'services/sidekick/tests')]
sys.path.append(sys.argv[7])
from runtime.independent.scope_binding import ProfileHub
from runtime.independent.contracts import Scope
from runtime.local_ai.setup import LocalAiSetup
from test_local_ai_setup import catalog
from test_local_ai_setup_leaf import BlockingTransport,runner_for
from web.api.local_ai_setup import StartRequest
home=pathlib.Path(sys.argv[2]);hub=ProfileHub(home,default_state_dir=home/'webui');scope=Scope.model_validate_json(sys.argv[3])
transport=BlockingTransport();transport.release.wait=lambda timeout: threading.Event().wait(60)
runner=runner_for(LocalAiSetup(hub,catalog_provider=catalog),pathlib.Path(sys.argv[4]),transport)
job=runner.start(scope,StartRequest(operation='start',plan_digest=sys.argv[5],client_request_id=uuid.uuid4().hex),actor='default')
assert transport.entered.wait(5)
pathlib.Path(sys.argv[6]).write_text(json.dumps({'jobId':job.job_id,'pid':job.owner_pid,'start':job.owner_process_start}))
threading.Event().wait(60)
'''
    pytest_path = str(pathlib.Path(pytest.__file__).parent.parent)
    child = subprocess.Popen([sys.executable, '-I', '-B', '-c', code, str(root), str(home), scope.model_dump_json(by_alias=True),
        str(cache), plan['planDigest'], str(marker), pytest_path], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    try:
        deadline = time.monotonic() + 8
        while not marker.exists() and child.poll() is None and time.monotonic() < deadline: time.sleep(.02)
        if not marker.exists():
            child.kill(); _, error = child.communicate(timeout=5)
            pytest.fail('controlled child did not reach read: ' + error.decode(errors='replace'))
        data = json.loads(marker.read_text())
        alive, identity = process_identity(data['pid'])
        assert alive == 'alive' and identity == data['start']
        assert runner.status(scope, actor='default', job_id=data['jobId']).state == 'running'
        child.kill(); child.wait(timeout=5)
        result = runner.status(scope, actor='default', job_id=data['jobId'])
        assert result.state == 'interrupted' and result.error_code == 'download_owner_process_exited'
        store, _ = service.profile_hub.by_scope(scope, 'default')
        assert not any(lease['leaseId'] == result.lease_id for lease in store.list_leases())
    finally:
        if child.poll() is None: child.kill()
        child.communicate(timeout=5)


def test_shutdown_close_returns_false_until_real_read_exit(setup_env):
    service, scope, _, cache, _ = setup_env; transport = BlockingTransport(); runner = runner_for(service, cache, transport)
    plan = make_plan(service, scope, runner)
    job = runner.start(scope, StartRequest(operation='start', plan_digest=plan['planDigest'], client_request_id=uuid.uuid4().hex), actor='default')
    try:
        assert transport.entered.wait(5)
        assert runner.close(timeout=.01) is False
        assert runner.status(scope, actor='default', job_id=job.job_id).state == 'stopping'
    finally:
        transport.release.set(); assert runner.wait(job.job_id, 5)
    assert runner.close(timeout=.01) is True
    assert runner.status(scope, actor='default', job_id=job.job_id).state == 'cancelled'
