import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { handlers, updater, confirmRestart, userData } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const updater = {
    on: vi.fn(),
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowPrerelease: false,
    channel: null as string | null,
    checkForUpdates: vi.fn(async () => undefined),
    downloadUpdate: vi.fn(async () => undefined),
    quitAndInstall: vi.fn()
  };
  return { handlers, updater, confirmRestart: vi.fn(async () => ({ response: 0 })), userData: { dir: '' } };
});

vi.mock('electron', () => ({
  app: { isPackaged: true, getVersion: () => '0.1.35', getLocale: () => 'de', getPath: () => userData.dir },
  dialog: { showMessageBox: confirmRestart },
  BrowserWindow: class {},
  ipcMain: { handle: vi.fn((name: string, handler: (...args: unknown[]) => unknown) => handlers.set(name, handler)) }
}));

vi.mock('electron-updater', () => ({ default: { autoUpdater: updater } }));

import { registerUpdateIpc, startAutoUpdateChecks } from '../src/main/updates.js';
import { loadUpdatePreferences, saveUpdatePreferences } from '../src/main/update-preferences.js';

const directories: string[] = [];

describe('native update preference IPC', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    handlers.clear();
    updater.checkForUpdates.mockClear();
    updater.quitAndInstall.mockClear();
    updater.on.mockClear();
    updater.allowPrerelease = false;
    updater.channel = null;
    for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
    userData.dir = mkdtempSync(path.join(tmpdir(), 'lastbrowser-updates-ipc-'));
    directories.push(userData.dir);
    registerUpdateIpc(() => null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('checks every four hours even if an older renderer requests disabling updates', async () => {
    startAutoUpdateChecks();
    await vi.advanceTimersByTimeAsync(6000);
    expect(handlers.get('lastbrowser:updates:status')?.()).toMatchObject({ startupCheck: true });
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(handlers.get('lastbrowser:updates:status')?.()).toMatchObject({ startupCheck: false });
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    handlers.get('lastbrowser:updates:set-auto-check-enabled')?.({}, false);
    await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1000);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it('continues checking after a network failure', async () => {
    updater.checkForUpdates.mockRejectedValueOnce(new Error('offline'));
    startAutoUpdateChecks();
    await vi.advanceTimersByTimeAsync(6000 + 4 * 60 * 60 * 1000);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('requires consent before stopping running terminals or AI work', async () => {
    registerUpdateIpc(() => null, () => true);
    const downloaded = updater.on.mock.calls.findLast(([event]) => event === 'update-downloaded');
    downloaded?.[1]({ version: '0.1.36' });
    const install = handlers.get('lastbrowser:updates:install');
    confirmRestart.mockResolvedValueOnce({ response: 0 });
    await install?.({});
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    confirmRestart.mockResolvedValueOnce({ response: 1 });
    await install?.({});
    expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true);
    vi.useRealTimers();
  });

  it('ignores the legacy opt-out while retaining manual checks', async () => {
    expect(handlers.get('lastbrowser:updates:set-auto-check-enabled')?.({}, false)).toEqual({ enabled: true });
    startAutoUpdateChecks();
    await vi.advanceTimersByTimeAsync(6000);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    await handlers.get('lastbrowser:updates:check')?.({});
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('checks on startup without waiting for renderer or backend settings', async () => {
    startAutoUpdateChecks();
    const setEnabled = handlers.get('lastbrowser:updates:set-auto-check-enabled');
    expect(setEnabled?.({}, true)).toEqual({ enabled: true });
    await vi.advanceTimersByTimeAsync(5999);
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('starts on the stable channel by default', () => {
    expect(handlers.get('lastbrowser:updates:status')?.()).toMatchObject({ channel: 'stable' });
    expect(loadUpdatePreferences(userData.dir)).toEqual({ channel: 'stable' });
  });

  it('starts from a persisted channel preference on the next launch', () => {
    saveUpdatePreferences(userData.dir, { channel: 'beta' });
    registerUpdateIpc(() => null);
    expect(handlers.get('lastbrowser:updates:status')?.()).toMatchObject({ channel: 'beta' });
    expect(updater.allowPrerelease).toBe(true);
    expect(updater.channel).toBe('beta');
  });

  it('persists the selected channel and immediately re-checks the new feed', () => {
    const result = handlers.get('lastbrowser:updates:set-channel')?.({}, 'beta') as { ok?: boolean; channel?: string };

    expect(result).toMatchObject({ ok: true, channel: 'beta' });
    expect(updater.allowPrerelease).toBe(true);
    expect(updater.channel).toBe('beta');
    expect(loadUpdatePreferences(userData.dir)).toEqual({ channel: 'beta' });
    expect(updater.checkForUpdates).toHaveBeenCalled();
  });

  it('rejects an unsupported channel without touching the updater', () => {
    const result = handlers.get('lastbrowser:updates:set-channel')?.({}, 'nightly') as { ok?: boolean; error?: string };

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/stable.*beta/i);
    expect(updater.allowPrerelease).toBe(false);
    expect(loadUpdatePreferences(userData.dir)).toEqual({ channel: 'stable' });
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });
});
