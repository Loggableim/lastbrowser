export type LiveChatMessage = {
  role?: string;
  content?: string;
  reasoning?: string;
  pending?: boolean;
  streaming?: boolean;
  progress?: string;
  chatStreamId?: string;
  chatStreamSessionId?: string;
  teamwork?: unknown;
  isPartial?: boolean;
};

export type RestoredChatStream = {
  sessionId: string;
  streamId: string;
  pendingUserMessage: string;
};

export type RestoredChatTurnState = {
  activeStreamId: string | null;
  pendingUserMessage: string;
  orphanedPendingTurn: boolean;
  preserveLocalTurn: boolean;
  runState: 'idle' | 'streaming' | 'error';
};

export function isLocalChatTurnForSession(
  sessionId: string,
  localTurnSessionId: string | null,
  localTurnInFlight: boolean,
): boolean {
  return localTurnInFlight && Boolean(sessionId) && localTurnSessionId === sessionId;
}

/** Preserve transcript state only while its own session's active stream still matches the snapshot. */
export function isMatchingLocalChatStreamSnapshot(
  sessionId: string,
  localTurnSessionId: string | null,
  localTurnInFlight: boolean,
  snapshotStreamId: string | null,
  localStreamId: string | null,
): boolean {
  return isLocalChatTurnForSession(sessionId, localTurnSessionId, localTurnInFlight)
    && Boolean(snapshotStreamId)
    && snapshotStreamId === localStreamId;
}

/** Resolve reload UI state without orphaning a newer turn started after the session snapshot was fetched. */
export function readRestoredChatTurnState(session: unknown, localTurnInFlight = false): RestoredChatTurnState {
  if (!session || typeof session !== 'object' || Array.isArray(session)) {
    return { activeStreamId: null, pendingUserMessage: '', orphanedPendingTurn: false, preserveLocalTurn: localTurnInFlight, runState: 'idle' };
  }
  const record = session as Record<string, unknown>;
  const activeStreamId = typeof record.active_stream_id === 'string' && record.active_stream_id.trim()
    ? record.active_stream_id.trim()
    : null;
  const pendingUserMessage = typeof record.pending_user_message === 'string'
    ? record.pending_user_message
    : '';
  const hasOrphanedPendingTurn = !activeStreamId && Boolean(pendingUserMessage.trim());
  const preserveLocalTurn = localTurnInFlight && hasOrphanedPendingTurn;
  const orphanedPendingTurn = hasOrphanedPendingTurn && !preserveLocalTurn;
  return {
    activeStreamId,
    pendingUserMessage,
    orphanedPendingTurn,
    preserveLocalTurn,
    runState: activeStreamId ? 'streaming' : orphanedPendingTurn ? 'error' : 'idle',
  };
}

/** Read the active stream identity needed to reattach after a renderer restart. */
export function readRestoredChatStream(session: unknown): RestoredChatStream | null {
  if (!session || typeof session !== 'object' || Array.isArray(session)) return null;
  const record = session as Record<string, unknown>;
  const sessionId = typeof record.session_id === 'string' ? record.session_id.trim() : '';
  const streamId = typeof record.active_stream_id === 'string' ? record.active_stream_id.trim() : '';
  if (!sessionId || !streamId) return null;
  return {
    sessionId,
    streamId,
    pendingUserMessage: typeof record.pending_user_message === 'string'
      ? record.pending_user_message
      : '',
  };
}

/** Claim an active stream once per renderer lifetime, including React StrictMode effects. */
export function claimRestoredChatStream(
  sessionId: string,
  streamId: string,
  claimed: Set<string>,
): boolean {
  const session = String(sessionId || '').trim();
  const stream = String(streamId || '').trim();
  if (!session || !stream) return false;
  const key = JSON.stringify([session, stream]);
  if (claimed.has(key)) return false;
  claimed.add(key);
  // Stream IDs are unique and completed claims only suppress duplicate effects.
  // Bound growth during very long renderer lifetimes.
  if (claimed.size > 64) claimed.delete(claimed.values().next().value as string);
  return true;
}

/** Rebuild the active user turn and assistant placeholder after renderer reload. */
export function restorePendingChatTurn<T extends LiveChatMessage>(
  messages: T[],
  pendingUserMessage: string,
): T[] {
  const prompt = String(pendingUserMessage || '');
  if (!prompt.trim()) return messages;
  const normalizedPrompt = prompt.replace(/\s+/g, ' ').trim();
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate.role !== 'assistant' || !(candidate.pending || candidate.streaming)) continue;
    const precedingUser = messages.slice(0, index).reverse().find((message) => message.role === 'user');
    const normalizedPendingUser = String(precedingUser?.content || '').replace(/\s+/g, ' ').trim();
    if (normalizedPendingUser === normalizedPrompt) return messages;
    break;
  }
  const lastMessage = messages[messages.length - 1];
  const normalizedLast = lastMessage?.role === 'user'
    ? String(lastMessage.content || '').replace(/\s+/g, ' ').trim()
    : '';
  const withUser = normalizedLast === normalizedPrompt
    ? messages
    : [...messages, { role: 'user', content: prompt } as T];
  const lastAfterUser = withUser[withUser.length - 1];
  if (lastAfterUser?.role === 'assistant' && (lastAfterUser.pending || lastAfterUser.streaming)) {
    return withUser;
  }
  return [...withUser, { role: 'assistant', content: 'Working on it...', pending: true } as T];
}

