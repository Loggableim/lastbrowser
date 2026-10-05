"""Actual durable partial output and bound native Session projections.

Broker delta tests use an explicit controlled transport; session tests launch
the shipped worker and existing serializer. Neither is model inference.
"""
import json

import pytest

from runtime.independent.contracts import ActivitySnapshot, PermissionScope, ProviderSelection, new_id
from runtime.independent.store import ResourceBusy
from runtime.independent.runner import emit_visible_delta
from test_independent_dispatch import manager_fixture
from test_independent_runs import fixture, dispatch, eventually


def test_broker_batches_actual_deltas_and_preserves_measured_budget_failure(tmp_path):
    home, store, manager, factory, _ = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "progress")
        manager.tick()
        eventually(lambda: run.run_id in factory.handles and bool(factory.handles[run.run_id].replies))
        handle = factory.handles[run.run_id]
        for _ in range(1000):
            handle.events.put({"kind": "delta", "runId": run.run_id, "delta": "x"})
        handle.request("usage", measuredTokens=100000)
        eventually(lambda: store.get_run(run.run_id).state == "failed")
        eventually(lambda: run.run_id not in manager._workers)
        progress = store.get_run_progress(run.run_id)
        assert progress.text == "x" * 1000
        assert progress.run_state == "failed"
        assert progress.counters.provider_requests == 1
        assert progress.counters.measured_tokens == progress.budget.max_measured_tokens == 100000
        assert store.get_run(run.run_id).reason_code == "measured_token_budget_exhausted"
        events = [event for event in store.events_after(run.scope, 0) if event.kind == "run_progress"]
        assert 2 <= len(events) <= 5
        assert all(len(event.payload["textPreview"]) <= 512 and "text" not in event.payload for event in events)
        wire = store.activity_snapshot(run.scope).model_dump(mode="json", by_alias=True)
        assert ActivitySnapshot.model_validate(wire).run_progress == (progress,)
        assert store._one("SELECT COUNT(*) FROM ia_outbox WHERE kind='run_progress'")[0] == 1
    finally:
        manager.shutdown()
        store.close()


def test_partial_storage_is_bounded_and_keeps_actual_utf8_text(tmp_path):
    home, store, manager, _, _ = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "bounded")
        store.transition_run(run.run_id, "running")
        manager._accept_run_delta(run.run_id, "\U0001f680" * 70000)
        manager._flush_run_progress(run.run_id, force=True, project=False)
        progress = store.get_run_progress(run.run_id)
        assert progress.text == "\U0001f680" * 64000 and progress.text_truncated
        assert len(progress.text.encode("utf-8")) == 256000
        assert progress.counters.measured_tokens is None  # Output length is not measured provider usage.
        assert len(store.events_after(run.scope, 0)[-1].payload["textPreview"]) == 512
    finally:
        manager.shutdown()
        store.close()


def test_runner_marks_large_sdk_chunks_and_never_stringifies_internal_objects():
    from types import SimpleNamespace
    emitted, run_id = [], new_id()
    channel = SimpleNamespace(emit=emitted.append)
    emit_visible_delta(channel, run_id, {"reasoning": "private internal object"})
    emit_visible_delta(channel, run_id, None)
    assert emitted == []
    emit_visible_delta(channel, run_id, "actual" * 15000)
    assert emitted == [{"kind": "delta", "runId": run_id, "delta": ("actual" * 15000)[:64000], "truncated": True}]


