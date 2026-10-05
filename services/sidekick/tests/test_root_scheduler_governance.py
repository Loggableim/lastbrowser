from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from runtime.independent.browser_gateway import GatewayError
from runtime.independent.contracts import ScheduleSpec, new_id
from runtime.independent.definitions import DefinitionService
from runtime.independent.manager import ComputeAdmission
from runtime.independent.scheduling import IndependentScheduleAdapter
from test_independent_definitions import draft_for
from test_independent_dispatch import manager_fixture
from test_independent_runs import assert_state, dispatch, eventually, fixture


def test_concurrent_scheduler_ticks_claim_one_occurrence_and_enqueue_one_run(tmp_path):
    _, _, scope, store, manager, request = manager_fixture(tmp_path)
    adapter = IndependentScheduleAdapter(lambda: (manager,))
    before = datetime.fromisoformat("2026-10-04T09:59:00+00:00")
    due = datetime.fromisoformat("2026-10-04T10:00:00+00:00")
    try:
        definition = DefinitionService(manager).save(
            scope,
            draft_for(request, schedule=ScheduleSpec(cron_expression="0 10 * * *", timezone="UTC")),
            client_request_id=new_id(),
            expected_revision=None,
        )
        adapter.project_pending(manager, before)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: adapter.tick(due), range(2)))

        assert sum(results) == 1
        runs = store.list_runs()
        assert len(runs) == 1
        rows = store._conn.execute(
            "SELECT planned_utc, outcome, run_id FROM ia_schedule_occurrences WHERE definition_id=?",
            (definition.definition_id,),
        ).fetchall()
        assert len(rows) == 1
        assert rows[0][0] == "2026-10-04T10:00:00Z"
        assert rows[0][1] == "enqueued"
        assert rows[0][2] == runs[0].run_id
        events = [event for event in store.events_after(scope, 0)
                  if event.kind == "schedule" and event.payload.get("definitionId") == definition.definition_id]
        assert len(events) == 1
    finally:
        manager.shutdown()
        store.close()


def _assert_compute_released(run_id):
    assert run_id not in ComputeAdmission._owners


def test_waiting_for_approval_releases_compute_for_another_space(tmp_path):
    home, store, manager, factory, gateway = fixture(tmp_path)
    waiting = None
    competing = None
    try:
        waiting = dispatch(home, store, manager, "approval-owner", effects=("read", "write"))
        manager.tick()
        eventually(lambda: waiting.run_id in factory.handles)
        handle = factory.handles[waiting.run_id]
        eventually(lambda: len(handle.replies) == 1)
        gateway.error = GatewayError("controlled_transport_lost", in_flight=True, retryable=True)
        handle.request("tool", scope=waiting.scope.model_dump(mode="json", by_alias=True),
                       controlEpoch=0, tool="independent_browser_click", args={"selector": "#confirm"})
        eventually(lambda: assert_state(store, waiting.run_id, "waiting_for_approval"))
        eventually(lambda: _assert_compute_released(waiting.run_id))
        competing = dispatch(home, store, manager, "independent-space")
        manager.tick()
        eventually(lambda: competing.run_id in factory.handles)
        eventually(lambda: assert_state(store, competing.run_id, "running"))
        eventually(lambda: _assert_compute_released(waiting.run_id))
        assert competing.run_id in ComputeAdmission._owners
        assert store.list_approvals(waiting.scope)
    finally:
        manager.shutdown()
        store.close()
        for run in (waiting, competing):
            if run is not None:
                ComputeAdmission.release(run.run_id)
