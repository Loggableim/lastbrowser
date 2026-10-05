import { describe, expect, it } from 'vitest';
import { controlChatMode, controlModelPolicy, controlNativeChat, readChildHistory, type FetchLike } from '../src/main/sidekick-api.js';

const scope = { backendProfileId: 'profile-1', spaceId: 'space-1', browserProfileId: 'browser-1' };
const nonce = 'private-bridge-nonce';
const fetcher = (calls: Array<{ url: string; init?: RequestInit }>): FetchLike => async (url, init) => {
  calls.push({ url: String(url), init });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

describe('native chat control transport', () => {
  it('sends child recovery identity and cursor only in the body', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await readChildHistory('http://127.0.0.1:8787', { sessionId: 'parent', profile: 'research', spaceScope: scope, nativeBridgeNonce: nonce, parentTurnId: 'turn-1', afterSequence: { child: 2 } }, fetcher(calls));
    const body = JSON.parse(String(calls[0].init?.body));
    expect(calls[0].url).toContain('/api/chat/children');
    expect(body).toEqual({ session_id: 'parent', space_scope: scope, parent_turn_id: 'turn-1', after_sequence: { child: 2 } });
    expect(JSON.stringify(body)).not.toContain(nonce);
    expect((calls[0].init?.headers as Record<string, string>)['X-Lastbrowser-Bridge-Token']).toBe(nonce);
  });

  it('rejects child recovery without scope or nonce before fetch', () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    expect(() => readChildHistory('http://127.0.0.1:8787', { sessionId: 'parent' }, fetcher(calls))).toThrow();
    expect(calls).toHaveLength(0);
  });

  it('keeps GET mode transport free of set-only fields', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await controlChatMode('http://127.0.0.1:8787', { action: 'get', sessionId: 'parent', spaceScope: scope, nativeBridgeNonce: nonce }, fetcher(calls));
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body).toEqual({ action: 'get', session_id: 'parent', space_scope: scope });
  });

  it('serializes model-policy CAS and keeps the bridge nonce in the header', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await controlModelPolicy('http://127.0.0.1:8787', {
      action: 'set', sessionId: 'parent', profile: 'research', spaceScope: scope,
      nativeBridgeNonce: nonce, draft: { mode: 'fixed', allowedModels: [] }, expectedRevision: 0,
      clientRequestId: 'policy-request-1'
    }, fetcher(calls));
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.expectedRevision).toBe(0);
    expect(body.clientRequestId).toBe('policy-request-1');
    expect(JSON.stringify(body)).not.toContain(nonce);
    expect((calls[0].init?.headers as Record<string, string>)['X-Lastbrowser-Bridge-Token']).toBe(nonce);
  });

  it('serializes native control with workspace header and no private fields in body', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await controlNativeChat('http://127.0.0.1:8787', {
      sessionId: 'parent', streamId: 'stream-1', command: 'approval', profile: 'research',
      workspacePath: 'C:/workspace', spaceScope: scope, nativeBridgeNonce: nonce,
      requestId: 'approval-1', choice: 'once'
    }, fetcher(calls));
    const body = JSON.parse(String(calls[0].init?.body));
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(body).toEqual({ session_id: 'parent', stream_id: 'stream-1', space_scope: scope, command: 'approval', request_id: 'approval-1', choice: 'once' });
    expect(headers['X-Sidekick-Workspace']).toBe('C:/workspace');
    expect(JSON.stringify(body)).not.toContain(nonce);
  });
});
