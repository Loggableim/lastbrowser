/**
 * Runtime updater for the bundled Sidekick.
 *
 * Sidekick ships inside Lastbrowser, but must be updatable on its own — the
 * user should not have to wait for a Lastbrowser release to get a newer
 * Sidekick. This module downloads the live Sidekick monorepo from GitHub into
 * the user's data directory; `resolveServiceLayout` prefers that copy over the
 * bundled one, and the sidecar is restarted to pick it up.
 *
 * Source: https://github.com/Loggableim/sidekick-agent (public).
 *
 * Failure policy: an update must never break a working install. The download
 * goes to a staging directory and is only swapped in after it validates
 * (entrypoint present). On any error the previous copy stays untouched.
 */
import { app } from 'electron';
import { createWriteStream, existsSync, readdirSync, readFileSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import { runtimeSidekickDir } from './services.js';

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
  /** Version currently in use (bundled or previously updated). */
  currentVersion: string | null;
  /** Version available upstream, when known. */
  availableVersion: string | null;
  /** Where the running copy lives. */
  source: 'bundled' | 'runtime';
  lastCheckedAt: string | null;
  lastError: string | null;
  message: string | null;
};

export type SidekickUpdater = {
  getStatus(): SidekickUpdateStatus;
  check(): Promise<SidekickUpdateStatus>;
  apply(): Promise<SidekickUpdateStatus>;
};

export type SidekickUpdaterOptions = {
  repo?: string;
  ref?: string;
  /** Overridable for tests. */
  fetchImpl?: typeof fetch;
  /** Overridable for tests — called after a successful install. */
  onInstalled?: () => Promise<void> | void;
  runtimeRoot?: string;
};

const DEFAULT_REPO = 'Loggableim/sidekick-agent';
const DEFAULT_REF = 'master';

