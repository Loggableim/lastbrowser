import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  formatSha256Sums,
  hashFile,
  main,
  parseValidSig,
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

const FPR = 'A'.repeat(40);
const gpgRun = (overrides: Record<string, unknown> = {}) =>
  vi.fn((_cmd: string, args: string[]) => {
    if (args.includes('--with-colons')) {
      return { status: 0, stdout: `pub:u:4096:1:AAAAAAAA:::::::::\nfpr:::::::::${FPR}:\n`, ...(overrides.list as object) };
    }
    if (args.includes('--detach-sign')) return { status: 0, ...(overrides.sign as object) };
    return {
      status: 0,
      stdout: `[GNUPG:] GOODSIG AAAAAAAA LB\n[GNUPG:] VALIDSIG ${FPR} 2026-11-01 0 0 4 0 1 10 01 ${FPR}\n`,
      ...(overrides.verify as object)
    };
  });

describe('parseValidSig', () => {
  it('extracts signer and primary fingerprints', () => {
    expect(parseValidSig(`[GNUPG:] GOODSIG X n\n[GNUPG:] VALIDSIG ${'B'.repeat(40)} d 0 0 4 0 1 10 01 ${FPR}\n`)).toEqual({
      signer: 'B'.repeat(40),
      primary: FPR
    });
  });
  it('returns null without GOODSIG', () => {
    expect(parseValidSig('[GNUPG:] BADSIG X n\n')).toBeNull();
  });
});

describe('signChecksums', () => {
  it('deletes stale SHA256SUMS.asc, signs, then verifies the fingerprint', async () => {
    const run = gpgRun();
    const remove = vi.fn(async () => undefined);
    const sigPath = await signChecksums('release', 'KEYID', { run, remove });

    expect(sigPath).toBe(path.join('release', 'SHA256SUMS.asc'));
    expect(remove).toHaveBeenCalledWith(path.join('release', 'SHA256SUMS.asc'), { force: true });
    const signCall = run.mock.calls.findIndex(([, a]) => a.includes('--detach-sign'));
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(run.mock.invocationCallOrder[signCall]);
    expect(run.mock.calls[signCall][1]).toEqual(expect.arrayContaining(['--armor', '--local-user', 'KEYID']));
    expect(run.mock.calls.at(-1)?.[1]).toEqual(expect.arrayContaining(['--verify', '--status-fd']));
  });

  it('throws when gpg signing fails', async () => {
    const run = gpgRun({ sign: { status: 2 } });
    await expect(signChecksums('release', 'KEYID', { run, remove: vi.fn() })).rejects.toThrow(/gpg signing failed/);
  });

  it('rejects a valid signature from a different key', async () => {
    const other = 'C'.repeat(40);
    const run = gpgRun({
      verify: { stdout: `[GNUPG:] GOODSIG X n\n[GNUPG:] VALIDSIG ${other} d 0 0 4 0 1 10 01 ${other}\n` }
    });
    await expect(signChecksums('release', 'KEYID', { run, remove: vi.fn() })).rejects.toThrow(/expected LastBrowser key/);
  });

  it('fails when the configured key is not in the keyring', async () => {
    const run = gpgRun({ list: { status: 2, stdout: '' } });
    await expect(signChecksums('release', 'KEYID', { run, remove: vi.fn() })).rejects.toThrow(/not found/);
  });
});

describe('hashFile', () => {
  it('returns the sha256 hex of the file contents', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'lb-hash-'));
    const file = path.join(dir, 'x.bin');
    writeFileSync(file, 'hello');
    try {
      expect(await hashFile(file)).toBe(createHash('sha256').update('hello').digest('hex'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('main', () => {
  const entries = [{ name: 'Lastbrowser-1-x64.AppImage', sha256: 'ab' }];

  it('writes checksums before signing', async () => {
    const order: string[] = [];
    const deps = {
      writeChecksums: vi.fn(async () => {
        order.push('checksum');
        return { sumsPath: 'release/SHA256SUMS', entries };
      }),
      signChecksums: vi.fn(async () => {
        order.push('sign');
        return 'release/SHA256SUMS.asc';
      })
    };
    expect(await main(['release'], { LASTBROWSER_GPG_KEY_ID: 'KEYID' }, { log: () => {}, deps })).toBe(0);
    expect(order).toEqual(['checksum', 'sign']);
    expect(deps.signChecksums).toHaveBeenCalledWith(path.resolve('release'), 'KEYID');
  });

  it('fails before hashing when no key is configured', async () => {
    const deps = { writeChecksums: vi.fn(), signChecksums: vi.fn() };
    await expect(main(['release'], {}, { log: () => {}, deps })).rejects.toThrow(/LASTBROWSER_GPG_KEY_ID/);
    expect(deps.writeChecksums).not.toHaveBeenCalled();
  });

  it('--allow-unsigned writes checksums, skips signing and removes stale signature', async () => {
    const deps = {
      writeChecksums: vi.fn(async () => ({ sumsPath: 'release/SHA256SUMS', entries })),
      signChecksums: vi.fn(),
      remove: vi.fn(async () => undefined)
    };
    const log = vi.fn();
    expect(await main(['release', '--allow-unsigned'], {}, { log, deps })).toBe(0);
    expect(deps.signChecksums).not.toHaveBeenCalled();
    expect(deps.remove).toHaveBeenCalledWith(path.join(path.resolve('release'), 'SHA256SUMS.asc'), { force: true });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/NOT signed/));
  });

  it('--check-key fails fast without a key and never hashes', async () => {
    const deps = { writeChecksums: vi.fn() };
    await expect(main(['--check-key'], {}, { log: () => {}, deps })).rejects.toThrow(/LASTBROWSER_GPG_KEY_ID/);
    expect(deps.writeChecksums).not.toHaveBeenCalled();
  });

  it('--check-key resolves the configured key in the keyring', async () => {
    const run = gpgRun();
    const deps = { writeChecksums: vi.fn(), run };
    expect(await main(['--check-key'], { LASTBROWSER_GPG_KEY_ID: 'KEYID' }, { log: () => {}, deps })).toBe(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(deps.writeChecksums).not.toHaveBeenCalled();
  });
});
