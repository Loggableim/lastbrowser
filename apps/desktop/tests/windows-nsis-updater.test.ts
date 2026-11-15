import type { DownloadExecutorTask } from 'electron-updater/out/AppUpdater.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WindowsNsisUpdater } from '../src/main/windows-nsis-updater.js';

const mocks = vi.hoisted(() => ({
  done: vi.fn(),
  clear: vi.fn(),
  task: vi.fn(),
  install: vi.fn(),
  readFile: vi.fn(),
  verify: vi.fn(),
  fresh: false,
  installer: 'C:\\Updates\\LastBrowser setup.exe',
}));

vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile }));
vi.mock('../src/main/windows-update-signature.js', () => ({ verifyWindowsUpdateSignature: mocks.verify }));
vi.mock('electron-updater/out/DownloadedUpdateHelper.js', () => ({
  default: { DownloadedUpdateHelper: class {
    async validateDownloadedPath() { return mocks.fresh ? null : mocks.installer; }
    clear = mocks.clear;
  } },
}));
vi.mock('electron-updater', () => ({
  default: { NsisUpdater: class {
    protected app = { appUpdateConfigPath: 'C:\\LastBrowser\\resources\\app-update.yml', baseCachePath: 'C:\\Cache' };
    protected downloadedUpdateHelper: { validateDownloadedPath(): Promise<string | null> } | null = null;
    install(...args: unknown[]) { return mocks.install(...args); }
    async executeDownload(options: DownloadExecutorTask) {
      const cached = this.downloadedUpdateHelper
        ? await this.downloadedUpdateHelper.validateDownloadedPath()
        : mocks.fresh ? null : mocks.installer;
      if (cached === null) await options.task(mocks.installer, {} as Parameters<DownloadExecutorTask['task']>[1], null, async () => {});
      // BaseUpdater supplies its own completion event, ignoring a custom done callback.
      await mocks.done({ downloadedFile: mocks.installer });
      return [mocks.installer];
    }
  } },
}));

class TestUpdater extends WindowsNsisUpdater {
  run(packageInfo?: object) {
    // The pinned parent supplies the other task metadata. Only these two callbacks are overridden.
    return this.executeDownload({ task: mocks.task, fileInfo: { packageInfo } } as unknown as DownloadExecutorTask);
  }
}

describe('Windows NSIS updater', () => {
  const publisher = 'CN=LastBrowser Test Publisher, O=LastBrowser Test Publisher, C=DE';

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.fresh = false;
    mocks.readFile.mockResolvedValue(`publisherName:\n  - '${publisher}'\nupdaterCacheDirName: lastbrowser-updater\n`);
    mocks.clear.mockResolvedValue(undefined);
    mocks.install.mockReturnValue(true);
    mocks.verify.mockResolvedValue(null);
  });

  it('validates a cached installer before exposing the completed download', async () => {
    const updater = new TestUpdater();
    expect(updater.disableWebInstaller).toBe(true);
    expect(updater.verifyUpdateCodeSignature).toBe(mocks.verify);
    await expect(updater.run()).resolves.toEqual([mocks.installer]);
    expect(mocks.verify).toHaveBeenCalledWith([publisher], mocks.installer);
    expect(mocks.verify.mock.invocationCallOrder[0]).toBeLessThan(mocks.done.mock.invocationCallOrder[0]);
  });

  it('clears a cached installer that fails the publisher check and emits no completed download', async () => {
    mocks.verify.mockResolvedValue('Publisher signature does not match.');
    await expect(new TestUpdater().run()).rejects.toMatchObject({ code: 'ERR_UPDATER_INVALID_SIGNATURE' });
    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(mocks.done).not.toHaveBeenCalled();
  });

  it('prevents the quit handler from installing while the current candidate is being checked', async () => {
    let accept: (value: null) => void = () => {};
    mocks.verify.mockReturnValue(new Promise(resolve => { accept = resolve; }));
    const updater = new TestUpdater();
    const pending = updater.run();
    await vi.waitFor(() => expect(mocks.verify).toHaveBeenCalledOnce());
    expect(updater.install()).toBe(false);
    expect(mocks.install).not.toHaveBeenCalled();
    accept(null);
    await pending;
    expect(updater.install()).toBe(true);
  });

  it('fails closed when the cached download cannot be checked against the installed configuration', async () => {
    mocks.readFile.mockRejectedValue(new Error('Missing installed configuration'));
    await expect(new TestUpdater().run()).rejects.toThrow('Missing installed configuration');
    expect(mocks.done).not.toHaveBeenCalled();
  });

  it('rejects a malformed signed publisher configuration before completing any update', async () => {
    mocks.readFile.mockResolvedValue('publisherName: null\nupdaterCacheDirName: lastbrowser-updater\n');
    await expect(new TestUpdater().run()).rejects.toThrow('publisher or cache configuration is invalid');
    expect(mocks.done).not.toHaveBeenCalled();
  });

  it('refuses cached web installers before the parent can complete them', async () => {
    await expect(new TestUpdater().run({ path: 'remote-payload.7z' })).rejects.toMatchObject({ code: 'ERR_UPDATER_WEB_INSTALLER_DISABLED' });
    expect(mocks.done).not.toHaveBeenCalled();
  });

  it('leaves explicitly unsigned builds without a configured publisher able to use their cache', async () => {
    mocks.readFile.mockResolvedValue('provider: github\nchannel: beta\n');
    await expect(new TestUpdater().run()).resolves.toEqual([mocks.installer]);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it('preserves the pinned upstream download and verification path for a fresh installer', async () => {
    mocks.fresh = true;
    await expect(new TestUpdater().run()).resolves.toEqual([mocks.installer]);
    expect(mocks.task).toHaveBeenCalledOnce();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
});
