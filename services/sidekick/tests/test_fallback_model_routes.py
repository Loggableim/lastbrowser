import io
import json
from urllib.parse import urlparse


class _Handler:
    client_address = ("127.0.0.1", 12345)

    def __init__(self, method="GET", body=b""):
        self.command = method
        self.headers = {
            "Host": "127.0.0.1",
            "Content-Length": str(len(body)),
            "Content-Type": "application/json",
        }
        self.rfile = io.BytesIO(body)
        self.wfile = io.BytesIO()
        self.status_code = None
        self.response_headers = {}

    def send_response(self, status):
        self.status_code = status

    def send_header(self, name, value):
        self.response_headers[name.lower()] = value

    def end_headers(self):
        pass


def _response_payload(handler):
    return json.loads(handler.wfile.getvalue().decode("utf-8"))


def test_get_fallback_model_is_routed_through_get_dispatcher(monkeypatch):
    from web.api import routes

    expected = {"ok": True, "fallback_model": None}
    monkeypatch.setattr(routes, "get_sidekick_fallback_model", lambda: expected)
    handler = _Handler("GET")

    routes.handle_get(handler, urlparse("/api/fallback-model"))

    assert handler.status_code == 200
    assert _response_payload(handler) == expected


def test_post_fallback_model_persists_selection_through_post_dispatcher(monkeypatch):
    from web.api import routes

    saved = {}

    def save_fallback(model, provider, base_url):
        saved.update(model=model, provider=provider, base_url=base_url)
        return {"ok": True, "fallback_model": saved.copy()}

    monkeypatch.setattr(routes, "set_sidekick_fallback_model", save_fallback)
    handler = _Handler(
        "POST",
        json.dumps({"model": "model-test", "provider": "openrouter", "base_url": "https://example.invalid/v1"}).encode("utf-8"),
    )

    routes.handle_post(handler, urlparse("/api/fallback-model"))

    assert handler.status_code == 200
    assert saved == {
        "model": "model-test",
        "provider": "openrouter",
        "base_url": "https://example.invalid/v1",
    }
    assert _response_payload(handler) == {"ok": True, "fallback_model": saved}
