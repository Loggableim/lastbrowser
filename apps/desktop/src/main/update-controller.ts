import { EventEmitter } from 'node:events';
import type { UpdateInfo } from 'builder-util-runtime';

export type UpdateState =
  | 'idle'
  | 'disabled'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export type UpdateChannel = 'stable' | 'beta';
type UpdateChannelInput = UpdateChannel | 'preview';

/** The old Preview preference was already an opt-in to the beta feed. */
export function normalizeUpdateChannel(value: unknown): UpdateChannel {
  return value === 'beta' || value === 'preview' ? 'beta' : 'stable';
}

export function isVersionAllowedInChannel(version: unknown, channel: UpdateChannel): boolean {
  if (typeof version !== 'string') return false;
  const match = /^\d+\.\d+\.\d+(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  return !!match && (!match[1] || channel === 'beta' && /^beta\.\d+$/.test(match[1]));
}

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
  allowDowngrade: boolean;
  channel: string | null;
  isUpdateSupported?: (info: UpdateInfo) => boolean | Promise<boolean>;
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
  setPreferences: (preferences: { automaticUpdatesEnabled: boolean; channel: UpdateChannelInput }) => void;
  checkForUpdates: (startupCheck?: boolean) => Promise<LastbrowserUpdateStatus>;
  downloadUpdate: () => Promise<LastbrowserUpdateStatus>;
  quitAndInstall: () => LastbrowserUpdateStatus;
};

export type UpdateControllerOptions = {
  updater: UpdaterLike;
  isPackaged: boolean;
  currentVersion: string;
  unsupportedReason?: string;
  forceDevUpdates?: boolean;
  offlineTestBuild?: boolean;
  allowPrerelease?: boolean;
  automaticUpdatesEnabled?: boolean;
  updateChannel?: UpdateChannelInput;
  onStatusChange?: (status: LastbrowserUpdateStatus) => void;
  onUpdateDownloaded?: (fromVersion: string, targetVersion: string) => void;
};

export function createUpdateController(options: UpdateControllerOptions): UpdateController {
  const { updater } = options;
  const offlineTestBuild = options.offlineTestBuild === true;
  const unsupportedReason = options.unsupportedReason?.trim() || null;
  const enabled = !offlineTestBuild && !unsupportedReason && (options.isPackaged || options.forceDevUpdates === true);
  let automaticUpdatesEnabled = enabled && options.automaticUpdatesEnabled !== false;
  let channel: UpdateChannel = normalizeUpdateChannel(options.updateChannel
    ?? (options.allowPrerelease === true ? 'beta' : 'stable'));
  let checkInFlight: Promise<unknown> | null = null;
  let downloadStarted = false;
  let installing = false;
  let status: LastbrowserUpdateStatus = {
    state: enabled ? 'idle' : 'disabled',
    currentVersion: options.currentVersion,
    availableVersion: null,
    percent: null,
    lastCheckedAt: null,
    startupCheck: false,
    installError: null,
    message: offlineTestBuild
      ? 'Updates are unavailable in offline test builds.'
      : unsupportedReason ?? (enabled ? null : 'Auto updates are available only in packaged Lastbrowser builds.')
  };

  updater.autoDownload = automaticUpdatesEnabled;
  // electron-updater installs an already-downloaded update silently on a
  // successful app quit when this is enabled. Its quit handler uses
  // install(true, false), so the app is not relaunched unexpectedly.
  updater.autoInstallOnAppQuit = automaticUpdatesEnabled;
  updater.channel = channel === 'beta' ? 'beta' : 'latest';
  // electron-updater 6.8.3's channel setter enables downgrades. Reassert the
  // guard after assigning the channel so beta/stable changes cannot bypass it.
  updater.allowDowngrade = false;
  updater.allowPrerelease = channel === 'beta';
  // Enforce the selected channel before electron-updater offers/downloads an
  // artifact, including a wrongly published beta in latest.yml. Keep its
  // original OS/version support check instead of replacing that protection.
  const previousSupportCheck = updater.isUpdateSupported?.bind(updater);
  updater.isUpdateSupported = async (info) => isVersionAllowedInChannel(info.version, channel)
    && (previousSupportCheck ? await previousSupportCheck(info) : true);

  function publish(next: Partial<LastbrowserUpdateStatus>): LastbrowserUpdateStatus {
    status = { ...status, ...next };
    options.onStatusChange?.({ ...status });
    return { ...status };
  }

  function applyPreferences(preferences: { automaticUpdatesEnabled: boolean; channel: UpdateChannelInput }): void {
    automaticUpdatesEnabled = enabled && preferences.automaticUpdatesEnabled;
    channel = normalizeUpdateChannel(preferences.channel);
    updater.autoDownload = automaticUpdatesEnabled;
    updater.autoInstallOnAppQuit = automaticUpdatesEnabled;
    updater.channel = channel === 'beta' ? 'beta' : 'latest';
    updater.allowDowngrade = false;
    updater.allowPrerelease = channel === 'beta';
  }

  function rejectChannelCandidate(version: unknown): boolean {
    if (isVersionAllowedInChannel(version, channel)) return false;
    downloadStarted = false;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    publish({ state: 'not-available', availableVersion: null, percent: null,
      message: 'This update does not belong to the selected release channel.' });
    return true;
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
    if (rejectChannelCandidate(info.version)) return;
    updater.autoDownload = automaticUpdatesEnabled;
    updater.autoInstallOnAppQuit = automaticUpdatesEnabled;
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
    if (rejectChannelCandidate(info.version || status.availableVersion)) return;
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
    async checkForUpdates(startupCheck = false): Promise<LastbrowserUpdateStatus> {
      if (!enabled) return { ...status };
      if (hasPendingUpdate()) return { ...status };
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
      if (status.availableVersion && rejectChannelCandidate(status.availableVersion)) return { ...status };
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
      if (rejectChannelCandidate(status.availableVersion)) return { ...status };
      // `isSilent = true` is required: the NSIS installer is built with
      // `oneClick: false`, so a non-silent quitAndInstall shows the full setup
      // wizard and BLOCKS waiting for clicks. An auto-update must run without
      // user interaction — verified: without this the installer sat on
      // "Installation von Lastbrowser" indefinitely.
      // `isForceRunAfter = true` relaunches the app when the install finishes.
      try {
        installing = true;
        publish({ installError: null });
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
