import { app, BrowserWindow, ipcMain } from 'electron';
import electronUpdater, { type AppUpdater } from 'electron-updater';
import http from 'node:http';
import https from 'node:https';
import { createUpdateController, type LastbrowserUpdateStatus, type UpdateController } from './update-controller.js';

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
  patchHttpExecutor(autoUpdater);
  controller = createUpdateController({
    updater: autoUpdater as AppUpdater,
    isPackaged: app.isPackaged,
    currentVersion: app.getVersion(),
    forceDevUpdates: process.env.LASTBROWSER_FORCE_DEV_UPDATES === '1',
    allowPrerelease: process.env.LASTBROWSER_ALLOW_PRERELEASE_UPDATES === '1',
    onStatusChange: (status) => broadcastUpdateStatus(getMainWindow(), status)
  });

  ipcMain.handle('lastbrowser:updates:status', () => controller?.getStatus());
  ipcMain.handle('lastbrowser:updates:check', () => controller?.checkForUpdates());
  ipcMain.handle('lastbrowser:updates:download', () => controller?.downloadUpdate());
  ipcMain.handle('lastbrowser:updates:install', () => controller?.quitAndInstall());
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
