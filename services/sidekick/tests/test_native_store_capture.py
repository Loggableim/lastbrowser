"""Exact secret-free Store metadata and private SDK connection binding."""
from types import SimpleNamespace
from threading import RLock

import pytest
from pydantic import ValidationError

from runtime.independent.contracts import ProviderSelection, Scope
from runtime.independent.native_provider_capture import NativeLocalRuntimeCapture, NativeProviderCapture
from runtime.independent.provider_admission import AdmissionBudget
from runtime.local_ai import store_provider_host as host


def local(**changes):
    fields = dict(artifact_id='curated-model', artifact_revision='pinned-revision',
                  bundle_digest='a' * 64, runtime_digest='b' * 64,
                  runtime_build='pinned-build', backend='cpu', evidence_ref='local-proof',
                  tool_calling_qualified=False, context_tokens=4096, max_output_tokens=768)
    return NativeLocalRuntimeCapture(**{**fields, **changes})


def provider(**changes):
    fields = dict(scope=Scope(space_id='1' * 32, backend_profile_id='2' * 32, browser_profile_id='default'),
                  session_id='chat-a', provider=ProviderSelection(provider='local-store', model='curated-model',
                  context_length=4096, provider_config_ref='config-digest'), local_runtime=local(),
                  permission_revision=1, control_epoch=0, policy_revision=1, budget=AdmissionBudget())
    return NativeProviderCapture(**{**fields, **changes})


def test_capture_exact_context_and_no_connection_secrets():
    value = provider()
    assert value.provider.context_length == value.local_runtime.context_tokens == 4096
    payload = value.model_dump(mode='json', by_alias=True)
    assert payload['localRuntime']['maxOutputTokens'] == 768
    assert not {'endpoint', 'baseUrl', 'apiKey', 'credential', 'token'} & payload['localRuntime'].keys()
    assert value.local_runtime.tool_calling_qualified is False


@pytest.mark.parametrize('changes', [
    {'context_tokens': True}, {'context_tokens': '4096'}, {'context_tokens': 0},
    {'max_output_tokens': 4096}, {'max_output_tokens': 0}, {'backend': 'cuda'},
    {'bundle_digest': 'not-a-sha'}, {'runtime_digest': 'b' * 63},
    {'parallel_requests': 2}, {'purpose': 'background_agent'}, {'apiKey': 'not-allowed'},
])
def test_capture_rejects_unbounded_or_unrelated_metadata(changes):
    with pytest.raises(ValidationError):
        local(**changes)


@pytest.mark.parametrize('changes', [
    {'local_runtime': None},
    {'provider': ProviderSelection(provider='openai', model='curated-model', context_length=4096, provider_config_ref='cfg')},
    {'provider': ProviderSelection(provider='local-store', model='different', context_length=4096, provider_config_ref='cfg')},
    {'provider': ProviderSelection(provider='local-store', model='curated-model', context_length=64000, provider_config_ref='cfg')},
])
def test_provider_rejects_unbound_local_metadata(changes):
    with pytest.raises(ValidationError):
        provider(**changes)


@pytest.fixture
def private_context(monkeypatch):
    context = SimpleNamespace(provider_capture=provider())
    monkeypatch.setattr(host, '_private_bridge', lambda selected: None if selected is context else pytest.fail('foreign context'))
    return context


def test_private_binding_has_exact_identity_and_resets(private_context):
    credential = 'unit-' + 'value-' * 6
    token = host.bind_store_runtime(private_context, 'http://127.0.0.1:49152/v1', credential)
    try:
        kwargs = dict(model='curated-model', provider='local-store', base_url='http://127.0.0.1:49152/v1', api_key=credential)
        assert host.get_bound_store_runtime(**kwargs) == private_context.provider_capture.local_runtime
        assert host.private_store_connection(private_context) == (kwargs['base_url'], credential)
        for change in ({'model': 'foreign'}, {'base_url': 'http://127.0.0.1:49153/v1'}, {'api_key': 'different'}):
            with pytest.raises(PermissionError, match='binding_changed'):
                host.get_bound_store_runtime(**{**kwargs, **change})
        assert host.get_bound_store_runtime(**{**kwargs, 'provider': 'openai'}) is None
        assert credential not in repr(host._live_runtime.get())
    finally:
        host.reset_store_runtime(token)
    with pytest.raises(PermissionError, match='binding_required'):
        host.get_bound_store_runtime(**kwargs)


@pytest.mark.parametrize('endpoint', [
    'https://127.0.0.1:49152/v1', 'http://localhost:49152/v1',
    'http://127.0.0.1:49152/v1?key=bad', 'http://127.0.0.1:49152/v1#bad',
    'http://user@127.0.0.1:49152/v1', 'http://127.0.0.1:99999/v1',
    'http://127.0.0.1:49152/other', 'http://192.0.2.1:49152/v1',
])
def test_binding_rejects_non_private_endpoint(private_context, endpoint):
    with pytest.raises(PermissionError, match='endpoint_invalid'):
        host.bind_store_runtime(private_context, endpoint, 'unit-' + 'value-' * 6)


