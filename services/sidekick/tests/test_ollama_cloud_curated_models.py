from cli import models
from runtime import models_dev
import pytest


def test_ollama_cloud_static_catalog_uses_live_deepseek_flash_id():
    assert "deepseek-v4.1-flash" in models.OLLAMA_CLOUD_CURATED_MODELS
    assert "deepseek-v4-flash" not in models.OLLAMA_CLOUD_CURATED_MODELS
    assert "deepseek-v4.1-flash" in models._PROVIDER_MODELS["ollama-cloud"]
    assert "deepseek-v4-flash" not in models._PROVIDER_MODELS["ollama-cloud"]
    assert models.get_default_model_for_provider("ollama-cloud") == "deepseek-v4.1-flash"


def test_new_cloud_models_survive_live_picker_filter(monkeypatch, tmp_path):
    available = [
        "glm-5.3", "glm-5.3-flash", "gpt-oss:20b", "gpt-oss:120b",
        "kimi-k3", "mistral-large-3:675b", "nemotron-3-nano:30b",
    ]
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path))
    monkeypatch.setattr(models, "fetch_api_models", lambda *_args, **_kwargs: available + ["unrelated-model"])
    # A stale models.dev entry must not be mixed into a successful live list.
    monkeypatch.setattr(models_dev, "list_agentic_models", lambda *_args: ["kimi-k3:cloud", "minimax-m2.5:cloud"])
    result = models.fetch_ollama_cloud_models(
        api_key="test-only", base_url="https://ollama.com/v1", force_refresh=True
    )
    assert result == available + ["unrelated-model"]
    # A cached request must retain the new choices without a provider call.
    monkeypatch.setattr(models, "fetch_api_models", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("unexpected network")))
    assert models.fetch_ollama_cloud_models(api_key="test-only") == available + ["unrelated-model"]


def test_ollama_live_catalog_is_authoritative_against_stale_registry(monkeypatch, tmp_path):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path))
    monkeypatch.setattr(models, "_load_ollama_cloud_cache", lambda **_kwargs: None)
    monkeypatch.setattr(models, "_save_ollama_cloud_cache", lambda _models, **_kwargs: None)
    monkeypatch.setattr(models, "fetch_api_models", lambda *_args, **_kwargs: ["deepseek-v4.1-flash"])
    monkeypatch.setattr(
        models_dev,
        "list_agentic_models",
        lambda *_args: (_ for _ in ()).throw(AssertionError("registry must not be queried when live catalog works")),
    )

    result = models.fetch_ollama_cloud_models(
        api_key="test-only", base_url="https://ollama.com/v1", force_refresh=True
    )

    assert result == ["deepseek-v4.1-flash"]


def test_ollama_registry_remains_fallback_when_live_catalog_is_unavailable(monkeypatch, tmp_path):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path))
    monkeypatch.delenv("OLLAMA_API_KEY", raising=False)
    monkeypatch.delenv("OLLAMA_BASE_URL", raising=False)
    monkeypatch.setattr(models, "_load_ollama_cloud_cache", lambda **_kwargs: None)
    monkeypatch.setattr(models, "_save_ollama_cloud_cache", lambda _models, **_kwargs: None)
    monkeypatch.setattr(models, "fetch_api_models", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(models_dev, "list_agentic_models", lambda *_args: ["deepseek-v4.1-flash:cloud"])

    result = models.fetch_ollama_cloud_models(
        api_key="test-only", base_url="https://ollama.com/v1", force_refresh=True
    )

    assert result == []


def test_configured_ollama_key_is_resolved_for_live_catalog(monkeypatch, tmp_path):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path))
    monkeypatch.delenv("OLLAMA_API_KEY", raising=False)
    monkeypatch.delenv("OLLAMA_BASE_URL", raising=False)
    monkeypatch.setattr(models, "_load_ollama_cloud_cache", lambda **_kwargs: None)
    monkeypatch.setattr(models, "_save_ollama_cloud_cache", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        "cli.config.get_env_value",
        lambda name: "runtime-test-key" if name == "OLLAMA_API_KEY" else None,
    )
    monkeypatch.setattr(
        "cli.auth.resolve_api_key_provider_credentials",
        lambda _provider: {
            "api_key": "runtime-test-key",
            "base_url": "https://ollama.com/v1",
        },
    )
    requests = []

    def fetch(api_key, base_url, **kwargs):
        requests.append((api_key, base_url, kwargs))
        return ["unlisted-live-model", "deepseek-v4.1-flash", "glm-5.3"]

    monkeypatch.setattr(models, "fetch_api_models", fetch)
    monkeypatch.setattr(
        models_dev,
        "list_agentic_models",
        lambda *_args: (_ for _ in ()).throw(
            AssertionError("registry catalog must not replace account availability")
        ),
    )

    result = models.fetch_ollama_cloud_models(force_refresh=True)

    assert result == ["deepseek-v4.1-flash", "glm-5.3", "unlisted-live-model"]
    assert requests == [(
        "runtime-test-key",
        "https://ollama.com/v1",
        {"timeout": 8.0, "allow_redirects": False},
    )]


