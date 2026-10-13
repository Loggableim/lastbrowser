import { app, BrowserWindow, ipcMain } from 'electron';
import electronUpdater, { type AppUpdater } from 'electron-updater';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { createUpdateController, type LastbrowserUpdateStatus, type UpdateChannel, type UpdateController } from './update-controller.js';
import { isOfflineTestBuild } from './update-build-variant.js';
import { acknowledgeUpdateNotice, decideUpdateNotice, parseUpdateNoticeState, recordDownloadedUpdate } from './update-notice-state.js';

const { autoUpdater } = electronUpdater;

let controller: UpdateController | null = null;
type PersistedUpdatePreferences = { automaticUpdatesEnabled: boolean; channel: UpdateChannel };
const DEFAULT_UPDATE_PREFERENCES: PersistedUpdatePreferences = { automaticUpdatesEnabled: true, channel: 'stable' };
const AUTO_CHECK_INTERVAL = 4 * 60 * 60 * 1000;
const AUTO_CHECK_RETRY_DELAYS = [30_000, 2 * 60_000, 10 * 60_000];
let preferences = { ...DEFAULT_UPDATE_PREFERENCES };
let autoCheckPreferenceReceived = false;
let autoCheckPreferenceTimer: ReturnType<typeof setTimeout> | null = null;
let autoCheckTimer: ReturnType<typeof setTimeout> | null = null;
let consecutiveAutoCheckRetries = 0;
let preferencesPath = '';

/**
 * Electron 37's native `net.request()` with custom in-memory partitions (like
 * electron-updater's session) can crash Chromium's network service with
 * Crashpad `not connected` on Windows x64. Replacing `createRequest` with
 * Node's built-in `http`/`https.request` uses libuv/OpenSSL directly, avoiding
 * the Chromium partition issue while maintaining full update functionality.
 */
function patchHttpExecutor(updater: unknown): void {
  const anyUpdater = updater as { httpExecutor?: { createRequest?: (options: any, callback: any) => any } };
  if (anyUpdater?.httpExecutor) {
    anyUpdater.httpExecutor.createRequest = function (options: any, callback: any) {
      const isHttps = (options.protocol || 'https:').startsWith('https');
      const client = isHttps ? https : http;
      return client.request(options, callback);
    };
  }
}

