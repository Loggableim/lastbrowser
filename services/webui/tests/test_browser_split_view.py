from pathlib import Path
import re

from api import browser_runtime


REPO = Path(__file__).resolve().parents[1]
INDEX_HTML = (REPO / "static" / "index.html").read_text(encoding="utf-8")
STYLE_CSS = (REPO / "static" / "style.css").read_text(encoding="utf-8")
PANELS_JS = (REPO / "static" / "panels.js").read_text(encoding="utf-8")
BOOT_JS = (REPO / "static" / "boot.js").read_text(encoding="utf-8")
SESSIONS_JS = (REPO / "static" / "sessions.js").read_text(encoding="utf-8")
SPACES_JS = (REPO / "static" / "spaces.js").read_text(encoding="utf-8")
BROWSER_JS = (REPO / "static" / "browser.js").read_text(encoding="utf-8")
BROWSER_RUNTIME = (REPO / "api" / "browser_runtime.py").read_text(encoding="utf-8")
ROUTES_PY = (REPO / "api" / "routes.py").read_text(encoding="utf-8")


def _function_body(source: str, name: str) -> str:
    start = source.index(f"function {name}")
    next_match = re.search(r"\n(?:async\s+)?function\s+", source[start + 1 :])
    end = start + 1 + next_match.start() if next_match else len(source)
    return source[start:end]


def test_browser_panel_markup_and_scripts_are_wired_in():
    for needle in (
        'data-panel="browser"',
        'id="mainBrowser"',
        'id="browserStage"',
        'id="browserUrlInput"',
        "onkeydown=\"if(event.key==='Enter'){return browserSubmitUrl(event)}\"",
        'id="browserFrameImage"',
        'id="browserHitLayer"',
        'id="browserActionSummary"',
        'id="browserActionTrace"',
        'id="browserTargetBox"',
        'id="browserTargetLabel"',
        'id="btnBrowserDrawerToggle"',
        'id="browserAgentStopBtn"',
        'id="browserResearchTopic"',
        'id="browserResearchQuickAnswer"',
        'id="browserResearchQuestions"',
        'id="browserResearchContinueBtn"',
        'id="browserResearchRecentToggle"',
        'id="browserResearchBody"',
        'static/browser.js?v=__WEBUI_VERSION__',
    ):
        assert needle in INDEX_HTML


def test_browser_panel_css_visibility_and_overlay_rules_exist():
    for needle in (
        "main.main.showing-browser > #mainBrowser",
        "body.showing-browser .rightpanel",
        "body.browser-maximized header.app-titlebar",
        "body.browser-maximized .browser-drawer",
        "body.browser-maximized #mainChat > :not(.browser-drawer)",
        ".browser-stage",
        ".browser-cursor",
        ".browser-click-flash",
        ".browser-action-trace",
        ".browser-trace-item",
        ".browser-target-box",
        ".browser-status-detail",
        ".browser-empty-state.visible",
        ".browser-drawer",
        ".browser-research-panel",
        ".browser-research-intake",
        ".browser-research-quick-answer",
        ".browser-research-question-chips",
        ".browser-research-recent",
    ):
        assert needle in STYLE_CSS


def test_browser_panel_lifecycle_hooks_are_in_switch_panel():
    body = _function_body(PANELS_JS, "switchPanel")
    assert "browserResearchPanelActivated" in body
    assert "browserResearchPanelDeactivated" in body
    assert "showing-browser" in body


def test_session_and_space_switch_flows_clear_and_resync_browser():
    assert "browserPrepareSessionSwitch" in SESSIONS_JS
    assert "browserSyncToCurrentSession" in SESSIONS_JS
    assert "browserPrepareSessionSwitch" in SPACES_JS
    assert "browserResearchPanelActivated" in SPACES_JS
    assert "browserUrlInput" in BROWSER_JS
    assert "browserSessionLabel" in BROWSER_JS
    assert "spaceEsc(_spaceEmoji(ws))" in SPACES_JS
    assert "ws.emoji || '📁'" not in SPACES_JS


def test_new_session_resets_browser_lifecycle_before_attaching_new_chat():
    body = _function_body(SESSIONS_JS, "newSession")
    assign_idx = body.index("S.session=data.session")
    assert "browserPrepareSessionSwitch" in body[:assign_idx]
    assert "browserSyncToCurrentSession" in body[assign_idx:]


