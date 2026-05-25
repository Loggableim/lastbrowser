"""Regression checks for visible WebUI controls and their backend contracts."""

import json
import pathlib
import re
import urllib.error
import urllib.request

from tests._pytest_port import BASE

ROOT = pathlib.Path(__file__).resolve().parents[1]


def _get_raw(path):
    with urllib.request.urlopen(BASE + path, timeout=10) as response:
        return response.read(), response.headers.get("Content-Type", ""), response.status


def _post(path, body=None):
    data = json.dumps(body or {}).encode("utf-8")
    req = urllib.request.Request(
        BASE + path,
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read()), response.status
    except urllib.error.HTTPError as exc:
        return json.loads(exc.read()), exc.code


def test_core_static_assets_served_as_utf8_text():
    for path in ["/", "/static/ui.js", "/static/panels.js", "/static/messages.js", "/static/style.css"]:
        raw, content_type, status = _get_raw(path)
        assert status == 200
        assert raw.decode("utf-8")
        assert "text/html" in content_type or "javascript" in content_type or "css" in content_type


def test_ui_bootstrap_exports_shared_state_for_deferred_modules():
    ui = (ROOT / "static" / "ui.js").read_text(encoding="utf-8")
    assert "const S={" in ui
    assert "window.S=S" in ui
    assert "const $=id=>document.getElementById(id)" in ui
    assert "window.$=$" in ui
    assert "window.INFLIGHT=INFLIGHT" in ui
    assert "window.SESSION_QUEUES=SESSION_QUEUES" in ui
    assert "function _clipCliToolSnippet(text, maxLen=2000){" in ui


def test_visible_action_chips_have_real_handler():
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    boot = (ROOT / "static" / "boot.js").read_text(encoding="utf-8")
    assert 'onclick="actionChipClick(' in html
    assert "function actionChipClick(" in boot
    assert "window.actionChipClick=actionChipClick" in boot


def test_spaces_module_is_loaded_for_visible_space_controls():
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    spaces = (ROOT / "static" / "spaces.js").read_text(encoding="utf-8")
    assert 'src="static/spaces.js?v=' in html
    assert 'id="titlebarSpaceBtn"' in html
    assert "function toggleTitlebarSpaceDropdown(" in spaces
    assert "function showCreateSpaceDialog(" in spaces
    assert "SPACE_COLORS" in spaces
    assert 'id="newSpaceEmoji"' in spaces
    assert "createSpace(slug, name, selectedColor, emoji)" in spaces


def test_space_switch_refreshes_isolated_views():
    spaces = (ROOT / "static" / "spaces.js").read_text(encoding="utf-8")
    sessions = (ROOT / "static" / "sessions.js").read_text(encoding="utf-8")
    panels = (ROOT / "static" / "panels.js").read_text(encoding="utf-8")
    enhancements = (ROOT / "static" / "enhancements.js").read_text(encoding="utf-8")
    routes = (ROOT / "api" / "routes.py").read_text(encoding="utf-8")
    assert "localStorage.setItem('hermes-active-workspace', slug)" in spaces
    assert "await renderSessionList()" in spaces
    assert "loadKanban()" in spaces
    assert "loadTodos()" in spaces
    assert "loadCrons(true)" in spaces
    assert "loadMemory()" in spaces
    assert "loadAgentsDashboard()" in spaces
    assert "_currentPanel === 'gmail'" in spaces
    assert "loadGmailPanel()" in spaces
    assert "gmailRefresh()" not in spaces
    assert "function _resetViewsForSpaceSwitch()" in spaces
    assert "closeKanbanTaskDetail()" in spaces
    assert "_activeProject = null" in spaces
    assert "sessionParams = new URLSearchParams()" in sessions
    assert "sessionsUrl = '/api/sessions' + (sessionParams.toString()" in sessions
    assert "&?workspace" not in sessions
    assert "url.searchParams.set('workspace', activeSpace)" in enhancements
    assert "getActiveSpaceQuery()" in sessions
    assert "getActiveSpaceQuery()" in panels
    assert "activeSpace = new URLSearchParams(getActiveSpaceQuery().slice(1)).get('workspace')" in panels
    assert 'qs.get("workspace")' in routes
    assert "_setup_workspace_from_request(handler, parsed)" in routes
    assert "set_session_dir(str(ws.sessions_dir))" in routes
    assert "set_workspace_kanban(str(ws.root))" in routes


