"""Groq stays a beta provider with a live model list and no key leaks."""

import io
import json

from providers import get_provider_profile
from runtime.groq_errors import groq_public_error


def test_groq_profile_uses_openai_compatible_base():
    profile = get_provider_profile("groq")
    assert profile is not None
    assert profile.base_url == "https://api.groq.com/openai/v1"
    assert profile.env_vars == ("GROQ_API_KEY",)
    assert profile.display_name == "Groq"


def test_live_model_list_comes_from_get_models(monkeypatch):
    profile = get_provider_profile("groq")
    seen = {}

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return json.dumps({
                "data": [
                    {"id": "llama-3.3-70b-versatile"},
                    {"id": "mixtral-8x7b-32768"},
                ]
            }).encode()

    def fake_urlopen(request, timeout):
        seen["url"] = request.full_url
        seen["headers"] = {key.lower(): value for key, value in request.header_items()}
        seen["timeout"] = timeout
        return Response()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    assert profile.fetch_models(api_key="gsk_unit_test") == [
        "llama-3.3-70b-versatile",
        "mixtral-8x7b-32768",
    ]
    assert seen["url"] == "https://api.groq.com/openai/v1/models"
    assert seen["headers"]["authorization"] == "Bearer gsk_unit_test"


def test_model_probe_uses_the_fixed_groq_models_endpoint(monkeypatch):
    from web.api import routes

    seen = {}

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self, _limit):
            return json.dumps({"data": [
                {"id": "llama-3.1-8b-instant", "name": "Llama 3.1 8B"},
            ]}).encode()

    def fake_urlopen(request, timeout):
        seen["url"] = request.full_url
        seen["headers"] = {key.lower(): value for key, value in request.header_items()}
        return Response()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    class Handler:
        def __init__(self):
            self.wfile = io.BytesIO()
            self.status = None

        def send_response(self, status):
            self.status = status

        def send_header(self, *_args):
            pass

        def end_headers(self):
            pass

    key = "gsk_unit_test"
    handler = Handler()
    routes._handle_model_probe(handler, {"provider": "groq", "api_key": key})
    payload = json.loads(handler.wfile.getvalue())

    assert handler.status == 200
    assert payload["provider"] == "groq"
    assert payload["models"] == [{"id": "llama-3.1-8b-instant", "label": "Llama 3.1 8B"}]
    assert seen["url"] == "https://api.groq.com/openai/v1/models"
    assert seen["headers"]["authorization"] == f"Bearer {key}"
    assert key not in json.dumps(payload)


def test_invalid_key_message_does_not_echo_a_secret():
    message = groq_public_error(401)
    assert message is not None
    assert "ungültig" in message
    assert "gsk_" not in message
    assert "Bearer" not in message


def test_rate_limit_message_names_429_and_is_not_a_product_bug():
    message = groq_public_error(429, retry_after="12")
    assert message is not None
    assert "429" in message
    assert "kein Fehler von LastBrowser" in message
    assert "12" in message
