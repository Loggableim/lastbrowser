import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSidekickUpdater } from '../src/main/sidekick-updater.js';

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'lb-sidekick-update-'));
}

function writeVersion(dir: string, version: string) {
  const apiDir = path.join(dir, 'web', 'api');
  mkdirSync(apiDir, { recursive: true });
  writeFileSync(path.join(apiDir, '_version.py'), `__version__ = '${version}'\n`, 'utf8');
}

function writeEntrypoint(dir: string) {
  const cliDir = path.join(dir, 'cli');
  mkdirSync(cliDir, { recursive: true });
  writeFileSync(path.join(cliDir, 'web_server.py'), '# entrypoint\n', 'utf8');
}

function fakeFetch(version: string | null, ok = true) {
  return vi.fn(async (url: string) => {
    if (String(url).includes('raw.githubusercontent.com')) {
      return {
        ok,
        status: ok ? 200 : 404,
        text: async () => (version ? `__version__ = '${version}'\n` : ''),
        json: async () => []
      } as unknown as Response;
    }
    return {
      ok: false,
      status: 404,
      text: async () => '',
      json: async () => []
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe('sidekick updater', () => {
  it('starts idle and reports the bundled source when no runtime copy exists', () => {
    const root = tempRoot();
    try {
      const updater = createSidekickUpdater({ runtimeRoot: root, fetchImpl: fakeFetch('v1') });
      const status = updater.getStatus();
      expect(status.state).toBe('idle');
      expect(status.source).toBe('bundled');
      expect(status.currentVersion).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports the runtime source when an updated copy is present', () => {
    const root = tempRoot();
    try {
      const runtimeDir = path.join(root, 'runtime', 'sidekick');
      writeEntrypoint(runtimeDir);
      writeVersion(runtimeDir, 'v9.9.9');

      const updater = createSidekickUpdater({ runtimeRoot: root, fetchImpl: fakeFetch('v9.9.9') });
      const status = updater.getStatus();
      expect(status.source).toBe('runtime');
      expect(status.currentVersion).toBe('v9.9.9');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('detects an available update when versions differ', async () => {
    const root = tempRoot();
    try {
      const runtimeDir = path.join(root, 'runtime', 'sidekick');
      writeEntrypoint(runtimeDir);
      writeVersion(runtimeDir, 'v1.0.0');

      const updater = createSidekickUpdater({ runtimeRoot: root, fetchImpl: fakeFetch('v2.0.0') });
      const status = await updater.check();
      expect(status.state).toBe('available');
      expect(status.availableVersion).toBe('v2.0.0');
      expect(status.currentVersion).toBe('v1.0.0');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports up-to-date when versions match', async () => {
    const root = tempRoot();
    try {
      const runtimeDir = path.join(root, 'runtime', 'sidekick');
      writeEntrypoint(runtimeDir);
      writeVersion(runtimeDir, 'v2.0.0');

      const updater = createSidekickUpdater({ runtimeRoot: root, fetchImpl: fakeFetch('v2.0.0') });
      const status = await updater.check();
      expect(status.state).toBe('up-to-date');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('captures check failures instead of throwing', async () => {
    const root = tempRoot();
    try {
      const failing = vi.fn(async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch;
      const updater = createSidekickUpdater({ runtimeRoot: root, fetchImpl: failing });
      const status = await updater.check();
      expect(status.state).toBe('error');
      expect(status.lastError).toBe('network down');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('captures apply failures and leaves the previous copy intact', async () => {
    const root = tempRoot();
    try {
      const runtimeDir = path.join(root, 'runtime', 'sidekick');
      writeEntrypoint(runtimeDir);
      writeVersion(runtimeDir, 'v1.0.0');

      const failing = vi.fn(async () => {
        throw new Error('download failed');
      }) as unknown as typeof fetch;
      const updater = createSidekickUpdater({ runtimeRoot: root, fetchImpl: failing });
      const status = await updater.apply();

      expect(status.state).toBe('error');
      // The existing runtime copy must still be there and unchanged.
      expect(existsSync(path.join(runtimeDir, 'cli', 'web_server.py'))).toBe(true);
      expect(updater.getStatus().currentVersion).toBe('v1.0.0');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an archive without the expected entrypoint', async () => {
    const root = tempRoot();
    try {
      // A fetch that returns a body which is not a valid tar.gz.
      const bogus = vi.fn(async () => ({
        ok: true,
        status: 200,
        body: (async function* () { yield Buffer.from('not a tarball'); })(),
        text: async () => '',
        json: async () => []
      })) as unknown as typeof fetch;

      const updater = createSidekickUpdater({ runtimeRoot: root, fetchImpl: bogus });
      const status = await updater.apply();
      expect(status.state).toBe('error');
      expect(status.lastError).toBeTruthy();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
