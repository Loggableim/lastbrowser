import tools.approval as approval


def _check(command_choice, monkeypatch):
    session = "native-terminal-approval-test"
    monkeypatch.setenv("SIDEKICK_SESSION_KEY", session)
    monkeypatch.setenv("SIDEKICK_SESSION_PLATFORM", "webui")
    monkeypatch.delenv("SIDEKICK_YOLO_MODE", raising=False)
    events = []

    def notify(data):
        events.append(data)
        with approval._lock:
            entry = approval._gateway_queues[session][-1]
            entry.result = command_choice
            entry.event.set()

    approval.register_gateway_notify(session, notify)
    try:
        result = approval.check_all_command_guards(
            "printf approval-test", "local", require_explicit=True
        )
    finally:
        approval.unregister_gateway_notify(session)
    return result, events


def test_native_terminal_requires_fresh_per_command_approval_even_when_mode_off(monkeypatch):
    monkeypatch.setattr(approval, "_get_approval_mode", lambda: "off")
    result, events = _check("once", monkeypatch)

    assert result["approved"] is True
    assert result["user_approved"] is True
    assert len(events) == 1
    assert events[0]["per_command"] is True
    assert events[0]["command"] == "printf approval-test"


def test_native_terminal_rejects_chat_wide_approval(monkeypatch):
    result, events = _check("session", monkeypatch)

    assert result["approved"] is False
    assert "individually" in result["message"]
    assert events[0]["per_command"] is True


def test_generic_approve_all_does_not_resolve_per_command_terminal_prompt():
    session = "native-terminal-approval-test"
    entry = approval._ApprovalEntry({"per_command": True})
    with approval._lock:
        approval._gateway_queues[session] = [entry]
    try:
        assert approval.resolve_gateway_approval(session, "once", resolve_all=True) == 0
        assert entry.event.is_set() is False
    finally:
        with approval._lock:
            approval._gateway_queues.pop(session, None)
