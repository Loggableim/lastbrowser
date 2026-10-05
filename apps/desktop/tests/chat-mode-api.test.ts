import { describe, expect, it } from 'vitest';
import {
  controlChatMode,
  controlPersistentGoal,
  startSidekickChat,
  type FetchLike
} from '../src/main/sidekick-api.js';

const scope = { backendProfileId: 'profile-1', spaceId: 'space-1', browserProfileId: 'browser-1' };
const nonce = 'private-bridge-nonce';

function response(value: unknown = { ok: true }): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}

function recorder(value: unknown = { ok: true }): { calls: Array<{ url: string; init?: RequestInit }>; fetch: FetchLike } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url: String(url), init });
    return response(value);
  };
  return { calls, fetch };
}

describe('chat mode and persistent goal API mappers', () => {
  it('GET mode sends no mode/CAS/request-id fields and uses the private headers', async () => {
    const { calls, fetch } = recorder({ mode: { mode: 'plan', revision: 2 } });
    await controlChatMode('http://127.0.0.1:8787', {
      action: 'get', sessionId: 'session-1', profile: 'research', spaceScope: scope, nativeBridgeNonce: nonce
    }, fetch);
    const call = calls[0];
    const body = JSON.parse(String(call.init?.body));
    expect(body).toEqual({ action: 'get', session_id: 'session-1', space_scope: scope });
    expect(body).not.toHaveProperty('mode');
    expect(body).not.toHaveProperty('expected_revision');
    expect(body).not.toHaveProperty('client_request_id');
    expect((call.init?.headers as Record<string, string>)['X-Lastbrowser-Bridge-Token']).toBe(nonce);
    expect((call.init?.headers as Record<string, string>).cookie).toBe('sidekick_profile=research');
  });

  it('SET mode sends exact fields and keeps private nonce out of the body', async () => {
    const { calls, fetch } = recorder();
    await controlChatMode('http://127.0.0.1:8787', {
      action: 'set', sessionId: 'session-1', profile: 'research', spaceScope: scope, nativeBridgeNonce: nonce,
      mode: 'boost', lifetime: 'next_turn', expectedRevision: 4, clientRequestId: 'request-1234'
    }, fetch);
    const call = calls[0];
    const body = JSON.parse(String(call.init?.body));
    expect(body).toEqual({ action: 'set', session_id: 'session-1', space_scope: scope, mode: 'boost', lifetime: 'next_turn', expected_revision: 4, client_request_id: 'request-1234' });
    expect(JSON.stringify(body)).not.toContain(nonce);
  });

  it('does not fetch when the native scope or nonce is missing', () => {
    const { calls, fetch } = recorder();
    expect(() => controlChatMode('http://127.0.0.1:8787', { action: 'get', sessionId: 's' }, fetch)).toThrow();
    expect(() => controlPersistentGoal('http://127.0.0.1:8787', { sessionId: 's', args: 'continue', spaceScope: scope }, fetch)).toThrow();
    expect(calls).toHaveLength(0);
  });

  it('maps persistent goal revision, request id, effort, and nonce only to the contract locations', async () => {
    const { calls, fetch } = recorder();
    await controlPersistentGoal('http://127.0.0.1:8787', {
      sessionId: 'session-1', args: 'continue', profile: 'research', spaceScope: scope, nativeBridgeNonce: nonce,
      reasoningEffort: 'high', expectedRevision: 7, clientRequestId: 'request-5678'
    }, fetch);
    const call = calls[0];
    const body = JSON.parse(String(call.init?.body));
    expect(body).toEqual({ session_id: 'session-1', args: 'continue', profile: 'research', space_scope: scope, reasoning_effort: 'high', expected_revision: 7, client_request_id: 'request-5678' });
    expect(JSON.stringify(body)).not.toContain(nonce);
    expect((call.init?.headers as Record<string, string>)['X-Lastbrowser-Bridge-Token']).toBe(nonce);
  });

  it('uses the bound backend profile header for goal and mode requests', async () => {
    const goal = recorder();
    await controlPersistentGoal('http://127.0.0.1:8787', { sessionId: 's', args: 'x', profile: 'bound-profile', spaceScope: scope, nativeBridgeNonce: nonce }, goal.fetch);
    const mode = recorder();
    await controlChatMode('http://127.0.0.1:8787', { action: 'get', sessionId: 's', profile: 'bound-profile', spaceScope: scope, nativeBridgeNonce: nonce }, mode.fetch);
    expect((goal.calls[0].init?.headers as Record<string, string>).cookie).toBe('sidekick_profile=bound-profile');
    expect((mode.calls[0].init?.headers as Record<string, string>).cookie).toBe('sidekick_profile=bound-profile');
  });

  it('does not overwrite stored mode when starting a chat without an explicit mode property', async () => {
    const { calls, fetch } = recorder({ session_id: 'session-1', stream_id: 'stream-1' });
    const result = await startSidekickChat('http://127.0.0.1:8787', {
      sessionId: 'session-1', message: 'continue', profile: 'research', spaceScope: scope, nativeBridgeNonce: nonce
    }, fetch);
    const body = JSON.parse(String(calls[0].init?.body));
    expect(result).toEqual({ sessionId: 'session-1', streamId: 'stream-1' });
    expect(body).not.toHaveProperty('mode');
    expect(body.chat_mode).toBe('chat');
  });
});
