import { app, BrowserWindow, ipcMain } from 'electron';
import electronUpdater, { type AppUpdater } from 'electron-updater';
import { createUpdateController, type LastbrowserUpdateStatus, type UpdateController } from './update-controller.js';

const { autoUpdater } = electronUpdater;

let controller: UpdateController | null = null;

export function registerUpdateIpc(getMainWindow: () => BrowserWindow | null): void {
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
}

export function startAutoUpdateChecks(): void {
  if (!controller) return;
  windowDelay(() => {
    void controller?.checkForUpdates();
  }, 6000);
}

function broadcastUpdateStatus(window: BrowserWindow | null, status: LastbrowserUpdateStatus): void {
  window?.webContents.send('lastbrowser:updates:status', status);
}

function windowDelay(callback: () => void, ms: number): void {
  setTimeout(callback, ms).unref?.();
}
