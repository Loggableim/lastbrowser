/** Return a visible retryable warning only when the backend marks goal state unavailable. */
export function readPersistentGoalStateError(session: unknown): string | null {
  if (!session || typeof session !== 'object' || Array.isArray(session)) return null;
  const error = (session as Record<string, unknown>).goal_state_error;
  if (!error || typeof error !== 'object' || Array.isArray(error)) return null;
  const record = error as Record<string, unknown>;
  if (record.error !== 'goal_state_unavailable' || record.retryable !== true) return null;
  const message = typeof record.message === 'string' ? record.message.trim() : '';
  return (message || 'Persistent goal state is unavailable. Please retry.').slice(0, 500);
}
