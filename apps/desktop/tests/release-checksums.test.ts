import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';

const repoRoot = path.resolve(process.cwd(), '..', '..');
const script = path.join(repoRoot, 'scripts', 'generate-sha256sums.mjs');
const version = '0.1.58';
const setupName = `Lastbrowser-${version}-x64-setup.exe`;
const portableName = `Lastbrowser-${version}-x64-portable.exe`;
const blockmapName = `${setupName}.blockmap`;

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function run(releaseDir: string, ...extra: string[]) {
  return spawnSync(process.execPath, [script, releaseDir, ...extra], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
}

function createReleaseDir() {
  const releaseDir = mkdtempSync(path.join(tmpdir(), 'lastbrowser-sha256sums-'));
  const setupBytes = Buffer.from('signed setup fixture');
  const portableBytes = Buffer.from('signed portable fixture');
  const blockmapBytes = Buffer.from('setup blockmap fixture');
  writeFileSync(path.join(releaseDir, setupName), setupBytes);
  writeFileSync(path.join(releaseDir, portableName), portableBytes);
  writeFileSync(path.join(releaseDir, blockmapName), blockmapBytes);
  writeFileSync(path.join(releaseDir, 'latest.yml'), yaml.dump({
    version,
    files: [{ url: setupName }, { url: portableName }],
    path: setupName
  }));
  return { releaseDir, setupBytes, portableBytes, blockmapBytes };
}

describe('release SHA256SUMS generator', () => {
  it('derives the sorted publishable asset set from latest.yml', () => {
    const { releaseDir, setupBytes, portableBytes, blockmapBytes } = createReleaseDir();
    try {
      const result = run(releaseDir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('wrote');
      expect(result.stdout).toContain('4 assets (version 0.1.58)');

      const lines = readFileSync(path.join(releaseDir, 'SHA256SUMS'), 'utf8').trimEnd().split('\n');
      expect(lines).toHaveLength(4);
      for (const line of lines) {
        expect(line).toMatch(/^[0-9a-f]{64} {2}.+$/);
      }

      const names = lines.map((line) => line.slice(66));
      expect(names).toEqual([...names].sort());

      const recorded = new Map(names.map((name, index) => [name, lines[index].slice(0, 64)]));
      const latestYml = readFileSync(path.join(releaseDir, 'latest.yml'));
      expect(recorded).toEqual(new Map([
        [blockmapName, sha256(blockmapBytes)],
        [portableName, sha256(portableBytes)],
        [setupName, sha256(setupBytes)],
        ['latest.yml', sha256(latestYml)]
      ]));
    } finally {
      rmSync(releaseDir, { recursive: true, force: true });
    }
  });

  it('produces byte-identical output on repeated runs', () => {
    const { releaseDir } = createReleaseDir();
    try {
      expect(run(releaseDir).status).toBe(0);
      const first = readFileSync(path.join(releaseDir, 'SHA256SUMS'), 'utf8');
      expect(run(releaseDir).status).toBe(0);
      const second = readFileSync(path.join(releaseDir, 'SHA256SUMS'), 'utf8');
      expect(second).toBe(first);
    } finally {
      rmSync(releaseDir, { recursive: true, force: true });
    }
  });

  it('verifies a matching manifest and rejects a tampered artifact', () => {
    const { releaseDir } = createReleaseDir();
    try {
      expect(run(releaseDir).status).toBe(0);

      const verified = run(releaseDir, '--verify');
      expect(verified.status).toBe(0);
      expect(verified.stdout).toContain('verified 4 assets');

      writeFileSync(path.join(releaseDir, setupName), Buffer.from('tampered setup fixture'));
      const tampered = run(releaseDir, '--verify');
      expect(tampered.status).toBe(3);
      expect(tampered.stderr).toContain(`hash mismatch: ${setupName}`);
    } finally {
      rmSync(releaseDir, { recursive: true, force: true });
    }
  });

  it('fails with the manifest exit code when an asset is missing', () => {
    const { releaseDir } = createReleaseDir();
    try {
      unlinkSync(path.join(releaseDir, portableName));
      const generated = run(releaseDir);
      expect(generated.status).toBe(2);
      expect(generated.stderr).toContain(`Missing release asset: ${portableName}`);
    } finally {
      rmSync(releaseDir, { recursive: true, force: true });
    }
  });

  it('fails with the manifest exit code on a malformed SHA256SUMS line', () => {
    const { releaseDir } = createReleaseDir();
    try {
      expect(run(releaseDir).status).toBe(0);
      writeFileSync(path.join(releaseDir, 'SHA256SUMS'), 'not-a-checksum-line\n');
      const verified = run(releaseDir, '--verify');
      expect(verified.status).toBe(2);
      expect(verified.stderr).toContain('Malformed SHA256SUMS line');
    } finally {
      rmSync(releaseDir, { recursive: true, force: true });
    }
  });

  it('rejects unknown arguments and invalid latest.yml', () => {
    const { releaseDir } = createReleaseDir();
    try {
      const usage = run(releaseDir, '--bogus');
      expect(usage.status).toBe(1);
      expect(usage.stderr).toContain('Usage:');

      writeFileSync(path.join(releaseDir, 'latest.yml'), yaml.dump({ version: 'not-semver', files: [] }));
      const invalid = run(releaseDir);
      expect(invalid.status).toBe(2);
      expect(invalid.stderr).toContain('Invalid electron-updater metadata');
    } finally {
      rmSync(releaseDir, { recursive: true, force: true });
    }
  });
});
