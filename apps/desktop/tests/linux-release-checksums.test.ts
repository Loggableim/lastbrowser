import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import {
  formatSha256Sums,
  resolveSigningKey,
  selectArtifacts,
  signChecksums,
  writeChecksums
} from '../scripts/linux-release-checksums.mjs';

describe('linux release artifact selection', () => {
  it('keeps only Lastbrowser AppImage and tar.gz files, sorted', () => {
    expect(
      selectArtifacts([
        'builder-debug.yml',
        'Lastbrowser-0.1.44-x64.tar.gz',
        'Lastbrowser-0.1.44-x64.AppImage',
        'Lastbrowser-0.1.44-x64-setup.exe',
        'latest-linux.yml',
        'SHA256SUMS'
      ])
    ).toEqual(['Lastbrowser-0.1.44-x64.AppImage', 'Lastbrowser-0.1.44-x64.tar.gz']);
  });
});

describe('formatSha256Sums', () => {
  it('uses the coreutils sha256sum layout', () => {
    expect(formatSha256Sums([{ name: 'a.AppImage', sha256: 'ab'.repeat(32) }])).toBe(
      `${'ab'.repeat(32)}  a.AppImage\n`
    );
  });
});

describe('resolveSigningKey', () => {
  it('returns the configured key id', () => {
    expect(resolveSigningKey({ LASTBROWSER_GPG_KEY_ID: ' ABCD1234 ' }, { allowUnsigned: false })).toBe('ABCD1234');
  });

  it('fails closed when no key is configured', () => {
    expect(() => resolveSigningKey({}, { allowUnsigned: false })).toThrow(/LASTBROWSER_GPG_KEY_ID/);
  });

  it('allows an explicit unsigned local build', () => {
    expect(resolveSigningKey({}, { allowUnsigned: true })).toBeNull();
  });
});

describe('writeChecksums', () => {
  it('hashes only artifacts and writes SHA256SUMS into the release dir', async () => {
    const releaseDir = path.join('release');
    const hashFile = vi.fn(async (filePath: string) => `hash:${path.basename(filePath)}`);
    const writeFileMock = vi.fn(async () => undefined);
    const result = await writeChecksums(releaseDir, {
      deps: {
        readdir: async () => ['Lastbrowser-1.0.0-x64.tar.gz', 'Lastbrowser-1.0.0-x64.AppImage', 'notes.txt'],
        hashFile,
        writeFile: writeFileMock
      }
    });

    expect(hashFile).toHaveBeenCalledTimes(2);
    expect(result.sumsPath).toBe(path.join(releaseDir, 'SHA256SUMS'));
    expect(writeFileMock).toHaveBeenCalledWith(
      path.join(releaseDir, 'SHA256SUMS'),
      'hash:Lastbrowser-1.0.0-x64.AppImage  Lastbrowser-1.0.0-x64.AppImage\n' +
        'hash:Lastbrowser-1.0.0-x64.tar.gz  Lastbrowser-1.0.0-x64.tar.gz\n',
      'utf8'
    );
  });

  it('throws when no artifacts are present', async () => {
    await expect(
      writeChecksums('release', {
        deps: { readdir: async () => ['latest-linux.yml'], hashFile: vi.fn(), writeFile: vi.fn() }
      })
    ).rejects.toThrow(/No Lastbrowser AppImage or tar.gz/);
  });
});

describe('signChecksums', () => {
  it('creates a detached armored signature and verifies it', () => {
    const run = vi.fn(() => ({ status: 0 }));
    const sigPath = signChecksums('release', 'KEYID', { run });

    expect(sigPath).toBe(path.join('release', 'SHA256SUMS.asc'));
    expect(run).toHaveBeenNthCalledWith(
      1,
      'gpg',
      expect.arrayContaining(['--detach-sign', '--armor', '--local-user', 'KEYID']),
      expect.anything()
    );
    expect(run).toHaveBeenNthCalledWith(2, 'gpg', expect.arrayContaining(['--verify']), expect.anything());
  });

  it('throws when gpg signing fails', () => {
    const run = vi.fn(() => ({ status: 2 }));
    expect(() => signChecksums('release', 'KEYID', { run })).toThrow(/gpg signing failed/);
  });
});
