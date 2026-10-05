"""Purpose-specific scoped Grill controls; no approval/FIFO authority."""
from __future__ import annotations

import hashlib
import json
from typing import Literal

from pydantic import Field, model_validator

from runtime.chat_modes import ChatExecutionPolicy, settings_view
from runtime.independent.chat_binding import capture_chat_profile, native_chat_writer
from runtime.independent.contracts import Scope
from runtime.independent.grill import (Answer, GrillConflict, GrillState, Identity,
    Proposal, Receipt, Revision, Text, Topic, _Strict, answer_question, change_status,
    load_state, propose_question, state_view)
from runtime.independent.scope import ScopeError
from .chat_modes import resolve_native_chat


class Command(_Strict):
    space_scope: Scope
    session_id: Identity
    client_request_id: Identity = Field(min_length=8, max_length=96)
    expected_revision: Revision
    action: Literal["start", "answer", "skip", "review", "resume", "finish"]
    objective: Text | None = None
    topics: list[Topic] | None = Field(default=None, max_length=128)
    question_id: Identity | None = Field(default=None, alias="questionId")
    question_revision: Revision | None = Field(default=None, alias="questionRevision")
    choice_id: Identity | None = Field(default=None, alias="choiceId")
    text: Text | None = None

    @model_validator(mode="after")
    def exact_fields(self):
        answer_fields = (self.question_id, self.question_revision, self.choice_id, self.text)
        if self.action == "start":
            if self.objective is None or any(v is not None for v in answer_fields):
                raise ValueError("Start requires an objective only")
        elif self.action in {"answer", "skip"}:
            if self.objective is not None or self.topics is not None or self.question_id is None or self.question_revision is None:
                raise ValueError("Answer requires an exact question identity")
            if self.action == "skip":
                if self.choice_id is not None or self.text is not None:
                    raise ValueError("Skip cannot submit an answer")
            elif (self.choice_id is None) == (self.text is None):
                raise ValueError("Submit one choice or free text")
        elif self.objective is not None or self.topics is not None or any(v is not None for v in answer_fields):
            raise ValueError("Status commands cannot contain question fields")
        return self


def _bound_state(session, scope, *, require_mode=True):
    mode = settings_view(getattr(session, "chat_execution_mode", None))
    state = load_state(getattr(session, "grill_state", None))
    if state is not None and (state.scope != scope or state.session_id != session.session_id):
        raise ScopeError("Grill state belongs to another chat scope")
    if require_mode and (mode["mode"] != "grill_me" or mode["lifetime"] != "chat"
            or (state is not None and state.mode_revision != mode["revision"])):
        raise GrillConflict("Structured clarification requires the current chat Grill mode")
    return state, mode


def _history(session, scope):
    raw = getattr(session, "grill_history", None)
    if raw is None:
        return []
    if not isinstance(raw, list) or len(raw) > 64:
        raise ValueError("Saved Grill history cannot be verified")
    history = [GrillState.model_validate(item) for item in raw]
    if any(item.scope != scope or item.session_id != session.session_id or item.status != "finished" for item in history):
        raise ScopeError("Grill history belongs to another completed chat")
    return history


def read_grill(session, raw_scope, *, actor: str, profile_hub=None):
    resolve_native_chat(session, raw_scope, actor=actor, profile_hub=profile_hub)
    state, _ = _bound_state(session, Scope.model_validate(raw_scope), require_mode=False)
    history = _history(session, Scope.model_validate(raw_scope))
    return {"ok": True, "grill": state_view(state), "grillHistory":[state_view(item) for item in history]}


