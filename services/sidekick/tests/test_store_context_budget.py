"""Managed Store context limits never weaken the ordinary provider/tool path."""
import pytest

from runtime.context_compressor import ContextCompressor
from runtime.independent.native_provider_capture import NativeLocalRuntimeCapture
from runtime.independent.policy import PolicyDenied
from runtime.local_ai import store_provider_host
from run_agent import AIAgent


def capture(**patch):
    return NativeLocalRuntimeCapture(artifact_id='publisher/model', artifact_revision='revision',
        bundle_digest='a' * 64, backend='cpu', runtime_build='pinned-build',
        runtime_digest='b' * 64, evidence_ref='device-proof', tool_calling_qualified=True,
        context_tokens=4096, max_output_tokens=768, **patch)


def compressor(monkeypatch, value):
    monkeypatch.setattr(store_provider_host, 'get_bound_store_runtime', lambda **kw: value)
    return ContextCompressor(model='publisher/model', provider='local-store',
        base_url='http://127.0.0.1:1234/v1', api_key='private-test-credential',
        native_local_runtime=value, quiet_mode=True)


def agent(monkeypatch, value, request):
    monkeypatch.setattr(store_provider_host, 'get_bound_store_runtime', lambda **kw: value)
    instance = object.__new__(AIAgent)
    instance._native_local_runtime = value
    instance.model = 'publisher/model'
    instance.provider = 'local-store'
    instance.base_url = 'http://127.0.0.1:1234/v1'
    instance.api_key = 'private-test-credential'
    instance.api_mode = 'chat_completions'
    instance._build_api_kwargs_unchecked = lambda messages: request
    return instance


def test_private_capture_keeps_real_4k_context_and_threshold(monkeypatch):
    instance = compressor(monkeypatch, capture())
    assert instance.context_length == 4096
    assert instance.threshold_tokens == 2048
    instance.update_model(instance.model, 4096, instance.base_url, instance.api_key, instance.provider)
    assert instance.threshold_tokens == 2048
    with pytest.raises(PermissionError, match='local_runtime_context_changed'):
        instance.update_model(instance.model, 8192, instance.base_url, instance.api_key, instance.provider)


def test_capture_cannot_be_replaced_by_plain_runtime_metadata(monkeypatch):
    with pytest.raises(PermissionError, match='local_runtime_binding_required'):
        compressor(monkeypatch, {'context_tokens': 4096})


def test_ordinary_cloud_and_legacy_threshold_floor_is_unchanged():
    cloud = ContextCompressor(model='cloud', config_context_length=128000, quiet_mode=True)
    assert cloud.threshold_tokens == 64000
    legacy = ContextCompressor(model='legacy', config_context_length=8192, quiet_mode=True)
    assert legacy.context_length == 8192
    assert legacy.threshold_tokens == 64000


def test_request_includes_full_system_tools_and_output_budget(monkeypatch):
    request = {'messages': [{'role': 'system', 'content': 'system'}, {'role': 'user', 'content': 'hello'}],
        'tools': [{'type': 'function', 'function': {'name': 'read_file', 'parameters': {'type': 'object'}}}], 'max_tokens': 768}
    instance = agent(monkeypatch, capture(), request)
    assert instance._build_api_kwargs([]) is request
    request['messages'][0]['content'] = 'x' * 3400
    with pytest.raises(PolicyDenied, match='context_budget_exceeded'):
        instance._build_api_kwargs([])
    assert request['tools'][0]['function']['name'] == 'read_file'


def test_tool_schemas_and_unicode_cannot_evade_reservation(monkeypatch):
    request = {'messages': [{'role': 'user', 'content': 'hello'}], 'max_tokens': 768,
        'tools': [{'type': 'function', 'function': {'name': 'read_file', 'description': '界' * 1200}}]}
    with pytest.raises(PolicyDenied, match='context_budget_exceeded'):
        agent(monkeypatch, capture(), request)._build_api_kwargs([])


@pytest.mark.parametrize('output', [769, None, True, -1])
def test_output_cap_is_actual_request_bound(monkeypatch, output):
    request = {'messages': [{'role': 'user', 'content': 'hello'}], 'max_tokens': output}
    with pytest.raises(PolicyDenied, match='local_runtime_output_budget_invalid'):
        agent(monkeypatch, capture(), request)._build_api_kwargs([])


def test_unqualified_tools_fail_without_dropping_them(monkeypatch):
    value = capture().model_copy(update={'tool_calling_qualified': False})
    request = {'messages': [{'role': 'user', 'content': 'hello'}], 'max_tokens': 768, 'tools': [{'name': 'read_file'}]}
    with pytest.raises(PolicyDenied, match='local_runtime_tools_not_qualified'):
        agent(monkeypatch, value, request)._build_api_kwargs([])
    assert request['tools'] == [{'name': 'read_file'}]


def test_changed_private_binding_fails_each_request(monkeypatch):
    value = capture()
    instance = agent(monkeypatch, value, {'messages': [{'role': 'user', 'content': 'hello'}], 'max_tokens': 768})
    monkeypatch.setattr(store_provider_host, 'get_bound_store_runtime', lambda **kw: None)
    with pytest.raises(PolicyDenied, match='local_runtime_binding_changed'):
        instance._build_api_kwargs([])


def test_cloud_build_result_is_untouched(monkeypatch):
    instance = agent(monkeypatch, None, {'model': 'cloud'})
    instance.provider = 'cloud'
    assert instance._build_api_kwargs([]) == {'model': 'cloud'}


@pytest.mark.parametrize('key', ['messages', 'tools', 'max_tokens', 'n_predict', 'num_ctx'])
def test_extra_body_cannot_replace_the_counted_request(monkeypatch, key):
    request = {'messages': [{'role': 'user', 'content': 'hello'}], 'max_tokens': 768,
        'extra_body': {key: 99999}}
    with pytest.raises(PolicyDenied, match='local_runtime_request_override_invalid'):
        agent(monkeypatch, capture(), request)._build_api_kwargs([])
