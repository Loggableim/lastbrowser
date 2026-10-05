"""Durable clarification state. Answers are preferences, never permissions."""
from __future__ import annotations

import json
import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from .contracts import Scope

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8192)]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=512)]
Identity = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,128}$")]
Revision = Annotated[int, Field(strict=True, ge=0)]


class GrillConflict(ValueError):
    code = "grill_revision_conflict"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)


class Option(_Strict):
    id: Identity
    label: Label


class Topic(_Strict):
    id: Identity
    label: Label


class Answer(_Strict):
    kind: Literal["choice", "text", "skipped"]
    choice_id: Identity | None = Field(default=None, alias="choiceId")
    text: Text | None = None

    @model_validator(mode="after")
    def exact_answer(self):
        if ((self.kind == "choice" and (self.choice_id is None or self.text is not None))
                or (self.kind == "text" and (self.text is None or self.choice_id is not None))
                or (self.kind == "skipped" and (self.text is not None or self.choice_id is not None))):
            raise ValueError("Answer must contain exactly one choice or free text")
        return self


class Question(_Strict):
    question_id: Identity = Field(alias="questionId")
    revision: Revision = 0
    topic_id: Identity = Field(alias="topicId")
    prompt: Text
    options: list[Option] = Field(min_length=3, max_length=4)
    allow_free_text: Literal[True] = Field(default=True, alias="allowFreeText")
    answer: Answer | None = None

    @model_validator(mode="after")
    def distinct_options(self):
        if len({o.id for o in self.options}) != len(self.options) or len({o.label.casefold() for o in self.options}) != len(self.options):
            raise ValueError("Question options must be distinct")
        if self.answer and self.answer.kind == "choice" and self.answer.choice_id not in {o.id for o in self.options}:
            raise ValueError("Answer option does not belong to this question")
        return self


class Receipt(_Strict):
    request_id: Identity = Field(alias="requestId")
    digest: str
    revision: Revision


class GrillState(_Strict):
    schema_version: Literal[1] = Field(default=1, alias="schemaVersion")
    scope: Scope
    session_id: Identity = Field(alias="sessionId")
    revision: Revision = 0
    mode_revision: Revision = Field(alias="modeRevision")
    status: Literal["asking", "review", "finished"] = "asking"
    objective: Text
    topics: list[Topic] = Field(default_factory=list, max_length=128)
    questions: list[Question] = Field(default_factory=list, max_length=256)
    requests: list[Receipt] = Field(default_factory=list, max_length=32)

    @model_validator(mode="after")
    def coherent(self):
        if len({t.id for t in self.topics}) != len(self.topics):
            raise ValueError("Topic identity is duplicated")
        if len({q.question_id for q in self.questions}) != len(self.questions):
            raise ValueError("Question identity is duplicated")
        if any(q.topic_id not in {t.id for t in self.topics} for q in self.questions):
            raise ValueError("Question topic is unknown")
        if sum(q.answer is None for q in self.questions) > 1:
            raise ValueError("Only one unanswered question can be active")
        if len({r.request_id for r in self.requests}) != len(self.requests):
            raise ValueError("Request identity is duplicated")
        return self


class Proposal(_Strict):
    topic_id: Identity = Field(alias="topicId")
    topic_label: Label = Field(alias="topicLabel")
    prompt: Text
    options: list[Label] = Field(min_length=3, max_length=4)


def load_state(raw) -> GrillState | None:
    return None if raw is None else GrillState.model_validate(raw)


