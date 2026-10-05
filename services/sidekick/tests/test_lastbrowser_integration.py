"""Tests for Lastbrowser in-tree Sidekick backend integration.

Verifies:
1. Detection of Lastbrowser integrated environment.
2. In-tree path discovery (no external candidates).
3. Blocking of independent backend updates (Web API & CLI).
4. Safe version detection without git describe on the outer monorepo.
"""

from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import patch
import pytest

from shared.constants import is_lastbrowser_integrated


def test_is_lastbrowser_integrated_env_override(monkeypatch):
    monkeypatch.setenv("LASTBROWSER_INTEGRATED", "1")
    assert is_lastbrowser_integrated() is True

    monkeypatch.setenv("LASTBROWSER_INTEGRATED", "0")
    assert is_lastbrowser_integrated() is False


def test_is_lastbrowser_integrated_defaults_to_true_for_intree(monkeypatch):
    monkeypatch.delenv("LASTBROWSER_INTEGRATED", raising=False)
    monkeypatch.delenv("LASTBROWSER_HOME", raising=False)
    monkeypatch.delenv("LASTBROWSER_WEBUI_AGENT_DIR", raising=False)
    # Inside the monorepo, default is True
    assert is_lastbrowser_integrated() is True


def test_discover_agent_dir_does_not_probe_external_candidates(monkeypatch, tmp_path):
    from web.api.config import _discover_agent_dir

    fake_home = tmp_path / "fake_home"
    fake_home.mkdir()
    fake_ext_agent = fake_home / ".sidekick" / "sidekick-agent"
    fake_ext_agent.mkdir(parents=True)

    monkeypatch.setattr(Path, "home", lambda: fake_home)
    monkeypatch.setenv("LASTBROWSER_INTEGRATED", "1")
    monkeypatch.delenv("SIDEKICK_WEBUI_AGENT_DIR", raising=False)

    discovered = _discover_agent_dir()
    # Must NOT resolve to fake external candidate ~/.sidekick/sidekick-agent
    assert discovered != fake_ext_agent
    # Must resolve to in-tree services/sidekick
    repo_sidekick = Path(__file__).resolve().parent.parent
    assert discovered == repo_sidekick


def test_updates_api_returns_disabled_in_lastbrowser(monkeypatch):
    import web.api.updates as updates

    monkeypatch.setenv("LASTBROWSER_INTEGRATED", "1")

    # Ensure no git commands are invoked
    with patch("subprocess.run") as mock_run:
        check = updates.check_for_updates()
        assert check.get("disabled") is True
        assert check.get("managed_by") == "lastbrowser"
        assert "Lastbrowser" in check.get("message", "")

        apply_res = updates.apply_update("webui")
        assert apply_res.get("disabled") is True
        assert apply_res.get("managed_by") == "lastbrowser"

        force_res = updates.apply_force_update("webui")
        assert force_res.get("disabled") is True
        assert force_res.get("managed_by") == "lastbrowser"

        repo_check = updates._check_repo(Path(__file__).parent, "webui")
        assert repo_check is None

        mock_run.assert_not_called()


def test_web_server_update_endpoint_returns_409(monkeypatch):
    from fastapi.testclient import TestClient
    from cli.web_server import app, _SESSION_TOKEN

    monkeypatch.setenv("LASTBROWSER_INTEGRATED", "1")

    client = TestClient(app)
    response = client.post(
        "/api/sidekick/update",
        headers={"Authorization": f"Bearer {_SESSION_TOKEN}"}
    )
    assert response.status_code == 409
    data = response.json()
    assert data.get("ok") is False
    assert data.get("disabled") is True
    assert data.get("managed_by") == "lastbrowser"


def test_cli_update_commands_blocked_in_lastbrowser(monkeypatch, capsys):
    import cli.main as main

    monkeypatch.setenv("LASTBROWSER_INTEGRATED", "1")

    with patch("subprocess.run") as mock_run:
        main._cmd_update_check()
        captured = capsys.readouterr().out
        assert "Sidekick is integrated into Lastbrowser" in captured
        assert "Independent backend updates are disabled" in captured

        main.cmd_update(None)
        captured = capsys.readouterr().out
        assert "Sidekick is integrated into Lastbrowser" in captured

        mock_run.assert_not_called()


