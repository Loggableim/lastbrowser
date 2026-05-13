/**
 * HermesBrowser — Session (Tab Set) Manager
 * Save/restore groups of tabs as named sessions.
 * v2.1 — Added agent assignment + browser control support.
 */
const store = require('../database/store');
const { uid } = require('../../shared/constants');

const COLLECTION = 'tab_sets';

function getByWorkspace(workspaceId) {
  return store.findAll(COLLECTION, ts => ts.workspaceId === workspaceId)
    .sort((a, b) => a.order - b.order);
}

function getById(id) { return store.findOne(COLLECTION, ts => ts.id === id); }

function create(data) {
  const sets = getByWorkspace(data.workspaceId);
  const maxOrder = sets.length > 0 ? Math.max(...sets.map(s => s.order)) : -1;
  const tabSet = {
    id: uid(),
    name: data.name || 'New Session',
    color: data.color || '#6366f1',
    workspaceId: data.workspaceId,
    tabIds: data.tabIds || [],
    order: data.order !== undefined ? data.order : maxOrder + 1,
    isPinned: data.isPinned || false,
    // Agent integration v2.1
    assignedAgentId: data.assignedAgentId || null,
    agentControlEnabled: data.agentControlEnabled || false,
    agentLastAction: null,
    agentLastOutput: null,
    agentStatus: 'idle', // idle, running, reading, acting, error
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return store.insert(COLLECTION, tabSet);
}

function update(id, changes) {
  return store.updateById(COLLECTION, id, { ...changes, updatedAt: new Date().toISOString() });
}

function remove(id) { return store.removeById(COLLECTION, id); }

function duplicate(id) {
  const ts = getById(id);
  if (!ts) return null;
  const { id: _, createdAt, updatedAt, ...rest } = ts;
  return create({ ...rest, name: rest.name + ' (Copy)' });
}

function exportSet(id) {
  const ts = getById(id);
  if (!ts) return null;
  const tabs = store.findAll('tabs', t => ts.tabIds.includes(t.id));
  return { tabSet: { ...ts }, tabs };
}

function importSet(data, workspaceId) {
  if (!data || !data.tabSet) return null;
  const { tabSet, tabs } = data;
  const newSet = create({
    name: tabSet.name,
    color: tabSet.color,
    workspaceId,
    isPinned: tabSet.isPinned || false,
  });
  if (tabs) {
    const newIds = [];
    for (const tab of tabs) {
      const { id, ...tabData } = tab;
      const newTab = store.insert('tabs', {
        ...tabData,
        id: uid(),
        workspaceId,
        createdAt: new Date().toISOString(),
      });
      newIds.push(newTab.id);
    }
    update(newSet.id, { tabIds: newIds });
  }
  return getById(newSet.id);
}

function removeByWorkspace(workspaceId) {
  return store.remove(COLLECTION, ts => ts.workspaceId === workspaceId);
}

// ── Agent Integration ──────────────────────────────────────────────────

function assignAgent(sessionId, agentId) {
  return store.updateById(COLLECTION, sessionId, {
    assignedAgentId: agentId,
    agentControlEnabled: true,
    agentStatus: 'idle',
    updatedAt: new Date().toISOString(),
  });
}

function releaseAgent(sessionId) {
  return store.updateById(COLLECTION, sessionId, {
    assignedAgentId: null,
    agentControlEnabled: false,
    agentStatus: 'idle',
    agentLastAction: null,
    agentLastOutput: null,
    updatedAt: new Date().toISOString(),
  });
}

function recordAgentAction(sessionId, action, output, status) {
  return store.updateById(COLLECTION, sessionId, {
    agentLastAction: action,
    agentLastOutput: output,
    agentStatus: status || 'running',
    updatedAt: new Date().toISOString(),
  });
}

function getAgentSessions(agentId) {
  return store.findAll(COLLECTION, ts => ts.assignedAgentId === agentId);
}

module.exports = { getByWorkspace, getById, create, update, remove, duplicate, exportSet, importSet, removeByWorkspace,
  assignAgent, releaseAgent, recordAgentAction, getAgentSessions };
