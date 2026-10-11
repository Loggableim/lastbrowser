import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const smokeScript = path.join(repoRoot, 'apps', 'desktop', 'tests', 'settings-plugins-renderer-smoke.cjs');

describe('Settings Plugins renderer smoke', () => {
  it('mounts extension fixtures and keeps tabs connected to their tab panel', () => {
    const result = spawnSync(process.execPath, [smokeScript], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 60_000,
      windowsHide: true
    });

    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(result.stdout).toContain('settings-plugins-mounted-fixtures:passed');
    expect(result.stdout).toContain('extension-tabs-a11y:passed');
  });
});