def test_titlebar_space_dropdown_uses_space_color_and_real_spaces_panel():
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    spaces = (ROOT / "static" / "spaces.js").read_text(encoding="utf-8")
    css = (ROOT / "static" / "style.css").read_text(encoding="utf-8")
    assert 'id="titlebarSpaceBtn"' in html
    assert 'onclick="showCreateSpaceDialog()"' in html
    assert 'oninput="filterSpaces()"' in html
    assert "function _bindTitlebarSpaceButton(" in spaces
    assert "btn.addEventListener('click'" in spaces
    assert "document.getElementById('spacesPanel') || document.getElementById('workspacesPanel')" in spaces
    assert "function filterSpaces(" in spaces
    assert "safeSpaceColor" in spaces
    assert "nameEl.style.color = color" in spaces
    assert "titlebar-space-dd-swatch" in spaces
    assert "btn.setAttribute('aria-expanded', 'false')" in spaces
    assert "--space-color" in css


def test_spaces_tab_renders_sidebar_cards_and_main_detail_panel():
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    spaces = (ROOT / "static" / "spaces.js").read_text(encoding="utf-8")
    css = (ROOT / "static" / "style.css").read_text(encoding="utf-8")
    assert 'href="static/spaces.css?v=' not in html
    assert "function renderSpaceDetail(" in spaces
    assert "workspaceDetailBody" in spaces
    assert "workspaceDetailEmpty" in spaces
    assert "space-hero-card" in spaces
    assert "space-settings-card" in spaces
    assert "space-isolation-card" in spaces
    assert "document.getElementById('workspacesPanel')" in spaces
    assert "item.type = 'button'" in spaces
    assert "item.onclick = () => selectSpace(ws.slug)" in spaces
    assert "saveActiveSpaceDetails" in spaces
    assert "async function deleteActiveSpaceFromDetail()" in spaces
    assert "Space deleted" in spaces
    assert "#workspacesPanel .space-item" in css
    assert ".space-detail-shell" in css


def test_gmail_filter_chips_filter_loaded_mail_not_only_style():
    gmail = (ROOT / "static" / "gmail.js").read_text(encoding="utf-8")
    assert "function gmailApplyFilter(emails)" in gmail
    assert "filter === 'unread'" in gmail
    assert "email.seen === false" in gmail
    assert "filter === 'today'" in gmail
    assert "renderInbox({...data, emails: gmailApplyFilter(GMAIL.emails)" in gmail


def test_chat_sidebar_project_filter_bar_is_not_visible_under_space_isolation():
    sessions = (ROOT / "static" / "sessions.js").read_text(encoding="utf-8")
    assert "const projectFiltered=profileFiltered;" in sessions
    assert "if(_activeProject) _activeProject=null;" in sessions
    assert "if(false&&(_allProjects.length>0||hasUnprojected)){" in sessions


def test_enhanced_bulk_delete_uses_existing_session_delete_route():
    src = (ROOT / "static" / "enhancements.js").read_text(encoding="utf-8")
    assert "api/session/delete" in src
    assert "api/sessions/${encodeURIComponent(id)}" not in src


def test_inline_apply_uses_workspace_write_with_session_contract(cleanup_test_sessions):
    src = (ROOT / "static" / "enhancements.js").read_text(encoding="utf-8")
    routes = (ROOT / "api" / "routes.py").read_text(encoding="utf-8")
    assert "api/workspace/write" in src
    assert "session_id: S.session.session_id" in src
    assert 'parsed.path == "/api/workspace/write"' in routes

    session_data, status = _post("/api/session/new", {})
    assert status == 200
    sid = session_data["session"]["session_id"]
    cleanup_test_sessions.append(sid)
    result, write_status = _post(
        "/api/workspace/write",
        {"session_id": sid, "path": "gui_alignment_write.txt", "content": "ok"},
    )
    assert write_status == 200, result
    assert result["ok"] is True
    assert result["path"] == "gui_alignment_write.txt"
    workspace = pathlib.Path(session_data["session"]["workspace"])
    (workspace / "gui_alignment_write.txt").unlink(missing_ok=True)


