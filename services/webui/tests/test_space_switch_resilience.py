from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
WORKSPACE_JS = (REPO / "static" / "workspace.js").read_text(encoding="utf-8")
SPACES_JS = (REPO / "static" / "spaces.js").read_text(encoding="utf-8")
SESSIONS_JS = (REPO / "static" / "sessions.js").read_text(encoding="utf-8")


def test_workspace_tree_loads_are_timeout_guarded_and_stale_safe():
    assert "let _loadDirRev = 0" in WORKSPACE_JS
    assert "const _LOAD_DIR_TIMEOUT_MS" in WORKSPACE_JS
    assert "AbortController" in WORKSPACE_JS
    assert "function _isCurrentLoadDir" in WORKSPACE_JS
    load_dir = WORKSPACE_JS[WORKSPACE_JS.find("async function loadDir") :]
    load_dir = load_dir[: load_dir.find("\nasync function _refreshGitBadge")]
    assert "const loadRev = ++_loadDirRev" in load_dir
    assert "const sessionId = S.session.session_id" in load_dir
    assert "if(!_isCurrentLoadDir(loadRev, sessionId)) return;" in load_dir
    assert "_MAX_EXPANDED_DIR_PREFETCH" in load_dir


def test_space_switch_only_refreshes_current_visible_space_panel():
    helper_start = SPACES_JS.find("function _refreshActiveSpaceScopedPanel")
    assert helper_start >= 0
    helper = SPACES_JS[helper_start : SPACES_JS.find("\nasync function selectSpace", helper_start)]
    assert "panel === 'kanban'" in helper
    assert "panel === 'memory'" in helper
    assert "panel === 'gmail'" in helper
    select_start = SPACES_JS.find("async function selectSpace")
    select_end = SPACES_JS.find("\nasync function createSpace", select_start)
    assert select_start >= 0 and select_end > select_start
    select_space = SPACES_JS[select_start:select_end]
    assert "_refreshActiveSpaceScopedPanel();" in select_space
    assert "loadKanban();\n    }\n    if (typeof loadTodos" not in select_space


def test_space_switch_selects_or_creates_session_even_without_current_session():
    select_start = SPACES_JS.find("async function selectSpace")
    select_end = SPACES_JS.find("\nasync function createSpace", select_start)
    assert select_start >= 0 and select_end > select_start
    select_space = SPACES_JS[select_start:select_end]
    assert "if (!currentSid || !hasCurrentInSpace)" in select_space
    assert "await loadSession(sessionsInSpace[0].session_id, {expectedSpace: slug})" in select_space
    assert "await newSession()" in select_space


def test_reselecting_active_space_without_session_still_loads_session():
    select_start = SPACES_JS.find("async function selectSpace")
    select_end = SPACES_JS.find("\nasync function createSpace", select_start)
    assert select_start >= 0 and select_end > select_start
    select_space = SPACES_JS[select_start:select_end]
    assert "const hasActiveSessionForSameSpace" in select_space
    assert "sessionSpace === slug" in select_space
    assert "if (slug === _activeSpace && hasActiveSessionForSameSpace)" in select_space


def test_space_switch_trusts_workspace_filtered_session_response_when_slug_missing():
    select_start = SPACES_JS.find("async function selectSpace")
    select_end = SPACES_JS.find("\nasync function createSpace", select_start)
    assert select_start >= 0 and select_end > select_start
    select_space = SPACES_JS[select_start:select_end]
    assert "const listHasWorkspaceSlug" in select_space
    assert "listHasWorkspaceSlug ? _allSessions.filter" in select_space
    assert ": _allSessions.slice()" in select_space


def test_session_list_inflight_does_not_block_space_switch_loads():
    start = SESSIONS_JS.find("async function renderSessionList")
    end = SESSIONS_JS.find("\n// \u2500\u2500 Gateway session SSE", start)
    assert start >= 0 and end > start
    block = SESSIONS_JS[start:end]
    assert "_sessionListInFlightKey" in SESSIONS_JS
    assert "_sessionListInFlightPromise" in SESSIONS_JS
    assert "_sessionListInFlightKey === requestKey" in block
    assert "return _sessionListInFlightPromise" in block
    assert "const _gen = ++_renderSessionListGen" in block


