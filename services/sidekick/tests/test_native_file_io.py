"""Actual bounded IO executor, durable no-replay receipts and Stop ordering."""
import json
from pathlib import Path
import threading
import time

import pytest

from runtime.chat_modes import ChatExecutionPolicy
from runtime.independent.contracts import new_id
from runtime.independent.native_file_io import recover_native_file_leases
from runtime.independent.policy import PolicyDenied
from test_native_auto_auxiliary import AuxiliaryServer
from test_native_sdk_broker import setup_fixed


def command(*, tool="write_file", args=None, identity=None, mode="action"):
    return {"operationId": identity or new_id(), "toolName": tool,
        "arguments": args if args is not None else {"path": "owned.txt", "content": "controlled own write"},
        "executionMode": mode, "executionPolicyRevision": 1}


def test_actual_parent_file_write_read_replace_is_durable_and_deduplicated(tmp_path):
    server = AuxiliaryServer()
    store = manager = broker = None
    try:
        context, store, manager, broker = setup_fixed(tmp_path, server)
        payload = command()
        result = broker(context, "file_execute", payload)
        assert result["acknowledged"] and result["processExited"]
        path = Path(context.workspace) / "owned.txt"
        assert path.read_text("utf-8") == "controlled own write"
        path.write_text("human edited after ACK", "utf-8")
        assert broker(context, "file_execute", payload) == result
        assert path.read_text("utf-8") == "human edited after ACK"
        read = broker(context, "file_execute", command(tool="read_file", args={"path": "owned.txt"}))
        assert "human edited after ACK" in read["result"]["content"]
        replaced = broker(context, "file_execute", command(tool="patch", args={"path": "owned.txt",
            "old_string": "human edited", "new_string": "controlled replacement"}))
        assert replaced["result"]["replacements"] == 1
        assert path.read_text("utf-8") == "controlled replacement after ACK"
        assert not [row for row in store.list_leases() if row.get("ownerKind") == "native_file"]
        journal = "".join(row[0] for row in store._many("SELECT result_json FROM ia_request_results WHERE operation='native_file_started'"))
        assert "controlled own write" not in journal and "fixture-a" not in journal
        assert not server.requests  # stdlib file work performs no SDK call.
    finally:
        if broker: broker.close_after_exit()
        if manager: manager.shutdown()
        if store: store.close()
        server.close()


@pytest.mark.parametrize("denial", ["stop", "revoke", "mode", "protected", "foreign"])
def test_file_fence_rechecks_actual_authority_before_any_effect(tmp_path, denial):
    server = AuxiliaryServer()
    store = manager = broker = None
    try:
        context, store, manager, broker = setup_fixed(tmp_path, server)
        payload = command()
        if denial == "stop":
            assert broker.request_stop()["acknowledged"]
        elif denial == "revoke":
            current = store.get_permission_state(context.scope)
            store.revoke_permissions(context.scope, expected_revision=current["revision"])
        elif denial == "mode": payload["executionMode"] = "plan"
        elif denial == "protected": payload["arguments"]["path"] = "space.yaml"
        elif denial == "foreign": payload["arguments"]["path"] = str(tmp_path / "foreign.txt")
        with pytest.raises((PolicyDenied, PermissionError)):
            broker(context, "file_execute", payload)
        assert not (Path(context.workspace) / "owned.txt").exists()
        assert not (tmp_path / "foreign.txt").exists()
        assert not server.requests
    finally:
        if broker: broker.close_after_exit()
        if manager: manager.shutdown()
        if store: store.close()
        server.close()


