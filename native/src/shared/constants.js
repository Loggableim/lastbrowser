/**
 * LastBrowser — Shared Constants v2
 * IPC channel names, defaults, enums, helpers.
 * Expanded for full workspace browser + AI orchestration.
 */

// ── IPC Channels ────────────────────────────────────────────────────────
const IPC = {
  // ── Workspace ────────────────────────────────────────────────────────
  WORKSPACE_LIST:       'workspace:list',
  WORKSPACE_CREATE:     'workspace:create',
  WORKSPACE_UPDATE:     'workspace:update',
  WORKSPACE_DELETE:     'workspace:delete',
  WORKSPACE_PAUSE:      'workspace:pause',
  WORKSPACE_EXPORT:     'workspace:export',
  WORKSPACE_IMPORT:     'workspace:import',
  WORKSPACE_REORDER:    'workspace:reorder',
  WORKSPACE_STATS:      'workspace:stats',
  WORKSPACE_SWITCH:     'workspace:switch',

  // ── Apps (Sidebar Pinned Apps) ────────────────────────────────────────
  APP_LIST:             'app:list',
  APP_CREATE:           'app:create',
  APP_UPDATE:           'app:update',
  APP_DELETE:           'app:delete',
  APP_REORDER:          'app:reorder',
  APP_ACCOUNT_ADD:      'app:account:add',
  APP_ACCOUNT_REMOVE:   'app:account:remove',
  APP_ACCOUNT_SWITCH:   'app:account:switch',
  APP_OPEN:             'app:open',
  APP_MUTE:             'app:mute',
  APP_UNMUTE:           'app:unmute',
  APP_CLEAR_CACHE:      'app:clear-cache',
  APP_SLEEP:            'app:sleep',
  APP_WAKE:             'app:wake',
  APP_BADGE:            'app:badge',

  // ── Tabs ──────────────────────────────────────────────────────────────
  TAB_CREATE:           'tab:create',
  TAB_UPDATE:           'tab:update',
  TAB_CLOSE:            'tab:close',
  TAB_RESTORE:          'tab:restore',     // restore closed tab
  TAB_SUSPEND:          'tab:suspend',
  TAB_UNSUSPEND:        'tab:unsuspend',
  TAB_LIST:             'tab:list',
  TAB_ACTIVATE:         'tab:activate',
  TAB_PIN:              'tab:pin',
  TAB_UNPIN:            'tab:unpin',
  TAB_MUTE:             'tab:mute',
  TAB_UNMUTE:           'tab:unmute',
  TAB_NAVIGATE:         'tab:navigate',
  TAB_GO_BACK:          'tab:go-back',
  TAB_GO_FORWARD:       'tab:go-forward',
  TAB_RELOAD:           'tab:reload',
  TAB_DUPLICATE:        'tab:duplicate',
  TAB_MOVE:             'tab:move',        // move tab between workspaces
  TAB_SUSPEND_ALL:      'tab:suspend-all-inactive',

  // ── Browser Control (Agent Access) ──────────────────────────────────
  TAB_EXEC_JS:          'tab:exec-js',
  TAB_GET_CONTENT:      'tab:get-content',
  TAB_SCREENSHOT:       'tab:screenshot',
  TAB_GET_META:         'tab:get-meta',
  TAB_TITLE_CHANGED:    'tab:title-changed',
  TAB_URL_CHANGED:      'tab:url-changed',
  TAB_ACTIVATE_VIEW:    'tab:activate-view',
  TAB_DEACTIVATE_VIEW:  'tab:deactivate-view',
  TAB_CLOSE_VIEW:       'tab:close-view',

  // ── App Definitions ──────────────────────────────────────────────────
  APPDEF_LIST:          'appdef:list',
  APPDEF_PRESETS:       'appdef:presets',
  APPDEF_CREATE:        'appdef:create',
  APPDEF_SEED:          'appdef:seed',

  // ── App Accounts (Multi-Account System) ─────────────────────────────
  APPACCOUNT_LIST:          'appaccount:list',
  APPACCOUNT_LIST_BY_APP:   'appaccount:list-by-app',
  APPACCOUNT_LIST_BY_WS:    'appaccount:list-by-ws',
  APPACCOUNT_CREATE:        'appaccount:create',
  APPACCOUNT_UPDATE:        'appaccount:update',
  APPACCOUNT_DELETE:        'appaccount:delete',
  APPACCOUNT_SET_ACTIVE:    'appaccount:set-active',
  APPACCOUNT_SET_MUTED:     'appaccount:set-muted',
  APPACCOUNT_DUPLICATE:     'appaccount:duplicate',
  APPACCOUNT_MOVE_WS:       'appaccount:move-ws',
  APPACCOUNT_CLEAR_CACHE:   'appaccount:clear-cache',
  APPACCOUNT_CLEAR_COOKIES: 'appaccount:clear-cookies',
  APPACCOUNT_SET_AGENT:     'appaccount:set-agent',
  APPACCOUNT_RELEASE_AGENT: 'appaccount:release-agent',
  APPACCOUNT_RECORD_ACTION: 'appaccount:record-action',
  APPACCOUNT_UPDATE_BADGE:  'appaccount:update-badge',

  // ── Agent Browser Control ──────────────────────────────────────────
  AGENT_ASSIGN_TAB:     'agent:assign-tab',
  AGENT_RELEASE_TAB:    'agent:release-tab',
  AGENT_TAB_ACTION:     'agent:tab-action',
  AGENT_TAB_OUTPUT:     'agent:tab-output',
  AGENT_TAB_STATUS:     'agent:tab-status',

  // ── Closed Tabs History ─────────────────────────────────────────────
  CLOSED_TABS:          'closed-tabs:list',
  CLOSED_TABS_RESTORE:  'closed-tabs:restore',

  // ── Tab Sets / Sessions ──────────────────────────────────────────────
  TABSET_CREATE:        'tabset:create',
  TABSET_SAVE:          'tabset:save',
  TABSET_RESTORE:       'tabset:restore',
  TABSET_DELETE:        'tabset:delete',
  TABSET_LIST:          'tabset:list',
  TABSET_UPDATE:        'tabset:update',
  TABSET_DUPLICATE:     'tabset:duplicate',
  TABSET_EXPORT:        'tabset:export',
  TABSET_AUTOSAVE:      'tabset:autosave',

  // ── Session Agent Integration ──────────────────────────────────────
  TABSET_ASSIGN_AGENT:  'tabset:assign-agent',
  TABSET_RELEASE_AGENT: 'tabset:release-agent',
  TABSET_AGENT_ACTION:  'tabset:agent-action',
  TABSET_AGENT_SESSIONS:'tabset:agent-sessions',

  // ── Split View ───────────────────────────────────────────────────────
  SPLIT_CREATE:         'split:create',
  SPLIT_UPDATE:         'split:update',
  SPLIT_DELETE:         'split:delete',
  SPLIT_GET:            'split:get',
  SPLIT_LAYOUTS:        'split:layouts',
  SPLIT_ADD_PANEL:      'split:add-panel',
  SPLIT_REMOVE_PANEL:   'split:remove-panel',

  // ── Focus Mode ───────────────────────────────────────────────────────
  FOCUS_START:          'focus:start',
  FOCUS_STOP:           'focus:stop',
  FOCUS_PAUSE:          'focus:pause',
  FOCUS_STATUS:         'focus:status',
  FOCUS_CONFIG:         'focus:config',
  FOCUS_TOGGLE:         'focus:toggle',
  FOCUS_DISTRACTION:    'focus:distraction:rule',

  // ── Compact Mode ─────────────────────────────────────────────────────
  COMPACT_TOGGLE:       'compact:toggle',
  COMPACT_STATUS:       'compact:status',

  // ── Command Palette ──────────────────────────────────────────────────
  PALETTE_SEARCH:       'palette:search',
  PALETTE_EXECUTE:      'palette:execute',
  PALETTE_OPEN:         'palette:open',
  PALETTE_CLOSE:        'palette:close',

  // ── Settings ─────────────────────────────────────────────────────────
  SETTINGS_GET:         'settings:get',
  SETTINGS_UPDATE:      'settings:update',
  SETTINGS_RESET:       'settings:reset',
  SETTINGS_GET_KEY:     'settings:get-key',
  BACKUP_CREATE:        'backup:create',
  BACKUP_RESTORE:       'backup:restore',
  BACKUP_LIST:          'backup:list',

  // ── Notifications ────────────────────────────────────────────────────
  NOTIF_LIST:           'notification:list',
  NOTIF_DISMISS:        'notification:dismiss',
  NOTIF_CLEAR:          'notification:clear',
  NOTIF_UPDATE:         'notification:update',    // push from main
  NOTIF_MUTE_APP:       'notification:mute-app',
  NOTIF_MUTE_WS:        'notification:mute-workspace',
  NOTIF_MUTE_GLOBAL:    'notification:mute-global',

  // ── Tasks ────────────────────────────────────────────────────────────
  TASK_LIST:            'task:list',
  TASK_CREATE:          'task:create',
  TASK_UPDATE:          'task:update',
  TASK_DELETE:          'task:delete',
  TASK_REORDER:         'task:reorder',
  TASK_PIN_TO_TAB:      'task:pin-to-tab',
  TASK_UNPIN_FROM_TAB:  'task:unpin-from-tab',

  // ── Quick Actions ────────────────────────────────────────────────────
  QUICK_ACTION:         'quick:action',

  // ── Resource Saver ───────────────────────────────────────────────────
  SAVER_CONFIG:         'saver:config',
  SAVER_SLEEP_NOW:      'saver:sleep-now',
  SAVER_STATUS:         'saver:status',
  SAVER_EXCEPTION:      'saver:exception',

  // ── Privacy / Adblock ────────────────────────────────────────────────
  PRIVACY_CONFIG:       'privacy:config',
  PRIVACY_CLEAR_CACHE:  'privacy:clear-cache',
  PRIVACY_CLEAR_COOKIES:'privacy:clear-cookies',
  PRIVACY_STATS:        'privacy:stats',

  // ── Kanban Board ────────────────────────────────────────────────────
  KANBAN_BOARD_LIST:         'kanban:board:list',
  KANBAN_BOARD_CREATE:       'kanban:board:create',
  KANBAN_BOARD_UPDATE:       'kanban:board:update',
  KANBAN_BOARD_DELETE:       'kanban:board:delete',
  KANBAN_COLUMN_LIST:        'kanban:column:list',
  KANBAN_COLUMN_CREATE:      'kanban:column:create',
  KANBAN_COLUMN_UPDATE:      'kanban:column:update',
  KANBAN_COLUMN_DELETE:      'kanban:column:delete',
  KANBAN_COLUMN_REORDER:     'kanban:column:reorder',
  KANBAN_CARD_LIST:          'kanban:card:list',
  KANBAN_CARD_CREATE:        'kanban:card:create',
  KANBAN_CARD_UPDATE:        'kanban:card:update',
  KANBAN_CARD_DELETE:        'kanban:card:delete',
  KANBAN_CARD_MOVE:          'kanban:card:move',
  KANBAN_CARD_REORDER:       'kanban:card:reorder',
  KANBAN_CARD_COMMENT:       'kanban:card:comment',
  KANBAN_CARD_ASSIGN:        'kanban:card:assign',

  // ── Workers ──────────────────────────────────────────────────────────
  WORKER_QUEUE_STATUS:       'worker:queue:status',
  WORKER_TASK_SUBMIT:        'worker:task:submit',
  WORKER_TASK_CANCEL:        'worker:task:cancel',
  WORKER_TASK_RETRY:         'worker:task:retry',
  WORKER_TASK_HISTORY:       'worker:task:history',
  WORKER_LIST:               'worker:list',
  WORKER_PAUSE:              'worker:pause',
  WORKER_RESUME:             'worker:resume',

  // ── Cron / Scheduler ───────────────────────────────────────────────
  CRON_JOB_LIST:             'cron:job:list',
  CRON_JOB_CREATE:           'cron:job:create',
  CRON_JOB_UPDATE:           'cron:job:update',
  CRON_JOB_DELETE:           'cron:job:delete',
  CRON_JOB_TOGGLE:           'cron:job:toggle',
  CRON_JOB_RUN_NOW:          'cron:job:run-now',
  CRON_JOB_HISTORY:          'cron:job:history',

  // ── Agents ──────────────────────────────────────────────────────────
  AGENT_LIST:                'agent:list',
  AGENT_REGISTER:            'agent:register',
  AGENT_UPDATE:              'agent:update',
  AGENT_DELETE:              'agent:delete',
  AGENT_SPAWN:               'agent:spawn',
  AGENT_KILL:                'agent:kill',
  AGENT_LOG:                 'agent:log',
  AGENT_DASHBOARD:           'agent:dashboard',
  AGENT_MODEL_LIST:          'agent:model:list',
  AGENT_MODEL_ADD:           'agent:model:add',
  AGENT_MODEL_REMOVE:        'agent:model:remove',

  // ── Pipeline ────────────────────────────────────────────────────────
  PIPELINE_LIST:             'pipeline:list',
  PIPELINE_CREATE:           'pipeline:create',
  PIPELINE_RUN:              'pipeline:run',
  PIPELINE_STOP:             'pipeline:stop',
  PIPELINE_STATUS:           'pipeline:status',
  PIPELINE_STEP_TOGGLE:      'pipeline:step:toggle',

  // ── Git ──────────────────────────────────────────────────────────────
  GIT_STATUS:                'git:status',
  GIT_BRANCH_LIST:           'git:branch:list',
  GIT_BRANCH_CREATE:         'git:branch:create',
  GIT_DIFF:                  'git:diff',
  GIT_LOG:                   'git:log',
  GIT_REPO_ADD:              'git:repo:add',
  GIT_REPO_REMOVE:           'git:repo:remove',
  GIT_REPO_LIST:             'git:repo:list',
  GIT_COMMIT_PREPARE:        'git:commit:prepare',
  GIT_CHANGELOG:             'git:changelog',

  // ── Legacy Hermes (backward compat) ─────────────────────────────────
  HERMES_NAVIGATE:           'hermes:navigate',
  HERMES_SERVER_STATUS:      'hermes:server-status',
  HERMES_SERVER_RESTART:     'hermes:server-restart',
};

