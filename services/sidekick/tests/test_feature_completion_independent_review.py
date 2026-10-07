import threading


def test_teamwork_drops_provider_delta_arriving_after_cancel(monkeypatch):
    """A provider callback delivered after Stop must not become a visible draft."""
    from runtime import auxiliary_client
    from runtime.teamwork_orchestrator import _invoke_worker

    cancel = threading.Event()
    callback_ready = threading.Event()
    callbacks = []
    events = []

    def fake_stream_llm(*, on_content, **_kwargs):
        callbacks.append(on_content)
        callback_ready.set()
        return "provider returned after cancellation"

    monkeypatch.setattr(auxiliary_client, "stream_llm", fake_stream_llm)
    worker = {
        "id": "model-a", "model": "model-a", "call_model": "model-a", "provider": "fixture",
        "name": "Fixture", "role": "analyst", "focus": "race test",
        "worker_id": "worker-1", "worker_index": 0,
    }
    result = []
    thread = threading.Thread(target=lambda: result.append(_invoke_worker(
        worker, "synthetic prompt", "", [], allow_hot_swap=False,
        event_put=lambda event, data: events.append((event, data)),
        cancel_event=cancel,
    )))
    thread.start()
    assert callback_ready.wait(timeout=2)

    cancel.set()
    callbacks[0]("late provider delta")
    thread.join(timeout=2)

    assert not thread.is_alive()
    assert not any(event == "teamwork_worker_delta" for event, _data in events)
    assert result[0]["error"] is not None
