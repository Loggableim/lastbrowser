/**
 * HermesBrowser — Cron / Scheduler Manager
 * Schedule recurring tasks with cron expressions.
 * In-memory timer checks every 60 seconds for due jobs.
 */
const store = require('../database/store');
const { uid } = require('../../shared/constants');

const COLLECTION = 'cron_jobs';
let _checkInterval = null;
let _onDueJobs = null;

function getAll() {
  return store.readCollection(COLLECTION).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function getById(id) { return store.findOne(COLLECTION, j => j.id === id); }

function create(data) {
  const job = {
    id: uid(),
    name: data.name || 'New Cron Job',
    schedule: data.schedule || '0 3 * * *',
    taskType: data.taskType || 'maintenance',
    config: data.config || {},
    enabled: data.enabled !== undefined ? data.enabled : true,
    maxRetries: data.maxRetries || 3,
    lastRunAt: null,
    lastRunStatus: null,
    nextRunAt: _computeNextRun(data.schedule || '0 3 * * *'),
    createdAt: new Date().toISOString(),
  };
  const result = store.insert(COLLECTION, job);
  _restartChecker();
  return result;
}

function update(id, changes) {
  if (changes.schedule) {
    changes.nextRunAt = _computeNextRun(changes.schedule);
  }
  return store.updateById(COLLECTION, id, changes);
}

function remove(id) {
  const result = store.removeById(COLLECTION, id);
  _restartChecker();
  return result;
}

function toggle(id, enabled) {
  const job = getById(id);
  if (!job) return null;
  if (enabled && !job.enabled) {
    return store.updateById(COLLECTION, id, { enabled: true, nextRunAt: _computeNextRun(job.schedule) });
  }
  return store.updateById(COLLECTION, id, { enabled });
}

function markRun(id, status) {
  const job = getById(id);
  if (!job) return null;
  return store.updateById(COLLECTION, id, {
    lastRunAt: new Date().toISOString(),
    lastRunStatus: status,
    nextRunAt: _computeNextRun(job.schedule),
  });
}

function getDueJobs() {
  const now = new Date();
  return store.findAll(COLLECTION, j => {
    if (!j.enabled) return false;
    if (!j.nextRunAt) return false;
    return new Date(j.nextRunAt) <= now;
  });
}

// ── Simple cron expression parser (5-field: min hour dom mon dow) ──
function _parseCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  return {
    minute: _parseField(parts[0], 0, 59),
    hour: _parseField(parts[1], 0, 23),
    dayOfMonth: _parseField(parts[2], 1, 31),
    month: _parseField(parts[3], 1, 12),
    dayOfWeek: _parseField(parts[4], 0, 6),
  };
}

function _parseField(field, min, max) {
  if (field === '*') return { type: 'all' };
  // Support simple numeric values and */N
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2));
    return { type: 'step', step };
  }
  const num = parseInt(field);
  if (!isNaN(num) && num >= min && num <= max) {
    return { type: 'exact', value: num };
  }
  // Comma-separated
  if (field.includes(',')) {
    const values = field.split(',').map(s => parseInt(s)).filter(n => !isNaN(n));
    return { type: 'list', values };
  }
  return { type: 'all' };
}

function _matchesField(value, fieldDef, min, max) {
  if (!fieldDef) return false;
  switch (fieldDef.type) {
    case 'all': return true;
    case 'exact': return value === fieldDef.value;
    case 'step': return (value - min) % fieldDef.step === 0;
    case 'list': return fieldDef.values.includes(value);
    default: return false;
  }
}

function _computeNextRun(schedule) {
  try {
    const parsed = _parseCron(schedule);
    if (!parsed) return null;
    const now = new Date();
    // Check next 60 days
    for (let d = 0; d < 60; d++) {
      const date = new Date(now.getTime() + d * 86400000);
      if (!_matchesField(date.getMonth() + 1, parsed.month, 1, 12)) continue;
      if (!_matchesField(date.getDate(), parsed.dayOfMonth, 1, 31)) continue;
      if (!_matchesField(date.getDay(), parsed.dayOfWeek, 0, 6)) continue;
      for (let h = (d === 0 ? date.getHours() : 0); h <= 23; h++) {
        if (!_matchesField(h, parsed.hour, 0, 23)) continue;
        for (let m = (d === 0 && h === date.getHours() ? date.getMinutes() + 1 : 0); m <= 59; m++) {
          if (_matchesField(m, parsed.minute, 0, 59)) {
            date.setHours(h, m, 0, 0);
            if (date > now) return date.toISOString();
          }
        }
      }
    }
    return null;
  } catch (_) {
    return null;
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────

function _restartChecker() {
  if (_checkInterval) clearInterval(_checkInterval);
  _checkInterval = setInterval(() => {
    const dueJobs = getDueJobs();
    if (dueJobs.length > 0 && _onDueJobs) {
      _onDueJobs(dueJobs);
    }
  }, 60000); // Check every 60 seconds
  _checkInterval.unref();
}

function onDueJobs(callback) { _onDueJobs = callback; }

function start() { _restartChecker(); }

function stop() {
  if (_checkInterval) {
    clearInterval(_checkInterval);
    _checkInterval = null;
  }
}

function getHistory(jobId) {
  // Worker jobs linked to this cron job
  const workerManager = require('./workerManager');
  return workerManager.getAll().filter(j => j.input?.cronJobId === jobId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = { getAll, getById, create, update, remove, toggle,
  markRun, getDueJobs, onDueJobs, start, stop, getHistory };
