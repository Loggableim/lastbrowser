/**
 * LastBrowser v2 — Preload Script
 *
 * Exposes secure APIs to the renderer via contextBridge.
 * Backward compatible: window.hermes (legacy) + window.lastbrowser (new v2 API).
 *
 * Security: contextIsolation=true, nodeIntegration=false.
 * All renderer-to-main communication goes through these bridges.
 */
const { contextBridge, ipcRenderer } = require('electron');
const { IPC } = require('./src/shared/constants');

// ═══════════════════════════════════════════════════════════════════════
// Legacy Hermes API (backward compatible — DO NOT REMOVE)
// ═══════════════════════════════════════════════════════════════════════
contextBridge.exposeInMainWorld('hermes', {
  getServerUrl: () => ipcRenderer.invoke('hermes:get-server-url'),
  getVersion: () => ipcRenderer.invoke('hermes:get-version'),
  getWebuiDir: () => ipcRenderer.invoke('hermes:get-webui-dir'),
  isDev: () => ipcRenderer.invoke('hermes:is-dev'),
  serverStatus: () => ipcRenderer.invoke(IPC.HERMES_SERVER_STATUS),
  serverRestart: () => ipcRenderer.invoke(IPC.HERMES_SERVER_RESTART),
  navigate: (route) => ipcRenderer.send('hermes:navigate', route),
  minimize: () => ipcRenderer.send('hermes:minimize'),
  maximize: () => ipcRenderer.send('hermes:maximize'),
  close: () => ipcRenderer.send('hermes:close'),
  toggleSidebar: () => ipcRenderer.send('hermes:toggle-sidebar'),
});

// ═══════════════════════════════════════════════════════════════════════
// LastBrowser v2 API — full workspace browser
// ═══════════════════════════════════════════════════════════════════════
function _invoke(channel) {
  return (...args) => ipcRenderer.invoke(channel, ...args);
}

function _send(channel) {
  return (...args) => ipcRenderer.send(channel, ...args);
}

