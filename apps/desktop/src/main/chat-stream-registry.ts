import type { ChatStreamEvent, ChatStreamHandle } from './chat-stream.js';

export type ChatStreamSender = Pick<
  Electron.WebContents,
  'id' | 'isDestroyed' | 'send' | 'once' | 'removeListener'
>;

type StreamFactory = (onEvent: (event: ChatStreamEvent) => void) => ChatStreamHandle;
type StreamRegistration = { handle: ChatStreamHandle | null };

/** Own each SSE reader by its renderer sender and stream, not globally by stream. */
export class ChatStreamRegistry {
  private readonly streams = new Map<number, Map<string, StreamRegistration>>();
  private readonly destroyedListeners = new Map<number, () => void>();

  subscribe(sender: ChatStreamSender, streamId: string, createStream: StreamFactory): { ok: true; streamId: string } {
    this.unsubscribe(sender, streamId);
    if (sender.isDestroyed()) throw new Error('Renderer is no longer available.');

    let senderStreams = this.streams.get(sender.id);
    if (!senderStreams) {
      senderStreams = new Map();
      this.streams.set(sender.id, senderStreams);
      const onDestroyed = () => this.closeSender(sender.id);
      this.destroyedListeners.set(sender.id, onDestroyed);
      sender.once('destroyed', onDestroyed);
    }
    const registration: StreamRegistration = { handle: null };
    senderStreams.set(streamId, registration);
    let handle: ChatStreamHandle;
    try {
      handle = createStream((streamEvent) => {
        // Suppress any queued callbacks from a handle that this sender has
        // already replaced or unsubscribed.
        if (this.streams.get(sender.id)?.get(streamId) !== registration || sender.isDestroyed()) return;
        try {
          sender.send('lastbrowser:sidekick:chatStreamEvent', { streamId, ...streamEvent });
        } catch {
          // A renderer can be destroyed between isDestroyed() and send().
          this.remove(sender, streamId, true);
        }
      });
    } catch (error) {
      this.remove(sender, streamId, false);
      throw error;
    }
    registration.handle = handle;
    if (this.streams.get(sender.id)?.get(streamId) !== registration) {
      handle.close();
      return { ok: true, streamId };
    }
    const removeIfCurrent = () => {
      if (this.streams.get(sender.id)?.get(streamId) === registration) {
        this.remove(sender, streamId, false);
      }
    };
    void handle.done.then(removeIfCurrent, removeIfCurrent);
    return { ok: true, streamId };
  }

  unsubscribe(sender: ChatStreamSender, streamId: string): { ok: true; streamId: string } {
    this.remove(sender, streamId, true);
    return { ok: true, streamId };
  }

  private remove(sender: ChatStreamSender, streamId: string, close: boolean): void {
    const senderStreams = this.streams.get(sender.id);
    const registration = senderStreams?.get(streamId);
    if (!registration) return;
    senderStreams?.delete(streamId);
    if (close) registration.handle?.close();
    if (senderStreams?.size) return;

    this.streams.delete(sender.id);
    const onDestroyed = this.destroyedListeners.get(sender.id);
    if (onDestroyed) {
      sender.removeListener('destroyed', onDestroyed);
      this.destroyedListeners.delete(sender.id);
    }
  }

  private closeSender(senderId: number): void {
    const senderStreams = this.streams.get(senderId);
    this.streams.delete(senderId);
    this.destroyedListeners.delete(senderId);
    for (const registration of senderStreams?.values() ?? []) registration.handle?.close();
  }
}
