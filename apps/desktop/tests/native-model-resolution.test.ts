import { describe, expect, it } from 'vitest';
import { isNativeModelResolution } from '../src/renderer/independent-assistant-client.js';
import { readNativeModelResolutionEvent } from '../src/renderer/native-model-resolution.js';

const scope = { backendProfileId: '11111111-1111-4111-8111-111111111111', spaceId: '22222222-2222-4222-8222-222222222222', browserProfileId: 'profile-a' };
const binding = { scope, sessionId: 'session-a', streamId: '33333333-3333-4333-8333-333333333333', workspacePath: 'C:/space', browserProfileId: 'profile-a' };
const resolution = { schemaVersion: 1 as const, scope, streamId: binding.streamId,
  requested: { provider: 'ollama-cloud', model: 'gpt-oss:20b' }, effective: { provider: 'ollama-cloud', model: 'gemma4:31b' },
  fallbackApplied: true, fallbackReasonCode: 'ollama_subscription_required' as const, fallbackAttempts: 1 as const };
const event = (patch: Record<string, unknown> = {}) => ({ event: 'nativeModelResolution', streamId: binding.streamId, sessionId: binding.sessionId,
  nativeContext: { schemaVersion: 1, scope, sessionId: binding.sessionId, streamId: binding.streamId, writerGeneration: 'writer-4' }, data: resolution, ...patch });

describe('native model resolution notice contract', () => {
  it('accepts only one explicit, allowlisted same-provider Ollama fallback', () => {
    expect(isNativeModelResolution(resolution)).toBe(true);
    expect(readNativeModelResolutionEvent(event(), binding, 'writer-4')).toEqual(resolution);
    expect(readNativeModelResolutionEvent(event(), binding, 'writer-3')).toBeNull();
    expect(readNativeModelResolutionEvent(event({ streamId: '44444444-4444-4444-8444-444444444444' }), binding)).toBeNull();
    expect(readNativeModelResolutionEvent(event({ nativeContext: { schemaVersion: 1, scope, sessionId: 'other', streamId: binding.streamId, writerGeneration: 'writer-4' } }), binding)).toBeNull();
  });

  it('rejects fallback claims that change provider or use a model outside the explicit allowlist', () => {
    expect(isNativeModelResolution({ ...resolution, effective: { provider: 'other', model: 'gemma4:31b' } })).toBe(false);
    expect(isNativeModelResolution({ ...resolution, effective: { provider: 'ollama-cloud', model: 'unknown-model' } })).toBe(false);
    expect(isNativeModelResolution({ ...resolution, fallbackAttempts: 0 })).toBe(false);
    expect(isNativeModelResolution({ ...resolution, fallbackApplied: false, fallbackReasonCode: null, fallbackAttempts: 0 })).toBe(false);
  });
});
