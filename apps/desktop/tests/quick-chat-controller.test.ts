import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickChatController, type QuickChatStartRequest } from '../src/main/quick-chat-controller.js';
import type { ChatStreamEvent, ChatStreamHandle } from '../src/main/chat-stream.js';
import { SidekickApiError } from '../src/main/quick-chat-errors.js';

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
      scope: { ...scope, spaceId: 'space-b' } })).rejects.toThrow('Quickchat cancel failed [quickchat_cancel_binding_rejected]');
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

  it.each([
    ['missing', undefined],
    ['null', null],
    ['negative', { ok: false, cancelled: false }],
    ['malformed', { ok: 1, cancelled: false }]
  ])('keeps Stop binding and stream locked when backend ACK is %s', async (_label, ack) => {
    const h = setup();
    await h.controller.start(h.event, request);
    h.backendStop.mockResolvedValueOnce(ack as any);
    const stopRequest = { quickChatId: request.quickChatId, streamId: 'b'.repeat(32), scope };

    await expect(h.controller.stop(h.event, stopRequest))
      .rejects.toThrow('Quickchat stop failed [quickchat_stop_failed]');
    h.emit({ event: 'delta', data: { delta: 'late while stop is unacknowledged' }, raw: '' });
    expect(h.owner.sent).toHaveLength(0);
    await expect(h.controller.start(h.event, request)).rejects.toThrow('already bound elsewhere');
    expect(h.backendStart).toHaveBeenCalledOnce();

    h.backendStop.mockResolvedValueOnce({ ok: true, cancelled: false });
    await expect(h.controller.stop(h.event, stopRequest)).resolves.toEqual({ ok: true, cancelled: false });
    await expect(h.controller.start(h.event, request)).resolves.toMatchObject({ quickChatId: request.quickChatId });
    expect(h.backendStart).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['negative', { ok: false, cancelled: false }],
    ['malformed', { ok: 1, cancelled: false }]
  ])('keeps Cancel binding locked when backend ACK is %s', async (_label, ack) => {
    const h = setup();
    await h.controller.start(h.event, request);
    h.backendCancel.mockResolvedValueOnce(ack as any);
    const cancelRequest = { quickChatId: request.quickChatId, streamId: 'b'.repeat(32), scope };

    await expect(h.controller.cancel(h.event, cancelRequest))
      .rejects.toThrow('Quickchat cancel failed [quickchat_cancel_failed]');
    h.emit({ event: 'delta', data: { delta: 'late while cancel is unacknowledged' }, raw: '' });
    expect(h.owner.sent).toHaveLength(0);
    await expect(h.controller.start(h.event, request)).rejects.toThrow('already bound elsewhere');
    expect(h.backendStart).toHaveBeenCalledOnce();

    h.backendCancel.mockResolvedValueOnce({ ok: true, cancelled: false });
    await expect(h.controller.cancel(h.event, cancelRequest)).resolves.toEqual({ ok: true, cancelled: false });
    expect(h.backendStart).toHaveBeenCalledOnce();
  });

  it.each(['stop', 'cancel'] as const)('retains reset lock after a %s handle-close error and allows a later retry', async operation => {
    const h = setup();
    await h.controller.start(h.event, request);
    h.close.mockImplementationOnce(() => { throw new Error('private close detail'); });
    const binding = { quickChatId: request.quickChatId, streamId: 'b'.repeat(32), scope };

    const first = operation === 'stop' ? h.controller.stop(h.event, binding) : h.controller.cancel(h.event, binding);
    await expect(first).rejects.toThrow(`Quickchat ${operation} failed [quickchat_${operation}_failed]`);
    await expect(h.controller.start(h.event, request)).rejects.toThrow('already bound elsewhere');
    expect(h.backendStart).toHaveBeenCalledOnce();
    expect(operation === 'stop' ? h.backendStop : h.backendCancel).not.toHaveBeenCalled();

    if (operation === 'stop') {
      await expect(h.controller.stop(h.event, binding)).resolves.toEqual({ ok: true, cancelled: true });
    } else {
      await expect(h.controller.cancel(h.event, binding)).resolves.toEqual({ ok: true, cancelled: true });
    }
  });

  it('serializes Stop and Cancel while backend acknowledgement is pending', async () => {
    const h = setup();
    await h.controller.start(h.event, request);
    let acknowledge!: (value: unknown) => void;
    h.backendStop.mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve; }) as any);
    const binding = { quickChatId: request.quickChatId, streamId: 'b'.repeat(32), scope };
    const stop = h.controller.stop(h.event, binding);

    await expect(h.controller.cancel(h.event, binding))
      .rejects.toThrow('Quickchat cancel failed [quickchat_cancel_failed]');
    await expect(h.controller.start(h.event, request)).rejects.toThrow('already bound elsewhere');
    expect(h.backendCancel).not.toHaveBeenCalled();
    expect(h.backendStart).toHaveBeenCalledOnce();

    acknowledge({ ok: true, cancelled: false });
    await expect(stop).resolves.toEqual({ ok: true, cancelled: false });
    await expect(h.controller.start(h.event, request)).resolves.toMatchObject({ quickChatId: request.quickChatId });
  });

  it('rejects stop with the allowlisted backend code and keeps successful result shape unchanged', async () => {
    const h = setup();
    await h.controller.start(h.event, request);
    h.backendStop.mockImplementationOnce(() => Promise.reject(new SidekickApiError(
      'private backend detail', 503, 'quickchat_worker_exit_unconfirmed')));
    const failure = await h.controller.stop(h.event, { quickChatId: request.quickChatId, streamId: 'b'.repeat(32), scope })
      .then(() => null, error => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('Quickchat stop failed [quickchat_worker_exit_unconfirmed]');
    expect((failure as Error).message).not.toContain('private backend detail');

    const next = setup();
    await next.controller.start(next.event, request);
    await expect(next.controller.stop(next.event, { quickChatId: request.quickChatId, streamId: 'b'.repeat(32), scope }))
      .resolves.toEqual({ ok: true, cancelled: true });
  });

  it('maps unknown backend and transport failures to fixed stop/cancel markers', async () => {
    const stop = setup();
    await stop.controller.start(stop.event, request);
    stop.backendStop.mockImplementationOnce(() => Promise.reject(new Error('private stack and profile path')));
    const stopFailure = await stop.controller.stop(stop.event,
      { quickChatId: request.quickChatId, streamId: 'b'.repeat(32), scope }).then(() => null, error => error);
    expect((stopFailure as Error).message).toBe('Quickchat stop failed [backend_stop_failed]');

    const cancel = setup();
    await cancel.controller.start(cancel.event, request);
    cancel.backendCancel.mockImplementationOnce(() => Promise.reject(new TypeError('private network detail')));
    const cancelFailure = await cancel.controller.cancel(cancel.event,
      { quickChatId: request.quickChatId, streamId: 'b'.repeat(32), scope }).then(() => null, error => error);
    expect((cancelFailure as Error).message).toBe('Quickchat cancel failed [backend_transport_failed]');
  });

  it('maps an allowlisted backend code for cancel without changing cancel success', async () => {
    const h = setup();
    await h.controller.start(h.event, request);
    h.backendCancel.mockImplementationOnce(() => Promise.reject(new SidekickApiError(
      'private backend detail', 409, 'quickchat_worker_cancel_rejected')));
    const failure = await h.controller.cancel(h.event,
      { quickChatId: request.quickChatId, streamId: 'b'.repeat(32), scope }).then(() => null, error => error);
    expect((failure as Error).message).toBe('Quickchat cancel failed [quickchat_worker_cancel_rejected]');
    expect((failure as Error).message).not.toContain('private backend detail');
  });

  it('uses a fixed validation category and never calls stop for a foreign binding', async () => {
    const h = setup();
    await h.controller.start(h.event, request);
    const failure = await h.controller.stop(h.event, { quickChatId: request.quickChatId, streamId: 'c'.repeat(32), scope })
      .then(() => null, error => error);
    expect((failure as Error).message).toBe('Quickchat stop failed [quickchat_stop_binding_rejected]');
    expect(h.backendStop).not.toHaveBeenCalled();
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

  it('retains Main binding when reset after stop cannot confirm backend cleanup', async () => {
    const h = setup();
    await h.controller.start(h.event, request);
    await h.controller.stop(h.event, { quickChatId: request.quickChatId, streamId: 'b'.repeat(32), scope });
    h.backendCancel.mockImplementationOnce(() => Promise.reject(new SidekickApiError(
      'private lease detail', 503, 'quickchat_writer_release_unconfirmed')));

    await expect(h.controller.cancel(h.event, { quickChatId: request.quickChatId, streamId: '', scope }))
      .rejects.toThrow('Quickchat cancel failed [quickchat_writer_release_unconfirmed]');
    expect(h.backendCancel).toHaveBeenCalledWith({ quickChatId: request.quickChatId, streamId: '', scope,
      profile: 'default', workspacePath: 'C:\\work' });

    // Main keeps the exact binding retryable; the Renderer must keep the same
    // ID until this cancel is acknowledged before it commits a fresh chat.
    h.backendCancel.mockResolvedValueOnce({ ok: true, cancelled: false });
    await expect(h.controller.cancel(h.event, { quickChatId: request.quickChatId, streamId: '', scope }))
      .resolves.toEqual({ ok: true, cancelled: false });
  });

  it('rejects oversized or malformed input before starting a backend stream', async () => {
    const h = setup();
    await expect(h.controller.start(h.event, { ...request, prompt: 'x'.repeat(12_001) })).rejects.toThrow('Invalid Quickchat request');
    await expect(h.controller.start(h.event, { ...request, context: { filesystemPath: 'C:\\' } })).rejects.toThrow('Invalid Quickchat page context');
    expect(h.backendStart).not.toHaveBeenCalled();
  });
});
