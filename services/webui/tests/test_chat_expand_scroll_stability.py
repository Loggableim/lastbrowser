from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
UI_JS = (REPO / "static" / "ui.js").read_text(encoding="utf-8")
SESSIONS_JS = (REPO / "static" / "sessions.js").read_text(encoding="utf-8")


def test_activity_details_toggle_does_not_force_scroll_into_view():
    start = UI_JS.find("function _toggleActivityGroup")
    end = UI_JS.find("\nfunction _clearLiveActivityUserIntent", start)
    assert start >= 0 and end > start
    body = UI_JS[start:end]
    assert "scrollIntoView" not in body
    assert "_messageUserUnpinned=true" in body


def test_message_show_more_marks_user_unpinned_and_preserves_scroll_top():
    start = UI_JS.find("tg.addEventListener('click'")
    end = UI_JS.find("body.parentNode.insertBefore(tg", start)
    assert start >= 0 and end > start
    body = UI_JS[start:end]
    assert "e.preventDefault()" in body
    assert "e.stopPropagation()" in body
    assert "var scrollBox = document.getElementById('messages')" in body
    assert "var oldTop = scrollBox ? scrollBox.scrollTop : 0" in body
    assert "_messageUserUnpinned=true" in body
    assert "scrollBox.scrollTop = oldTop" in body


def test_initial_session_message_window_stays_small_for_fast_switching():
    assert "const _INITIAL_MSG_LIMIT = 6" in SESSIONS_JS


def test_large_message_preview_is_plain_text_and_session_scoped():
    start = UI_JS.find("const _LARGE_MESSAGE_PREVIEW_CHARS")
    end = UI_JS.find("\nfunction renderMessages", start)
    assert start >= 0 and end > start
    block = UI_JS[start:end]
    assert "let _largeMessagePreviewSid = null" in block
    assert "renderMd(preview)" not in block
    assert "large-message-preview-text" in block
    render_start = UI_JS.find("function renderMessages")
    render_end = UI_JS.find("\nfunction _toolDisplayName", render_start)
    render_block = UI_JS[render_start:render_end]
    assert "_largeMessageRawByKey.clear()" in render_block
    assert "_largeMessagePreviewSid = sid" in render_block
    assert "window._sessionFastRenderMode" in UI_JS
    assert "_beginSessionFastRender()" in SESSIONS_JS
    assert "_beginSessionFastRender();\n      syncTopbar();renderMessages();" in SESSIONS_JS


def test_session_load_has_defensive_rerender_after_reload():
    assert "Loading conversation" in SESSIONS_JS
    assert "requestAnimationFrame(() => {" in SESSIONS_JS
    assert "renderMessages({ preserveScroll: true });" in SESSIONS_JS
    assert "_scheduleLiveStreamRehydrate(sid);" in SESSIONS_JS
