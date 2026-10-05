"""Persisted human control bindings using the existing request-result journal.

Manager.control must fence its state CAS with control_epoch. Its durable result
uses the deterministic client ID below. An unacknowledged execution claim is
reported unknown, never blindly dispatched again across a crash gap.
"""
from __future__ import annotations

import inspect
import uuid
from typing import Annotated, Any

from pydantic import Field

from .assistant_controls import ControlResolution, choose_control
from .contracts import Contract, Id, RunView, Scope
from .scope import ScopeError
from .store import RevisionConflict, StoreError


class AssistantControlChoice(Contract):
    human_turn_id: Id
    source_message_id: Id
    run_id: Id
    expected_revision: Annotated[int, Field(ge=1)]
    control_epoch: Annotated[int, Field(ge=0)]
    request_digest: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
    client_request_id: Id


def _origin_request(turn_id: str, source_id: str) -> dict:
    return {"humanTurnId": turn_id, "sourceMessageId": source_id}


def _origin(store, scope, turn_id, source_id):
    request = _origin_request(turn_id, source_id)
    value = store.get_request_result(scope, "assistant_control_origin", turn_id, request)
    if value is None:
        raise ScopeError("No original human control request in this Space")
    state = store.get_assistant(scope)
    source = next((m for m in state.messages if m.get("id") == source_id and m.get("role") == "user"
                   and m.get("turnId") == turn_id), None) if state else None
    if source is None or source.get("content") != value["resolution"]["originalText"]:
        raise ScopeError("Original human control message no longer exists")
    return value


def persist_control_origin(store, resolution: ControlResolution, *, source_message_id: str,
                           response_message_id: str, authenticated_profile_name: str):
    """Call in the same short transaction that saves the actual human message."""
    if resolution.kind == "conversation":
        return
    value = {"resolution": resolution.model_dump(mode="json", by_alias=True),
             "sourceMessageId": source_message_id, "responseMessageId": response_message_id,
             "authenticatedProfileName": authenticated_profile_name, "actorRef": "user:desktop",
             "permissionState": store.get_permission_state(resolution.scope)}
    store.record_request_result(resolution.scope, "assistant_control_origin", resolution.human_turn_id,
                                _origin_request(resolution.human_turn_id, source_message_id), value)


def control_message(kind: str, status: str | None = None) -> str:
    if kind == "clarification":
        return "Welchen Auftrag meinst du? Wähle einen der tatsächlichen Läufe. / Which task do you mean? Choose an actual run."
    if kind == "unavailable" or status == "rejected":
        return "Der Auftrag oder seine Berechtigungen haben sich geändert. Bitte prüfe den aktuellen Arbeitsstand. / The task or its permissions changed. Please check current activity."
    if status == "unsupported_manager":
        return "Die sichere Laufsteuerung ist noch nicht verfügbar. Kein Befehl wurde ausgeführt. / Safe run control is not available yet. No command was executed."
    if status == "unknown":
        return "Die Ausführung konnte nicht bestätigt werden. Der Befehl wird nicht erneut gesendet. Bitte prüfe den Arbeitsstand. / Execution could not be confirmed. The command will not be resent. Please check activity."
    return "Steuerbefehl bestätigt. / Control command acknowledged."


def _update_response(store, scope, origin, resolution, outcome):
    current = store.get_assistant(scope)
    if current is None:
        return
    response_id = origin["responseMessageId"]
    if not any(m.get("id") == response_id for m in current.messages):
        return
    view = resolution.model_dump(mode="json", by_alias=True)
    view["sourceMessageId"] = origin["sourceMessageId"]
    messages = tuple({**m, "pending": False, "controlResolution": view,
                      "controlStatus": outcome["status"], "controlResults": outcome.get("results", []),
                      "content": control_message(resolution.kind, outcome["status"])}
                     if m.get("id") == response_id else m for m in current.messages)
    store.update_assistant(scope, current.revision, lambda old: old.model_copy(update={"messages": messages}),
                           event_kind="assistant_control")


def _manager_request(candidate, command, scope, permission_state):
    return {"runId": candidate.run_id, "command": command,
            "expectedRevision": candidate.expected_revision, "answer": None,
            "questionIdentity": None, "controlEpoch": candidate.control_epoch, "actorRef": "user:desktop",
            "expectedScope": scope.model_dump(mode="json", by_alias=True),
            "expectedPermissionRevision": permission_state["revision"],
            "expectedPermissionEpoch": permission_state["controlEpoch"]}


def _manager_id(scope, turn_id, candidate, command):
    return uuid.uuid5(uuid.NAMESPACE_URL, f"lastbrowser:assistant-control:{scope.key}:{turn_id}:{candidate.run_id}:{command}").hex


