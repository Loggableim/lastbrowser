import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const smokeScript = path.join(repoRoot, 'apps', 'desktop', 'tests', 'boot-fallback-renderer-smoke.cjs');

describe('renderer boot fallback', () => {
  it('paints before the entry module and clears after a React commit', () => {
    const result = spawnSync(process.execPath, [smokeScript], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 40_000,
      windowsHide: true
    });
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(result.stdout).toContain('boot-fallback-visible:passed');
  }, 45_000);
});
