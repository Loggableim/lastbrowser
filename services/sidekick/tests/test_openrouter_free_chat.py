import io
import json
import urllib.error

import pytest

from runtime.openrouter_free_chat import (
    OpenRouterFreeError,
    attach_openrouter_free_catalog,
    is_openrouter_free_chat,
    stream_free_reply,
)


def test_keyless_request_has_no_authorization(monkeypatch):
    seen = {}

    class Response(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    def opener(request, timeout):
        seen["headers"] = {key.lower(): value for key, value in request.header_items()}
        seen["body"] = json.loads(request.data.decode())
        seen["timeout"] = timeout
        return Response(b'data: {"choices":[{"delta":{"content":"pong"}}]}\n\ndata: [DONE]\n')

    monkeypatch.setattr("urllib.request.urlopen", opener)
    monkeypatch.setenv("OPENROUTER_API_KEY", "must-not-be-sent")
    assert stream_free_reply(prompt="ping", on_text=lambda _delta: None, cancel_event=None) == "pong"
    assert "authorization" not in seen["headers"]
    assert seen["body"]["model"] == "openrouter/free"
    assert "must-not-be-sent" not in json.dumps(seen)


def test_missing_key_is_reported_without_a_paid_fallback(monkeypatch):
    def opener(_request, timeout):
        del timeout
        raise urllib.error.HTTPError(
            "https://openrouter.ai/api/v1/chat/completions",
            401,
            "unauthorized",
            hdrs=None,
            fp=io.BytesIO(b'{"error":{"message":"No cookie auth credentials found","code":401}}'),
        )

    monkeypatch.setattr("urllib.request.urlopen", opener)
    with pytest.raises(OpenRouterFreeError, match="requires an API key"):
        stream_free_reply(prompt="ping", on_text=lambda _delta: None, cancel_event=None)


def test_catalog_exposes_the_keyless_default():
    catalog = attach_openrouter_free_catalog({"groups": []})
    group = catalog["groups"][0]
    assert group["provider_id"] == "openrouter"
    assert group["configured"] is True
    assert group["models"][0]["id"] == "openrouter/free"
    assert is_openrouter_free_chat("openrouter", "openrouter/free")
    assert not is_openrouter_free_chat("opencode-go", "openrouter/free")
