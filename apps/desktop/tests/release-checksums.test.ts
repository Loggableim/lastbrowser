import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '..', '..');
const script = path.join(repoRoot, 'scripts', 'generate-sha256sums.mjs');
const version = '0.1.58';
const setupName = `Lastbrowser-${version}-x64-setup.exe`;
const blockmapName = `${setupName}.blockmap`;
const portableName = `Lastbrowser-${version}-x64-portable.exe`;
const assets = [setupName, blockmapName, portableName, 'latest.yml'];

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function makeReleaseDir(): { dir: string; contents: Map<string, Buffer> } {
  const dir = mkdtempSync(path.join(tmpdir(), 'lastbrowser-sha256sums-'));
  mkdirSync(dir, { recursive: true });
  const contents = new Map<string, Buffer>([
    [setupName, Buffer.from('signed setup fixture')],
    [blockmapName, Buffer.from('setup blockmap fixture')],
    [portableName, Buffer.from('signed portable fixture')],
    ['latest.yml', Buffer.from(`version: ${version}\nfiles:\n  - url: ${setupName}\n`)],
  ]);
  for (const [name, bytes] of contents) writeFileSync(path.join(dir, name), bytes);
  return { dir, contents };
}

describe('release SHA256SUMS generation', () => {
  it('writes a deterministic, coreutils-compatible SHA256SUMS for the published assets', () => {
    const { dir, contents } = makeReleaseDir();
    try {
      execFileSync(process.execPath, [script, dir], { cwd: repoRoot, stdio: 'pipe' });

      const sumsPath = path.join(dir, 'SHA256SUMS');
      const expected = `${[...assets].sort().map((name) => `${sha256(contents.get(name) as Buffer)}  ${name}`).join('\n')}\n`;
      expect(readFileSync(sumsPath, 'utf8')).toBe(expected);
      expect(expected.endsWith('\n')).toBe(true);
      expect(expected).not.toContain(' SHA256SUMS');

      execFileSync(process.execPath, [script, dir, '--check'], { cwd: repoRoot, stdio: 'pipe' });
      expect(readFileSync(sumsPath, 'utf8')).toBe(expected);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails verification when an asset changes after signing metadata was written', () => {
    const { dir } = makeReleaseDir();
    try {
      execFileSync(process.execPath, [script, dir], { cwd: repoRoot, stdio: 'pipe' });
      writeFileSync(path.join(dir, portableName), Buffer.from('tampered portable bytes'));

      const result = spawnSync(process.execPath, [script, dir, '--check'], { cwd: repoRoot, encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('hash mismatch');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when a published asset is missing', () => {
    const { dir } = makeReleaseDir();
    try {
      rmSync(path.join(dir, setupName));
      const result = spawnSync(process.execPath, [script, dir], { cwd: repoRoot, encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(existsSync(path.join(dir, 'SHA256SUMS'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an invalid invocation', () => {
    const result = spawnSync(process.execPath, [script], { cwd: repoRoot, encoding: 'utf8' });
    expect(result.status).toBe(2);
  });
});
