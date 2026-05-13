/**
 * HermesBrowser — Tab Manager
 * Manages browser tabs with closed-tab history, suspension, and pinning.
 */
const store = require('../database/store');
const { uid } = require('../../shared/constants');

const TABS_COLLECTION = 'tabs';
const CLOSED_COLLECTION = 'closed_tabs';
const MAX_CLOSED_TABS = 50;

function getAll(workspaceId) {
  if (workspaceId) {
    return store.findAll(TABS_COLLECTION, t => t.workspaceId === workspaceId)
      .sort((a, b) => a.order - b.order);
  }
  return store.readCollection(TABS_COLLECTION);
}

function getById(id) { return store.findOne(TABS_COLLECTION, t => t.id === id); }

function getActiveTab(workspaceId) {
  const tabs = getAll(workspaceId);
  return tabs.length > 0 ? tabs[tabs.length - 1] : null;
}

function create(data) {
  const wsTabs = getAll(data.workspaceId);
  const maxOrder = wsTabs.length > 0 ? Math.max(...wsTabs.map(t => t.order)) : -1;
  const tab = {
    id: uid(),
    title: data.title || 'New Tab',
    url: data.url || 'about:blank',
    favicon: data.favicon || '',
    workspaceId: data.workspaceId,
    appShortcutId: data.appShortcutId || null,
    accountId: data.accountId || null,
    order: data.order !== undefined ? data.order : maxOrder + 1,
    isPinned: data.isPinned || false,
    isSuspended: false,
    isMuted: false,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    zoomLevel: data.zoomLevel || 1.0,
    sessionPartition: data.sessionPartition || `persist:tab_${uid()}`,
    lastAccessed: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  return store.insert(TABS_COLLECTION, tab);
}

function update(id, changes) {
  const tab = getById(id);
  if (!tab) return null;
  return store.updateById(TABS_COLLECTION, id, { ...changes, lastAccessed: new Date().toISOString() });
}

function remove(id) {
  const tab = getById(id);
  if (!tab) return null;
  // Save to closed tabs before removing
  const closed = {
    id: uid(),
    tab: { ...tab },
    closedAt: new Date().toISOString(),
    workspaceId: tab.workspaceId,
  };
  store.insert(CLOSED_COLLECTION, closed);
  // Enforce max closed tabs limit
  const allClosed = store.readCollection(CLOSED_COLLECTION)
    .filter(c => c.workspaceId === tab.workspaceId)
    .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
  if (allClosed.length > MAX_CLOSED_TABS) {
    const toRemove = allClosed.slice(MAX_CLOSED_TABS);
    for (const r of toRemove) {
      store.remove(CLOSED_COLLECTION, c => c.id === r.id);
    }
  }
  return store.removeById(TABS_COLLECTION, id);
}

function removeById(id) { return remove(id); }

function restoreClosed(workspaceId) {
  const closedList = store.findAll(CLOSED_COLLECTION, c => c.workspaceId === workspaceId)
    .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
  if (closedList.length === 0) return null;
  const mostRecent = closedList[0];
  store.remove(CLOSED_COLLECTION, c => c.id === mostRecent.id);
  // Remove the id from the old tab so we get a fresh one
  const { id, ...tabData } = mostRecent.tab;
  return create({ ...tabData, isSuspended: false });
}

function listClosed(workspaceId) {
  return store.findAll(CLOSED_COLLECTION, c => c.workspaceId === workspaceId)
    .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
}

function pin(id) { return update(id, { isPinned: true }); }
function unpin(id) { return update(id, { isPinned: false }); }
function setMuted(id, muted) { return update(id, { isMuted: muted }); }
function setSuspended(id, suspended) { return update(id, { isSuspended: suspended }); }

function suspendAllInactive(excludeIds = []) {
  const allTabs = store.readCollection(TABS_COLLECTION);
  let count = 0;
  for (const tab of allTabs) {
    if (!excludeIds.includes(tab.id) && !tab.isPinned && !tab.isSuspended) {
      store.update(TABS_COLLECTION, t => t.id === tab.id, { isSuspended: true });
      count++;
    }
  }
  return count;
}

function duplicate(id) {
  const tab = getById(id);
  if (!tab) return null;
  const { id: _, ...rest } = tab;
  return create({ ...rest, title: rest.title + ' (Copy)', isPinned: false });
}

function moveToWorkspace(id, targetWorkspaceId) {
  return update(id, { workspaceId: targetWorkspaceId });
}

function reorder(ids) {
  for (let i = 0; i < ids.length; i++) {
    store.update(TABS_COLLECTION, t => t.id === ids[i], { order: i });
  }
}

function getByWorkspace(workspaceId) { return getAll(workspaceId); }

function removeByWorkspace(workspaceId) {
  store.remove(TABS_COLLECTION, t => t.workspaceId === workspaceId);
  store.remove(CLOSED_COLLECTION, c => c.workspaceId === workspaceId);
}

module.exports = { getAll, getById, getActiveTab, create, update, remove, removeById,
  restoreClosed, listClosed, pin, unpin, setMuted, setSuspended,
  suspendAllInactive, duplicate, moveToWorkspace, reorder,
  getByWorkspace, removeByWorkspace };
