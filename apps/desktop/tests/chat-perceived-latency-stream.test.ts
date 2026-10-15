import { describe, expect, it } from 'vitest';
import {
  applyLiveChatDelta,
  finishLiveChatMessageWithError,
  finishStoppedLiveChatMessage,
} from '../src/renderer/chat-live-stream.js';
import {
  buildChatLatencyPlaceholderAssistant,
  chatLatencyPlaceholderEnglish,
  pickChatLatencyPlaceholderKey,
  resetChatLatencyPlaceholderRotation,
} from '../src/renderer/chat-perceived-latency-stream.js';
import { createDesktopI18n } from '../src/renderer/i18n.js';

describe('perceived latency stream placeholders', () => {
  it('rotates through the twelve placeholder keys deterministically', () => {
    resetChatLatencyPlaceholderRotation();
    expect(pickChatLatencyPlaceholderKey()).toBe('chat.latencyPlaceholder.01');
    expect(pickChatLatencyPlaceholderKey()).toBe('chat.latencyPlaceholder.02');
    resetChatLatencyPlaceholderRotation();
    expect(pickChatLatencyPlaceholderKey()).toBe('chat.latencyPlaceholder.01');
  });

  it('shows placeholder text after send, replaces it on first token, and clears on error/stop', () => {
    const i18n = createDesktopI18n('en');
    const sentence = i18n.t(pickChatLatencyPlaceholderKey());
    const initial = [
      { role: 'user' as const, content: 'Hello' },
      buildChatLatencyPlaceholderAssistant(sentence),
    ];

    expect(initial[1]).toMatchObject({ content: sentence, pending: true, latencyPlaceholder: true });

    const withToken = applyLiveChatDelta(initial, 'token', 'Real answer');
    expect(withToken[1]).toMatchObject({
      content: 'Real answer',
      pending: false,
      streaming: true,
      latencyPlaceholder: undefined,
    });

    const afterError = finishLiveChatMessageWithError(initial, 'Provider failed');
    expect(afterError[1].content).toContain('Provider failed');
    expect(afterError[1].content).not.toBe(sentence);

    const afterStop = finishStoppedLiveChatMessage(initial);
    expect(afterStop).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('does not treat the placeholder sentence as a stored assistant answer after stop', () => {
    const placeholder = buildChatLatencyPlaceholderAssistant(chatLatencyPlaceholderEnglish[0], { streaming: true });
    expect(finishStoppedLiveChatMessage([{ role: 'user', content: 'Hi' }, placeholder]))
      .toEqual([{ role: 'user', content: 'Hi' }]);
  });
});
