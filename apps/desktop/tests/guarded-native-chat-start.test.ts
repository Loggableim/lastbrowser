import { beforeEach, describe, expect, it } from 'vitest';
import { prepareGuardedNativeChatStart, startGuardedNativeChat, type GuardedNativeChatStartInput, type NativeChatStartPayload } from '../src/renderer/guarded-native-chat-start.js';
import { recordCompletedChatEvidence, setProviderChatEvidenceRuntime } from '../src/renderer/provider-chat-evidence.js';
import { setModelActive } from '../src/renderer/active-model-selection.js';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    clear: () => { values.clear(); },
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; },
  };
}

function catalogModel(provider: string, model: string) {
  const scope = { backendProfileId: 'backend-id', spaceId: 'space-a', browserProfileId: 'profile-a' };
  return {
    id: model,
    label: model,
    supportsIndependent: true,
    nativeAvailability: {
      schemaVersion: 1 as const,
      supported: true,
      available: true,
      reasonCode: null,
      provider,
      model,
      scope,
      selectionRevision: 1,
    },
  };
}

function input(storage: Storage, overrides: Partial<GuardedNativeChatStartInput> = {}): GuardedNativeChatStartInput {
  return {
    message: '  exact test request  ',
    captured: { sessionId: 'session-a', profileId: 'profile-a', spacePath: 'C:/spaces/a', backendProfileName: 'backend-a' },
    current: { sessionId: 'session-a', profileId: 'profile-a', spacePath: 'C:/spaces/a', backendProfileName: 'backend-a' },
    selection: { scope: { backendProfileId: 'backend-id', spaceId: 'space-a', browserProfileId: 'profile-a' }, model: 'model-a', provider: 'provider-a' },
    allowUntestedBetas: false,
    qualificationBackendProfileName: 'backend-a',
    storage,
    reasoningEffort: 'high',
    ...overrides,
  };
}

