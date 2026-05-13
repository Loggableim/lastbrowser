/**
 * HermesBrowser — Pipeline Manager
 * Configurable AI task pipelines with steps like analysis, planning, coding, review.
 */
const store = require('../database/store');
const { uid } = require('../../shared/constants');

const COLLECTION = 'pipelines';

const DEFAULT_STEPS = [
  'analysis', 'planning', 'implementation', 'testing', 'review', 'documentation', 'deployment',
];

function getAll() { return store.readCollection(COLLECTION); }

function getById(id) { return store.findOne(COLLECTION, p => p.id === id); }

function create(data) {
  const pipeline = {
    id: uid(),
    name: data.name || 'New Pipeline',
    steps: data.steps || [...DEFAULT_STEPS],
    stepConfig: data.stepConfig || {},
    status: 'idle',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  // Initialize step config for new steps
  for (const step of pipeline.steps) {
    if (!pipeline.stepConfig[step]) {
      pipeline.stepConfig[step] = { enabled: true, agentId: null, timeoutMs: 300000 };
    }
  }
  return store.insert(COLLECTION, pipeline);
}

function update(id, changes) {
  return store.updateById(COLLECTION, id, { ...changes, updatedAt: new Date().toISOString() });
}

function remove(id) { return store.removeById(COLLECTION, id); }

function toggleStep(pipelineId, stepName, enabled) {
  const pipeline = getById(pipelineId);
  if (!pipeline) return null;
  if (pipeline.stepConfig[stepName]) {
    pipeline.stepConfig[stepName].enabled = enabled;
  }
  return update(pipelineId, { stepConfig: pipeline.stepConfig });
}

function setStepAgent(pipelineId, stepName, agentId) {
  const pipeline = getById(pipelineId);
  if (!pipeline) return null;
  if (!pipeline.stepConfig[stepName]) {
    pipeline.stepConfig[stepName] = { enabled: true, agentId: null, timeoutMs: 300000 };
  }
  pipeline.stepConfig[stepName].agentId = agentId;
  return update(pipelineId, { stepConfig: pipeline.stepConfig });
}

function getEnabledSteps(pipelineId) {
  const pipeline = getById(pipelineId);
  if (!pipeline) return [];
  return pipeline.steps.filter(step => pipeline.stepConfig[step]?.enabled !== false);
}

function duplicate(id) {
  const p = getById(id);
  if (!p) return null;
  const { id: _, createdAt, updatedAt, ...rest } = p;
  return create({ ...rest, name: rest.name + ' (Copy)' });
}

module.exports = { getAll, getById, create, update, remove, toggleStep, setStepAgent, getEnabledSteps, duplicate };
