"""Safe public error mapping for known native Quickchat stop-gate failures."""
from types import SimpleNamespace

import pytest

from runtime.independent.contracts import Scope
from runtime.independent.worker_host import WorkerError
from web.api import native_chats, quickchat


def _scope():
    return Scope.model_validate({
        "backendProfileId": "11111111-1111-4111-8111-111111111111",
        "spaceId": "22222222-2222-4222-8222-222222222222",
        "browserProfileId": "33333333-3333-4333-8333-333333333333",
    })


def _bind_active_worker(monkeypatch, scope, error):
    context = SimpleNamespace(session_id="quickchat-session", stream_id="a" * 32,
                              profile_name="default", scope=scope)
    monkeypatch.setattr(native_chats, "get_native_stream_context", lambda _stream_id: context)
    monkeypatch.setattr(native_chats, "native_chat_exit_confirmed", lambda _context: False)

    def stop(*_args, **_kwargs):
        raise error

    monkeypatch.setattr(native_chats, "control_native_chat", stop)


def test_known_native_io_stop_gate_code_maps_to_safe_quickchat_error(monkeypatch):
    scope = _scope()
    _bind_active_worker(monkeypatch, scope, WorkerError("native_chat_file_exit_not_confirmed"))

    with pytest.raises(quickchat.QuickChatError) as caught:
        quickchat._stop_and_wait_for_quickchat_worker(
            SimpleNamespace(session_id="quickchat-session"), "a" * 32, "default", scope)

    assert caught.value.code == "quickchat_file_exit_unconfirmed"
    assert caught.value.status == 503
    assert str(caught.value) == "Quickchat could not confirm the native I/O stop"


def test_unknown_native_worker_error_is_left_to_the_generic_route_boundary(monkeypatch):
    scope = _scope()
    _bind_active_worker(monkeypatch, scope, WorkerError("private profile path and stderr"))

    with pytest.raises(WorkerError, match="private profile path and stderr"):
        quickchat._stop_and_wait_for_quickchat_worker(
            SimpleNamespace(session_id="quickchat-session"), "a" * 32, "default", scope)
