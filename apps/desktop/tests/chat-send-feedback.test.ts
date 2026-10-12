import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { ChatDraftSubmissionGate } from '../src/renderer/chat-draft-submission.js';

// Execute the actual App submission boundary with a deliberately stalled
// backend, without mounting the browser shell or making provider requests.
const app = readFileSync(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8');
const boundary = app.slice(app.indexOf('  async function startNativeChat('), app.indexOf('  async function startNativeChatTurn('));
const js = ts.transpileModule(boundary, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(ambiguous = false) {
  let chat: any[] = [], legacy: any[] = [], draft = 'hello';
  let resolve!: (accepted: boolean) => void;
  let starts = 0;
  const context: Record<string, any> = {
    parsePersistentGoalCommand: () => null, sidekickBusy: false, chatRunState: 'idle', activeSession: null,
    activeSessionIdRef: { current: 's' }, activeProfileIdRef: { current: 'p' },
    activeSpacePathRef: { current: 'w' }, activeBackendProfileNameRef: { current: 'b' },
    nativeChatSubmissionGateRef: { current: new ChatDraftSubmissionGate() },
    composerTextRef: { current: 'hello' }, composerRevisionRef: { current: 0 },
    setComposerText: (value: string) => { draft = value; context.composerRevisionRef.current++; },
    setChatMessages: (update: any) => { chat = update(chat); },
    setMessages: (update: any) => { legacy = update(legacy); },
    startNativeChatTurn: (...args: any[]) => {
      starts++;
      if (ambiguous) args[4].definitelyRejected = false;
      return new Promise<boolean>(done => { resolve = done; });
    },
  };
  const send = new Function(...Object.keys(context), `${js}; return startNativeChat;`)(...Object.values(context));
  return { send, context, finish: (accepted: boolean) => resolve(accepted),
    state: () => ({ chat, legacy, draft, starts }) };
}
describe('immediate standard-chat send feedback', () => {
  it('shows the user message and clears input while preflight is stalled; repeated sends cannot duplicate it', async () => {
    const h = harness(); const pending = h.send('hello');
    expect(h.state().chat).toEqual([{ role: 'user', content: 'hello' }]);
    expect(h.state().draft).toBe('');
    expect(await h.send('hello')).toBe(false);
    expect(h.state().starts).toBe(1);
    h.finish(true); await pending;
    expect(h.state().chat).toHaveLength(1);
  });
  it('removes rejected echo and restores untouched draft', async () => {
    const h = harness(); const pending = h.send('hello'); h.finish(false); await pending;
    expect(h.state().chat).toEqual([]); expect(h.state().legacy).toEqual([]);
    expect(h.state().draft).toBe('hello');
  });
  it('does not remove messages or restore drafts in another scope', async () => {
    const h = harness(); const pending = h.send('hello');
    h.context.activeSessionIdRef.current = 'other'; h.finish(false); await pending;
    expect(h.state().chat).toHaveLength(1); expect(h.state().draft).toBe('');
  });
  it('keeps an ambiguous transport outcome visible without restoring a duplicate-sendable draft', async () => {
    const h = harness(true); const pending = h.send('hello'); h.finish(false); await pending;
    expect(h.state().chat).toHaveLength(1); expect(h.state().draft).toBe('');
  });
});
