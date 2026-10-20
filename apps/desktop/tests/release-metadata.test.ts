import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';

const SEVEN_ZIP_SIGNATURE = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);

function installerFixture(marker: string): Buffer {
  const nextHeader = Buffer.from(marker);
  const padding = Buffer.alloc(44);
  const file = Buffer.alloc(32 + padding.length + nextHeader.length);
  SEVEN_ZIP_SIGNATURE.copy(file, 0);
  file.writeUInt8(0, 6);
  file.writeUInt8(4, 7);
  file.writeBigUInt64LE(BigInt(padding.length), 12);
  file.writeBigUInt64LE(BigInt(nextHeader.length), 20);
  file.writeUInt32LE(crc32(nextHeader) >>> 0, 28);
  padding.copy(file, 32);
  nextHeader.copy(file, 32 + padding.length);
  file.writeUInt32LE(crc32(file.subarray(12, 32)) >>> 0, 8);
  return file;
}

describe('signed release metadata refresh', () => {
  it('rebuilds differential metadata from the exact signed installer bytes', () => {
    const repoRoot = path.resolve(process.cwd(), '..', '..');
    const appBuilder = path.join(repoRoot, 'node_modules', 'app-builder-bin', 'win', 'x64', 'app-builder.exe');
    const script = path.join(repoRoot, 'scripts', 'refresh-signed-release-metadata.mjs');
    const releaseDir = mkdtempSync(path.join(tmpdir(), 'lastbrowser-release-metadata-'));
    const installerName = 'Lastbrowser-0.1.35-x64-setup.exe';
    const portableName = 'Lastbrowser-0.1.35-x64-portable.exe';
    const installerBytes = installerFixture('signed installer fixture');
    const portableBytes = installerFixture('signed portable fixture');
    try {
      mkdirSync(releaseDir, { recursive: true });
      writeFileSync(path.join(releaseDir, installerName), installerBytes);
      writeFileSync(path.join(releaseDir, portableName), portableBytes);
      writeFileSync(path.join(releaseDir, 'latest.yml'), yaml.dump({
        version: '0.1.35',
        files: [
          { url: installerName, sha512: 'stale', size: 1 },
          { url: portableName, sha512: 'stale', size: 1 }
        ],
        path: installerName,
        sha512: 'stale',
        releaseDate: '2026-09-27T00:00:00.000Z'
      }));

      execFileSync(process.execPath, [script, releaseDir, appBuilder], { cwd: repoRoot, stdio: 'pipe' });

      const metadata = yaml.load(readFileSync(path.join(releaseDir, 'latest.yml'), 'utf8')) as {
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
