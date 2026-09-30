export type LiveChatMessage = {
  role?: string;
  content?: string;
  reasoning?: string;
  pending?: boolean;
  streaming?: boolean;
};

/** Normalize native provider and orchestration delta payloads for live rendering. */
export function readLiveChatDelta(
  event: string,
  data: unknown,
): { kind: 'token' | 'reasoning'; text: string } | null {
  if (event !== 'token' && event !== 'delta' && event !== 'reasoning') return null;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  const payload = data as Record<string, unknown>;
  const text = typeof payload.text === 'string'
    ? payload.text
    : event === 'delta' && typeof payload.content === 'string'
      ? payload.content
      : '';
  if (!text) return null;
  return { kind: event === 'reasoning' ? 'reasoning' : 'token', text };
}

/** Apply a provider delta to the visible in-flight assistant message. */
export function applyLiveChatDelta<T extends LiveChatMessage>(
  messages: T[],
  event: 'token' | 'reasoning',
  text: string,
): T[] {
  if (!text) return messages;
  let index = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'assistant' && (messages[i].pending || messages[i].streaming)) {
      index = i;
      break;
    }
  }
  if (index < 0) return messages;

  const current = messages[index];
  const next = [...messages];
  const pendingContent = current.pending || current.content === 'Working on it...' ? '' : current.content || '';
  const pendingReasoning = current.reasoning || '';
  const waitingForAnswer = event === 'reasoning' && pendingContent.trim().length === 0;
  next[index] = {
    ...current,
    // Reasoning may arrive well before the first answer token. Keep the
    // activity indicator alive during that gap, especially when the user has
    // hidden reasoning details in settings.
    pending: waitingForAnswer ? current.pending : false,
    streaming: true,
    ...(event === 'token'
      ? { content: `${pendingContent}${text}` }
      : { content: pendingContent, reasoning: `${pendingReasoning}${text}` }),
  };
  return next;
}

export function finishLiveChatMessage<T extends LiveChatMessage>(messages: T[]): T[] {
  return messages.map((message) => message.streaming ? { ...message, pending: false, streaming: false } : message);
}
