import { describe, expect, it } from 'vitest';
import {
  isDuplicateSpaceName,
  normalizePinnedApp,
  resolvePresetModel,
  submitSpaceSetup,
  type SpaceSetupData
} from '../src/renderer/components/SpaceSetupModal.js';

const setupData: SpaceSetupData = {
  path: 'spaces/research',
  name: 'Research',
  color: '#a855f7',
  model: 'smart-track',
  pinnedApps: [{ name: 'Notion', url: 'https://notion.so' }],
  startUrl: 'https://notion.so'
};

describe('Space setup validation and model defaults', () => {
  it('detects duplicate names after trimming and without case sensitivity', () => {
    expect(isDuplicateSpaceName('  Research  ', ['research'])).toBe(true);
    expect(isDuplicateSpaceName('Research', ['Coding', ' research '])).toBe(true);
    expect(isDuplicateSpaceName('Research', ['Research Notes'])).toBe(false);
    expect(isDuplicateSpaceName('   ', [''])).toBe(false);
  });

  it('uses the preset model only when available, otherwise preserves a live choice', () => {
    expect(resolvePresetModel('gemini-2.5-pro', 'openai/gpt-live', ['openai/gpt-live'])).toBe('openai/gpt-live');
    expect(resolvePresetModel('gemini-2.5-pro', 'gemini-2.5-pro', ['openai/gpt-live'])).toBe('smart-track');
    expect(resolvePresetModel('smart-track', 'openai/gpt-live', ['openai/gpt-live'])).toBe('smart-track');
    expect(resolvePresetModel('openai/gpt-live', 'smart-track', ['openai/gpt-live'])).toBe('openai/gpt-live');
  });

  it('accepts custom HTTP(S) pinned apps and rejects invalid or unsafe URLs', () => {
    expect(normalizePinnedApp('  My Tool ', 'https://example.com/path')).toEqual({
      name: 'My Tool', url: 'https://example.com/path'
    });
    expect(normalizePinnedApp('Tool', 'javascript:alert(1)')).toBeNull();
    expect(normalizePinnedApp('', 'https://example.com')).toBeNull();
    expect(normalizePinnedApp('Tool', 'not a URL')).toBeNull();
  });

  it('waits for space creation before closing the wizard', async () => {
    let resolveCreate!: (success: boolean) => void;
    const onCreate = () => new Promise<boolean>((resolve) => { resolveCreate = resolve; });
    const onClose = () => closed.push(true);
    const closed: boolean[] = [];

    const resultPromise = submitSpaceSetup(setupData, onCreate, onClose);
    expect(closed).toEqual([]);
    resolveCreate(true);

    expect(await resultPromise).toBeNull();
    expect(closed).toEqual([true]);
  });

  it('keeps the wizard open and reports a failed or rejected creation', async () => {
    const onClose = () => closed.push(true);
    const closed: boolean[] = [];

    const rejected = await submitSpaceSetup(setupData, async () => false, onClose);
    expect(rejected?.message).toContain('konnte nicht erstellt werden');
    expect(closed).toEqual([]);

    const failure = new Error('Backend unavailable');
    expect(await submitSpaceSetup(setupData, async () => { throw failure; }, onClose)).toBe(failure);
    expect(closed).toEqual([]);
  });
});
