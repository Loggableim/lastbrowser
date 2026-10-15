import type { DesktopTranslationKey } from './i18n/keys.js';

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