def test_browser_drawer_closed_state_is_removed_from_focus_order():
    for needle in (
        'browserDrawer.setAttribute("aria-hidden", "true")',
        'browserDrawer.setAttribute("inert", "")',
        'browserDrawer.removeAttribute("inert")',
        'browserDrawer.setAttribute("aria-hidden", "false")',
    ):
        assert needle in BROWSER_JS


def test_browser_controls_follow_runtime_navigation_state():
    body = _function_body(BROWSER_JS, "_browserSetButtonsDisabled")
    assert "can_go_back" in body
    assert "can_go_forward" in body
    assert "busy" in body
    assert "browserBtnBack" in INDEX_HTML
    assert "browserBtnForward" in INDEX_HTML
    assert "browserBtnReload" in INDEX_HTML
    assert "browserBtnStop" in INDEX_HTML


def test_deep_research_hidden_prompt_is_not_rendered_as_user_topic():
    submit_body = _function_body(BROWSER_JS, "browserResearchSubmit")
    render_body = _function_body(BROWSER_JS, "browserResearchRenderSession")
    intake_body = _function_body(BROWSER_JS, "_browserResearchBuildIntakePrompt")
    research_body = _function_body(BROWSER_JS, "_browserResearchBuildResearchPrompt")
    parse_body = _function_body(BROWSER_JS, "_browserResearchParseIntakeResponse")
    assert "research_topic" in submit_body
    assert "display_content" in render_body
    assert "primary sources" in intake_body
    assert "official docs" in intake_body
    assert "source quality" in research_body
    assert "current product docs" in research_body
    assert "quick_answer" in parse_body
    assert "follow_up_questions" in parse_body
    assert "research_prompt" in parse_body
    assert "FÃ¼hre eine Deep-Research" not in render_body


def test_browser_tab_forces_right_panel_open_without_active_workspace():
    activated = _function_body(BROWSER_JS, "browserResearchPanelActivated")
    open_panel = _function_body(BOOT_JS, "openWorkspacePanel")
    assert "browserResearchLoadSessions" in activated
    assert "opts.force" in open_panel


def test_research_prompt_state_is_bound_to_active_chat_session():
    assert "_browserResearchStateBySession" in BROWSER_JS
    assert "_browserResearchApplySessionState" in BROWSER_JS
    assert "_browserResearchSelectedDirectionBySession" in BROWSER_JS
    assert "_browserResearchIntakeBySession" in BROWSER_JS
    changed = _function_body(BROWSER_JS, "browserSessionChanged")
    assert "_browserResearchApplySessionState" in changed


def test_browser_frontend_bridge_hooks_exist():
    for needle in (
        "EventSource('/api/browser/events?session_id=",
        "browserSubmitUrl",
        "browserGoBack",
        "browserGoForward",
        "browserReload",
        "browserStop",
        "browserToggleFullscreen",
        "browserToggleDrawer",
        "browserResearchSubmit",
        "browserResearchContinue",
        "browserActionSummary",
        "_browserSetActionSummary",
        "browserStopPermission",
        "_browserRecordActionTrace",
        "_browserSetTarget",
    ):
        assert needle in BROWSER_JS


def test_browser_fullscreen_toggle_is_bound_to_drawer_button():
    assert 'id="browserBtnOpenTab"' in INDEX_HTML
    assert 'data-tooltip="Maximize browser"' in INDEX_HTML
    assert 'onclick="browserToggleFullscreen()"' in INDEX_HTML
    assert "browserToggleFullscreen" in BROWSER_JS
    assert "_browserSetFullscreen" in BROWSER_JS


def test_browser_routes_are_registered():
    for needle in (
        '/api/browser/state',
        '/api/browser/frame',
        '/api/browser/events',
        '/api/browser/control',
        '/api/browser/action',
        '/api/browser/permission',
        '/api/browser/agent-control',
    ):
        assert needle in ROUTES_PY


def test_browser_agent_control_requires_explicit_permission():
    assert "browser_permission_status" in ROUTES_PY
    assert "browser_agent_control" in ROUTES_PY
    assert "browser_permission_grant" in ROUTES_PY
    assert "browser_permission_revoke" in ROUTES_PY
    assert "browser_permission_required" in ROUTES_PY


def test_browser_permission_ui_is_wired_into_drawer():
    assert 'id="browserPermissionBtn"' in INDEX_HTML
    assert 'id="browserPermissionStatus"' in INDEX_HTML
    assert "browserTogglePermission" in BROWSER_JS
    assert "browserRenderPermission" in BROWSER_JS
    assert "browserStopPermission" in BROWSER_JS
    assert "/api/browser/permission" in BROWSER_JS