// ── Defaults ───────────────────────────────────────────────────────────
const DEFAULTS = {
  SETTINGS: {
    theme: 'dark',
    compactMode: false,
    focusMode: false,
    resourceSaver: true,
    adblockEnabled: false,
    cookieControl: 'allow_all',
    suspendTimeoutMinutes: 30,
    pomodoroDuration: 25,
    backupPath: '',
    language: 'en',
    sidebarWidth: 280,
    tabPosition: 'left',       // left, right, top
    showFavicons: true,
    hardwareAcceleration: true,
    autoUpdate: true,
    proxyEnabled: false,
    proxyUrl: '',
    telemetryEnabled: false,
    autoBackupIntervalHours: 24,
  },

  WORKSPACE: {
    name: 'New Workspace',
    icon: '💼',
    color: '#6366f1',
    isPaused: false,
    isSleeping: false,
    downloadPath: '',
    useGlobalDownloadPath: true,
    customUserAgent: '',
    focusModeEnabled: false,
    distractionRules: [],
    splitLayout: null,
    tabSetAutoSave: true,
    tabSetAutoSaveMinutes: 5,
  },

  APP: {
    name: 'New App',
    url: '',
    icon: '',
    workspaceId: null,
    order: 0,
    isMuted: false,
    isSuspended: false,
    isPinned: true,
    customUserAgent: '',
    zoomLevel: 1.0,
  },

  ACCOUNT: {
    label: 'Account',
    sessionPartition: '',
    isActive: true,
    profileColor: '#6366f1',
  },

  TAB: {
    title: 'New Tab',
    url: 'about:blank',
    favicon: '',
    isPinned: false,
    isSuspended: false,
    isMuted: false,
  },

  KANBAN_CARD: {
    title: '',
    description: '',
    priority: 'medium',     // low, medium, high, critical
    status: 'todo',          // inbox, todo, planned, in_progress, waiting, review, testing, done, archived
    labels: [],
    assignedTo: null,
    dueDate: null,
    estimatedHours: null,
    sprint: null,
  },

  AGENT: {
    name: 'New Agent',
    role: 'worker',          // project_manager, planner, researcher, coder, uiux, debugger, tester, docs, refactor, worker
    model: 'deepseek-v4-flash',
    provider: 'opencode-go',
    maxTokens: 4000,
    temperature: 0.7,
    enabled: true,
    maxConcurrentTasks: 3,
  },

  CRON_JOB: {
    name: 'New Cron Job',
    schedule: '0 3 * * *',  // daily at 3am
    taskType: 'maintenance',
    enabled: true,
    maxRetries: 3,
  },

  FOCUS_RULE: {
    pattern: '',
    action: 'block',         // block, redirect, warn
    redirectUrl: '',
    schedule: 'always',      // always, focus_mode_only, custom_schedule
  },
};

