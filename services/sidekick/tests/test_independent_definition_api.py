import json

import pytest

from runtime.independent.contracts import new_id
from runtime.independent.definition_api import handle_definitions
from runtime.independent.policy import PolicyDenied
from runtime.independent.store import IdempotencyConflict, RevisionConflict
from test_independent_dispatch import manager_fixture


@pytest.fixture
def controls(tmp_path, monkeypatch):
    home, space, scope, store, manager, _ = manager_fixture(tmp_path)
    from runtime.independent import definition_api
    from runtime.independent.runner import provider_configuration_digest
    digest = provider_configuration_digest(home)
    monkeypatch.setattr(definition_api, "probe_catalog", lambda *_: {
        "providerConfigurationDigest": digest,
        "groups": [{"provider_id": "controlled", "configured": True,
                    "models": [{"id": "controlled-model", "supportsIndependent": True}]}]})
    payload = {"action": "save", "clientRequestId": new_id(), "expectedRevision": None,
               "userIntent": "Run this research every morning as configured below.",
               "draft": {"title": "Morning research", "instruction": "Read the controlled page",
                         "provider": {"provider": "controlled", "model": "controlled-model"},
                         "schedule": {"cronExpression": "30 9 * * *", "timezone": "Europe/Vienna"}}}
    def call(value):
        return handle_definitions(store, manager.resolver, manager, scope, value)
    yield call, payload, scope, store, manager, space
    manager.shutdown()
    store.close()


def test_actual_user_control_is_persisted_once_and_sources_are_server_owned(controls):
    call, payload, scope, store, *_ = controls
    before = store.get_assistant(scope)
    result = call(payload)
    assert call(payload) == result
    state = store.get_assistant(scope)
    assert len(state.messages) == len(before.messages) + 1
    message = state.messages[-1]
    assert message["role"] == "user" and message["content"] == payload["userIntent"]
    assert result["definition"]["activationMessageId"] == message["id"]
    assert result["definition"]["provider"]["providerConfigRef"]
    events = store.recover_events(scope, 0)
    assert any(event.kind == "assistant_control" for event in events["events"])
    with pytest.raises(IdempotencyConflict):
        call({**payload, "userIntent": "Different authorization"})


def test_forged_source_or_model_cannot_activate_definition(controls):
    call, payload, scope, store, *_ = controls
    before = store.get_assistant(scope)
    with pytest.raises(PolicyDenied):
        call({**payload, "draft": {**payload["draft"], "sourceMessageId": "forged"}})
    with pytest.raises(PolicyDenied):
        call({**payload, "draft": {**payload["draft"], "provider": {"provider": "foreign", "model": "controlled-model"}}})
    assert store.get_assistant(scope) == before and not store.list_definitions()


def test_conflicting_save_adds_no_phantom_user_message(controls):
    call, payload, scope, store, *_ = controls
    result = call(payload)
    before = store.get_assistant(scope)
    with pytest.raises(RevisionConflict):
        call({**payload, "clientRequestId": new_id(), "expectedRevision": 99,
              "draft": {**payload["draft"], "definitionId": result["definition"]["definitionId"]}})
    assert store.get_assistant(scope) == before


def test_start_creates_one_actual_session_and_exact_source_without_model_inference(controls):
    call, payload, scope, store, _, space = controls
    saved = call(payload)["definition"]
    start = {"action": "start", "definitionId": saved["definitionId"], "expectedRevision": 1,
             "expectedPermissionRevision": 1, "clientRequestId": new_id(),
             "userIntent": "Start this configured research now."}
    result = call(start)
    assert call(start) == result
    dispatch = result["dispatch"]
    data = json.loads((space.sessions_dir / (dispatch["targetSessionId"] + ".json")).read_text("utf-8"))
    assert data["messages"][0]["content"] == payload["draft"]["instruction"]
    assert data["independent"]["scope"] == scope.model_dump(by_alias=True)
    assert store.get_assistant(scope).messages[-1]["id"] == dispatch["sourceMessageId"]
    assert len(store.list_runs()) == 1


def test_list_has_only_actual_native_schedule_times_and_disable_cas(controls):
    call, payload, scope, store, manager, _ = controls
    saved = call(payload)["definition"]
    assert call({"action": "list"})["schedules"] == []
    from datetime import datetime, timezone
    from runtime.independent.scheduling import IndependentScheduleAdapter
    IndependentScheduleAdapter(lambda: (manager,)).project_pending(manager, datetime(2026, 10, 4, 5, tzinfo=timezone.utc))
    listed = call({"action": "list"})
    assert listed["schedules"][0]["nextRunAt"] == "2026-10-04T07:30:00Z"
    disabled = call({"action": "disable", "definitionId": saved["definitionId"], "expectedRevision": 1, "clientRequestId": new_id()})
    assert not disabled["definition"]["enabled"]
    assert store.get_permission_state(scope)["revision"] == 1