function _on(channel) {
  return (callback) => {
    const handler = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

function _invokeWith(channel) {
  return (first, ...rest) => ipcRenderer.invoke(channel, first, ...rest);
}

contextBridge.exposeInMainWorld('browser', {
  // ── Workspaces ─────────────────────────────────────────────────────
  workspaces: {
    list: _invoke(IPC.WORKSPACE_LIST),
    create: _invoke(IPC.WORKSPACE_CREATE),
    update: _invokeWith(IPC.WORKSPACE_UPDATE),
    remove: _invoke(IPC.WORKSPACE_DELETE),
    setPaused: _invokeWith(IPC.WORKSPACE_PAUSE),
    export: _invoke(IPC.WORKSPACE_EXPORT),
    import: _invoke(IPC.WORKSPACE_IMPORT),
    reorder: _invoke(IPC.WORKSPACE_REORDER),
    stats: _invoke(IPC.WORKSPACE_STATS),
    switch: _invoke(IPC.WORKSPACE_SWITCH),
  },

  // ── Apps (Pinned Sidebar Apps) ────────────────────────────────────
  apps: {
    list: _invoke(IPC.APP_LIST),
    create: _invoke(IPC.APP_CREATE),
    update: _invokeWith(IPC.APP_UPDATE),
    remove: _invoke(IPC.APP_DELETE),
    reorder: _invoke(IPC.APP_REORDER),
    setCollapsed: _invokeWith(IPC.APP_UPDATE), // uses update
    // Legacy backward-compat methods
    open: _invoke(IPC.APP_OPEN),
    mute: _invoke(IPC.APP_MUTE),
    unmute: _invoke(IPC.APP_UNMUTE),
    clearCache: _invoke(IPC.APP_CLEAR_CACHE),
    sleep: _invoke(IPC.APP_SLEEP),
    wake: _invoke(IPC.APP_WAKE),
    updateBadge: _invokeWith(IPC.APP_BADGE),
  },

  // ── App Definitions (Presets/Groups) ──────────────────────────────
  appDefinitions: {
    list: _invoke(IPC.APPDEF_LIST),
    presets: _invoke(IPC.APPDEF_PRESETS),
    create: _invoke(IPC.APPDEF_CREATE),
    seed: _invoke(IPC.APPDEF_SEED),
  },

  // ── App Accounts (Multi-Account System) ───────────────────────────
  appAccounts: {
    list: _invoke(IPC.APPACCOUNT_LIST),
    listByApp: _invoke(IPC.APPACCOUNT_LIST_BY_APP),
    listByWorkspace: _invoke(IPC.APPACCOUNT_LIST_BY_WS),
    create: _invoke(IPC.APPACCOUNT_CREATE),
    update: _invokeWith(IPC.APPACCOUNT_UPDATE),
    remove: _invoke(IPC.APPACCOUNT_DELETE),
    setActive: _invoke(IPC.APPACCOUNT_SET_ACTIVE),
    setMuted: _invokeWith(IPC.APPACCOUNT_SET_MUTED),
    duplicate: _invoke(IPC.APPACCOUNT_DUPLICATE),
    moveToWorkspace: _invokeWith(IPC.APPACCOUNT_MOVE_WS),
    clearCache: _invoke(IPC.APPACCOUNT_CLEAR_CACHE),
    clearCookies: _invoke(IPC.APPACCOUNT_CLEAR_COOKIES),
    setAgent: _invokeWith(IPC.APPACCOUNT_SET_AGENT),
    releaseAgent: _invoke(IPC.APPACCOUNT_RELEASE_AGENT),
    recordAction: _invokeWith(IPC.APPACCOUNT_RECORD_ACTION),
    updateBadge: _invokeWith(IPC.APPACCOUNT_UPDATE_BADGE),
  },

  // ── Tabs ──────────────────────────────────────────────────────────
  tabs: {
    list: _invoke(IPC.TAB_LIST),
    create: _invoke(IPC.TAB_CREATE),
    update: _invokeWith(IPC.TAB_UPDATE),
    close: _invoke(IPC.TAB_CLOSE),
    restore: _invoke(IPC.TAB_RESTORE),
    suspend: _invoke(IPC.TAB_SUSPEND),
    unsuspend: _invoke(IPC.TAB_UNSUSPEND),
    activate: _invoke(IPC.TAB_ACTIVATE),
    pin: _invoke(IPC.TAB_PIN),
    unpin: _invoke(IPC.TAB_UNPIN),
    mute: _invoke(IPC.TAB_MUTE),
    unmute: _invoke(IPC.TAB_UNMUTE),
    duplicate: _invoke(IPC.TAB_DUPLICATE),
    move: _invokeWith(IPC.TAB_MOVE),
    suspendAll: _invoke(IPC.TAB_SUSPEND_ALL),
    reload: _invoke(IPC.TAB_RELOAD),
    navigate: _invokeWith(IPC.TAB_NAVIGATE),
    goBack: _invoke(IPC.TAB_GO_BACK),
    goForward: _invoke(IPC.TAB_GO_FORWARD),
    // View management
    activateView: _invokeWith(IPC.TAB_ACTIVATE_VIEW),
    deactivateView: _invoke(IPC.TAB_DEACTIVATE_VIEW),
    closeView: _invoke(IPC.TAB_CLOSE_VIEW),
    // Closed tabs
    closedList: _invoke(IPC.CLOSED_TABS),
    closedRestore: _invoke(IPC.CLOSED_TABS_RESTORE),
  },

  // ── Sessions / Tab Sets ───────────────────────────────────────────
  sessions: {
    list: _invoke(IPC.TABSET_LIST),
    create: _invoke(IPC.TABSET_CREATE),
    save: _invokeWith(IPC.TABSET_SAVE),
    restore: _invoke(IPC.TABSET_RESTORE),
    remove: _invoke(IPC.TABSET_DELETE),
    update: _invokeWith(IPC.TABSET_UPDATE),
    duplicate: _invoke(IPC.TABSET_DUPLICATE),
    export: _invoke(IPC.TABSET_EXPORT),
    // Agent integration
    assignAgent: _invokeWith(IPC.TABSET_ASSIGN_AGENT),
    releaseAgent: _invoke(IPC.TABSET_RELEASE_AGENT),
    recordAction: _invokeWith(IPC.TABSET_AGENT_ACTION),
    getAgentSessions: _invoke(IPC.TABSET_AGENT_SESSIONS),
  },

  // ── Split View ────────────────────────────────────────────────────
  splitView: {
    get: _invoke(IPC.SPLIT_GET),
    create: _invokeWith(IPC.SPLIT_CREATE),
    update: _invokeWith(IPC.SPLIT_UPDATE),
    remove: _invoke(IPC.SPLIT_DELETE),
    addPanel: _invokeWith(IPC.SPLIT_ADD_PANEL),
    removePanel: _invokeWith(IPC.SPLIT_REMOVE_PANEL),
    layouts: _invoke(IPC.SPLIT_LAYOUTS),
  },

  // ── Focus Mode ────────────────────────────────────────────────────
  focus: {
    start: _invokeWith(IPC.FOCUS_START),
    stop: _invoke(IPC.FOCUS_STOP),
    pause: _invoke(IPC.FOCUS_PAUSE),
    status: _invoke(IPC.FOCUS_STATUS),
    config: _invoke(IPC.FOCUS_CONFIG),
    toggle: _invoke(IPC.FOCUS_TOGGLE),
    distraction: _invokeWith(IPC.FOCUS_DISTRACTION),
  },

  // ── Compact Mode ──────────────────────────────────────────────────
  compact: {
    toggle: _invoke(IPC.COMPACT_TOGGLE),
    status: _invoke(IPC.COMPACT_STATUS),
  },

  // ── Command Palette ───────────────────────────────────────────────
  palette: {
    search: _invoke(IPC.PALETTE_SEARCH),
    execute: _invoke(IPC.PALETTE_EXECUTE),
  },

  // ── Settings ──────────────────────────────────────────────────────
  settings: {
    getAll: _invoke(IPC.SETTINGS_GET),
    get: _invoke(IPC.SETTINGS_GET_KEY),
    update: _invoke(IPC.SETTINGS_UPDATE),
    reset: _invoke(IPC.SETTINGS_RESET),
    backup: _invoke(IPC.BACKUP_CREATE),
    restore: _invoke(IPC.BACKUP_RESTORE),
    listBackups: _invoke(IPC.BACKUP_LIST),
  },

  // ── Notifications ─────────────────────────────────────────────────
  notifications: {
    list: _invoke(IPC.NOTIF_LIST),
    dismiss: _invoke(IPC.NOTIF_DISMISS),
    clear: _invoke(IPC.NOTIF_CLEAR),
    add: _invoke(IPC.NOTIF_UPDATE),
    muteApp: _invokeWith(IPC.NOTIF_MUTE_APP),
    muteWorkspace: _invokeWith(IPC.NOTIF_MUTE_WS),
    muteGlobal: _invoke(IPC.NOTIF_MUTE_GLOBAL),
  },

  // ── Tasks ─────────────────────────────────────────────────────────
  tasks: {
    list: _invoke(IPC.TASK_LIST),
    create: _invoke(IPC.TASK_CREATE),
    update: _invokeWith(IPC.TASK_UPDATE),
    remove: _invoke(IPC.TASK_DELETE),
    reorder: _invoke(IPC.TASK_REORDER),
    pinToTab: _invokeWith(IPC.TASK_PIN_TO_TAB),
    unpinFromTab: _invoke(IPC.TASK_UNPIN_FROM_TAB),
  },

  // ── Quick Actions ────────────────────────────────────────────────
  quickAction: _invoke(IPC.QUICK_ACTION),

  // ── Browser Control (Agent Access) ────────────────────────────────
  browserControl: {
    execJS: _invokeWith(IPC.TAB_EXEC_JS),
    getContent: _invoke(IPC.TAB_GET_CONTENT),
    screenshot: _invoke(IPC.TAB_SCREENSHOT),
    getMeta: _invoke(IPC.TAB_GET_META),
    tabAction: _invokeWith(IPC.AGENT_TAB_ACTION),
  },

  // ── Agent Session Management ─────────────────────────────────────
  agentSessions: {
    assignTab: _invokeWith(IPC.AGENT_ASSIGN_TAB),
    tabAction: _invokeWith(IPC.AGENT_TAB_ACTION),
  },

  // ── Resource Saver ────────────────────────────────────────────────
  resourceSaver: {
    config: _invoke(IPC.SAVER_CONFIG),
    sleepNow: _invoke(IPC.SAVER_SLEEP_NOW),
    status: _invoke(IPC.SAVER_STATUS),
    exception: _invokeWith(IPC.SAVER_EXCEPTION),
  },

  // ── Privacy ────────────────────────────────────────────────────────
  privacy: {
    config: _invoke(IPC.PRIVACY_CONFIG),
    clearCache: _invoke(IPC.PRIVACY_CLEAR_CACHE),
    clearCookies: _invoke(IPC.PRIVACY_CLEAR_COOKIES),
    stats: _invoke(IPC.PRIVACY_STATS),
  },

  // ── Kanban Board ──────────────────────────────────────────────────
  kanban: {
    boards: {
      list: _invoke(IPC.KANBAN_BOARD_LIST),
      create: _invoke(IPC.KANBAN_BOARD_CREATE),
      update: _invokeWith(IPC.KANBAN_BOARD_UPDATE),
      remove: _invoke(IPC.KANBAN_BOARD_DELETE),
    },
    columns: {
      list: _invoke(IPC.KANBAN_COLUMN_LIST),
      create: _invoke(IPC.KANBAN_COLUMN_CREATE),
      update: _invokeWith(IPC.KANBAN_COLUMN_UPDATE),
      remove: _invoke(IPC.KANBAN_COLUMN_DELETE),
      reorder: _invokeWith(IPC.KANBAN_COLUMN_REORDER),
    },
    cards: {
      list: _invokeWith(IPC.KANBAN_CARD_LIST),
      create: _invoke(IPC.KANBAN_CARD_CREATE),
      update: _invokeWith(IPC.KANBAN_CARD_UPDATE),
      remove: _invoke(IPC.KANBAN_CARD_DELETE),
      move: _invokeWith(IPC.KANBAN_CARD_MOVE),
      reorder: _invokeWith(IPC.KANBAN_CARD_REORDER),
      comment: _invokeWith(IPC.KANBAN_CARD_COMMENT),
      assign: _invokeWith(IPC.KANBAN_CARD_ASSIGN),
    },
  },

  // ── Workers ───────────────────────────────────────────────────────
  workers: {
    queueStatus: _invoke(IPC.WORKER_QUEUE_STATUS),
    submit: _invoke(IPC.WORKER_TASK_SUBMIT),
    cancel: _invoke(IPC.WORKER_TASK_CANCEL),
    retry: _invoke(IPC.WORKER_TASK_RETRY),
    history: _invoke(IPC.WORKER_TASK_HISTORY),
    list: _invoke(IPC.WORKER_LIST),
  },

  // ── Cron Jobs ─────────────────────────────────────────────────────
  cron: {
    list: _invoke(IPC.CRON_JOB_LIST),
    create: _invoke(IPC.CRON_JOB_CREATE),
    update: _invokeWith(IPC.CRON_JOB_UPDATE),
    remove: _invoke(IPC.CRON_JOB_DELETE),
    toggle: _invokeWith(IPC.CRON_JOB_TOGGLE),
    runNow: _invoke(IPC.CRON_JOB_RUN_NOW),
    history: _invoke(IPC.CRON_JOB_HISTORY),
  },

  // ── AI Agents ─────────────────────────────────────────────────────
  agents: {
    list: _invoke(IPC.AGENT_LIST),
    register: _invoke(IPC.AGENT_REGISTER),
    update: _invokeWith(IPC.AGENT_UPDATE),
    remove: _invoke(IPC.AGENT_DELETE),
    dashboard: _invoke(IPC.AGENT_DASHBOARD),
    modelList: _invoke(IPC.AGENT_MODEL_LIST),
  },

  // ── Pipeline ──────────────────────────────────────────────────────
  pipelines: {
    list: _invoke(IPC.PIPELINE_LIST),
    create: _invoke(IPC.PIPELINE_CREATE),
    run: _invoke(IPC.PIPELINE_RUN),
    stop: _invoke(IPC.PIPELINE_STOP),
    status: _invoke(IPC.PIPELINE_STATUS),
    toggleStep: _invokeWith(IPC.PIPELINE_STEP_TOGGLE),
  },

  // ── Git ───────────────────────────────────────────────────────────
  git: {
    repos: {
      list: _invoke(IPC.GIT_REPO_LIST),
      add: _invoke(IPC.GIT_REPO_ADD),
      remove: _invoke(IPC.GIT_REPO_REMOVE),
    },
    status: _invoke(IPC.GIT_STATUS),
    branches: {
      list: _invoke(IPC.GIT_BRANCH_LIST),
      create: _invokeWith(IPC.GIT_BRANCH_CREATE),
    },
    diff: _invokeWith(IPC.GIT_DIFF),
    log: _invokeWith(IPC.GIT_LOG),
    commit: _invokeWith(IPC.GIT_COMMIT_PREPARE),
    changelog: _invokeWith(IPC.GIT_CHANGELOG),
  },

  // ── Skills (from filesystem via IPC) ──────────────────────────────
  skills: {
    list: _invoke('skills:list'),
    detail: _invoke('skills:detail'),
  },

  // ── Backend URL (Legacy WebUI) ────────────────────────────────────
  getBackendUrl: _invoke('hermes:get-server-url'),

  // ── Event listeners (for push notifications from main) ────────────
  on: (channel, callback) => {
    const allowed = ['notification:update', 'focus:tick', 'worker:progress', 'saver:alert'];
    if (allowed.includes(channel)) {
      return _on(channel)(callback);
    }
    console.warn(`[preload] Blocked event listener: ${channel}`);
    return () => {};
  },
});

console.log('[preload] LastBrowser v2 APIs exposed');
