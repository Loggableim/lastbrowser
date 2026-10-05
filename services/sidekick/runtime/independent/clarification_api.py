"""Human answers bound to an actual run's persisted clarification checkpoint.

Call only from the authenticated native bridge. Actor identity is supplied by
that bridge, never copied from request JSON. Manager.control rechecks the
question/epoch atomically with its state transition.
"""
from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, field_validator

from .contracts import Contract, Id, RunView, Scope
from .policy import PolicyDenied
from .scope import ScopeError
from .store import RevisionConflict


class ClarificationAnswer(Contract):
    command: Literal["answer"]
    run_id: Id
    question_identity: Id
    expected_revision: Annotated[int, Field(strict=True, ge=1)]
    control_epoch: Annotated[int, Field(strict=True, ge=0)]
    client_request_id: Id
    answer: Annotated[str, Field(min_length=1, max_length=16000)]

    @field_validator("answer")
    @classmethod
    def _nonblank(cls, value: str) -> str:
        if not value.strip() or "\0" in value:
            raise ValueError("A nonempty text answer is required")
        return value


def clarification_view(store, scope: Scope, run: RunView) -> dict | None:
    """Read real question text; a login/approval wait is not a clarification."""
    if run.scope != scope:
        raise ScopeError("Run does not belong to this Space")
    if run.state != "waiting_for_user" or not run.waiting_for or run.waiting_for.kind != "clarification":
        return None
    checkpoint = store.latest_checkpoint(run.run_id)
    if not checkpoint or checkpoint["checkpointId"] != run.checkpoint_id:
        return None
    question = checkpoint["state"].get("question")
    if not isinstance(question, str) or not question.strip() or len(question) > 8000:
        return None
    return {"schemaVersion": 1, "scope": scope.model_dump(mode="json", by_alias=True),
            "runId": run.run_id, "questionIdentity": checkpoint["checkpointId"],
            "question": question, "expectedRevision": run.state_revision,
            "controlEpoch": run.control_epoch}


def handle_clarification(store, resolver, manager, scope: Scope, payload: dict,
                         *, actor_ref: str, authenticated_profile_name: str) -> RunView:
    if actor_ref != "user:desktop":
        raise PolicyDenied("clarification_human_actor_required")
    request = ClarificationAnswer.model_validate(payload)
    resolver.resolve(scope, authenticated_profile_name=authenticated_profile_name)
    run = store.get_run(request.run_id)
    if run is None or run.scope != scope:
        raise ScopeError("Run does not belong to this Space")
    # Retry lookup is scoped and compares the entire immutable submission.
    # It precedes waiting-state checks because the original answer resumed it.
    body = request.model_dump(mode="json", by_alias=True)
    cached = store.get_request_result(scope, "clarification_answer", request.client_request_id, body)
    if cached is not None:
        return RunView.model_validate(cached)
    # The manager persists its answer and retry result in one transaction.
    # Recover a retry even if the API process failed before recording its own
    # acknowledgement; never submit the answer again to a newer question.
    manager_body = {"runId": request.run_id, "command": "answer",
                    "expectedRevision": request.expected_revision, "answer": request.answer,
                    "questionIdentity": request.question_identity, "controlEpoch": request.control_epoch,
                    "actorRef": actor_ref}
    accepted = store.get_request_result(scope, "manager_control", request.client_request_id, manager_body)
    if accepted is not None:
        result = RunView.model_validate(accepted)
        store.record_request_result(scope, "clarification_answer", request.client_request_id, body, result)
        return result
    waiting = clarification_view(store, scope, run)
    if not waiting or waiting["questionIdentity"] != request.question_identity:
        raise RevisionConflict("Clarification question changed")
    if run.state_revision != request.expected_revision or run.control_epoch != request.control_epoch:
        raise RevisionConflict("Run state or control epoch changed")
    result = manager.control(request.run_id, "answer", expected_revision=request.expected_revision,
                             client_request_id=request.client_request_id, answer=request.answer,
                             question_identity=request.question_identity, control_epoch=request.control_epoch,
                             actor_ref=actor_ref)
    store.record_request_result(scope, "clarification_answer", request.client_request_id, body, result)
    return result
