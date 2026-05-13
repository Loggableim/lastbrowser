/**
 * HermesBrowser — AI Agent Manager
 * Register, configure, and spawn AI agents.
 */
const store = require('../database/store');
const { uid, AGENT_ROLES } = require('../../shared/constants');

const COLLECTION = 'agents';

function getAll() {
  return store.readCollection(COLLECTION);
}

function getById(id) { return store.findOne(COLLECTION, a => a.id === id); }

function getByRole(role) {
  return store.findAll(COLLECTION, a => a.role === role);
}

function getEnabled() {
  return store.findAll(COLLECTION, a => a.enabled);
}

function create(data) {
  const agent = {
    id: uid(),
    name: data.name || 'New Agent',
    role: data.role || AGENT_ROLES.WORKER,
    model: data.model || 'deepseek-v4-flash',
    provider: data.provider || 'opencode-go',
    maxTokens: data.maxTokens || 4000,
    temperature: data.temperature !== undefined ? data.temperature : 0.7,
    enabled: data.enabled !== undefined ? data.enabled : true,
    maxConcurrentTasks: data.maxConcurrentTasks || 3,
    systemPrompt: data.systemPrompt || null,
    capabilities: data.capabilities || {},
    totalTasksRun: 0,
    totalTokensUsed: 0,
    successRate: 1.0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return store.insert(COLLECTION, agent);
}

function update(id, changes) {
  return store.updateById(COLLECTION, id, { ...changes, updatedAt: new Date().toISOString() });
}

function remove(id) { return store.removeById(COLLECTION, id); }

function recordTaskComplete(id, tokensUsed, success) {
  const agent = getById(id);
  if (!agent) return null;
  const totalTasks = agent.totalTasksRun + 1;
  const totalTokens = (agent.totalTokensUsed || 0) + (tokensUsed || 0);
  const successRate = success
    ? (agent.successRate * agent.totalTasksRun + 1) / totalTasks
    : (agent.successRate * agent.totalTasksRun) / totalTasks;

  return store.updateById(COLLECTION, id, {
    totalTasksRun: totalTasks,
    totalTokensUsed: totalTokens,
    successRate: Math.round(successRate * 100) / 100,
    updatedAt: new Date().toISOString(),
  });
}

function getDashboard() {
  const agents = getAll();
  const enabled = agents.filter(a => a.enabled);
  const workerJobs = store.readCollection('worker_jobs');
  const runningJobs = workerJobs.filter(j => j.status === 'running');

  const roleCounts = {};
  for (const role of Object.values(AGENT_ROLES)) { roleCounts[role] = 0; }
  for (const agent of agents) { roleCounts[agent.role] = (roleCounts[agent.role] || 0) + 1; }

  return {
    totalAgents: agents.length,
    enabledAgents: enabled.length,
    activeJobs: runningJobs.length,
    totalTokensUsed: agents.reduce((sum, a) => sum + (a.totalTokensUsed || 0), 0),
    totalTasksRun: agents.reduce((sum, a) => sum + (a.totalTasksRun || 0), 0),
    avgSuccessRate: agents.length > 0
      ? Math.round((agents.reduce((sum, a) => sum + (a.successRate || 1.0), 0) / agents.length) * 100) / 100
      : 1.0,
    roleDistribution: roleCounts,
    recentJobs: workerJobs
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20),
  };
}

function getModelOptions() {
  return [
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'opencode-go', type: 'cloud', free: true },
    { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek', type: 'cloud', free: false },
    { id: 'llama-70b-free', name: 'Llama 3.1 70B', provider: 'openrouter', type: 'cloud', free: true },
    { id: 'nemotron-free', name: 'Nemotron 4 70B', provider: 'openrouter', type: 'cloud', free: true },
    { id: 'qwen-coder-free', name: 'Qwen Coder', provider: 'openrouter', type: 'cloud', free: true },
    { id: 'mimo-v2-pro', name: 'Mimo V2 Pro', provider: 'openrouter', type: 'cloud', free: true },
    { id: 'local/llama-20b', name: 'Ollama 20B', provider: 'ollama', type: 'local', free: true },
    { id: 'local/llama-120b', name: 'Ollama 120B', provider: 'ollama', type: 'local', free: true },
  ];
}

module.exports = { getAll, getById, getByRole, getEnabled, create, update, remove,
  recordTaskComplete, getDashboard, getModelOptions };
