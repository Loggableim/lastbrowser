import { describe, expect, it } from 'vitest';
import { sendSidekickMessage, startSidekickChat } from '../src/main/sidekick-api.js';

type RecordedCall = { url: string; init?: RequestInit };

function bodyOf(call: RecordedCall): Record<string, unknown> {
  return JSON.parse(String(call.init?.body)) as Record<string, unknown>;
}

function ok(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

describe('Sidekick chat reasoning effort', () => {
  it('forwards a trimmed effort on stream start without changing chat scope or pinned account', async () => {
    const calls: RecordedCall[] = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return ok({ stream_id: 'stream-start', session_id: 'session-start' });
    };

    await startSidekickChat('http://127.0.0.1:8787', {
      sessionId: 'session-start',
      message: 'Please reason carefully',
      reasoningEffort: '  high \t',
      model: 'provider/model',
      modelProvider: 'provider',
      providerAccountEmail: 'PINNED@EXAMPLE.TEST',
      profile: 'work-profile',
      workspace: 'C:/work/project'
    }, fetchImpl);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://127.0.0.1:8787/api/chat/start');
    expect(bodyOf(calls[0])).toMatchObject({
      session_id: 'session-start',
      message: 'Please reason carefully',
      reasoning_effort: 'high',
      model: 'provider/model',
      model_provider: 'provider',
      provider_account_email: 'pinned@example.test',
      profile: 'work-profile',
      workspace: 'C:/work/project'
    });
    expect(new Headers(calls[0].init?.headers).get('cookie')).toBe('sidekick_profile=work-profile');
  });

  it('forwards a trimmed effort on compatibility send without changing session scope or pinned account', async () => {
    const calls: RecordedCall[] = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/api/session/new')) {
        return ok({ session: { session_id: 'session-send', workspace: 'C:/work/project' } });
      }
      if (String(url).endsWith('/api/chat/start')) {
        return ok({ stream_id: 'stream-send', session_id: 'session-send' });
      }
      return ok({
        session: {
          session_id: 'session-send',
          active_stream_id: null,
          pending_user_message: null,
          messages: [
            { role: 'user', content: 'Please reason carefully' },
            { role: 'assistant', content: 'Done' }
          ]
        }
      });
    };

    await sendSidekickMessage('http://127.0.0.1:8787', {
      message: 'Please reason carefully',
      reasoningEffort: '  medium  ',
      model: 'provider/model',
      modelProvider: 'provider',
      providerAccountEmail: 'PINNED@EXAMPLE.TEST',
      profile: 'work-profile',
      workspace: 'C:/work/project'
    }, fetchImpl, { intervalMs: 0, timeoutMs: 100 });

    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      '/api/session/new',
      '/api/chat/start',
      '/api/session'
    ]);
    expect(bodyOf(calls[0])).toMatchObject({
      workspace: 'C:/work/project',
      model: 'provider/model',
      model_provider: 'provider',
      profile: 'work-profile'
    });
    expect(bodyOf(calls[1])).toMatchObject({
      session_id: 'session-send',
      message: 'Please reason carefully',
      reasoning_effort: 'medium',
      model: 'provider/model',
      model_provider: 'provider',
      provider_account_email: 'pinned@example.test',
      profile: 'work-profile',
      workspace: 'C:/work/project'
    });
    for (const call of calls) {
      expect(new Headers(call.init?.headers).get('cookie')).toBe('sidekick_profile=work-profile');
    }
  });

  it('omits reasoning_effort when no per-turn override is supplied', async () => {
    const calls: RecordedCall[] = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const href = String(url);
      if (href.endsWith('/api/session/new')) {
        return ok({ session: { session_id: 'session-default', workspace: 'C:/work' } });
      }
      if (href.endsWith('/api/chat/start')) {
        return ok({ stream_id: 'stream-default', session_id: 'session-default' });
      }
      return ok({
        session: {
          session_id: 'session-default',
          active_stream_id: null,
          pending_user_message: null,
          messages: [{ role: 'assistant', content: 'Done' }]
        }
      });
    };

    await startSidekickChat('http://127.0.0.1:8787', {
      sessionId: 'session-default',
      message: 'Use configured reasoning'
    }, fetchImpl);
    await sendSidekickMessage('http://127.0.0.1:8787', {
      message: 'Use configured reasoning',
      profile: 'work-profile',
      workspace: 'C:/work'
    }, fetchImpl, { intervalMs: 0, timeoutMs: 100 });

    const chatCalls = calls.filter((call) => new URL(call.url).pathname === '/api/chat/start');
    expect(chatCalls).toHaveLength(2);
    for (const call of chatCalls) {
      expect(bodyOf(call)).not.toHaveProperty('reasoning_effort');
      expect(bodyOf(call)).not.toHaveProperty('reasoningEffort');
    }
  });

  it.each([
    ['empty string', ''],
    ['whitespace-only string', ' \t  '],
    ['null', null]
  ] as const)('omits reasoning_effort for a %s override', async (_label, reasoningEffort) => {
    const calls: RecordedCall[] = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const href = String(url);
      if (href.endsWith('/api/session/new')) {
        return ok({ session: { session_id: 'session-blank', workspace: 'C:/work' } });
      }
      if (href.endsWith('/api/chat/start')) {
        return ok({ stream_id: 'stream-blank', session_id: 'session-blank' });
      }
      return ok({
        session: {
          session_id: 'session-blank',
          active_stream_id: null,
          pending_user_message: null,
          messages: [{ role: 'assistant', content: 'Done' }]
        }
      });
    };

    await startSidekickChat('http://127.0.0.1:8787', {
      sessionId: 'session-blank',
      message: 'Use configured reasoning',
      reasoningEffort
    }, fetchImpl);
    await sendSidekickMessage('http://127.0.0.1:8787', {
      message: 'Use configured reasoning',
      reasoningEffort,
      profile: 'work-profile',
      workspace: 'C:/work'
    }, fetchImpl, { intervalMs: 0, timeoutMs: 100 });

    const chatCalls = calls.filter((call) => new URL(call.url).pathname === '/api/chat/start');
    expect(chatCalls).toHaveLength(2);
    for (const call of chatCalls) {
      expect(bodyOf(call)).not.toHaveProperty('reasoning_effort');
      expect(bodyOf(call)).not.toHaveProperty('reasoningEffort');
    }
  });
});
