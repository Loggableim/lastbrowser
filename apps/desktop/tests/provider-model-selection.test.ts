import { describe, expect, it } from 'vitest';
import { isProviderModelSelected, parseProviderModelId } from '../src/renderer/provider-model-selection.js';

describe('provider-aware model selection', () => {
  it('keeps provider identity separate while parsing qualified backend IDs', () => {
    expect(parseProviderModelId('@openrouter:vendor/model:free', 'other-provider')).toEqual({
      provider: 'openrouter',
      model: 'vendor/model:free'
    });
    expect(parseProviderModelId('vendor/model:free', 'openrouter')).toEqual({
      provider: 'openrouter',
      model: 'vendor/model:free'
    });
  });

  it('distinguishes identical model IDs offered by different providers', () => {
    const openRouter = { id: 'shared-model', providerId: 'openrouter' };
    const ollama = { id: 'shared-model', providerId: 'ollama-cloud' };
    expect(isProviderModelSelected(openRouter, 'shared-model', 'openrouter')).toBe(true);
    expect(isProviderModelSelected(ollama, 'shared-model', 'openrouter')).toBe(false);
    expect(isProviderModelSelected(ollama, 'shared-model', 'ollama-cloud')).toBe(true);
  });
});
