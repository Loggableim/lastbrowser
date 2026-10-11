"""Settings must expose the existing scoped OpenCode CLI login controls."""
from cli.auth import PROVIDER_REGISTRY
from web.api.onboarding import _build_setup_catalog


def test_supported_opencode_providers_are_in_authoritative_setup_catalog():
    catalog = _build_setup_catalog({})
    providers = {row["id"]: row for row in catalog["providers"]}
    for provider_id in ("opencode-zen", "opencode-go"):
        row = providers[provider_id]
        registered = PROVIDER_REGISTRY[provider_id]
        assert row["default_base_url"] == registered.inference_base_url
        assert row["env_var"] in registered.api_key_env_vars
        assert row["label"] == registered.name
        assert row["key_optional"] is False
        assert row["oauth_provider"] == ""  # Dedicated CLI login, not generic OAuth.
        assert any(provider_id in category["providers"] for category in catalog["categories"])
