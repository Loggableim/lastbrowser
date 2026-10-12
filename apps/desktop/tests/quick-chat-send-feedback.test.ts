import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8');
const boundary = source.slice(source.indexOf('  async function sendQuickChat('), source.indexOf('  async function stopQuickChat('));
const js = ts.transpileModule(boundary, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function harness() {
  const transcripts = new Map<string, any[]>();
  let reject!: (error: Error) => void;
  let requests = 0;
  const ref = (current: any) => ({ current });
  const context: Record<string, any> = {
    quickChatBusyRef: ref(false), quickChatStopPendingRef: ref(false), quickChatResetPendingRef: ref(false),
    quickChatBindingScopeKeyRef: ref(null), quickChatTranscriptScopeKeyRef: ref(null),
    quickChatGenerationRef: ref(0), quickChatStopEpochRef: ref(0), quickChatIdRef: ref('q'),
    activeProfileIdRef: ref('p'), activeSpacePathRef: ref('w'), activeBackendProfileNameRef: ref('b'),
    updateQuickChatMessagesForScope: (scope: string, update: any) => transcripts.set(scope, update(transcripts.get(scope) ?? [])),
    setQuickChatErrorForScope: () => {},
    readCapturedSpaceModelSelection: () => { requests++; return new Promise((_resolve, fail) => { reject = fail; }); },
  };
  const send = new Function(...Object.keys(context), `${js}; return sendQuickChat;`)(...Object.values(context));
  return { send, context, transcripts, requests: () => requests, reject: () => reject(new Error('catalog unavailable')) };
}

describe('Quickchat feedback before model discovery', () => {
  it('echoes immediately while catalog IPC is stalled and reserves against duplicate sends', async () => {
    const h = harness(); const pending = h.send('hello');
    expect(h.transcripts.get('p::w::b')).toEqual([expect.objectContaining({ role: 'user', content: 'hello' })]);
    expect(await h.send('hello')).toBe(false);
    expect(h.requests()).toBe(1);
    h.reject(); expect(await pending).toBe(false);
    expect(h.transcripts.get('p::w::b')).toEqual([]);
    expect(h.context.quickChatStopPendingRef.current).toBe(false);
    expect(h.context.quickChatTranscriptScopeKeyRef.current).toBeNull();
  });
  it('rolls back only its own echo in the captured scope on a definite preflight failure', async () => {
    const h = harness(); const previous = { role: 'assistant', content: 'previous' };
    h.transcripts.set('p::w::b', [previous]);
    const pending = h.send('hello');
    h.context.activeSpacePathRef.current = 'other';
    h.transcripts.set('p::other::b', [{ role: 'user', content: 'other draft' }]);
    h.reject(); await pending;
    expect(h.transcripts.get('p::w::b')).toEqual([previous]);
    expect(h.transcripts.get('p::other::b')).toEqual([{ role: 'user', content: 'other draft' }]);
  });
});
