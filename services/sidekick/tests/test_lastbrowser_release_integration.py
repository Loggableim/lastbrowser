"""Release regression: importing the Web API must not lose integration detection."""
from pathlib import Path

from shared import constants


def test_explicit_integration_flag(monkeypatch):
    monkeypatch.setenv("LASTBROWSER_INTEGRATED", "true")
    assert constants.is_lastbrowser_integrated()
    monkeypatch.setenv("LASTBROWSER_INTEGRATED", "0")
    assert not constants.is_lastbrowser_integrated()


def test_shipped_manifest_detects_integration(monkeypatch, tmp_path):
    monkeypatch.delenv("LASTBROWSER_INTEGRATED", raising=False)
    for name in ("LASTBROWSER_HOME", "LASTBROWSER_WEBUI_AGENT_DIR",
                 "LASTBROWSER_BRIDGE_TOKEN", "LASTBROWSER_SIDEKICK_DIR",
                 "LASTBROWSER_WEBUI_PORT"):
        monkeypatch.delenv(name, raising=False)
    constants_path = tmp_path / "services" / "sidekick" / "shared" / "constants.py"
    constants_path.parent.mkdir(parents=True)
    monkeypatch.setattr(constants, "__file__", str(constants_path))
    assert not constants.is_lastbrowser_integrated()
    (tmp_path / "services" / "sidekick-source.json").write_text('{}')
    assert constants.is_lastbrowser_integrated()


def test_web_api_discovers_committed_backend(monkeypatch, tmp_path):
    monkeypatch.setenv("LASTBROWSER_INTEGRATED", "1")
    monkeypatch.setenv("SIDEKICK_WEBUI_STATE_DIR", str(tmp_path / "webui"))
    from web.api import config
    assert Path(config._AGENT_DIR).resolve() == Path(constants.__file__).resolve().parents[1]
