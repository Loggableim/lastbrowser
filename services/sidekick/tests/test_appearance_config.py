import pytest
from web.api.config import (
    _SETTINGS_DEFAULTS,
    _SETTINGS_THEME_VALUES,
    _SETTINGS_SKIN_VALUES,
    _SETTINGS_ENUM_VALUES,
    _normalize_appearance,
    save_settings,
    load_settings,
)


def test_theme_values_include_oled():
    assert "oled" in _SETTINGS_THEME_VALUES
    assert "dark" in _SETTINGS_THEME_VALUES
    assert "light" in _SETTINGS_THEME_VALUES
    assert "system" in _SETTINGS_THEME_VALUES


def test_skin_values_include_new_skins():
    assert "sienna" in _SETTINGS_SKIN_VALUES
    assert "matrix" in _SETTINGS_SKIN_VALUES
    assert "custom" in _SETTINGS_SKIN_VALUES


def test_settings_defaults_contain_appearance_extensions():
    assert _SETTINGS_DEFAULTS["message_layout"] == "bubbles"
    assert _SETTINGS_DEFAULTS["syntax_theme"] == ""
    assert _SETTINGS_DEFAULTS["accent_color"] == ""
    assert _SETTINGS_DEFAULTS["default_zoom"] == 100


def test_normalize_appearance_oled_and_custom_skins():
    theme, skin = _normalize_appearance("oled", "matrix")
    assert theme == "oled"
    assert skin == "matrix"

    theme, skin = _normalize_appearance("oled", "custom")
    assert theme == "oled"
    assert skin == "custom"

    theme, skin = _normalize_appearance("light", "sienna")
    assert theme == "light"
    assert skin == "sienna"


def test_save_settings_persists_appearance_fields(tmp_path, monkeypatch):
    test_file = tmp_path / "settings.json"
    import web.api.config as config_mod

    monkeypatch.setattr(config_mod, "SETTINGS_FILE", test_file)
    monkeypatch.setattr(config_mod, "_SETTINGS_CACHE", {"key": None, "settings": None})

    saved = save_settings({
        "theme": "oled",
        "skin": "custom",
        "accent_color": "#00d26a",
        "font_size": "xlarge",
        "default_zoom": 125,
        "message_layout": "compact",
        "syntax_theme": "one-dark"
    })

    assert saved["theme"] == "oled"
    assert saved["skin"] == "custom"
    assert saved["accent_color"] == "#00d26a"
    assert saved["font_size"] == "xlarge"
    assert saved["default_zoom"] == 125
    assert saved["message_layout"] == "compact"
    assert saved["syntax_theme"] == "one-dark"


def test_save_settings_rejects_invalid_hex_and_zoom(tmp_path, monkeypatch):
    test_file = tmp_path / "settings.json"
    import web.api.config as config_mod

    monkeypatch.setattr(config_mod, "SETTINGS_FILE", test_file)
    monkeypatch.setattr(config_mod, "_SETTINGS_CACHE", {"key": None, "settings": None})

    saved = save_settings({
        "accent_color": "not-a-color",
        "default_zoom": 99999,  # exceeds 300%
    })

    # Invalid values should be ignored and keep defaults
    assert saved["accent_color"] == ""
    assert saved["default_zoom"] == 100
