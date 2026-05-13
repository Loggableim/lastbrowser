/**
 * HermesBrowser — Account Manager v2.2
 * Manages multiple accounts per app with isolated session partitions.
 * Supports agent control, notifications, mute, and workspace routing.
 */
const { session } = require('electron');
const store = require('../database/store');
const { uid } = require('../../shared/constants');

const COLLECTION = 'app_accounts';

function getByApp(appId) {
  return store.findAll(COLLECTION, a => a.appId === appId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

function getByWorkspace(workspaceId) {
  return store.findAll(COLLECTION, a => a.workspaceId === workspaceId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

function getById(id) { return store.findOne(COLLECTION, a => a.id === id); }

function getByAgent(agentId) {
  return store.findAll(COLLECTION, a => a.assignedAgentId === agentId);
}

function create(data) {
  const partitionName = createPartition();
  const account = {
    id: uid(),
    appId: data.appId || null,
    appDefinitionId: data.appDefinitionId || null,
    displayName: data.displayName || data.label || 'Account',
    accountLabel: data.accountLabel || '',
    baseUrl: data.baseUrl || '',
    color: data.color || '#6366f1',
    iconOverride: data.iconOverride || '',
    sessionPartition: data.sessionPartition || partitionName,
    workspaceId: data.workspaceId || null,
    order: data.order || 0,
    muted: data.muted || false,
    notificationsEnabled: data.notificationsEnabled !== false,
    badgeCount: data.badgeCount || 0,
    lastActiveAt: data.lastActiveAt || null,
    // Agent integration
    assignedAgentId: data.assignedAgentId || null,
    agentControlEnabled: data.agentControlEnabled || false,
    agentStatus: data.agentStatus || 'idle',
    agentLastAction: data.agentLastAction || null,
    agentLastOutput: data.agentLastOutput || null,
    // Session
    lastUrl: data.lastUrl || '',
    sharedSession: data.sharedSession || false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return store.insert(COLLECTION, account);
}

function update(id, changes) {
  return store.updateById(COLLECTION, id, { ...changes, updatedAt: new Date().toISOString() });
}

function remove(id) {
  const acct = getById(id);
  if (acct) {
    destroyPartition(acct.sessionPartition);
  }
  return store.removeById(COLLECTION, id);
}

function setActive(id) {
  const acct = getById(id);
  if (!acct) return null;
  return store.updateById(COLLECTION, id, { lastActiveAt: new Date().toISOString() });
}

function setMuted(id, muted) {
  return update(id, { muted });
}

function updateBadge(id, count) {
  return update(id, { badgeCount: count });
}

function setAgent(id, agentId) {
  return update(id, {
    assignedAgentId: agentId,
    agentControlEnabled: !!agentId,
    agentStatus: agentId ? 'idle' : 'idle',
    updatedAt: new Date().toISOString(),
  });
}

function releaseAgent(id) {
  return update(id, {
    assignedAgentId: null,
    agentControlEnabled: false,
    agentStatus: 'idle',
    agentLastAction: null,
    agentLastOutput: null,
  });
}

function recordAgentAction(id, action, output, status) {
  return update(id, {
    agentLastAction: action,
    agentLastOutput: output,
    agentStatus: status || 'running',
  });
}

function duplicate(id) {
  const acct = getById(id);
  if (!acct) return null;
  const { id: _, createdAt, updatedAt, sessionPartition, ...rest } = acct;
  return create({
    ...rest,
    displayName: acct.displayName + ' (Copy)',
    assignedAgentId: null,
    agentControlEnabled: false,
    agentStatus: 'idle',
    agentLastAction: null,
    agentLastOutput: null,
    muted: true, // mute duplicates by default
  });
}

function moveToWorkspace(id, targetWorkspaceId) {
  return update(id, { workspaceId: targetWorkspaceId });
}

function removeByWorkspace(workspaceId) {
  const accounts = getByWorkspace(workspaceId);
  for (const acct of accounts) {
    remove(acct.id);
  }
}

// ── Session Partition Helpers ─────────────────────────────────────────

function createPartition() {
  const suffix = uid();
  const name = `persist:appaccount_${suffix}`;
  try {
    session.fromPartition(name);
  } catch (err) {
    // Graceful fallback outside Electron
  }
  return name;
}

function destroyPartition(partitionName) {
  if (!partitionName) return;
  try {
    if (session && session.fromPartition) {
      // Electron: partition cleanup happens on app quit
    }
  } catch (_) {}
}

// ── Clear data per account ──────────────────────────────────────────

function clearCache(id) {
  const acct = getById(id);
  if (!acct) return null;
  try {
    const ses = session.fromPartition(acct.sessionPartition);
    ses.clearCache();
    return true;
  } catch (_) { return false; }
}

function clearCookies(id) {
  const acct = getById(id);
  if (!acct) return null;
  try {
    const ses = session.fromPartition(acct.sessionPartition);
    ses.clearStorageData({ storages: ['cookies'] });
    return true;
  } catch (_) { return false; }
}

module.exports = {
  getByApp, getByWorkspace, getById, getByAgent,
  create, update, remove, setActive,
  setMuted, updateBadge,
  setAgent, releaseAgent, recordAgentAction,
  duplicate, moveToWorkspace, removeByWorkspace,
  clearCache, clearCookies, createPartition,
};
