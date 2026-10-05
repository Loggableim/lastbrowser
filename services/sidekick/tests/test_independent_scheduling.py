import json
from datetime import datetime, timezone

import pytest

from runtime.independent.contracts import ScheduleSpec, new_id
from runtime.independent.definitions import DefinitionService
from runtime.independent.scheduling import IndependentScheduleAdapter, next_occurrence
from runtime.cron.jobs import read_scoped_jobs, update_scoped_independent_job
from test_independent_definitions import draft_for
from test_independent_dispatch import manager_fixture


def utc(text):
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def test_dst_gap_is_skipped_and_fold_first_occurs_once():
    schedule = ScheduleSpec(cron_expression="30 2 * * *", timezone="Europe/Vienna")
    assert next_occurrence(schedule, utc("2026-03-28T02:00:00Z")) == utc("2026-03-30T00:30:00Z")
    first = next_occurrence(schedule, utc("2026-10-24T01:00:00Z"))
    assert first == utc("2026-10-25T00:30:00Z")
    assert next_occurrence(schedule, first) == utc("2026-10-26T01:30:00Z")
    with pytest.raises(ValueError, match="five-field"):
        next_occurrence(schedule.model_copy(update={"cron_expression": "* * * * * *"}), first)


@pytest.mark.parametrize("missed,expected", [("skip", 0), ("one_catch_up", 1)])
def test_native_job_projection_missed_policy_unique_occurrence_and_enqueue_only(tmp_path, missed, expected):
    home, space, scope, store, manager, request = manager_fixture(tmp_path)
    legacy = {"id": "ordinary-job", "prompt": "Preserve existing job", "enabled": True}
    (home / "cron").mkdir()
    (home / "cron" / "jobs.json").write_text(json.dumps({"jobs": [legacy]}), "utf-8")
    adapter = IndependentScheduleAdapter(lambda: (manager,))
    now = utc("2026-10-04T10:00:00Z")
    try:
        definition = DefinitionService(manager).save(scope, draft_for(request, schedule=ScheduleSpec(cron_expression="0 10 * * *", timezone="UTC", missed_policy=missed)), client_request_id=new_id(), expected_revision=None)
        adapter.project_pending(manager, utc("2026-10-03T09:00:00Z"))
        records = read_scoped_jobs(home)
        assert records[0] == legacy
        record = records[1]
        assert record["next_run_at"] == "2026-10-03T10:00:00Z"
        manager._run_projection = lambda *_: pytest.fail("Cron callback may not spawn a worker")
        assert adapter.tick(now) == expected
        assert len(store.list_runs()) == expected
        if expected:
            run = store.list_runs()[0]
            assert run.state == "queued" and store.get_dispatch(run.dispatch_id).state == "materializing"
            assert not (space.sessions_dir / (run.target_session_id + ".json")).exists()
        # Crash-shaped retry of the old native cursor never creates a new run.
        update_scoped_independent_job(home, record, expected_revision=definition.revision)
        assert adapter.tick(now) == 0
        assert read_scoped_jobs(home)[1]["next_run_at"] == "2026-10-05T10:00:00Z"
        assert read_scoped_jobs(home)[0] == legacy
        status = store.activity_snapshot(scope).schedules[0]
        assert status["sourceStatus"] == "observed"
        assert status["nextRunAt"] == "2026-10-05T10:00:00Z"
        assert status["lastOccurrence"]["outcome"] == ("enqueued" if expected else "missed")
    finally:
        manager.shutdown()
        store.close()


def test_previous_definition_run_blocks_occurrence_even_when_waiting(tmp_path):
    home, _, scope, store, manager, request = manager_fixture(tmp_path)
    now = utc("2026-10-04T10:00:00Z")
    adapter = IndependentScheduleAdapter(lambda: (manager,))
    try:
        definition = DefinitionService(manager).save(scope, draft_for(request, schedule=ScheduleSpec(cron_expression="* * * * *", timezone="UTC")), client_request_id=new_id(), expected_revision=None)
        adapter.project_pending(manager, utc("2026-10-04T09:59:00Z"))
        assert adapter.tick(now) == 1
        run = store.list_runs()[0]
        store.transition_run(run.run_id, "waiting_for_user")
        assert adapter.tick(utc("2026-10-04T10:01:00Z")) == 0
        assert len(store.list_runs()) == 1
        events = store.events_after(scope, 0)
        assert any(event.kind == "schedule" and event.payload.get("outcome") == "previous_run_active" for event in events)
    finally:
        manager.shutdown()
        store.close()