def test_primary_rail_expands_labels_instead_of_hiding_content_sidebar():
    boot = (ROOT / "static" / "boot.js").read_text(encoding="utf-8")
    css = (ROOT / "static" / "style.css").read_text(encoding="utf-8")
    assert "rail-expanded" in boot
    toggle_body = boot[boot.index("function toggleSidebar"):boot.index("function expandSidebar")]
    assert "classList.toggle('sidebar-collapsed'" not in toggle_body
    assert ".layout.rail-expanded .rail" in css
    assert "flex-direction:row!important" in css
    assert "content:attr(data-tooltip)" in css.replace(" ", "")


def test_space_scoped_new_sessions_do_not_inherit_previous_workspace_path():
    sessions = (ROOT / "static" / "sessions.js").read_text(encoding="utf-8")
    routes = (ROOT / "api" / "routes.py").read_text(encoding="utf-8")
    assert "const isSpaceScoped = !!spaceQS" in sessions
    assert "if(!isSpaceScoped && inheritWs) reqBody.workspace=inheritWs;" in sessions
    branch = routes[routes.index('if parsed.path == "/api/session/new"'):]
    assert "if workspace_slug:" in branch
    assert "_setup_workspace_from_request(handler, parsed)" in branch
    assert "_teardown_workspace_context()" in branch


def test_chat_send_shows_immediate_pending_feedback_before_stream_tokens():
    messages = (ROOT / "static" / "messages.js").read_text(encoding="utf-8")
    ui = (ROOT / "static" / "ui.js").read_text(encoding="utf-8")
    assert "setComposerStatus('Hermes is starting...')" in messages
    assert "appendThinking('Starting Hermes...')" in messages
    assert "setComposerStatus('Hermes is responding...')" in messages
    assert "(!S.activeStreamId&&!S.busy)" in ui


def test_action_chips_are_utf8_clean_plain_labels():
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    chips = html[html.index('id="actionChips"'):html.index('<textarea id="msg"')]
    assert "ðŸ" not in chips
    for label in ("Review", "Test", "Install", "Deploy", "Plan"):
        assert f">{label}</button>" in chips


def test_space_delete_removes_primary_and_legacy_directories(monkeypatch, tmp_path):
    from api import space_engine

    primary = tmp_path / "spaces"
    legacy = tmp_path / "workspaces"
    for root in (primary, legacy):
        (root / "doomed").mkdir(parents=True)
        (root / "doomed" / "space.yaml").write_text("color: '#4FC3F7'\n", encoding="utf-8")

    monkeypatch.setattr(space_engine, "SPACES_ROOT", primary)
    monkeypatch.setattr(space_engine, "_OLD_ROOT", legacy)
    space_engine._invalidate_space_cache()

    assert space_engine.delete_space("doomed") is True
    assert not (primary / "doomed").exists()
    assert not (legacy / "doomed").exists()
    assert space_engine.get_space("doomed") is None


def test_workspace_panel_relevance_is_panel_aware():
    boot = (ROOT / "static" / "boot.js").read_text(encoding="utf-8")
    panels = (ROOT / "static" / "panels.js").read_text(encoding="utf-8")
    assert "function isWorkspacePanelRelevantForPanel(" in boot
    assert "syncWorkspacePanelForActivePanel" in boot
    assert "syncWorkspacePanelForActivePanel(nextPanel)" in panels
    relevant_line = re.search(r"const _WORKSPACE_PANEL_RELEVANT = new Set\(\[([^\]]+)\]\);", boot)
    assert relevant_line
    relevant = relevant_line.group(1)
    assert "'tasks'" not in relevant
    assert "'kanban'" not in relevant
    assert "'todos'" not in relevant
    assert "'gmail'" in relevant


def test_todos_main_view_is_real_board_not_chat_shell():
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    panels = (ROOT / "static" / "panels.js").read_text(encoding="utf-8")
    css = (ROOT / "static" / "style.css").read_text(encoding="utf-8")
    assert 'id="mainTodos"' in html
    assert 'id="todoMainBoard"' in html
    assert "function _renderTodosMainBoard(" in panels
    assert "todoMainBoard" in panels
    assert "todos-overview-grid" in panels
    assert "todos-completed-panel" in panels
    assert "main.showing-todos > #mainTodos" in css
    assert ".todos-columns" in css
    assert ".todos-workspace-layout" in css