def test_space_switch_clears_previous_conversation_and_guards_loaded_space():
    select_start = SPACES_JS.find("async function selectSpace")
    select_end = SPACES_JS.find("\nasync function createSpace", select_start)
    assert select_start >= 0 and select_end > select_start
    select_space = SPACES_JS[select_start:select_end]
    assert "_showSpaceSwitchLoading(slug)" in select_space
    helper_start = SPACES_JS.find("function _showSpaceSwitchLoading")
    helper_end = SPACES_JS.find("\nfunction _refreshActiveSpaceScopedPanel", helper_start)
    helper = SPACES_JS[helper_start:helper_end]
    assert "S.session = null" in helper
    load_start = SESSIONS_JS.find("async function loadSession")
    load_end = SESSIONS_JS.find("\n// \u2500\u2500 Handoff hint logic", load_start)
    assert load_start >= 0 and load_end > load_start
    load_session = SESSIONS_JS[load_start:load_end]
    assert ("options={}" in load_session) or ("options = options || {}" in load_session)
    assert "const expectedSpace" in load_session
    assert "loadedSessionSpace !== expectedSpace" in load_session
    assert "spaceLoadKey = (typeof _activeSpaceLoadKey === 'function')" in load_session
    assert "const _SESSION_MESSAGES_TIMEOUT_MS = 45000" in SESSIONS_JS
    ensure_start = SESSIONS_JS.find("async function _ensureMessagesLoaded")
    ensure_end = SESSIONS_JS.find("\n// Load older messages", ensure_start)
    assert ensure_start >= 0 and ensure_end > ensure_start
    assert "_SESSION_MESSAGES_TIMEOUT_MS" in SESSIONS_JS[ensure_start:ensure_end]


def test_space_switch_shows_new_space_loading_before_network_fetches():
    select_start = SPACES_JS.find("async function selectSpace")
    select_end = SPACES_JS.find("\nasync function createSpace", select_start)
    assert select_start >= 0 and select_end > select_start
    select_space = SPACES_JS[select_start:select_end]
    show_pos = select_space.find("_showSpaceSwitchLoading(slug)")
    config_pos = select_space.find("/api/space/config")
    assert show_pos >= 0 and config_pos >= 0
    assert show_pos < config_pos
    helper_start = SPACES_JS.find("function _showSpaceSwitchLoading")
    helper_end = SPACES_JS.find("\nfunction _refreshActiveSpaceScopedPanel", helper_start)
    helper = SPACES_JS[helper_start:helper_end]
    assert "Loading space conversations..." in helper
    assert "_activeSessionLoadAbortController.abort()" in helper


def test_fast_session_switches_do_not_restore_previous_chat_after_newer_load_started():
    abort_start = SESSIONS_JS.find("function _abortStaleSessionLoad")
    abort_end = SESSIONS_JS.find("\nconst _SESSION_LOAD_TIMEOUT_MS", abort_start)
    assert abort_start >= 0 and abort_end > abort_start
    abort_fn = SESSIONS_JS[abort_start:abort_end]
    assert "if (newerLoadActive) return;" in abort_fn
    restore_pos = abort_fn.find("previousState && previousState.session")
    newer_return_pos = abort_fn.find("if (newerLoadActive) return;")
    assert newer_return_pos >= 0 and restore_pos > newer_return_pos


def test_loading_session_is_optimistically_active_in_sidebar():
    active_start = SESSIONS_JS.find("function _activeSessionIdForSidebar")
    active_end = SESSIONS_JS.find("\nfunction upsertActiveSessionForLocalTurn", active_start)
    assert active_start >= 0 and active_end > active_start
    active_fn = SESSIONS_JS[active_start:active_end]
    assert "if(_loadingSessionId) return _loadingSessionId;" in active_fn
    load_start = SESSIONS_JS.find("async function loadSession")
    load_end = SESSIONS_JS.find("\n// \u2500\u2500 Handoff hint logic", load_start)
    load_session = SESSIONS_JS[load_start:load_end]
    loading_pos = load_session.find("_loadingSessionId = sid")
    render_pos = load_session.find("renderSessionListFromCache()", loading_pos)
    assert loading_pos >= 0 and render_pos > loading_pos
