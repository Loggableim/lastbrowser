import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickChatController, type QuickChatStartRequest } from '../src/main/quick-chat-controller.js';
import type { ChatStreamEvent, ChatStreamHandle } from '../src/main/chat-stream.js';

vi.mock('../src/main/ipc-sender.js', () => ({
  captureTrustedShellSender: vi.fn((event: any) => () => {
    if (!event.sender || event.sender.isDestroyed()) throw new Error('Untrusted IPC sender');
    return event.sender;
  })
}));

const scope = { spaceId: 'space-a', backendProfileId: 'backend-a', browserProfileId: 'browser-a' } as const;
const request: QuickChatStartRequest = { quickChatId: 'a'.repeat(32), browserProfileId: 'browser-a', workspacePath: 'C:\\work',
  backendProfileName: 'default', prompt: 'Summarize this page', context: { pageTitle: 'A page', pageText: 'bounded text' } };
function sender() {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  return { id: 7, sent: [] as Array<[string, unknown]>, isDestroyed: () => false,
    send(channel: string, payload: unknown) { this.sent.push([channel, payload]); },
    once(event: string, listener: (...args: unknown[]) => void) { listeners.set(event, listener); },
    removeListener(event: string) { listeners.delete(event); }, listeners };
}
function setup() {
  const owner = sender();
  let emit: ((event: ChatStreamEvent) => void) | null = null;
  let finish!: () => void;
  const done = new Promise<void>(resolve => { finish = resolve; });
  const close = vi.fn();
  const backendStart = vi.fn(async (value: any) => ({ quickChatId: value.quickChatId, sessionId: value.quickChatId,
    streamId: 'b'.repeat(32), scope }));
  const backendCancel = vi.fn(async () => ({ ok: true, cancelled: true }));
  const backendStop = vi.fn(async () => ({ ok: true, cancelled: true, reset: false }));
  const controller = new QuickChatController({
    isShell: () => true,
    resolveBinding: async () => ({ scope, backendProfileName: 'default' }),
    start: backendStart,
    stop: backendStop,
    cancel: backendCancel,
    subscribe: vi.fn((_streamId, _binding, callback) => { emit = callback; return { close, done } as ChatStreamHandle; })
  });
  return { controller, owner, backendStart, backendCancel, backendStop, close, emit: (event: ChatStreamEvent) => emit?.(event), finish,
    event: { sender: owner, senderFrame: {} } as any };
}

describe('QuickChatController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('binds a started stream and stamps only Main-validated identity/scope on events', async () => {
    const h = setup();
    const result = await h.controller.start(h.event, request);
    expect(result).toEqual({ quickChatId: request.quickChatId, streamId: 'b'.repeat(32), scope });
    expect(h.backendStart).toHaveBeenCalledWith(expect.objectContaining({ scope, profile: 'default' }));
    h.emit({ event: 'delta', data: { delta: 'hello', session_id: 'private-session', stream_id: 'fake' }, raw: '' });
    expect(h.owner.sent).toEqual([['lastbrowser:quickchat:event', { quickChatId: request.quickChatId,
      streamId: 'b'.repeat(32), scope, event: 'delta', data: { delta: 'hello' } }]]);
  });

  it('resets only the exact chat stream/scope and closes its SSE reader', async () => {
    const h = setup();
    await h.controller.start(h.event, request);
    await expect(h.controller.cancel(h.event, { quickChatId: request.quickChatId, streamId: 'b'.repeat(32), scope }))
      .resolves.toEqual({ ok: true, cancelled: true });
    expect(h.backendCancel).toHaveBeenCalledWith({ quickChatId: request.quickChatId, streamId: 'b'.repeat(32), scope,
      profile: 'default', workspacePath: 'C:\\work' });
    expect(h.close).toHaveBeenCalledOnce();
    h.emit({ event: 'delta', data: { delta: 'late' }, raw: '' });
    expect(h.owner.sent).toHaveLength(0);
  });

  it('rejects mismatched reset scope before canceling backend work', async () => {
    const h = setup();
    await h.controller.start(h.event, request);
    await expect(h.controller.cancel(h.event, { quickChatId: request.quickChatId, streamId: 'b'.repeat(32),
      scope: { ...scope, spaceId: 'space-b' } })).rejects.toThrow('does not match');
    expect(h.backendCancel).not.toHaveBeenCalled();
  });

  it('stops only the current response and keeps the quickchat reusable', async () => {
    const h = setup();
    await h.controller.start(h.event, request);
    await expect(h.controller.stop(h.event, { quickChatId: request.quickChatId, streamId: 'b'.repeat(32), scope }))
      .resolves.toEqual({ ok: true, cancelled: true });
    expect(h.backendStop).toHaveBeenCalledWith({ quickChatId: request.quickChatId, streamId: 'b'.repeat(32), scope,
      profile: 'default', workspacePath: 'C:\\work' });
    expect(h.backendCancel).not.toHaveBeenCalled();
    await h.controller.start(h.event, request);
    expect(h.backendStart).toHaveBeenCalledTimes(2);
  });

  it('resets the retained transcript after a stop without canceling a second stream', async () => {
    const h = setup();
    await h.controller.start(h.event, request);
    await h.controller.stop(h.event, { quickChatId: request.quickChatId, streamId: 'b'.repeat(32), scope });
    await expect(h.controller.cancel(h.event, { quickChatId: request.quickChatId, streamId: '', scope }))
      .resolves.toEqual({ ok: true, cancelled: true });
    expect(h.backendCancel).toHaveBeenCalledWith({ quickChatId: request.quickChatId, streamId: '', scope,
      profile: 'default', workspacePath: 'C:\\work' });
  });

  it('rejects oversized or malformed input before starting a backend stream', async () => {
    const h = setup();
    await expect(h.controller.start(h.event, { ...request, prompt: 'x'.repeat(12_001) })).rejects.toThrow('Invalid Quickchat request');
    await expect(h.controller.start(h.event, { ...request, context: { filesystemPath: 'C:\\' } })).rejects.toThrow('Invalid Quickchat page context');
    expect(h.backendStart).not.toHaveBeenCalled();
  });
});
