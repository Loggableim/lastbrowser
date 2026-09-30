export interface GoalContinuationEvent {
  streamId?: unknown;
  event?: unknown;
  data?: unknown;
}

/** Read a goal-evaluation warning only from the stream and session that own it. */
export function readGoalEvaluationError(
  event: GoalContinuationEvent,
  expectedStreamId: string,
  expectedSessionId: string
): string | null {
  if (event.event !== 'goal' || event.streamId !== expectedStreamId) return null;
  if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) return null;

  const data = event.data as Record<string, unknown>;
  if (data.session_id !== expectedSessionId || data.state !== 'error') return null;
  const message = typeof data.message === 'string' ? data.message.trim() : '';
  return (message || 'Goal evaluation failed.').slice(0, 500);
}

/** Read a goal continuation only from the stream and session that own it. */
export function readGoalContinuationPrompt(
  event: GoalContinuationEvent,
  expectedStreamId: string,
  expectedSessionId: string
): string | null {
  if (event.event !== 'goal_continue' || event.streamId !== expectedStreamId) return null;
  if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) return null;

  const data = event.data as Record<string, unknown>;
  if (data.session_id !== expectedSessionId) return null;
  const prompt = typeof data.continuation_prompt === 'string'
    ? data.continuation_prompt.trim()
    : '';
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (!prompt || prompt !== text) return null;
  return prompt;
}

/** A cancelled stream must never hand off its queued automatic continuation. */
export function continuationAfterTerminalEvent(
  prompt: string | null,
  event: 'stream_end' | 'cancel' | 'error'
): string | null {
  return event === 'stream_end' ? prompt : null;
}

export function isGoalContinuationContextCurrent(
  expected: { sessionId: string; profileId: string; spacePath: string },
  current: { sessionId: string | null; profileId: string; spacePath: string }
): boolean {
  return current.sessionId === expected.sessionId
    && current.profileId === expected.profileId
    && current.spacePath === expected.spacePath;
}

/** Compare a chat turn's frozen context with the currently selected context. */
export function isActiveTurnContextCurrent(
  expected: { sessionId: string; profileId: string; spacePath: string },
  current: { sessionId: string | null; profileId: string; spacePath: string }
): boolean {
  return current.sessionId === (expected.sessionId || null)
    && current.profileId === expected.profileId
    && current.spacePath === expected.spacePath;
}

/** Adopt a newly created backend session only while the original context is still selected. */
export function adoptCreatedTurnSession(
  expected: { sessionId: string; profileId: string; spacePath: string },
  current: { sessionId: string | null; profileId: string; spacePath: string },
  createdSessionId: string
): { sessionId: string; profileId: string; spacePath: string } | null {
  if (!isActiveTurnContextCurrent(expected, current)) return null;
  const sessionId = createdSessionId.trim();
  if (!sessionId) return null;
  return expected.sessionId ? expected : { ...expected, sessionId };
}

/** Start a queued continuation only while the owning chat context is selected. */
export async function startGoalContinuation(
  prompt: string,
  expected: { sessionId: string; profileId: string; spacePath: string },
  current: { sessionId: string | null; profileId: string; spacePath: string },
  startChat: (prompt: string) => Promise<unknown>
): Promise<boolean> {
  const text = prompt.trim();
  if (!text || !isGoalContinuationContextCurrent(expected, current)) return false;
  await startChat(text);
  return true;
}
