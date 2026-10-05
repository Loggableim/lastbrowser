import pytest

pytest_plugins = ["test_independent_assistant"]
from test_independent_assistant import send, wait_done


def test_readonly_status_question_uses_actual_assistant_state_without_dispatch(setup):
    assistant, manager, (space_a, space_b) = setup
    assistant.model = lambda *_: pytest.fail("status must not call model")
    send(assistant, space_a, "Was läuft gerade?")
    state = wait_done(assistant, space_a)
    assert "Läufe / Runs: 0" in state.messages[-1]["content"]
    assert not manager.dispatches
    assert not assistant.snapshot(space_b)["messages"]


def test_reset_cancels_actual_inflight_reply_without_late_dispatch(setup):
    import threading
    from runtime.independent.contracts import new_id
    assistant, manager, (space_a, space_b) = setup
    started, release = threading.Event(), threading.Event()

    def model(*_):
        started.set(); release.wait(3)
        return '{"message":"late","task":{"kind":"start_agent"}}'

    assistant.model = model
    send(assistant, space_a, "Starte eine Recherche")
    assert started.wait(2)
    state = assistant.store.get_assistant(space_a)
    preview = assistant.reset(space_a, {"mode": "preview", "action": "reset_assistant", "expectedRevision": state.revision}, actor_ref="user:desktop", authenticated_profile_name="default")
    result = assistant.reset(space_a, {"mode": "apply", "action": "reset_assistant", "expectedRevision": state.revision, "previewDigest": preview.preview_digest, "clientRequestId": new_id()}, actor_ref="user:desktop", authenticated_profile_name="default")
    release.set()
    assert assistant.store.get_assistant(space_a).revision == result.revision
    assert not manager.dispatches and not assistant.snapshot(space_b)["messages"]
