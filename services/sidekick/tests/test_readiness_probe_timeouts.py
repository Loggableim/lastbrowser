"""Readiness probes must answer within a fixed budget even when their work is stuck.

The desktop startup gate depends on ``GET /api/auth/status`` and
``GET /api/onboarding/status``. Their work can block on the auth-store file lock
held across an OAuth refresh. These tests hold that work open and assert that
the routes return a fast, explicit 503 instead of hanging the client, while
``/health`` keeps answering.
"""

from __future__ import annotations

import asyncio
import threading
import time

import pytest

TestClient = pytest.importorskip("fastapi.testclient").TestClient


@pytest.fixture
def blocked_workers():
    """Track blocked probe workers and always release them so the shared pool recovers."""
    release = threading.Event()
    yield release
    release.set()


def _headers(web_server):
    return {web_server._SESSION_HEADER_NAME: web_server._SESSION_TOKEN}


def test_onboarding_status_returns_503_when_work_is_stuck(monkeypatch, blocked_workers):
    from cli import web_server

    entered = threading.Event()

    def stuck_status():
        entered.set()
        blocked_workers.wait(10)
        return {"ok": True}

    monkeypatch.setattr(web_server, "get_onboarding_status", stuck_status)
    monkeypatch.setenv("SIDEKICK_ONBOARDING_STATUS_TIMEOUT_SECONDS", "1")

    with TestClient(web_server.app) as client:
        started = time.monotonic()
        resp = client.get("/api/onboarding/status", headers=_headers(web_server))
        elapsed = time.monotonic() - started

        assert entered.is_set()
        assert resp.status_code == 503
        assert resp.headers.get("retry-after") == "2"
        assert resp.json()["error"] == "onboarding_status_unavailable"
        assert elapsed < 5, f"onboarding status took {elapsed:.1f}s to give up"

        health = client.get("/health")
        assert health.status_code == 200


def test_auth_status_returns_503_when_state_read_is_stuck(monkeypatch, blocked_workers):
    from cli import web_server
    from web.api import auth

    def stuck_enabled():
        blocked_workers.wait(10)
        return False

    monkeypatch.setattr(auth, "is_auth_enabled", stuck_enabled)
    monkeypatch.setenv("SIDEKICK_AUTH_STATUS_TIMEOUT_SECONDS", "1")

    with TestClient(web_server.app) as client:
        started = time.monotonic()
        resp = client.get("/api/auth/status", headers=_headers(web_server))
        elapsed = time.monotonic() - started

        assert resp.status_code == 503
        assert resp.json()["error"] == "auth_status_unavailable"
        assert elapsed < 5, f"auth status took {elapsed:.1f}s to give up"


def test_auth_status_fast_path_still_answers_normally(monkeypatch):
    from cli import web_server
    from web.api import auth

    monkeypatch.setattr(auth, "is_auth_enabled", lambda: True)
    monkeypatch.setattr(auth, "verify_session", lambda value: value == "good.sig")

    with TestClient(web_server.app) as client:
        client.cookies.set(auth.COOKIE_NAME, "good.sig")
        resp = client.get("/api/auth/status", headers=_headers(web_server))
    assert resp.status_code == 200
    assert resp.json() == {"auth_enabled": True, "logged_in": True}


def test_probe_lane_refuses_new_work_when_all_workers_are_stuck(monkeypatch, blocked_workers):
    from cli import web_server

    lane = web_server._ProbeLane("unit-test", max_inflight=2)
    stuck = []

    async def scenario():
        def block():
            stuck.append(1)
            blocked_workers.wait(10)
            return "late"

        first = asyncio.ensure_future(lane.run(block, timeout=0.3))
        second = asyncio.ensure_future(lane.run(block, timeout=0.3))
        await asyncio.sleep(0.05)
        # Both workers are stuck: the lane must reject new work immediately
        # instead of queueing it behind them.
        with pytest.raises(web_server.ProbeBusyError):
            await lane.run(lambda: "never", timeout=1)
        for task in (first, second):
            with pytest.raises(asyncio.TimeoutError):
                await task
        blocked_workers.set()
        for _ in range(100):
            if lane._inflight == 0:
                break
            await asyncio.sleep(0.02)

    asyncio.run(scenario())
    assert len(stuck) == 2
    assert lane._inflight == 0


def test_stuck_onboarding_lane_does_not_starve_auth_status(monkeypatch, blocked_workers):
    from cli import web_server
    from web.api import auth

    monkeypatch.setenv("SIDEKICK_ONBOARDING_STATUS_TIMEOUT_SECONDS", "1")
    monkeypatch.setattr(auth, "is_auth_enabled", lambda: True)
    monkeypatch.setattr(auth, "verify_session", lambda value: False)

    def stuck_status():
        blocked_workers.wait(10)
        return {}

    monkeypatch.setattr(web_server, "get_onboarding_status", stuck_status)

    with TestClient(web_server.app) as client:
        headers = _headers(web_server)
        # Fill the onboarding lane with stuck calls, then probe auth status.
        for _ in range(web_server._ONBOARDING_PROBE_LANE.max_inflight + 1):
            resp = client.get("/api/onboarding/status", headers=headers)
            assert resp.status_code == 503
        auth_resp = client.get("/api/auth/status", headers=headers)
        assert auth_resp.status_code == 200
        assert auth_resp.json() == {"auth_enabled": True, "logged_in": False}


def test_probe_lane_copies_context_and_returns_value():
    from cli import web_server
    import contextvars

    marker: contextvars.ContextVar[str] = contextvars.ContextVar("probe_marker", default="unset")
    marker.set("selected-profile")
    lane = web_server._ProbeLane("unit-context", max_inflight=1)

    async def scenario():
        return await lane.run(lambda: marker.get(), timeout=2)

    assert asyncio.run(scenario()) == "selected-profile"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("", 5.0),
        ("abc", 5.0),
        ("0.2", 1.0),
        ("9999", 120.0),
        ("12", 12.0),
    ],
)
def test_probe_timeout_env_is_clamped(monkeypatch, raw, expected):
    from cli import web_server

    monkeypatch.setenv("SIDEKICK_TEST_PROBE_TIMEOUT", raw)
    assert web_server._probe_timeout_seconds("SIDEKICK_TEST_PROBE_TIMEOUT", 5.0) == expected
