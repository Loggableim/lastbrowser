"""Targeted stability/security regressions for frontend fetches and model cache."""

import json
from pathlib import Path

import api.config as config


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8-sig")


def test_frontend_has_shared_relative_json_fetch_helper():
    src = read("static/ui.js")
    assert "function hermesApiUrl(" in src
    assert "function fetchJson(" in src
    assert "newURL(rel,document.baseURI||location.href)" in src.replace(" ", "")
    assert "credentials:'include'" in src


def test_high_risk_frontend_fetches_use_relative_helper():
    gmail = read("static/gmail.js")
    panels = read("static/panels.js")
    ui = read("static/ui.js")

    for root_fetch in (
        "fetch('/api/gmail/accounts",
        "fetch('/api/gmail/delete",
        "fetch('/api/gmail/move",
        "fetch('/api/gmail/send",
        "fetch('/api/spaces",
        "fetch('/api/space/config",
        "fetch('/api/cast/status",
        "fetch('/api/session/context-info",
    ):
        assert root_fetch not in gmail + panels + ui

    assert "fetchJson(_gmailAccount('api/gmail/accounts')" in gmail
    assert "fetchJson('api/spaces')" in panels
    assert "fetchJson('api/cast/status'" in ui


def test_dynamic_error_text_not_inserted_as_html_in_targeted_paths():
    gmail = read("static/gmail.js")
    panels = read("static/panels.js")
    enhancements = read("static/enhancements.js")

    assert "detailScroll.innerHTML = `<div class=\"gmail-empty\"><div class=\"gmail-empty-icon\">⚠️</div>Fehler: ${e.message}</div>`" not in gmail
    assert "mainList.innerHTML = `<div class=\"gmail-empty\"><div class=\"gmail-empty-icon\">⚠️</div>Fehler: ${e.message}</div>`" not in gmail
    assert "summaryBody.innerHTML = `<div class=\"gmail-ai-placeholder\"><span class=\"gmail-ai-robot-big\">🤖</span><span>⚠️ ${e.message}</span></div>`" not in gmail
    assert "list.innerHTML='<div style=\"color:var(--error);padding:12px;font-size:13px\">Failed to load providers: '+e.message+'</div>'" not in panels
    assert "dialog.innerHTML = `<span style=\"color:var(--destructive,#ef4444);font-size:12px\">✗ ${msg}</span>`" not in enhancements

    assert "gmailSetEmpty(detailScroll, '⚠️', 'Fehler: ' + _gmailErrorMessage(e));" in gmail
    assert "_setPlainStatus(dialog, '✗ ' + msg" in enhancements


def test_models_cache_startup_cleanup_removes_stale_tmp_files(tmp_path, monkeypatch):
    cache_path = tmp_path / "models_cache.json"
    monkeypatch.setattr(config, "_models_cache_path", cache_path)

    stale_tmp = tmp_path / "models_cache.json.123.tmp"
    unrelated_tmp = tmp_path / "other.json.123.tmp"
    stale_tmp.write_text("partial", encoding="utf-8")
    unrelated_tmp.write_text("keep", encoding="utf-8")

    config._cleanup_stale_models_cache_tmp_files()

    assert not stale_tmp.exists()
    assert unrelated_tmp.exists()


def test_save_models_cache_to_disk_uses_os_replace(tmp_path, monkeypatch):
    cache_path = tmp_path / "models_cache.json"
    monkeypatch.setattr(config, "_models_cache_path", cache_path)

    calls = []
    real_replace = config.os.replace

    def tracked_replace(src, dst):
        calls.append((Path(src).name, Path(dst).name))
        real_replace(src, dst)

    monkeypatch.setattr(config.os, "replace", tracked_replace)

    payload = {
        "active_provider": "openai",
        "default_model": "gpt-5.4-mini",
        "configured_model_badges": {},
        "groups": [{"provider": "OpenAI", "provider_id": "openai", "models": []}],
    }
    config._save_models_cache_to_disk(payload)

    assert calls, "_save_models_cache_to_disk must publish with os.replace"
    assert calls[-1][1] == "models_cache.json"
    assert not list(tmp_path.glob("models_cache.json.*.tmp"))
    assert json.loads(cache_path.read_text(encoding="utf-8"))["default_model"] == "gpt-5.4-mini"


def test_targeted_interval_lifecycle_cleanup_hooks_are_registered():
    login = read("static/login.js")
    enhancements = read("static/enhancements.js")
    ui = read("static/ui.js")

    assert "function cleanupConnectivityProbe()" in login
    assert "window.addEventListener('pagehide', cleanupConnectivityProbe" in login
    assert "window.addEventListener('beforeunload', cleanupConnectivityProbe" in login

    assert "let _enhancementsSessionRetryTimer" in enhancements
    assert "function _cleanupEnhancementTimers()" in enhancements
    assert "window.addEventListener('pagehide', _cleanupEnhancementTimers" in enhancements

    assert "let _castStatusTimer" in ui
    assert "function _cleanupCastTimers()" in ui
    assert "window.addEventListener('pagehide', _cleanupCastTimers" in ui
    assert "_castStatusTimer=setInterval(_refreshCastStatus,15000)" in ui
    assert "\nsetInterval(_refreshCastStatus,15000)" not in ui