def test_catalog_lists_only_installed_text_and_does_not_promote_basic_chat_proof():
    store = SimpleNamespace(lock=RLock(), state={'installed': {'basic': {}, 'coder': {}, 'image': {}}},
        entries={'basic': {'name': 'Basic', 'artifactManifest': {'category': 'text'}},
                 'coder': {'name': 'Coder', 'artifactManifest': {'category': 'text'}},
                 'image': {'artifactManifest': {'category': 'image'}},
                 'not-installed': {'artifactManifest': {'category': 'text'}}},
        provider_capability=lambda identity: {'state': 'ready', 'contextTokens': 4096,
                                             'toolCallingQualified': identity == 'coder'})
    group = host.store_catalog_group(store)
    assert [row['id'] for row in group['models']] == ['basic', 'coder']
    assert [row['supportsIndependent'] for row in group['models']] == [False, True]
    assert all(row['contextLength'] == 4096 for row in group['models'])
    assert group['deploymentKind'] == 'local'


def test_catalog_overlay_reads_store_again_even_when_remote_catalog_is_reused(monkeypatch):
    store = SimpleNamespace(lock=RLock(), state={'installed': {}}, entries={},
                            provider_capability=lambda _: {'state': 'unavailable', 'reasonCode': 'fresh_hardware_admission_required'})
    monkeypatch.setattr(host, 'scoped_store', lambda scope, actor: store)
    remote = {'groups': [], 'providers': [], 'providerConfigurationDigest': 'unchanged'}
    first = host.with_store_catalog(remote, 'scope', 'actor')
    assert first['groups'][0]['models'] == []
    account = first['providers'][0]
    assert account['has_key'] is False and account['oauth_connected'] is False
    assert account['auth_state'] == 'not_connected' and account['models'] == []
    assert account['provider_available'] is True
    store.state['installed']['new'] = {}
    store.entries['new'] = {'artifactManifest': {'category': 'text'}}
    second = host.with_store_catalog(remote, 'scope', 'actor')
    row = second['groups'][0]['models'][0]
    assert row['id'] == 'new' and row['supportsIndependent'] is False
    assert second['providers'][0]['models'] == ['new']
    assert row['contextLength'] is None
    assert row['localRuntime']['reasonCode'] == 'fresh_hardware_admission_required'
    assert remote == {'groups': [], 'providers': [], 'providerConfigurationDigest': 'unchanged'}


def test_local_native_context_exception_requires_exact_qualified_capture_metadata():
    from runtime.independent.scoped_models import _native_availability
    scope = provider().scope
    capability = {'state': 'ready', **local(tool_calling_qualified=True).model_dump(mode='json', by_alias=True)}
    capability.pop('purpose')
    row = {'id': 'curated-model', 'contextLength': 4096, 'supportsIndependent': True,
           'localRuntime': capability}
    catalog = {'groups': [{'provider_id': 'local-store', 'configured': True, 'models': [row]}]}
    result = _native_availability(scope, 1, catalog, 'local-store', 'curated-model')
    assert result['available'] is True
    row['contextLength'] = 64000
    assert _native_availability(scope, 1, catalog, 'local-store', 'curated-model')['available'] is False
    row['contextLength'] = 4096
    row['localRuntime'] = {**capability, 'artifactId': 'different'}
    assert _native_availability(scope, 1, catalog, 'local-store', 'curated-model')['available'] is False
    row['localRuntime'] = {**capability, 'toolCallingQualified': False}
    assert _native_availability(scope, 1, catalog, 'local-store', 'curated-model')['available'] is False
    row['localRuntime'] = capability
    catalog['groups'][0]['provider_id'] = 'openai'
    assert _native_availability(scope, 1, catalog, 'openai', 'curated-model')['available'] is False


def test_local_provider_catalog_lists_device_models_without_claiming_remote_api_discovery():
    from runtime.independent.scoped_models import _catalog_with_native_availability, _provider_model_catalog
    from runtime.provider_deployment import provider_deployment
    scope = provider().scope
    capability = {'state': 'ready', **local(tool_calling_qualified=True).model_dump(mode='json', by_alias=True)}
    capability.pop('purpose')
    catalog = {'groups': [{'provider_id': 'local-store', 'configured': True, 'models': [
        {'id': 'curated-model', 'contextLength': 4096, 'contextLengthSource': 'local_catalog',
         'supportsIndependent': True, 'deploymentKind': 'local', 'modelSource': 'local_catalog',
         'localRuntime': capability}]}]}
    groups = _catalog_with_native_availability(scope, 1, catalog)
    response = _provider_model_catalog(scope, catalog, groups)
    row = response['providers'][0]['models'][0]
    assert row['listed']['status'] == 'configured'
    assert row['listed']['source'] == 'local_catalog'
    assert row['qualification']['independent']['available'] is True
    assert row['liveTest']['status'] == 'not_run'
    assert provider_deployment('local-store') == 'local'
    assert provider_deployment('ollama-cloud') == 'cloud'
