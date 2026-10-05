"""Scoped reset effects in real SQLite, without touching account/browser data."""
from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from runtime.independent.assistant_reset import handle_assistant_reset
from runtime.independent.contracts import InterviewAnswer, PermissionScope, ProfilePatch, ScheduleSpec, StoredInterviewAnswer, new_id, utc_now
from runtime.independent.connections import ConnectionRepository, SpaceConnectionBinding
from runtime.independent.onboarding import begin, answer, review, confirm
from runtime.independent.policy import PolicyDenied
from runtime.independent.scope import ScopeError
from runtime.independent.store import IdempotencyConflict, RevisionConflict
from test_independent_runs import fixture, dispatch


@pytest.fixture
def configured(tmp_path):
    home, store, manager, _, _ = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "reset-space")
        other = dispatch(home, store, manager, "other-space")
        interview = begin(run.scope)
        req = InterviewAnswer(question_id=interview.question_id, free_text="Private interview detail",
                              expected_revision=interview.revision, client_request_id=new_id())
        interview = answer(interview, req)
        record = interview.answers[0]
        interview = review(interview, interview.revision)
        interview, profile = confirm(interview, interview.revision)
        profile = profile.model_copy(update={"values": ProfilePatch(purpose="Research", working_style="Brief")})
        store.save_profile(profile)
        state = store.get_assistant(run.scope)
        legacy = StoredInterviewAnswer(answer_id=record.answer_id, scope=run.scope, revision=1,
                 answer=req, topic="purpose", question="Private original question", created_at=utc_now())
        state = store.update_assistant(run.scope, state.revision, lambda old: old.model_copy(update={
            "confirmed_profile_id": profile.profile_id, "setup_status": "confirmed",
            "draft": ProfilePatch(purpose="Private draft"), "interview": interview.model_dump(mode="json", by_alias=True),
            "answers": (legacy,), "current_question_id": req.question_id,
            "messages": (*old.messages,
                {"id": new_id(), "role": "assistant", "content": "Private original question", "questionId": req.question_id},
                {"id": new_id(), "role": "user", "content": "Private interview detail", "answerId": record.answer_id},
                {"id": new_id(), "role": "assistant", "content": "Private review", "reviewRevision": interview.revision}),
        }), client_request_id=new_id(), request_payload={"operation": "answer", "requestId": new_id()})
        yield store, manager, run, other, state, profile
    finally:
        manager.shutdown()
        store.close()


def call(configured, payload, **kwargs):
    store, manager, run, *_ = configured
    return handle_assistant_reset(store, manager.resolver, run.scope, payload,
           actor_ref=kwargs.pop("actor_ref", "user:desktop"),
           authenticated_profile_name=kwargs.pop("authenticated_profile_name", "default"), **kwargs)


def preview(configured, action="clear_interview_history"):
    state = configured[0].get_assistant(configured[2].scope)
    return call(configured, {"mode": "preview", "action": action, "expectedRevision": state.revision})


def apply_request(p):
    return {"mode": "apply", "action": p.action, "expectedRevision": p.expected_revision,
            "previewDigest": p.preview_digest, "clientRequestId": new_id()}


def test_preview_reads_actual_counts_and_preserved_task_without_writing(configured):
    store, _, run, _, state, profile = configured
    before = store.get_assistant(run.scope)
    p = preview(configured)
    assert p.removed_interview_messages == 3 and p.removed_conversation_messages == 0
    assert p.removed_answer_records == 1 and p.cleared_cached_states == 1
    assert p.removed_profile_fields == () and p.removed_draft_fields == ("purpose",)
    assert p.preserved_profile_fields == ("purpose", "workingStyle")
    assert p.confirmed_profile_id == profile.profile_id and p.preserved_snapshot_evidence_count == 1
    assert [d.definition_id for d in p.preserved_definitions] == [run.definition_id]
    assert [r.run_id for r in p.preserved_runs] == [run.run_id]
    assert store.get_assistant(run.scope) == before == state


@pytest.mark.parametrize("action", ["clear_interview_history", "reset_assistant"])
def test_apply_scrubs_raw_history_and_cached_states_preserves_immutable_resources(configured, action):
    store, _, run, other, _, profile = configured
    before_profile = store.get_profile_snapshot(profile.profile_id)
    before_run = store.get_run(run.run_id)
    before_context = store.get_run_context(run.run_id)
    before_defs = store.list_definitions(run.scope)
    before_rights = store.get_permission_state(run.scope)
    before_binding = store.get_binding(run.scope)
    before_other = store.get_assistant(other.scope)
    p = preview(configured, action)
    payload = apply_request(p)
    calls = []
    result = call(configured, payload, before_apply=calls.append)
    changed = store.get_assistant(run.scope)
    assert calls == [action]
    assert changed.revision == p.expected_revision + 1 and changed.interview is None and not changed.answers
    assert changed.draft == ProfilePatch() and changed.current_question_id is None
    assert changed.conversation_id == p.conversation_id
    assert not store._many("SELECT * FROM ia_interview_answers WHERE scope_key=?", (run.scope.key,))
    cached = store._many("SELECT result_json FROM ia_request_results WHERE scope_key=? AND operation='assistant_update'", (run.scope.key,))
    assert cached and all("Private interview" not in row[0] and "Private draft" not in row[0] for row in cached)
    if action == "clear_interview_history":
        assert len(changed.messages) == 1 and store.get_confirmed_profile(run.scope) == profile
    else:
        assert changed.messages == () and store.get_confirmed_profile(run.scope) is None and changed.setup_status == "legacy"
    assert store.get_profile_snapshot(profile.profile_id) == before_profile
    assert store.get_run(run.run_id) == before_run and store.get_run_context(run.run_id) == before_context
    assert store.list_definitions(run.scope) == before_defs and store.get_permission_state(run.scope) == before_rights
    assert store.get_binding(run.scope) == before_binding and store.get_assistant(other.scope) == before_other
    assert call(configured, payload, before_apply=calls.append) == result
    assert calls == [action]
    with pytest.raises(IdempotencyConflict):
        call(configured, {**payload, "action": "reset_assistant" if action == "clear_interview_history" else "clear_interview_history"})


