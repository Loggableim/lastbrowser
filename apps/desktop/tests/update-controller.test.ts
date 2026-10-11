import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createUpdateController } from '../src/main/update-controller.js';

type FakeUpdater = EventEmitter & {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  channel: string;
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
  let currentChannel = 'latest';
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  Object.defineProperty(updater, 'channel', {
    configurable: true,
    enumerable: true,
    get: () => currentChannel,
    set: (value: string) => {
      currentChannel = value;
      // Mirrors the locked electron-updater 6.8.3 AppUpdater.channel setter.
      updater.allowDowngrade = true;
    }
  });
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
  it('defaults to background downloads, silent install-on-quit, and the stable release channel', () => {
    const updater = fakeUpdater();
    const controller = createUpdateController({
      updater,
      isPackaged: true,
      currentVersion: '0.1.3'
    });

    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(updater.allowPrerelease).toBe(false);
    expect(updater.allowDowngrade).toBe(false);
    expect(updater.channel).toBe('latest');
    expect(controller.getStatus().state).toBe('idle');
  });

  it('does not allow downgrades when a saved preview channel is applied at startup', () => {
    const updater = fakeUpdater();
    const controller = createUpdateController({
      updater,
      isPackaged: true,
      currentVersion: '0.1.3',
      updateChannel: 'preview'
    });

    expect(updater.channel).toBe('beta');
    expect(updater.allowPrerelease).toBe(true);
    expect(updater.allowDowngrade).toBe(false);
    expect(controller.getStatus().state).toBe('idle');
  });

  it('applies automatic-update and channel preferences without enabling prereleases on stable', () => {
    const updater = fakeUpdater();
    // The fake models electron-updater's actual side effect before exercising
    // the controller consumer, so this fails if the controller only sets the
    // downgrade guard before assigning a channel.
    updater.channel = 'beta';
    expect(updater.allowDowngrade).toBe(true);
    const controller = createUpdateController({ updater, isPackaged: true, currentVersion: '0.1.3' });
    expect(updater.allowDowngrade).toBe(false);

    controller.setPreferences({ automaticUpdatesEnabled: false, channel: 'preview' });
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowPrerelease).toBe(true);
    expect(updater.channel).toBe('beta');
    expect(updater.allowDowngrade).toBe(false);

    controller.setPreferences({ automaticUpdatesEnabled: true, channel: 'stable' });
    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(updater.allowPrerelease).toBe(false);
    expect(updater.channel).toBe('latest');
    expect(updater.allowDowngrade).toBe(false);
  });

  it('coalesces concurrent checks and preserves a downloaded update across later events', async () => {
    const updater = fakeUpdater();
    let finish!: () => void;
    updater.checkForUpdates = () => {
      updater.checkCalls += 1;
      return new Promise<void>((resolve) => { finish = resolve; });
    };
    const controller = createUpdateController({ updater, isPackaged: true, currentVersion: '0.1.3' });
    const first = controller.checkForUpdates();
    const second = controller.checkForUpdates();
    expect(updater.checkCalls).toBe(1);
    updater.emit('update-downloaded', { version: '0.1.4' });
    finish();
    await Promise.all([first, second]);
    await controller.checkForUpdates();
    updater.emit('checking-for-update');
    updater.emit('update-not-available');
    updater.emit('error', new Error('temporary network failure'));
    expect(controller.getStatus()).toMatchObject({ state: 'downloaded', availableVersion: '0.1.4', percent: 100 });
    expect(updater.checkCalls).toBe(1);
  });

  it('does not start a duplicate manual download while autoDownload owns the transfer', async () => {
    const updater = fakeUpdater();
    const controller = createUpdateController({ updater, isPackaged: true, currentVersion: '0.1.3' });
    updater.emit('update-available', { version: '0.1.4' });

    await controller.downloadUpdate();

    expect(updater.downloadCalls).toBe(0);
  });

  it('keeps a verified download available when the silent installer cannot launch', () => {
    const updater = fakeUpdater();
    const controller = createUpdateController({ updater, isPackaged: true, currentVersion: '0.1.3' });
    updater.emit('update-downloaded', { version: '0.1.4' });
    updater.quitAndInstall = () => { throw new Error('installer could not start'); };

    expect(controller.quitAndInstall()).toMatchObject({ state: 'downloaded', message: 'installer could not start' });
    updater.quitAndInstall = (...args: unknown[]) => { updater.quitCalls += 1; updater.quitArgs = args; };
    controller.quitAndInstall();

    expect(updater.quitCalls).toBe(1);
    expect(updater.quitArgs).toEqual([true, true]);
  });

  it.each([
    'sha512 checksum does not match',
    'ERR_UPDATER_INVALID_SIGNATURE: publisher mismatch',
    'ENOSPC: no space left on device'
  ])('does not install a failed download and allows a later retry (%s)', async (errorMessage) => {
    const updater = fakeUpdater();
    const controller = createUpdateController({ updater, isPackaged: true, currentVersion: '0.1.3' });
    updater.emit('update-available', { version: '0.1.4' });
    updater.emit('error', new Error(errorMessage));

    expect(controller.getStatus()).toMatchObject({ state: 'error', message: errorMessage });
    expect(controller.quitAndInstall().state).toBe('error');
    expect(updater.quitCalls).toBe(0);

    await controller.downloadUpdate();
    expect(updater.downloadCalls).toBe(1);
  });

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
    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(updater.checkCalls).toBe(1);
    expect(controller.getStatus()).toMatchObject({
      state: 'downloaded',
      currentVersion: '0.1.3',
      availableVersion: '0.1.4',
      percent: 100
    });
    expect(states).toEqual(['checking', 'available', 'downloading', 'downloaded']);
  });

  it('records the downloaded from/to versions for the next successful launch', () => {
    const updater = fakeUpdater();
    const downloaded: Array<[string, string]> = [];
    createUpdateController({
      updater,
      isPackaged: true,
      currentVersion: '0.1.45',
      onUpdateDownloaded: (fromVersion, targetVersion) => downloaded.push([fromVersion, targetVersion])
    });

    updater.emit('update-downloaded', { version: '0.1.46' });

    expect(downloaded).toEqual([['0.1.45', '0.1.46']]);
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
