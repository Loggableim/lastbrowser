import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const smokeScript = path.join(repoRoot, 'apps', 'desktop', 'scripts', 'smoke-ollama-cloud.mjs');

describe('Ollama Cloud live smoke script', () => {
  it('exits unsuccessfully instead of reporting a passing smoke when the key is missing', () => {
    const result = spawnSync(process.execPath, [smokeScript], {
      cwd: repoRoot,
      env: {
        ...process.env,
        OLLAMA_API_KEY: '',
        OLLAMA_TEAMWORK_SMOKE: '',
      },
      encoding: 'utf8',
      timeout: 15_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('FATAL Error: OLLAMA_API_KEY is required');
    expect(result.stdout).toContain('Result: 0/1 checks passed, 1 failed');
  });
});