def test_authorized_native_schedule_survives_assistant_reset_without_freeform_authority(tmp_path):
    from runtime.independent.contracts import TaskDispatchRequest
    _, _, scope, store, manager, original = manager_fixture(tmp_path)
    adapter = IndependentScheduleAdapter(lambda: (manager,))
    try:
        service = DefinitionService(manager)
        definition = service.save(scope, draft_for(original, schedule=ScheduleSpec(cron_expression="* * * * *", timezone="UTC")),
            client_request_id=new_id(), expected_revision=None)
        adapter.project_pending(manager, utc("2026-10-04T09:59:00Z"))
        assistant = store.get_assistant(scope)
        store.update_assistant(scope, assistant.revision, lambda state: state.model_copy(update={"messages": ()}))
        manager._run_projection = lambda *_: pytest.fail("Native tick remains enqueue only")
        assert adapter.tick(utc("2026-10-04T10:00:00Z")) == 1
        assert store.get_definition(definition.definition_id) == definition
        run = store.list_runs()[0]
        assert run.state == "queued" and run.definition_revision == definition.revision
        request = TaskDispatchRequest(client_request_id=new_id(), scope=scope,
            assistant_conversation_id=definition.activation_conversation_id, source_message_id=definition.activation_message_id,
            kind="start_agent", title=definition.title, instruction=definition.instruction, desired_result=definition.desired_result,
            definition_id=definition.definition_id, definition_revision=definition.revision)
        with pytest.raises(PermissionError, match="existing user message"):
            manager.dispatch(request, provider=definition.provider, permissions=definition.permission_scope)
        for changed in (request.model_copy(update={"instruction": "An unapproved new task"}),
                request.model_copy(update={"source_message_id": new_id()}), request.model_copy(update={"kind": "prepare_chat"})):
            with pytest.raises(PermissionError, match="durable definition authorization"):
                store.reserve_dispatch(changed, authorized_definition=definition)
        with pytest.raises(PermissionError, match="durable definition authorization"):
            store.reserve_dispatch(request, authorized_definition=definition.model_copy(update={"instruction": "Forged receipt"}))
        assert len(store.list_runs()) == 1
    finally:
        manager.shutdown()
        store.close()


def test_existing_native_tick_calls_scoped_enqueue_and_never_legacy_independent_agent(tmp_path, monkeypatch):
    from runtime.cron import jobs, scheduler
    home = tmp_path / "profile"
    home.mkdir()
    (home / "cron").mkdir()
    (home / "cron" / "jobs.json").write_text(json.dumps({"jobs": [{"id": "independent:controlled", "job_type": "independent_agent", "enabled": True, "next_run_at": "2020-01-01T00:00:00Z", "schedule": {"kind": "independent_agent"}}]}), "utf-8")
    monkeypatch.setattr(jobs, "JOBS_FILE", home / "cron" / "jobs.json")
    monkeypatch.setattr(jobs, "CRON_DIR", home / "cron")
    monkeypatch.setattr(jobs, "OUTPUT_DIR", home / "cron" / "output")
    monkeypatch.setattr(scheduler, "_get_lock_paths", lambda: (home / "cron", home / "cron" / ".tick.lock"))
    calls = []
    monkeypatch.setattr(scheduler, "_independent_enqueue_hook", lambda now: calls.append(now) or 1)
    actual_run_job = scheduler.run_job
    monkeypatch.setattr(scheduler, "run_job", lambda *_: pytest.fail("Independent job reached legacy AIAgent"))
    assert scheduler.tick() == 1 and len(calls) == 1
    assert calls[0].utcoffset().total_seconds() == 0
    assert actual_run_job({"id": "independent:controlled", "job_type": "independent_agent"})[3] == "independent_agent_requires_scoped_enqueue"
    with pytest.raises(ValueError, match="Space Assistant"):
        jobs.update_job("independent:controlled", {"enabled": False})
    with pytest.raises(ValueError, match="Space Assistant"):
        jobs.remove_job("independent:controlled")


