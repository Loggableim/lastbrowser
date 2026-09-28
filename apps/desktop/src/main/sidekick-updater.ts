/**
 * Sidekick is bundled from the tracked in-tree monorepo and updated with
 * Lastbrowser. This compatibility controller intentionally performs no
 * network access and never downloads or executes a separate Sidekick copy.
 */
import { app } from 'electron';
import path from 'node:path';
import { readSidekickVersion } from './services.js';

export type SidekickUpdateState =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'updated'
  | 'error';

export type SidekickUpdateStatus = {
  state: SidekickUpdateState;
  currentVersion: string | null;
  availableVersion: string | null;
  source: 'bundled' | 'runtime';
  lastCheckedAt: string | null;
  lastError: string | null;
  message: string | null;
};

export type SidekickUpdater = {
  getStatus(): SidekickUpdateStatus;
  /** Refreshes local bundle metadata only; no remote request is made. */
  check(): Promise<SidekickUpdateStatus>;
  /** Compatibility method: separate runtime updates are disabled. */
  apply(): Promise<SidekickUpdateStatus>;
};

export type SidekickUpdaterOptions = {
  /** Overridable for tests. */
  bundledSidekickDir?: string;
};

export function createSidekickUpdater(options: SidekickUpdaterOptions = {}): SidekickUpdater {
  const bundledSidekickDir = options.bundledSidekickDir || defaultBundledSidekickDir();
  const currentVersion = readSidekickVersion(bundledSidekickDir);

  let status: SidekickUpdateStatus = {
    state: 'idle',
    currentVersion,
    availableVersion: null,
    source: 'bundled',
    lastCheckedAt: null,
    lastError: null,
    message: 'Sidekick is included with Lastbrowser.'
  };

  function publish(next: Partial<SidekickUpdateStatus>): SidekickUpdateStatus {
    status = { ...status, ...next, source: 'bundled' };
    return { ...status };
  }

  function localBundleStatus(): SidekickUpdateStatus {
    const version = readSidekickVersion(bundledSidekickDir);
    const checkedAt = new Date().toISOString();
    if (!version) {
      return publish({
        state: 'error',
        currentVersion: null,
        availableVersion: null,
        lastCheckedAt: checkedAt,
        lastError: 'Could not read the bundled Sidekick version.',
        message: 'Sidekick is bundled with Lastbrowser; its local version could not be read.'
      });
    }
    return publish({
      state: 'up-to-date',
      currentVersion: version,
      availableVersion: version,
      lastCheckedAt: checkedAt,
      lastError: null,
      message: 'Sidekick is bundled with Lastbrowser and updates with the app.'
    });
  }

  async function check(): Promise<SidekickUpdateStatus> {
    return localBundleStatus();
  }

  async function apply(): Promise<SidekickUpdateStatus> {
    // A legacy runtime/sidekick directory may remain in user data from older
    // builds. Do not read, delete, or execute it here.
    return localBundleStatus();
  }

  return { getStatus: () => ({ ...status }), check, apply };
}

function defaultBundledSidekickDir(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'services', 'sidekick');
  return path.resolve(app.getAppPath(), '..', '..', 'services', 'sidekick');
}
