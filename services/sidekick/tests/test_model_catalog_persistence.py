import json

from runtime.independent.scoped_models import read_persistent_model_catalog, write_persistent_model_catalog


def test_persistent_catalog_returns_only_the_matching_provider_digest(tmp_path):
    catalog = {"providerConfigurationDigest": "digest-a", "groups": [{"provider_id": "ollama", "models": []}]}
    write_persistent_model_catalog(tmp_path, "digest-a", catalog)
    assert read_persistent_model_catalog(tmp_path, "digest-a") == catalog
    assert read_persistent_model_catalog(tmp_path, "digest-b") is None
    saved = json.loads((tmp_path / "model-catalog-cache.json").read_text(encoding="utf-8"))
    assert saved["digest"] == "digest-a"


def test_persistent_catalog_drops_a_stale_opencode_model_list(tmp_path):
    catalog = {"providerConfigurationDigest": "digest-a", "groups": [{"provider_id": "opencode-go", "models": [{"id": "old"}]}]}
    write_persistent_model_catalog(tmp_path, "digest-a", catalog, model_identity="models-a")
    assert read_persistent_model_catalog(tmp_path, "digest-a", model_identity="models-a") == catalog
    assert read_persistent_model_catalog(tmp_path, "digest-a", model_identity="models-b") is None
    assert read_persistent_model_catalog(tmp_path, "digest-a") == catalog
