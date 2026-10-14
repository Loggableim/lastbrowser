"""No-inference qualification of the private fixed Store SDK lifecycle."""
import threading
from types import SimpleNamespace

import pytest

from runtime.independent import native_sdk_broker as sdk
from runtime.independent.native_chat_auto import NativeAutoSessionBroker, NativeAutoBridge
from runtime.independent.native_chat_worker import validate_rpc_payload
from runtime.independent.policy import PolicyDenied
from runtime.independent.worker_host import WorkerError
from runtime.local_ai import store_provider_host as host
from test_native_store_capture import local


def capability(**changes):
    return {'state': 'ready', **local(tool_calling_qualified=True).model_dump(mode='json', by_alias=True), **changes}


def test_fresh_capture_uses_actual_context_and_requires_tool_proof():
    calls = []
    store = SimpleNamespace(provider_capability=lambda *args, **kwargs: calls.append((args, kwargs)) or capability())
    result = sdk._local_store_capture(store, 'curated-model', 'cpu', 'owner')
    assert result.context_tokens == 4096 and result.max_output_tokens == 768
    assert calls == [(('curated-model',), {'agentic': True, 'backend': 'cpu', 'compute_owner': 'owner'})]
    store.provider_capability = lambda *a, **k: capability(toolCallingQualified=False)
    with pytest.raises(PolicyDenied, match='tool_quality_required'):
        sdk._local_store_capture(store, 'curated-model')
    with pytest.raises(PolicyDenied, match='unavailable'):
        sdk._local_store_capture(None, 'curated-model')


def test_parent_revalidates_exact_store_proof_and_running_compute_owner(monkeypatch):
    capture = SimpleNamespace(local_runtime=local(tool_calling_qualified=True),
                              provider=SimpleNamespace(model='curated-model', provider='local-store'),
                              policy_revision=1, budget='bound-budget')
    value = object.__new__(sdk.NativeSdkSessionBroker)
    value.capture = capture
    value.context = SimpleNamespace(scope='own-scope', profile_name='own-profile',
                                    session_id='own-session', provider_capture=capture)
    value._closed = False
    value._stopping = threading.Event()
    value._decision = None
    value._local_leases = {'claim-a': object()}
    calls = []
    current = [capability()]
    value._local_store = SimpleNamespace(provider_capability=lambda *a, **k: calls.append(k) or current[0])
    policy = SimpleNamespace(mode='fixed', revision=1, budget='bound-budget')
    value.service = SimpleNamespace(manager=SimpleNamespace(), get_policy=lambda *a: policy)
    monkeypatch.setattr(sdk, 'verify_native_context', lambda context: None)
    assert value._validate() is policy
    assert calls[-1]['compute_owner'] == 'auto-provider:claim-a'
    current[0] = capability(evidenceRef='replacement-proof')
    with pytest.raises(PolicyDenied, match='runtime_changed'):
        value._validate()
    current[0] = capability(toolCallingQualified=False)
    with pytest.raises(PolicyDenied, match='tool_quality_required'):
        value._validate()


@pytest.fixture
def broker(monkeypatch):
    events = []
    value = object.__new__(sdk.NativeSdkSessionBroker)
    value.capture = SimpleNamespace(local_runtime=local(tool_calling_qualified=True),
                                    provider=SimpleNamespace(model='curated-model'))
    value.context = SimpleNamespace(scope='own-scope', profile_name='own-profile')
    value._lock = threading.RLock()
    value._local_cancel = threading.Event()
    value._local_store = value._local_prepared = None
    value._local_leases = {}
    value._validate = lambda: events.append('validate')
    prepared = SimpleNamespace(port=49152, token='fixture-' + 'private-' * 4,
                               stop=lambda: events.append('stop'))
    class Lease:
        fail_enter = False
        fail_exit = False
        def __enter__(self):
            events.append('start')
            if self.fail_enter: raise RuntimeError('start_failed')
        def __exit__(self, *args):
            events.append('stop_confirmed')
            if self.fail_exit: raise RuntimeError('stop_failed')
    lease = Lease()
    def prepare(model, **kwargs):
        assert kwargs == {'cancel': value._local_cancel, 'agentic': True, 'backend': 'cpu'}
        events.append('prepare')
        return prepared, capability()
    def session(model, **kwargs):
        assert kwargs == {'cancel': value._local_cancel, 'agentic': True, 'backend': 'cpu',
                          'compute_owner': 'auto-provider:claim-a', 'prepared': prepared}
        return lease
    store = SimpleNamespace(prepare_provider_session=prepare, provider_session=session)
    monkeypatch.setattr(host, 'scoped_store', lambda scope, actor: store if (scope, actor) == ('own-scope', 'own-profile') else None)
    def dispatch(self, context, method, payload):
        assert method == 'compute_acquire'
        events.append('acquire')
        return {'acquired': True, 'authorized': True}
    monkeypatch.setattr(NativeAutoSessionBroker, '__call__', dispatch)
    monkeypatch.setattr(NativeAutoSessionBroker, '_release', lambda self, claim: events.append('release'))
    monkeypatch.setattr(NativeAutoSessionBroker, 'request_stop', lambda self, reason: events.append('fence_stop') or {'acknowledged': True})
    return value, events, lease


