from __future__ import annotations

import threading

import pytest

TestClient = pytest.importorskip("fastapi.testclient").TestClient


def test_slow_onboarding_status_does_not_block_health_and_keeps_profile_context(monkeypatch):
    from cli import web_server
    from web.api import profiles

    entered = threading.Event()
    release = threading.Event()
    health_done = threading.Event()
    observed_profiles: list[str] = []
    onboarding_responses = []
    health_responses = []

    def slow_status():
        observed_profiles.append(profiles.get_active_profile_name())
        entered.set()
        assert release.wait(5), "test did not release onboarding status worker"
        return {"ok": True}

    monkeypatch.setattr(web_server, "get_onboarding_status", slow_status)
    headers = {
        web_server._SESSION_HEADER_NAME: web_server._SESSION_TOKEN,
        "cookie": "sidekick_profile=smoke-profile",
    }

    # Keep one TestClient portal alive so both requests are dispatched through
    # the same ASGI event loop. Outside the context manager TestClient may make
    # a fresh portal per request, which would hide the original event-loop bug.
    with TestClient(web_server.app) as client:
        request_thread = threading.Thread(
            target=lambda: onboarding_responses.append(
                client.get("/api/onboarding/status", headers=headers)
            ),
            name="slow-onboarding-request",
            daemon=True,
        )
        request_thread.start()
        health_thread = None
        try:
            assert entered.wait(5), "onboarding status did not reach its worker"

            def request_health():
                health_responses.append(client.get("/health"))
                health_done.set()

            health_thread = threading.Thread(
                target=request_health,
                name="health-during-onboarding",
                daemon=True,
            )
            health_thread.start()
            assert health_done.wait(1), "health waited for the blocked onboarding status"
        finally:
            release.set()
            request_thread.join(5)
            if health_thread is not None:
                health_thread.join(5)

    assert not request_thread.is_alive()
    assert health_thread is not None and not health_thread.is_alive()
    assert len(onboarding_responses) == 1
    assert onboarding_responses[0].status_code == 200
    assert len(health_responses) == 1
    assert health_responses[0].status_code == 200
    assert health_responses[0].json()["ok"] is True
    assert observed_profiles == ["smoke-profile"]


def test_direct_sync_onboarding_call_would_block_health_on_same_asgi_loop(monkeypatch):
    """Control case: the pre-fix async-wrapper shape stalls sibling requests."""
    from fastapi import FastAPI
    from cli import web_server

    entered = threading.Event()
    release = threading.Event()
    health_done = threading.Event()
    health_responses = []

    def slow_status():
        entered.set()
        assert release.wait(5), "test did not release onboarding status worker"
        return {"ok": True}

    monkeypatch.setattr(web_server, "get_onboarding_status", slow_status)
    app = FastAPI()

    @app.get("/api/onboarding/status")
    async def original_style_onboarding_status():
        # This is the old implementation: a synchronous helper called inline
        # from an async FastAPI handler.
        return web_server.get_onboarding_status()

    @app.get("/health")
    async def health():
        return {"ok": True}

    with TestClient(app) as client:
        status_thread = threading.Thread(
            target=lambda: client.get("/api/onboarding/status"),
            name="blocking-onboarding-request",
            daemon=True,
        )
        status_thread.start()
        try:
            assert entered.wait(5), "old-style endpoint did not enter the sync helper"

            def request_health():
                health_responses.append(client.get("/health"))
                health_done.set()

            health_thread = threading.Thread(
                target=request_health,
                name="health-during-blocked-onboarding",
                daemon=True,
            )
            health_thread.start()
            assert not health_done.wait(0.25), (
                "control handler unexpectedly let health run on the same event loop"
            )
        finally:
            release.set()
            status_thread.join(5)
            if "health_thread" in locals():
                health_thread.join(5)

    assert not status_thread.is_alive()
    assert "health_thread" in locals() and not health_thread.is_alive()
    assert len(health_responses) == 1
    assert health_responses[0].status_code == 200