// ── Split Layout Types ─────────────────────────────────────────────────
const SPLIT_LAYOUTS = {
  FIFTY_FIFTY:       '50/50',
  SEVENTY_THIRTY:    '70/30',
  THIRTY_SEVENTY:    '30/70',
  THREE_COL:         '3-col',
  TWO_BY_TWO:        '2x2',
  FOUR_COL:          '4-col',
  SIXTY_FORTY:       '60/40',
  FORTY_SIXTY:       '40/60',
};

// ── Focus Session Types ────────────────────────────────────────────────
const FOCUS_TYPES = {
  POMODORO: 'pomodoro',     // 25 min
  FOCUS_50: 'focus-50',     // 50 min
  FOCUS_90: 'focus-90',     // 90 min
  CUSTOM: 'custom',
  BREAK_SHORT: 'break-5',   // 5 min
  BREAK_LONG: 'break-15',   // 15 min
};

// ── Card Priorities ────────────────────────────────────────────────────
const PRIORITIES = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical' };

// ── Card Statuses ──────────────────────────────────────────────────────
const CARD_STATUSES = [
  'inbox', 'todo', 'planned', 'in_progress', 'waiting', 'review', 'testing', 'done', 'archived',
];

// ── Agent Roles ────────────────────────────────────────────────────────
const AGENT_ROLES = {
  PROJECT_MANAGER:  'project_manager',
  PLANNER:          'planner',
  RESEARCHER:       'researcher',
  CODER:            'coder',
  UIUX:             'uiux',
  DEBUGGER:         'debugger',
  TESTER:           'tester',
  DOCS:             'docs',
  REFACTOR:         'refactor',
  WORKER:           'worker',
  REVIEWER:         'reviewer',
};