export function registerUpdateIpc(getMainWindow: () => BrowserWindow | null): void {
  preferencesPath = path.join(app.getPath('userData'), 'update-preferences.json');
  preferences = readUpdatePreferences(preferencesPath);
  autoCheckPreferenceReceived = false;
  if (autoCheckPreferenceTimer) clearTimeout(autoCheckPreferenceTimer);
  autoCheckPreferenceTimer = null;
  if (autoCheckTimer) clearTimeout(autoCheckTimer);
  autoCheckTimer = null;
  consecutiveAutoCheckRetries = 0;
  const noticeStatePath = path.join(app.getPath('userData'), 'update-notice.json');
  const readNoticeState = () => {
    try {
      return parseUpdateNoticeState(JSON.parse(readFileSync(noticeStatePath, 'utf8')));
    } catch {
      return parseUpdateNoticeState(null);
    }
  };
  const writeNoticeState = (state: ReturnType<typeof parseUpdateNoticeState>) => {
    mkdirSync(path.dirname(noticeStatePath), { recursive: true });
    const temporaryPath = `${noticeStatePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(temporaryPath, noticeStatePath);
  };

  patchHttpExecutor(autoUpdater);
  const currentVersion = app.getVersion();
  const offlineTestBuild = app.isPackaged && isOfflineTestBuild(process.resourcesPath, currentVersion);
  controller = createUpdateController({
    updater: autoUpdater as AppUpdater,
    isPackaged: app.isPackaged,
    currentVersion,
    offlineTestBuild,
    forceDevUpdates: process.env.LASTBROWSER_FORCE_DEV_UPDATES === '1',
    automaticUpdatesEnabled: preferences.automaticUpdatesEnabled,
    updateChannel: preferences.channel,
    onStatusChange: (status) => {
      broadcastUpdateStatus(getMainWindow(), status);
      if (status.state === 'error') scheduleAutoUpdateRetry();
      else if (status.state === 'downloaded' || status.state === 'available' || status.state === 'not-available') {
        consecutiveAutoCheckRetries = 0;
        if (status.state !== 'not-available' && autoCheckTimer) {
          clearTimeout(autoCheckTimer);
          autoCheckTimer = null;
        }
      }
    },
    onUpdateDownloaded: (fromVersion, targetVersion) => {
      try {
        writeNoticeState(recordDownloadedUpdate(readNoticeState(), fromVersion, targetVersion));
      } catch (error) {
        console.warn('[updates] Could not persist downloaded update marker:', error);
      }
    }
  });

  ipcMain.handle('lastbrowser:updates:status', () => controller?.getStatus());
  ipcMain.handle('lastbrowser:updates:preferences', () => ({ ...preferences }));
  ipcMain.handle('lastbrowser:updates:check', () => controller?.checkForUpdates());
  ipcMain.handle('lastbrowser:updates:download', () => controller?.downloadUpdate());
  ipcMain.handle('lastbrowser:updates:install', () => controller?.quitAndInstall());
  ipcMain.handle('lastbrowser:updates:whats-new-candidate', () => {
    const decision = decideUpdateNotice(readNoticeState(), app.getVersion(), process.argv.includes('--updated'));
    if (!decision.candidate) {
      try { writeNoticeState(decision.state); } catch (error) {
        console.warn('[updates] Could not persist successful startup version:', error);
      }
    }
    return decision.candidate;
  });
  ipcMain.handle('lastbrowser:updates:whats-new-acknowledge', (_event, shownVersion: unknown) => {
    if (typeof shownVersion !== 'string') return { acknowledged: false };
    const state = acknowledgeUpdateNotice(readNoticeState(), app.getVersion(), shownVersion, process.argv.includes('--updated'));
    if (!state) return { acknowledged: false };
    try {
      writeNoticeState(state);
      return { acknowledged: true };
    } catch (error) {
      console.warn('[updates] Could not persist dismissed release notes:', error);
      return { acknowledged: false };
    }
  });
  ipcMain.handle('lastbrowser:updates:set-auto-check-enabled', (_event, enabled: unknown) => {
    autoCheckPreferenceReceived = true;
    clearAutoCheckPreferenceTimer();
    const persisted = applyPreferences({ ...preferences, automaticUpdatesEnabled: enabled !== false });
    return { enabled: preferences.automaticUpdatesEnabled, persisted };
  });
  ipcMain.handle('lastbrowser:updates:set-channel', (_event, channel: unknown) => {
    if (channel !== 'stable' && channel !== 'preview') return { ...preferences, persisted: false };
    const persisted = applyPreferences({ ...preferences, channel });
    return { ...preferences, persisted };
  });
}

export function startAutoUpdateChecks(): void {
  if (autoCheckPreferenceReceived || autoCheckPreferenceTimer) return;
  // Allow older persisted settings to hydrate before the default-on check starts.
  autoCheckPreferenceTimer = windowDelay(() => {
    autoCheckPreferenceTimer = null;
    if (!autoCheckPreferenceReceived) {
      autoCheckPreferenceReceived = true;
      if (preferences.automaticUpdatesEnabled) scheduleAutoUpdateCheck(6000, true);
    }
  }, 15000);
}

/** Returns the current update status and starts install/relaunch only when the download is complete. */
export function installDownloadedUpdateForAppRestart(): LastbrowserUpdateStatus | null {
  return controller?.quitAndInstall() ?? null;
}

function applyPreferences(next: PersistedUpdatePreferences): boolean {
  const channelChanged = next.channel !== preferences.channel;
  const normalized: PersistedUpdatePreferences = {
    automaticUpdatesEnabled: next.automaticUpdatesEnabled === true,
    channel: next.channel === 'preview' ? 'preview' : 'stable'
  };
  try {
    mkdirSync(path.dirname(preferencesPath), { recursive: true });
    const temporaryPath = `${preferencesPath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(temporaryPath, preferencesPath);
  } catch (error) {
    console.warn('[updates] Could not persist update preferences:', error);
    return false;
  }
  preferences = normalized;
  controller?.setPreferences(preferences);
  if (preferences.automaticUpdatesEnabled) {
    if (channelChanged && autoCheckTimer) {
      clearTimeout(autoCheckTimer);
      autoCheckTimer = null;
    }
    if (autoCheckPreferenceTimer) clearAutoCheckPreferenceTimer();
    scheduleAutoUpdateCheck(6000);
  } else {
    if (autoCheckTimer) clearTimeout(autoCheckTimer);
    autoCheckTimer = null;
    consecutiveAutoCheckRetries = 0;
  }
  return true;
}

function clearAutoCheckPreferenceTimer(): void {
  if (autoCheckPreferenceTimer) clearTimeout(autoCheckPreferenceTimer);
  autoCheckPreferenceTimer = null;
}

function readUpdatePreferences(filePath: string): PersistedUpdatePreferences {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...DEFAULT_UPDATE_PREFERENCES };
    const record = parsed as Record<string, unknown>;
    return {
      automaticUpdatesEnabled: record.automaticUpdatesEnabled !== false,
      channel: record.channel === 'preview' ? 'preview' : 'stable'
    };
  } catch {
    return { ...DEFAULT_UPDATE_PREFERENCES };
  }
}

function scheduleAutoUpdateRetry(): void {
  if (!preferences.automaticUpdatesEnabled || !autoCheckPreferenceReceived || autoCheckTimer) return;
  const retryDelay = AUTO_CHECK_RETRY_DELAYS[consecutiveAutoCheckRetries];
  if (retryDelay === undefined) {
    consecutiveAutoCheckRetries = 0;
    scheduleAutoUpdateCheck(AUTO_CHECK_INTERVAL);
    return;
  }
  consecutiveAutoCheckRetries += 1;
  scheduleAutoUpdateCheck(retryDelay);
}

function scheduleAutoUpdateCheck(delay: number, startupCheck = false): void {
  if (!controller || !autoCheckPreferenceReceived || !preferences.automaticUpdatesEnabled || autoCheckTimer) return;
  autoCheckTimer = windowDelay(() => {
    autoCheckTimer = null;
    if (!preferences.automaticUpdatesEnabled) return;
    void controller?.checkForUpdates(startupCheck).then((status) => {
      if (status.state === 'error') scheduleAutoUpdateRetry();
      else if (['idle', 'disabled', 'not-available'].includes(status.state) && !autoCheckTimer) scheduleAutoUpdateCheck(AUTO_CHECK_INTERVAL);
    }).catch((err) => {
      console.warn('[updates] Auto update check failed:', err);
      scheduleAutoUpdateRetry();
    });
  }, delay);
}

function broadcastUpdateStatus(window: BrowserWindow | null, status: LastbrowserUpdateStatus): void {
  if (window && !window.isDestroyed()) {
    try {
      window.webContents.send('lastbrowser:updates:status', status);
    } catch {
      // Window may have closed during async update transition.
    }
  }
}

function windowDelay(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
  const timer = setTimeout(callback, ms);
  timer.unref?.();
  return timer;
}