def command_grill(session, body, *, actor: str, profile_hub=None):
    """Caller holds the existing session lock; durable writer is acquired here."""
    command = Command.model_validate(body)
    if command.session_id != session.session_id:
        raise ScopeError("Grill command belongs to another session")
    resolve_native_chat(session, command.space_scope, actor=actor, profile_hub=profile_hub)
    with native_chat_writer(session, actor=actor, owner_ref="grill:" + command.client_request_id,
                            profile_hub=profile_hub):
        capture_chat_profile(session=session, raw_scope=command.space_scope, actor=actor,
                             workspace=session.workspace, profile_hub=profile_hub)
        state, mode = _bound_state(session, command.space_scope, require_mode=False)
        history = _history(session, command.space_scope)
        if mode["mode"] != "grill_me" or mode["lifetime"] != "chat":
            raise GrillConflict("Structured clarification requires the current chat Grill mode")
        digest = hashlib.sha256(json.dumps(command.model_dump(mode="json", by_alias=True),
            sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
        for saved in [*history, *([state] if state else [])]:
            for receipt in saved.requests:
                if receipt.request_id == command.client_request_id:
                    if receipt.digest != digest:
                        raise GrillConflict("Request identity was reused for another command")
                    return {"ok": True, "replayed": True, "commandRevision": receipt.revision,
                            "historical":saved is not state, "grill": state_view(state)}
        if command.action == "start":
            expected = state.revision if state is not None else 0
            if (state is not None and state.status != "finished") or command.expected_revision != expected:
                raise GrillConflict("Clarification already exists or revision changed")
            if state is not None:
                if len(history) >= 64:
                    raise GrillConflict("Grill history storage capacity reached")
                history = [*history, state]
            updated = GrillState(scope=command.space_scope, sessionId=session.session_id,
                modeRevision=mode["revision"], revision=expected+1, objective=command.objective,
                topics=command.topics or [])
        else:
            if state is None:
                raise GrillConflict("Clarification has not started")
            if state.mode_revision != mode["revision"]:
                if command.action != "resume" or state.status == "finished" or command.expected_revision != state.revision:
                    raise GrillConflict("Explicit resume is required for the changed Grill mode")
                updated = GrillState.model_validate({**state.model_dump(by_alias=True),
                    "modeRevision":mode["revision"], "revision":state.revision+1,"status":"asking"})
            elif command.action in {"answer", "skip"}:
                answer = Answer(kind="skipped") if command.action == "skip" else (
                    Answer(kind="choice", choiceId=command.choice_id) if command.choice_id is not None
                    else Answer(kind="text", text=command.text))
                updated = answer_question(state, expected_revision=command.expected_revision,
                    question_id=command.question_id, question_revision=command.question_revision, answer=answer)
            else:
                updated = change_status(state, command.action, expected_revision=command.expected_revision)
        updated.requests = [*updated.requests[-31:], Receipt(requestId=command.client_request_id,
            digest=digest, revision=updated.revision)]
        previous = getattr(session, "grill_state", None)
        previous_history = getattr(session, "grill_history", None)
        session.grill_state = updated.model_dump(mode="json", by_alias=True)
        session.grill_history = [item.model_dump(mode="json",by_alias=True) for item in history]
        try:
            session.save(touch_updated_at=True)
        except BaseException:
            session.grill_state = previous
            session.grill_history = previous_history
            raise
        return {"ok": True, "replayed": False, "grill": state_view(updated)}


def _verify_publication_context(session, policy, context):
    from runtime.independent.native_chat_protocol import NativeChatContext, verify_native_context
    from runtime.independent.native_chat_policy import get_bound_native_context
    from runtime.independent.scope import same_path
    if not isinstance(context, NativeChatContext) or not isinstance(policy, ChatExecutionPolicy) or policy.mode != "grill_me":
        raise ScopeError("Grill questions require an accepted native Grill turn")
    verify_native_context(context)
    if (get_bound_native_context() != context or context.session_id != session.session_id
            or getattr(session, "active_stream_id", None) != context.stream_id
            or not same_path(session.workspace, context.workspace)
            or context.profile_name != (session.profile or "default")
            or Scope.model_validate(session.space_scope) != context.scope):
        raise ScopeError("Grill question belongs to another accepted chat")


def publish_grill_question(session, payload, *, policy: ChatExecutionPolicy, context,
                           expected_revision: int, _display_message_index=None):
    """Worker hook while its actual accepted writer is held; save before SSE."""
    _verify_publication_context(session, policy, context)
    state, mode = _bound_state(session, context.scope)
    if state is None or mode["revision"] != policy.revision:
        raise GrillConflict("Grill turn policy changed")
    updated = propose_question(state, Proposal.model_validate(payload), expected_revision=expected_revision)
    previous = session.grill_state
    previous_messages = getattr(session, "messages", None)
    if _display_message_index is not None:
        if (type(_display_message_index) is not int or not isinstance(previous_messages, list)
                or _display_message_index != len(previous_messages) - 1
                or previous_messages[_display_message_index].get("role") != "assistant"):
            raise ValueError("Grill display message must be the actual last assistant")
        question = updated.questions[-1]
        replacement = {**previous_messages[_display_message_index], "content": question.prompt,
            "grill_question": {"questionId":question.question_id,"revision":question.revision}}
        replacement.pop("grill_fallback", None)
        session.messages = [*previous_messages[:-1], replacement]
    session.grill_state = updated.model_dump(mode="json", by_alias=True)
    try:
        session.save(touch_updated_at=True)
    except BaseException:
        session.grill_state = previous
        if _display_message_index is not None:
            session.messages = previous_messages
        raise
    return {"schemaVersion": 1, "scope": context.scope.model_dump(mode="json", by_alias=True),
            "sessionId": context.session_id, "streamId": context.stream_id,
            "writerGeneration": context.writer_generation, "grill": state_view(updated)}


def complete_grill_output(session, *, policy: ChatExecutionPolicy, context, expected_revision: int):
    """Consume only the actual final assistant JSON; keep SDK context untouched."""
    from runtime.independent.grill import parse_question_output
    _verify_publication_context(session, policy, context)
    messages = getattr(session, "messages", None)
    last = messages[-1] if isinstance(messages, list) and messages else None
    text = last.get("content") if isinstance(last, dict) and last.get("role") == "assistant" else None
    reason = "question_state_unavailable"
    if isinstance(text, str):
        try:
            proposal = parse_question_output(text)
        except ValueError:
            reason = "invalid_structured_question"
        else:
            try:
                result = publish_grill_question(session, proposal, policy=policy, context=context,
                    expected_revision=expected_revision, _display_message_index=len(messages)-1)
            except GrillConflict:
                pass
            else:
                return "grill", result
    readable = text[:8192] if isinstance(text, str) else ""
    if isinstance(text, str):
        if reason not in {"invalid_structured_question", "question_state_unavailable"}:
            raise ValueError("Invalid Grill fallback reason")
        replacement = {**last, "content":readable, "grill_fallback":{
            "reason":reason,"streamId":context.stream_id,"writerGeneration":context.writer_generation}}
        replacement.pop("grill_question", None)
        session.messages = [*messages[:-1], replacement]
        try:
            # Recheck after parsing, immediately before durable fallback persistence.
            _verify_publication_context(session, policy, context)
            session.save(touch_updated_at=True)
        except BaseException:
            session.messages = messages
            raise
    return "grill_fallback", {"schemaVersion":1,
        "scope":context.scope.model_dump(mode="json",by_alias=True),"sessionId":context.session_id,
        "streamId":context.stream_id,"writerGeneration":context.writer_generation,
        "reason":reason,"readableText":readable}
