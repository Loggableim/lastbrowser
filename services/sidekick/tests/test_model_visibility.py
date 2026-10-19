"""Tests for the shared per-model visibility state (issue #172, F3)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from runtime import model_visibility
from runtime.smart_track_orchestrator import build_model_wall, resolve_smart_track_model
from runtime.teamwork_orchestrator import get_teamwork_model_pool


@pytest.fixture
def visibility_file(tmp_path, monkeypatch):
    state_path = tmp_path / "model-visibility.json"
    monkeypatch.setattr(model_visibility, "get_model_visibility_path", lambda: state_path)
    return state_path


def _each_provider_catalog():
    return {
        "active_provider": "opencode-go",
        "default_model": "model-a",
        "groups": [
            {
                "provider_id": "opencode-go",
                "provider": "OpenCode Go",
                "models": [
                    {"id": "model-a", "name": "Model A"},
                    {"id": "model-b", "name": "Model B"},
                ],
            },
            {
                "provider_id": "openrouter",
                "provider": "OpenRouter",
                "models": [
                    {"id": "model-c", "name": "Model C"},
                    {"id": "model-d", "name": "Model D"},
                ],
            },
            {
                "provider_id": "ollama",
                "provider": "Ollama",
                "models": [{"id": "qwen3:4b", "name": "Qwen 3 4B"}],
            },
        ],
    }


def test_visibility_key_is_provider_qualified():
    assert model_visibility.visibility_key("OpenCode-Go", "model-a") == "opencode-go:model-a"
    assert model_visibility.visibility_key(None, "model-a") == "model-a"
    assert model_visibility.visibility_key("go", "   ") == ""


def test_load_and_save_tolerate_missing_and_corrupt_state(visibility_file):
    assert model_visibility.load_disabled_models(reload=True) == set()

    visibility_file.write_text("{not json", encoding="utf-8")
    assert model_visibility.load_disabled_models(reload=True) == set()

    saved = model_visibility.save_disabled_models([" openrouter:model-c ", "", "go:model-a"])
    assert saved == {"openrouter:model-c", "go:model-a"}
    payload = json.loads(visibility_file.read_text(encoding="utf-8"))
    assert payload["disabled_models"] == ["go:model-a", "openrouter:model-c"]
    assert model_visibility.load_disabled_models(reload=True) == saved


def test_is_model_disabled_matches_provider_bare_and_prefixed_ids():
    disabled = {"opencode-go:model-a", "openrouter:@openrouter:model-c", "bare-model"}

    assert model_visibility.is_model_disabled(disabled, "opencode-go", "model-a")
    assert model_visibility.is_model_disabled(disabled, "OPENCODE-GO", "model-a")
    assert model_visibility.is_model_disabled(disabled, "openrouter", "@openrouter:model-c")
    assert model_visibility.is_model_disabled(disabled, "openrouter", "model-c")
    assert model_visibility.is_model_disabled(disabled, None, "bare-model")
    assert not model_visibility.is_model_disabled(disabled, "ollama", "model-a")
    assert not model_visibility.is_model_disabled(disabled, "opencode-go", "")


def test_filter_helpers_drop_disabled_models_and_fallbacks():
    groups = _each_provider_catalog()["groups"]
    disabled = {"openrouter:model-c"}

    filtered = model_visibility.filter_model_groups(groups, disabled)
    assert [model["id"] for model in filtered[1]["models"]] == ["model-d"]
    assert [model["id"] for model in filtered[0]["models"]] == ["model-a", "model-b"]

    all_off = {"opencode-go:model-a", "opencode-go:model-b"}
    assert [group["provider_id"] for group in model_visibility.filter_model_groups(groups, all_off)] == [
        "openrouter",
        "ollama",
    ]

    chain = [
        {"provider": "openrouter", "model": "model-c"},
        {"provider": "opencode-go", "model": "model-a"},
    ]
    assert model_visibility.filter_fallback_chain(chain, disabled) == [chain[1]]
    assert model_visibility.filter_fallback_chain({"provider": "openrouter", "model": "model-c"}, disabled) is None


def test_smart_track_wall_skips_disabled_models_across_providers(monkeypatch, visibility_file):
    catalog = _each_provider_catalog()
    monkeypatch.setattr("web.api.config.get_available_models", lambda: catalog)
    monkeypatch.setattr("cli.auth.resolve_api_key_provider_credentials", lambda *_args, **_kwargs: {"api_key": ""})
    model_visibility.save_disabled_models({"openrouter:model-c"})

    wall = build_model_wall()
    ids = {model["id"] for tier in wall.values() for model in tier.get("models", [])}

    assert "model-c" not in ids
    assert {"model-a", "model-b", "model-d", "qwen3:4b"} <= ids


def test_smart_track_refuses_to_route_when_every_model_is_off(monkeypatch, visibility_file):
    catalog = _each_provider_catalog()
    monkeypatch.setattr("web.api.config.get_available_models", lambda: catalog)
    monkeypatch.setattr("cli.auth.resolve_api_key_provider_credentials", lambda *_args, **_kwargs: {"api_key": ""})
    disabled = {
        "opencode-go:model-a",
        "opencode-go:model-b",
        "openrouter:model-c",
        "openrouter:model-d",
        "ollama:qwen3:4b",
    }
    model_visibility.save_disabled_models(disabled)

    with pytest.raises(RuntimeError, match="Einstellungen"):
        resolve_smart_track_model(prompt="Hallo")


def test_teamwork_pool_skips_disabled_models_across_providers(monkeypatch, visibility_file):
    catalog = _each_provider_catalog()
    monkeypatch.setattr("web.api.config.get_available_models", lambda: catalog)
    monkeypatch.setattr("cli.auth.resolve_api_key_provider_credentials", lambda *_args, **_kwargs: {"api_key": ""})
    model_visibility.save_disabled_models({"openrouter:model-c"})

    pool = get_teamwork_model_pool()
    ids = {model["id"] for model in pool}

    assert "model-c" not in ids
    assert {"model-a", "model-b", "model-d", "qwen3:4b"} <= ids


def test_teamwork_pool_is_empty_when_every_model_is_off(monkeypatch, visibility_file):
    catalog = _each_provider_catalog()
    monkeypatch.setattr("web.api.config.get_available_models", lambda: catalog)
    monkeypatch.setattr("cli.auth.resolve_api_key_provider_credentials", lambda *_args, **_kwargs: {"api_key": ""})
    disabled = {
        "opencode-go:model-a",
        "opencode-go:model-b",
        "openrouter:model-c",
        "openrouter:model-d",
        "ollama:qwen3:4b",
    }
    model_visibility.save_disabled_models(disabled)

    assert get_teamwork_model_pool() == []
