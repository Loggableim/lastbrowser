import type { DesktopTranslationKey } from './i18n/keys.js';
import {
  chatLatencyPersonalities,
  type ChatLatencyPersonality,
  type ChatLatencyPlaceholderKey,
} from './i18n/chat-latency-placeholder-copy.js';

export { chatLatencyPersonalities, chatLatencyPersonaNames } from './i18n/chat-latency-placeholder-copy.js';
export type { ChatLatencyPersonality, ChatLatencyPlaceholderKey } from './i18n/chat-latency-placeholder-copy.js';

export const CHAT_LATENCY_PLACEHOLDER_COUNT = 12;

export const chatLatencyPlaceholderKeys = [
  'chat.latencyPlaceholder.01',
  'chat.latencyPlaceholder.02',
  'chat.latencyPlaceholder.03',
  'chat.latencyPlaceholder.04',
  'chat.latencyPlaceholder.05',
  'chat.latencyPlaceholder.06',
  'chat.latencyPlaceholder.07',
  'chat.latencyPlaceholder.08',
  'chat.latencyPlaceholder.09',
  'chat.latencyPlaceholder.10',
  'chat.latencyPlaceholder.11',
  'chat.latencyPlaceholder.12',
] as const satisfies readonly DesktopTranslationKey[];

/** English fallback when no locale translator is available (e.g. session restore). */
export const chatLatencyPlaceholderEnglish = [
  'One moment while I get ready.',
  'Hang on — I\'m lining up the answer.',
  'Give me a second to think this through.',
  'Almost there — connecting to the model.',
  'I\'m on it. Just a brief pause.',
  'Let me pull the reply together.',
  'Working through your question now.',
  'Still here — preparing a response.',
  'One short wait while Sidekick wakes up.',
  'Typing soon — gathering context first.',
  'Just a moment before the answer starts.',
  'Hold tight — the stream is starting.',
] as const;

let roundRobinIndex = 0;

export function resetChatLatencyPlaceholderRotation(): void {
  roundRobinIndex = 0;
}

export function pickChatLatencyPlaceholderKey(): DesktopTranslationKey {
  const key = chatLatencyPlaceholderKeys[roundRobinIndex % CHAT_LATENCY_PLACEHOLDER_COUNT];
  roundRobinIndex = (roundRobinIndex + 1) % CHAT_LATENCY_PLACEHOLDER_COUNT;
  return key;
}

export type LatencyPlaceholderMessage = {
  role?: string;
  content?: string;
  reasoning?: string;
  pending?: boolean;
  streaming?: boolean;
  latencyPlaceholder?: boolean;
};

export function buildChatLatencyPlaceholderAssistant<T extends LatencyPlaceholderMessage>(
  sentence: string,
  extra?: T,
): T & { role: 'assistant'; content: string; pending: true; latencyPlaceholder: true } {
  return {
    role: 'assistant',
    content: sentence,
    pending: true,
    latencyPlaceholder: true,
    ...extra,
  } as T & { role: 'assistant'; content: string; pending: true; latencyPlaceholder: true };
}

export function isChatLatencyPlaceholderMessage(message: LatencyPlaceholderMessage): boolean {
  return Boolean(message.latencyPlaceholder);
}

/** Pending UI placeholders that must never persist as assistant answers. */
export function isClearablePendingStreamPlaceholder(message: LatencyPlaceholderMessage): boolean {
  if (!message.pending) return false;
  if (message.latencyPlaceholder) return true;
  if (message.content === 'Working on it...') return true;
  if (!message.content?.trim() && !message.reasoning?.trim()) return true;
  return false;
}

export function shouldDiscardPlaceholderContent(message: LatencyPlaceholderMessage): boolean {
  if (message.latencyPlaceholder) return true;
  return message.content === 'Working on it...';
}

export function restoredChatLatencyPlaceholderText(): string {
  return chatLatencyPlaceholderEnglish[0];
}

export function shouldFinalizeInFlightAssistant(message: LatencyPlaceholderMessage): boolean {
  return Boolean(message.pending || message.streaming || message.latencyPlaceholder || shouldDiscardPlaceholderContent(message));
}

export function fallbackFinishedAssistantContent(message: LatencyPlaceholderMessage, answer: string): string {
  if (answer.trim()) return answer;
  if (message.latencyPlaceholder || shouldDiscardPlaceholderContent(message)) return 'Sidekick finished.';
  return message.content?.trim() || 'Sidekick finished.';
}

export function countsAsVisibleStreamOutput(message: LatencyPlaceholderMessage): boolean {
  return Boolean(message.content?.trim() && !message.latencyPlaceholder && !shouldDiscardPlaceholderContent(message));
}

/** Wait before the first fake sentence starts streaming in. */
export const CHAT_LATENCY_FIRST_WAVE_MS = 2_000;
/** Wait before the apology / patience sentence starts streaming in. */
export const CHAT_LATENCY_SECOND_WAVE_MS = 6_000;
/** Gap between small reveal chunks. Short enough to read as typing, not a dump. */
export const CHAT_LATENCY_REVEAL_INTERVAL_MS = 36;
export const CHAT_LATENCY_REVEAL_CHARS = 2;

const personaCursor: Record<ChatLatencyPersonality, number> = {
  nova: 0,
  analytical: 0,
  developer: 0,
  creative: 0,
  mentor: 0,
};

