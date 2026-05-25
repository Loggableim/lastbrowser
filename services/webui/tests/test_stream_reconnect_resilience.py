from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
MESSAGES = (REPO / "static" / "messages.js").read_text(encoding="utf-8")


def _attach_live_stream_body() -> str:
    marker = "function attachLiveStream"
    start = MESSAGES.find(marker)
    assert start >= 0
    end = MESSAGES.find("\nfunction transcript", start)
    assert end > start
    return MESSAGES[start:end]


def test_stream_error_keeps_retrying_while_server_stream_is_active():
    body = _attach_live_stream_body()
    assert "function _scheduleStreamReconnect" in body
    assert "_STREAM_RECONNECT_MAX_ATTEMPTS" in body
    assert "_reconnectAttempted" not in body
    assert "if(st&&st.active)" in body
    assert "_handleStreamError()" in body
    assert body.find("if(st&&st.active)") < body.find("_handleStreamError()")


def test_chat_start_conflict_reattaches_to_server_active_stream():
    src = MESSAGES
    catch_start = src.find("const conflictActiveStream=/session already has an active stream")
    assert catch_start >= 0
    catch_end = src.find("showToast('Current session is still running. Queued your message.'", catch_start)
    assert catch_end > catch_start
    catch_body = src[catch_start:catch_end]
    assert "active_stream_id" in catch_body
    assert "attachLiveStream(activeSid, conflictStreamId" in catch_body
    assert "S.activeStreamId=conflictStreamId" in catch_body


def test_heartbeat_event_surfaces_long_quiet_runs():
    body = _attach_live_stream_body()
    assert "source.addEventListener('heartbeat'" in body
    assert "age_seconds" in body
    assert "Agent still" in body