def test_banner_update_check_disabled_in_lastbrowser(monkeypatch):
    import cli.banner as banner

    monkeypatch.setenv("LASTBROWSER_INTEGRATED", "1")

    with patch("subprocess.run") as mock_run:
        assert banner.check_for_updates() is None
        banner.prefetch_update_check()
        assert banner.get_update_result() is None
        mock_run.assert_not_called()


def test_routes_update_endpoints_blocked_in_lastbrowser(monkeypatch):
    import web.api.routes as routes

    monkeypatch.setenv("LASTBROWSER_INTEGRATED", "1")

    class DummyHandler:
        client_address = ("127.0.0.1", 12345)
        headers = {"Host": "127.0.0.1", "Origin": "http://127.0.0.1"}

    captured_payloads = []

    def mock_j(handler, payload, status=200, extra_headers=None):
        captured_payloads.append((status, payload))
        return payload

    monkeypatch.setattr(routes, "j", mock_j)
    monkeypatch.setattr(routes, "read_body", lambda handler: {"target": "webui"})

    # 1. /api/updates/check even with simulate=1 must be disabled
    class DummyParsedCheck:
        path = "/api/updates/check"
        query = "simulate=1"

    routes.handle_get(DummyHandler(), DummyParsedCheck())
    status, payload = captured_payloads[-1]
    assert status == 200
    assert payload.get("disabled") is True
    assert payload.get("managed_by") == "lastbrowser"

    # 2. /api/updates/apply must return 409
    class DummyParsedApply:
        path = "/api/updates/apply"
        query = ""

    routes.handle_post(DummyHandler(), DummyParsedApply())
    status, payload = captured_payloads[-1]
    assert status == 409
    assert payload.get("ok") is False
    assert payload.get("disabled") is True
    assert payload.get("managed_by") == "lastbrowser"

    # 3. /api/updates/force must return 409
    class DummyParsedForce:
        path = "/api/updates/force"
        query = ""

    routes.handle_post(DummyHandler(), DummyParsedForce())
    status, payload = captured_payloads[-1]
    assert status == 409
    assert payload.get("ok") is False
    assert payload.get("disabled") is True


def test_auto_install_agent_deps_blocked_in_lastbrowser(monkeypatch):
    import web.api.startup as startup

    monkeypatch.setenv("LASTBROWSER_INTEGRATED", "1")
    monkeypatch.setenv("SIDEKICK_WEBUI_AUTO_INSTALL", "1")

    with patch("subprocess.run") as mock_run:
        result = startup.auto_install_agent_deps()
        assert result is False
        mock_run.assert_not_called()


def test_is_lastbrowser_integrated_recognizes_manifest_and_packaged_layout(monkeypatch):
    import json
    import tempfile
    import shutil
    monkeypatch.delenv("LASTBROWSER_INTEGRATED", raising=False)
    monkeypatch.delenv("LASTBROWSER_HOME", raising=False)
    monkeypatch.delenv("LASTBROWSER_WEBUI_AGENT_DIR", raising=False)
    monkeypatch.delenv("LASTBROWSER_BRIDGE_TOKEN", raising=False)
    monkeypatch.delenv("LASTBROWSER_SIDEKICK_DIR", raising=False)
    monkeypatch.delenv("LASTBROWSER_WEBUI_PORT", raising=False)

    temp_dir = Path(tempfile.mkdtemp(prefix="test_lb_packaged_"))
    try:
        # 1. Directory with sidekick-source.json manifest
        manifest_dir = temp_dir / "mock_install" / "resources" / "services"
        backend_dir = manifest_dir / "sidekick"
        backend_dir.mkdir(parents=True)
        manifest_file = manifest_dir / "sidekick-source.json"
        manifest_file.write_text(json.dumps({"mode": "in-tree-monorepo", "source": "in-tree"}), encoding="utf-8")

        assert is_lastbrowser_integrated(backend_dir) is True

        # 2. Packaged layout with app.asar
        packaged_dir = temp_dir / "packaged_app" / "resources"
        packaged_sidekick = packaged_dir / "services" / "sidekick"
        packaged_sidekick.mkdir(parents=True)
        (packaged_dir / "app.asar").write_bytes(b"")

        assert is_lastbrowser_integrated(packaged_sidekick) is True
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

