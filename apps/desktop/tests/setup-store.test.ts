import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSetupState, saveSetupState, setupStatePath } from '../src/main/setup-store.js';

let tmpDir: string | null = null;

afterEach(async () => {
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe('setup state store', () => {
  it('stores cloud first-run completion under the app user data directory', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'lastbrowser-setup-'));

    expect(setupStatePath(tmpDir)).toBe(path.join(tmpDir, 'setup-state.json'));
    await saveSetupState(tmpDir, {
      cloudSetupComplete: true,
      provider: 'openrouter',
      model: 'openai/gpt-5.4-mini'
    });

    await expect(loadSetupState(tmpDir)).resolves.toEqual({
      cloudSetupComplete: true,
      provider: 'openrouter',
      model: 'openai/gpt-5.4-mini'
    });
  });
});
