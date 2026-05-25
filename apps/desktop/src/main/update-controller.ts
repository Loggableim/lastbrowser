import { EventEmitter } from 'node:events';

export type UpdateState =
  | 'idle'
  | 'disabled'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export type LastbrowserUpdateStatus = {
  state: UpdateState;
  currentVersion: string;
  availableVersion: string | null;
  percent: number | null;
  lastCheckedAt: string | null;
  message: string | null;
};

type UpdateInfoLike = {
  version?: string;
  releaseName?: string | null;
};

type ProgressLike = {
  percent?: number;
};

export type UpdaterLike = EventEmitter & {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  checkForUpdates: () => Promise<unknown>;
  downloadUpdate: () => Promise<unknown>;
  quitAndInstall: () => void;
};

export type UpdateController = {
  getStatus: () => LastbrowserUpdateStatus;
  checkForUpdates: () => Promise<LastbrowserUpdateStatus>;
  downloadUpdate: () => Promise<LastbrowserUpdateStatus>;
  quitAndInstall: () => LastbrowserUpdateStatus;
};

export type UpdateControllerOptions = {
  updater: UpdaterLike;
  isPackaged: boolean;
  currentVersion: string;
  forceDevUpdates?: boolean;
  allowPrerelease?: boolean;
  onStatusChange?: (status: LastbrowserUpdateStatus) => void;
};

export function createUpdateController(options: UpdateControllerOptions): UpdateController {
  const { updater } = options;
  const enabled = options.isPackaged || options.forceDevUpdates === true;
  let status: LastbrowserUpdateStatus = {
    state: enabled ? 'idle' : 'disabled',
    currentVersion: options.currentVersion,
    availableVersion: null,
    percent: null,
    lastCheckedAt: null,
    message: enabled ? null : 'Auto updates are available only in packaged Lastbrowser builds.'
  };

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = options.allowPrerelease === true;

  function publish(next: Partial<LastbrowserUpdateStatus>): LastbrowserUpdateStatus {
    status = { ...status, ...next };
    options.onStatusChange?.({ ...status });
    return { ...status };
  }

  updater.on('checking-for-update', () => {
    publish({
      state: 'checking',
      percent: null,
      message: 'Checking for Lastbrowser updates.'
    });
  });
  updater.on('update-available', (info: UpdateInfoLike) => {
    publish({
      state: 'available',
      availableVersion: info.version || null,
      percent: 0,
      message: `Lastbrowser ${info.version || 'update'} is available.`
    });
  });
  updater.on('update-not-available', () => {
    publish({
      state: 'not-available',
      availableVersion: null,
      percent: null,
      message: 'Lastbrowser is up to date.'
    });
  });
  updater.on('download-progress', (progress: ProgressLike) => {
    publish({
      state: 'downloading',
      percent: clampPercent(progress.percent),
      message: 'Downloading update.'
    });
  });
  updater.on('update-downloaded', (info: UpdateInfoLike) => {
    publish({
      state: 'downloaded',
      availableVersion: info.version || status.availableVersion,
      percent: 100,
      message: `Lastbrowser ${info.version || 'update'} is ready to install.`
    });
  });
  updater.on('error', (error: unknown) => {
    publish({
      state: 'error',
      percent: null,
      message: error instanceof Error ? error.message : String(error)
    });
  });

  return {
    getStatus: () => ({ ...status }),
    async checkForUpdates(): Promise<LastbrowserUpdateStatus> {
      if (!enabled) return { ...status };
      publish({
        state: 'checking',
        lastCheckedAt: new Date().toISOString(),
        message: 'Checking for Lastbrowser updates.'
      });
      try {
        await updater.checkForUpdates();
      } catch (error) {
        publish({
          state: 'error',
          percent: null,
          message: error instanceof Error ? error.message : String(error)
        });
      }
      return { ...status };
    },
    async downloadUpdate(): Promise<LastbrowserUpdateStatus> {
      if (!enabled) return { ...status };
      if (status.state !== 'available') return { ...status };
      publish({ state: 'downloading', percent: 0, message: 'Downloading update.' });
      try {
        await updater.downloadUpdate();
      } catch (error) {
        publish({
          state: 'error',
          percent: null,
          message: error instanceof Error ? error.message : String(error)
        });
      }
      return { ...status };
    },
    quitAndInstall(): LastbrowserUpdateStatus {
      if (status.state !== 'downloaded') return { ...status };
      updater.quitAndInstall();
      return { ...status };
    }
  };
}

function clampPercent(value: unknown): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.max(0, Math.min(100, Math.round(numberValue)));
}
