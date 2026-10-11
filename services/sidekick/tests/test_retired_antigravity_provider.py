def test_legacy_profile_cannot_reintroduce_retired_provider(monkeypatch):
    from web.api import providers
    monkeypatch.setattr(providers, 'get_config', lambda: {
        'model': {'provider': 'antigravity', 'default': 'legacy-model'},
        'providers': {'antigravity': {}, 'agy': {}},
        'custom_providers': [{'name': 'antigravity', 'base_url': 'cloudcode-pa://antigravity'}],
    })
    monkeypatch.setattr(providers, '_PROVIDER_DISPLAY', {'openai': 'OpenAI'})
    monkeypatch.setattr(providers, '_PROVIDER_MODELS', {'openai': []})
    monkeypatch.setattr(providers, '_OAUTH_PROVIDERS', frozenset())
    monkeypatch.setattr(providers, '_provider_has_key', lambda _: False)
    result = providers.get_providers()
    assert not {'antigravity', 'agy', 'custom:antigravity'} & {p['id'] for p in result['providers']}
    assert 'openai' in {p['id'] for p in result['providers']}
    assert result['active_provider'] != 'antigravity'


def test_legacy_named_custom_endpoint_is_absent_from_provider_and_model_catalogs(monkeypatch):
    from web.api import config, providers

    legacy = {'name': 'Antigravity (Google)', 'base_url': 'cloudcode-pa://antigravity',
              'model': 'legacy-model'}
    renamed = {'name': 'Old Connection', 'base_url': 'cloudcode-pa://antigravity',
               'model': 'renamed-model'}
    supported = {'name': 'Local Test', 'base_url': 'http://localhost:11434/v1',
                 'model': 'local-model'}
    profile = {'model': {'provider': 'custom:antigravity-google', 'default': 'legacy-model'},
               'custom_providers': [legacy, renamed, supported]}
    monkeypatch.setattr(providers, 'get_config', lambda: profile)
    monkeypatch.setattr(providers, '_PROVIDER_DISPLAY', {'openai': 'OpenAI'})
    monkeypatch.setattr(providers, '_PROVIDER_MODELS', {'openai': []})
    monkeypatch.setattr(providers, '_OAUTH_PROVIDERS', frozenset())
    monkeypatch.setattr(providers, '_provider_has_key', lambda _: False)
    result = providers.get_providers()
    assert 'custom:antigravity-google' not in {p['id'] for p in result['providers']}
    assert 'custom:old-connection' not in {p['id'] for p in result['providers']}
    assert 'custom:local-test' in {p['id'] for p in result['providers']}
    assert result['active_provider'] == ''
    profile['model']['provider'] = 'custom:old-connection'
    assert providers.get_providers()['active_provider'] == ''

    monkeypatch.setattr(config, 'cfg', profile)
    catalog = {'active_provider': 'custom:antigravity-google', 'default_model': 'legacy-model',
               'groups': [
                   {'provider_id': 'custom:antigravity-google', 'models': [{'id': 'legacy-model'}]},
                   {'provider_id': 'custom:old-connection', 'models': [{'id': 'renamed-model'}]},
                   {'provider_id': 'custom:local-test', 'models': [{'id': 'local-model'}]}],
               'configured_model_badges': {
                   'legacy-model': {'provider': 'custom:antigravity-google'},
                   'renamed-model': {'provider': 'custom:old-connection'},
                   'local-model': {'provider': 'custom:local-test'}}}
    config._remove_unavailable_antigravity_catalog(catalog)
    assert catalog['active_provider'] == catalog['default_model'] == ''
    assert [group['provider_id'] for group in catalog['groups']] == ['custom:local-test']
    assert set(catalog['configured_model_badges']) == {'local-model'}


def test_named_providers_entry_with_retired_endpoint_is_absent_from_provider_list(monkeypatch):
    from web.api import providers

    profile = {
        'model': {'provider': 'legacy-endpoint', 'default': 'legacy-model'},
        'providers': {
            'legacy-endpoint': {'base_url': 'cloudcode-pa://antigravity', 'models': ['legacy-model']},
            'supported-endpoint': {'base_url': 'https://supported.example.invalid/v1', 'models': ['supported-model']},
        },
    }
    monkeypatch.setattr(providers, 'get_config', lambda: profile)
    monkeypatch.setattr(providers, '_PROVIDER_DISPLAY', {'openai': 'OpenAI'})
    monkeypatch.setattr(providers, '_PROVIDER_MODELS', {'openai': []})
    monkeypatch.setattr(providers, '_OAUTH_PROVIDERS', frozenset())
    monkeypatch.setattr(providers, '_provider_has_key', lambda _: False)
    result = providers.get_providers()
    assert 'legacy-endpoint' not in {entry['id'] for entry in result['providers']}
    assert {'openai', 'supported-endpoint'} <= {entry['id'] for entry in result['providers']}
    assert result['active_provider'] == ''


