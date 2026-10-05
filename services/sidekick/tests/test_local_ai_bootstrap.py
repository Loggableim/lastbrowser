import pytest
from test_local_ai_setup import setup_env
from test_local_ai_model_manager import manager_env
from runtime.local_ai.bootstrap import BootstrapPurpose, bootstrap_benchmark
from runtime.local_ai.router_bootstrap_download import (BOOTSTRAP_BYTES, BOOTSTRAP_FILENAME,
    BOOTSTRAP_REVISION, BOOTSTRAP_SHA256, LICENSE_BYTES, LICENSE_SHA256, bootstrap_artifact)

def purpose(request, **changes):
    return BootstrapPurpose(purpose='controlled-local-role-benchmark', load=request, ram_limit_bytes=67108864, **changes)


def test_router_pins_exact_model_and_raw_revision_license():
    artifact = bootstrap_artifact()
    weights, license_file = artifact.files
    assert artifact.revision == BOOTSTRAP_REVISION
    assert (weights.relative_path, weights.bytes, weights.sha256) == (BOOTSTRAP_FILENAME, BOOTSTRAP_BYTES, BOOTSTRAP_SHA256)
    assert (license_file.relative_path, license_file.bytes, license_file.sha256) == ('LICENSE', LICENSE_BYTES, LICENSE_SHA256)
    assert license_file.source_url.endswith('/raw/' + BOOTSTRAP_REVISION + '/LICENSE')
    assert artifact.license_ref.endswith('/blob/' + BOOTSTRAP_REVISION + '/LICENSE')

def test_bootstrap_actual_fixture_process_stops_and_never_grants_quality(setup_env):
    with manager_env(setup_env) as (manager, request, scope, *_):
        result = bootstrap_benchmark(manager, purpose(request), actor='default', private_human_action=lambda *_: True)
        assert result['operationShapeVerified'] and result['peakObservedResidentBytes'] > 0
        assert result['synthetic'] and not result['recommendationEligible']
        assert result['qualityPassed'] is None and not result['memoryEnvelopeVerified']
        assert result['operationProof'] is None and result['memoryObservation']['inputTokensTested']
        assert manager.inspect(scope)[0].state == 'stopped' and not manager.inspect(scope)[0].available

def test_bootstrap_requires_human_action_before_child(setup_env):
    with manager_env(setup_env) as (manager, request, scope, *_):
        with pytest.raises(PermissionError): bootstrap_benchmark(manager, purpose(request), actor='default', private_human_action=lambda *_: False)
        assert manager.inspect(scope) == ()

def test_bootstrap_health_timeout_leaves_no_process(setup_env):
    import pathlib, sys, uuid
    from test_local_ai_model_manager import FixtureSession
    class Hung(FixtureSession):
        @classmethod
        def create(cls, manifest, request, artifact, cache, root):
            return cls(pathlib.Path(sys.executable).resolve(), ('-I', '-c', 'import time;time.sleep(30)'), artifact.artifact_id, 1, uuid.uuid4().hex)
    with manager_env(setup_env, factory=Hung.create) as (manager, request, scope, *_):
        with pytest.raises(RuntimeError):
            bootstrap_benchmark(manager, purpose(request, budget_seconds=1), actor='default', private_human_action=lambda *_: True)
        assert manager.inspect(scope)[0].state in ('stopped', 'failed')

def test_actual_residency_lease_records_host_child_creation(setup_env):
    import os, json
    from web.api.local_ai_setup import process_identity
    from runtime.local_ai.model_recovery import recover_model_leases
    with manager_env(setup_env) as (manager, request, scope, other, service, *_):
        view = manager.wait(manager.acquire(request, actor='default').handle_id, scope, 5)
        store = service._store(scope, 'default')
        row = store._conn.execute("SELECT data_json FROM ia_resource_leases WHERE resource_key LIKE 'local_ai_model:%' AND state='active'").fetchone()
        data = json.loads(row[0])
        assert data['hostPid'] == os.getpid() and data['childPid'] == view.process_pid and data['launchPending'] is False
        assert data['childCreationIdentity'] == process_identity(view.process_pid)[1]
        assert recover_model_leases(store, scope)['blockedLeaseIds']
        assert not recover_model_leases(store, other)['blockedLeaseIds']
        assert recover_model_leases(store, scope, identity_reader=lambda pid: ('unknown', None))['blockedLeaseIds']

