import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const smokeScript = path.join(repoRoot, 'apps', 'desktop', 'tests', 'zen-sidebar-geometry-renderer-smoke.cjs');

describe('Zen sidebar geometry renderer smoke', () => {
  it('keeps the sidebar overlay and hover sensor below the rendered titlebar', () => {
    const result = spawnSync(process.execPath, [smokeScript], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 60_000,
      windowsHide: true
    });

    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(result.stdout).toContain('zen-sidebar-titlebar-geometry:passed');
  });
});