def test_ollama_live_catalog_keeps_versioned_live_ids(monkeypatch, tmp_path):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path))
    monkeypatch.setattr(models, "_load_ollama_cloud_cache", lambda **_kwargs: None)
    monkeypatch.setattr(models, "_save_ollama_cloud_cache", lambda _models, **_kwargs: None)
    monkeypatch.setattr(models, "fetch_api_models", lambda *_args, **_kwargs: ["deepseek-v4-pro:0813"])
    monkeypatch.setattr(models_dev, "list_agentic_models", lambda *_args: [])

    assert models.fetch_ollama_cloud_models(
        api_key="test-only", base_url="https://ollama.com/v1", force_refresh=True
    ) == ["deepseek-v4-pro:0813"]


def test_malformed_live_catalog_entries_are_ignored_and_valid_ids_are_normalized(monkeypatch, tmp_path):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path))
    monkeypatch.setattr(models, "_load_ollama_cloud_cache", lambda **_kwargs: None)
    monkeypatch.setattr(models, "_save_ollama_cloud_cache", lambda _models, **_kwargs: None)
    monkeypatch.setattr(
        models,
        "fetch_api_models",
        lambda *_args, **_kwargs: [
            {"id": "wrong-shape"},
            None,
            " deepseek-v4.1-flash ",
            "deepseek-v4.1-flash",
            "x" * 257,
        ],
    )
    monkeypatch.setattr(models_dev, "list_agentic_models", lambda *_args: [])

    assert models.fetch_ollama_cloud_models(
        api_key="test-only", base_url="https://ollama.com/v1", force_refresh=True
    ) == ["deepseek-v4.1-flash"]


def test_corrupt_ollama_cache_entries_are_filtered(tmp_path, monkeypatch):
    cache_path = tmp_path / "ollama_cloud_models_cache.json"
    cache_path.write_text(
        '{"version":4,"source":"live-api","models":[" deepseek-v4.1-flash ", {"id":"bad"}, "deepseek-v4.1-flash"],'
        '"cached_at":9999999999}',
        encoding="utf-8",
    )
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path))

    cached = models._load_ollama_cloud_cache()

    assert cached is not None
    assert cached["models"] == ["deepseek-v4.1-flash"]


def test_legacy_merged_ollama_cache_is_invalidated(tmp_path, monkeypatch):
    cache_path = tmp_path / "ollama_cloud_models_cache.json"
    cache_path.write_text(
        '{"models":["deepseek-v4.1-flash","minimax-m2.5"],"cached_at":9999999999}',
        encoding="utf-8",
    )
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path))

    assert models._load_ollama_cloud_cache() is None


def test_ollama_registry_cache_is_not_treated_as_live_availability(tmp_path, monkeypatch):
    cache_path = tmp_path / "ollama_cloud_models_cache.json"
    cache_path.write_text(
        '{"version":4,"source":"models.dev","models":["deepseek-v4.1-flash"],'
        '"cached_at":9999999999}',
        encoding="utf-8",
    )
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path))

    assert models._load_ollama_cloud_cache() is None


