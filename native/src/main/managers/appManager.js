/**
 * HermesBrowser — App Shortcut Manager v2.2
 * Manages pinned web apps. Each app links to a global AppDefinition
 * and can have multiple AppAccounts with isolated sessions.
 */
const store = require('../database/store');
const { uid } = require('../../shared/constants');

const COLLECTION = 'apps';

function getAll() { return store.readCollection(COLLECTION); }

function getByWorkspace(workspaceId) {
  return store.findAll(COLLECTION, a => a.workspaceId === workspaceId)
    .sort((a, b) => a.order - b.order);
}

function getById(id) { return store.findOne(COLLECTION, a => a.id === id); }

function getByDefinition(defId) {
  return store.findAll(COLLECTION, a => a.appDefinitionId === defId);
}

function create(data) {
  const all = getByWorkspace(data.workspaceId);
  const maxOrder = all.length > 0 ? Math.max(...all.map(a => a.order)) : -1;
  const app = {
    id: uid(),
    name: data.name || 'New App',
    baseUrl: data.baseUrl || data.url || '',
    icon: data.icon || '🌐',
    appDefinitionId: data.appDefinitionId || null,
    workspaceId: data.workspaceId,
    order: data.order !== undefined ? data.order : maxOrder + 1,
    isMuted: false,
    isSuspended: false,
    category: data.category || 'other',
    color: data.color || '#6366f1',
    collapsed: data.collapsed !== undefined ? data.collapsed : false,
  };
  return store.insert(COLLECTION, app);
}

function update(id, changes) {
  return store.updateById(COLLECTION, id, changes);
}

function remove(id) {
  const removed = store.removeById(COLLECTION, id);
  if (removed) {
    // Cascade delete app_accounts for this app
    store.remove('app_accounts', acct => acct.appId === id);
  }
  return removed;
}

function reorder(ids) {
  for (let i = 0; i < ids.length; i++) {
    store.update(COLLECTION, a => a.id === ids[i], { order: i });
  }
  return ids.map(id => getById(id)).filter(Boolean);
}

function setCollapsed(id, collapsed) {
  return update(id, { collapsed });
}

function removeByWorkspace(workspaceId) {
  const apps = getByWorkspace(workspaceId);
  for (const app of apps) {
    store.remove('app_accounts', a => a.appId === app.id);
    store.remove(COLLECTION, a => a.id === app.id);
  }
}

module.exports = { getAll, getByWorkspace, getById, getByDefinition, create, update, remove,
  reorder, setCollapsed, removeByWorkspace };