describe('guarded native chat start', () => {
  beforeEach(() => setProviderChatEvidenceRuntime('runtime-test', 'build-test'));

  it('does not dispatch an unqualified model before opt-in or after opt-out', async () => {
    const storage = memoryStorage();
    const calls: NativeChatStartPayload[] = [];
    const start = (payload: NativeChatStartPayload) => {
      calls.push(payload);
      return Promise.resolve({ sessionId: 'session-a', streamId: 'stream-a' });
    };

    expect(await startGuardedNativeChat(input(storage), start)).toMatchObject({ ok: false, reason: 'model_unqualified' });
    expect(calls).toHaveLength(0);

    const optedIn = await startGuardedNativeChat(input(storage, { allowUntestedBetas: true }), start);
    expect(optedIn).toMatchObject({ ok: true, response: { sessionId: 'session-a', streamId: 'stream-a' } });
    expect(calls).toEqual([{
      sessionId: 'session-a', message: 'exact test request', model: 'model-a', modelProvider: 'provider-a',
      profile: 'profile-a', workspace: 'C:/spaces/a', backendProfileName: 'backend-a', reasoningEffort: 'high',
    }]);

    expect(await startGuardedNativeChat(input(storage, { allowUntestedBetas: false }), start)).toMatchObject({ ok: false, reason: 'model_unqualified' });
    expect(calls).toHaveLength(1);
    expect(storage.getItem('lastbrowser.providerChatEvidence.v3')).toBeNull();
  });

  it('rejects a stale session or Space before calling the transport', async () => {
    const storage = memoryStorage();
    const calls: NativeChatStartPayload[] = [];
    const result = await startGuardedNativeChat(input(storage, {
      allowUntestedBetas: true,
      current: { sessionId: 'session-b', profileId: 'profile-a', spacePath: 'C:/spaces/b', backendProfileName: 'backend-a' },
    }), async (payload) => {
      calls.push(payload);
      return { sessionId: 'session-b', streamId: 'stream-b' };
    });
    expect(result).toEqual({ ok: false, reason: 'stale_context' });
    expect(calls).toHaveLength(0);
  });

  it('omits an empty optional backend profile hint while preserving the captured binding', async () => {
    const storage = memoryStorage();
    const calls: NativeChatStartPayload[] = [];
    const result = await startGuardedNativeChat(input(storage, {
      allowUntestedBetas: true,
      captured: { sessionId: 'session-a', profileId: 'profile-a', spacePath: 'C:/spaces/a', backendProfileName: '' },
      current: { sessionId: 'session-a', profileId: 'profile-a', spacePath: 'C:/spaces/a', backendProfileName: '' },
    }), async (payload) => {
      calls.push(payload);
      return { sessionId: 'session-a', streamId: 'stream-a' };
    });

    expect(result).toMatchObject({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toHaveProperty('backendProfileName');
  });

  it('surfaces transport rejection without recording successful qualification', async () => {
    const storage = memoryStorage();
    const result = await startGuardedNativeChat(input(storage, { allowUntestedBetas: true }), async () => {
      throw new Error('controlled transport rejection');
    });
    expect(result).toMatchObject({ ok: false, reason: 'transport_error', error: new Error('controlled transport rejection') });
    expect(storage.getItem('lastbrowser.providerChatEvidence.v3')).toBeNull();
  });

  it('sends the next active catalog model when the saved pair is turned off', async () => {
    const storage = memoryStorage();
    setModelActive(storage, { browserProfileId: 'profile-a', backendProfileName: 'backend-a' }, 'provider-a', 'model-a', false);
    const calls: NativeChatStartPayload[] = [];
    const catalog = input(storage, {
      availableModels: [
        {
          provider: 'Provider A',
          provider_id: 'provider-a',
          configured: true,
          models: [catalogModel('provider-a', 'model-a'), catalogModel('provider-a', 'model-b')],
        },
      ],
    });

    const prepared = prepareGuardedNativeChatStart(catalog);
    expect(prepared).toMatchObject({
      ok: true,
      inactiveModelFallback: true,
      payload: { model: 'model-b', modelProvider: 'provider-a', message: 'exact test request' },
    });

    const started = await startGuardedNativeChat(catalog, async (payload) => {
      calls.push(payload);
      return { sessionId: 'session-a', streamId: 'stream-a' };
    });
    expect(started).toMatchObject({ ok: true, inactiveModelFallback: true, response: { streamId: 'stream-a' } });
    expect(calls).toEqual([expect.objectContaining({ model: 'model-b', modelProvider: 'provider-a' })]);
  });

  it('keeps a saved active pair blocked when that pair is missing from the Space catalog', () => {
    const storage = memoryStorage();
    const prepared = prepareGuardedNativeChatStart(input(storage, {
      selection: { scope: { backendProfileId: 'backend-id', spaceId: 'space-a', browserProfileId: 'profile-a' }, model: 'model-hidden', provider: 'provider-a' },
      availableModels: [{
        provider: 'Provider A', provider_id: 'provider-a', configured: true,
        models: [catalogModel('provider-a', 'model-c')],
      }],
    }));
    expect(prepared).toEqual({ ok: false, reason: 'model_unavailable' });
  });

  it('allows a previously qualified pair without beta opt-in', async () => {
    const storage = memoryStorage();
    recordCompletedChatEvidence({
      startAccepted: true, completed: true, browserProfileId: 'profile-a', backendProfileName: 'backend-a',
      runtimeGeneration: 'runtime-test', appBuildId: 'build-test',
      providerEvidence: { provider_id: 'provider-a', model_id: 'model-a', successful_chat: true,
        runtime_generation: 'runtime-test', provider_config_generation: 'provider-config-test' },
    }, storage);
    const result = await startGuardedNativeChat(input(storage), async () => ({ sessionId: 'session-a', streamId: 'stream-a' }));
    expect(result).toMatchObject({ ok: true, payload: { model: 'model-a', modelProvider: 'provider-a' } });
  });
});
