import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import electronUpdater, { type AppUpdater } from 'electron-updater';
import http from 'node:http';
import https from 'node:https';
import { createUpdateController, type LastbrowserUpdateStatus, type UpdateController } from './update-controller.js';

const { autoUpdater } = electronUpdater;

let controller: UpdateController | null = null;
let autoCheckTimer: ReturnType<typeof setTimeout> | null = null;
const AUTO_CHECK_INTERVAL = 4 * 60 * 60 * 1000;
let installRequestPending = false;

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

export function registerUpdateIpc(
  getMainWindow: () => BrowserWindow | null,
  hasActiveWork: () => boolean = () => false,
  getLocale: () => string = () => app.getLocale()
): void {
  if (autoCheckTimer) clearTimeout(autoCheckTimer);
  autoCheckTimer = null;
  patchHttpExecutor(autoUpdater);
  controller = createUpdateController({
    updater: autoUpdater as AppUpdater,
    isPackaged: app.isPackaged,
    currentVersion: app.getVersion(),
    forceDevUpdates: process.env.LASTBROWSER_FORCE_DEV_UPDATES === '1',
    allowPrerelease: process.env.LASTBROWSER_ALLOW_PRERELEASE_UPDATES === '1',
    unsupportedReason: process.windowsStore
      ? 'This installation is updated by Microsoft Store.'
      : process.env.PORTABLE_EXECUTABLE_FILE
        ? 'Portable installations must be replaced with the latest portable download.'
        : undefined,
    onStatusChange: (status) => broadcastUpdateStatus(getMainWindow(), status)
  });

  ipcMain.handle('lastbrowser:updates:status', () => controller?.getStatus());
  ipcMain.handle('lastbrowser:updates:check', () => controller?.checkForUpdates());
  ipcMain.handle('lastbrowser:updates:download', () => controller?.downloadUpdate());
  ipcMain.handle('lastbrowser:updates:install', async () => {
    if (!controller || controller.getStatus().state !== 'downloaded' || installRequestPending) return controller?.getStatus();
    installRequestPending = true;
    try {
      if (hasActiveWork()) {
        const de = getLocale().startsWith('de');
        const options = {
          type: 'warning' as const,
          title: 'Lastbrowser',
          message: de ? 'Zum Aktualisieren neu starten?' : 'Restart to update?',
          detail: de ? 'Laufende KI-Aufgaben und Terminals werden beendet. Speichere deine Arbeit vor dem Neustart.' : 'Running AI tasks and terminals will close. Save your work before restarting.',
          buttons: de ? ['Später', 'Aktualisieren und neu starten'] : ['Later', 'Update and restart'],
          defaultId: 0,
          cancelId: 0
        };
        const window = getMainWindow();
        const result = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options);
        if (result.response !== 1) return controller.getStatus();
      }
      return controller.quitAndInstall();
    } finally {
      installRequestPending = false;
    }
  });
  // Retain the old IPC contract for older renderers, but updates are mandatory.
  ipcMain.handle('lastbrowser:updates:set-auto-check-enabled', () => {
    return { enabled: true };
  });
}

export function startAutoUpdateChecks(): void {
  scheduleAutoUpdateCheck(6000, true);
}

function scheduleAutoUpdateCheck(delay: number, startupCheck = false): void {
  if (!controller || autoCheckTimer) return;
  autoCheckTimer = windowDelay(async () => {
    autoCheckTimer = null;
    await controller?.checkForUpdates(startupCheck).catch((err) => {
      console.warn('[updates] Auto update check failed:', err);
    });
    scheduleAutoUpdateCheck(AUTO_CHECK_INTERVAL);
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
