"""Conservative human control proposals. Never executes or selects a latest run.

Persist (scope, human_turn_id) before executing through manager CAS; use
request_digest to detect conflicting retry payloads, not as the sole dedup key.
Titles come from trusted current definitions, never from model/page text.
"""
from __future__ import annotations

import re
from typing import Literal

from .contracts import ActivitySnapshot, AgentDefinition, Contract, Scope, digest_json

Command = Literal["cancel", "pause", "resume"]


class ControlCandidate(Contract):
    run_id: str
    dispatch_id: str
    title: str
    state: str
    expected_revision: int
    control_epoch: int


class ControlResolution(Contract):
    kind: Literal["conversation", "clarification", "proposal", "unavailable"]
    scope: Scope
    human_turn_id: str
    original_text: str
    command: Command | None = None
    candidates: tuple[ControlCandidate, ...] = ()
    request_digest: str
    reason: str


def _result(kind, scope, turn, text, command=None, candidates=(), reason="unsupported"):
    # Dedup identity deliberately excludes volatile revisions: a repeated human
    # turn must not become another operation after the first changes run state.
    identity = {"scope": scope.model_dump(by_alias=True), "humanTurnId": turn,
                "originalText": text, "command": command,
                "runIds": [c.run_id for c in candidates]}
    return ControlResolution(kind=kind, scope=scope, human_turn_id=turn,
        original_text=text, command=command, candidates=tuple(candidates),
        request_digest=digest_json(identity), reason=reason)


def resolve_control(*, message: str, human_turn_id: str, scope: Scope,
                    activity: ActivitySnapshot, definitions: tuple[AgentDefinition, ...] = (),
                    source: Literal["human", "model", "page", "system"] = "human") -> ControlResolution:
    """Trusted caller supplies provenance and scope; no natural language scope inference."""
    if source != "human" or not human_turn_id.strip():
        return _result("conversation", scope, human_turn_id, message, reason="not_human")
    # Only a single explicit imperative. Questions, quotations and rich page/code
    # fragments cannot turn into control requests.
    text = message.strip()
    if any(c in text for c in '\n\r?`<>') or text.startswith(('"', "'", "“", "„", ">")):
        return _result("conversation", scope, human_turn_id, message)
    match = re.fullmatch(r"(?:bitte\s+|please\s+)?(stoppe|stopp|stop|cancel|pausiere|pause|resume|setze)\s+(.+?)(?:[.!])?", text, re.I)
    if not match:
        return _result("conversation", scope, human_turn_id, message)
    verb, target = match.groups()
    if verb.casefold() == "setze":
        if not target.casefold().endswith(" fort"):
            return _result("conversation", scope, human_turn_id, message)
        target = target[:-5]
    command: Command = "pause" if verb.casefold() in {"pause", "pausiere"} else "resume" if verb.casefold() in {"resume", "setze"} else "cancel"
    if activity.scope != scope or activity.source_state != "live":
        return _result("unavailable", scope, human_turn_id, message, command, reason="activity_not_current")
    titles = {(d.definition_id, d.revision): d.title for d in definitions if d.scope == scope}
    runs = sorted((r for r in activity.runs if r.scope == scope), key=lambda r: r.run_id)
    def candidate(run):
        return ControlCandidate(run_id=run.run_id, dispatch_id=run.dispatch_id,
            title=titles.get((run.definition_id, run.definition_revision), run.run_id),
            state=run.state, expected_revision=run.state_revision, control_epoch=run.control_epoch)
    target = target.strip()
    lower = target.casefold()
    all_runs = lower in {"alle aufträge", "alle läufe", "all runs", "all tasks"}
    deictic = lower in {"diesen auftrag", "diesen lauf", "this task", "this run"}
    def normalize_id(value):
        return value.replace("-", "").casefold()
    normalized = normalize_id(re.sub(r"^(?:run|lauf|auftrag|dispatch)(?:[- ]id)?\s+", "", target, flags=re.I))
    matches = [r for r in runs if all_runs or deictic or normalized in {normalize_id(r.run_id), normalize_id(r.dispatch_id)}
               or target.casefold() == titles.get((r.definition_id, r.definition_revision), "").casefold()]
    eligible = {"cancel": {"queued", "running", "waiting_for_user", "waiting_for_approval", "pausing", "paused"},
                "pause": {"queued", "running", "waiting_for_user", "waiting_for_approval"}, "resume": {"paused"}}[command]
    if all_runs or deictic:
        matches = [r for r in matches if r.state in eligible]
    if not matches and not (all_runs or deictic):
        return _result("conversation", scope, human_turn_id, message, reason="unrecognized_target")
    if not matches or any(r.state not in eligible for r in matches):
        return _result("unavailable", scope, human_turn_id, message, command, reason="no_eligible_target")
    candidates = tuple(candidate(r) for r in matches)
    kind = "proposal" if all_runs or len(candidates) == 1 else "clarification"
    return _result(kind, scope, human_turn_id, message, command, candidates,
                   "explicit_all_in_scope" if all_runs else "choose_target" if kind == "clarification" else "exact_target")


def choose_control(resolution: ControlResolution, *, run_id: str, scope: Scope,
                   activity: ActivitySnapshot) -> ControlResolution:
    """Revalidate an original intent's actual candidate; reject stale choice."""
    if resolution.kind != "clarification" or scope != resolution.scope or activity.scope != scope or activity.source_state != "live":
        raise ValueError("control_choice_scope_or_state")
    selected = next((c for c in resolution.candidates if c.run_id == run_id), None)
    current = next((r for r in activity.runs if r.run_id == run_id and r.scope == scope), None)
    if selected is None or current is None or (current.state_revision, current.control_epoch, current.dispatch_id, current.state) != (selected.expected_revision, selected.control_epoch, selected.dispatch_id, selected.state):
        raise ValueError("control_choice_stale")
    return _result("proposal", scope, resolution.human_turn_id, resolution.original_text,
                   resolution.command, (selected,), "chosen_target")
