/**
 * LastBrowser v2 — IPC Router
 * Central registry for ALL IPC handlers across all modules.
 * Every channel from constants.js mapped to its manager method.
 */
const { ipcMain, session, app } = require('electron');
const { IPC } = require('../../shared/constants');

// Lazy-load managers to avoid circular deps
const _mgr = {};
function mgr(name) {
  if (!_mgr[name]) {
    _mgr[name] = require(`../managers/${name}`);
  }
  return _mgr[name];
}

function _wrap(fn) {
  return async (_event, ...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(`[ipc] Error:`, err.message);
      return { error: err.message };
    }
  };
}

function registerAll() {
  // ── Workspace ────────────────────────────────────────────────────────
  ipcMain.handle(IPC.WORKSPACE_LIST, _wrap(() => mgr('workspaceManager').getAll()));
  ipcMain.handle(IPC.WORKSPACE_CREATE, _wrap((_, data) => mgr('workspaceManager').create(data)));
  ipcMain.handle(IPC.WORKSPACE_UPDATE, _wrap((_, id, changes) => mgr('workspaceManager').update(id, changes)));
  ipcMain.handle(IPC.WORKSPACE_DELETE, _wrap((_, id) => mgr('workspaceManager').remove(id)));
  ipcMain.handle(IPC.WORKSPACE_PAUSE, _wrap((_, id, paused) => mgr('workspaceManager').setPaused(id, paused)));
  ipcMain.handle(IPC.WORKSPACE_EXPORT, _wrap((_, id) => mgr('workspaceManager').exportWorkspace(id)));
  ipcMain.handle(IPC.WORKSPACE_IMPORT, _wrap((_, data) => mgr('workspaceManager').importWorkspace(data)));
  ipcMain.handle(IPC.WORKSPACE_REORDER, _wrap((_, ids) => mgr('workspaceManager').reorder(ids)));
  ipcMain.handle(IPC.WORKSPACE_STATS, _wrap(() => mgr('workspaceManager').getStats()));
  ipcMain.handle(IPC.WORKSPACE_SWITCH, _wrap((_, id) => {
    // The main process just returns the workspace; renderer handles display
    return mgr('workspaceManager').getById(id);
  }));

  // ── Apps ─────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.APP_LIST, _wrap((_, workspaceId) => {
    if (workspaceId) return mgr('appManager').getByWorkspace(workspaceId);
    return mgr('appManager').getAll();
  }));
  ipcMain.handle(IPC.APP_CREATE, _wrap((_, data) => mgr('appManager').create(data)));
  ipcMain.handle(IPC.APP_UPDATE, _wrap((_, id, changes) => mgr('appManager').update(id, changes)));
  ipcMain.handle(IPC.APP_DELETE, _wrap((_, id) => mgr('appManager').remove(id)));
  ipcMain.handle(IPC.APP_REORDER, _wrap((_, ids) => mgr('appManager').reorder(ids)));

  // ── App Definitions (Presets) ──────────────────────────────────────
  ipcMain.handle(IPC.APPDEF_LIST, _wrap(() => mgr('appDefinitionManager').getAll()));
  ipcMain.handle(IPC.APPDEF_PRESETS, _wrap(() => mgr('appDefinitionManager').getPresets()));
  ipcMain.handle(IPC.APPDEF_CREATE, _wrap((_, data) => mgr('appDefinitionManager').create(data)));
  ipcMain.handle(IPC.APPDEF_SEED, _wrap(() => mgr('appDefinitionManager').seedPresets()));

  // ── App Accounts (Multi-Account System) ────────────────────────────
  ipcMain.handle(IPC.APPACCOUNT_LIST, _wrap(() => mgr('accountManager').getAll ? mgr('accountManager').getAll() : []));
  ipcMain.handle(IPC.APPACCOUNT_LIST_BY_APP, _wrap((_, appId) => mgr('accountManager').getByApp(appId)));
  ipcMain.handle(IPC.APPACCOUNT_LIST_BY_WS, _wrap((_, wsId) => mgr('accountManager').getByWorkspace(wsId)));
  ipcMain.handle(IPC.APPACCOUNT_CREATE, _wrap((_, data) => mgr('accountManager').create(data)));
  ipcMain.handle(IPC.APPACCOUNT_UPDATE, _wrap((_, id, changes) => mgr('accountManager').update(id, changes)));
  ipcMain.handle(IPC.APPACCOUNT_DELETE, _wrap((_, id) => mgr('accountManager').remove(id)));
  ipcMain.handle(IPC.APPACCOUNT_SET_ACTIVE, _wrap((_, id) => mgr('accountManager').setActive(id)));
  ipcMain.handle(IPC.APPACCOUNT_SET_MUTED, _wrap((_, id, muted) => mgr('accountManager').setMuted(id, muted)));
  ipcMain.handle(IPC.APPACCOUNT_DUPLICATE, _wrap((_, id) => mgr('accountManager').duplicate(id)));
  ipcMain.handle(IPC.APPACCOUNT_MOVE_WS, _wrap((_, id, wsId) => mgr('accountManager').moveToWorkspace(id, wsId)));
  ipcMain.handle(IPC.APPACCOUNT_CLEAR_CACHE, _wrap((_, id) => mgr('accountManager').clearCache(id)));
  ipcMain.handle(IPC.APPACCOUNT_CLEAR_COOKIES, _wrap((_, id) => mgr('accountManager').clearCookies(id)));
  ipcMain.handle(IPC.APPACCOUNT_SET_AGENT, _wrap((_, id, agentId) => mgr('accountManager').setAgent(id, agentId)));
  ipcMain.handle(IPC.APPACCOUNT_RELEASE_AGENT, _wrap((_, id) => mgr('accountManager').releaseAgent(id)));
  ipcMain.handle(IPC.APPACCOUNT_RECORD_ACTION, _wrap((_, id, action, output, status) => mgr('accountManager').recordAgentAction(id, action, output, status)));
  ipcMain.handle(IPC.APPACCOUNT_UPDATE_BADGE, _wrap((_, id, count) => mgr('accountManager').updateBadge(id, count)));
  // Legacy backward compat (old APP_ACCOUNT_* channels)
  ipcMain.handle(IPC.APP_ACCOUNT_ADD, _wrap((_, appId, data) => mgr('accountManager').create({ ...data, appId, appShortcutId: appId })));
  ipcMain.handle(IPC.APP_ACCOUNT_REMOVE, _wrap((_, id) => mgr('accountManager').remove(id)));
  ipcMain.handle(IPC.APP_ACCOUNT_SWITCH, _wrap((_, appId, accountId) => {
    const acct = mgr('accountManager').getById(accountId);
    if (acct) return mgr('accountManager').setActive(accountId);
    return null;
  }));
  ipcMain.handle(IPC.APP_OPEN, _wrap((_, appId) => {
    const app = mgr('appManager').getById(appId);
    if (!app) return null;
    const tabManager = mgr('tabManager');
    return tabManager.create({
      url: app.url,
      title: app.name,
      workspaceId: app.workspaceId,
      appShortcutId: appId,
      sessionPartition: app.accounts?.find(a => a.isActive)?.sessionPartition || `persist:app_${appId}`,
    });
  }));
  ipcMain.handle(IPC.APP_MUTE, _wrap((_, id) => mgr('appManager').setMuted(id, true)));
  ipcMain.handle(IPC.APP_UNMUTE, _wrap((_, id) => mgr('appManager').setMuted(id, false)));
  ipcMain.handle(IPC.APP_CLEAR_CACHE, _wrap((_, id) => mgr('privacyManager').clearCache(id)));
  ipcMain.handle(IPC.APP_SLEEP, _wrap((_, id) => mgr('resourceSaver').sleepApp(id)));
  ipcMain.handle(IPC.APP_WAKE, _wrap((_, id) => mgr('resourceSaver').wakeApp(id)));
  ipcMain.handle(IPC.APP_BADGE, _wrap((_, id, count) => mgr('appManager').updateBadge(id, count)));

  // ── Tabs ─────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.TAB_LIST, _wrap((_, workspaceId) => mgr('tabManager').getAll(workspaceId)));
  ipcMain.handle(IPC.TAB_CREATE, _wrap((_, data) => mgr('tabManager').create(data)));
  ipcMain.handle(IPC.TAB_UPDATE, _wrap((_, id, changes) => mgr('tabManager').update(id, changes)));
  ipcMain.handle(IPC.TAB_CLOSE, _wrap((_, id) => mgr('tabManager').remove(id)));
  ipcMain.handle(IPC.TAB_RESTORE, _wrap((_, id) => mgr('tabManager').restoreClosed(id)));
  ipcMain.handle(IPC.TAB_SUSPEND, _wrap((_, id) => mgr('tabManager').setSuspended(id, true)));
  ipcMain.handle(IPC.TAB_UNSUSPEND, _wrap((_, id) => mgr('tabManager').setSuspended(id, false)));
  ipcMain.handle(IPC.TAB_ACTIVATE, _wrap((_, id) => mgr('tabManager').update(id, { isSuspended: false })));
  ipcMain.handle(IPC.TAB_PIN, _wrap((_, id) => mgr('tabManager').pin(id)));
  ipcMain.handle(IPC.TAB_UNPIN, _wrap((_, id) => mgr('tabManager').unpin(id)));
  ipcMain.handle(IPC.TAB_MUTE, _wrap((_, id) => mgr('tabManager').setMuted(id, true)));
  ipcMain.handle(IPC.TAB_UNMUTE, _wrap((_, id) => mgr('tabManager').setMuted(id, false)));
  ipcMain.handle(IPC.TAB_DUPLICATE, _wrap((_, id) => mgr('tabManager').duplicate(id)));
  ipcMain.handle(IPC.TAB_MOVE, _wrap((_, id, targetWs) => mgr('tabManager').moveToWorkspace(id, targetWs)));
  ipcMain.handle(IPC.TAB_SUSPEND_ALL, _wrap((_, excludeIds) => mgr('tabManager').suspendAllInactive(excludeIds || [])));
  ipcMain.handle(IPC.TAB_RELOAD, _wrap((_, id) => ({ tabId: id, action: 'reload' })));
  ipcMain.handle(IPC.TAB_NAVIGATE, _wrap((_, id, url) => ({ tabId: id, url, action: 'navigate' })));
  ipcMain.handle(IPC.TAB_GO_BACK, _wrap((_, id) => ({ tabId: id, action: 'goBack' })));
  ipcMain.handle(IPC.TAB_GO_FORWARD, _wrap((_, id) => ({ tabId: id, action: 'goForward' })));

  // ── Closed Tabs ──────────────────────────────────────────────────────
  ipcMain.handle(IPC.CLOSED_TABS, _wrap((_, workspaceId) => mgr('tabManager').listClosed(workspaceId)));
  ipcMain.handle(IPC.CLOSED_TABS_RESTORE, _wrap((_, workspaceId) => mgr('tabManager').restoreClosed(workspaceId)));

  // ── Tab Sets / Sessions ──────────────────────────────────────────────
  ipcMain.handle(IPC.TABSET_LIST, _wrap((_, workspaceId) => mgr('sessionManager').getByWorkspace(workspaceId)));
  ipcMain.handle(IPC.TABSET_CREATE, _wrap((_, data) => mgr('sessionManager').create(data)));
  ipcMain.handle(IPC.TABSET_SAVE, _wrap((_, id, tabIds) => mgr('sessionManager').update(id, { tabIds })));
  ipcMain.handle(IPC.TABSET_RESTORE, _wrap((_, id) => mgr('sessionManager').getById(id)));
  ipcMain.handle(IPC.TABSET_DELETE, _wrap((_, id) => mgr('sessionManager').remove(id)));
  ipcMain.handle(IPC.TABSET_UPDATE, _wrap((_, id, changes) => mgr('sessionManager').update(id, changes)));
  ipcMain.handle(IPC.TABSET_DUPLICATE, _wrap((_, id) => mgr('sessionManager').duplicate(id)));
  ipcMain.handle(IPC.TABSET_EXPORT, _wrap((_, id) => mgr('sessionManager').exportSet(id)));
  ipcMain.handle(IPC.TABSET_AUTOSAVE, _wrap((_, wsId, enabled) => mgr('workspaceManager').update(wsId, { tabSetAutoSave: enabled })));

  // ── Session Agent Integration ─────────────────────────────────────
  ipcMain.handle(IPC.TABSET_ASSIGN_AGENT, _wrap((_, id, agentId) => mgr('sessionManager').assignAgent(id, agentId)));
  ipcMain.handle(IPC.TABSET_RELEASE_AGENT, _wrap((_, id) => mgr('sessionManager').releaseAgent(id)));
  ipcMain.handle(IPC.TABSET_AGENT_ACTION, _wrap((_, id, action, output, status) => mgr('sessionManager').recordAgentAction(id, action, output, status)));
  ipcMain.handle(IPC.TABSET_AGENT_SESSIONS, _wrap((_, agentId) => mgr('sessionManager').getAgentSessions(agentId)));

  // ── Split View ───────────────────────────────────────────────────────
  ipcMain.handle(IPC.SPLIT_GET, _wrap((_, workspaceId) => mgr('splitViewManager').getByWorkspace(workspaceId)));
  ipcMain.handle(IPC.SPLIT_CREATE, _wrap((_, wsId, layout, tabs) => mgr('splitViewManager').create(wsId, layout, tabs)));
  ipcMain.handle(IPC.SPLIT_UPDATE, _wrap((_, id, changes) => mgr('splitViewManager').update(id, changes)));
  ipcMain.handle(IPC.SPLIT_DELETE, _wrap((_, id) => mgr('splitViewManager').remove(id)));
  ipcMain.handle(IPC.SPLIT_ADD_PANEL, _wrap((_, id, tabId) => mgr('splitViewManager').addPanel(id, tabId)));
  ipcMain.handle(IPC.SPLIT_REMOVE_PANEL, _wrap((_, id, panelId) => mgr('splitViewManager').removePanel(id, panelId)));
  ipcMain.handle(IPC.SPLIT_LAYOUTS, _wrap(() => {
    const { SPLIT_LAYOUTS } = require('../../shared/constants');
    return Object.values(SPLIT_LAYOUTS);
  }));

  // ── Focus Mode ───────────────────────────────────────────────────────
  ipcMain.handle(IPC.FOCUS_START, _wrap((_, type, workspaceId) => mgr('focusManager').start(type, workspaceId)));
  ipcMain.handle(IPC.FOCUS_STOP, _wrap(() => mgr('focusManager').stop()));
  ipcMain.handle(IPC.FOCUS_PAUSE, _wrap(() => mgr('focusManager').pause()));
  ipcMain.handle(IPC.FOCUS_STATUS, _wrap(() => mgr('focusManager').getStatus()));
  ipcMain.handle(IPC.FOCUS_CONFIG, _wrap((_, changes) => changes ? mgr('focusManager').updateConfig(changes) : mgr('focusManager').getConfig()));
  ipcMain.handle(IPC.FOCUS_TOGGLE, _wrap(() => {
    const status = mgr('focusManager').getStatus();
    if (status.active) { mgr('focusManager').stop(); return false; }
    return true;
  }));
  ipcMain.handle(IPC.FOCUS_DISTRACTION, _wrap((_, action, data) => {
    if (action === 'list') return mgr('focusManager').getRules();
    if (action === 'create') return mgr('focusManager').createRule(data);
    if (action === 'update') return mgr('focusManager').updateRule(data.id, data.changes);
    if (action === 'delete') return mgr('focusManager').removeRule(data.id);
  }));

  // ── Compact Mode ──────────────────────────────────────────────────────
  ipcMain.handle(IPC.COMPACT_TOGGLE, _wrap(() => mgr('compactManager').toggle()));
  ipcMain.handle(IPC.COMPACT_STATUS, _wrap(() => mgr('compactManager').getLevel()));

  // ── Command Palette ─────────────────────────────────────────────────
  ipcMain.handle(IPC.PALETTE_SEARCH, _wrap((_, query) => mgr('commandPalette').search(query)));
  ipcMain.handle(IPC.PALETTE_EXECUTE, _wrap((_, result) => mgr('commandPalette').execute(result)));

  // ── Settings ─────────────────────────────────────────────────────────
  ipcMain.handle(IPC.SETTINGS_GET, _wrap(() => mgr('settingsManager').getAll()));
  ipcMain.handle(IPC.SETTINGS_UPDATE, _wrap((_, changes) => mgr('settingsManager').update(changes)));
  ipcMain.handle(IPC.SETTINGS_RESET, _wrap(() => mgr('settingsManager').reset()));
  ipcMain.handle(IPC.SETTINGS_GET_KEY, _wrap((_, key) => mgr('settingsManager').get(key)));
  ipcMain.handle(IPC.BACKUP_CREATE, _wrap(() => {
    const store = require('../database/store');
    return store.createBackup();
  }));
  ipcMain.handle(IPC.BACKUP_RESTORE, _wrap((_, path) => {
    const store = require('../database/store');
    return store.restoreBackup(path);
  }));
  ipcMain.handle(IPC.BACKUP_LIST, _wrap(() => {
    const store = require('../database/store');
    return store.listBackups();
  }));

  // ── Notifications ────────────────────────────────────────────────────
  ipcMain.handle(IPC.NOTIF_LIST, _wrap((_, wsId) => mgr('notificationManager').getAll(wsId)));
  ipcMain.handle(IPC.NOTIF_DISMISS, _wrap((_, id) => mgr('notificationManager').dismiss(id)));
  ipcMain.handle(IPC.NOTIF_CLEAR, _wrap(() => mgr('notificationManager').dismissAll()));
  ipcMain.handle(IPC.NOTIF_UPDATE, _wrap((_, data) => mgr('notificationManager').add(data)));
  ipcMain.handle(IPC.NOTIF_MUTE_APP, _wrap((_, appId, muted) => mgr('notificationManager').muteApp(appId, muted)));
  ipcMain.handle(IPC.NOTIF_MUTE_WS, _wrap((_, wsId, muted) => mgr('notificationManager').muteWorkspace(wsId, muted)));
  ipcMain.handle(IPC.NOTIF_MUTE_GLOBAL, _wrap((_, muted) => mgr('notificationManager').muteGlobal(muted)));

  // ── Tasks ────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.TASK_LIST, _wrap((_, workspaceId) => mgr('taskManager').getByWorkspace(workspaceId)));
  ipcMain.handle(IPC.TASK_CREATE, _wrap((_, data) => mgr('taskManager').create(data)));
  ipcMain.handle(IPC.TASK_UPDATE, _wrap((_, id, changes) => mgr('taskManager').update(id, changes)));
  ipcMain.handle(IPC.TASK_DELETE, _wrap((_, id) => mgr('taskManager').remove(id)));
  ipcMain.handle(IPC.TASK_REORDER, _wrap((_, ids) => mgr('taskManager').reorder(ids)));
  ipcMain.handle(IPC.TASK_PIN_TO_TAB, _wrap((_, taskId, tabId) => mgr('taskManager').pinToTab(taskId, tabId)));
  ipcMain.handle(IPC.TASK_UNPIN_FROM_TAB, _wrap((_, taskId) => mgr('taskManager').unpinFromTab(taskId)));

  // ── Quick Actions ────────────────────────────────────────────────────
  ipcMain.handle(IPC.QUICK_ACTION, _wrap((_, actionId) => {
    switch (actionId) {
      case 'focus-start': return mgr('focusManager').start('pomodoro', null);
      case 'focus-stop': return mgr('focusManager').stop();
      case 'sleep-all': return mgr('resourceSaver').sleepAllInactive();
      case 'save-session': return { action: 'save-session' }; // renderer handles
      case 'toggle-compact': return mgr('compactManager').toggle();
      case 'toggle-sidebar': return { action: 'toggle-sidebar' };
      case 'mute-all': return { action: 'mute-all' };
      case 'clear-cache': return mgr('privacyManager').clearCache();
      case 'new-tab': return { action: 'new-tab' };
      case 'command-palette': return { action: 'open-palette' };
      case 'split-50': return { action: 'split-50' };
      case 'split-70-30': return { action: 'split-70-30' };
      default: return { error: `Unknown action: ${actionId}` };
    }
  }));

  // ── Resource Saver ──────────────────────────────────────────────────
  ipcMain.handle(IPC.SAVER_CONFIG, _wrap((_, changes) => changes ? mgr('resourceSaver').updateConfig(changes) : mgr('resourceSaver').getConfig()));
  ipcMain.handle(IPC.SAVER_SLEEP_NOW, _wrap((_, excludeIds) => mgr('resourceSaver').sleepAllInactive(excludeIds)));
  ipcMain.handle(IPC.SAVER_STATUS, _wrap(() => mgr('resourceSaver').getMemoryStats()));
  ipcMain.handle(IPC.SAVER_EXCEPTION, _wrap((_, action, pattern) => {
    if (action === 'add') return mgr('resourceSaver').addException(pattern);
    if (action === 'remove') return mgr('resourceSaver').removeException(pattern);
    return mgr('resourceSaver').getExceptions();
  }));

  // ── Privacy ─────────────────────────────────────────────────────────
  ipcMain.handle(IPC.PRIVACY_CONFIG, _wrap((_, changes) => changes ? mgr('privacyManager').updateConfig(changes) : mgr('privacyManager').getConfig()));
  ipcMain.handle(IPC.PRIVACY_CLEAR_CACHE, _wrap((_, appId) => mgr('privacyManager').clearCache(appId)));
  ipcMain.handle(IPC.PRIVACY_CLEAR_COOKIES, _wrap((_, appId) => mgr('privacyManager').clearCookies(appId)));
  ipcMain.handle(IPC.PRIVACY_STATS, _wrap(() => mgr('privacyManager').getStats()));

  // ── Kanban Board ─────────────────────────────────────────────────────
  ipcMain.handle(IPC.KANBAN_BOARD_LIST, _wrap((_, wsId) => mgr('kanbanManager').getBoards(wsId)));
  ipcMain.handle(IPC.KANBAN_BOARD_CREATE, _wrap((_, data) => mgr('kanbanManager').createBoard(data)));
  ipcMain.handle(IPC.KANBAN_BOARD_UPDATE, _wrap((_, id, changes) => mgr('kanbanManager').updateBoard(id, changes)));
  ipcMain.handle(IPC.KANBAN_BOARD_DELETE, _wrap((_, id) => mgr('kanbanManager').deleteBoard(id)));
  ipcMain.handle(IPC.KANBAN_COLUMN_LIST, _wrap((_, boardId) => mgr('kanbanManager').getColumns(boardId)));
  ipcMain.handle(IPC.KANBAN_COLUMN_CREATE, _wrap((_, data) => mgr('kanbanManager').createColumn(data)));
  ipcMain.handle(IPC.KANBAN_COLUMN_UPDATE, _wrap((_, id, changes) => mgr('kanbanManager').updateColumn(id, changes)));
  ipcMain.handle(IPC.KANBAN_COLUMN_DELETE, _wrap((_, id) => mgr('kanbanManager').deleteColumn(id)));
  ipcMain.handle(IPC.KANBAN_COLUMN_REORDER, _wrap((_, boardId, ids) => mgr('kanbanManager').reorderColumns(boardId, ids)));
  ipcMain.handle(IPC.KANBAN_CARD_LIST, _wrap((_, boardId, colId) => mgr('kanbanManager').getCards(boardId, colId)));
  ipcMain.handle(IPC.KANBAN_CARD_CREATE, _wrap((_, data) => mgr('kanbanManager').createCard(data)));
  ipcMain.handle(IPC.KANBAN_CARD_UPDATE, _wrap((_, id, changes) => mgr('kanbanManager').updateCard(id, changes)));
  ipcMain.handle(IPC.KANBAN_CARD_DELETE, _wrap((_, id) => mgr('kanbanManager').deleteCard(id)));
  ipcMain.handle(IPC.KANBAN_CARD_MOVE, _wrap((_, id, colId, order) => mgr('kanbanManager').moveCard(id, colId, order)));
  ipcMain.handle(IPC.KANBAN_CARD_REORDER, _wrap((_, colId, ids) => mgr('kanbanManager').reorderCards(colId, ids)));
  ipcMain.handle(IPC.KANBAN_CARD_COMMENT, _wrap((_, cardId, text, author) => mgr('kanbanManager').addComment(cardId, text, author)));
  ipcMain.handle(IPC.KANBAN_CARD_ASSIGN, _wrap((_, cardId, agentId) => mgr('kanbanManager').assignCard(cardId, agentId)));

  // ── Workers ──────────────────────────────────────────────────────────
  ipcMain.handle(IPC.WORKER_QUEUE_STATUS, _wrap(() => mgr('workerManager').getQueueStatus()));
  ipcMain.handle(IPC.WORKER_TASK_SUBMIT, _wrap((_, data) => mgr('workerManager').submit(data)));
  ipcMain.handle(IPC.WORKER_TASK_CANCEL, _wrap((_, id) => mgr('workerManager').cancel(id)));
  ipcMain.handle(IPC.WORKER_TASK_RETRY, _wrap((_, id) => mgr('workerManager').retry(id)));
  ipcMain.handle(IPC.WORKER_TASK_HISTORY, _wrap((_, limit) => mgr('workerManager').getHistory(limit)));
  ipcMain.handle(IPC.WORKER_LIST, _wrap(() => mgr('workerManager').getAll()));
  ipcMain.handle(IPC.WORKER_PAUSE, _wrap((_, id) => mgr('workerManager').cancel(id))); // pause = cancel current jobs
  ipcMain.handle(IPC.WORKER_RESUME, _wrap((_, id) => mgr('workerManager').retry(id)));

  // ── Cron Jobs ────────────────────────────────────────────────────────
  ipcMain.handle(IPC.CRON_JOB_LIST, _wrap(() => mgr('cronManager').getAll()));
  ipcMain.handle(IPC.CRON_JOB_CREATE, _wrap((_, data) => mgr('cronManager').create(data)));
  ipcMain.handle(IPC.CRON_JOB_UPDATE, _wrap((_, id, changes) => mgr('cronManager').update(id, changes)));
  ipcMain.handle(IPC.CRON_JOB_DELETE, _wrap((_, id) => mgr('cronManager').remove(id)));
  ipcMain.handle(IPC.CRON_JOB_TOGGLE, _wrap((_, id, enabled) => mgr('cronManager').toggle(id, enabled)));
  ipcMain.handle(IPC.CRON_JOB_RUN_NOW, _wrap((_, id) => ({ action: 'run-cron', cronJobId: id })));
  ipcMain.handle(IPC.CRON_JOB_HISTORY, _wrap((_, id) => mgr('cronManager').getHistory(id)));

  // ── Agents ──────────────────────────────────────────────────────────
  ipcMain.handle(IPC.AGENT_LIST, _wrap(() => mgr('agentManager').getAll()));
  ipcMain.handle(IPC.AGENT_REGISTER, _wrap((_, data) => mgr('agentManager').create(data)));
  ipcMain.handle(IPC.AGENT_UPDATE, _wrap((_, id, changes) => mgr('agentManager').update(id, changes)));
  ipcMain.handle(IPC.AGENT_DELETE, _wrap((_, id) => mgr('agentManager').remove(id)));
  ipcMain.handle(IPC.AGENT_DASHBOARD, _wrap(() => mgr('agentManager').getDashboard()));
  ipcMain.handle(IPC.AGENT_MODEL_LIST, _wrap(() => mgr('agentManager').getModelOptions()));

  // ── Pipeline ────────────────────────────────────────────────────────
  ipcMain.handle(IPC.PIPELINE_LIST, _wrap(() => mgr('pipelineManager').getAll()));
  ipcMain.handle(IPC.PIPELINE_CREATE, _wrap((_, data) => mgr('pipelineManager').create(data)));
  ipcMain.handle(IPC.PIPELINE_RUN, _wrap((_, id) => {
    mgr('pipelineManager').update(id, { status: 'running' });
    return { action: 'run-pipeline', pipelineId: id };
  }));
  ipcMain.handle(IPC.PIPELINE_STOP, _wrap((_, id) => mgr('pipelineManager').update(id, { status: 'idle' })));
  ipcMain.handle(IPC.PIPELINE_STATUS, _wrap((_, id) => {
    const p = mgr('pipelineManager').getById(id);
    return p ? p.status : null;
  }));
  ipcMain.handle(IPC.PIPELINE_STEP_TOGGLE, _wrap((_, id, step, enabled) => mgr('pipelineManager').toggleStep(id, step, enabled)));

  // ── Git ──────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.GIT_REPO_LIST, _wrap(() => mgr('gitManager').getAll()));
  ipcMain.handle(IPC.GIT_REPO_ADD, _wrap((_, data) => mgr('gitManager').create(data)));
  ipcMain.handle(IPC.GIT_REPO_REMOVE, _wrap((_, id) => mgr('gitManager').remove(id)));
  ipcMain.handle(IPC.GIT_STATUS, _wrap((_, id) => mgr('gitManager').getStatus(id)));
  ipcMain.handle(IPC.GIT_BRANCH_LIST, _wrap((_, id) => mgr('gitManager').getBranches(id)));
  ipcMain.handle(IPC.GIT_BRANCH_CREATE, _wrap((_, id, name, base) => mgr('gitManager').createBranch(id, name, base)));
  ipcMain.handle(IPC.GIT_DIFF, _wrap((_, id, base, head) => mgr('gitManager').getDiff(id, base, head)));
  ipcMain.handle(IPC.GIT_LOG, _wrap((_, id, count) => mgr('gitManager').getLog(id, count)));
  ipcMain.handle(IPC.GIT_COMMIT_PREPARE, _wrap((_, id, msg) => mgr('gitManager').prepareCommit(id, msg)));
  ipcMain.handle(IPC.GIT_CHANGELOG, _wrap((_, id, from, to) => mgr('gitManager').getChangelog(id, from, to)));

  // ── Legacy Hermes (backward compatible) ─────────────────────────────
  ipcMain.handle(IPC.HERMES_SERVER_STATUS, _wrap(() => {
    const { isServerRunning, getServerUrl } = require('../../server-launcher');
    return { running: isServerRunning(), url: getServerUrl() };
  }));
  ipcMain.handle(IPC.HERMES_SERVER_RESTART, _wrap(async () => {
    const { spawnServer, stopServer } = require('../../server-launcher');
    const path = require('path');
    const webuiDir = process.env.ELECTRON_DEV ? path.resolve(__dirname, '..', '..') : path.resolve(process.resourcesPath, 'webui');
    await stopServer();
    return spawnServer(webuiDir, !!process.env.ELECTRON_DEV);
  }));

  console.log('[ipc] All v2 handlers registered');
}

module.exports = { registerAll };
