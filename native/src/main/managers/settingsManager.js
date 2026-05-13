/**
 * LastBrowser — Settings Manager
 *
 * Global application settings stored as a single JSON document.
 */

const store = require('../database/store');
const { DEFAULTS } = require('../../shared/constants');

const COLLECTION = 'settings';

function getAll() {
  let settings = store.findOne(COLLECTION, () => true);
  if (!settings) {
    // Initialize with defaults
    settings = {
      id: 'default',
      ...DEFAULTS.SETTINGS,
    };
    store.insert(COLLECTION, settings);
  }
  return settings;
}

function update(changes) {
  const current = getAll();
  const merged = { ...current, ...changes };
  store.remove(COLLECTION, () => true); // remove old
  store.insert(COLLECTION, merged);
  return merged;
}

function reset() {
  store.remove(COLLECTION, () => true);
  return getAll();
}

function get(key) {
  const all = getAll();
  return all[key] !== undefined ? all[key] : DEFAULTS.SETTINGS[key];
}

module.exports = { getAll, update, reset, get };
