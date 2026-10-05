"""Real store/manager and controlled worker transport; no model quality claim."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from runtime.independent.clarification_api import ClarificationAnswer, clarification_view, handle_clarification
from runtime.independent.contracts import new_id
from runtime.independent.policy import PolicyDenied
from runtime.independent.scope import ScopeError
from runtime.independent.store import IdempotencyConflict, RevisionConflict
from test_independent_runs import fixture, dispatch, eventually, assert_state


@pytest.fixture
def waiting(tmp_path):
    home, store, manager, factory, _ = fixture(tmp_path)
    try:
        run = dispatch(home, store, manager, "clarification")
        manager.tick()
        eventually(lambda: run.run_id in factory.handles)
        worker = factory.handles[run.run_id]
        eventually(lambda: len(worker.replies) == 1)
        worker.request("clarification", question="Which report period should I use?")
        eventually(lambda: assert_state(store, run.run_id, "waiting_for_user"))
        current = store.get_run(run.run_id)
        question = clarification_view(store, run.scope, current)
        assert question and question["question"] == "Which report period should I use?"
        payload = {"command": "answer", "runId": run.run_id,
                   "questionIdentity": question["questionIdentity"],
                   "expectedRevision": question["expectedRevision"],
                   "controlEpoch": question["controlEpoch"],
                   "clientRequestId": new_id(), "answer": "October 2026"}
        yield store, manager, current, worker, payload
    finally:
        manager.shutdown()
        store.close()


def submit(waiting, *, payload=None, scope=None, actor="user:desktop", profile="default"):
    store, manager, run, _, original = waiting
    return handle_clarification(store, manager.resolver, manager, scope or run.scope,
                               original if payload is None else payload,
                               actor_ref=actor, authenticated_profile_name=profile)


def test_answer_resumes_existing_controlled_worker_once(waiting):
    store, manager, run, worker, payload = waiting
    answered = submit(waiting)
    manager.tick()
    eventually(lambda: len(worker.replies) == 2)
    assert worker.replies[-1]["value"]["answer"] == payload["answer"]
    assert manager._workers[run.run_id] is worker
    before = store.latest_checkpoint(run.run_id)
    retry = submit(waiting)
    assert retry == answered
    assert store.latest_checkpoint(run.run_id) == before
    assert len(worker.replies) == 2


def test_changed_duplicate_is_rejected(waiting):
    submit(waiting)
    with pytest.raises(IdempotencyConflict):
        submit(waiting, payload={**waiting[-1], "answer": "A different answer"})


def test_retry_recovers_manager_commit_before_api_acknowledgement(waiting):
    store, manager, run, _, payload = waiting
    accepted = manager.control(run.run_id, "answer", expected_revision=payload["expectedRevision"],
                               client_request_id=payload["clientRequestId"], answer=payload["answer"],
                               question_identity=payload["questionIdentity"], control_epoch=payload["controlEpoch"],
                               actor_ref="user:desktop")
    before = store.latest_checkpoint(run.run_id)
    assert submit(waiting) == accepted
    assert store.latest_checkpoint(run.run_id) == before


@pytest.mark.parametrize("field,value", [("questionIdentity", None), ("expectedRevision", 999), ("controlEpoch", 999)])
def test_stale_question_revision_or_epoch_does_not_resume(waiting, field, value):
    with pytest.raises(RevisionConflict):
        submit(waiting, payload={**waiting[-1], field: new_id() if value is None else value})
    assert waiting[0].get_run(waiting[2].run_id).state == "waiting_for_user"


def test_foreign_scope_and_authenticated_profile_are_rejected(waiting):
    with pytest.raises(ScopeError):
        submit(waiting, scope=waiting[2].scope.model_copy(update={"space_id": new_id()}))
    with pytest.raises(ScopeError):
        submit(waiting, profile="another-profile")


def test_model_actor_cannot_answer_and_body_cannot_forge_actor(waiting):
    with pytest.raises(PolicyDenied):
        submit(waiting, actor="model:assistant")
    with pytest.raises(ValidationError):
        submit(waiting, payload={**waiting[-1], "actorRef": "user:desktop"})


@pytest.mark.parametrize("answer", ["   ", "x" * 16001, "a\0b"])
def test_empty_overlong_or_nul_answer_rejected(waiting, answer):
    with pytest.raises(ValidationError):
        submit(waiting, payload={**waiting[-1], "answer": answer})


def test_actual_checkpoint_replacement_invalidates_old_question(waiting):
    store, _, run, _, _ = waiting
    store.save_checkpoint(run.run_id, {"question": "A different actual question"})
    with pytest.raises(RevisionConflict):
        submit(waiting)


def test_manager_rechecks_question_after_api_validation_race(waiting):
    store, manager, run, _, _ = waiting
    original = manager.control
    def changed_before_claim(*args, **kwargs):
        store.save_checkpoint(run.run_id, {"question": "New question during answer submission"})
        return original(*args, **kwargs)
    manager.control = changed_before_claim
    with pytest.raises(PolicyDenied):
        submit(waiting)
    assert store.get_run(run.run_id).state == "waiting_for_user"
    assert "answer" not in store.latest_checkpoint(run.run_id)["state"]


def test_missing_question_is_not_invented(waiting):
    store, _, run, _, _ = waiting
    store.save_checkpoint(run.run_id, {"summary": "No authoritative question"})
    assert clarification_view(store, run.scope, store.get_run(run.run_id)) is None
    with pytest.raises(RevisionConflict):
        submit(waiting)
