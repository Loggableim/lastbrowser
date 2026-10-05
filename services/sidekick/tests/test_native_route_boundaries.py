from types import SimpleNamespace

import pytest


def test_legacy_control_rejects_native_session_before_fifo(monkeypatch):
    from web.api import routes
    calls = []
    session = SimpleNamespace(space_scope={"backendProfileId": "p"})
    monkeypatch.setattr(routes, "get_session", lambda _sid: session)
    monkeypatch.setattr(routes, "j", lambda *args, **kwargs: calls.append((args, kwargs)))
    handler = SimpleNamespace()
    assert routes._reject_legacy_native_control(handler, "native-session") is True
    assert calls and calls[0][1]["status"] == 409


def test_legacy_control_preserves_unbound_session(monkeypatch):
    from web.api import routes
    session = SimpleNamespace(space_scope=None)
    monkeypatch.setattr(routes, "get_session", lambda _sid: session)
    assert routes._reject_legacy_native_control(SimpleNamespace(), "legacy-session") is False


@pytest.mark.parametrize("handler_name", ["_handle_approval_respond", "_handle_clarify_respond"])
def test_legacy_response_handlers_fail_before_queue_for_native(monkeypatch, handler_name):
    from web.api import routes
    calls = []
    monkeypatch.setattr(routes, "get_session", lambda _sid: SimpleNamespace(space_scope={"backendProfileId": "p"}))
    monkeypatch.setattr(routes, "j", lambda *args, **kwargs: calls.append(kwargs))
    getattr(routes, handler_name)(SimpleNamespace(), {"session_id": "native", "approval_id": "wrong", "request_id": "wrong"})
    assert calls and calls[0]["status"] == 409
