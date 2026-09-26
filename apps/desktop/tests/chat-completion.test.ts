import { describe, expect, it, vi } from 'vitest';
import { createOnceChatCompletionNotifier, isChatCompletionConfirmed } from '../src/renderer/chat-completion.js';

describe('native chat completion signals', () => {
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
