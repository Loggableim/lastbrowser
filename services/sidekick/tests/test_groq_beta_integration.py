"""Groq beta setup and catalog use only the explicit provider credential."""
import io
import json
import urllib.error

import pytest

from providers import get_provider_profile
from cli.auth import PROVIDER_REGISTRY
from web.api import onboarding, routes


def test_groq_profile_uses_explicit_openai_compatible_endpoint():
    from runtime.independent.connection_setup import human_configuration_fields
    from web.api.providers import normalize_provider_model_allowlist
    profile = get_provider_profile('groq')
    assert profile is not None
    assert profile.base_url == 'https://api.groq.com/openai/v1'
    assert profile.env_vars == ('GROQ_API_KEY',)
    assert profile.api_mode == 'chat_completions'
    assert PROVIDER_REGISTRY['groq'].api_key_env_vars == ('GROQ_API_KEY',)
    assert onboarding._SUPPORTED_PROVIDER_SETUPS['groq']['env_var'] == 'GROQ_API_KEY'
    assert human_configuration_fields('groq') == ['apiKey', 'model']
    assert normalize_provider_model_allowlist('groq', ['fixture-model']) == ['fixture-model']


def test_groq_model_probe_uses_fixed_catalog_and_never_returns_key(monkeypatch):
    seen = {}

    class Response:
        def __enter__(self): return self
        def __exit__(self, *_args): pass
        def read(self, _limit):
            return b'{"data":[{"id":"fixture-model","name":"Fixture"}]}'

    class Opener:
        def open(self, request, timeout):
            seen['url'] = request.full_url
            seen['auth'] = request.get_header('Authorization')
            return Response()

    monkeypatch.setattr('urllib.request.build_opener', lambda *_args: Opener())

    class Handler:
        def __init__(self): self.wfile, self.status = io.BytesIO(), None
        def send_response(self, status): self.status = status
        def send_header(self, *_args): pass
        def end_headers(self): pass

    handler = Handler()
    routes._handle_model_probe(handler, {'provider': 'groq', 'api_key': 'fixture-key', 'base_url': 'https://untrusted.invalid'})
    payload = json.loads(handler.wfile.getvalue())
    assert handler.status == 200
    assert payload['models'] == [{'id': 'fixture-model', 'label': 'Fixture'}]
    assert seen == {'url': 'https://api.groq.com/openai/v1/models', 'auth': 'Bearer fixture-key'}
    assert 'fixture-key' not in json.dumps(payload)


@pytest.mark.parametrize(('status', 'code'), [(401, 'provider_key_invalid'), (429, 'provider_rate_limited')])
def test_groq_model_probe_distinguishes_upstream_errors_without_locking_browser(monkeypatch, status, code):
    class Opener:
        def open(self, request, timeout):
            raise urllib.error.HTTPError(request.full_url, status, 'provider failure', {}, None)

    monkeypatch.setattr('urllib.request.build_opener', lambda *_args: Opener())

    class Handler:
        def __init__(self): self.wfile, self.status = io.BytesIO(), None
        def send_response(self, value): self.status = value
        def send_header(self, *_args): pass
        def end_headers(self): pass

    handler = Handler()
    routes._handle_model_probe(handler, {'provider': 'groq', 'api_key': 'fixture-key'})
    payload = json.loads(handler.wfile.getvalue())
    assert handler.status == 200
    assert payload['error_code'] == code
    assert payload['models'] == []
    assert 'fixture-key' not in json.dumps(payload)


@pytest.mark.parametrize(('status', 'code'), [(401, 'groq_key_invalid'), (429, 'groq_rate_limited')])
def test_quickchat_groq_errors_are_actionable_and_do_not_echo_provider_body(status, code):
    from runtime.groq_errors import quickchat_groq_error

    error = type('FixtureError', (Exception,), {'status_code': status})('fixture-key')
    payload = quickchat_groq_error('groq', error, 'session-test')
    assert payload['code'] == code
    assert payload['session_id'] == 'session-test'
    assert 'fixture-key' not in json.dumps(payload)
    assert quickchat_groq_error('another-provider', error, 'session-test') is None


def test_groq_openai_compatible_client_streams_and_can_close(monkeypatch):
    """Exercise the real client adapter using a synthetic in-process provider."""
    import importlib.util
    import sys
    from pathlib import Path
    from httpx import Client, MockTransport, Response, SyncByteStream

    spec = importlib.util.spec_from_file_location('_groq_test_run_agent', Path(__file__).resolve().parents[1] / 'run_agent.py')
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, spec.name, module)
    spec.loader.exec_module(module)
    requests, streams = [], []

    class Stream(SyncByteStream):
        def __init__(self): self.closed = False
        def __iter__(self):
            yield b'data: {"id":"test","object":"chat.completion.chunk","created":1,"model":"fixture-model","choices":[{"index":0,"delta":{"content":"first"},"finish_reason":null}]}\n\n'
            yield b'data: {"id":"test","object":"chat.completion.chunk","created":1,"model":"fixture-model","choices":[{"index":0,"delta":{"content":"second"},"finish_reason":null}]}\n\n'
            yield b'data: [DONE]\n\n'
        def close(self): self.closed = True

    def respond(request):
        requests.append(request)
        stream = Stream()
        streams.append(stream)
        return Response(200, headers={'content-type': 'text/event-stream'}, stream=stream)

    http_client = Client(transport=MockTransport(respond))
    agent = object.__new__(module.AIAgent)
    agent.provider, agent.model, agent.base_url = 'groq', 'fixture-model', 'https://api.groq.com/openai/v1'
    agent._build_keepalive_http_client = lambda _base_url='': http_client
    try:
        client = agent._create_openai_client({'api_key': 'fixture-key', 'base_url': agent.base_url}, reason='groq_test', shared=False)
        complete = client.chat.completions.create(model='fixture-model', messages=[{'role': 'user', 'content': 'fixture'}], stream=True)
        assert [part.choices[0].delta.content for part in complete] == ['first', 'second']
        stopped = client.chat.completions.create(model='fixture-model', messages=[{'role': 'user', 'content': 'fixture'}], stream=True)
        assert next(iter(stopped)).choices[0].delta.content == 'first'
        stopped.close()
        assert streams[1].closed
        assert all(request.url.path == '/openai/v1/chat/completions' for request in requests)
        assert all(request.headers['authorization'] == 'Bearer fixture-key' for request in requests)

        from runtime.quickchat_direct import QuickAnswerBot
        from threading import Event
        from types import SimpleNamespace
        displayed = []
        bridge = SimpleNamespace(mark_visible_delta=lambda **_kwargs: None)
        bot = QuickAnswerBot(bridge, 'groq', 'fixture-model', {'base_url': agent.base_url, 'api_key': 'fixture-key'}, Event(), displayed.append)
        bot.client = client
        answer, _response = bot.answer('fixture system', [{'role': 'user', 'content': 'fixture'}])
        assert answer == 'firstsecond'
        assert ''.join(displayed) == answer

        cancelled = Event()
        stop_bot = QuickAnswerBot(bridge, 'groq', 'fixture-model', {'base_url': agent.base_url, 'api_key': 'fixture-key'}, cancelled, lambda _text: stop_bot.interrupt())
        stop_bot.client = client
        with pytest.raises(InterruptedError):
            stop_bot.answer('fixture system', [{'role': 'user', 'content': 'fixture'}])
        assert streams[-1].closed
    finally:
        http_client.close()