def test_changed_assistant_or_task_invalidates_preview_before_cancel_hook(configured):
    store, _, run, _, state, _ = configured
    p = preview(configured)
    definition = store.get_definition(run.definition_id)
    store.put_definition(definition.model_copy(update={"revision": definition.revision + 1, "title": "Changed task"}), expected_revision=definition.revision)
    calls = []
    with pytest.raises(RevisionConflict):
        call(configured, apply_request(p), before_apply=calls.append)
    assert not calls and store.get_assistant(run.scope) == state
    p = preview(configured)
    store.update_assistant(run.scope, state.revision, lambda old: old.model_copy(update={"draft": ProfilePatch(purpose="New draft")}))
    with pytest.raises(RevisionConflict):
        call(configured, apply_request(p), before_apply=calls.append)
    assert not calls


def test_wrong_profile_nonhuman_and_forged_authority_rejected(configured):
    payload = {"mode": "preview", "action": "reset_assistant", "expectedRevision": configured[4].revision}
    with pytest.raises(ScopeError):
        call(configured, payload, authenticated_profile_name="different")
    with pytest.raises(PolicyDenied):
        call(configured, payload, actor_ref="model:assistant")
    with pytest.raises(ValidationError):
        call(configured, {**payload, "actorRef": "user:desktop"})
    with pytest.raises(ValidationError):
        call(configured, {"mode": "apply", "action": "reset_assistant", "expectedRevision": configured[4].revision})


def test_failed_hook_rolls_back_state_and_history(configured):
    store, _, run, _, state, _ = configured
    p = preview(configured)
    def broken(_):
        raise RuntimeError("Controlled hook failure")
    with pytest.raises(RuntimeError):
        call(configured, apply_request(p), before_apply=broken)
    assert store.get_assistant(run.scope) == state
    assert len(store._many("SELECT * FROM ia_interview_answers WHERE scope_key=?", (run.scope.key,))) == 1


def test_reset_keeps_real_connection_rights_and_native_schedule(configured):
    store, _, run, _, state, _ = configured
    connection = SpaceConnectionBinding(binding_id=new_id(), scope=run.scope, capability_id="mail.read",
        connection_id="existing-mail-account", connection_kind="connector", connection_revision=2,
        permitted_use=("read",), updated_at=utc_now())
    with store.transaction():
        ConnectionRepository(store)._write(connection)
    permissions = store.get_permission_state(run.scope)
    store.set_permission_state(run.scope, PermissionScope(browser_origins=("https://controlled.example",)),
                               expected_revision=permissions["revision"])
    definition = store.get_definition(run.definition_id)
    scheduled = definition.model_copy(update={"revision": definition.revision + 1,
        "schedule": ScheduleSpec(cron_expression="0 9 * * 1-5", timezone="Europe/Vienna"),
        "activation_conversation_id": state.conversation_id, "activation_message_id": state.messages[0]["id"]})
    store.put_definition(scheduled, expected_revision=definition.revision)
    directory = store.profile_home / "cron"
    directory.mkdir(exist_ok=True)
    jobs = directory / "jobs.json"
    job = {"id": "independent:" + scheduled.definition_id, "job_type": "independent_agent", "enabled": True,
           "next_run_at": "2026-10-05T07:00:00Z", "independent_ref": {
           "scope": run.scope.model_dump(mode="json", by_alias=True), "definitionId": scheduled.definition_id}}
    jobs.write_text(json.dumps({"jobs": [job]}), encoding="utf-8")
    before_jobs, before_rights = jobs.read_bytes(), store.get_permission_state(run.scope)
    p = preview(configured, "reset_assistant")
    assert p.preserved_connections[0].connection_id == connection.connection_id
    assert p.preserved_schedules[0].job_id == job["id"] and p.preserved_definitions[0].scheduled
    call(configured, apply_request(p))
    assert jobs.read_bytes() == before_jobs
    assert ConnectionRepository(store).list(run.scope) == (connection,)
    assert store.get_permission_state(run.scope) == before_rights
    assert store.get_definition(scheduled.definition_id) == scheduled


def test_run_bound_confirmed_snapshot_survives_reset(configured):
    store, manager, run, _, _, profile = configured
    second = dispatch(store.profile_home, store, manager, "reset-space", instruction="Keep this authorized task")
    context = store.get_run_context(second.run_id)
    assert context.assistant_profile_snapshot_ref == profile.profile_id
    assert context.assistant_profile_snapshot.values.purpose == "Research"
    p = preview(configured, "reset_assistant")
    call(configured, apply_request(p))
    assert store.get_run_context(second.run_id) == context
    assert store.get_profile_snapshot(profile.profile_id) == profile
