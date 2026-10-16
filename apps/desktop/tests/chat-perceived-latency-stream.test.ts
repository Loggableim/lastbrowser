import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyLiveChatDelta,
  finishLiveChatMessage,
  finishLiveChatMessageWithError,
  finishStoppedLiveChatMessage,
} from '../src/renderer/chat-live-stream.js';
import {
  applyChatLatencyPlaceholderReveal,
  buildChatLatencyPlaceholderAssistant,
  CHAT_LATENCY_FIRST_WAVE_MS,
  CHAT_LATENCY_REVEAL_CHARS,
  CHAT_LATENCY_REVEAL_INTERVAL_MS,
  CHAT_LATENCY_SECOND_WAVE_MS,
  chatLatencyPersonaNames,
  chatLatencyPersonaPlaceholderKey,
  chatLatencyPersonalities,
  chatLatencyPlaceholderEnglish,
  composeChatLatencyPlaceholder,
  pickChatLatencyPlaceholderKey,
  resetChatLatencyPersonaRotation,
  resetChatLatencyPlaceholderRotation,
  resolveChatLatencyPersonality,
  startChatLatencyPlaceholder,
} from '../src/renderer/chat-perceived-latency-stream.js';
import { createDesktopI18n, desktopLocaleIds } from '../src/renderer/i18n.js';

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

  it('gives every persona twelve thinking lines and twelve patience lines in every locale', () => {
    expect(chatLatencyPersonalities).toEqual(['nova', 'analytical', 'developer', 'creative', 'mentor']);
    expect(chatLatencyPersonaNames).toEqual({
      nova: 'Nova',
      analytical: 'Orion',
      developer: 'Patch',
      creative: 'Spark',
      mentor: 'Zen',
    });
    for (const locale of desktopLocaleIds) {
      const i18n = createDesktopI18n(locale);
      for (const personality of chatLatencyPersonalities) {
        const first = Array.from({ length: 12 }, (_, index) => i18n.t(chatLatencyPersonaPlaceholderKey(personality, 'first', index)));
        const late = Array.from({ length: 12 }, (_, index) => i18n.t(chatLatencyPersonaPlaceholderKey(personality, 'late', index)));
        expect(new Set(first).size, `${locale} ${personality} first`).toBe(12);
        expect(new Set(late).size, `${locale} ${personality} late`).toBe(12);
        expect(first.every((line) => line.trim().length > 8)).toBe(true);
        expect(late.every((line) => line.trim().length > 8)).toBe(true);
        expect(first.some((line) => late.includes(line)), `${locale} ${personality} waves stay distinct`).toBe(false);
      }
    }
    const german = createDesktopI18n('de');
    const opening = chatLatencyPersonalities.map((personality) => german.t(chatLatencyPersonaPlaceholderKey(personality, 'first', 0)));
    expect(new Set(opening).size).toBe(chatLatencyPersonalities.length);
    for (const personality of chatLatencyPersonalities) {
      for (let index = 0; index < 12; index += 1) {
        expect(german.t(chatLatencyPersonaPlaceholderKey(personality, 'late', index)))
          .toMatch(/Sorry|Entschuldig|Tut mir leid|Geduld/);
      }
    }
  });

  it('streams the first sentence after 2s and the patience sentence at 6s, then drops both on the real token', () => {
    vi.useFakeTimers();
    resetChatLatencyPersonaRotation();
    const i18n = createDesktopI18n('de');
    const personality = resolveChatLatencyPersonality({ personality: 'developer' }, { personality: 'nova' });
    expect(personality).toBe('developer');
    const first = i18n.t(chatLatencyPersonaPlaceholderKey('developer', 'first', 0));
    const second = i18n.t(chatLatencyPersonaPlaceholderKey('developer', 'late', 0));
    const seen: string[] = [];
    let messages = [
      { role: 'user' as const, content: 'Hallo' },
      buildChatLatencyPlaceholderAssistant(''),
    ];
    const run = startChatLatencyPlaceholder({
      personality,
      translate: (key) => i18n.t(key),
      onText: (text) => {
        seen.push(text);
        messages = applyChatLatencyPlaceholderReveal(messages, text);
      },
    });

    vi.advanceTimersByTime(CHAT_LATENCY_FIRST_WAVE_MS - 1);
    expect(seen).toEqual([]);
    expect(composeChatLatencyPlaceholder({ elapsedMs: CHAT_LATENCY_FIRST_WAVE_MS - 1, firstSentence: first, secondSentence: second })).toBe('');

    vi.advanceTimersByTime(1);
    expect(seen[0].length).toBe(CHAT_LATENCY_REVEAL_CHARS);
    expect(first.startsWith(seen[0])).toBe(true);
    expect(seen[0]).not.toBe(first);

    vi.advanceTimersByTime(CHAT_LATENCY_REVEAL_INTERVAL_MS * 3);
    expect(seen.at(-1)!.length).toBeGreaterThan(seen[0].length);
    expect(first.startsWith(seen.at(-1)!)).toBe(true);
    expect(seen.at(-1)).not.toContain(second.slice(0, 12));

    // Ticks land on the 36ms grid, so the second sentence begins on the first tick at or after 6s.
    const beforeSecondWave = CHAT_LATENCY_FIRST_WAVE_MS + CHAT_LATENCY_REVEAL_INTERVAL_MS * 111;
    vi.advanceTimersByTime(beforeSecondWave - (CHAT_LATENCY_FIRST_WAVE_MS + CHAT_LATENCY_REVEAL_INTERVAL_MS * 3));
    expect(seen.at(-1)).toBe(first);
    vi.advanceTimersByTime(CHAT_LATENCY_REVEAL_INTERVAL_MS);
    const atSixSeconds = seen.at(-1)!;
    expect(atSixSeconds.startsWith(`${first}\n\n`)).toBe(true);
    const patience = atSixSeconds.slice(first.length + 2);
    expect(patience.length).toBe(CHAT_LATENCY_REVEAL_CHARS);
    expect(second.startsWith(patience)).toBe(true);
    expect(patience).not.toBe(second);
    expect(messages[1]).toMatchObject({ content: atSixSeconds, pending: true, latencyPlaceholder: true });

    messages = applyLiveChatDelta(messages, 'token', 'Echte Antwort');
    run.noteRealToken();
    const afterToken = seen.length;
    vi.advanceTimersByTime(4_000);
    expect(seen.length).toBe(afterToken);
    expect(messages[1]).toMatchObject({ content: 'Echte Antwort', latencyPlaceholder: undefined, pending: false });
    expect(applyChatLatencyPlaceholderReveal(messages, atSixSeconds)).toBe(messages);
    expect(finishLiveChatMessage(messages)[1]).toMatchObject({ content: 'Echte Antwort', streaming: false, latencyPlaceholder: undefined });
    expect(finishLiveChatMessage([
      { role: 'user', content: 'Hi' },
      buildChatLatencyPlaceholderAssistant(second),
    ])).toEqual([{ role: 'user', content: 'Hi' }]);
  });
});

afterEach(() => {
  vi.useRealTimers();
});
