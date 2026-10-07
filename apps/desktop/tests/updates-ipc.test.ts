import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

const { handlers, updater, files, appVersion } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const files = new Map<string, string>();
  const appVersion = { current: '0.1.45' };
  const updater = {
    on: vi.fn(),
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowPrerelease: false,
    checkForUpdates: vi.fn(async () => undefined),
    downloadUpdate: vi.fn(async () => undefined),
    quitAndInstall: vi.fn()
  };
  return { handlers, updater, files, appVersion };
});
const resourcesRoot = 'C:/lastbrowser-test-resources';
const variantMarkerPath = path.join(resourcesRoot, 'lastbrowser-build-variant.json');
const priorResourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;

vi.mock('electron', () => ({
  app: { isPackaged: true, getVersion: () => appVersion.current, getPath: () => 'C:/lastbrowser-test-user-data' },
  BrowserWindow: class {},
  ipcMain: { handle: vi.fn((name: string, handler: (...args: unknown[]) => unknown) => handlers.set(name, handler)) }
}));

vi.mock('electron-updater', () => ({ default: { autoUpdater: updater } }));
vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((filePath: string) => {
    const value = files.get(filePath);
    if (value === undefined) throw new Error('ENOENT');
    return value;
  }),
  writeFileSync: vi.fn((filePath: string, data: string) => files.set(filePath, data)),
  renameSync: vi.fn((from: string, to: string) => {
    const value = files.get(from);
    if (value === undefined) throw new Error('ENOENT');
    files.set(to, value);
    files.delete(from);
  })
}));

import { registerUpdateIpc, startAutoUpdateChecks } from '../src/main/updates.js';

describe('native update preference IPC', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(process, 'resourcesPath', { configurable: true, writable: true, value: resourcesRoot });
    handlers.clear();
    files.clear();
    appVersion.current = '0.1.45';
    updater.checkForUpdates.mockReset().mockResolvedValue(undefined);
    registerUpdateIpc(() => null);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (priorResourcesPath === undefined) delete (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
    else Object.defineProperty(process, 'resourcesPath', { configurable: true, writable: true, value: priorResourcesPath });
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

  it('disables update checks only for an exact version-bound offline preview marker', async () => {
    files.set(variantMarkerPath, JSON.stringify({ schemaVersion: 1, variant: 'offline-test', appVersion: '0.1.45' }));
    registerUpdateIpc(() => null);
    const status = handlers.get('lastbrowser:updates:status');
    const manualCheck = handlers.get('lastbrowser:updates:check');

    expect(status?.({})).toMatchObject({ state: 'disabled', message: 'Updates are unavailable in offline test builds.' });
    await expect(manualCheck?.({})).resolves.toMatchObject({ state: 'disabled' });
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it.each([
    ['a regular release with no marker', null],
    ['a malformed marker', '{not-json'],
    ['a marker for another app version', JSON.stringify({ schemaVersion: 1, variant: 'offline-test', appVersion: '0.1.44' })],
  ])('keeps real updater errors visible for %s', async (_label, marker) => {
    if (marker !== null) files.set(variantMarkerPath, marker);
    updater.checkForUpdates.mockRejectedValue(new Error('ENOENT: resources/app-update.yml'));
    registerUpdateIpc(() => null);

    const manualCheck = handlers.get('lastbrowser:updates:check');
    await expect(manualCheck?.({})).resolves.toMatchObject({
      state: 'error',
      message: expect.stringContaining('resources/app-update.yml')
    });
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('sets first-launch baseline, exposes a later version change, and persists one-time acknowledgement', async () => {
    const candidate = handlers.get('lastbrowser:updates:whats-new-candidate');
    const acknowledge = handlers.get('lastbrowser:updates:whats-new-acknowledge');
    expect(candidate?.({})).toBeNull();

    appVersion.current = '0.1.46';
    expect(candidate?.({})).toEqual({ fromVersion: '0.1.45', toVersion: '0.1.46' });
    expect(acknowledge?.({}, '0.1.45')).toEqual({ acknowledged: false });
    expect(acknowledge?.({}, '0.1.46')).toEqual({ acknowledged: true });
    expect(candidate?.({})).toBeNull();
  });

  it('does not mark an update as seen when the current candidate has no release notes to present', async () => {
    const candidate = handlers.get('lastbrowser:updates:whats-new-candidate');
    const acknowledge = handlers.get('lastbrowser:updates:whats-new-acknowledge');
    expect(candidate?.({})).toBeNull();
    appVersion.current = '0.1.47';
    expect(candidate?.({})).toEqual({ fromVersion: '0.1.45', toVersion: '0.1.47' });
    expect(acknowledge?.({}, '0.1.46')).toEqual({ acknowledged: false });
    expect(candidate?.({})).toEqual({ fromVersion: '0.1.45', toVersion: '0.1.47' });
  });
});
