/**
 * HermesBrowser — Worker Queue Manager
 * Task queue with priorities, retries, dependency graph, and cancellation.
 */
const store = require('../database/store');
const { uid } = require('../../shared/constants');

const COLLECTION = 'worker_jobs';

function getAll() {
  return store.readCollection(COLLECTION).sort((a, b) => {
    const prioOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return (prioOrder[a.priority] || 2) - (prioOrder[b.priority] || 2);
  });
}

function getById(id) { return store.findOne(COLLECTION, j => j.id === id); }

function getByStatus(status) {
  return store.findAll(COLLECTION, j => j.status === status)
    .sort((a, b) => {
      const prioOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return (prioOrder[a.priority] || 2) - (prioOrder[b.priority] || 2);
    });
}

function getByAgent(agentId) {
  return store.findAll(COLLECTION, j => j.agentId === agentId);
}

function submit(data) {
  const job = {
    id: uid(),
    type: data.type || 'generic',
    status: 'queued',
    priority: data.priority || 'medium',
    parentJobId: data.parentJobId || null,
    childJobIds: [],
    agentId: data.agentId || '',
    cardId: data.cardId || null,
    input: data.input || {},
    output: null,
    error: null,
    retryCount: 0,
    maxRetries: data.maxRetries || 3,
    progress: 0,
    timeoutMs: data.timeoutMs || 300000,
    tokensUsed: 0,
    estimatedCost: 0,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
  };
  store.insert(COLLECTION, job);

  // If has parent, add to parent's children
  if (data.parentJobId) {
    const parent = getById(data.parentJobId);
    if (parent) {
      parent.childJobIds.push(job.id);
      store.updateById(COLLECTION, parent.id, { childJobIds: parent.childJobIds });
    }
  }
  return job;
}

function start(id) {
  return store.updateById(COLLECTION, id, {
    status: 'running',
    startedAt: new Date().toISOString(),
  });
}

function complete(id, output) {
  return store.updateById(COLLECTION, id, {
    status: 'completed',
    output: output || {},
    progress: 100,
    completedAt: new Date().toISOString(),
  });
}

function fail(id, error) {
  const job = getById(id);
  if (!job) return null;
  if (job.retryCount < job.maxRetries) {
    return store.updateById(COLLECTION, id, {
      status: 'retrying',
      error: error,
      retryCount: job.retryCount + 1,
    });
  }
  return store.updateById(COLLECTION, id, {
    status: 'failed',
    error: error,
    completedAt: new Date().toISOString(),
  });
}

function cancel(id) {
  return store.updateById(COLLECTION, id, {
    status: 'cancelled',
    completedAt: new Date().toISOString(),
  });
}

function updateProgress(id, progress) {
  return store.updateById(COLLECTION, id, { progress: Math.min(100, Math.max(0, progress)) });
}

function retry(id) {
  return store.updateById(COLLECTION, id, {
    status: 'queued',
    error: null,
    output: null,
    retryCount: 0,
    startedAt: null,
    completedAt: null,
    progress: 0,
  });
}

function getQueueStatus() {
  const all = getAll();
  return {
    queued: all.filter(j => j.status === 'queued').length,
    running: all.filter(j => j.status === 'running').length,
    completed: all.filter(j => j.status === 'completed').length,
    failed: all.filter(j => j.status === 'failed').length,
    cancelled: all.filter(j => j.status === 'cancelled').length,
    retrying: all.filter(j => j.status === 'retrying').length,
    total: all.length,
  };
}

function getDependencyGraph(jobId) {
  const job = getById(jobId);
  if (!job) return null;
  const graph = { nodes: [], edges: [] };

  function traverse(id, visited = new Set()) {
    if (visited.has(id)) return;
    visited.add(id);
    const j = getById(id);
    if (!j) return;
    graph.nodes.push({ id: j.id, type: j.type, status: j.status, priority: j.priority });
    if (j.parentJobId) {
      graph.edges.push({ from: j.parentJobId, to: j.id });
      traverse(j.parentJobId, visited);
    }
    for (const childId of j.childJobIds) {
      graph.edges.push({ from: j.id, to: childId });
      traverse(childId, visited);
    }
  }

  traverse(jobId);
  return graph;
}

function getHistory(limit = 50) {
  return store.readCollection(COLLECTION)
    .filter(j => j.status !== 'queued' && j.status !== 'running')
    .sort((a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt))
    .slice(0, limit);
}

module.exports = { getAll, getById, getByStatus, getByAgent, submit, start,
  complete, fail, cancel, updateProgress, retry, getQueueStatus, getDependencyGraph, getHistory };
