import pytest

from urllib.request import Request

from runtime.local_ai import store_engines
from runtime.local_ai.store_engines import _official_url


@pytest.mark.parametrize('url', [
    ' https://github.com/example',
    'https://github.com/example ',
    'https://github.com/line\nbreak',
    'https://github.com/line\tbreak',
    'https://github.com/line\x7fbreak',
    'https://github.com@evil.invalid/example',
    'https://github.com:444/example',
    'https://github.com/example#fragment',
])
def test_engine_rejects_malformed_or_untrusted_origins(url):
    with pytest.raises(ValueError, match='engine_download_origin_rejected'):
        _official_url(url)


def test_engine_accepts_pinned_https_origin():
    assert _official_url('https://github.com/ggml-org/llama.cpp/releases/download/example') is None


def test_redirects_use_the_same_origin_validation_without_network(monkeypatch):
    valid = 'https://github.com/example'

    class Response:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def geturl(self): return valid

    class Opener:
        def open(self, request, timeout): return Response()

    def build_opener(_proxy, redirects):
        with pytest.raises(ValueError, match='engine_download_origin_rejected'):
            redirects.redirect_request(Request(valid), None, 302, '', {}, 'https://github.com/line\nbreak')
        return Opener()

    monkeypatch.setattr(store_engines, 'build_opener', build_opener)
    with store_engines.EngineTransport().open(valid, 0):
        pass
