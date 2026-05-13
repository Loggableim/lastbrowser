/**
 * HermesBrowser — Split View Manager
 * Manages multi-panel split layouts per workspace.
 */
const store = require('../database/store');
const { uid, SPLIT_LAYOUTS } = require('../../shared/constants');

const COLLECTION = 'split_views';
const VALID_LAYOUTS = Object.values(SPLIT_LAYOUTS);

function getByWorkspace(workspaceId) {
  return store.findOne(COLLECTION, sv => sv.workspaceId === workspaceId);
}

function getById(id) { return store.findOne(COLLECTION, sv => sv.id === id); }

function create(workspaceId, layout, tabs) {
  // Remove existing split view for this workspace
  store.remove(COLLECTION, sv => sv.workspaceId === workspaceId);
  
  if (!VALID_LAYOUTS.includes(layout)) layout = SPLIT_LAYOUTS.FIFTY_FIFTY;
  
  const panels = (tabs || []).map((tab, i) => ({
    id: uid(),
    tabId: tab.id || tab,
    position: i,
    size: 1,
    isActive: i === 0,
  }));
  
  const sv = {
    id: uid(),
    workspaceId,
    layout,
    panels,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return store.insert(COLLECTION, sv);
}

function update(id, changes) {
  return store.updateById(COLLECTION, id, { ...changes, updatedAt: new Date().toISOString() });
}

function remove(id) { return store.removeById(COLLECTION, id); }

function addPanel(id, tabId) {
  const sv = getById(id);
  if (!sv) return null;
  const panel = {
    id: uid(),
    tabId,
    position: sv.panels.length,
    size: 1,
    isActive: false,
  };
  sv.panels.push(panel);
  return update(id, { panels: sv.panels });
}

function removePanel(id, panelId) {
  const sv = getById(id);
  if (!sv) return null;
  sv.panels = sv.panels.filter(p => p.id !== panelId);
  // Re-index positions
  sv.panels.forEach((p, i) => { p.position = i; });
  if (sv.panels.length > 0) sv.panels[0].isActive = true;
  return update(id, { panels: sv.panels });
}

function setLayout(id, layout) {
  if (!VALID_LAYOUTS.includes(layout)) return null;
  return update(id, { layout });
}

function resizePanel(id, panelId, newSize) {
  const sv = getById(id);
  if (!sv) return null;
  const panel = sv.panels.find(p => p.id === panelId);
  if (!panel) return null;
  panel.size = Math.max(0.1, Math.min(1, newSize));
  return update(id, { panels: sv.panels });
}

function removeByWorkspace(workspaceId) {
  return store.remove(COLLECTION, sv => sv.workspaceId === workspaceId);
}

module.exports = { getByWorkspace, getById, create, update, remove,
  addPanel, removePanel, setLayout, resizePanel, removeByWorkspace };
