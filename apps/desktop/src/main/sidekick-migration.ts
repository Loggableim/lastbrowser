// sidekick-migration.ts
// Pure detection logic for a standalone Sidekick installation
// plus IPC registration for the main process.

import { app, ipcMain } from 'electron';
import { existsSync, type PathLike } from 'node:fs';
import { join } from 'node:path';
import { requestWebui } from './sidekick-api.js';

// Dependency injection for testability (vitest can pass fakes).
export type SidekickMigrationDeps = {
  existsSync: (path: PathLike) => boolean;
  join: typeof join;
};

const defaultDeps: SidekickMigrationDeps = { existsSync, join };

export type StandaloneInstallComponents = {
  spaces: boolean;
  supermemory: boolean;
  profiles: boolean;
  config: boolean;
};

export type StandaloneInstallReport = {
  found: boolean;
  homeDir?: string;
  components: StandaloneInstallComponents;
};

export type StandaloneMigrationRequest = {
  source_home: string;
  items: { spaces: boolean; supermemory: boolean; profiles: boolean };
};

export type StandaloneMigrationReport = {
  copied: string[];
  skipped: string[];
  errors: string[];
};

/**
 * Detect a standalone Sidekick install (e.g. ~/.sidekick or %APPDATA%/sidekick).
 * Pure: all filesystem access is injected, so tests can pass fake paths.
 */
export function detectStandaloneSidekickInstall(
  candidatePaths: string[],
  deps: SidekickMigrationDeps = defaultDeps
): StandaloneInstallReport {
  const { existsSync, join } = deps;
  let homeDir: string | undefined;
  const components: StandaloneInstallComponents = {
    spaces: false,
    supermemory: false,
    profiles: false,
    config: false
  };

  for (const base of candidatePaths) {
    if (!base) continue;
    // Windows standalone installs have used both a hidden home folder and
    // the conventional %APPDATA%\\sidekick directory. Try both spellings.
    const candidates = [join(base, '.sidekick'), join(base, 'sidekick')];
    for (const sidekickDir of candidates) {
      if (!existsSync(sidekickDir)) continue;
      homeDir = sidekickDir;
      components.spaces = existsSync(join(sidekickDir, 'spaces'));
      components.supermemory = existsSync(join(sidekickDir, 'supermemory.db'));
      components.profiles = existsSync(join(sidekickDir, 'profiles'));
      components.config = existsSync(join(sidekickDir, 'config.yaml'));
      break;
    }
    if (homeDir) break;
  }

  return {
    found: Boolean(homeDir),
    homeDir,
    components
  };
}

export type IpcHandleApi = {
  handle(channel: string, listener: (...args: any[]) => unknown): void;
};

export type MigrationIpcDeps = {
  getWebuiUrl: () => string;
  getHomePath: () => string;
  getAppDataPath: () => string;
  fsDeps?: SidekickMigrationDeps;
};

/**
 * Register the migration IPC channels. The heavy lifting (copying files)
 * happens in the Python backend via /api/onboarding/migrate_standalone so
 * data-dir semantics stay owned by the backend.
 */
export function registerSidekickMigrationIpc(ipc: IpcHandleApi, deps: MigrationIpcDeps): void {
  ipc.handle('lastbrowser:sidekick:detectExistingInstall', () => {
    const candidatePaths = [deps.getHomePath(), deps.getAppDataPath()];
    return detectStandaloneSidekickInstall(candidatePaths, deps.fsDeps);
  });
  ipc.handle('lastbrowser:sidekick:migrateStandalone', async (_event: unknown, request: unknown) => {
    const payload = (request || {}) as Partial<StandaloneMigrationRequest>;
    if (typeof payload.source_home !== 'string' || !payload.source_home) {
      return { copied: [], skipped: [], errors: ['A source home directory is required.'] } satisfies StandaloneMigrationReport;
    }
    const items = {
      spaces: payload.items?.spaces === true,
      supermemory: payload.items?.supermemory === true,
      profiles: payload.items?.profiles === true
    };
    try {
      const result = await requestWebui(deps.getWebuiUrl(), {
        method: 'POST',
        path: '/api/onboarding/migrate_standalone',
        body: { source_home: payload.source_home, items }
      });
      return {
        copied: Array.isArray(result.copied) ? (result.copied as string[]) : [],
        skipped: Array.isArray(result.skipped) ? (result.skipped as string[]) : [],
        errors: Array.isArray(result.errors) ? (result.errors as string[]) : []
      } satisfies StandaloneMigrationReport;
    } catch (error) {
      return {
        copied: [],
        skipped: [],
        errors: [error instanceof Error ? error.message : String(error)]
      } satisfies StandaloneMigrationReport;
    }
  });
}

// Convenience wrapper used by main.ts with real Electron paths.
export function registerDefaultSidekickMigrationIpc(ipc: typeof ipcMain, getWebuiUrl: () => string): void {
  registerSidekickMigrationIpc(ipc, {
    getWebuiUrl,
    getHomePath: () => app.getPath('home'),
    getAppDataPath: () => process.env.APPDATA || app.getPath('appData')
  });
}