// ── Quick Actions ──────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { id: 'focus-start',      label: 'Start Focus',          icon: '⏱', shortcut: 'Ctrl+F' },
  { id: 'focus-stop',       label: 'Stop Focus',           icon: '⏹', shortcut: '' },
  { id: 'sleep-all',        label: 'Sleep All Inactive',   icon: '💤', shortcut: 'Ctrl+Shift+S' },
  { id: 'save-session',     label: 'Save Session',         icon: '💾', shortcut: 'Ctrl+Shift+E' },
  { id: 'toggle-compact',   label: 'Toggle Compact Mode',  icon: '🔲', shortcut: 'Ctrl+S' },
  { id: 'toggle-sidebar',   label: 'Toggle Sidebar',       icon: '📂', shortcut: 'Ctrl+B' },
  { id: 'mute-all',         label: 'Mute All Tabs',        icon: '🔇', shortcut: 'Ctrl+Shift+M' },
  { id: 'clear-cache',      label: 'Clear Cache',          icon: '🧹', shortcut: '' },
  { id: 'new-tab',          label: 'New Tab',              icon: '➕', shortcut: 'Ctrl+T' },
  { id: 'command-palette',  label: 'Command Palette',      icon: '🔍', shortcut: 'Ctrl+K' },
  { id: 'split-50',         label: 'Split 50/50',          icon: '⬛', shortcut: 'Ctrl+Alt+1' },
  { id: 'split-70-30',      label: 'Split 70/30',          icon: '⬜', shortcut: 'Ctrl+Alt+2' },
];

// ── UUID Generator ─────────────────────────────────────────────────────
let _counter = 0;
function uid() {
  _counter++;
  return `${Date.now().toString(36)}-${_counter.toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

module.exports = { IPC, DEFAULTS, SPLIT_LAYOUTS, FOCUS_TYPES, PRIORITIES, CARD_STATUSES, AGENT_ROLES, QUICK_ACTIONS, uid };
