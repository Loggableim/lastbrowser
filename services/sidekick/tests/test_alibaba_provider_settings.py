"""Alibaba DashScope settings use a provider-scoped key and workspace URL."""

from __future__ import annotations


def test_alibaba_key_and_workspace_endpoint_are_saved_without_returning_secret(monkeypatch, tmp_path):
    from web.api import providers

    monkeypatch.setattr(providers, "_get_sidekick_home", lambda: tmp_path)
    monkeypatch.setattr(providers, "invalidate_models_cache", lambda: None)
    monkeypatch.setattr(providers, "_invalidate_ollama_cloud_catalog_if_needed", lambda _provider: None)
    key = "unit-test-alibaba-key"
    url = "https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"

    result = providers.set_provider_key("alibaba", key, url)
    saved = (tmp_path / ".env").read_text(encoding="utf-8")

    assert result["ok"] is True
    assert result["provider"] == "alibaba"
    assert key not in str(result)
    assert "DASHSCOPE_API_KEY=unit-test-alibaba-key" in saved
    assert f"DASHSCOPE_BASE_URL={url}" in saved


def test_alibaba_endpoint_rejects_non_dashscope_hosts_and_non_compatible_paths(monkeypatch, tmp_path):
    from web.api import providers

    monkeypatch.setattr(providers, "_get_sidekick_home", lambda: tmp_path)
    monkeypatch.setattr(providers, "invalidate_models_cache", lambda: None)

    result = providers.set_provider_key(
        "alibaba",
        "unit-test-alibaba-key",
        "https://attacker.example/compatible-mode/v1",
    )

    assert result["ok"] is False
    assert not (tmp_path / ".env").exists()


def test_alibaba_workspace_url_can_be_changed_without_removing_existing_key(monkeypatch, tmp_path):
    from web.api import providers

    monkeypatch.setattr(providers, "_get_sidekick_home", lambda: tmp_path)
    monkeypatch.setattr(providers, "invalidate_models_cache", lambda: None)
    monkeypatch.setattr(providers, "_invalidate_ollama_cloud_catalog_if_needed", lambda _provider: None)
    monkeypatch.setenv("DASHSCOPE_API_KEY", "existing-test-only")
    (tmp_path / ".env").write_text("DASHSCOPE_API_KEY=existing-test-only\n", encoding="utf-8")
    url = "https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"

    result = providers.set_provider_key("alibaba", None, url)
    saved = (tmp_path / ".env").read_text(encoding="utf-8")

    assert result["ok"] is True
    assert result["action"] == "updated"
    assert "DASHSCOPE_API_KEY=existing-test-only" in saved
    assert f"DASHSCOPE_BASE_URL={url}" in saved


def test_alibaba_workspace_endpoint_accepts_international_dashscope_compatible_url():
    from web.api.onboarding import _SUPPORTED_PROVIDER_SETUPS
    from cli.auth import PROVIDER_REGISTRY

    provider = PROVIDER_REGISTRY["alibaba"]
    assert _SUPPORTED_PROVIDER_SETUPS["alibaba"]["env_var"] == "DASHSCOPE_API_KEY"
    assert _SUPPORTED_PROVIDER_SETUPS["alibaba"]["requires_base_url"] is True
    assert provider.api_key_env_vars == ("DASHSCOPE_API_KEY",)
    assert provider.base_url_env_var == "DASHSCOPE_BASE_URL"
    assert provider.inference_base_url.endswith("/compatible-mode/v1")


def test_alibaba_model_selection_is_provider_scoped(monkeypatch, tmp_path):
    from web.api import config, providers

    config_path = tmp_path / "config.yaml"
    monkeypatch.setattr(config, "_get_config_path", lambda: config_path)
    monkeypatch.setattr(config, "reload_config", lambda: None)
    monkeypatch.setattr(config, "invalidate_models_cache", lambda: None)

    result = providers.set_provider_models("alibaba", ["qwen-turbo", "qwen-plus", "qwen-turbo"])
    saved = config._load_yaml_config_file(config_path)

    assert result == {"ok": True, "provider": "alibaba", "models": ["qwen-turbo", "qwen-plus"]}
    assert saved["providers"]["alibaba"]["models"] == ["qwen-turbo", "qwen-plus"]


def test_alibaba_model_probe_uses_workspace_catalog_and_does_not_return_key(monkeypatch):
    import io
    import json

    from web.api import routes

    observed = {}
    class Response:
        def __enter__(self):
            return self
        def __exit__(self, *_args):
            return False
        def read(self, _limit):
            return json.dumps({"data": [{"id": "qwen-plus", "name": "Qwen Plus"}]}).encode()

    class Opener:
        def open(self, request, timeout):
            observed["url"] = request.full_url
            observed["authorization"] = request.get_header("Authorization")
            observed["timeout"] = timeout
            return Response()

    monkeypatch.setattr("urllib.request.build_opener", lambda *_handlers: Opener())

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

    key = "unit-test-alibaba-key"
    url = "https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"
    handler = Handler()
    routes._handle_model_probe(handler, {"provider": "alibaba", "api_key": key, "base_url": url})
    payload = json.loads(handler.wfile.getvalue())

    assert handler.status == 200
    assert payload["provider"] == "alibaba"
    assert payload["models"] == [{"id": "qwen-plus", "label": "Qwen Plus"}]
    assert key not in json.dumps(payload)
    assert observed == {
        "url": f"{url}/models",
        "authorization": f"Bearer {key}",
        "timeout": 12,
    }


def test_alibaba_model_probe_rejects_untrusted_endpoint_before_network(monkeypatch):
    import io
    import json

    from web.api import routes

    monkeypatch.setattr("urllib.request.build_opener", lambda *_args: (_ for _ in ()).throw(AssertionError("network must not run")))

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

    handler = Handler()
    routes._handle_model_probe(handler, {
        "provider": "alibaba", "api_key": "unit-test-alibaba-key",
        "base_url": "https://example.com/compatible-mode/v1",
    })
    payload = json.loads(handler.wfile.getvalue())
    assert handler.status == 400
    assert payload["models"] == []


def test_alibaba_provider_post_accepts_base_url_only_without_key_removal(monkeypatch):
    import io
    import json
    from urllib.parse import urlparse

    from web.api import routes

    seen = []
    monkeypatch.setattr(routes, "set_provider_key", lambda *args: seen.append(args) or {"ok": True, "provider": "alibaba"})
    monkeypatch.setattr("runtime.smart_track_orchestrator.schedule_model_wall_scan", lambda: None)
    endpoint = "https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"
    body = json.dumps({
        "provider": "alibaba-cloud",
        "base_url": endpoint,
    })

    class Handler:
        headers = {"Content-Length": str(len(body)), "Host": "127.0.0.1"}
        client_address = ("127.0.0.1", 12345)
        def __init__(self):
            self.rfile = io.BytesIO(body.encode())
            self.wfile = io.BytesIO()
            self.status_code = None
        def send_response(self, status): self.status_code = status
        def send_header(self, *_args): pass
        def end_headers(self): pass

    handler = Handler()
    routes.handle_post(handler, urlparse("/api/providers"))
    payload = json.loads(handler.wfile.getvalue())

    assert handler.status_code == 200
    assert payload["provider"] == "alibaba"
    assert seen == [("alibaba", None, endpoint)]
