export type LiveChatMessage = {
  role?: string;
  content?: string;
  reasoning?: string;
  pending?: boolean;
  streaming?: boolean;
};

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
  next[index] = {
    ...current,
    pending: false,
    streaming: true,
    ...(event === 'token'
      ? { content: `${current.content === 'Working on it...' ? '' : current.content || ''}${text}` }
      : { reasoning: `${current.reasoning || ''}${text}` }),
  };
  return next;
}

export function finishLiveChatMessage<T extends LiveChatMessage>(messages: T[]): T[] {
  return messages.map((message) => message.streaming ? { ...message, streaming: false } : message);
}
