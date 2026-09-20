import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createUpdateController } from '../src/main/update-controller.js';

type FakeUpdater = EventEmitter & {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  checkCalls: number;
  downloadCalls: number;
  quitCalls: number;
  /** Arguments passed to the last quitAndInstall call. */
  quitArgs: unknown[];
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
};

function fakeUpdater(): FakeUpdater {
  const updater = new EventEmitter() as FakeUpdater;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.checkCalls = 0;
  updater.downloadCalls = 0;
  updater.quitCalls = 0;
  updater.quitArgs = [];
  updater.checkForUpdates = async () => {
    updater.checkCalls += 1;
  };
  updater.downloadUpdate = async () => {
    updater.downloadCalls += 1;
  };
  updater.quitAndInstall = (...args: unknown[]) => {
    updater.quitCalls += 1;
    updater.quitArgs = args;
  };
  return updater;
}

describe('update controller', () => {
  it('skips update checks for local development unless explicitly forced', async () => {
    const updater = fakeUpdater();
    const controller = createUpdateController({
      updater,
      isPackaged: false,
      currentVersion: '0.1.3'
    });

    const status = await controller.checkForUpdates();

    expect(status.state).toBe('disabled');
    expect(status.message).toMatch(/packaged/i);
    expect(updater.checkCalls).toBe(0);
  });

  it('tracks available, progress, and downloaded update states', async () => {
    const updater = fakeUpdater();
    const states: string[] = [];
    const controller = createUpdateController({
      updater,
      isPackaged: true,
      currentVersion: '0.1.3',
      onStatusChange: (status) => states.push(status.state)
    });

    await controller.checkForUpdates();
    updater.emit('update-available', { version: '0.1.4' });
    updater.emit('download-progress', { percent: 42.4, bytesPerSecond: 1000, transferred: 10, total: 100 });
    updater.emit('update-downloaded', { version: '0.1.4' });

    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.checkCalls).toBe(1);
    expect(controller.getStatus()).toMatchObject({
      state: 'downloaded',
      currentVersion: '0.1.3',
      availableVersion: '0.1.4',
      percent: 100
    });
    expect(states).toEqual(['checking', 'available', 'downloading', 'downloaded']);
  });

  it('allows installing only after an update has been downloaded', () => {
    const updater = fakeUpdater();
    const controller = createUpdateController({
      updater,
      isPackaged: true,
      currentVersion: '0.1.3'
    });

    expect(controller.quitAndInstall().state).toBe('idle');
    updater.emit('update-downloaded', { version: '0.1.4' });
    expect(controller.quitAndInstall().state).toBe('downloaded');
    expect(updater.quitCalls).toBe(1);
  });

  it('installs silently so the NSIS wizard cannot block the update', async () => {
    const updater = fakeUpdater();
    const controller = createUpdateController({
      updater,
      isPackaged: true,
      currentVersion: '0.1.3'
    });

    updater.emit('update-downloaded', { version: '0.1.4' });
    controller.quitAndInstall();

    // The installer is built with `oneClick: false`, so a non-silent
    // quitAndInstall shows the setup wizard and waits for clicks forever.
    // Verified against the real installer: it sat on "Installation von
    // Lastbrowser" until killed.
    expect(updater.quitArgs[0]).toBe(true);
    expect(updater.quitArgs[1]).toBe(true);
  });

  it('surfaces updater errors as status instead of throwing into the app shell', async () => {
    const updater = fakeUpdater();
    updater.checkForUpdates = async () => {
      updater.checkCalls += 1;
      throw new Error('latest.yml not found');
    };
    const controller = createUpdateController({
      updater,
      isPackaged: true,
      currentVersion: '0.1.3'
    });

    const status = await controller.checkForUpdates();

    expect(status.state).toBe('error');
    expect(status.message).toContain('latest.yml not found');
  });
});