@pytest.mark.parametrize("terminal", ["completed", "failed"])
def test_actual_session_partial_replaces_one_message_and_terminal_is_exactly_once(tmp_path, terminal):
    _, space, _, store, manager, request = manager_fixture(tmp_path)
    try:
        result = manager.dispatch(request, provider=ProviderSelection(provider_config_ref="controlled", model="controlled"), permissions=PermissionScope())
        run = store.transition_run(result.run_id, "running")
        context = store.get_run_context(run.run_id)
        path = space.sessions_dir / (run.target_session_id + ".json")
        raw = json.loads(path.read_text("utf-8"))
        raw["title"] = "Title chosen by the user"
        raw["messages"].append({"role": "user", "content": "Preserve this context"})
        path.write_text(json.dumps(raw), "utf-8")
        for text in ("Actual partial", "Actual partial, continued"):
            progress = store.save_run_progress(run.run_id, text)
            manager._run_projection(context, {"mode": "update_session", "nativeSlug": "research", "targetSessionId": run.target_session_id,
                "deliveryKey": "progress:" + run.run_id, "progress": progress.model_dump(mode="json", by_alias=True)})
        same = manager._run_projection(context, {"mode": "update_session", "nativeSlug": "research", "targetSessionId": run.target_session_id,
            "deliveryKey": "progress:" + run.run_id, "progress": progress.model_dump(mode="json", by_alias=True)})
        assert same["delivered"] is False
        partial = json.loads(path.read_text("utf-8"))
        rows = [row for row in partial["messages"] if row.get("independentProgressId") == "progress:" + run.run_id]
        assert len(rows) == 1 and rows[0]["content"] == progress.text and rows[0]["streaming"]
        artifact = manager._write_artifact(context, "result", {"response": "Actual final report"}) if terminal == "completed" else None
        store.transition_run(run.run_id, terminal, result_ref=artifact, reason_code="measured_token_budget_exhausted" if terminal == "failed" else None)
        store.save_run_progress(run.run_id, progress.text)
        manager._deliver_outbox()
        manager._deliver_outbox()
        final = json.loads(path.read_text("utf-8"))
        assert final["title"] == raw["title"] and final["messages"][1] == raw["messages"][1]
        rows = [row for row in final["messages"] if row.get("independentProgressId") == "progress:" + run.run_id]
        assert len(rows) == (1 if terminal == "failed" else 0)
        if rows:
            assert rows[0]["content"] == progress.text and rows[0]["streaming"] is False
        assert len([row for row in final["messages"] if row.get("deliveryKey") == "result:" + run.run_id]) == 1
        assert final["independent"]["progress"]["runState"] == terminal
        assert store.list_leases() == ()
    finally:
        manager.shutdown()
        store.close()


def test_projection_obeys_same_real_ordinary_chat_writer_reservation(tmp_path):
    _, _, scope, store, manager, request = manager_fixture(tmp_path)
    try:
        result = manager.dispatch(request, provider=ProviderSelection(provider_config_ref="controlled", model="controlled"), permissions=PermissionScope())
        context = store.get_run_context(result.run_id)
        progress = store.save_run_progress(result.run_id, "Actual partial")
        payload = {"mode": "update_session", "nativeSlug": "research", "targetSessionId": result.target_session_id,
            "deliveryKey": "progress:" + result.run_id, "progress": progress.model_dump(mode="json", by_alias=True)}
        ordinary = store.acquire_chat_writer(scope, result.target_session_id, "ordinary-user-turn", manager.generation)
        with pytest.raises(ResourceBusy):
            manager._run_projection(context, payload)
        assert store.list_leases() == (ordinary,)
        store.release_lease(ordinary["leaseId"], owner_generation=manager.generation)
        own = store.acquire_lease(scope, result.run_id, "session_writer:" + result.target_session_id, context.runner_generation, "2099-01-01T00:00:00Z")
        assert manager._run_projection(context, payload)["delivered"]
        assert store.list_leases() == (own,)
        store.release_lease(own["leaseId"], owner_generation=context.runner_generation)
        assert manager._run_projection(context, payload)["delivered"] is False
        assert store.list_leases() == ()
    finally:
        manager.shutdown()
        store.close()


def test_long_stream_uses_bounded_metadata_processes_and_actual_latest_snapshot(tmp_path, monkeypatch):
    home, store, manager, factory, _ = fixture(tmp_path)
    import runtime.independent.manager as manager_module
    now, projections = [1000.0], []
    monkeypatch.setattr(manager_module.time, "monotonic", lambda: now[0])
    try:
        run = dispatch(home, store, manager, "long-progress")
        store.transition_run(run.run_id, "running")
        original = manager.worker_factory
        def recording(context):
            worker = original(context)
            start = worker.start
            def tracked(*, payload):
                if payload.get("progress") is not None:
                    projections.append(payload["progress"]["text"])
                return start(payload=payload)
            worker.start = tracked
            return worker
        manager.worker_factory = recording
        for _ in range(80):
            manager._accept_run_delta(run.run_id, "actual")
            now[0] += 5
        assert len(projections) == 64
        assert store.get_run_progress(run.run_id).text == "actual" * 80
        assert store._one("SELECT COUNT(*) FROM ia_outbox WHERE kind='run_progress'")[0] == 1
        assert store.list_leases() == ()
    finally:
        manager.shutdown()
        store.close()
