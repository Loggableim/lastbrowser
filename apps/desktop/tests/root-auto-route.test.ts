import { afterEach, describe, expect, it } from 'vitest';
import { readNativeAutoRouteReceipt, useNativeChatControls, type NativeChatBinding } from '../src/renderer/native-chat-control.js';

const scope = { backendProfileId: '12345678-1234-1234-1234-123456789012', spaceId: '22345678-1234-1234-1234-123456789012', browserProfileId: 'profile-a' };
const binding: NativeChatBinding = { scope, sessionId: 'session-a', streamId: 'stream-a', workspacePath: 'C:/space-a', browserProfileId: 'profile-a' };
const route = (overrides: Record<string, unknown> = {}) => ({
  streamId: binding.streamId,
  event: 'auto_route',
  data: { schemaVersion: 1, sessionId: binding.sessionId, turnId: 'turn-a', policyRevision: 1, route: 'model', scope, selectedModel: { provider: 'google', model: 'gemini-live' },
    locality: 'remote', reason: 'observed_provider_headroom', activeClaims: 1, fallbackCount: 0 },
  nativeContext: { schemaVersion: 1, scope, sessionId: binding.sessionId, streamId: binding.streamId, writerGeneration: 'writer-a' },
  ...overrides,
});

afterEach(() => useNativeChatControls.setState({ records: {}, activeStreamId: null, autoRoute: null }));

describe('native AUTO route receipt', () => {
  it('accepts only the exact bound Main session, stream, scope, turn, and selected actual model', () => {
    expect(readNativeAutoRouteReceipt(route(), binding)).toEqual({ turnId: 'turn-a', provider: 'google', model: 'gemini-live',
      locality: 'remote', reason: 'observed_provider_headroom' });
    expect(readNativeAutoRouteReceipt(route({ streamId: 'stream-b' }), binding)).toBeNull();
    expect(readNativeAutoRouteReceipt(route({ nativeContext: { ...route().nativeContext, sessionId: 'session-b' } }), binding)).toBeNull();
    expect(readNativeAutoRouteReceipt(route({ data: { ...route().data, scope: { ...scope, spaceId: '32345678-1234-1234-1234-123456789012' } } }), binding)).toBeNull();
    expect(readNativeAutoRouteReceipt(route({ data: { ...route().data, selectedModel: { provider: 'google', model: 'auto' } } }), binding)).toBeNull();
    expect(readNativeAutoRouteReceipt(route({ event: 'teamwork_stage' }), binding)).toBeNull();
  });

  it('keeps a routing receipt separate from execution and rejects a late old-stream receipt', () => {
    const store = useNativeChatControls.getState();
    store.bind(binding);
    store.event(route());
    expect(useNativeChatControls.getState().autoRoute?.receipt.model).toBe('gemini-live');

    const next: NativeChatBinding = { ...binding, streamId: 'stream-b' };
    useNativeChatControls.getState().bind(next);
    expect(useNativeChatControls.getState().autoRoute).toBeNull();
    useNativeChatControls.getState().event(route());
    expect(useNativeChatControls.getState().autoRoute).toBeNull();
    expect(useNativeChatControls.getState().records['stream-a']).toBeDefined();
  });
});
