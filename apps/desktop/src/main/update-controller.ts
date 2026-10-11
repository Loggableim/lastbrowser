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

export type UpdateChannel = 'stable' | 'preview';

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
  allowDowngrade: boolean;
  channel: string | null;
  checkForUpdates: () => Promise<unknown>;
  downloadUpdate: () => Promise<unknown>;
  /**
   * `isSilent` skips the NSIS wizard (required — the installer is built with
   * `oneClick: false`, so a non-silent call blocks on user clicks).
   * `isForceRunAfter` relaunches the app once the install completes.
   */
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
};

export type UpdateController = {
  getStatus: () => LastbrowserUpdateStatus;
  setPreferences: (preferences: { automaticUpdatesEnabled: boolean; channel: UpdateChannel }) => void;
  checkForUpdates: () => Promise<LastbrowserUpdateStatus>;
  downloadUpdate: () => Promise<LastbrowserUpdateStatus>;
  quitAndInstall: () => LastbrowserUpdateStatus;
};

export type UpdateControllerOptions = {
  updater: UpdaterLike;
  isPackaged: boolean;
  currentVersion: string;
  forceDevUpdates?: boolean;
  offlineTestBuild?: boolean;
  allowPrerelease?: boolean;
  automaticUpdatesEnabled?: boolean;
  updateChannel?: UpdateChannel;
  onStatusChange?: (status: LastbrowserUpdateStatus) => void;
  onUpdateDownloaded?: (fromVersion: string, targetVersion: string) => void;
};

export function createUpdateController(options: UpdateControllerOptions): UpdateController {
  const { updater } = options;
  const offlineTestBuild = options.offlineTestBuild === true;
  const enabled = !offlineTestBuild && (options.isPackaged || options.forceDevUpdates === true);
  let automaticUpdatesEnabled = enabled && options.automaticUpdatesEnabled !== false;
  let channel: UpdateChannel = options.updateChannel === 'preview'
    || (options.updateChannel === undefined && options.allowPrerelease === true) ? 'preview' : 'stable';
  let checkInFlight: Promise<unknown> | null = null;
  let downloadStarted = false;
  let installing = false;
  let status: LastbrowserUpdateStatus = {
    state: enabled ? 'idle' : 'disabled',
    currentVersion: options.currentVersion,
    availableVersion: null,
    percent: null,
    lastCheckedAt: null,
    message: offlineTestBuild
      ? 'Updates are unavailable in offline test builds.'
      : enabled ? null : 'Auto updates are available only in packaged Lastbrowser builds.'
  };

  updater.autoDownload = automaticUpdatesEnabled;
  // electron-updater installs an already-downloaded update silently on a
  // successful app quit when this is enabled. Its quit handler uses
  // install(true, false), so the app is not relaunched unexpectedly.
  updater.autoInstallOnAppQuit = automaticUpdatesEnabled;
  updater.allowDowngrade = false;
  updater.channel = channel === 'preview' ? 'beta' : 'latest';
  updater.allowPrerelease = channel === 'preview';

  function publish(next: Partial<LastbrowserUpdateStatus>): LastbrowserUpdateStatus {
    status = { ...status, ...next };
    options.onStatusChange?.({ ...status });
    return { ...status };
  }

  function applyPreferences(preferences: { automaticUpdatesEnabled: boolean; channel: UpdateChannel }): void {
    automaticUpdatesEnabled = enabled && preferences.automaticUpdatesEnabled;
    channel = preferences.channel === 'preview' ? 'preview' : 'stable';
    updater.autoDownload = automaticUpdatesEnabled;
    updater.autoInstallOnAppQuit = automaticUpdatesEnabled;
    updater.allowDowngrade = false;
    updater.channel = channel === 'preview' ? 'beta' : 'latest';
    updater.allowPrerelease = channel === 'preview';
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
    downloadStarted = updater.autoDownload;
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
    if (info.version) options.onUpdateDownloaded?.(options.currentVersion, info.version);
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
    const message = error instanceof Error ? error.message : String(error);
    if (status.state === 'downloaded') {
      publish({ message });
      return;
    }
    publish({
      state: 'error',
      percent: null,
      message
    });
  });

  return {
    getStatus: () => ({ ...status }),
    setPreferences: applyPreferences,
    async checkForUpdates(): Promise<LastbrowserUpdateStatus> {
      if (!enabled) return { ...status };
      if (hasPendingUpdate()) return { ...status };
      if (checkInFlight) {
        await checkInFlight;
        return { ...status };
      }
      publish({
        state: 'checking',
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
      if ((status.state !== 'available' && status.state !== 'error') || downloadStarted) return { ...status };
      if (status.state === 'error' && !status.availableVersion) return { ...status };
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
      if (status.state !== 'downloaded' || installing) return { ...status };
      // `isSilent = true` is required: the NSIS installer is built with
      // `oneClick: false`, so a non-silent quitAndInstall shows the full setup
      // wizard and BLOCKS waiting for clicks. An auto-update must run without
      // user interaction — verified: without this the installer sat on
      // "Installation von Lastbrowser" indefinitely.
      // `isForceRunAfter = true` relaunches the app when the install finishes.
      try {
        installing = true;
        updater.quitAndInstall(true, true);
      } catch (error) {
        installing = false;
        publish({ message: error instanceof Error ? error.message : String(error) });
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