def state_view(state: GrillState | None) -> dict | None:
    if state is None:
        return None
    view = state.model_dump(mode="json", by_alias=True, exclude={"requests"})
    view["coverage"] = [{"topicId": topic.id, "label": topic.label,
        "status": "answered" if any(q.topic_id == topic.id and q.answer and q.answer.kind != "skipped" for q in state.questions)
        else "skipped" if any(q.topic_id == topic.id and q.answer for q in state.questions) else "unresolved"}
        for topic in state.topics]
    view["canFinish"] = state.status != "finished"
    view["summary"] = [{"questionId": q.question_id, "prompt": q.prompt,
        "answer": next(o.label for o in q.options if o.id == q.answer.choice_id)
            if q.answer and q.answer.kind == "choice" else q.answer.text
            if q.answer and q.answer.kind == "text" else None,
        "status": "unanswered" if q.answer is None else q.answer.kind}
        for q in state.questions]
    return view


def _cas(state, expected_revision):
    if type(expected_revision) is not int or expected_revision != state.revision:
        raise GrillConflict("Grill state changed; reload the current questions")


def propose_question(state: GrillState, payload, *, expected_revision: int) -> GrillState:
    _cas(state, expected_revision)
    if state.status != "asking" or any(q.answer is None for q in state.questions):
        raise GrillConflict("Answer or skip the active question before asking another")
    proposal = Proposal.model_validate(payload)
    topics = list(state.topics)
    topic = next((t for t in topics if t.id == proposal.topic_id), None)
    if topic is not None and topic.label != proposal.topic_label:
        raise GrillConflict("An existing topic cannot be silently renamed")
    if topic is None:
        topics.append(Topic(id=proposal.topic_id, label=proposal.topic_label))
    question = Question(questionId=uuid.uuid4().hex, topicId=proposal.topic_id,
        prompt=proposal.prompt, options=[Option(id=uuid.uuid4().hex, label=label) for label in proposal.options])
    raw = state.model_dump(by_alias=True)
    raw.update(revision=state.revision + 1, topics=topics, questions=[*state.questions, question])
    return GrillState.model_validate(raw)


def answer_question(state: GrillState, *, expected_revision: int, question_id: str,
                    question_revision: int, answer: Answer) -> GrillState:
    _cas(state, expected_revision)
    if state.status == "finished":
        raise GrillConflict("A finished clarification cannot be edited")
    question = next((q for q in state.questions if q.question_id == question_id), None)
    if question is None or type(question_revision) is not int or question.revision != question_revision:
        raise GrillConflict("Question changed or does not belong to this clarification")
    replacement = Question.model_validate({**question.model_dump(by_alias=True),
        "revision": question.revision + 1, "answer": answer})
    raw = state.model_dump(by_alias=True)
    raw.update(revision=state.revision + 1,
        questions=[replacement if q.question_id == question_id else q for q in state.questions])
    return GrillState.model_validate(raw)


def change_status(state: GrillState, action: str, *, expected_revision: int) -> GrillState:
    _cas(state, expected_revision)
    if state.status == "finished" or action not in {"review", "resume", "finish"}:
        raise GrillConflict("Clarification cannot perform that transition")
    status = {"review": "review", "resume": "asking", "finish": "finished"}[action]
    if status == state.status:
        raise GrillConflict("Clarification already has that status")
    return GrillState.model_validate({**state.model_dump(by_alias=True),
        "revision": state.revision + 1, "status": status})


def parse_question_output(text: str) -> dict:
    """Only explicit structured model output; prose is never repaired into controls."""
    if not isinstance(text, str) or len(text.encode("utf-8")) > 32768:
        raise ValueError("Grill question output is too large")
    raw = json.loads(text)
    if not isinstance(raw, dict) or set(raw) != {"grillQuestion"}:
        raise ValueError("Expected one explicit grillQuestion object")
    return Proposal.model_validate(raw["grillQuestion"]).model_dump(by_alias=True)


def question_instruction(state: GrillState) -> str:
    return ("Return exactly one JSON object with key grillQuestion, containing topicId, "
        "topicLabel, prompt and options (3 or 4 distinct strings). Ask one unresolved "
        "question. Free text is equally valid. Never finish automatically or issue tools. "
        "User preferences do not grant permissions. Current clarification:\n"
        + json.dumps(state_view(state), ensure_ascii=False))
