import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const smokeScript = path.join(repoRoot, 'apps', 'desktop', 'tests', 'independent-renderer-smoke.cjs');

describe('standard chat renderer discovery and model choice', () => {
  it('loads without opening the picker and sends only the latest persisted choice', () => {
    const result = spawnSync(process.execPath, [smokeScript, '--chatux-only'], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 60_000,
      windowsHide: true
    });

    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(result.stdout).toContain('chatux-initial-discovery-and-choice:passed');
  }, 15_000);
});