def test_browser_agent_type_prefers_direct_fill_for_text_inputs():
    assert "locator(selector).fill" in BROWSER_RUNTIME
    assert "keyboard.type" in BROWSER_RUNTIME


def test_browser_action_v1_sequence_is_supported_by_runtime():
    assert "action_v1" in BROWSER_RUNTIME
    assert "sequence" in BROWSER_RUNTIME
    assert "wait_for_load_state" in BROWSER_RUNTIME or "wait_for_timeout" in BROWSER_RUNTIME


def test_browser_snapshot_exposes_ready_state_focus_and_scroll():
    snap = browser_runtime.BrowserSnapshot(
        session_id="snap-test",
        ready_state="complete",
        scroll_x=12,
        scroll_y=34,
        active_element="input#q",
        active_element_label="Search",
        target_x=12,
        target_y=34,
        target_width=56,
        target_height=78,
        target_label="Search box",
        target_selector="#q",
        target_kind="type",
        target_visible=True,
        last_action_detail="click @e1",
    )

    data = snap.to_dict()

    assert data["ready_state"] == "complete"
    assert data["scroll_x"] == 12
    assert data["scroll_y"] == 34
    assert data["active_element"] == "input#q"
    assert data["active_element_label"] == "Search"
    assert data["target_x"] == 12
    assert data["target_y"] == 34
    assert data["target_width"] == 56
    assert data["target_height"] == 78
    assert data["target_label"] == "Search box"
    assert data["target_selector"] == "#q"
    assert data["target_kind"] == "type"
    assert data["target_visible"] is True
    assert data["last_action_detail"] == "click @e1"


def test_browser_snapshot_does_not_retain_stale_active_element_label_on_navigation():
    assert 'or active_element_label or ""' not in BROWSER_RUNTIME


def test_browser_prepare_session_switch_clears_stale_url_and_label():
    body = _function_body(BROWSER_JS, "browserPrepareSessionSwitch")
    assert "browserUrlInput" in body
    assert "browserSessionLabel" in body


def test_webui_agent_runtime_exports_browser_session_env():
    streaming = (REPO / "api" / "streaming.py").read_text(encoding="utf-8")
    assert "HERMES_WEBUI_BROWSER_SESSION_ID" in streaming
    assert "HERMES_WEBUI_BROWSER_BASE_URL" in streaming
    assert "HERMES_WEBUI_BROWSER_PERMISSION_MODE" in streaming
    assert "HERMES_WEBUI_BROWSER_PERMISSION_TOKEN" in streaming


def test_browser_permission_refresh_is_session_guarded():
    assert "if (_browserCurrentSessionId() !== sid) return" in BROWSER_JS
    assert "btnBrowserDrawerToggle" in BROWSER_JS


def test_browser_session_id_falls_back_to_session_url():
    assert "location.pathname" in BROWSER_JS
    assert "/^\\/session\\/([^/?#]+)/" in BROWSER_JS


def test_browser_session_id_uses_persisted_active_session_before_url_fallback():
    assert "hermes-webui-session" in BROWSER_JS
    assert "#sessionList .session-item.active[data-sid]" in BROWSER_JS
    assert "browserStageWrap" in BROWSER_JS
    assert "scrollTo(0, 0)" in BROWSER_JS or "scrollTop = 0" in BROWSER_JS


def test_browser_url_allowlist_policy_allows_local_and_same_origin():
    assert browser_runtime._is_allowed_browser_target("http://localhost:8787")[0]
    assert browser_runtime._is_allowed_browser_target("http://127.0.0.1:3000")[0]
    assert browser_runtime._is_allowed_browser_target("https://example.com", origin_host="example.com:443")[0]
    assert browser_runtime._is_allowed_browser_target("https://evil.example")[0]


def test_browser_url_allowlist_policy_can_be_restricted_with_env_flag(monkeypatch):
    monkeypatch.setenv("HERMES_BROWSER_REQUIRE_ALLOWLIST", "1")
    monkeypatch.setenv("HERMES_BROWSER_ALLOW_HOSTS", "example.com *.wikipedia.org")
    assert browser_runtime._is_allowed_browser_target("https://example.com")[0]
    assert browser_runtime._is_allowed_browser_target("https://de.wikipedia.org")[0]
    allowed, reason = browser_runtime._is_allowed_browser_target("https://evil.example")
    assert not allowed
    assert reason == "Target host is not allowlisted"
