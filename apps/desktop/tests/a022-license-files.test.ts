import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..');

describe('A-022 license draft files at repo root', () => {
  it('includes NOTICE, THIRD-PARTY-LICENSES, GPL-3.0-only package metadata, and README pointers', () => {
    expect(existsSync(path.join(repoRoot, 'NOTICE'))).toBe(true);
    expect(existsSync(path.join(repoRoot, 'THIRD-PARTY-LICENSES.md'))).toBe(true);
    expect(existsSync(path.join(repoRoot, 'LICENSE'))).toBe(true);
    const rootPkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const desktopPkg = JSON.parse(readFileSync(path.join(repoRoot, 'apps', 'desktop', 'package.json'), 'utf8'));
    expect(rootPkg.license).toBe('GPL-3.0-only');
    expect(desktopPkg.license).toBe('GPL-3.0-only');
    const readme = readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
    expect(readme).toContain('THIRD-PARTY-LICENSES.md');
    expect(readme).toContain('lastbrowser.com');
  });
});
