from uuid import uuid4
from threading import Event

import httpx
import pytest


def test_local_quickchat_transport_ignores_proxies_and_refuses_redirects(monkeypatch):
    from types import SimpleNamespace

    from runtime.quickchat_direct import QuickAnswerBot
    from runtime.quickchat_ollama import QuickchatOllama

    monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:32123")
    monkeypatch.setenv("NO_PROXY", "")
    endpoint = "http://127.0.0.1:11434/v1"
    capture = QuickchatOllama(endpoint, "", 2048)
    bridge = SimpleNamespace(validate_selection=lambda *args, **kwargs: None,
                             wrap=lambda client, **kwargs: client)
    bot = QuickAnswerBot(bridge, "custom", "local:latest",
                         {"base_url": endpoint, "api_key": "no-key-required"}, Event(), lambda text: None)
    bot.ollama_capture = capture
    bot.connect({})
    try:
        assert bot.client._client.follow_redirects is False
        assert bot.client._client.trust_env is False
    finally:
        bot.client.close()


def test_scoped_catalog_marks_only_current_local_ollama_as_eligible_for_quickchat():
    from runtime.independent.contracts import Scope
    from runtime.independent.scoped_models import _catalog_with_native_availability, public_catalog

    names = ["smollm2:135m", "example:cloud", "missing:latest"]
    raw = {"active_provider": "custom", "groups": [{
        "provider_id": "custom", "provider": "Custom",
        "models": [{"id": name, "label": name} for name in names],
    }]}
    config = {"model": {"provider": "ollama", "base_url": "http://127.0.0.1:11435"}}
    catalog = public_catalog(raw, {}, config)
    catalog["providerModelCatalog"] = {"providers": [{
        "providerId": "custom", "source": "provider_api", "modelIds": names[:2],
    }]}
    scope = Scope(backend_profile_id=str(uuid4()), space_id=str(uuid4()), browser_profile_id="browser")
    group = _catalog_with_native_availability(scope, 1, catalog)[0]

    assert group["provider"] == "Ollama"
    assert group["models"][0]["quickchatAvailable"] is True
    assert group["models"][0]["nativeAvailability"]["reasonCode"] == "context_missing"
    assert all("quickchatAvailable" not in entry for entry in group["models"][1:])


def test_discovery_of_configured_ollama_uses_its_own_catalog_without_cloud_credentials(monkeypatch):
    from cli import config, models
    from web.api import providers

    monkeypatch.setenv("OPENROUTER_API_KEY", "cloud-test-only")
    monkeypatch.setattr(config, "load_config", lambda: {
        "model": {"provider": "ollama", "base_url": "http://127.0.0.1:11435"},
    })
    def local_probe(provider, base_url, key, *, include_models):
        assert (provider, base_url, key, include_models) == ("ollama", "http://127.0.0.1:11435/v1", "", True)
        return {"ok": True, "models": [{"id": "smollm2:135m"}]}
    monkeypatch.setattr(providers, "probe_ollama_connection", local_probe)
    monkeypatch.setattr(models, "fetch_api_models", lambda *_: pytest.fail("discovery used generic credentials"))
    source = {}
    assert models.provider_model_ids("custom", source_out=source) == ["smollm2:135m"]
    assert source["source"] == "provider_api"


def test_local_ollama_quickchat_uses_verified_model_context_and_the_local_key(tmp_path, monkeypatch):
    from runtime import quickchat_ollama

    (tmp_path / "config.yaml").write_text(
        "model:\n  provider: ollama\n  base_url: http://127.0.0.1:11435\n"
        "providers:\n  ollama:\n    api_key: local-test-only\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("OLLAMA_API_KEY", "cloud-test-only")
    seen = []

    def respond(request):
        seen.append(request)
        return httpx.Response(200, json={
            "model_info": {"general.architecture": "llama", "llama.context_length": 8192},
            "capabilities": ["completion"],
        })

    original = httpx.Client
    monkeypatch.setattr(httpx, "Client", lambda **kwargs: original(transport=httpx.MockTransport(respond), **kwargs))
    connection = quickchat_ollama.resolve_quickchat_ollama(tmp_path, "custom", "smollm2:135m")
    assert connection.base_url == "http://127.0.0.1:11435/v1"
    assert connection.context_tokens == 2048
    assert connection.api_key == "local-test-only"
    assert len(seen) == 1 and str(seen[0].url) == "http://127.0.0.1:11435/api/show"
    assert seen[0].headers["Authorization"] == "Bearer local-test-only"


@pytest.mark.parametrize("remote", [{"remote_host": "https://ollama.com"}, {"remote_model": "model-cloud"}])
def test_quickchat_ollama_refuses_server_reported_cloud_models(tmp_path, monkeypatch, remote):
    from runtime import quickchat_ollama
    from runtime.independent.policy import PolicyDenied

    (tmp_path / "config.yaml").write_text(
        "model:\n  provider: ollama\n  base_url: http://127.0.0.1:11435/v1\n", encoding="utf-8",
    )
    original = httpx.Client
    def respond(request):
        return httpx.Response(200, json={"model_info": {"general.architecture": "llama",
            "llama.context_length": 8192}, **remote})
    monkeypatch.setattr(httpx, "Client", lambda **kwargs: original(transport=httpx.MockTransport(respond), **kwargs))

    with pytest.raises(PolicyDenied, match="quickchat_ollama_model_not_local"):
        quickchat_ollama.resolve_quickchat_ollama(tmp_path, "custom", "test:latest")
