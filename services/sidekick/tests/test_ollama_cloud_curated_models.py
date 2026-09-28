from cli import models
from runtime import models_dev
import pytest


def test_new_cloud_models_survive_live_picker_filter(monkeypatch, tmp_path):
    available = [
        "glm-5.3", "glm-5.3-flash", "gpt-oss:20b", "gpt-oss:120b",
        "kimi-k3", "mistral-large-3:675b", "nemotron-3-nano:30b",
    ]
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path))
    monkeypatch.setattr(models, "fetch_api_models", lambda *_args, **_kwargs: available + ["unrelated-model"])
    monkeypatch.setattr(models_dev, "list_agentic_models", lambda *_args: ["kimi-k3:cloud"])
    result = models.fetch_ollama_cloud_models(
        api_key="test-only", base_url="https://ollama.com/v1", force_refresh=True
    )
    assert result == available
    # A cached request must retain the new choices without a provider call.
    monkeypatch.setattr(models, "fetch_api_models", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("unexpected network")))
    assert models.fetch_ollama_cloud_models(api_key="test-only") == available


@pytest.mark.parametrize(
    "base_url",
    [
        "http://ollama.com/v1",
        "https://ollama.com.attacker.test/v1",
        "https://ollama.com:8443/v1",
        "https://ollama.com:invalid/v1",
        "https://user@ollama.com/v1",
        "https://ollama.com/v1?redirect=https://attacker.test",
    ],
)
def test_ollama_cloud_catalog_never_sends_key_to_unapproved_endpoint(monkeypatch, tmp_path, base_url):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path))
    monkeypatch.setattr(models, "_load_ollama_cloud_cache", lambda **_kwargs: None)
    monkeypatch.setattr(models, "_save_ollama_cloud_cache", lambda _models: None)
    monkeypatch.setattr(models_dev, "list_agentic_models", lambda *_args: [])
    monkeypatch.setattr(
        models,
        "fetch_api_models",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("cloud key must not be sent to an unapproved endpoint")
        ),
    )

    result = models.fetch_ollama_cloud_models(
        api_key="test-only",
        base_url=base_url,
        force_refresh=True,
    )

    assert result == models.OLLAMA_CLOUD_CURATED_MODELS


def test_ollama_cloud_catalog_requests_disable_redirects(monkeypatch, tmp_path):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path))
    monkeypatch.setattr(models, "_load_ollama_cloud_cache", lambda **_kwargs: None)
    monkeypatch.setattr(models, "_save_ollama_cloud_cache", lambda _models: None)
    monkeypatch.setattr(models_dev, "list_agentic_models", lambda *_args: [])
    calls = []

    def fake_fetch_api_models(api_key, base_url, **kwargs):
        calls.append((api_key, base_url, kwargs))
        return ["deepseek-v4-flash"]

    monkeypatch.setattr(models, "fetch_api_models", fake_fetch_api_models)

    result = models.fetch_ollama_cloud_models(
        api_key="test-only",
        base_url="https://ollama.com/v1",
        force_refresh=True,
    )

    assert calls == [(
        "test-only", "https://ollama.com/v1", {"timeout": 8.0, "allow_redirects": False}
    )]
    assert result == ["deepseek-v4-flash"]


def test_ollama_cloud_model_probe_refuses_http_redirects(monkeypatch):
    opened = []

    class Opener:
        def open(self, request, timeout):
            opened.append((request.full_url, timeout))
            raise OSError("redirect rejected")

    def fake_build_opener(handler_type):
        handler = handler_type()
        assert handler.redirect_request(
            None, None, 302, "Found", {}, "https://attacker.test/collect"
        ) is None
        return Opener()

    monkeypatch.setattr(models.urllib.request, "build_opener", fake_build_opener)
    monkeypatch.setattr(
        models.urllib.request,
        "urlopen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("redirect-free probing must use the no-redirect opener")
        ),
    )

    result = models.probe_api_models(
        "test-only", "https://ollama.com/v1", allow_redirects=False
    )

    assert result["models"] is None
    assert opened == [
        ("https://ollama.com/v1/models", 5.0),
        ("https://ollama.com/models", 5.0),
    ]
