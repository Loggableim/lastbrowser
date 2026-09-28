import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSidekickUpdater } from '../src/main/sidekick-updater.js';

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'lb-bundled-sidekick-'));
}

function writeVersion(dir: string, version: string) {
  const apiDir = path.join(dir, 'web', 'api');
  mkdirSync(apiDir, { recursive: true });
  writeFileSync(path.join(apiDir, '_version.py'), `__version__ = '${version}'\n`, 'utf8');
}

describe('Sidekick bundle status', () => {
  it('reports the tracked bundle as the only source', () => {
    const root = tempRoot();
    const bundledDir = path.join(root, 'services', 'sidekick');
    try {
      writeVersion(bundledDir, 'v1.2.3');
      const updater = createSidekickUpdater({ bundledSidekickDir: bundledDir });
      expect(updater.getStatus()).toMatchObject({
        state: 'idle',
        currentVersion: 'v1.2.3',
        source: 'bundled'
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('checks only the local bundle and explains that updates ship with Lastbrowser', async () => {
    const root = tempRoot();
    const bundledDir = path.join(root, 'services', 'sidekick');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      writeVersion(bundledDir, 'v1.2.3');
      const updater = createSidekickUpdater({ bundledSidekickDir: bundledDir });
      const status = await updater.check();
      expect(status).toMatchObject({
        state: 'up-to-date',
        currentVersion: 'v1.2.3',
        availableVersion: 'v1.2.3',
        source: 'bundled',
        lastError: null,
        message: 'Sidekick is bundled with Lastbrowser and updates with the app.'
      });
      expect(status.lastCheckedAt).toBeTruthy();
      await updater.apply();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not install or restart a legacy runtime copy when apply is called', async () => {
    const root = tempRoot();
    const bundledDir = path.join(root, 'services', 'sidekick');
    const legacyDir = path.join(root, 'user-data', 'runtime', 'sidekick');
    try {
      writeVersion(bundledDir, 'v1.2.3');
      mkdirSync(legacyDir, { recursive: true });
      writeVersion(legacyDir, 'v99.0.0');

      const updater = createSidekickUpdater({ bundledSidekickDir: bundledDir });
      const status = await updater.apply();
      expect(status).toMatchObject({
        state: 'up-to-date',
        currentVersion: 'v1.2.3',
        source: 'bundled'
      });
      expect(readVersion(legacyDir)).toBe('v99.0.0');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not claim a successful check if the bundled version cannot be read', async () => {
    const root = tempRoot();
    try {
      const updater = createSidekickUpdater({ bundledSidekickDir: path.join(root, 'missing') });
      expect(await updater.check()).toMatchObject({
        state: 'error',
        currentVersion: null,
        source: 'bundled',
        lastError: 'Could not read the bundled Sidekick version.'
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function readVersion(dir: string): string | null {
  const versionPath = path.join(dir, 'web', 'api', '_version.py');
  const raw = readFileSync(versionPath, 'utf8');
  return raw.match(/__version__\s*=\s*['"]([^'"]+)['"]/u)?.[1] ?? null;
}
