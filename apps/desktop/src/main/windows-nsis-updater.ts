import electronUpdater from 'electron-updater';
import type { DownloadExecutorTask } from 'electron-updater/out/AppUpdater.js';
import updateHelpers from 'electron-updater/out/DownloadedUpdateHelper.js';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { verifyWindowsUpdateSignature } from './windows-update-signature.js';

const { load } = createRequire(import.meta.url)('js-yaml') as { load: (source: string) => unknown };

class SignedDownloadedUpdateHelper extends updateHelpers.DownloadedUpdateHelper {
  constructor(cachePath: string, private readonly publishers: string[]) {
    super(cachePath);
  }

  async validateDownloadedPath(...args: Parameters<InstanceType<typeof updateHelpers.DownloadedUpdateHelper>['validateDownloadedPath']>): Promise<string | null> {
    const installer = await super.validateDownloadedPath(...args);
    if (installer === null) return null;
    const rejected = await verifyWindowsUpdateSignature(this.publishers, installer);
    if (rejected === null) return installer;
    await this.clear().catch(() => undefined);
    throw Object.assign(new Error(rejected), { code: 'ERR_UPDATER_INVALID_SIGNATURE' });
  }
}

export class WindowsNsisUpdater extends electronUpdater.NsisUpdater {
  private checkingDownload = false;

  constructor() {
    super();
    this.verifyUpdateCodeSignature = verifyWindowsUpdateSignature;
    this.disableWebInstaller = true;
  }

  protected async executeDownload(options: DownloadExecutorTask): Promise<string[]> {
    if (options.fileInfo.packageInfo != null) {
      throw Object.assign(new Error('LastBrowser updates require a standalone installer.'), {
        code: 'ERR_UPDATER_WEB_INSTALLER_DISABLED',
      });
    }
    this.checkingDownload = true;
    try {
      if (!this.downloadedUpdateHelper) await this.initializeSignedCache();
      return await super.executeDownload(options);
    } finally {
      this.checkingDownload = false;
    }
  }

  install(isSilent?: boolean, isForceRunAfter?: boolean): boolean {
    // The upstream cache records its candidate before our Authenticode check finishes.
    if (this.checkingDownload) return false;
    return super.install(isSilent, isForceRunAfter);
  }

  private async initializeSignedCache(): Promise<void> {
    const config = load(await readFile(this.app.appUpdateConfigPath, 'utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('The Windows update configuration could not be verified.');
    }
    if (!Object.hasOwn(config, 'publisherName')) return;

    const { publisherName, updaterCacheDirName } = config as Record<string, unknown>;
    const configured = Array.isArray(publisherName) ? publisherName : [publisherName];
    const names = configured.filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
    if (!names.length || names.length !== configured.length
      || typeof updaterCacheDirName !== 'string' || !/^[a-z0-9][a-z0-9_.-]*$/i.test(updaterCacheDirName)) {
      throw new Error('The Windows update publisher or cache configuration is invalid.');
    }
    this.downloadedUpdateHelper = new SignedDownloadedUpdateHelper(path.join(this.app.baseCachePath, updaterCacheDirName), names);
  }
}
