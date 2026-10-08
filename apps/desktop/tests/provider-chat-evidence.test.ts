import { describe, expect, it } from 'vitest';
import { clearProviderChatEvidence, getProviderChatEvidence, getQualifiedProviderModels, isProviderModelQualified, recordCompletedChatEvidence, setProviderChatEvidenceRuntime } from '../src/renderer/provider-chat-evidence.js';
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
    setProviderChatEvidenceRuntime('runtime-a', 'build-a');
    const proof = { provider_id: 'openrouter', model_id: 'liquid/lfm-2.5-2.6b:free', successful_chat: true,
      runtime_generation: 'runtime-a', provider_config_generation: 'backend-config-a' };
    const scope = { browserProfileId: 'profile-a', backendProfileName: 'backend-a' };
    const context = { ...scope, runtimeGeneration: 'runtime-a', appBuildId: 'build-a' };
    expect(recordCompletedChatEvidence({ ...context, startAccepted: false, completed: true, providerEvidence: proof }, storage, 10)).toBe(false);
    expect(recordCompletedChatEvidence({ ...context, startAccepted: true, completed: true, streamError: 'rate limit', providerEvidence: proof }, storage, 11)).toBe(false);
    expect(recordCompletedChatEvidence({ ...context, startAccepted: true, completed: false, providerEvidence: proof }, storage, 12)).toBe(false);
    expect(recordCompletedChatEvidence({ ...context, startAccepted: true, completed: true, cancelled: true, providerEvidence: proof }, storage, 13)).toBe(false);
    expect(recordCompletedChatEvidence({ ...context, startAccepted: true, completed: true, providerEvidence: { ...proof, successful_chat: false } }, storage, 14)).toBe(false);
    expect(recordCompletedChatEvidence({ ...context, startAccepted: true, completed: true,
      providerEvidence: { ...proof, runtime_generation: 'old-runtime' } }, storage, 14)).toBe(false);
    expect(getProviderChatEvidence('openrouter', 'profile-a', 'backend-a', storage)).toBeUndefined();

    expect(recordCompletedChatEvidence({ ...context, startAccepted: true, completed: true, providerEvidence: proof }, storage, 15)).toBe(true);
    expect(getProviderChatEvidence('OPENROUTER', 'profile-a', 'backend-a', storage, 16)).toMatchObject({
      providerId: 'openrouter',
      modelId: 'liquid/lfm-2.5-2.6b:free',
      browserProfileId: 'profile-a',
      backendProfileName: 'backend-a',
      runtimeGeneration: 'runtime-a',
      appBuildId: 'build-a',
      backendConfigGeneration: 'backend-config-a',
      recordedAt: 15,
    });
    expect(isProviderModelQualified('openrouter', 'liquid/lfm-2.5-2.6b:free', 'profile-a', 'backend-a', storage, 16)).toBe(true);
    expect(isProviderModelQualified('openrouter', 'another-model', 'profile-a', 'backend-a', storage, 16)).toBe(false);
    expect(isProviderModelQualified('openrouter', 'liquid/lfm-2.5-2.6b:free', 'profile-b', 'backend-a', storage, 16)).toBe(false);
    expect(isProviderModelQualified('openrouter', 'liquid/lfm-2.5-2.6b:free', 'profile-a', 'backend-b', storage, 16)).toBe(false);
    expect(isProviderModelQualified('openrouter', 'liquid/lfm-2.5-2.6b:free', 'profile-a', 'backend-a', storage, 15 + 24 * 60 * 60 * 1000 + 1)).toBe(false);
    expect([...getQualifiedProviderModels('openrouter', 'profile-a', 'backend-a', storage, 16)]).toEqual(['liquid/lfm-2.5-2.6b:free']);
    setProviderChatEvidenceRuntime('runtime-b', 'build-a');
    expect(isProviderModelQualified('openrouter', 'liquid/lfm-2.5-2.6b:free', 'profile-a', 'backend-a', storage, 16)).toBe(false);
    setProviderChatEvidenceRuntime('runtime-a', 'build-b');
    expect(isProviderModelQualified('openrouter', 'liquid/lfm-2.5-2.6b:free', 'profile-a', 'backend-a', storage, 16)).toBe(false);
    setProviderChatEvidenceRuntime('runtime-a', 'build-a');
    clearProviderChatEvidence('openrouter', storage);
    expect(isProviderModelQualified('openrouter', 'liquid/lfm-2.5-2.6b:free', 'profile-a', 'backend-a', storage, 16)).toBe(false);
  });

  it('requires profile scope and ignores legacy unscoped evidence', () => {
    const storage = memoryStorage();
    setProviderChatEvidenceRuntime('runtime-a', 'build-a');
    expect(recordCompletedChatEvidence({ startAccepted: true, completed: true, providerEvidence: {
      provider_id: 'openrouter', model_id: 'model-a', successful_chat: true,
      runtime_generation: 'runtime-a', provider_config_generation: 'config-a',
    } }, storage, 10)).toBe(false);
    storage.setItem('lastbrowser.providerChatEvidence.v1', JSON.stringify({ openrouter: {
      providerId: 'openrouter', modelId: 'model-a', recordedAt: 10,
    } }));
    expect(isProviderModelQualified('openrouter', 'model-a', 'profile-a', 'backend-a', storage, 11)).toBe(false);
  });

  it('keeps catalog connectivity separate from exact successful chat evidence', () => {
    const catalog = providerVerification('openrouter', { catalogVerified: true });
    expect(catalog.verified).toBe(false);
    expect(catalog.statusKey).toBe('settings.panels.providers.openrouterCatalogOnly');

    const success = providerVerification('openrouter', { successfulChat: true, modelId: 'liquid/lfm-2.5-2.6b:free' });
    expect(success.verified).toBe(true);
    expect(success.statusKey).toBe('settings.panels.providers.lastSuccessfulChat');
    expect(success.modelId).toBe('liquid/lfm-2.5-2.6b:free');
  });
});
