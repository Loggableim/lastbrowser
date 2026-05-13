/**
 * HermesBrowser — Notification Manager
 * Centralized notification system with per-app/workspace/global muting.
 */
const store = require('../database/store');
const settingsManager = require('./settingsManager');
const { uid } = require('../../shared/constants');

const COLLECTION = 'notifications';
const MAX_NOTIFICATIONS = 200;

function getAll() {
  return store.readCollection(COLLECTION)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function getUnreadCount() {
  return store.count(COLLECTION, n => !n.isRead);
}

function add(data) {
  const notif = {
    id: uid(),
    appId: data.appId || '',
    appName: data.appName || '',
    title: data.title || '',
    body: data.body || '',
    icon: data.icon || '',
    type: data.type || 'info',
    isRead: false,
    timestamp: new Date().toISOString(),
  };
  store.insert(COLLECTION, notif);
  
  // Enforce max limit
  const all = store.readCollection(COLLECTION)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  if (all.length > MAX_NOTIFICATIONS) {
    const toRemove = all.slice(MAX_NOTIFICATIONS);
    for (const r of toRemove) {
      store.remove(COLLECTION, n => n.id === r.id);
    }
  }
  return notif;
}

function dismiss(id) { return store.removeById(COLLECTION, id); }

function dismissAll() {
  return store.remove(COLLECTION, () => true);
}

function markRead(id) {
  return store.updateById(COLLECTION, id, { isRead: true });
}

function markAllRead() {
  return store.update(COLLECTION, () => true, { isRead: true });
}

// ── Muting ───────────────────────────────────────────────────────────

function getMuteConfig() {
  return {
    mutedApps: settingsManager.get('mutedApps') || [],
    mutedWorkspaces: settingsManager.get('mutedWorkspaces') || [],
    globalMuted: settingsManager.get('globalMuted') || false,
  };
}

function muteApp(appId, muted) {
  const config = getMuteConfig();
  if (muted && !config.mutedApps.includes(appId)) {
    config.mutedApps.push(appId);
  } else if (!muted) {
    config.mutedApps = config.mutedApps.filter(id => id !== appId);
  }
  settingsManager.update({ mutedApps: config.mutedApps });
}

function muteWorkspace(workspaceId, muted) {
  const config = getMuteConfig();
  if (muted && !config.mutedWorkspaces.includes(workspaceId)) {
    config.mutedWorkspaces.push(workspaceId);
  } else if (!muted) {
    config.mutedWorkspaces = config.mutedWorkspaces.filter(id => id !== workspaceId);
  }
  settingsManager.update({ mutedWorkspaces: config.mutedWorkspaces });
}

function muteGlobal(muted) {
  settingsManager.update({ globalMuted: muted });
}

function isMuted(appId, workspaceId) {
  const config = getMuteConfig();
  if (config.globalMuted) return true;
  if (config.mutedApps.includes(appId)) return true;
  if (config.mutedWorkspaces.includes(workspaceId)) return true;
  return false;
}

function getNotifications(workspaceId) {
  return getAll();
}

module.exports = { getAll, getUnreadCount, add, dismiss, dismissAll,
  markRead, markAllRead, muteApp, muteWorkspace, muteGlobal, isMuted, getNotifications };
