/**
 * HermesBrowser — Command Palette / Global Search
 * Fuzzy search across workspaces, apps, tabs, sessions, commands, settings, and tasks.
 * Ctrl+K to open.
 */
const { QUICK_ACTIONS } = require('../../shared/constants');

let _managers = null;
function getManagers() {
  if (!_managers) {
    _managers = {
      workspace: require('./workspaceManager'),
      app: require('./appManager'),
      tab: require('./tabManager'),
      session: require('./sessionManager'),
      task: require('./taskManager'),
      settings: require('./settingsManager'),
    };
  }
  return _managers;
}

function _fuzzyScore(query, text) {
  if (!query || !text) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  // Exact match -> highest score
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;
  // Character match (fuzzy)
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  if (qi === q.length) return 40 - (t.length - q.length);
  return 0;
}

function _getStaticCommands() {
  const focusManager = require('./focusManager');
  const compactManager = require('./compactManager');
  const isFocusActive = focusManager.getStatus().active;

  return QUICK_ACTIONS.map(cmd => ({
    id: `cmd:${cmd.id}`,
    type: 'command',
    label: cmd.label,
    description: cmd.shortcut ? `Shortcut: ${cmd.shortcut}` : '',
    icon: cmd.icon,
    action: cmd.id,
    shortcut: cmd.shortcut,
    score: 0,
  }));
}

function search(query) {
  if (!query || query.trim().length === 0) return _getStaticCommands().slice(0, 20);
  const q = query.trim();
  const mgr = getManagers();
  const results = [];

  // 1. Static commands
  for (const cmd of _getStaticCommands()) {
    const score = _fuzzyScore(q, cmd.label);
    if (score > 0) results.push({ ...cmd, score });
  }

  // 2. Workspaces
  for (const ws of mgr.workspace.getAll()) {
    const score = _fuzzyScore(q, ws.name);
    if (score > 0) results.push({
      id: `ws:${ws.id}`,
      type: 'workspace',
      label: ws.name,
      description: `${ws.icon} Workspace`,
      icon: ws.icon,
      action: { type: 'switchWorkspace', workspaceId: ws.id },
      score,
    });
  }

  // 3. Apps
  for (const app of mgr.app.getAll()) {
    const score = _fuzzyScore(q, app.name);
    if (score > 0) results.push({
      id: `app:${app.id}`,
      type: 'app',
      label: app.name,
      description: app.url,
      icon: app.icon || '🌐',
      action: { type: 'openApp', appId: app.id },
      score,
    });
  }

  // 4. Tabs
  for (const tab of mgr.tab.getAll()) {
    const titleScore = _fuzzyScore(q, tab.title);
    const urlScore = _fuzzyScore(q, tab.url);
    const score = Math.max(titleScore, urlScore * 0.8);
    if (score > 0) results.push({
      id: `tab:${tab.id}`,
      type: 'tab',
      label: tab.title || tab.url,
      description: tab.url,
      icon: tab.favicon || '📄',
      action: { type: 'switchTab', tabId: tab.id },
      score,
    });
  }

  // 5. Sessions — use store directly for cross-workspace search
  const allSessions = require('../database/store').readCollection('tab_sets');
  for (const ses of allSessions) {
    const score = _fuzzyScore(q, ses.name);
    if (score > 0) results.push({
      id: `session:${ses.id}`,
      type: 'session',
      label: ses.name,
      description: `Session (${ses.tabIds?.length || 0} tabs)`,
      icon: '💾',
      action: { type: 'restoreSession', sessionId: ses.id },
      score,
    });
  }

  // 6. Settings
  const settingsKeys = ['theme', 'compactMode', 'focusMode', 'resourceSaver', 'adblockEnabled',
    'cookieControl', 'suspendTimeoutMinutes', 'pomodoroDuration', 'sidebarWidth', 'language',
    'proxyEnabled', 'telemetryEnabled', 'autoBackupIntervalHours'];
  for (const key of settingsKeys) {
    const score = _fuzzyScore(q, key.replace(/([A-Z])/g, ' $1').trim().toLowerCase());
    if (score > 0) results.push({
      id: `setting:${key}`,
      type: 'setting',
      label: key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()),
      description: `Setting: ${key}`,
      icon: '⚙',
      action: { type: 'openSetting', settingKey: key },
      score,
    });
  }

  // 7. Tasks — use store directly for cross-workspace search
  const allTasks = require('../database/store').readCollection('tasks');
  for (const task of allTasks) {
    const score = _fuzzyScore(q, task.title);
    if (score > 0 && !task.isCompleted) results.push({
      id: `task:${task.id}`,
      type: 'task',
      label: task.title,
      description: task.priority ? `[${task.priority}] ${task.description || ''}` : task.description || '',
      icon: '📋',
      action: { type: 'openTask', taskId: task.id },
      score,
    });
  }

  // Sort by score descending, limit to 30
  return results.sort((a, b) => b.score - a.score).slice(0, 30);
}

function execute(result) {
  if (!result || !result.action) return null;
  return result.action;
}

function getCommands() {
  return _getStaticCommands();
}

module.exports = { search, execute, getCommands };
