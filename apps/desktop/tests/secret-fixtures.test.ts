import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const telegramBotTokenPattern = /\b(?:bot)?\d{8,}:[A-Za-z0-9_-]{20,}\b/;
const textFilePattern = /\.(cjs|css|html|js|json|md|mjs|nsh|py|ts|tsx|txt|ya?ml)$/i;

function sourceTextFiles(root: string): { origin: 'manifest' | 'git'; files: string[] } {
  const manifestPath = path.join(root, 'validation-source-manifest.json');
  let origin: 'manifest' | 'git';
  let paths: string[];
  if (existsSync(manifestPath)) {
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!manifest || typeof manifest !== 'object' || !Array.isArray((manifest as any).files)) throw new Error('Invalid validation source manifest');
    paths = (manifest as { files: unknown[] }).files.map(entry => {
      if (!entry || typeof entry !== 'object' || typeof (entry as any).path !== 'string') throw new Error('Invalid source manifest file entry');
      const relative = (entry as { path: string }).path.replace(/\\/g, '/');
      const resolved = path.resolve(root, relative);
      const withinRoot = path.relative(root, resolved);
      if (!relative || path.isAbsolute(relative) || withinRoot === '..' || withinRoot.startsWith(`..${path.sep}`) || path.isAbsolute(withinRoot)) throw new Error('Source manifest path escapes its snapshot');
      return relative;
    });
    origin = 'manifest';
  } else {
    const actualRepo = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).trim();
    const normalizeRoot = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
    if (normalizeRoot(actualRepo) !== normalizeRoot(root)) throw new Error('A source snapshot outside the Git root requires its validation manifest');
    paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: actualRepo, encoding: 'utf8' }).split('\0');
    origin = 'git';
  }
  return { origin, files: [...new Set(paths.filter(file => file && textFilePattern.test(file)))].sort() };
}

function removeManifestFixture(root: string): void {
  const target = path.resolve(root);
  if (path.dirname(target) !== path.resolve(tmpdir()) || !path.basename(target).startsWith('lastbrowser-secret-manifest-')) throw new Error('Unexpected secret-gate fixture cleanup path');
  rmSync(target, { recursive: true, force: true });
}

describe('secret-shaped fixtures', () => {
  it('does not contain Telegram bot-token-shaped literals in the actual validation sources', () => {
    const { origin, files } = sourceTextFiles(repoRoot);
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('apps/desktop/src/renderer/App.tsx');
    expect(files).toContain('services/sidekick/cli/web_server.py');
    // The repo has grown past the point where reading every tracked file fits
    // in the default 5s vitest timeout (measured ~15s for ~1400 files), so the
    // scan needs an explicit budget rather than a flaky failure.
    const offenders = files.filter((file) => {
      const fullPath = path.join(repoRoot, file);
      // Missing listed sources fail the gate instead of silently shrinking it.
      return telegramBotTokenPattern.test(readFileSync(fullPath, 'utf8'));
    });

    console.info(`Secret gate: origin=${origin}; scannedTextFiles=${files.length}; offenders=${offenders.length}`);
    expect(offenders).toEqual([]);
  }, 60000);

  it('uses a snapshot manifest even when the ambient Git checkout differs', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lastbrowser-secret-manifest-'));
    try {
      writeFileSync(path.join(root, 'validation-source-manifest.json'), JSON.stringify({ files: [
        { path: 'apps/desktop/src/renderer/App.tsx' }, { path: 'services/sidekick/cli/web_server.py' },
        { path: 'scripts/sign.cjs' }, { path: 'brand/icon.png' }
      ] }));
      expect(sourceTextFiles(root)).toEqual({ origin: 'manifest', files: [
        'apps/desktop/src/renderer/App.tsx', 'scripts/sign.cjs', 'services/sidekick/cli/web_server.py'
      ] });
    } finally { removeManifestFixture(root); }
  });

  it('rejects manifest paths outside the snapshot rather than scanning other sources', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lastbrowser-secret-manifest-'));
    try {
      writeFileSync(path.join(root, 'validation-source-manifest.json'), JSON.stringify({ files: [{ path: '../other/source.ts' }] }));
      expect(() => sourceTextFiles(root)).toThrow('escapes its snapshot');
    } finally { removeManifestFixture(root); }
  });
});
