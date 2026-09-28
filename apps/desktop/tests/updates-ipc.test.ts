import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handlers, updater } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const updater = {
    on: vi.fn(),
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowPrerelease: false,
    checkForUpdates: vi.fn(async () => undefined),
    downloadUpdate: vi.fn(async () => undefined),
    quitAndInstall: vi.fn()
  };
  return { handlers, updater };
});

vi.mock('electron', () => ({
  app: { isPackaged: true, getVersion: () => '0.1.35' },
  BrowserWindow: class {},
  ipcMain: { handle: vi.fn((name: string, handler: (...args: unknown[]) => unknown) => handlers.set(name, handler)) }
}));

vi.mock('electron-updater', () => ({ default: { autoUpdater: updater } }));

import { registerUpdateIpc, startAutoUpdateChecks } from '../src/main/updates.js';

describe('native update preference IPC', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    handlers.clear();
    updater.checkForUpdates.mockClear();
    registerUpdateIpc(() => null);
  });

  it('waits for stored preference and keeps manual checks available when automatic checks are disabled', async () => {
    startAutoUpdateChecks();
    await vi.advanceTimersByTimeAsync(16000);
    expect(updater.checkForUpdates).not.toHaveBeenCalled();

    const setEnabled = handlers.get('lastbrowser:updates:set-auto-check-enabled');
    const manualCheck = handlers.get('lastbrowser:updates:check');
    expect(setEnabled).toBeDefined();
    expect(manualCheck).toBeDefined();
    expect(setEnabled?.({}, false)).toEqual({ enabled: false });
    await vi.advanceTimersByTimeAsync(7000);
    expect(updater.checkForUpdates).not.toHaveBeenCalled();

    await manualCheck?.({});
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('schedules one automatic check after the renderer enables updates', async () => {
    startAutoUpdateChecks();
    const setEnabled = handlers.get('lastbrowser:updates:set-auto-check-enabled');
    expect(setEnabled?.({}, true)).toEqual({ enabled: true });
    await vi.advanceTimersByTimeAsync(5999);
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