def test_ollama_cloud_catalog_cache_is_scoped_to_credentials_without_persisting_keys(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path))
    monkeypatch.setattr(models_dev, "list_agentic_models", lambda *_args: [])
    calls = []

    def fetch(api_key, *_args, **_kwargs):
        calls.append(api_key)
        return {
            "account-a-test-key": ["deepseek-v4.1-flash"],
            "account-b-test-key": ["glm-5.3-flash"],
        }[api_key]

    monkeypatch.setattr(models, "fetch_api_models", fetch)
    kwargs = {"base_url": "https://ollama.com/v1"}

    assert models.fetch_ollama_cloud_models("account-a-test-key", **kwargs) == [
        "deepseek-v4.1-flash"
    ]
    assert models.fetch_ollama_cloud_models("account-b-test-key", **kwargs) == [
        "glm-5.3-flash"
    ]
    # Reusing A's credential reads A's own catalog and does not make another
    # provider request after B has populated the shared cache file.
    assert models.fetch_ollama_cloud_models("account-a-test-key", **kwargs) == [
        "deepseek-v4.1-flash"
    ]
    assert calls == ["account-a-test-key", "account-b-test-key"]

    cache_text = "\n".join(
        path.read_text(encoding="utf-8")
        for path in tmp_path.glob("ollama_cloud_models_cache.*.json")
    )
    assert "account-a-test-key" not in cache_text
    assert "account-b-test-key" not in cache_text
    assert len(list(tmp_path.glob("ollama_cloud_models_cache.*.json"))) == 2

    models.invalidate_ollama_cloud_models_cache()
    assert list(tmp_path.glob("ollama_cloud_models_cache.*.json")) == []


def test_ollama_cloud_catalog_cache_is_scoped_to_endpoint_for_same_credential(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path))
    monkeypatch.setattr(models_dev, "list_agentic_models", lambda *_args: [])
    calls = []
    catalogs = {
        "https://ollama.com/v1": ["deepseek-v4.1-flash"],
        "https://ollama.com/tenant/v1": ["glm-5.3-flash"],
    }

    def fetch(api_key, base_url, **_kwargs):
        calls.append((api_key, base_url))
        return catalogs[base_url]

    monkeypatch.setattr(models, "fetch_api_models", fetch)
    api_key = "shared-account-test-key"

    assert models.fetch_ollama_cloud_models(
        api_key, "https://ollama.com/v1"
    ) == ["deepseek-v4.1-flash"]
    assert models.fetch_ollama_cloud_models(
        api_key, "https://ollama.com/tenant/v1"
    ) == ["glm-5.3-flash"]
    assert models.fetch_ollama_cloud_models(
        api_key, "https://ollama.com/v1"
    ) == ["deepseek-v4.1-flash"]
    assert calls == [
        (api_key, "https://ollama.com/v1"),
        (api_key, "https://ollama.com/tenant/v1"),
    ]


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
    monkeypatch.setattr(models, "_save_ollama_cloud_cache", lambda _models, **_kwargs: None)
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

    assert result == []


def test_ollama_cloud_catalog_requests_disable_redirects(monkeypatch, tmp_path):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path))
    monkeypatch.setattr(models, "_load_ollama_cloud_cache", lambda **_kwargs: None)
    monkeypatch.setattr(models, "_save_ollama_cloud_cache", lambda _models, **_kwargs: None)
    monkeypatch.setattr(models_dev, "list_agentic_models", lambda *_args: [])
    calls = []

    def fake_fetch_api_models(api_key, base_url, **kwargs):
        calls.append((api_key, base_url, kwargs))
        return ["deepseek-v4.1-flash"]

    monkeypatch.setattr(models, "fetch_api_models", fake_fetch_api_models)

    result = models.fetch_ollama_cloud_models(
        api_key="test-only",
        base_url="https://ollama.com/v1",
        force_refresh=True,
    )

    assert calls == [(
        "test-only", "https://ollama.com/v1", {"timeout": 8.0, "allow_redirects": False}
    )]
    assert result == ["deepseek-v4.1-flash"]


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
