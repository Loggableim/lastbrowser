"""Model catalogs must not forward credentials to HTTP redirect targets."""
import io
import json
import threading
import urllib.request
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from providers.base import ProviderProfile
from web.api import routes


@contextmanager
def catalog_servers():
    received = []

    class Sink(BaseHTTPRequestHandler):
        def do_GET(self):
            received.append(bool(self.headers.get('Authorization') or self.headers.get('x-api-key')))
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"data": [{"id": "example"}]}')

        def log_message(self, *_args): pass

    sink = ThreadingHTTPServer(('127.0.0.1', 0), Sink)

    class Source(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == '/models':
                self.send_response(302)
                self.send_header('Location', f'http://127.0.0.1:{sink.server_port}/models')
                self.end_headers()
            else:
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"data": [{"id": "example"}]}')

        def log_message(self, *_args): pass

    source = ThreadingHTTPServer(('127.0.0.1', 0), Source)
    servers = (source, sink)
    for server in servers:
        threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        yield f'http://127.0.0.1:{source.server_port}', received
    finally:
        for server in servers:
            server.shutdown()
            server.server_close()


def test_provider_profile_does_not_forward_a_key_on_redirect():
    with catalog_servers() as (base, received):
        profile = ProviderProfile(name='fixture', base_url=base)
        assert profile.fetch_models(api_key='synthetic-key') is None
        assert received == []
        profile.models_url = base + '/direct'
        assert profile.fetch_models(api_key='synthetic-key') == ['example']


@pytest.mark.parametrize(('provider', 'endpoint'), [
    ('openrouter', 'https://openrouter.ai/api/v1/models'),
    ('anthropic', 'https://api.anthropic.com/v1/models'),
])
def test_model_probe_does_not_forward_a_key_on_redirect(monkeypatch, provider, endpoint):
    class Handler:
        def __init__(self):
            self.wfile = io.BytesIO()
            self.status = None
        def send_response(self, status): self.status = status
        def send_header(self, *_args): pass
        def end_headers(self): pass

    original_request = urllib.request.Request
    with catalog_servers() as (base, received):
        def local_request(url, *args, **kwargs):
            if url == endpoint:
                url = base + '/models'
            return original_request(url, *args, **kwargs)
        monkeypatch.setattr(urllib.request, 'Request', local_request)
        handler = Handler()
        routes._handle_model_probe(handler, {'provider': provider, 'api_key': 'synthetic-key'})
        assert handler.status == 502
        assert json.loads(handler.wfile.getvalue())['models'] == []
        assert received == []
