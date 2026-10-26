"""Regression tests for the bridge-free ``/api/auth/status`` startup probe.

The desktop startup gate calls ``getAccessAuthStatus`` -> ``GET
/api/auth/status``. It must answer promptly (without going through the bounded
legacy bridge pool) so a stalled first request cannot make the probe time out
and strand the Electron startup screen with
"Sidekick API request timed out after 30000 ms".
"""

from __future__ import annotations

import web.api.auth as auth


def _client(monkeypatch):
    from fastapi.testclient import TestClient
    from cli.web_server import app, _SESSION_TOKEN

    monkeypatch.setenv("LASTBROWSER_INTEGRATED", "1")
    client = TestClient(app, base_url="http://127.0.0.1")
    return client, _SESSION_TOKEN


def test_auth_status_does_not_touch_the_legacy_bridge(monkeypatch):
    # If the probe is answered natively, the in-process bridge dispatcher the
    # catch-all route binds to is never invoked, so a stalled bridge pool
    # cannot delay startup. Patch the name the catch-all actually calls.
    from cli import web_server

    async def _boom(*_a, **_k):  # pragma: no cover - must never run
        raise AssertionError("auth status must not go through the legacy bridge")

    monkeypatch.setattr(web_server, "dispatch_route", _boom)
    monkeypatch.setattr(auth, "is_auth_enabled", lambda: False)

    client, token = _client(monkeypatch)
    resp = client.get("/api/auth/status", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == {"auth_enabled": False, "logged_in": False}


def test_auth_status_reports_enabled_but_logged_out_without_cookie(monkeypatch):
    monkeypatch.setattr(auth, "is_auth_enabled", lambda: True)
    monkeypatch.setattr(auth, "verify_session", lambda _v: False)

    client, token = _client(monkeypatch)
    resp = client.get("/api/auth/status", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == {"auth_enabled": True, "logged_in": False}


def test_auth_status_reports_logged_in_with_valid_cookie(monkeypatch):
    monkeypatch.setattr(auth, "is_auth_enabled", lambda: True)
    monkeypatch.setattr(auth, "verify_session", lambda value: value == "good.sig")

    client, token = _client(monkeypatch)
    client.cookies.set(auth.COOKIE_NAME, "good.sig")
    resp = client.get(
        "/api/auth/status",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"auth_enabled": True, "logged_in": True}


def test_auth_status_fails_closed_when_auth_state_unreadable(monkeypatch):
    def _raise():
        raise RuntimeError("settings unreadable")

    monkeypatch.setattr(auth, "is_auth_enabled", _raise)

    client, token = _client(monkeypatch)
    resp = client.get("/api/auth/status", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    # Fail closed: present the login gate rather than granting access.
    assert resp.json() == {"auth_enabled": True, "logged_in": False}
