"""Regression coverage for the configured Ollama Cloud default across routers."""

from unittest.mock import patch

from runtime.smart_track_orchestrator import build_model_wall, resolve_smart_track_model


def test_smart_track_low_default_prefers_configured_ollama_model_over_catalog_order():
    """A live catalog's ordering must not silently override the chosen default."""
    catalog = {
        "groups": [
            {
                "provider_id": "ollama-cloud",
                "provider": "Ollama Cloud",
                "models": [],
            }
        ]
    }
    live_models = ["nemotron-3-nano:30b", "deepseek-v4.1-flash"]

    with patch("web.api.config.get_available_models", return_value=catalog), \
         patch("cli.auth.resolve_api_key_provider_credentials", return_value={"api_key": "test-only"}), \
         patch("cli.models.fetch_ollama_cloud_models", return_value=live_models):
        wall = build_model_wall()

    assert wall["low"]["default"] == "deepseek-v4.1-flash"


def test_smart_track_explicit_low_effort_override_beats_ollama_default():
    catalog = {
        "groups": [
            {
                "provider_id": "ollama-cloud",
                "provider": "Ollama Cloud",
                "models": [],
            }
        ]
    }
    live_models = ["nemotron-3-nano:30b", "deepseek-v4.1-flash"]
    config = {"effort": "low", "overrides": {"low": "nemotron-3-nano:30b"}}

    with patch("web.api.config.get_available_models", return_value=catalog), \
         patch("cli.auth.resolve_api_key_provider_credentials", return_value={"api_key": "test-only"}), \
         patch("cli.models.fetch_ollama_cloud_models", return_value=live_models):
        selected = resolve_smart_track_model(effort="low", config=config)

    assert selected["model"] == "nemotron-3-nano:30b"
    assert selected["overridden"] is True
