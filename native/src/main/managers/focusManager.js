/**
 * HermesBrowser — Focus Mode Manager
 * Pomodoro timer, distraction blocking, notification muting.
 */
const store = require('../database/store');
const settingsManager = require('./settingsManager');
const { uid, FOCUS_TYPES } = require('../../shared/constants');

const SESSIONS_COLLECTION = 'focus_sessions';
const RULES_COLLECTION = 'distraction_rules';

// ── In-memory timer state ────────────────────────────────────────────
let _timerInterval = null;
let _activeSessionId = null;
let _elapsedCallback = null;

// ── Focus Sessions ────────────────────────────────────────────────────

function getActiveSession() {
  if (_activeSessionId) {
    return store.findOne(SESSIONS_COLLECTION, s => s.id === _activeSessionId);
  }
  return null;
}

function start(type, workspaceId) {
  // Stop any existing session
  stop();

  const durations = {
    [FOCUS_TYPES.POMODORO]: 25,
    [FOCUS_TYPES.FOCUS_50]: 50,
    [FOCUS_TYPES.FOCUS_90]: 90,
    [FOCUS_TYPES.BREAK_SHORT]: 5,
    [FOCUS_TYPES.BREAK_LONG]: 15,
  };
  const durationMinutes = durations[type] || parseInt(type) || 25;

  const session = {
    id: uid(),
    type,
    durationMinutes,
    elapsedSeconds: 0,
    status: 'running',
    startedAt: new Date().toISOString(),
    workspaceId,
    notificationsMuted: true,
    badgesHidden: true,
    soundsMuted: true,
  };
  store.insert(SESSIONS_COLLECTION, session);
  _activeSessionId = session.id;

  // Update settings
  settingsManager.update({ focusMode: true });

  // Start timer
  _startTimer();
  return session;
}

function stop() {
  if (_timerInterval) {
    clearInterval(_timerInterval);
    _timerInterval = null;
  }
  if (_activeSessionId) {
    store.update(SESSIONS_COLLECTION, s => s.id === _activeSessionId, { status: 'stopped' });
    _activeSessionId = null;
  }
  settingsManager.update({ focusMode: false });
  return true;
}

function pause() {
  if (_timerInterval) {
    clearInterval(_timerInterval);
    _timerInterval = null;
  }
  if (_activeSessionId) {
    store.update(SESSIONS_COLLECTION, s => s.id === _activeSessionId, { status: 'paused' });
  }
  return true;
}

function resume() {
  if (_activeSessionId) {
    store.update(SESSIONS_COLLECTION, s => s.id === _activeSessionId, { status: 'running' });
    _startTimer();
  }
  return true;
}

function getStatus() {
  const session = getActiveSession();
  if (!session) return { active: false };
  const elapsed = session.elapsedSeconds;
  const total = session.durationMinutes * 60;
  return {
    active: true,
    type: session.type,
    elapsed,
    remaining: total - elapsed,
    total,
    progress: total > 0 ? Math.round((elapsed / total) * 100) : 0,
    status: session.status,
    workspaceId: session.workspaceId,
  };
}

function getConfig() {
  const session = getActiveSession();
  if (!session) {
    return { notificationsMuted: false, badgesHidden: false, soundsMuted: false };
  }
  return {
    notificationsMuted: session.notificationsMuted,
    badgesHidden: session.badgesHidden,
    soundsMuted: session.soundsMuted,
  };
}

function updateConfig(changes) {
  if (_activeSessionId) {
    return store.updateById(SESSIONS_COLLECTION, _activeSessionId, changes);
  }
  return null;
}

function _startTimer() {
  if (_timerInterval) clearInterval(_timerInterval);
  _timerInterval = setInterval(() => {
    if (_activeSessionId) {
      const session = getActiveSession();
      if (!session) { clearInterval(_timerInterval); return; }
      const newElapsed = session.elapsedSeconds + 1;
      store.update(SESSIONS_COLLECTION, s => s.id === _activeSessionId, { elapsedSeconds: newElapsed });
      if (_elapsedCallback) _elapsedCallback(getStatus());
      // Auto-stop when duration reached
      if (newElapsed >= session.durationMinutes * 60) {
        clearInterval(_timerInterval);
        store.update(SESSIONS_COLLECTION, s => s.id === _activeSessionId, { status: 'completed' });
        settingsManager.update({ focusMode: false });
        _activeSessionId = null;
      }
    }
  }, 1000);
  _timerInterval.unref();
}

function onElapsed(callback) { _elapsedCallback = callback; }

// ── Distraction Rules ────────────────────────────────────────────────

function getRules(workspaceId) {
  return store.findAll(RULES_COLLECTION, r => r.workspaceId === workspaceId);
}

function createRule(data) {
  const rule = {
    id: uid(),
    pattern: data.pattern,
    action: data.action || 'block',
    redirectUrl: data.redirectUrl || '',
    schedule: data.schedule || 'always',
    workspaceId: data.workspaceId,
  };
  return store.insert(RULES_COLLECTION, rule);
}

function updateRule(id, changes) {
  return store.updateById(RULES_COLLECTION, id, changes);
}

function removeRule(id) { return store.removeById(RULES_COLLECTION, id); }

function checkUrl(url, workspaceId) {
  const session = getActiveSession();
  if (!session || session.workspaceId !== workspaceId) return { blocked: false };
  const rules = getRules(workspaceId);
  for (const rule of rules) {
    if (rule.schedule === 'focus_mode_only' || rule.schedule === 'always') {
      // Simple glob matching
      const pattern = rule.pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(url)) {
          return { blocked: rule.action !== 'warn', action: rule.action, rule, redirectUrl: rule.redirectUrl };
        }
      } catch (_) {}
    }
  }
  return { blocked: false };
}

module.exports = { start, stop, pause, resume, getStatus, getConfig, updateConfig, onElapsed,
  getRules: getRules, createRule, updateRule, removeRule, checkUrl };
