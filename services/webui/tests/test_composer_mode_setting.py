"""Regression tests for the composer_mode setting."""

import json


def test_composer_mode_defaults_to_action_and_round_trips(monkeypatch, tmp_path):
    import api.config as config

    settings_path = tmp_path / "settings.json"
    monkeypatch.setattr(config, "SETTINGS_FILE", settings_path)

    loaded = config.load_settings()
    assert loaded["composer_mode"] == "action"

    saved = config.save_settings({"composer_mode": "plan"})
    assert saved["composer_mode"] == "plan"
    assert json.loads(settings_path.read_text(encoding="utf-8"))["composer_mode"] == "plan"

    saved = config.save_settings({"composer_mode": "action"})
    assert saved["composer_mode"] == "action"


def test_composer_mode_is_a_valid_enum_setting():
    import api.config as config

    assert "composer_mode" in config._SETTINGS_DEFAULTS
    assert "composer_mode" in config._SETTINGS_ENUM_VALUES
    assert "composer_mode" in config._SETTINGS_ALLOWED_KEYS