def test_queued_schedule_materializes_real_session_before_any_inference(tmp_path):
    _, space, scope, store, manager, request = manager_fixture(tmp_path)
    adapter = IndependentScheduleAdapter(lambda: (manager,))
    try:
        DefinitionService(manager).save(scope, draft_for(request, schedule=ScheduleSpec(cron_expression="* * * * *", timezone="UTC")), client_request_id=new_id(), expected_revision=None)
        adapter.project_pending(manager, utc("2026-10-04T09:59:00Z"))
        assert adapter.tick(utc("2026-10-04T10:00:00Z")) == 1
        manager.tick()  # first queue-owner pass projects only, no model worker
        run = store.list_runs()[0]
        assert run.state == "queued"
        assert store.get_dispatch(run.dispatch_id).state == "started"
        raw = json.loads((space.sessions_dir / (run.target_session_id + ".json")).read_text("utf-8"))
        assert raw["independent"]["runId"] == run.run_id
        assert raw["messages"][0]["content"] == "Read the approved page"
    finally:
        manager.shutdown()
        store.close()


def test_native_schedules_use_each_fixed_profile_even_when_another_profile_is_invalid(tmp_path):
    fixtures = [manager_fixture(tmp_path / name) for name in ("a", "b")]
    adapter = IndependentScheduleAdapter(lambda: [row[4] for row in fixtures])
    try:
        for _, _, scope, store, manager, request in fixtures:
            DefinitionService(manager).save(scope, draft_for(request, schedule=ScheduleSpec(cron_expression="* * * * *", timezone="UTC")), client_request_id=new_id(), expected_revision=None)
            adapter.project_pending(manager, utc("2026-10-04T09:59:00Z"))
        first, second = fixtures
        (first[0] / "cron" / "jobs.json").write_text("{invalid native store", "utf-8")
        assert adapter.tick(utc("2026-10-04T10:00:00Z")) == 1
        assert first[3].list_runs() == ()
        run = second[3].list_runs()[0]
        assert second[3].get_run_context(run.run_id).resolved_profile_home == str(second[0])
        assert run.scope == second[2]
    finally:
        for _, _, _, store, manager, _ in fixtures:
            manager.shutdown()
            store.close()
def test_scope_retirement_disables_real_cron_once_and_waits_for_write_ack(tmp_path, monkeypatch):
    from runtime.independent.contracts import ScheduleSpec, new_id
    from runtime.independent.definitions import DefinitionService
    from test_independent_definitions import draft_for
    from test_independent_dispatch import manager_fixture
    from runtime.cron import jobs
    _, _, scope, store, manager, request = manager_fixture(tmp_path)
    adapter = IndependentScheduleAdapter(lambda: (manager,))
    try:
        definition = DefinitionService(manager).save(scope,
            draft_for(request, schedule=ScheduleSpec(cron_expression="30 9 * * *", timezone="Europe/Vienna")),
            client_request_id=new_id(), expected_revision=None)
        adapter.project_pending(manager, datetime.now(timezone.utc))
        assert jobs.read_scoped_jobs(store.profile_home)[0]["enabled"]
        update = jobs.update_scoped_independent_job
        def unavailable(*args, **kwargs):
            raise OSError("controlled native Cron write unavailable")
        monkeypatch.setattr(jobs, "update_scoped_independent_job", unavailable)
        result = manager.retire_scope(scope, expected_revision=1)
        assert not result["acknowledged"] and result["pendingDefinitions"] == [definition.definition_id]
        assert store.get_definition(definition.definition_id).revision == 2
        assert not store.get_definition(definition.definition_id).enabled
        assert store.get_definition(definition.definition_id, 1) == definition
        assert jobs.read_scoped_jobs(store.profile_home)[0]["enabled"]
        monkeypatch.setattr(jobs, "update_scoped_independent_job", update)
        retry = manager.retire_scope(scope, expected_revision=1)
        assert retry["acknowledged"] and not retry["pendingDefinitions"]
        assert not jobs.read_scoped_jobs(store.profile_home)[0]["enabled"]
        assert store.get_definition(definition.definition_id).revision == 2
        assert retry["permissionRevision"] == result["permissionRevision"]
    finally:
        manager.shutdown()
        store.close()

