import { crc32 } from 'node:zlib';
import { closeSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const payloadScript = path.join(repoRoot, 'scripts', 'verify-installer-payload.mjs');
const guardScript = path.join(repoRoot, 'scripts', 'verify-packaged-payload.mjs');
const SIGNATURE = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);

const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

function buildInstallerFixture(nextHeaderOffset: number): Buffer {
  const nextHeader = Buffer.from('lastbrowser-encoded-header');
  const padding = Buffer.alloc(44);
  const nextHeaderPosition = 32 + padding.length;
  const totalSize = nextHeaderPosition + nextHeader.length;
  const file = Buffer.alloc(totalSize);
  SIGNATURE.copy(file, 0);
  file.writeUInt8(0, 6);
  file.writeUInt8(4, 7);
  file.writeBigUInt64LE(BigInt(nextHeaderOffset), 12);
  file.writeBigUInt64LE(BigInt(nextHeader.length), 20);
  file.writeUInt32LE(crc32(nextHeader) >>> 0, 28);
  padding.copy(file, 32);
  nextHeader.copy(file, nextHeaderPosition);
  file.writeUInt32LE(crc32(file.subarray(12, 32)) >>> 0, 8);
  return file;
}

function run(script: string, args: string[]) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('installer payload archive verification', () => {
  it('accepts an installer whose embedded 7z header is inside the file', () => {
    const directory = tempDir('lastbrowser-payload-ok-');
    const installer = path.join(directory, 'Lastbrowser-0.1.59-x64-setup.exe');
    writeFileSync(installer, buildInstallerFixture(44));

    const result = run(payloadScript, [installer]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('7z payload OK');
  });

  it('rejects the 4 GiB offset overflow that truncated v0.1.58', () => {
    const directory = tempDir('lastbrowser-payload-overflow-');
    const installer = path.join(directory, 'Lastbrowser-0.1.58-x64-setup.exe');
    writeFileSync(installer, buildInstallerFixture(2 ** 32 + 44));

    const result = run(payloadScript, [installer]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Truncated 7z archive');
    expect(result.stderr).toContain('4 GiB offset overflow');
  });

  it('rejects an installer without a readable 7z start header', () => {
    const directory = tempDir('lastbrowser-payload-missing-');
    const installer = path.join(directory, 'Lastbrowser-0.1.59-x64-portable.exe');
    writeFileSync(installer, Buffer.from('not an nsis installer'));

    const result = run(payloadScript, [installer]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No 7z start header');
  });

  it('verifies every executable in a release directory', () => {
    const directory = tempDir('lastbrowser-payload-release-');
    writeFileSync(path.join(directory, 'Lastbrowser-0.1.59-x64-setup.exe'), buildInstallerFixture(44));
    writeFileSync(path.join(directory, 'Lastbrowser-0.1.59-x64-portable.exe'), buildInstallerFixture(44));

    const result = run(payloadScript, [directory]);

    expect(result.status).toBe(0);
    expect(result.stdout.match(/7z payload OK/g)).toHaveLength(2);
  });
});

describe('pre-NSIS packaged payload guard', () => {
  it('refuses to bundle model weights', () => {
    const directory = tempDir('lastbrowser-payload-gguf-');
    mkdirSync(path.join(directory, 'resources', 'runtime', 'local-ai'), { recursive: true });
    writeFileSync(path.join(directory, 'resources', 'runtime', 'local-ai', 'model.gguf'), 'weights');

    const result = run(guardScript, [directory]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing to package model weights');
    expect(result.stderr).toContain('model.gguf');
  });

  it('rejects a payload at the NSIS 32-bit file-size limit', () => {
    const directory = tempDir('lastbrowser-payload-limit-');
    const file = path.join(directory, 'Lastbrowser.exe');
    const descriptor = openSync(file, 'w');
    try {
      ftruncateSync(descriptor, 200);
    } finally {
      closeSync(descriptor);
    }

    const result = run(guardScript, [directory, '--max-bytes', '100']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('NSIS 32-bit limit');
  });

  it('accepts a normal Windows payload', () => {
    const directory = tempDir('lastbrowser-payload-normal-');
    mkdirSync(path.join(directory, 'resources'), { recursive: true });
    writeFileSync(path.join(directory, 'Lastbrowser.exe'), 'shell');
    writeFileSync(path.join(directory, 'resources', 'app.asar'), 'app');

    const result = run(guardScript, [directory]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('bytes across 2 files');
  });
});

describe('release pipeline wiring', () => {
  it('runs both payload gates on Windows release builds', () => {
    const metadataScript = readFileSync(
      path.join(repoRoot, 'scripts', 'refresh-signed-release-metadata.mjs'),
      'utf8'
    );
    const hook = readFileSync(
      path.join(repoRoot, 'apps', 'desktop', 'scripts', 'verify-local-ai-signatures.cjs'),
      'utf8'
    );

    expect(metadataScript).toContain('verifyInstallerPayload(filePath)');
    expect(metadataScript).toContain("[['setup', setupPath], ['portable', portablePath]]");
    expect(hook).toContain('auditPackagedPayload(context.appOutDir)');
  });
});