def test_unknown_write_receipt_blocks_same_request_and_new_tool_id(tmp_path):
    from runtime.independent.contracts import digest_json
    server = AuxiliaryServer()
    store = manager = broker = None
    try:
        context, store, manager, broker = setup_fixed(tmp_path, server)
        payload = command()
        request = {"sessionId": context.session_id, "streamId": context.stream_id,
            "writerGeneration": context.writer_generation, "toolName": payload["toolName"],
            "argumentsDigest": digest_json(payload["arguments"]), "executionMode": "action", "executionPolicyRevision": 1}
        store.record_request_result(context.scope, "native_file_started", payload["operationId"], request,
            {"state": "started", "effectKnown": False})
        with pytest.raises(PolicyDenied, match="unknown_effect_no_replay"):
            broker(context, "file_execute", payload)
        with pytest.raises(PolicyDenied, match="unknown_effect_no_replay"):
            broker(context, "file_execute", {**payload, "operationId": new_id()})
        assert not (Path(context.workspace) / "owned.txt").exists()
    finally:
        if broker: broker.close_after_exit()
        if manager: manager.shutdown()
        if store: store.close()
        server.close()


def test_actual_stop_waits_for_executor_exit_and_keeps_unknown_receipt(tmp_path):
    server = AuxiliaryServer()
    store = manager = broker = None
    failures = []
    thread = None
    try:
        context, store, manager, broker = setup_fixed(tmp_path, server)
        directory = Path(context.workspace) / "project"
        directory.mkdir()
        (directory / "search.txt").write_text("a" * 20000 + "!", "utf-8")
        payload = command(tool="search_files", args={"path": str(directory), "pattern": "^(a+)+$"})
        def execute():
            try: broker(context, "file_execute", payload)
            except Exception as error: failures.append(error)
        thread = threading.Thread(target=execute)
        thread.start()
        deadline = time.monotonic() + 6
        while not broker.file_fence._active and time.monotonic() < deadline:
            time.sleep(.02)
        assert broker.file_fence._active
        with broker.file_fence._lock:
            actual = tuple(broker.file_fence._active.values())[0][0]
        # Let the real child enter its bounded regex operation. No mocked
        # handler/process/ACK is used to infer cancellation success.
        time.sleep(.4)
        assert actual.poll() is None
        ack = broker.request_stop("cancel")
        assert ack["acknowledged"] and ack["processesExited"] and actual.poll() is not None
        thread.join(timeout=5)
        assert not thread.is_alive() and failures
        results = [json.loads(row[0]) for row in store._many("SELECT result_json FROM ia_request_results WHERE operation='native_file_result'")]
        assert len(results) == 1 and results[0]["state"] == "unknown" and results[0]["processExited"] is True
        assert results[0]["effectKnown"] is False and results[0]["acknowledged"] is False
        with pytest.raises(PolicyDenied, match="stopping"):
            broker(context, "file_execute", command())
        assert not [row for row in store.list_leases() if row.get("ownerKind") == "native_file"]
    finally:
        if broker: broker.request_stop()
        if thread: thread.join(timeout=5)
        if broker: broker.close_after_exit()
        if manager: manager.shutdown()
        if store: store.close()
        server.close()


def test_close_after_exit_retains_compute_and_registration_without_actual_file_ack(tmp_path, monkeypatch):
    from runtime.independent.manager import ComputeAdmission
    server = AuxiliaryServer()
    store = manager = broker = None
    original = None
    try:
        context, store, manager, broker = setup_fixed(tmp_path, server)
        decision = broker(context, "fixed_validate", {})["decision"]["decisionId"]
        claim = broker(context, "fixed_claim", {"decision": decision, "outputTokens": 10})
        assert broker(context, "compute_acquire", {"claimId": claim["claimId"]})["acquired"]
        original = broker.file_fence.request_stop
        monkeypatch.setattr(broker.file_fence, "request_stop", lambda *_: {"acknowledged": False, "processesExited": False})
        with pytest.raises(PolicyDenied, match="exit_not_confirmed"):
            broker.close_after_exit()
        assert broker._closed is False
        assert id(broker.file_fence) in manager._native_file_fences
        assert "auto-provider:" + claim["claimId"] in ComputeAdmission._owners
        assert any(row["leaseId"] == context.writer_lease_id for row in store.list_leases())
        assert not server.requests
    finally:
        if original and broker: monkeypatch.setattr(broker.file_fence, "request_stop", original)
        if broker: broker.close_after_exit()
        if manager: manager.shutdown()
        if store: store.close()
        server.close()
