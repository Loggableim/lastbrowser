import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';

describe('signed release metadata refresh', () => {
  it.each(['latest', 'beta'] as const)('rebuilds %s differential metadata from exact signed installer bytes', (channel) => {
    const repoRoot = path.resolve(process.cwd(), '..', '..');
    const appBuilder = path.join(repoRoot, 'node_modules', 'app-builder-bin', 'win', 'x64', 'app-builder.exe');
    const script = path.join(repoRoot, 'scripts', 'refresh-signed-release-metadata.mjs');
    const releaseDir = mkdtempSync(path.join(tmpdir(), 'lastbrowser-release-metadata-'));
    const version = channel === 'beta' ? '0.1.57-beta.1' : '0.1.35';
    const installerName = `Lastbrowser-${version}-x64-setup.exe`;
    const portableName = `Lastbrowser-${version}-x64-portable.exe`;
    const installerBytes = Buffer.from('signed installer fixture');
    const portableBytes = Buffer.from('signed portable fixture');
    try {
      mkdirSync(releaseDir, { recursive: true });
      writeFileSync(path.join(releaseDir, installerName), installerBytes);
      writeFileSync(path.join(releaseDir, portableName), portableBytes);
      const metadataFile = `${channel}.yml`;
      writeFileSync(path.join(releaseDir, metadataFile), yaml.dump({
        version,
        files: [
          { url: installerName, sha512: 'stale', size: 1 },
          { url: portableName, sha512: 'stale', size: 1 }
        ],
        path: installerName,
        sha512: 'stale',
        releaseDate: '2026-09-27T00:00:00.000Z'
      }));

      execFileSync(process.execPath, [script, releaseDir, appBuilder, metadataFile], { cwd: repoRoot, stdio: 'pipe' });

      const metadata = yaml.load(readFileSync(path.join(releaseDir, metadataFile), 'utf8')) as {
        sha512: string;
        files: Array<{ url: string; sha512: string; size: number }>;
      };
      const actualSha512 = createHash('sha512')
        .update(readFileSync(path.join(releaseDir, installerName)))
        .digest('base64');
      expect(metadata.sha512).toBe(actualSha512);
      expect(metadata.files).toEqual([expect.objectContaining({
        url: installerName,
        sha512: actualSha512,
        size: installerBytes.length
      }), expect.objectContaining({
        url: portableName,
        sha512: createHash('sha512').update(portableBytes).digest('base64'),
        size: portableBytes.length
      })]);
      expect(statSync(path.join(releaseDir, `${installerName}.blockmap`)).size).toBeGreaterThan(0);
    } finally {
      rmSync(releaseDir, { recursive: true, force: true });
    }
  });
});
