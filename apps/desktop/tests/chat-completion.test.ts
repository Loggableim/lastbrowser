import { describe, expect, it, vi } from 'vitest';
import { createOnceChatCompletionNotifier, isChatCompletionConfirmed } from '../src/renderer/chat-completion.js';
import { applyLiveChatDelta, finishLiveChatMessage, readLiveChatDelta } from '../src/renderer/chat-live-stream.js';

describe('native chat completion signals', () => {
  it('renders each arriving token into the pending assistant message immediately', () => {
    const initial = [
      { id: 'user-1', role: 'user' as const, content: 'Tell a story' },
      { id: 'assistant-1', role: 'assistant' as const, content: 'Working on it...', pending: true },
    ];
    const first = applyLiveChatDelta(initial, 'token', 'Once');
    const second = applyLiveChatDelta(first, 'token', ' upon');

    expect(first[1]).toMatchObject({ content: 'Once', pending: false });
    expect(second[1]).toMatchObject({ content: 'Once upon', pending: false, streaming: true });
    expect(second[0]).toEqual(initial[0]);
    expect(finishLiveChatMessage(second)[1]).toMatchObject({ content: 'Once upon', streaming: false });
  });

  it('streams reasoning separately from user-visible answer text', () => {
    const initial = [{ id: 'assistant-1', role: 'assistant' as const, content: 'Working on it...', pending: true }];
    const withReasoning = applyLiveChatDelta(initial, 'reasoning', 'Let me consider this.');
    const withMoreReasoning = applyLiveChatDelta(withReasoning, 'reasoning', ' Check constraints.');
    const withAnswer = applyLiveChatDelta(withReasoning, 'token', 'Hello.');

    expect(withReasoning[0]).toMatchObject({ content: '', pending: true, streaming: true });
    expect(withMoreReasoning[0]).toMatchObject({ pending: true, reasoning: 'Let me consider this. Check constraints.' });
    expect(withAnswer[0]).toMatchObject({
      content: 'Hello.',
      reasoning: 'Let me consider this.',
      pending: false,
    });
    expect(finishLiveChatMessage(withReasoning)[0]).toMatchObject({ pending: false, streaming: false });
  });

  it('renders the Teamwork final synthesis delta sent as data.content immediately', () => {
    const initial = [{ id: 'assistant-1', role: 'assistant' as const, content: 'Teamwork: Synthese abgeschlossen', pending: true }];
    const delta = readLiveChatDelta('delta', { content: 'Synthesized answer' });
    expect(delta).toEqual({ kind: 'token', text: 'Synthesized answer' });

    const rendered = delta
      ? applyLiveChatDelta(initial, delta.kind, delta.text)
      : initial;
    expect(rendered[0]).toMatchObject({
      content: 'Synthesized answer',
      pending: false,
      streaming: true,
    });
  });

  it('preserves text-token and separate reasoning delta formats', () => {
    expect(readLiveChatDelta('token', { text: 'Hello' })).toEqual({ kind: 'token', text: 'Hello' });
    expect(readLiveChatDelta('reasoning', { text: 'Thinking' })).toEqual({ kind: 'reasoning', text: 'Thinking' });
    expect(readLiveChatDelta('delta', { text: 'preferred', content: 'fallback' }))
      .toEqual({ kind: 'token', text: 'preferred' });
    expect(readLiveChatDelta('reasoning', { content: 'not reasoning text' })).toBeNull();
    expect(readLiveChatDelta('teamwork_complete', { content: 'done' })).toBeNull();
  });

  it('requires a loaded, idle session and no active stream', () => {
    expect(isChatCompletionConfirmed({ streamActive: false, session: {} })).toBe(true);
    expect(isChatCompletionConfirmed({ streamActive: undefined, session: {} })).toBe(true);
    expect(isChatCompletionConfirmed({ streamActive: true, session: {} })).toBe(false);
    expect(isChatCompletionConfirmed({ streamActive: false, session: { active_stream_id: 'stream-1' } })).toBe(false);
    expect(isChatCompletionConfirmed({ streamActive: false, session: { pending_user_message: 'still pending' } })).toBe(false);
    expect(isChatCompletionConfirmed({ streamActive: false, session: null })).toBe(false);
  });

  it('emits sound and an eligible notification only once across stream and polling paths', () => {
    const playSound = vi.fn();
    const showNotification = vi.fn();
    const notify = createOnceChatCompletionNotifier(true, true, playSound, showNotification);

    notify(); // SSE stream_end
    notify(); // fallback poll sees the same completion

    expect(playSound).toHaveBeenCalledOnce();
    expect(showNotification).toHaveBeenCalledOnce();
  });

  it('keeps disabled sound and notifications silent', () => {
    const playSound = vi.fn();
    const showNotification = vi.fn();
    createOnceChatCompletionNotifier(false, false, playSound, showNotification)();

    expect(playSound).not.toHaveBeenCalled();
    expect(showNotification).not.toHaveBeenCalled();
  });
});
