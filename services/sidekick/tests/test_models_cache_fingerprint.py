from __future__ import annotations

import json
import time


def test_models_cache_fingerprint_ignores_unrelated_settings_edits(monkeypatch, tmp_path):
    from web.api import config

    config_path = tmp_path / "config.yaml"
    auth_path = tmp_path / "auth.json"
    settings_path = tmp_path / "settings.json"
    config_path.write_text("model: local\n", encoding="utf-8")
    auth_path.write_text("{}", encoding="utf-8")
    settings_path.write_text(
        json.dumps({"show_openrouter_paid": False, "theme": "dark"}),
        encoding="utf-8",
    )
    monkeypatch.setattr(config, "_get_config_path", lambda: config_path)
    monkeypatch.setattr(config, "_get_auth_store_path", lambda: auth_path)
    monkeypatch.setattr(config, "SETTINGS_FILE", settings_path)

    baseline = config._models_cache_source_fingerprint()
    catalog = {
        "active_provider": None,
        "default_model": "",
        "configured_model_badges": {},
        "groups": [],
        "catalog_status": {"antigravity": "unavailable"},
    }
    monkeypatch.setattr(config, "_available_models_cache", catalog)
    monkeypatch.setattr(config, "_available_models_cache_ts", time.monotonic())
    monkeypatch.setattr(config, "_available_models_cache_source_fingerprint", baseline)

    settings_path.write_text(
        json.dumps({"show_openrouter_paid": False, "theme": "light", "font_size": "large"}),
        encoding="utf-8",
    )
    assert config._models_cache_source_fingerprint() == baseline
    assert config._get_fresh_memory_models_cache(time.monotonic()) == catalog

    settings_path.write_text(
        json.dumps({"show_openrouter_paid": True, "theme": "light", "font_size": "large"}),
        encoding="utf-8",
    )
    paid_models_enabled = config._models_cache_source_fingerprint()
    assert paid_models_enabled != baseline
    assert paid_models_enabled["settings_openrouter_paid"]["show_openrouter_paid"] is True
    assert config._get_fresh_memory_models_cache(time.monotonic()) is None


def test_models_cache_fingerprint_still_tracks_config_and_auth_changes(monkeypatch, tmp_path):
    from web.api import config

    config_path = tmp_path / "config.yaml"
    auth_path = tmp_path / "auth.json"
    settings_path = tmp_path / "settings.json"
    config_path.write_text("model: local\n", encoding="utf-8")
    auth_path.write_text("{}", encoding="utf-8")
    settings_path.write_text('{"show_openrouter_paid": false}', encoding="utf-8")
    monkeypatch.setattr(config, "_get_config_path", lambda: config_path)
    monkeypatch.setattr(config, "_get_auth_store_path", lambda: auth_path)
    monkeypatch.setattr(config, "SETTINGS_FILE", settings_path)

    baseline = config._models_cache_source_fingerprint()
    config_path.write_text("model: different\n", encoding="utf-8")
    config_changed = config._models_cache_source_fingerprint()
    assert config_changed != baseline

    auth_path.write_text('{"active_provider":"openai"}', encoding="utf-8")
    auth_changed = config._models_cache_source_fingerprint()
    assert auth_changed != config_changed