export function createSidekickUpdater(options: SidekickUpdaterOptions = {}): SidekickUpdater {
  const repo = options.repo || DEFAULT_REPO;
  const ref = options.ref || DEFAULT_REF;
  const fetchImpl = options.fetchImpl || fetch;
  const runtimeRoot = options.runtimeRoot || app.getPath('userData');
  const targetDir = runtimeSidekickDir(runtimeRoot);
  const stagingDir = `${targetDir}.staging`;

  let status: SidekickUpdateStatus = {
    state: 'idle',
    currentVersion: readInstalledVersion(targetDir),
    availableVersion: null,
    source: existsSync(path.join(targetDir, 'cli', 'web_server.py')) ? 'runtime' : 'bundled',
    lastCheckedAt: null,
    lastError: null,
    message: null
  };

  function publish(next: Partial<SidekickUpdateStatus>): SidekickUpdateStatus {
    status = { ...status, ...next };
    return { ...status };
  }

  async function check(): Promise<SidekickUpdateStatus> {
    publish({ state: 'checking', lastError: null, message: null });
    try {
      const remote = await fetchRemoteVersion();
      const current = status.currentVersion;
      const checkedAt = new Date().toISOString();
      if (remote && current && remote === current) {
        return publish({
          state: 'up-to-date',
          availableVersion: remote,
          lastCheckedAt: checkedAt,
          message: `Sidekick ${current} is up to date.`
        });
      }
      return publish({
        state: 'available',
        availableVersion: remote,
        lastCheckedAt: checkedAt,
        message: remote
          ? `Sidekick ${remote} is available${current ? ` (installed: ${current})` : ''}.`
          : 'A newer Sidekick is available.'
      });
    } catch (error) {
      return publish({
        state: 'error',
        lastError: error instanceof Error ? error.message : String(error),
        message: 'Could not check for Sidekick updates.'
      });
    }
  }

  async function apply(): Promise<SidekickUpdateStatus> {
    publish({ state: 'downloading', lastError: null, message: 'Downloading Sidekick…' });
    try {
      await fs.rm(stagingDir, { recursive: true, force: true });
      await fs.mkdir(stagingDir, { recursive: true });

      const archivePath = path.join(stagingDir, 'sidekick.tar.gz');
      await downloadArchive(archivePath);
      publish({ state: 'installing', message: 'Installing Sidekick…' });

      extractArchive(archivePath, stagingDir);
      const extractedRoot = findExtractedRoot(stagingDir);
      if (!extractedRoot) throw new Error('Downloaded archive has no Sidekick root.');

      const entry = path.join(extractedRoot, 'cli', 'web_server.py');
      if (!existsSync(entry)) throw new Error('Downloaded Sidekick is missing cli/web_server.py.');

      // Swap in: replace the previous runtime copy atomically-ish.
      const backupDir = `${targetDir}.backup`;
      await fs.rm(backupDir, { recursive: true, force: true });
      if (existsSync(targetDir)) await fs.rename(targetDir, backupDir);
      try {
        await fs.rename(extractedRoot, targetDir);
        await fs.rm(backupDir, { recursive: true, force: true });
      } catch (swapError) {
        // Roll back to the previous copy.
        if (existsSync(backupDir) && !existsSync(targetDir)) {
          await fs.rename(backupDir, targetDir);
        }
        throw swapError;
      }

      const version = readInstalledVersion(targetDir);
      await fs.rm(stagingDir, { recursive: true, force: true });

      const next = publish({
        state: 'updated',
        currentVersion: version,
        availableVersion: version,
        source: 'runtime',
        message: version
          ? `Sidekick ${version} installed. Restarting…`
          : 'Sidekick updated. Restarting…'
      });

      if (options.onInstalled) await options.onInstalled();
      return next;
    } catch (error) {
      return publish({
        state: 'error',
        lastError: error instanceof Error ? error.message : String(error),
        message: 'Sidekick update failed. The previous version is still in use.'
      });
    }
  }

  async function fetchRemoteVersion(): Promise<string | null> {
    // Prefer the repo's version file at the configured ref — cheap and exact.
    const url = `https://raw.githubusercontent.com/${repo}/${ref}/web/api/_version.py`;
    const response = await fetchImpl(url);
    if (!response.ok) {
      // No version file upstream — fall back to the latest tag name.
      const tagsUrl = `https://api.github.com/repos/${repo}/tags`;
      const tagsResponse = await fetchImpl(tagsUrl);
      if (!tagsResponse.ok) throw new Error(`HTTP ${tagsResponse.status} from GitHub`);
      const tags = await tagsResponse.json() as Array<{ name?: string }>;
      return tags[0]?.name || null;
    }
    const text = await response.text();
    const match = text.match(/__version__\s*=\s*['"]([^'"]+)['"]/);
    return match ? match[1] : null;
  }

  async function downloadArchive(dest: string): Promise<void> {
    const url = `https://codeload.github.com/${repo}/tar.gz/refs/heads/${ref}`;
    const response = await fetchImpl(url);
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} downloading Sidekick`);
    await pipeline(response.body as unknown as NodeJS.ReadableStream, createWriteStream(dest));
  }

  function extractArchive(archivePath: string, dest: string): void {
    // Windows 10+ ships bsdtar as `tar`, which handles .tar.gz natively.
    const result = spawnSync('tar', ['-xzf', archivePath, '-C', dest], {
      encoding: 'utf8',
      windowsHide: true
    });
    if (result.status !== 0) {
      throw new Error(`tar failed: ${(result.stderr || '').trim() || `exit ${result.status}`}`);
    }
  }

  return { getStatus: () => ({ ...status }), check, apply };
}

function findExtractedRoot(dir: string): string | null {
  // GitHub tarballs extract to a single top-level folder: <repo>-<ref>/
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(dir, entry.name);
      if (existsSync(path.join(candidate, 'cli', 'web_server.py'))) return candidate;
    }
  } catch {
    return null;
  }
  return null;
}

function readInstalledVersion(dir: string): string | null {
  const versionFile = path.join(dir, 'web', 'api', '_version.py');
  try {
    const raw = readFileSync(versionFile, 'utf8');
    const match = raw.match(/__version__\s*=\s*['"]([^'"]+)['"]/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
