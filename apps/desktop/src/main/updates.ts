import { app, BrowserWindow, ipcMain } from 'electron';
import electronUpdater, { type AppUpdater } from 'electron-updater';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { createUpdateController, type LastbrowserUpdateStatus, type UpdateController } from './update-controller.js';
import { isOfflineTestBuild } from './update-build-variant.js';
import { acknowledgeUpdateNotice, decideUpdateNotice, parseUpdateNoticeState, recordDownloadedUpdate } from './update-notice-state.js';

const { autoUpdater } = electronUpdater;

let controller: UpdateController | null = null;
let autoChecksEnabled = true;
let autoCheckPreferenceReceived = false;
let autoCheckPreferenceTimer: ReturnType<typeof setTimeout> | null = null;
let autoCheckTimer: ReturnType<typeof setTimeout> | null = null;

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
    allowPrerelease: process.env.LASTBROWSER_ALLOW_PRERELEASE_UPDATES === '1',
    onStatusChange: (status) => broadcastUpdateStatus(getMainWindow(), status),
    onUpdateDownloaded: (fromVersion, targetVersion) => {
      try {
        writeNoticeState(recordDownloadedUpdate(readNoticeState(), fromVersion, targetVersion));
      } catch (error) {
        console.warn('[updates] Could not persist downloaded update marker:', error);
      }
    }
  });

  ipcMain.handle('lastbrowser:updates:status', () => controller?.getStatus());
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
    if (autoCheckPreferenceTimer) {
      clearTimeout(autoCheckPreferenceTimer);
      autoCheckPreferenceTimer = null;
    }
    autoChecksEnabled = enabled !== false;
    if (!autoChecksEnabled && autoCheckTimer) {
      clearTimeout(autoCheckTimer);
      autoCheckTimer = null;
    }
    if (autoChecksEnabled) scheduleAutoUpdateCheck();
    return { enabled: autoChecksEnabled };
  });
}

export function startAutoUpdateChecks(): void {
  if (autoCheckPreferenceReceived || autoCheckPreferenceTimer) return;
  // Give the renderer time to hydrate local or Sidekick settings. If it
  // cannot provide a preference, retain the historical enabled-by-default
  // behavior after the grace period.
  autoCheckPreferenceTimer = windowDelay(() => {
    autoCheckPreferenceTimer = null;
    if (!autoCheckPreferenceReceived) {
      autoCheckPreferenceReceived = true;
      scheduleAutoUpdateCheck();
    }
  }, 15000);
}

/** Returns the current update status and starts install/relaunch only when the download is complete. */
export function installDownloadedUpdateForAppRestart(): LastbrowserUpdateStatus | null {
  return controller?.quitAndInstall() ?? null;
}

function scheduleAutoUpdateCheck(): void {
  if (!controller || !autoCheckPreferenceReceived || !autoChecksEnabled || autoCheckTimer) return;
  autoCheckTimer = windowDelay(() => {
    autoCheckTimer = null;
    if (!autoChecksEnabled) return;
    controller?.checkForUpdates().catch((err) => {
      console.warn('[updates] Auto update check failed:', err);
    });
  }, 6000);
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
