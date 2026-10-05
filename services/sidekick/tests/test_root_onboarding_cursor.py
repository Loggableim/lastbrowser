"""Supplementary A38 race check; existing sequential recovery test stays canonical."""

import threading

from runtime.independent.contracts import BackendProfileRef, Scope, SpaceBinding, new_id
from runtime.independent.store import IndependentStore


def test_event_committed_during_stale_snapshot_resync_is_after_returned_watermark(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    backend_profile_id = new_id()
    scope = Scope(backend_profile_id=backend_profile_id, space_id=new_id(), browser_profile_id="default")
    store = IndependentStore(home, backend_profile_id)
    store.register_profile(BackendProfileRef(
        backend_profile_id=backend_profile_id, name="default", canonical_home=str(home),
    ))
    store.bind_space(SpaceBinding(
        scope=scope, native_slug="legacy-space", partition_key="persist:cursor-race",
    ))
    store.ensure_assistant(scope)
    writer = IndependentStore(home, backend_profile_id)
    try:
        for index in range(8):
            store.append_event(scope, "activity_changed", {"reason": "seed-" + str(index)})
        assert store.trim_events(scope, retain=2) > 0

        snapshot_entered = threading.Event()
        event_committed = threading.Event()
        append_result = []
        original_snapshot = store.activity_snapshot

        def pause_before_snapshot(current_scope):
            snapshot_entered.set()
            assert event_committed.wait(3), "concurrent event writer did not commit"
            return original_snapshot(current_scope)

        store.activity_snapshot = pause_before_snapshot

        def append_during_resync():
            assert snapshot_entered.wait(3), "stale cursor did not enter snapshot resync"
            append_result.append(writer.append_event(
                scope, "activity_changed", {"reason": "committed-during-resync"},
            ))
            event_committed.set()

        worker = threading.Thread(target=append_during_resync, daemon=True)
        worker.start()
        recovery = store.recover_events(scope, 0)
        worker.join(3)

        assert not worker.is_alive()
        assert recovery["resyncRequired"] and recovery["events"] == ()
        snapshot_watermark = recovery["snapshot"].watermark
        assert recovery["watermark"] == snapshot_watermark
        assert len(append_result) == 1 and append_result[0].seq == snapshot_watermark + 1
        assert store.events_after(scope, snapshot_watermark) == (append_result[0],)
    finally:
        writer.close()
        store.close()