def execute_control(store, resolver, manager, scope: Scope, *, human_turn_id: str,
                    source_message_id: str, selected: ControlResolution | None = None, cancel_event=None) -> dict:
    """No SQLite transaction spans manager I/O; every run has a durable claim."""
    origin = _origin(store, scope, human_turn_id, source_message_id)
    resolver.resolve(scope, authenticated_profile_name=origin["authenticatedProfileName"])
    original = ControlResolution.model_validate(origin["resolution"])
    resolution = selected or original
    if selected is not None and (selected.scope != original.scope or selected.human_turn_id != original.human_turn_id
        or selected.original_text != original.original_text or selected.command != original.command
        or any(candidate not in original.candidates for candidate in selected.candidates)):
        raise ScopeError("Control selection changed its original human binding")
    identity = _origin_request(human_turn_id, source_message_id)
    with store.transaction():
        selection = store.get_request_result(scope, "assistant_control_selection", human_turn_id, identity)
        if selection is not None:
            saved = ControlResolution.model_validate(selection)
            if selected is not None and selected != saved:
                raise RevisionConflict("Another control target is already bound to this human turn")
            resolution = saved
        elif resolution.kind == "proposal":
            store.record_request_result(scope, "assistant_control_selection", human_turn_id, identity, resolution)
        else:
            outcome = {"status": "choose_target" if resolution.kind == "clarification" else "rejected", "results": []}
            _update_response(store, scope, origin, resolution, outcome)
            return outcome
    outcome_request = {**identity, "resolution": resolution.model_dump(mode="json", by_alias=True)}
    previous = store.get_request_result(scope, "assistant_control_result", human_turn_id, outcome_request)
    if previous is not None:
        with store.transaction():
            _update_response(store, scope, origin, resolution, previous)
        return previous
    results, statuses = [], []
    for candidate in resolution.candidates:
        request = _manager_request(candidate, resolution.command, scope, origin["permissionState"])
        client_id = _manager_id(scope, human_turn_id, candidate, resolution.command)
        cached = store.get_request_result(scope, "manager_control", client_id, request)
        if cached is not None:
            results.append(RunView.model_validate(cached).model_dump(mode="json", by_alias=True))
            statuses.append("completed")
            continue
        with store.transaction():
            claimed = store.get_request_result(scope, "assistant_control_claim", client_id, request)
            if claimed is not None:
                statuses.append("unknown")
                continue  # Crash before/after manager CAS: never issue a second control.
            # Manager ownership lives in another integration stream. Refuse an
            # unfenced legacy implementation instead of a check-then-act race.
            required = {"expected_scope", "expected_permission_revision", "expected_permission_epoch"}
            if not required.issubset(inspect.signature(manager.control).parameters):
                statuses.append("unsupported_manager")
                continue
            current = store.get_run(candidate.run_id)
            permissions = store.get_permission_state(scope)
            if current is None or current.scope != scope or (current.state_revision, current.control_epoch, current.state) != (candidate.expected_revision, candidate.control_epoch, candidate.state) or permissions["controlEpoch"] != origin["permissionState"]["controlEpoch"] or permissions["revision"] != origin["permissionState"]["revision"]:
                statuses.append("rejected")
                continue
            store.record_request_result(scope, "assistant_control_claim", client_id, request,
                                        {"sourceMessageId": source_message_id, "humanTurnId": human_turn_id})
        try:
            if cancel_event is not None and cancel_event.is_set():
                statuses.append("rejected")
                continue
            result = manager.control(candidate.run_id, resolution.command,
                expected_revision=candidate.expected_revision, control_epoch=candidate.control_epoch,
                client_request_id=client_id, actor_ref="user:desktop", expected_scope=scope,
                expected_permission_revision=origin["permissionState"]["revision"],
                expected_permission_epoch=origin["permissionState"]["controlEpoch"])
            results.append(result.model_dump(mode="json", by_alias=True))
            statuses.append("completed")
        except (StoreError, ScopeError, ValueError):
            statuses.append("rejected")
        except Exception:
            # Transport/response failure can happen after the manager's own
            # durable ACK. Recover that ACK without sending the command again.
            accepted = store.get_request_result(scope, "manager_control", client_id, request)
            if accepted is not None:
                results.append(RunView.model_validate(accepted).model_dump(mode="json", by_alias=True))
                statuses.append("completed")
            else:
                statuses.append("unknown")
    status = "unknown" if "unknown" in statuses else "unsupported_manager" if "unsupported_manager" in statuses else "rejected" if "rejected" in statuses else "completed"
    outcome = {"status": status, "results": results}
    with store.transaction():
        # Missing manager support is an integration limitation, not spent
        # intent. No command was sent; later retry still revalidates all guards.
        if status != "unsupported_manager":
            store.record_request_result(scope, "assistant_control_result", human_turn_id, outcome_request, outcome)
        _update_response(store, scope, origin, resolution, outcome)
    return outcome


def handle_assistant_control(store, resolver, manager, scope: Scope, payload: dict[str, Any],
                             *, actor_ref: str, authenticated_profile_name: str) -> dict:
    if actor_ref != "user:desktop":
        raise ScopeError("Only the authenticated desktop human may choose a control target")
    request = AssistantControlChoice.model_validate(payload)
    resolver.resolve(scope, authenticated_profile_name=authenticated_profile_name)
    origin = _origin(store, scope, request.human_turn_id, request.source_message_id)
    if origin["authenticatedProfileName"] != authenticated_profile_name:
        raise ScopeError("Control origin belongs to another authenticated profile")
    resolution = ControlResolution.model_validate(origin["resolution"])
    if resolution.kind != "clarification" or request.request_digest != resolution.request_digest:
        raise RevisionConflict("Control choice does not match original human intent")
    candidate = next((c for c in resolution.candidates if c.run_id == request.run_id), None)
    if candidate is None or (request.expected_revision, request.control_epoch) != (candidate.expected_revision, candidate.control_epoch):
        raise RevisionConflict("Control choice does not match actual candidate")
    identity = _origin_request(request.human_turn_id, request.source_message_id)
    saved = store.get_request_result(scope, "assistant_control_selection", request.human_turn_id, identity)
    if saved is not None:
        selected = ControlResolution.model_validate(saved)
        if len(selected.candidates) != 1 or selected.candidates[0] != candidate:
            raise RevisionConflict("Another target was already chosen")
    else:
        try:
            selected = choose_control(resolution, run_id=request.run_id, scope=scope, activity=manager.activity(scope))
        except ValueError as exc:
            raise RevisionConflict("Control choice is stale") from exc
    return execute_control(store, resolver, manager, scope, human_turn_id=request.human_turn_id,
                           source_message_id=request.source_message_id, selected=selected)
