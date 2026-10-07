import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSetupState, saveSetupState, setupStatePath } from '../src/main/setup-store.js';

let tmpDir: string | null = null;

async function createSetupDir(): Promise<string> {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'lastbrowser-setup-ai-choice-'));
  return tmpDir;
}

afterEach(async () => {
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe('setup store AI choice compatibility', () => {
  it('leaves legacy setup JSON without new fields unchanged on load', async () => {
    const dir = await createSetupDir();
    const legacy = {
      cloudSetupComplete: true,
      provider: 'openrouter',
      model: 'model-a',
      botName: 'Nova',
      personality: 'nova'
    };
    await writeFile(setupStatePath(dir), JSON.stringify(legacy), 'utf8');

    await expect(loadSetupState(dir)).resolves.toEqual(legacy);
  });

  it.each(['enabled', 'disabled'] as const)('persists an explicit %s AI choice across reload', async (aiChoice) => {
    const dir = await createSetupDir();
    const saved = await saveSetupState(dir, {
      cloudSetupComplete: false,
      provider: '',
      model: '',
      aiChoice,
      browserSetupComplete: true
    });

    expect(saved).toMatchObject({ aiChoice, browserSetupComplete: true });
    await expect(loadSetupState(dir)).resolves.toEqual(saved);
  });

  it('preserves the AI choice and browser completion when an older save omits them', async () => {
    const dir = await createSetupDir();
    await saveSetupState(dir, {
      cloudSetupComplete: false,
      provider: '',
      model: '',
      botName: 'Nova',
      personality: 'nova',
      aiChoice: 'disabled',
      browserSetupComplete: false
    });

    const saved = await saveSetupState(dir, {
      cloudSetupComplete: true,
      provider: 'openrouter',
      model: 'model-b',
      botName: 'Nova 2',
      personality: 'mentor'
    });

    expect(saved).toEqual({
      cloudSetupComplete: true,
      provider: 'openrouter',
      model: 'model-b',
      botName: 'Nova 2',
      personality: 'mentor',
      aiChoice: 'disabled',
      browserSetupComplete: false
    });
    await expect(loadSetupState(dir)).resolves.toEqual(saved);
  });

  it('allows an AI-choice-only save without resetting existing setup or assistant identity', async () => {
    const dir = await createSetupDir();
    await saveSetupState(dir, {
      cloudSetupComplete: true,
      provider: 'openrouter',
      model: 'model-a',
      botName: 'Nova',
      personality: 'mentor'
    });

    const saved = await saveSetupState(dir, { aiChoice: 'disabled', browserSetupComplete: false });

    expect(saved).toEqual({
      cloudSetupComplete: true,
      provider: 'openrouter',
      model: 'model-a',
      botName: 'Nova',
      personality: 'mentor',
      aiChoice: 'disabled',
      browserSetupComplete: false
    });
  });

  it('does not let concurrent legacy saves erase a choice saved first', async () => {
    const dir = await createSetupDir();
    await saveSetupState(dir, {
      cloudSetupComplete: false,
      provider: '',
      model: '',
      aiChoice: 'disabled',
      browserSetupComplete: false
    });

    await Promise.all([
      saveSetupState(dir, { cloudSetupComplete: false, provider: '', model: '', botName: 'Nova' }),
      saveSetupState(dir, { cloudSetupComplete: false, provider: '', model: '', personality: 'nova' })
    ]);

    await expect(loadSetupState(dir)).resolves.toMatchObject({
      aiChoice: 'disabled',
      browserSetupComplete: false
    });
  });

  it.each([
    { aiChoice: 'later' },
    { browserSetupComplete: 'yes' }
  ])('rejects invalid explicit optional fields without replacing persisted state', async (invalidFields) => {
    const dir = await createSetupDir();
    const original = await saveSetupState(dir, {
      cloudSetupComplete: true,
      provider: 'openrouter',
      model: 'model-a',
      aiChoice: 'disabled',
      browserSetupComplete: true
    });

    await expect(saveSetupState(dir, {
      cloudSetupComplete: false,
      provider: '',
      model: '',
      ...invalidFields
    } as never)).rejects.toThrow(TypeError);

    await expect(loadSetupState(dir)).resolves.toEqual(original);
    expect(JSON.parse(await readFile(setupStatePath(dir), 'utf8'))).toEqual(original);
  });
});
