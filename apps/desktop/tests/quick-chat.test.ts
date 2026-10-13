import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickChat } from '../src/renderer/quick-chat.js';

function fixture() {
  const listeners = new Set<(payload: unknown) => void>();
  const emit = (streamId: string, event: string, data?: unknown) => listeners.forEach((listener) => listener({ streamId, event, data }));
  let nextId = 0;
  const client = {
    startChat: vi.fn(async (request) => ({ sessionId: request.sessionId || `quick-${++nextId}`, streamId: `stream-${nextId}` })),
    getSession: vi.fn(async () => ({})),
    getStreamStatus: vi.fn(async () => ({ active: true })),
    onChatStreamEvent: vi.fn((listener: (payload: unknown) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }),
    subscribeChatStream: vi.fn(async () => ({})),
    unsubscribeChatStream: vi.fn(async () => ({})),
    cancelStream: vi.fn(async () => ({}))
  };
  const chat = new QuickChat(client, { profile: 'profile-a', workspace: 'C:/workspace-a' });
  return { chat, client, emit, listeners };
}

afterEach(() => vi.useRealTimers());

describe('browser quick chat isolation', () => {
  it('starts with its own session and carries model, provider and reasoning settings', async () => {
    const { chat, client, emit } = fixture();
    const pending = chat.send('Summarize this page', { model: 'test-model', modelProvider: 'test-provider', reasoningEffort: 'high' });
    await Promise.resolve();
    expect(client.startChat).toHaveBeenCalledWith({ sessionId: null, message: 'Summarize this page',
      profile: 'profile-a', workspace: 'C:/workspace-a', mode: 'action', model: 'test-model', modelProvider: 'test-provider', reasoningEffort: 'high' });
    emit('stream-1', 'token', { text: 'A summary' });
    emit('stream-1', 'stream_end');
    await pending;
    expect(chat.getSnapshot().messages.at(-1)?.content).toBe('A summary');
    expect(chat.getSnapshot().busy).toBe(false);
    const followup = chat.send('Tell me more');
    await Promise.resolve();
    expect(client.startChat.mock.calls[1][0].sessionId).toBe('quick-1');
    emit('stream-1', 'stream_end');
    await followup;
  });

  it('preserves its draft and conversation across view subscriptions, and resets lazily', async () => {
    const { chat, client, emit } = fixture();
    const unsubscribe = chat.subscribe(vi.fn());
    chat.setDraft('Unsent question');
    unsubscribe(); // Closing the panel does not dispose its owner.
    expect(chat.getSnapshot().draft).toBe('Unsent question');
    const turn = chat.send('Question');
    await Promise.resolve();
    emit('stream-1', 'stream_end');
    await turn;
    chat.reset();
    expect(chat.getSnapshot()).toEqual({ sessionId: null, messages: [], error: '', busy: false, draft: '' });
    expect(client.startChat).toHaveBeenCalledTimes(1);
    const fresh = chat.send('Another question');
    await Promise.resolve();
    expect(client.startChat.mock.calls[1][0].sessionId).toBeNull();
    emit('stream-2', 'stream_end');
    await fresh;
  });

  it('ignores full-chat stream events and blocks duplicate sends and resets while busy', async () => {
    const { chat, client, emit } = fixture();
    const turn = chat.send('Quick question');
    await Promise.resolve();
    emit('full-chat-stream', 'token', { text: 'Private full chat output' });
    emit('full-chat-stream', 'error', { message: 'Unrelated error' });
    chat.reset();
    await chat.send('Duplicate');
    expect(client.startChat).toHaveBeenCalledTimes(1);
    expect(chat.getSnapshot().messages).toHaveLength(2);
    expect(chat.getSnapshot().error).toBe('');
    emit('stream-1', 'stream_end');
    await turn;
  });

  it('captures matching tokens emitted before startChat returns', async () => {
    const { chat, client, emit } = fixture();
    client.startChat.mockImplementationOnce(async () => {
      emit('other-stream', 'token', { text: 'Wrong output' });
      emit('early-stream', 'token', { text: 'Early answer' });
      emit('early-stream', 'stream_end');
      return { sessionId: 'early-session', streamId: 'early-stream' };
    });
    await chat.send('Question');
    expect(chat.getSnapshot().messages.at(-1)?.content).toBe('Early answer');
  });

  it('reports failures without losing partial output and releases listeners', async () => {
    const { chat, emit, listeners } = fixture();
    const turn = chat.send('Question');
    await Promise.resolve();
    emit('stream-1', 'token', { text: 'Partial answer' });
    emit('stream-1', 'apperror', { message: 'Provider unavailable' });
    await turn;
    expect(chat.getSnapshot().error).toBe('Provider unavailable');
    expect(chat.getSnapshot().messages.at(-1)).toMatchObject({ content: 'Partial answer', pending: false, streaming: false });
    expect(listeners.size).toBe(0);
  });

  it('cancels only its own stream on stop and releases it on scope disposal', async () => {
    const { chat, client, emit, listeners } = fixture();
    const turn = chat.send('Question');
    await Promise.resolve();
    await chat.stop();
    expect(client.cancelStream).toHaveBeenCalledWith('stream-1');
    emit('stream-1', 'cancel');
    await turn;
    expect(chat.getSnapshot().busy).toBe(false);
    const next = chat.send('Next question');
    await Promise.resolve();
    chat.dispose();
    emit('stream-1', 'token', { text: 'Late output' });
    await next;
    expect(listeners.size).toBe(0);
    expect(chat.getSnapshot().messages.at(-1)?.content).not.toContain('Late output');
  });

  it('cancels a late start response after the scope changes', async () => {
    const { chat, client } = fixture();
    let resolveStart!: (value: { sessionId: string; streamId: string }) => void;
    client.startChat.mockImplementationOnce(() => new Promise((resolve) => { resolveStart = resolve; }));
    const turn = chat.send('Question');
    chat.dispose();
    resolveStart({ sessionId: 'old-profile-session', streamId: 'late-stream' });
    await turn;
    expect(client.cancelStream).toHaveBeenCalledWith('late-stream');
    expect(chat.getSnapshot().sessionId).toBeNull();
    expect(client.subscribeChatStream).not.toHaveBeenCalled();
  });

  it('stops before model resolution without starting a backend turn', async () => {
    const { chat, client } = fixture();
    let resolveOptions!: (value: {}) => void;
    const turn = chat.send('Question', () => new Promise((resolve) => { resolveOptions = resolve; }));
    await chat.stop();
    resolveOptions({});
    await turn;
    expect(client.startChat).not.toHaveBeenCalled();
    expect(chat.getSnapshot().busy).toBe(false);
  });

  it('recovers completion from scoped session polling if SSE fails', async () => {
    vi.useFakeTimers();
    const { chat, client } = fixture();
    client.subscribeChatStream.mockRejectedValueOnce(new Error('SSE disconnected'));
    client.getStreamStatus.mockResolvedValue({ active: false });
    client.getSession.mockResolvedValue({ session: { session_id: 'quick-1', messages: [{ role: 'assistant', content: 'Recovered answer' }] } } as never);
    const turn = chat.send('Question');
    await vi.advanceTimersByTimeAsync(3300);
    await turn;
    expect(client.getSession).toHaveBeenCalledWith({ sessionId: 'quick-1', messages: true, msgLimit: 80, profile: 'profile-a', workspacePath: 'C:/workspace-a' });
    expect(chat.getSnapshot().messages.at(-1)?.content).toBe('Recovered answer');
    expect(chat.getSnapshot().busy).toBe(false);
  });
});
