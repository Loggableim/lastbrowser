import { describe, expect, it } from 'vitest';
import { isDuplicateSpaceName, resolvePresetModel } from '../src/renderer/components/SpaceSetupModal.js';

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
});
