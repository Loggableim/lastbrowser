/**
 * HermesBrowser — Workspace Manager
 *
 * Manages workspaces with isolated Electron session partitions.
 * Each workspace gets its own session (persist: partition_<id>).
 */

const { session } = require('electron');
const store = require('../database/store');
const { uid } = require('../../shared/constants');

// ── Cache ──────────────────────────────────────────────────────────────
let workspaceCache = null;

// ── Session Partition Helpers ──────────────────────────────────────────
function partitionName(id) {
  return `persist:workspace_${id}`;
}

function createPartition(id) {
  const name = partitionName(id);
  try {
    const ses = session.fromPartition(name);
    console.log(`[workspace] Created session partition: ${name}`);
    return name;
  } catch (err) {
    // Graceful fallback outside Electron (e.g. tests)
    return name;
  }
}

function destroyPartition(id) {
  const name = partitionName(id);
  try {
    delete session.fromPartition(name);
  } catch (_) {
    // Partition might not exist
  }
}

// ── Manager API ────────────────────────────────────────────────────────

function getAll() {
  if (!workspaceCache) {
    workspaceCache = store.readCollection('workspaces') || [];
  }
  return workspaceCache;
}

function _persist() {
  store.writeCollection('workspaces', workspaceCache);
}

function getById(id) {
  return getAll().find(w => w.id === id) || null;
}

function create(data = {}) {
  const all = getAll();
  const id = uid();
  const now = new Date().toISOString();
  const workspace = {
    id,
    name: data.name || 'New Workspace',
    icon: data.icon || '💼',
    color: data.color || '#6366f1',
    sessionPartition: createPartition(id),
    order: all.length,
    isPaused: false,
    createdAt: now,
    updatedAt: now,
  };
  all.push(workspace);
  _persist();
  workspaceCache = all;
  console.log(`[workspace] Created: "${workspace.name}" (${id})`);
  return workspace;
}

function update(id, changes) {
  const all = getAll();
  const idx = all.findIndex(w => w.id === id);
  if (idx === -1) return null;

  all[idx] = {
    ...all[idx],
    ...changes,
    updatedAt: new Date().toISOString(),
  };
  _persist();
  workspaceCache = all;
  return all[idx];
}

function remove(id) {
  const all = getAll();
  const idx = all.findIndex(w => w.id === id);
  if (idx === -1) return false;

  const [removed] = all.splice(idx, 1);
  destroyPartition(id);

  // Re-order remaining
  for (let i = 0; i < all.length; i++) all[i].order = i;

  _persist();
  workspaceCache = all;
  console.log(`[workspace] Removed: "${removed.name}" (${id})`);

  // Cascade delete related data
  store.remove('apps', a => a.workspaceId === id);
  store.remove('tabs', t => t.workspaceId === id);
  store.remove('tab_sets', ts => ts.workspaceId === id);
  store.remove('split_views', sv => sv.workspaceId === id);
  store.remove('tasks', t => t.workspaceId === id);

  return true;
}

function setPaused(id, paused) {
  return update(id, { isPaused: paused });
}

function getPaused(id) {
  const w = getById(id);
  return w ? w.isPaused : false;
}

function reorder(ids) {
  // ids = ordered array of workspace IDs
  const all = getAll();
  const map = {};
  for (const w of all) map[w.id] = w;

  const reordered = ids.map((id, idx) => {
    if (map[id]) {
      map[id].order = idx;
      return map[id];
    }
    return null;
  }).filter(Boolean);

  // Add any not in the list
  for (const w of all) {
    if (!ids.includes(w.id)) {
      w.order = reordered.length;
      reordered.push(w);
    }
  }

  workspaceCache = reordered;
  _persist();
  return reordered;
}

/**
 * Export a single workspace as a portable JSON object.
 */
function exportWorkspace(id) {
  const w = getById(id);
  if (!w) return null;

  return {
    workspace: { ...w, sessionPartition: undefined },  // strip partition
    apps: store.findAll('apps', a => a.workspaceId === id),
    tabs: store.findAll('tabs', t => t.workspaceId === id),
    tabSets: store.findAll('tab_sets', ts => ts.workspaceId === id),
    tasks: store.findAll('tasks', t => t.workspaceId === id),
  };
}

/**
 * Import a workspace from a JSON export object.
 */
function importWorkspace(data) {
  if (!data.workspace || !data.workspace.name) return null;

  const w = create({
    name: data.workspace.name,
    icon: data.workspace.icon,
    color: data.workspace.color,
  });

  // Re-import apps with new workspace ID
  if (data.apps) {
    for (const app of data.apps) {
      store.insert('apps', {
        ...app,
        id: uid(),
        workspaceId: w.id,
      });
    }
  }

  // Re-import tabs
  if (data.tabs) {
    const tabIdMap = {};
    for (const tab of data.tabs) {
      const newId = uid();
      tabIdMap[tab.id] = newId;
      store.insert('tabs', {
        ...tab,
        id: newId,
        workspaceId: w.id,
      });
    }
  }

  // Re-import tab sets
  if (data.tabSets) {
    for (const ts of data.tabSets) {
      store.insert('tab_sets', {
        ...ts,
        id: uid(),
        workspaceId: w.id,
      });
    }
  }

  // Re-import tasks
  if (data.tasks) {
    for (const t of data.tasks) {
      store.insert('tasks', {
        ...t,
        id: uid(),
        workspaceId: w.id,
      });
    }
  }

  return w;
}

/**
 * Get display stats for all workspaces.
 */
function getStats() {
  const all = getAll();
  const tabs = store.readCollection('tabs') || [];
  return all.map(w => ({
    id: w.id,
    name: w.name,
    icon: w.icon,
    color: w.color,
    isPaused: w.isPaused,
    tabCount: tabs.filter(t => t.workspaceId === w.id).length,
  }));
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
  setPaused,
  getPaused,
  reorder,
  exportWorkspace,
  importWorkspace,
  getStats,
};
