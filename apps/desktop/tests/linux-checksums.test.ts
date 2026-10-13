import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeChecksums } from '../scripts/write-linux-checksums.mjs';

describe('Linux package checksums', () => {
  it('covers tar.gz and AppImage outputs and prepares, but does not run, GPG signing', () => {
    const releaseDir = mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-linux-checksums-'));
    const tarName = 'Lastbrowser-0.1.56-x64.tar.gz';
    const appImageName = 'Lastbrowser-0.1.56-x64.AppImage';
    const tarBytes = Buffer.from('tar archive fixture');
    const appImageBytes = Buffer.from('AppImage fixture');
    writeFileSync(path.join(releaseDir, tarName), tarBytes);
    writeFileSync(path.join(releaseDir, appImageName), appImageBytes);
    writeFileSync(path.join(releaseDir, 'Lastbrowser-0.1.56-x64-portable.exe'), 'ignore non-Linux artifacts');

    try {
      const result = writeChecksums(releaseDir);
      const lines = readFileSync(result.sums, 'utf8').trim().split(/\r?\n/);
      expect(result.count).toBe(2);
      expect(lines).toEqual([
        `${createHash('sha256').update(appImageBytes).digest('hex')}  ${appImageName}`,
        `${createHash('sha256').update(tarBytes).digest('hex')}  ${tarName}`
      ]);
      expect(readFileSync(path.join(releaseDir, 'SHA256SUMS.gpg-command'), 'utf8'))
        .toBe('gpg --detach-sign --armor --output SHA256SUMS.asc SHA256SUMS\n');
    } finally {
      rmSync(releaseDir, { recursive: true, force: true });
    }
  });
});