def test_named_providers_entry_with_retired_endpoint_is_absent_from_model_catalog(monkeypatch):
    from web.api import config

    monkeypatch.setattr(config, 'cfg', {
        'providers': {
            'legacy-endpoint': {'base_url': 'cloudcode-pa://antigravity', 'models': ['legacy-model']},
            'supported-endpoint': {'base_url': 'https://supported.example.invalid/v1', 'models': ['supported-model']},
        },
    })
    catalog = {
        'active_provider': 'legacy-endpoint', 'default_model': 'legacy-model',
        'groups': [
            {'provider_id': 'legacy-endpoint', 'models': [{'id': 'legacy-model'}]},
            {'provider_id': 'supported-endpoint', 'models': [{'id': 'supported-model'}]},
        ],
        'configured_model_badges': {
            'legacy-model': {'provider': 'legacy-endpoint'},
            'supported-model': {'provider': 'supported-endpoint'},
        },
    }
    config._remove_unavailable_antigravity_catalog(catalog)
    assert catalog['active_provider'] == catalog['default_model'] == ''
    assert [group['provider_id'] for group in catalog['groups']] == ['supported-endpoint']
    assert set(catalog['configured_model_badges']) == {'supported-model'}


def test_onboarding_does_not_offer_retired_profile_default():
    from web.api.onboarding import _build_setup_catalog
    result = _build_setup_catalog({'model': {'provider': 'antigravity', 'default': 'legacy-model'}})
    assert 'antigravity' not in {p['id'] for p in result['providers']}
    assert result['current']['provider'] != 'antigravity'


def test_retired_provider_is_not_executable_even_with_explicit_credentials():
    import pytest
    from cli.runtime_provider import resolve_runtime_provider
    from cli.auth import AuthError
    with pytest.raises(AuthError, match='removed'):
        resolve_runtime_provider(requested='antigravity', explicit_api_key='test-key', explicit_base_url='https://example.invalid')


def test_stale_retired_url_does_not_block_explicit_openai(monkeypatch):
    import pytest
    from cli import runtime_provider
    from cli.auth import AuthError

    monkeypatch.setattr(runtime_provider, '_get_model_config', lambda: {
        'provider': 'antigravity', 'default': 'legacy-model',
        'base_url': 'cloudcode-pa://antigravity'})
    result = runtime_provider.resolve_runtime_provider(
        requested='openai', explicit_api_key='test-key',
        explicit_base_url='https://api.openai.com/v1')
    assert result['provider'] == 'openai'
    assert result['base_url'] == 'https://api.openai.com/v1'
    monkeypatch.setattr(runtime_provider, '_get_model_config', lambda: {
        'provider': 'openai', 'base_url': 'cloudcode-pa://antigravity'})
    with pytest.raises(AuthError) as error:
        runtime_provider.resolve_runtime_provider(requested='openai', explicit_api_key='test-key')
    assert error.value.code == 'provider_removed'


def test_stale_retired_url_does_not_block_other_explicit_custom_provider(monkeypatch):
    from cli import runtime_provider

    monkeypatch.setattr(runtime_provider, '_get_model_config', lambda: {
        'provider': 'antigravity', 'base_url': 'cloudcode-pa://antigravity'})
    monkeypatch.setattr(runtime_provider, '_resolve_named_custom_runtime', lambda **_: {
        'provider': 'custom', 'base_url': 'https://supported.example.invalid/v1',
        'api_key': 'test-key', 'api_mode': 'chat_completions'})
    result = runtime_provider.resolve_runtime_provider(requested='custom')
    assert result['base_url'] == 'https://supported.example.invalid/v1'


def test_renamed_custom_provider_cannot_execute_retired_endpoint(monkeypatch):
    import pytest
    from cli import runtime_provider
    from cli.auth import AuthError

    monkeypatch.setattr(runtime_provider, '_get_model_config', lambda: {})
    monkeypatch.setattr(runtime_provider, '_resolve_named_custom_runtime', lambda **_: {
        'provider': 'custom', 'base_url': 'cloudcode-pa://antigravity',
        'api_key': 'test-key', 'api_mode': 'chat_completions'})
    with pytest.raises(AuthError) as error:
        runtime_provider.resolve_runtime_provider(requested='custom:old-connection')
    assert error.value.code == 'provider_removed'


def test_cached_catalog_cannot_reintroduce_retired_alias():
    from web.api.config import _remove_unavailable_antigravity_catalog
    payload = {'active_provider': 'agy', 'default_model': 'legacy-model', 'groups': [
        {'provider_id': 'antigravity-cli', 'models': [{'id': 'legacy-model'}]},
        {'provider_id': 'openai', 'models': [{'id': 'gpt-5.5'}]}],
        'configured_model_badges': {'legacy-model': {'provider': 'agy'}}}
    _remove_unavailable_antigravity_catalog(payload)
    assert payload['active_provider'] == payload['default_model'] == ''
    assert payload['groups'] == [{'provider_id': 'openai', 'models': [{'id': 'gpt-5.5'}]}]
    assert payload['configured_model_badges'] == {}


def test_removed_oauth_does_not_start_worker(monkeypatch):
    import pytest
    from web.api import oauth
    monkeypatch.setattr(oauth, '_spawn_antigravity_oauth_worker', lambda _: pytest.fail('must not start'))
    with pytest.raises(ValueError, match='removed'):
        oauth.start_onboarding_oauth_flow({'provider': 'antigravity'})


def test_retired_accounts_routes_are_gone(monkeypatch):
    from urllib.parse import urlparse
    from web.api import routes
    responses = []
    monkeypatch.setattr(routes, 'j', lambda handler, body, status=200: responses.append((status, body)))
    parsed = urlparse('/api/antigravity/accounts')
    routes.handle_get(object(), parsed)
    routes._handle_post_parsed(object(), parsed, {'action': 'remove', 'email': 'legacy@example.invalid'})
    assert [status for status, _ in responses] == [410, 410]
