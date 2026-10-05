"""Host DI/endbatch checks: no product weights or product processes."""
import uuid
from contextlib import contextmanager
import pytest
from pydantic import ValidationError
from test_local_ai_setup import setup_env, approved, catalog
from test_local_ai_installer import MemoryTransport
from test_local_ai_runtime_resources import resource_manager,manifest_fixture
from test_local_ai_model_manager import FixtureSession
from runtime.local_ai.installer import LocalAiInstaller
from runtime.independent.manager import ComputeAdmission
from web.api.local_ai import LocalAiBroker
from web.api.local_ai_runtime_host import LocalAiRuntimeHost,register_local_ai_runtime_host,handle_local_ai_runtime,shutdown_local_ai_runtime,ReviewRequest

@contextmanager
def host_env(environment):
    setup,scope,other,cache,_=environment; approved(setup,scope)
    plan=next(row for row in setup._store(scope,'default')._many("SELECT data_json FROM ia_connection_setup_flows WHERE state='plan'"))
    import json
    digest=json.loads(plan[0])['planDigest']
    LocalAiInstaller(setup,lambda _:cache,transport=MemoryTransport()).install(scope,actor='default',plan_digest=digest)
    resources=resource_manager(setup,scope,cache); base=manifest_fixture(cache)
    broker=LocalAiBroker(cache,scans=resources.scans);broker.catalog=catalog
    host=LocalAiRuntimeHost(setup.profile_hub,cache,cache,broker,core_generation='generation-1',setup=setup,
        manifest_provider=lambda:base,session_factory=FixtureSession.create,fixture_only=True)
    register_local_ai_runtime_host(setup.profile_hub,host)
    def handle(payload,consent=None,selected=scope):
        return handle_local_ai_runtime(setup.profile_hub,selected,'default',payload,cache,cache,broker,consent,core_generation='generation-1')
    try:yield host,handle,scope,other
    finally:assert shutdown_local_ai_runtime(setup.profile_hub)

def test_host_shared_owner_durable_uuid_replay_and_one_use_review(setup_env):
    with host_env(setup_env) as (host,handle,scope,other):
        review=handle({'operation':'review','artifactId':catalog().artifacts[0].artifact_id,'role':'extract','scanId':'scan-1'})
        assert review['operation']=='review'
        request={'operation':'bootstrap','purposeDigest':review['purposeDigest'],'clientRequestId':uuid.uuid4().hex}
        with pytest.raises(PermissionError):handle(request)
        result=handle(request,lambda s,d:s==scope and d==review['purposeDigest'])
        assert result['state']=='complete' and result['synthetic'] and not result['recommendationEligible']
        assert 'result' not in result and 'hostPid' not in result
        assert handle(request)==result
        assert len(host.manager.inspect(scope))==1
        with pytest.raises(ValueError,match='already_consumed'):
            handle({**request,'clientRequestId':uuid.uuid4().hex},lambda *_:True)
        with pytest.raises(PermissionError):handle({**request,'clientRequestId':uuid.uuid4().hex},lambda *_:True,selected=other)
        assert not host._owners and not any(key.startswith('local-ai-bootstrap:') for key in ComputeAdmission._owners)

def test_host_renderer_cannot_supply_owner_runtime_or_consent(setup_env):
    with host_env(setup_env) as (_,handle,*_):
        with pytest.raises(ValidationError):handle({'operation':'review','artifactId':'a','role':'extract','scanId':'scan-1','ownerKey':'forged'})
        with pytest.raises(ValidationError):handle({'operation':'bootstrap','purposeDigest':'a'*64,'clientRequestId':uuid.uuid4().hex,'humanConsent':True})

def test_product_short_chat_review_keeps_strict_resource_bounds():
    base={'operation':'review','purpose':'product','artifactId':'LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0',
        'role':'chat','scanId':'scan'}
    assert ReviewRequest.model_validate({**base,'contextTokens':1024,'budgetSeconds':25,'ramLimitBytes':805306368})
    for override in ({'contextTokens':2048},{'budgetSeconds':26},{'ramLimitBytes':805306369}):
        with pytest.raises(ValidationError):ReviewRequest.model_validate({**base,**override})

def test_host_capability_is_a_scoped_read_only_status_without_a_selected_chat_role(setup_env):
    with host_env(setup_env) as (host,handle,scope,*_):
        before=dict(ComputeAdmission._owners)
        result=handle({'operation':'capability'})
        assert result=={'operation':'capability','state':'unavailable','reasonCode':'local_chat_role_not_selected'}
        assert host.manager.inspect(scope)==() and dict(ComputeAdmission._owners)==before

def test_host_review_expiry_is_bounded_and_inspect_redacted(setup_env):
    with host_env(setup_env) as (host,handle,scope,*_):
        review=handle({'operation':'review','artifactId':catalog().artifacts[0].artifact_id,'role':'extract','scanId':'scan-1'})
        from datetime import timedelta
        before=host.broker.scans.clock;host.broker.scans.clock=lambda:before()+timedelta(seconds=31)
        with pytest.raises(ValueError,match='expired'):
            handle({'operation':'bootstrap','purposeDigest':review['purposeDigest'],'clientRequestId':uuid.uuid4().hex},lambda *_:True)
        assert handle({'operation':'inspect'})['handles']==[]

def test_receipt_missing_never_creates_runtime_host_or_acquires_compute(setup_env):
    setup,scope,_,cache,_=setup_env
    from web.api.local_ai_runtime_host import read_local_ai_runtime_receipt,ReceiptRequest,_HOSTS
    before=dict(ComputeAdmission._owners)
    request=ReceiptRequest(operation='receipt',purpose_digest='a'*64,client_request_id=uuid.uuid4().hex)
    assert read_local_ai_runtime_receipt(setup.profile_hub,scope,'default',request)['state']=='unknown'
    assert setup.profile_hub not in _HOSTS and dict(ComputeAdmission._owners)==before

def test_receipt_after_review_expiry_reads_saved_metrics_without_launch(setup_env):
    with host_env(setup_env) as (host,handle,scope,*_):
        review=handle({'operation':'review','artifactId':catalog().artifacts[0].artifact_id,'role':'extract','scanId':'scan-1'})
        identity=uuid.uuid4().hex
        start={'operation':'bootstrap','purposeDigest':review['purposeDigest'],'clientRequestId':identity}
        result=handle(start,lambda *_:True)
        from datetime import timedelta
        before=host.broker.scans.clock;host.broker.scans.clock=lambda:before()+timedelta(seconds=60)
        count=len(host.manager.inspect(scope))
        receipt=handle({**start,'operation':'receipt'})
        assert receipt['state']=='complete' and receipt['p95Ms']==result['p95Ms']
        assert receipt['operation']=='receipt' and len(host.manager.inspect(scope))==count
        assert 'hostPid' not in receipt and 'existingComputeOwnerKey' not in receipt