def test_private_prepare_has_no_spawn_or_compute_and_is_idempotent(broker):
    value, events, _ = broker
    first = value(value.context, 'fixed_local_runtime', {})
    assert first == value(value.context, 'fixed_local_runtime', {})
    assert set(first) == {'endpoint', 'credential'}
    assert events.count('prepare') == 1 and 'start' not in events and 'acquire' not in events
    with pytest.raises(PolicyDenied, match='private_rpc_invalid'):
        value(SimpleNamespace(scope='foreign'), 'fixed_local_runtime', {})
    with pytest.raises(PolicyDenied, match='private_rpc_invalid'):
        value(value.context, 'fixed_local_runtime', {'model': 'foreign'})


def test_compute_is_owned_before_session_and_released_only_after_exit(broker):
    value, events, _ = broker
    value(value.context, 'fixed_local_runtime', {})
    result = value(value.context, 'compute_acquire', {'claimId': 'claim-a'})
    assert result['acquired'] and events.index('acquire') < events.index('start')
    value._release('claim-a')
    assert events.index('stop_confirmed') < events.index('release')
    assert not value._local_leases


def test_failed_start_releases_existing_compute_without_faking_session(broker):
    value, events, lease = broker
    value(value.context, 'fixed_local_runtime', {})
    lease.fail_enter = True
    with pytest.raises(RuntimeError, match='start_failed'):
        value(value.context, 'compute_acquire', {'claimId': 'claim-a'})
    assert events.index('start') < events.index('release') and not value._local_leases


def test_failed_exit_keeps_lease_and_never_releases_compute(broker):
    value, events, lease = broker
    value(value.context, 'fixed_local_runtime', {})
    value(value.context, 'compute_acquire', {'claimId': 'claim-a'})
    lease.fail_exit = True
    with pytest.raises(RuntimeError, match='stop_failed'):
        value._release('claim-a')
    assert 'release' not in events and 'claim-a' in value._local_leases


def test_stop_always_fences_and_cancels_own_prepared_session(broker):
    value, events, _ = broker
    value(value.context, 'fixed_local_runtime', {})
    assert value.request_stop()['acknowledged']
    assert value._local_cancel.is_set()
    assert events.index('fence_stop') < events.index('stop')


def test_private_rpc_request_accepts_no_credentials():
    validate_rpc_payload('fixed_local_runtime', {})
    with pytest.raises(WorkerError):
        validate_rpc_payload('fixed_local_runtime', {'credential': 'fixture-value'})


def test_bridge_resets_binding_even_when_client_close_fails(monkeypatch):
    bridge = object.__new__(sdk.NativeFixedSdkBridge)
    token = object()
    bridge._local_runtime_token = token
    seen = []
    monkeypatch.setattr(host, 'reset_store_runtime', lambda value: seen.append(value))
    def fail(self): raise RuntimeError('client_close_failed')
    monkeypatch.setattr(NativeAutoBridge, 'close', fail)
    with pytest.raises(RuntimeError, match='client_close_failed'):
        bridge.close()
    assert seen == [token] and bridge._local_runtime_token is None


@pytest.mark.parametrize('output,size,allowed', [(768, 8, True), (769, 8, False), (768, 4000, False), (True, 8, False)])
def test_local_proven_sdk_enforces_real_request_budget_and_disables_fallback(monkeypatch, output, size, allowed):
    from openai import OpenAI
    from runtime.independent import native_chat_auto as auto
    capture = local(tool_calling_qualified=True)
    bridge = object.__new__(sdk.NativeFixedSdkBridge)
    bridge.context = SimpleNamespace(selection_mode='fixed', provider_capture=SimpleNamespace(local_runtime=capture))
    bridge._lock = threading.RLock()
    bridge._builders, bridge._clients = {}, []
    bridge.decision = object()
    bridge.validate_selection = lambda *a, **k: None
    bridge._compute_acquire = bridge._compute_release = lambda *a, **k: None
    bridge.rpc = SimpleNamespace()
    monkeypatch.setattr(host, 'get_bound_store_runtime', lambda **k: capture)
    monkeypatch.setattr(auto, 'provider_endpoint', lambda *a: pytest.fail('local connection must not read generic provider config'))
    agent = SimpleNamespace(provider='local-store', model='curated-model', api_mode='chat_completions',
                            base_url='http://127.0.0.1:49152/v1', api_key='fixture-' + 'value-' * 4,
                            _flush_stream_delivery_tails=lambda: None)
    client = OpenAI(base_url=agent.base_url, api_key=agent.api_key)
    class Proxy(dict): pass
    monkeypatch.setattr(auto, 'AutoProviderProxy', lambda *a, **k: Proxy(k))
    try:
        wrapped = bridge._wrap_proven(client, agent=agent)
        assert wrapped['subscription_fallback'] is None
        request = {'messages': [{'role': 'user', 'content': 'x' * size}], 'max_tokens': output}
        if allowed:
            assert wrapped['request_metadata'](request, ())['input_bound_source'] == 'serialized_text_bytes'
        else:
            with pytest.raises(PolicyDenied, match='context_budget_exceeded'):
                wrapped['request_metadata'](request, ())
    finally:
        client.close()