def test_actual_oversized_child_is_stopped_by_bootstrap_ram_budget(setup_env):
    import pathlib, sys, uuid
    from test_local_ai_model_manager import FixtureSession
    class Oversized(FixtureSession):
        @classmethod
        def create(cls, manifest, request, artifact, cache, root):
            return cls(pathlib.Path(sys.executable).resolve(), ('-I', '-c', 'import time;data=bytearray(268435456);time.sleep(30)'), artifact.artifact_id, 1, uuid.uuid4().hex)
    with manager_env(setup_env, factory=Oversized.create) as (manager, request, scope, *_):
        with pytest.raises(RuntimeError):
            bootstrap_benchmark(manager, purpose(request, budget_seconds=2), actor='default', private_human_action=lambda *_: True)
        assert manager.inspect(scope)[0].state in ('stopped', 'failed')

def test_recovery_releases_only_with_two_original_processes_dead(setup_env):
    import json, uuid
    from runtime.local_ai.model_recovery import recover_model_leases
    service, scope, *_ = setup_env
    store = service._store(scope, 'default'); lease = uuid.uuid4().hex
    resource = 'local_ai_model:' + scope.key + ':controlled-owner'
    value = {'ownerKind':'local_ai_model','scopeKey':scope.key,'resourceKey':resource,'launchPending':False,
        'hostPid':10,'hostCreationIdentity':'original-host','childPid':11,'childCreationIdentity':'original-child'}
    with store.transaction(): store._conn.execute('INSERT INTO ia_resource_leases VALUES(?,?,?,?,?,?,?,?,?)',
        (lease,resource,scope.key,None,'old-generation',1,'2099-01-01T00:00:00Z','active',json.dumps(value)))
    assert recover_model_leases(store,scope,identity_reader=lambda pid: ('dead',None) if pid==10 else ('alive','original-child'))['blockedLeaseIds'] == [lease]
    assert recover_model_leases(store,scope,identity_reader=lambda pid: ('alive','different-creation-identity'))['releasedLeaseIds'] == [lease]
    assert not recover_model_leases(store,scope,identity_reader=lambda pid: ('dead',None))['releasedLeaseIds']

def test_runtime_leaf_derives_scope_and_rejects_body_authority(setup_env):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from web.api.local_ai_runtime import create_local_ai_runtime_router
    with manager_env(setup_env) as (manager, request, scope, *_):
        app = FastAPI()
        app.include_router(create_local_ai_runtime_router(manager, lambda: scope, lambda: 'private',
            lambda *_: (purpose(request), 'default'), lambda *_: False))
        client = TestClient(app)
        assert client.get('/local-ai/runtime/inspect').json() == {'handles': []}
        review=client.get('/local-ai/runtime/review').json()
        assert client.post('/local-ai/runtime/bootstrap',json={'purposeDigest':review['purposeDigest']}).status_code == 403
        assert client.post('/local-ai/runtime/bootstrap',json={'purposeDigest':'f'*64}).status_code == 409
        assert client.post('/local-ai/runtime/bootstrap',json={'purposeDigest':review['purposeDigest'],'ownerKey':'forged'}).status_code == 422
        assert client.post('/local-ai/runtime/unload', json={'handleId': 'a'*32, 'scope': 'forged'}).status_code == 422

def test_bootstrap_private_permit_cannot_be_forged(setup_env):
    with manager_env(setup_env) as (manager, request, scope, *_):
        with pytest.raises(PermissionError): manager.acquire(request, actor='default', _bootstrap_permit=object())
        assert manager.inspect(scope) == ()

def test_small_agent_context_is_available_only_to_bounded_bootstrap_probe(setup_env):
    from runtime.local_ai.bootstrap import controlled_input
    with manager_env(setup_env, role='agent') as (manager, request, scope, *_):
        bounded = request.model_copy(update={'context_tokens': 1024})
        with pytest.raises(ValueError, match='agent_requires_64k_context'):
            manager.acquire(bounded, actor='default')
        result = bootstrap_benchmark(manager, purpose(bounded), actor='default', private_human_action=lambda *_: True)
        assert result['synthetic'] and result['typedResult']['text'] == 'fixture response'
        assert not result['recommendationEligible'] and result['qualityPassed'] is None
        assert controlled_input('agent').texts == ('Was ist die Hauptstadt von Österreich? Antworte auf Deutsch in einem kurzen Satz.',)
        assert manager.inspect(scope)[0].state == 'stopped'

def test_bootstrap_memory_reserve_cannot_be_overridden(setup_env):
    with manager_env(setup_env) as (manager, request, scope, *_):
        huge = purpose(request).model_copy(update={'ram_limit_bytes': 17179869184})
        with pytest.raises(ValueError, match='ram_reserve'):
            bootstrap_benchmark(manager, huge, actor='default', private_human_action=lambda *_: True)
        assert manager.inspect(scope) == ()
