import { describe, expect, it, vi } from 'vitest';
import type { ChatStreamEvent } from '../src/main/chat-stream.js';
import { ChatStreamRegistry, type ChatStreamSender } from '../src/main/chat-stream-registry.js';

function createSender(id: number) {
  const listeners = new Map<string, () => void>();
  const sent: Array<{ channel: string; payload: unknown }> = [];
  let destroyed = false;
  const sender = {
    id,
    isDestroyed: () => destroyed,
    send: vi.fn((channel: string, payload: unknown) => { sent.push({ channel, payload }); }),
    once: vi.fn((event: string, listener: () => void) => { listeners.set(event, listener); }),
    removeListener: vi.fn((event: string, listener: () => void) => {
      if (listeners.get(event) === listener) listeners.delete(event);
    }),
    destroy: () => {
      destroyed = true;
      listeners.get('destroyed')?.();
      listeners.delete('destroyed');
    },
    sent,
    listeners,
  };
  return sender as typeof sender & ChatStreamSender;
}

function createHandle() {
  let finish!: () => void;
  const done = new Promise<void>((resolve) => { finish = resolve; });
  return {
    handle: { close: vi.fn(), done },
    finish,
  };
}

describe('ChatStreamRegistry', () => {
  it('keeps same-stream subscribers isolated by renderer and scoped unsubscribe', () => {
    const registry = new ChatStreamRegistry();
    const firstSender = createSender(1);
    const secondSender = createSender(2);
    const firstHandle = createHandle();
    const secondHandle = createHandle();
    let emitFirst!: (event: ChatStreamEvent) => void;
    let emitSecond!: (event: ChatStreamEvent) => void;

    registry.subscribe(firstSender, 'shared-stream', (emit) => {
      emitFirst = emit;
      return firstHandle.handle;
    });
    registry.subscribe(secondSender, 'shared-stream', (emit) => {
      emitSecond = emit;
      return secondHandle.handle;
    });

    emitFirst({ event: 'heartbeat', data: {}, raw: '{}' });
    emitSecond({ event: 'stream_end', data: {}, raw: '{}' });
    expect(firstSender.sent).toHaveLength(1);
    expect(secondSender.sent).toHaveLength(1);

    registry.unsubscribe(firstSender, 'shared-stream');
    expect(firstHandle.handle.close).toHaveBeenCalledOnce();
    expect(secondHandle.handle.close).not.toHaveBeenCalled();
    emitSecond({ event: 'delta', data: { text: 'still owned' }, raw: '' });
    expect(secondSender.sent).toHaveLength(2);

    secondSender.destroy();
    expect(secondHandle.handle.close).toHaveBeenCalledOnce();
    firstHandle.finish();
    secondHandle.finish();
  });

  it('replaces only the same sender stream and ignores stale completion cleanup', async () => {
    const registry = new ChatStreamRegistry();
    const sender = createSender(3);
    const oldHandle = createHandle();
    const currentHandle = createHandle();
    let emitOld!: (event: ChatStreamEvent) => void;

    registry.subscribe(sender, 'replace-me', (emit) => {
      emitOld = emit;
      return oldHandle.handle;
    });
    registry.subscribe(sender, 'replace-me', () => currentHandle.handle);
    expect(oldHandle.handle.close).toHaveBeenCalledOnce();
    emitOld({ event: 'delta', data: { text: 'stale' }, raw: '' });
    expect(sender.sent).toHaveLength(0);

    oldHandle.finish();
    await Promise.resolve();
    registry.unsubscribe(sender, 'replace-me');
    expect(currentHandle.handle.close).toHaveBeenCalledOnce();
    expect(sender.listeners.has('destroyed')).toBe(false);
    currentHandle.finish();
  });
});
