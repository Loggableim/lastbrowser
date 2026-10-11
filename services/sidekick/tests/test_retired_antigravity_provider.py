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
