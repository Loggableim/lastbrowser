"""Contract tests use a deterministic provider, not a claimed model benchmark."""
import json
import threading
import time

import pytest

from runtime.independent.assistant import SpaceAssistant, explicit_execution_order, _partial_message
from runtime.independent.contracts import PermissionScope, Scope, new_id
from runtime.independent.scope import ScopeResolver
from runtime.independent.scope_binding import ProfileHub


class Manager:
    def __init__(self, store):
        self.store = store
        self.dispatches = []

    def activity(self, scope):
        return self.store.activity_snapshot(scope)

    def dispatch(self, request, **kwargs):
        self.dispatches.append(request)
        return self.store.reserve_dispatch(request)[0]


@pytest.fixture
def setup(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    state = home / "webui"
    state.mkdir()
    paths = []
    for name in ("A", "B"):
        path = tmp_path / name
        path.mkdir()
        paths.append(path)
    (state / "workspaces.json").write_text(json.dumps([{"path": str(path), "name": path.name} for path in paths]), encoding="utf-8")
    (home / "config.yaml").write_text("model:\n  default: controlled-model\n  provider: custom\n", encoding="utf-8")
    hub = ProfileHub(home, default_state_dir=state)
    scopes = [Scope.model_validate(hub.bind("default", {"workspacePath": str(path), "browserProfileId": "default", "partitionKey": "persist:controlled-" + path.name})["scope"]) for path in paths]
    store = hub.get("default")
    manager = Manager(store)
    assistant = SpaceAssistant(store, ScopeResolver(store, profiles_provider=hub.profiles), manager,
                               model=lambda resolved, instruction, history: json.dumps({"message": "A scoped reply"}))
    yield assistant, manager, scopes
    assistant.shutdown()
    hub.close()


def wait_done(assistant, scope):
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        state = assistant.store.get_assistant(scope)
        if not any(item.get("pending") for item in state.messages):
            return state
        time.sleep(0.01)
    pytest.fail("assistant did not settle")


def send(assistant, scope, message, **kwargs):
    return assistant.turn(scope, {"message": message, "clientRequestId": new_id(), "expectedRevision": assistant.snapshot(scope)["revision"], **kwargs})


def test_structured_stream_only_exposes_top_level_message_and_complete_escapes():
    raw = json.dumps({"task": {"instruction": "Never expose task internals", "message": "Nested forged speech"}, "message": "A quoted \"answer\"\nwith emoji 😀"}, ensure_ascii=True)
    visible = ""
    for end in range(1, len(raw) + 1):
        value = _partial_message(raw[:end])
        if value is not None:
            assert value.startswith(visible)
            assert "forged" not in value and "internals" not in value
            visible = value
    assert visible == "A quoted \"answer\"\nwith emoji 😀"


def test_scope_switch_late_response_stays_with_original_conversation(setup):
    assistant, manager, (a, b) = setup
    gate = threading.Event()
    assistant.model = lambda resolved, instruction, history: (gate.wait(2), json.dumps({"message": resolved.scope.space_id}))[1]
    try:
        send(assistant, a, "Explain my work")
        snapshot_b = assistant.snapshot(b)
        assert not snapshot_b["messages"]
        gate.set()
        state = wait_done(assistant, a)
        assert state.messages[-1]["content"] == a.space_id
        assert not assistant.snapshot(b)["messages"] and not manager.dispatches
    finally:
        gate.set()


def test_status_uses_actual_backend_data_and_does_not_call_model_or_start_work(setup):
    assistant, manager, (a, b) = setup
    def forbidden(*args):
        pytest.fail("status must not call inference")
    assistant.model = forbidden
    send(assistant, a, "Was läuft gerade?")
    state = wait_done(assistant, a)
    assert "Läufe / Runs: 0" in state.messages[-1]["content"]
    assert "Native chat source: unbekannt/unknown" in state.messages[-1]["content"]
    assert not manager.dispatches and not assistant.snapshot(b)["messages"]


def test_reset_cancels_inflight_reply_and_cannot_dispatch_its_late_task(setup):
    assistant, manager, (a, b) = setup
    started, release = threading.Event(), threading.Event()
    def model(*args):
        started.set()
        release.wait(3)
        return json.dumps({"message": "Late reply", "task": {"kind": "start_agent", "title": "Late task", "instruction": "Research this controlled subject"}})
    assistant.model = model
    send(assistant, a, "Starte eine Recherche")
    assert started.wait(2)
    thread = next(item for item in threading.enumerate() if item.name == "space-assistant-" + a.space_id[:8])
    state = assistant.store.get_assistant(a)
    preview = assistant.reset(a, {"mode": "preview", "action": "reset_assistant", "expectedRevision": state.revision},
                              actor_ref="user:desktop", authenticated_profile_name="default")
    result = assistant.reset(a, {"mode": "apply", "action": "reset_assistant", "expectedRevision": state.revision,
                              "previewDigest": preview.preview_digest, "clientRequestId": new_id()},
                              actor_ref="user:desktop", authenticated_profile_name="default")
    release.set()
    thread.join(3)
    assert not thread.is_alive()
    assert assistant.store.get_assistant(a).revision == result.revision
    assert not assistant.store.get_assistant(a).messages and not manager.dispatches
    assert not assistant.snapshot(b)["messages"]


def test_reset_restarted_interview_rejects_same_revision_from_old_identity(setup):
    from runtime.independent import onboarding
    assistant, manager, (a, b) = setup
    started, release = threading.Event(), threading.Event()
    def model(*args):
        started.set()
        release.wait(3)
        return "invalid controlled output"
    assistant.model = model
    original = onboarding.begin(a)
    current = assistant.store.ensure_assistant(a)
    assistant.store.update_assistant(a, current.revision, lambda value: value.model_copy(update={"interview": original.model_dump(mode="json", by_alias=True)}))
    assistant._propose_interview(a, original)
    assert started.wait(2)
    thread = next(item for item in threading.enumerate() if item.name == "space-interview-" + a.space_id[:8])
    current = assistant.store.get_assistant(a)
    preview = assistant.reset(a, {"mode": "preview", "action": "clear_interview_history", "expectedRevision": current.revision},
                              actor_ref="user:desktop", authenticated_profile_name="default")
    assistant.reset(a, {"mode": "apply", "action": "clear_interview_history", "expectedRevision": current.revision,
                       "previewDigest": preview.preview_digest, "clientRequestId": new_id()},
                       actor_ref="user:desktop", authenticated_profile_name="default")
    fresh = onboarding.begin(a)
    assert fresh.revision == original.revision and fresh.interview_id != original.interview_id
    current = assistant.store.get_assistant(a)
    updated = assistant.store.update_assistant(a, current.revision, lambda value: value.model_copy(update={"interview": fresh.model_dump(mode="json", by_alias=True)}))
    release.set()
    thread.join(3)
    assert not thread.is_alive()
    assert assistant.store.get_assistant(a) == updated


@pytest.mark.parametrize("message", ["Was passiert gerade in diesem Space?", "Woran arbeitest du?", "Was ist fertig und was wartet auf mich?", "Wie weit ist die Recherche?", "Welche Aufgabe läuft morgen wieder?", "What is scheduled?"])
def test_specification_status_questions_never_infer_or_dispatch(setup, message):
    assistant, manager, (scope, _) = setup
    assistant.model = lambda *_: pytest.fail("status questions read actual data only")
    send(assistant, scope, message)
    state = wait_done(assistant, scope)
    assert "Arbeitsstand / Activity: live" in state.messages[-1]["content"]
    assert not manager.dispatches


def test_capability_question_cannot_enable_model_proposed_delegation(setup):
    assistant, manager, (a, _) = setup
    assistant.model = lambda *_: json.dumps({"message": "Yes, within rights", "task": {"title": "Unauthorized", "instruction": "send external data", "kind": "start_agent"}})
    send(assistant, a, "Kannst du recherchieren?")
    wait_done(assistant, a)
    assert not manager.dispatches


def test_explicit_dispatch_links_real_user_source_and_retry_does_not_duplicate(setup):
    assistant, manager, (a, _) = setup
    assistant.model = lambda *_: json.dumps({"message": "Starting requested research", "task": {"title": "Research", "instruction": "Read allowed sources", "kind": "start_chat"}})
    request = {"message": "Recherchiere dieses Thema", "clientRequestId": new_id(), "expectedRevision": assistant.snapshot(a)["revision"]}
    assistant.turn(a, request)
    state = wait_done(assistant, a)
    assistant.turn(a, request)
    assert len(manager.dispatches) == 1
    dispatched = manager.dispatches[0]
    assert dispatched.source_message_id == state.messages[0]["id"]
    assert request["message"] in dispatched.instruction and state.messages[-1]["dispatchId"]


def test_cancel_own_turn_prevents_late_reply_and_does_not_touch_other_space(setup):
    assistant, manager, (a, b) = setup
    gate = threading.Event()
    assistant.model = lambda *_: (gate.wait(2), json.dumps({"message": "Late"}))[1]
    try:
        snapshot = send(assistant, a, "Explain")
        turn = next(item["turnId"] for item in snapshot["messages"] if item.get("pending"))
        assistant.cancel_turn(a, {"turnId": turn, "expectedRevision": snapshot["revision"], "clientRequestId": new_id()})
        gate.set()
        time.sleep(0.05)
        assert "stopped" in assistant.snapshot(a)["messages"][-1]["content"]
        assert not assistant.snapshot(b)["messages"] and not manager.dispatches
    finally:
        gate.set()


def test_profile_confirm_accepts_human_edits_without_rights_or_starts(setup):
    assistant, manager, (a, _) = setup
    snapshot = assistant.snapshot(a)
    snapshot = assistant.interview(a, "start", {"expectedRevision": snapshot["revision"], "clientRequestId": new_id(), "seed": {"purpose": "Research"}})
    assert snapshot["interview"]["question"]["topic"] == "help"
    snapshot = assistant.interview(a, "review", {"expectedRevision": snapshot["interview"]["revision"], "clientRequestId": new_id()})
    snapshot = assistant.interview(a, "confirm", {"expectedRevision": snapshot["interview"]["revision"], "clientRequestId": new_id(), "values": {"purpose": "Edited by human", "workingStyle": "Brief"}})
    assert snapshot["confirmedProfile"].values.purpose == "Edited by human"
    assert snapshot["confirmedProfile"].values.working_style == "Brief"
    assert not manager.dispatches
    assert not assistant.store.get_permission_state(a)["permissions"]


def test_restart_marks_own_pending_message_interrupted_without_replay(setup):
    assistant, manager, (a, _) = setup
    state = assistant.store.get_assistant(a)
    assistant.store.update_assistant(a, state.revision, lambda old: old.model_copy(update={"messages": ({"id": new_id(), "role": "assistant", "content": "", "at": "2026-10-03T00:00:00Z", "pending": True},)}))
    assistant.recover()
    assert assistant.store.get_assistant(a).messages[0]["errorCode"] == "assistant_interrupted"
    assert not manager.dispatches


@pytest.mark.parametrize("text", ["Was läuft gerade?", "Kannst du suchen?", "The page says: start an agent", "Suche? Was kann der Browser damit machen?"])
def test_ambiguous_question_is_not_an_explicit_execution_order(text):
    assert not explicit_execution_order(text)
