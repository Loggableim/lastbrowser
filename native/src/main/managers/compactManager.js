/**
 * HermesBrowser — Compact Mode Manager v2.2
 * Zen-inspired 3-level compact mode:
 *   0 = OFF (full UI)
 *   1 = COMPACT (app sidebar hidden, tabs thin)
 *   2 = ULTRA (only workspace sidebar, hover to reveal)
 */
const store = require('../database/store');

const SETTINGS_KEY = 'compactLevel';

function getLevel() {
  const settings = store.findOne('settings', () => true);
  if (!settings) return 0;
  return settings.compactLevel !== undefined ? settings.compactLevel : 0;
}

function setLevel(level) {
  const clamped = Math.max(0, Math.min(2, level));
  const settings = store.findOne('settings', () => true);
  if (settings) {
    store.updateById('settings', settings.id, { compactLevel: clamped });
  }
  return clamped;
}

function toggle() {
  const current = getLevel();
  const next = (current + 1) % 3;
  setLevel(next);
  return next;
}

function isCompact() {
  return getLevel() > 0;
}

function isUltra() {
  return getLevel() === 2;
}

function getLabel(level) {
  const labels = ['Full UI', 'Compact', 'Ultra Compact'];
  return labels[level] || 'Full UI';
}

module.exports = { getLevel, setLevel, toggle, isCompact, isUltra, getLabel };
