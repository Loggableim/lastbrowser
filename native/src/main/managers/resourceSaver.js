/**
 * HermesBrowser — Resource Saver / Tab Suspender
 * Auto-suspends inactive tabs to save memory.
 */
const settingsManager = require('./settingsManager');

function getConfig() {
  return {
    enabled: settingsManager.get('resourceSaver') === true,
    timeoutMinutes: settingsManager.get('suspendTimeoutMinutes') || 30,
    exceptions: settingsManager.get('saverExceptions') || [],
  };
}

function updateConfig(changes) {
  const config = getConfig();
  const updated = {
    resourceSaver: changes.enabled !== undefined ? changes.enabled : config.enabled,
    suspendTimeoutMinutes: changes.timeoutMinutes || config.timeoutMinutes,
    saverExceptions: changes.exceptions || config.exceptions,
  };
  settingsManager.update(updated);
  return getConfig();
}

function sleepAllInactive(activeTabIds = []) {
  const tabManager = require('./tabManager');
  const count = tabManager.suspendAllInactive(activeTabIds);
  return count;
}

function sleepApp(appId) {
  const appManager = require('./appManager');
  return appManager.setSuspended(appId, true);
}

function wakeApp(appId) {
  const appManager = require('./appManager');
  return appManager.setSuspended(appId, false);
}

function addException(pattern) {
  const config = getConfig();
  if (!config.exceptions.includes(pattern)) {
    config.exceptions.push(pattern);
    settingsManager.update({ saverExceptions: config.exceptions });
  }
  return config.exceptions;
}

function removeException(pattern) {
  const config = getConfig();
  config.exceptions = config.exceptions.filter(e => e !== pattern);
  settingsManager.update({ saverExceptions: config.exceptions });
  return config.exceptions;
}

function getExceptions() {
  return getConfig().exceptions;
}

function getMemoryStats() {
  const tabManager = require('./tabManager');
  const allTabs = tabManager.getAll();
  return {
    totalTabs: allTabs.length,
    activeTabs: allTabs.filter(t => !t.isSuspended).length,
    suspendedTabs: allTabs.filter(t => t.isSuspended).length,
    estimatedMemorySaved: allTabs.filter(t => t.isSuspended).length * 50, // ~50MB per tab
  };
}

module.exports = { getConfig, updateConfig, sleepAllInactive, sleepApp, wakeApp,
  addException, removeException, getExceptions, getMemoryStats };