/** Preserve an unfinished user turn but release its pending UI state when the backend has no stream to resume. */
export function finishOrphanedChatTurn<T extends LiveChatMessage>(
  messages: T[],
  pendingUserMessage: string,
  error: string,
): T[] {
  return finishLiveChatMessageWithError(
    restorePendingChatTurn(messages, pendingUserMessage),
    error,
  );
}

/**
 * A session snapshot can race with a newly started local turn. Keep the live
 * turn when that snapshot has not persisted its pending/streaming assistant
 * yet, while still accepting snapshots that contain the turn's user message.
 */
export function preserveInFlightChatMessages<T extends LiveChatMessage>(
  snapshot: T[],
  current: T[],
  preserveWhenUserMissing = false,
): T[] {
  let pendingIndex = -1;
  for (let index = current.length - 1; index >= 0; index -= 1) {
    const message = current[index];
    if (message.role === 'assistant' && (message.pending || message.streaming)) {
      pendingIndex = index;
      break;
    }
  }
  if (pendingIndex < 0) return snapshot;

  const pendingAssistant = current[pendingIndex];
  let precedingUser: T | undefined;
  for (let index = pendingIndex - 1; index >= 0; index -= 1) {
    if (current[index].role === 'user') {
      precedingUser = current[index];
      break;
    }
  }
  const userAlreadyPersisted = !precedingUser || snapshot.some((message) =>
    message.role === 'user' && message.content === precedingUser.content);
  if (!userAlreadyPersisted) {
    if (!preserveWhenUserMissing || !precedingUser) return snapshot;
    const restoredTurn = restorePendingChatTurn(snapshot, precedingUser.content || '');
    let pendingAssistantIndex = -1;
    for (let index = restoredTurn.length - 1; index >= 0; index -= 1) {
      const message = restoredTurn[index];
      if (message.role === 'assistant' && (message.pending || message.streaming)) {
        pendingAssistantIndex = index;
        break;
      }
    }
    if (pendingAssistantIndex < 0) return restoredTurn;
    const withLocalAssistant = [...restoredTurn];
    for (let index = pendingAssistantIndex - 1; index >= 0; index -= 1) {
      if (withLocalAssistant[index].role === 'user') {
        withLocalAssistant[index] = precedingUser;
        break;
      }
    }
    withLocalAssistant[pendingAssistantIndex] = pendingAssistant;
    return withLocalAssistant;
  }

  let snapshotUserIndex = -1;
  if (precedingUser) {
    for (let index = snapshot.length - 1; index >= 0; index -= 1) {
      if (snapshot[index].role === 'user' && snapshot[index].content === precedingUser.content) {
        snapshotUserIndex = index;
        break;
      }
    }
  }
  const hasSnapshotOutput = snapshot.slice(snapshotUserIndex + 1).some((message) =>
    message.role === 'assistant'
      && Boolean(message.content?.trim())
      && message.content !== 'Working on it...');
  return hasSnapshotOutput ? snapshot : [...snapshot, pendingAssistant];
}

/** Attach orchestration activity to the pending bubble without changing answer text. */
export function applyLiveChatProgress<T extends LiveChatMessage>(messages: T[], progress: string, streamId?: string): T[] {
  if (!progress) return messages;
  return messages.map((message) => (
    message.role === 'assistant' && message.pending && (!streamId || message.chatStreamId === streamId)
      ? { ...message, progress }
      : message
  ));
}

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
  streamId?: string,
): T[] {
  if (!text) return messages;
  let index = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'assistant' && (messages[i].pending || messages[i].streaming)
      && (!streamId || messages[i].chatStreamId === streamId)) {
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
    ...(event === 'token' ? { progress: undefined } : {}),
    ...(event === 'token'
      ? { content: `${pendingContent}${text}` }
      : { content: pendingContent, reasoning: `${pendingReasoning}${text}` }),
  };
  return next;
}

export function finishLiveChatMessage<T extends LiveChatMessage>(messages: T[], streamId?: string): T[] {
  return messages.map((message) => {
    if (!(message.pending || message.streaming || message.progress) || streamId && message.chatStreamId !== streamId) return message;
    return { ...message, pending: false, streaming: false, progress: undefined };
  });
}

/** Read actionable provider errors from native chat SSE payload variants. */
export function readNativeChatStreamError(data: unknown): string {
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const payload = data as Record<string, unknown>;
    for (const key of ['error', 'message', 'detail']) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nested = value as Record<string, unknown>;
        for (const nestedKey of ['message', 'detail', 'error']) {
          if (typeof nested[nestedKey] === 'string' && nested[nestedKey].trim()) {
            return (nested[nestedKey] as string).trim();
          }
        }
      }
    }
  }
  return 'The provider stream failed before completing the response.';
}

/** Finalize a failed live turn without discarding streamed text or reasoning. */
export function finishLiveChatMessageWithError<T extends LiveChatMessage>(
  messages: T[],
  error: string,
  streamId?: string,
): T[] {
  return messages.map((message) => {
    if (!(message.pending || message.streaming || message.progress) || streamId && message.chatStreamId !== streamId) return message;
    const hasPartialOutput = Boolean(message.content && message.content !== 'Working on it...') || Boolean(message.reasoning);
    return {
      ...message,
      content: hasPartialOutput ? message.content : `Sidekick could not respond: ${error}`,
      pending: false,
      streaming: false,
      progress: undefined,
    };
  });
}