export function resetChatLatencyPersonaRotation(): void {
  for (const personality of chatLatencyPersonalities) personaCursor[personality] = 0;
}

export function takeChatLatencyPersonaIndex(personality: ChatLatencyPersonality): number {
  const index = personaCursor[personality] % CHAT_LATENCY_PLACEHOLDER_COUNT;
  personaCursor[personality] = (index + 1) % CHAT_LATENCY_PLACEHOLDER_COUNT;
  return index;
}

export function chatLatencyPersonaPlaceholderKey(
  personality: ChatLatencyPersonality,
  wave: 'first' | 'late',
  index: number,
): ChatLatencyPlaceholderKey {
  const slot = String((index % CHAT_LATENCY_PLACEHOLDER_COUNT) + 1).padStart(2, '0');
  return (wave === 'late'
    ? `chat.latencyPlaceholder.${personality}.late.${slot}`
    : `chat.latencyPlaceholder.${personality}.${slot}`) as ChatLatencyPlaceholderKey;
}

export function resolveChatLatencyPersonality(...candidates: unknown[]): ChatLatencyPersonality {
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const personality = (candidate as { personality?: unknown }).personality;
    if (typeof personality === 'string' && (chatLatencyPersonalities as readonly string[]).includes(personality)) {
      return personality as ChatLatencyPersonality;
    }
  }
  return 'nova';
}

/** Reveal a sentence in small chunks. At elapsed 0 the first chunk is already visible. */
export function revealChatLatencyChunk(sentence: string, elapsedInWaveMs: number): string {
  if (!sentence || elapsedInWaveMs < 0) return '';
  const steps = Math.floor(elapsedInWaveMs / CHAT_LATENCY_REVEAL_INTERVAL_MS) + 1;
  return sentence.slice(0, Math.min(sentence.length, steps * CHAT_LATENCY_REVEAL_CHARS));
}

/** First sentence streams from 2s. Second sentence streams from 6s and does not replace the first. */
export function composeChatLatencyPlaceholder(input: {
  elapsedMs: number;
  firstSentence: string;
  secondSentence: string;
}): string {
  if (input.elapsedMs < CHAT_LATENCY_FIRST_WAVE_MS) return '';
  const firstPartial = revealChatLatencyChunk(input.firstSentence, input.elapsedMs - CHAT_LATENCY_FIRST_WAVE_MS);
  if (input.elapsedMs < CHAT_LATENCY_SECOND_WAVE_MS) return firstPartial;
  const secondPartial = revealChatLatencyChunk(input.secondSentence, input.elapsedMs - CHAT_LATENCY_SECOND_WAVE_MS);
  if (!secondPartial) return input.firstSentence;
  return `${input.firstSentence}\n\n${secondPartial}`;
}

export type ChatLatencyPlaceholderRun = {
  cancel(): void;
  noteRealToken(): void;
};

export function startChatLatencyPlaceholder(options: {
  personality: ChatLatencyPersonality;
  translate: (key: DesktopTranslationKey) => string;
  onText: (text: string) => void;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clear?: (handle: ReturnType<typeof setTimeout>) => void;
}): ChatLatencyPlaceholderRun {
  const now = options.now ?? (() => Date.now());
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clear = options.clear ?? ((handle) => clearTimeout(handle));
  const index = takeChatLatencyPersonaIndex(options.personality);
  const firstSentence = options.translate(chatLatencyPersonaPlaceholderKey(options.personality, 'first', index));
  const secondSentence = options.translate(chatLatencyPersonaPlaceholderKey(options.personality, 'late', index));
  const started = now();
  let handle: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let last = '';

  const publish = (): void => {
    if (stopped) return;
    const text = composeChatLatencyPlaceholder({
      elapsedMs: now() - started,
      firstSentence,
      secondSentence,
    });
    if (!text || text === last) return;
    last = text;
    options.onText(text);
  };

  const tick = (): void => {
    if (stopped) return;
    publish();
    const elapsed = now() - started;
    const second = revealChatLatencyChunk(secondSentence, elapsed - CHAT_LATENCY_SECOND_WAVE_MS);
    if (elapsed >= CHAT_LATENCY_SECOND_WAVE_MS && second.length >= secondSentence.length) return;
    handle = schedule(tick, CHAT_LATENCY_REVEAL_INTERVAL_MS);
  };

  handle = schedule(tick, CHAT_LATENCY_FIRST_WAVE_MS);
  const stop = (): void => {
    stopped = true;
    if (handle !== null) clear(handle);
    handle = null;
  };
  return { cancel: stop, noteRealToken: stop };
}

/** Stream fake text into the live placeholder only. A real token clears the flag, so later reveals no-op. */
export function applyChatLatencyPlaceholderReveal<T extends LatencyPlaceholderMessage>(messages: T[], text: string): T[] {
  if (!text) return messages;
  let index = -1;
  for (let cursor = messages.length - 1; cursor >= 0; cursor -= 1) {
    const message = messages[cursor];
    if (message?.role === 'assistant' && message.latencyPlaceholder && (message.pending || message.streaming)) {
      index = cursor;
      break;
    }
  }
  if (index < 0 || messages[index]?.content === text) return messages;
  const next = messages.slice();
  next[index] = { ...messages[index], content: text };
  return next;
}
