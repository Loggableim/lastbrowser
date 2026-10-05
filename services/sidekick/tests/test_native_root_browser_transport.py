from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from runtime.independent.contracts import new_id
from test_native_chat_process import fixture_context


def test_native_browser_owner_contract_rejects_run_id_and_extra_fields():
    from web.api.independent import NativeBrowserOwner
    base = {"run_id": None, "owner_kind": "native_chat", "session_id": "s",
            "stream_id": "t", "writer_generation": new_id(), "writer_lease_id": new_id()}
    owner = NativeBrowserOwner.model_validate(base)
    assert owner.run_id is None
    with pytest.raises(ValidationError):
        NativeBrowserOwner.model_validate({**base, "run_id": new_id()})
    with pytest.raises(ValidationError):
        NativeBrowserOwner.model_validate({**base, "unexpected": True})


def test_native_browser_operation_fails_closed_without_registered_manager(tmp_path, monkeypatch):
    from runtime.independent.scope_binding import ProfileHub
    from web.api import independent
    context, store = fixture_context(tmp_path, "a")
    hub = ProfileHub(tmp_path / "base", default_state_dir=tmp_path / "state")
    monkeypatch.setattr(independent, "_hub", hub)
    monkeypatch.setattr(independent, "_gateway", object())
    monkeypatch.setattr(independent, "_main_generation", "main")
    monkeypatch.setattr(independent, "_GENERATION", "runner")
    monkeypatch.setattr(independent, "_last_heartbeat", 0.0)
    owner = {"run_id": None, "owner_kind": "native_chat", "session_id": context.session_id,
             "stream_id": context.stream_id, "writer_generation": context.writer_generation,
             "writer_lease_id": context.writer_lease_id}
    try:
        with pytest.raises(Exception):
            independent._browser_operation("browser.nativeValidate",
                {"owner": owner, "mainGeneration": "main", "runnerGeneration": "runner"},
                bound_scope=context.scope, actor="a")
    finally:
        hub.close(); store.close()


def test_runtime_receipt_read_is_unknown_without_cache_or_host_authority(tmp_path):
    from runtime.independent.scope_binding import ProfileHub
    from web.api.local_ai_runtime_host import ReceiptRequest, read_local_ai_runtime_receipt
    context, store = fixture_context(tmp_path, "a")
    hub = ProfileHub(tmp_path / "base", default_state_dir=tmp_path / "state")
    try:
        request = ReceiptRequest(operation="receipt", client_request_id=new_id(),
                                 purpose_digest="a" * 64)
        result = read_local_ai_runtime_receipt(hub, context.scope, "a", request)
        assert result["state"] == "unknown" and result["available"] is False
        assert "cacheRoot" not in result and "host" not in result and "compute" not in result
    finally:
        hub.close(); store.close()


def test_native_approval_command_requires_uuid_digest_and_cas_fields():
    from web.api.independent import NativeBrowserApprovalCommand
    command = NativeBrowserApprovalCommand(client_request_id=new_id(), approval_id=new_id(),
        approved=True, action_digest="a" * 64, expected_permission_revision=1,
        expected_control_epoch=0)
    assert command.expected_permission_revision == 1
    with pytest.raises(ValidationError):
        NativeBrowserApprovalCommand.model_validate({**command.model_dump(mode="json"), "action_digest": "bad"})
    with pytest.raises(ValidationError):
        NativeBrowserApprovalCommand.model_validate({**command.model_dump(mode="json"), "expected_control_epoch": -1})


def test_registered_native_fence_uses_actual_context_owner_and_cleans_registry(tmp_path):
    from runtime.chat_modes import ChatExecutionPolicy
    from runtime.independent.native_browser import NativeBrowserFence, native_browser_owner
    from test_native_chat_auto import setup_auto
    from test_native_chat_process import ControlledServer

    server = ControlledServer()
    context = store = manager = broker = fence = None
    try:
        context, store, manager, broker = setup_auto(tmp_path, server)
        fence = broker.browser_fence
        assert isinstance(fence, NativeBrowserFence)
        owner = native_browser_owner(context)
        assert fence.matches_owner(owner)
        assert fence.context is context
        assert id(fence) in manager._native_browser_fences
        assert fence.close_after_exit()["acknowledged"] is True
        assert fence.retire_after_exit() == {"acknowledged": True, "retained": False}
        assert id(fence) not in manager._native_browser_fences
    finally:
        if fence is not None:
            fence.close_after_exit()
            fence.retire_after_exit()
        if manager is not None:
            manager.shutdown()
        if store is not None:
            store.close()
        server.close()