def test_tasks_main_view_has_scheduled_jobs_overview_actions():
    panels = (ROOT / "static" / "panels.js").read_text(encoding="utf-8")
    css = (ROOT / "static" / "style.css").read_text(encoding="utf-8")
    assert "function _renderCronOverview(" in panels
    assert "_renderCronOverview(_cronList)" in panels
    for action in ["cronRun", "cronPause", "cronResume", "openCronDetail", "editCurrentCron", "duplicateCurrentCron", "deleteCurrentCron"]:
        assert action in panels
    assert ".cron-overview-grid" in css
    assert ".cron-overview-actions" in css


def test_insights_layout_moves_system_health_to_left_column():
    panels = (ROOT / "static" / "panels.js").read_text(encoding="utf-8")
    css = (ROOT / "static" / "style.css").read_text(encoding="utf-8")
    assert "insights-left-column" in panels
    assert "_renderSystemHealthPanel()" in panels
    assert "insights-main-column" in panels
    assert ".insights-layout" in css
    assert ".insights-row--responsive" in css


def test_agent_dashboard_rework_classes_have_css_contract():
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "static" / "agents-dashboard.css").read_text(encoding="utf-8")
    for name in [
        "agents-dashboard-shell",
        "agents-dashboard-hero",
        "agents-dashboard-titleblock",
        "agents-dashboard-grid-wrap",
        "agents-dashboard-feed",
    ]:
        assert name in html
        assert f".{name}" in css


def test_agents_dashboard_accepts_object_api_payloads():
    agents = (ROOT / "static" / "agents.js").read_text(encoding="utf-8")
    css = (ROOT / "static" / "style.css").read_text(encoding="utf-8")
    assert "function arrayFromApiPayload(" in agents
    assert "const agents = arrayFromApiPayload(agentsPayload, 'agents');" in agents
    assert "const activities = arrayFromApiPayload(activitiesPayload, 'activities');" in agents
    assert "const statsMap = statsMapFromPayload(statsPayload);" in agents
    assert "body.showing-agents .sidebar{width:360px;}" in css


def test_chat_empty_logo_removed_and_compact_composer_avoids_overlap():
    css = (ROOT / "static" / "style.css").read_text(encoding="utf-8")
    assert "#emptyState .empty-logo{display:none!important;}" in css
    assert "#mainChat.chat-compact .composer-left" in css
    assert "#mainChat.chat-compact .composer-workspace-label" in css
    assert "#mainChat.chat-compact .composer-model-provider" in css


def test_chat_session_list_uses_url_params_without_stale_all_profiles_var():
    sessions = (ROOT / "static" / "sessions.js").read_text(encoding="utf-8")
    assert "const projectParams = new URLSearchParams()" in sessions
    assert "const projectsUrl = '/api/projects' + (projectParams.toString()" in sessions
    assert "allProfilesQS" not in sessions


def test_chat_message_footer_defines_optional_controls_before_rendering():
    ui = (ROOT / "static" / "ui.js").read_text(encoding="utf-8")
    foot_idx = ui.index("const footHtml =")
    assert ui.index("const stopBtn") < foot_idx
    assert ui.index("const resultToggleHtml") < foot_idx
    assert ui.index("const stoppedBadgeHtml") < foot_idx
    assert "${resultToggleHtml}${stoppedBadgeHtml}${footHtml}" in ui


def test_terminal_script_has_single_active_terminal_stream_declaration():
    terminal = (ROOT / "static" / "terminal.js").read_text(encoding="utf-8")
    assert terminal.count("const TerminalStream = {") == 1


def test_kanban_main_preview_is_not_globally_hidden():
    css = (ROOT / "static" / "style.css").read_text(encoding="utf-8")
    panels = (ROOT / "static" / "panels.js").read_text(encoding="utf-8")
    assert not re.search(
        r"(?m)^\s*\.kanban-task-preview\s*\{\s*display:\s*none\s*!important;\s*\}",
        css,
    )
    assert "#mainKanban .kanban-task-preview" in css
    assert "preview.style.display = '';" in panels
    assert "The workspace panel is intentionally not used in Kanban mode." in panels


def test_gmail_reading_pane_has_manual_resize_controls():
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    gmail = (ROOT / "static" / "gmail.js").read_text(encoding="utf-8")
    assert 'id="gmailPaneShrinkBtn"' in html
    assert 'id="gmailPaneGrowBtn"' in html
    assert "function gmailAdjustReadingPane(delta)" in gmail
    assert "splitHandle.style.display = 'flex'" in gmail


