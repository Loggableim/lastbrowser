/**
 * HermesBrowser — Privacy & Security Manager
 * Adblock, cookie control, cache clearing.
 */
const settingsManager = require('./settingsManager');
const store = require('../database/store');

function getConfig() {
  return {
    adblockEnabled: settingsManager.get('adblockEnabled') === true,
    cookieControl: settingsManager.get('cookieControl') || 'allow_all',
    adblockFilterLists: settingsManager.get('adblockFilterLists') || ['default'],
    blockThirdPartyCookies: settingsManager.get('cookieControl') === 'block_third_party',
    telemetryEnabled: settingsManager.get('telemetryEnabled') === true,
  };
}

function updateConfig(changes) {
  const updates = {};
  if (changes.adblockEnabled !== undefined) updates.adblockEnabled = changes.adblockEnabled;
  if (changes.cookieControl) updates.cookieControl = changes.cookieControl;
  if (changes.adblockFilterLists) updates.adblockFilterLists = changes.adblockFilterLists;
  if (changes.telemetryEnabled !== undefined) updates.telemetryEnabled = changes.telemetryEnabled;
  settingsManager.update(updates);
  return getConfig();
}

function getStats() {
  const { session } = require('electron');
  let totalCached = 0;
  let cookiesCount = 0;
  try {
    const defaultSession = session.defaultSession;
    // We can't easily get cache size from Electron API, estimate from settings
    totalCached = settingsManager.get('estimatedCacheSize') || 0;
    cookiesCount = settingsManager.get('estimatedCookiesCount') || 0;
  } catch (_) {}
  return {
    totalCachedData: totalCached,
    cachedSites: Math.ceil(totalCached / 1024),
    cookiesCount,
  };
}

async function clearCache(appId) {
  try {
    const { session } = require('electron');
    if (appId) {
      const app = require('./appManager').getById(appId);
      if (app && app.sessionPartition) {
        const ses = session.fromPartition(app.sessionPartition);
        await ses.clearCache();
        await ses.clearStorageData();
      }
    } else {
      await session.defaultSession.clearCache();
      await session.defaultSession.clearStorageData();
      // Also clear all app partitions
      const apps = require('./appManager').getAll();
      for (const app of apps) {
        try {
          const ses = session.fromPartition(app.sessionPartition);
          await ses.clearCache();
        } catch (_) {}
      }
    }
    return true;
  } catch (err) {
    console.error('[privacy] Failed to clear cache:', err.message);
    return false;
  }
}

async function clearCookies(appId) {
  try {
    const { session } = require('electron');
    if (appId) {
      const app = require('./appManager').getById(appId);
      if (app && app.sessionPartition) {
        const ses = session.fromPartition(app.sessionPartition);
        await ses.clearAuthCache();
        await ses.cookies.flushStore();
      }
    } else {
      await session.defaultSession.clearAuthCache();
      await session.defaultSession.cookies.flushStore();
      const apps = require('./appManager').getAll();
      for (const app of apps) {
        try {
          const ses = session.fromPartition(app.sessionPartition);
          await ses.cookies.flushStore();
        } catch (_) {}
      }
    }
    return true;
  } catch (err) {
    console.error('[privacy] Failed to clear cookies:', err.message);
    return false;
  }
}

function getAdblockStatus() {
  const config = getConfig();
  return {
    enabled: config.adblockEnabled,
    blockedCount: settingsManager.get('adblockBlockedCount') || 0,
    filterLists: config.adblockFilterLists,
  };
}

function toggleAdblock(enabled) {
  settingsManager.update({ adblockEnabled: enabled });
  return getAdblockStatus();
}

module.exports = { getConfig, updateConfig, getStats, clearCache, clearCookies, getAdblockStatus, toggleAdblock };
