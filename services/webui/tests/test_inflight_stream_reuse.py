"""Regression tests for preserving live streams across session switches."""
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
MESSAGES_JS = (REPO_ROOT / "static" / "messages.js").read_text(encoding="utf-8")
SESSIONS_JS = (REPO_ROOT / "static" / "sessions.js").read_text(encoding="utf-8")


def _function_body(src: str, name: str) -> str:
    marker = f"function {name}("
    start = src.find(marker)
    assert start != -1, f"{name}() not found"
    brace = src.find("){", start)
    assert brace != -1, f"{name}() body not found"
    brace += 1
    depth = 1
    i = brace + 1
    while i < len(src) and depth:
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
        i += 1
    assert depth == 0, f"{name}() body did not close"
    return src[brace + 1 : i - 1]


def test_attach_live_stream_reuses_existing_same_stream_transport():
    """Returning to a running session must not tear down its same SSE stream.

    The server-side stream queue is not a replay log. If a sidebar switch back
    to the running session closes and reopens the same EventSource, there is a
    narrow window where stream events can be consumed by the old transport but
    no longer represented in the pane/cache. The same session/stream pair should
    therefore reuse the existing transport.
    """
    body = _function_body(MESSAGES_JS, "attachLiveStream")
    close_pos = body.find("\n  closeLiveStream(activeSid);\n")
    reuse_pos = body.find("const existingLive=LIVE_STREAMS[activeSid]")
    assert reuse_pos != -1, "attachLiveStream() should check for an existing live stream"
    assert close_pos != -1, "attachLiveStream() should still close stale/different streams"
    assert reuse_pos < close_pos, "same-stream reuse must run before closeLiveStream(activeSid)"
    assert "existingLive.streamId===streamId" in body
    assert "existingLive.source.readyState!==EventSource.CLOSED" in body
    assert "return" in body[reuse_pos:close_pos]


def test_attach_live_stream_updates_uploads_before_same_stream_reuse():
    """Reusing transport must not skip per-session uploaded attachment state."""
    body = _function_body(MESSAGES_JS, "attachLiveStream")
    upload_pos = body.find("if(uploaded.length) INFLIGHT[activeSid].uploaded=[...uploaded]")
    reuse_pos = body.find("const existingLive=LIVE_STREAMS[activeSid]")
    close_pos = body.find("\n  closeLiveStream(activeSid);\n")
    assert upload_pos != -1
    assert reuse_pos != -1
    assert close_pos != -1
    assert upload_pos < reuse_pos < close_pos


def test_attach_live_stream_different_stream_still_reopens_transport():
    """A new stream id for the same session must not reuse the old transport."""
    body = _function_body(MESSAGES_JS, "attachLiveStream")
    reuse_pos = body.find("const existingLive=LIVE_STREAMS[activeSid]")
    close_pos = body.find("\n  closeLiveStream(activeSid);\n")
    assert reuse_pos != -1
    assert close_pos != -1
    reuse_block = body[reuse_pos:close_pos]
    assert "existingLive.streamId===streamId" in reuse_block
    assert "existingLive.streamId!==streamId" not in reuse_block
    assert "return" in reuse_block
    assert reuse_pos < close_pos


def test_attach_live_stream_sets_active_state_before_reconnect_checks():
    """Reconnecting a live session must flip the UI into active state immediately.

    The chat pane can only show the live assistant row if the session is marked
    busy and owns the stream id before any transport reuse/reattach branching.
    Otherwise a reload can restore the session snapshot without surfacing the
    still-running agent actions until a later event arrives.
    """
    body = _function_body(MESSAGES_JS, "attachLiveStream")
    stream_id_pos = body.find("S.activeStreamId = streamId;")
    busy_pos = body.find("S.busy = true;")
    reuse_pos = body.find("const existingLive=LIVE_STREAMS[activeSid]")
    assert stream_id_pos >= 0, "attachLiveStream() must assign S.activeStreamId immediately"
    assert busy_pos >= 0, "attachLiveStream() must mark the UI busy immediately"
    assert reuse_pos >= 0, "attachLiveStream() must still reuse same-stream transports"
    assert stream_id_pos < reuse_pos, "active stream id must be restored before reuse checks"
    assert busy_pos < reuse_pos, "busy state must be restored before reuse checks"


def test_attach_live_stream_shows_thinking_indicator_on_reconnect():
    """A reattached stream must immediately show a live thinking indicator.

    If the reconnect path only restores the transport but never recreates the
    thinking/live card until the first token arrives, the user sees a spinner
    with no visible agent activity during slow reconnects.
    """
    body = _function_body(MESSAGES_JS, "attachLiveStream")
    reconnect_pos = body.find("const reconnecting=!!options.reconnecting;")
    thinking_pos = body.find("appendThinking();")
    open_pos = body.find("const es=new EventSource(")
    assert reconnect_pos >= 0, "attachLiveStream() must inspect reconnecting state"
    assert thinking_pos >= 0, "attachLiveStream() must render a live thinking indicator"
    assert open_pos >= 0, "attachLiveStream() must open the SSE transport"
    assert reconnect_pos < thinking_pos < open_pos, (
        "thinking indicator must be restored immediately on reconnect, before opening SSE"
    )


def test_load_session_reattach_path_uses_attach_live_stream_for_running_sessions():
    """The session switch-back path should still route through attachLiveStream()."""
    body = _function_body(SESSIONS_JS, "loadSession")
    active_pos = body.find("const activeStreamId=S.session.active_stream_id||null")
    reattach_pos = body.find("attachLiveStream(sid, activeStreamId")
    assert active_pos != -1
    assert reattach_pos != -1
    assert active_pos < reattach_pos
    assert "{reconnecting:true}" in body[reattach_pos : reattach_pos + 200]