def test_gmail_setup_overlay_does_not_block_global_navigation():
    gmail = (ROOT / "static" / "gmail.js").read_text(encoding="utf-8")
    panels = (ROOT / "static" / "panels.js").read_text(encoding="utf-8")
    css = (ROOT / "static" / "style.css").read_text(encoding="utf-8")
    assert "position:absolute;inset:0;z-index:100" in gmail
    assert "document.querySelector('main.main') || document.body" in gmail
    assert "overlayHost.appendChild(overlay)" in gmail
    assert "if (typeof gmailCloseSplash === 'function') gmailCloseSplash();" in panels
    assert ".main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;min-height:0;background:var(--main-bg);position:relative;}" in css


def test_error_logging_endpoint_roundtrip():
    result, status = _post(
        "/api/errors/log",
        {"type": "js_error", "message": "gui alignment smoke", "meta": {"source": "pytest"}},
    )
    assert status == 200, result
    assert result["success"] is True
    assert isinstance(result["id"], int)
    assert result["id"] > 0
    stats_raw, _, stats_status = _get_raw("/api/errors/stats")
    assert stats_status == 200
    stats = json.loads(stats_raw.decode("utf-8"))
    assert stats["success"] is True
    assert "total" in stats["stats"]


def test_custom_titlebar_controls_are_gated_and_non_drag():
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    boot = (ROOT / "static" / "boot.js").read_text(encoding="utf-8")
    css = (ROOT / "static" / "style.css").read_text(encoding="utf-8")
    routes = (ROOT / "api" / "routes.py").read_text(encoding="utf-8")
    manifest = json.loads((ROOT / "static" / "manifest.json").read_text(encoding="utf-8"))
    assert 'class="window-controls"' in html
    assert "windowControls.minimize()" in html
    assert "windowControls.maximize()" in html
    assert "windowControls.close()" in html
    assert "function initWindowControls(" in boot
    assert "navigator.windowControlsOverlay" in boot
    assert "hermes_app" in boot
    assert "hermes-app-window" in boot
    assert "/api/window/control" in boot
    assert 'parsed.path == "/api/window/control"' in routes
    assert ".window-controls" in css and "-webkit-app-region:no-drag" in css.replace(" ", "")
    assert "window-controls-overlay" in manifest.get("display_override", [])


def test_hub_cast_uses_same_origin_proxy_with_unavailable_state():
    ui = (ROOT / "static" / "ui.js").read_text(encoding="utf-8")
    css = (ROOT / "static" / "style.css").read_text(encoding="utf-8")
    routes = (ROOT / "api" / "routes.py").read_text(encoding="utf-8")
    assert "const CAST_API_HOST" not in ui
    assert "_castFetch('/api/cast/status')" in ui
    assert "_castFetch('/api/cast/toggle',{method:'POST'})" in ui
    assert "_castAvailable" in ui
    assert "cast-unavailable" in ui
    assert ".cast-unavailable" in css
    assert 'parsed.path == "/api/cast/status"' in routes
    assert 'parsed.path == "/api/cast/toggle"' in routes
    assert "HERMES_CAST_API_HOST" in routes


def test_inline_onclick_handlers_resolve_to_loaded_functions():
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    loaded = [
        "ui.js",
        "workspace.js",
        "terminal.js",
        "sessions.js",
        "commands.js",
        "messages.js",
        "panels.js",
        "onboarding.js",
        "boot.js",
        "spaces.js",
        "gmail.js",
        "enhancements.js",
        "power.js",
        "discord.js",
        "discord-chat.js",
        "agents.js",
    ]
    src = html + "\n" + "\n".join((ROOT / "static" / name).read_text(encoding="utf-8") for name in loaded)
    definitions = set(re.findall(r"function\s+([A-Za-z_$][\w$]*)\s*\(", src))
    definitions.update(re.findall(r"(?:window\.|globalThis\.)([A-Za-z_$][\w$]*)\s*=", src))
    onclick = set(re.findall(r'onclick="\s*([A-Za-z_$][\w$]*)\s*\(', html))
    onclick.discard("if")
    missing = sorted(name for name in onclick if name not in definitions)
    assert missing == []
