import { describe, expect, it } from 'vitest';
import {
  isProviderModelSelected,
  parseProviderModelId,
  qualifyModelForProvider,
  resolvePreferredChatModel
} from '../src/renderer/provider-model-selection.js';

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

  it('uses an explicit chat selection before stale setup defaults and preserves Space precedence', () => {
    expect(resolvePreferredChatModel('space-model', 'chat-choice', 'wizard-model')).toBe('space-model');
    expect(resolvePreferredChatModel('', 'chat-choice', 'wizard-model')).toBe('chat-choice');
    expect(resolvePreferredChatModel('', '', 'wizard-model')).toBe('wizard-model');
    expect(resolvePreferredChatModel('', null, '  ')).toBe('');
  });

  it('keeps provider identity when saving a bare model and avoids double qualification', () => {
    expect(qualifyModelForProvider('deepseek-v4.1-flash', 'ollama-cloud'))
      .toBe('@ollama-cloud:deepseek-v4.1-flash');
    expect(qualifyModelForProvider('@ollama-cloud:deepseek-v4.1-flash', 'ollama-cloud'))
      .toBe('@ollama-cloud:deepseek-v4.1-flash');
  });
});
