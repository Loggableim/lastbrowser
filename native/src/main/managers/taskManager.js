/**
 * HermesBrowser — Task Manager
 * Per-workspace task lists with pin-to-tab support.
 */
const store = require('../database/store');
const { uid } = require('../../shared/constants');

const COLLECTION = 'tasks';

function getByWorkspace(workspaceId) {
  return store.findAll(COLLECTION, t => t.workspaceId === workspaceId)
    .sort((a, b) => a.order - b.order);
}

function getById(id) { return store.findOne(COLLECTION, t => t.id === id); }

function create(data) {
  const tasks = getByWorkspace(data.workspaceId);
  const maxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.order)) : -1;
  const task = {
    id: uid(),
    title: data.title,
    description: data.description || '',
    workspaceId: data.workspaceId,
    pinnedToTabId: data.pinnedToTabId || null,
    pinnedToAppId: data.pinnedToAppId || null,
    isCompleted: false,
    order: data.order !== undefined ? data.order : maxOrder + 1,
    priority: data.priority || 'medium',
    dueDate: data.dueDate || null,
    assignedTo: data.assignedTo || null,
    labels: data.labels || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return store.insert(COLLECTION, task);
}

function update(id, changes) {
  return store.updateById(COLLECTION, id, { ...changes, updatedAt: new Date().toISOString() });
}

function remove(id) { return store.removeById(COLLECTION, id); }

function setCompleted(id, completed) {
  return update(id, { isCompleted: completed });
}

function reorder(ids) {
  for (let i = 0; i < ids.length; i++) {
    store.update(COLLECTION, t => t.id === ids[i], { order: i });
  }
  return ids.map(id => getById(id)).filter(Boolean);
}

function pinToTab(taskId, tabId) {
  return update(taskId, { pinnedToTabId: tabId });
}

function unpinFromTab(taskId) {
  return update(taskId, { pinnedToTabId: null });
}

function getByTab(tabId) {
  return store.findAll(COLLECTION, t => t.pinnedToTabId === tabId);
}

function removeByWorkspace(workspaceId) {
  return store.remove(COLLECTION, t => t.workspaceId === workspaceId);
}

module.exports = { getByWorkspace, getById, create, update, remove,
  setCompleted, reorder, pinToTab, unpinFromTab, getByTab, removeByWorkspace };
