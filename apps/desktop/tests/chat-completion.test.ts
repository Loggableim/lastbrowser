import { describe, expect, it, vi } from 'vitest';
import { createOnceChatCompletionNotifier, isChatCompletionConfirmed } from '../src/renderer/chat-completion.js';
import { applyLiveChatDelta, applyLiveChatProgress, claimRestoredChatStream, finishLiveChatMessage, preserveInFlightChatMessages, readLiveChatDelta, readRestoredChatStream, restorePendingChatTurn } from '../src/renderer/chat-live-stream.js';

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

  it('preserves the new in-flight assistant while a stale session snapshot is loading', () => {
    const live = [
      { id: 'user-1', role: 'user' as const, content: 'Tell a story' },
      { id: 'assistant-1', role: 'assistant' as const, content: 'Working on it...', pending: true },
    ];
    const staleSnapshot = [{ id: 'user-1', role: 'user' as const, content: 'Tell a story' }];

    expect(preserveInFlightChatMessages(staleSnapshot, live)).toEqual(live);
    expect(applyLiveChatDelta(preserveInFlightChatMessages(staleSnapshot, live), 'token', 'Once')[1])
      .toMatchObject({ content: 'Once', streaming: true });
  });

  it('does not mistake the previous turn answer for output from the pending turn', () => {
    const live = [
      { id: 'prior-user', role: 'user' as const, content: 'Earlier question' },
      { id: 'prior-answer', role: 'assistant' as const, content: 'Earlier answer' },
      { id: 'user-2', role: 'user' as const, content: 'Tell a story' },
      { id: 'assistant-2', role: 'assistant' as const, content: 'Working on it...', pending: true },
    ];
    const snapshotBeforeAssistantAnswer = live.slice(0, 3);

    expect(preserveInFlightChatMessages(snapshotBeforeAssistantAnswer, live)).toEqual(live);
  });

  it('does not carry an in-flight turn into a different session transcript', () => {
    const live = [
      { id: 'user-1', role: 'user' as const, content: 'Tell a story' },
      { id: 'assistant-1', role: 'assistant' as const, content: 'Working on it...', pending: true },
    ];
    const anotherSession = [{ id: 'other-user', role: 'user' as const, content: 'Different session' }];

    expect(preserveInFlightChatMessages(anotherSession, live)).toEqual(anotherSession);
  });

  it('restores and claims an active stream exactly once after renderer restart', () => {
    const restoredSession = {
      session_id: 'session-restarted',
      active_stream_id: 'stream-still-running',
      pending_user_message: 'Continue the project goal',
    };
    const claims = new Set<string>();
    const restored = readRestoredChatStream(restoredSession);

    expect(restored).toEqual({
      sessionId: 'session-restarted',
      streamId: 'stream-still-running',
      pendingUserMessage: 'Continue the project goal',
    });
    expect(claimRestoredChatStream(restored!.sessionId, restored!.streamId, claims)).toBe(true);
    expect(claimRestoredChatStream(restored!.sessionId, restored!.streamId, claims)).toBe(false);
    expect(readRestoredChatStream({ ...restoredSession, active_stream_id: null })).toBeNull();
  });

  it('rebuilds the persisted in-flight user turn and stream target without duplicating it', () => {
    const prior = [{ role: 'assistant' as const, content: 'Previous turn completed.' }];
    const messages = restorePendingChatTurn(prior, 'Continue the project goal');

    expect(messages).toEqual([
      ...prior,
      { role: 'user', content: 'Continue the project goal' },
      { role: 'assistant', content: 'Working on it...', pending: true },
    ]);
    expect(restorePendingChatTurn(messages, 'Continue the project goal')).toEqual(messages);
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

  it('keeps Teamwork stage status separate from the final assistant answer', () => {
    const initial = [{ id: 'assistant-1', role: 'assistant' as const, content: 'Working on it...', pending: true }];
    const withProgress = applyLiveChatProgress(initial, 'Teamwork: 2 models are drafting.');
    expect(withProgress[0]).toMatchObject({
      content: 'Working on it...',
      progress: 'Teamwork: 2 models are drafting.',
      pending: true,
    });

    const withAnswer = applyLiveChatDelta(withProgress, 'token', 'Synthesized answer');
    expect(withAnswer[0]).toMatchObject({
      content: 'Synthesized answer',
      progress: undefined,
      pending: false,
    });
    expect(finishLiveChatMessage(withProgress)[0]).toMatchObject({
      content: 'Working on it...',
      progress: undefined,
      pending: false,
    });
  });

  it('clears a pending placeholder when a stream terminates before any visible output', () => {
    const initial = [{ id: 'assistant-1', role: 'assistant' as const, content: 'Working on it...', pending: true }];
    expect(finishLiveChatMessage(initial)[0]).toMatchObject({
      content: 'Working on it...',
      pending: false,
      streaming: false,
      progress: undefined,
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
