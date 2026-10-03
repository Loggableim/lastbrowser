import { describe, expect, it } from 'vitest';
import { getProviderChatEvidence, recordCompletedChatEvidence } from '../src/renderer/provider-chat-evidence.js';
import { providerVerification } from '../src/renderer/provider-verification.js';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; },
  };
}

describe('provider chat evidence', () => {
  it('records only a completed non-error response for the exact provider and model', () => {
    const storage = memoryStorage();
    const proof = { provider_id: 'openrouter', model_id: 'liquid/lfm-2.5-2.6b:free', successful_chat: true };
    expect(recordCompletedChatEvidence({ startAccepted: false, completed: true, providerEvidence: proof }, storage, 10)).toBe(false);
    expect(recordCompletedChatEvidence({ startAccepted: true, completed: true, streamError: 'rate limit', providerEvidence: proof }, storage, 11)).toBe(false);
    expect(recordCompletedChatEvidence({ startAccepted: true, completed: false, providerEvidence: proof }, storage, 12)).toBe(false);
    expect(recordCompletedChatEvidence({ startAccepted: true, completed: true, cancelled: true, providerEvidence: proof }, storage, 13)).toBe(false);
    expect(recordCompletedChatEvidence({ startAccepted: true, completed: true, providerEvidence: { ...proof, successful_chat: false } }, storage, 14)).toBe(false);
    expect(getProviderChatEvidence('openrouter', storage)).toBeUndefined();

    expect(recordCompletedChatEvidence({ startAccepted: true, completed: true, providerEvidence: proof }, storage, 15)).toBe(true);
    expect(getProviderChatEvidence('OPENROUTER', storage)).toEqual({
      providerId: 'openrouter',
      modelId: 'liquid/lfm-2.5-2.6b:free',
      recordedAt: 15,
    });
  });

  it('keeps catalog connectivity separate from successful chat and labels historical success precisely', () => {
    const catalog = providerVerification('openrouter', { catalogVerified: true });
    expect(catalog.verified).toBe(false);
    expect(catalog.statusKey).toBe('settings.panels.providers.openrouterCatalogOnly');

    const success = providerVerification('openrouter', { successfulChat: true, modelId: 'liquid/lfm-2.5-2.6b:free' });
    expect(success.verified).toBe(true);
    expect(success.statusKey).toBe('settings.panels.providers.lastSuccessfulChat');
    expect(success.modelId).toBe('liquid/lfm-2.5-2.6b:free');
  });
});
