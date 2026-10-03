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
  startupCheck?: boolean;
  installError?: string | null;
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
  /**
   * `isSilent` keeps updates invisible even with the one-click installer.
   * `isForceRunAfter` relaunches the app once the install completes.
   */
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
};

export type UpdateController = {
  getStatus: () => LastbrowserUpdateStatus;
  checkForUpdates: (startupCheck?: boolean) => Promise<LastbrowserUpdateStatus>;
  downloadUpdate: () => Promise<LastbrowserUpdateStatus>;
  quitAndInstall: () => LastbrowserUpdateStatus;
};

export type UpdateControllerOptions = {
  updater: UpdaterLike;
  isPackaged: boolean;
  currentVersion: string;
  forceDevUpdates?: boolean;
  allowPrerelease?: boolean;
  unsupportedReason?: string;
  onStatusChange?: (status: LastbrowserUpdateStatus) => void;
};

export function createUpdateController(options: UpdateControllerOptions): UpdateController {
  const { updater } = options;
  const enabled = !options.unsupportedReason && (options.isPackaged || options.forceDevUpdates === true);
  let checkInFlight: Promise<unknown> | null = null;
  let downloadStarted = false;
  let installing = false;
  let status: LastbrowserUpdateStatus = {
    state: enabled ? 'idle' : 'disabled',
    currentVersion: options.currentVersion,
    availableVersion: null,
    percent: null,
    lastCheckedAt: null,
    message: enabled ? null : options.unsupportedReason || 'Auto updates are available only in packaged Lastbrowser builds.'
  };

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = options.allowPrerelease === true;

  function publish(next: Partial<LastbrowserUpdateStatus>): LastbrowserUpdateStatus {
    status = { ...status, ...next };
    options.onStatusChange?.({ ...status });
    return { ...status };
  }

  function hasPendingUpdate(): boolean {
    return status.state === 'available' || status.state === 'downloading' || status.state === 'downloaded';
  }

  updater.on('checking-for-update', () => {
    if (!enabled || hasPendingUpdate()) return;
    publish({
      state: 'checking',
      percent: null,
      message: 'Checking for Lastbrowser updates.'
    });
  });
  updater.on('update-available', (info: UpdateInfoLike) => {
    if (!enabled || status.state === 'downloaded' || status.state === 'downloading') return;
    downloadStarted = true; // electron-updater starts this download automatically.
    publish({
      state: 'available',
      availableVersion: info.version || null,
      percent: 0,
      message: `Lastbrowser ${info.version || 'update'} is available.`
    });
  });
  updater.on('update-not-available', () => {
    if (!enabled || hasPendingUpdate()) return;
    publish({
      state: 'not-available',
      availableVersion: null,
      percent: null,
      message: 'Lastbrowser is up to date.'
    });
  });
  updater.on('download-progress', (progress: ProgressLike) => {
    if (!enabled || status.state === 'downloaded') return;
    publish({
      state: 'downloading',
      percent: clampPercent(progress.percent),
      message: 'Downloading update.'
    });
  });
  updater.on('update-downloaded', (info: UpdateInfoLike) => {
    if (!enabled) return;
    publish({
      state: 'downloaded',
      availableVersion: info.version || status.availableVersion,
      percent: 100,
      message: `Lastbrowser ${info.version || 'update'} is ready to install.`
    });
  });
  updater.on('error', (error: unknown) => {
    if (!enabled) return;
    downloadStarted = false;
    installing = false;
    if (status.state === 'downloaded') {
      publish({ message: error instanceof Error ? error.message : String(error), installError: error instanceof Error ? error.message : String(error) });
      return;
    }
    publish({
      state: 'error',
      percent: null,
      message: error instanceof Error ? error.message : String(error)
    });
  });

  return {
    getStatus: () => ({ ...status }),
    async checkForUpdates(startupCheck = false): Promise<LastbrowserUpdateStatus> {
      if (!enabled || hasPendingUpdate()) return { ...status };
      if (checkInFlight) {
        await checkInFlight;
        return { ...status };
      }
      publish({
        state: 'checking',
        startupCheck,
        lastCheckedAt: new Date().toISOString(),
        message: 'Checking for Lastbrowser updates.'
      });
      try {
        checkInFlight = updater.checkForUpdates();
        await checkInFlight;
      } catch (error) {
        if (status.state !== 'downloaded') publish({
          state: 'error',
          percent: null,
          message: error instanceof Error ? error.message : String(error)
        });
      } finally {
        checkInFlight = null;
      }
      return { ...status };
    },
    async downloadUpdate(): Promise<LastbrowserUpdateStatus> {
      if (!enabled) return { ...status };
      if (status.state !== 'available' || downloadStarted) return { ...status };
      downloadStarted = true;
      publish({ state: 'downloading', percent: 0, message: 'Downloading update.' });
      try {
        await updater.downloadUpdate();
      } catch (error) {
        downloadStarted = false;
        publish({
          state: 'error',
          percent: null,
          message: error instanceof Error ? error.message : String(error)
        });
      }
      return { ...status };
    },
    quitAndInstall(): LastbrowserUpdateStatus {
      if (!enabled || status.state !== 'downloaded' || installing) return { ...status };
      installing = true;
      publish({ installError: null });
      try {
        updater.quitAndInstall(true, true);
      } catch (error) {
        installing = false;
        publish({ message: error instanceof Error ? error.message : String(error), installError: error instanceof Error ? error.message : String(error) });
      }
      return { ...status };
    }
  };
}

function clampPercent(value: unknown): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.max(0, Math.min(100, Math.round(numberValue)));
}
