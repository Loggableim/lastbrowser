import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from runtime.independent.grill import load_state, propose_question
from runtime.independent.contracts import new_id
from test_native_chat_process import fixture_context


@pytest.fixture
def root_grill(tmp_path, monkeypatch):
    from runtime.independent.scope_binding import ProfileHub
    from web.api import independent, profiles, routes
    from web.api.models import Session
    from web.api import config
    from web.api.config import set_session_dir

    context, store = fixture_context(tmp_path, "a")
    hub = ProfileHub(tmp_path / "base", default_state_dir=tmp_path / "state")
    monkeypatch.setattr(independent, "hub", lambda: hub)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "a")
    token = "bridge-" + new_id()
    monkeypatch.setattr(independent, "_BRIDGE_TOKEN", token)
    previous_session_dir = getattr(config._session_dir_local, "path", None)
    set_session_dir(context.sessions_dir)
    session = Session(session_id=context.session_id, title="Grill root", workspace=context.workspace,
                      model="controlled-model", model_provider="custom", profile="a",
                      space_scope=context.scope.model_dump(mode="json", by_alias=True),
                      chat_execution_mode={"schemaVersion": 1, "mode": "grill_me",
                                           "lifetime": "chat", "revision": 1})
    session.save()
    store.release_lease(context.writer_lease_id, owner_generation=context.writer_generation)
    yield routes, context, store, token
    set_session_dir(previous_session_dir)
    store.close()
    hub.close()


def _body(context, action, revision, request, **fields):
    return {"session_id": context.session_id,
            "space_scope": context.scope.model_dump(mode="json", by_alias=True),
            "action": action, "expected_revision": revision,
            "client_request_id": request, **fields}


def test_root_grill_http_handler_get_start_answer_review_finish_and_reload(root_grill, monkeypatch):
    routes, context, store, token = root_grill
    handler = SimpleNamespace(headers={"X-Lastbrowser-Bridge-Token": token})
    captured = {}
    monkeypatch.setattr(routes, "j", lambda _handler, payload, status=200: captured.update(payload=payload, status=status) or captured)
    get = routes._handle_grill(handler, {"session_id": context.session_id,
        "space_scope": context.scope.model_dump(mode="json", by_alias=True), "action": "get"})
    assert get["status"] == 200 and get["payload"]["grill"] is None
    start = routes._handle_grill(handler, _body(context, "start", 0, "grill-start", objective="Browser objective",
        topics=[{"id": "audience", "label": "Audience"}]))
    assert start["status"] == 200 and start["payload"]["grill"]["status"] == "asking"
    from runtime.independent.grill import Proposal
    session = routes.Session.load(context.session_id)
    state = load_state(session.grill_state)
    state = propose_question(state, Proposal.model_validate({"topicId": "audience", "topicLabel": "Audience",
        "prompt": "Who uses it?", "options": ["Individuals", "Teams", "Both"]}), expected_revision=state.revision)
    session.grill_state = state.model_dump(mode="json", by_alias=True)
    session.save()
    q = state.questions[0]
    answer = routes._handle_grill(handler, _body(context, "answer", state.revision, "grill-answer",
        questionId=q.question_id, questionRevision=q.revision, text="Teams"))
    assert answer["status"] == 200
    revision = answer["payload"]["grill"]["revision"]
    review = routes._handle_grill(handler, _body(context, "review", revision, "grill-review"))
    assert review["payload"]["grill"]["status"] == "review"
    revision = review["payload"]["grill"]["revision"]
    finish = routes._handle_grill(handler, _body(context, "finish", revision, "grill-finish"))
    assert finish["payload"]["grill"]["status"] == "finished"
    reloaded = routes.Session.load(context.session_id)
    assert reloaded.grill_state["status"] == "finished"
    assert store.list_leases() == ()


def test_root_grill_http_handler_rejects_foreign_scope_and_active_writer_before_mutation(root_grill, monkeypatch):
    routes, context, store, token = root_grill
    handler = SimpleNamespace(headers={"X-Lastbrowser-Bridge-Token": token})
    monkeypatch.setattr(routes, "j", lambda _handler, payload, status=200: {"payload": payload, "status": status})
    body = _body(context, "start", 0, "grill-start", objective="Browser objective")
    foreign = dict(body, space_scope={**body["space_scope"], "browserProfileId": "foreign"})
    denied = routes._handle_grill(handler, foreign)
    assert denied["status"] in {403, 409}
    assert routes.Session.load(context.session_id).grill_state is None
    lease = store.acquire_chat_writer(context.scope, context.session_id, "active-worker", context.writer_generation)
    try:
        blocked = routes._handle_grill(handler, body)
        assert blocked["status"] == 409
        assert routes.Session.load(context.session_id).grill_state is None
    finally:
        store.release_lease(lease["leaseId"], owner_generation=context.writer_generation)
