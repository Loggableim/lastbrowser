/**
 * Bound native chat waits by both model activity and a hard turn limit.
 * Long reasoning phases may exceed the old two-minute wall-clock limit before
 * the first visible answer token, so progress extends the idle window without
 * allowing a permanently hung stream to keep the composer locked forever.
 */
export const NATIVE_CHAT_STREAM_IDLE_TIMEOUT_MS = 180_000;
export const NATIVE_CHAT_STREAM_MAX_DURATION_MS = 30 * 60_000;

const PROGRESS_EVENTS = new Set([
  'token',
  'delta',
  'reasoning',
  'metering',
  'tool',
  'tool_complete',
  'interim_assistant',
  'teamwork_stage',
  'teamwork_plan',
  'teamwork_draft',
  'teamwork_critic',
  'teamwork_complete',
  'smart_track_routed',
  'smart_track_step',
  'smart_track_preplan',
  'smart_track_complete',
  'approval',
  'clarify',
  'goal',
  'goal_continue',
  'compressing',
  'compressed',
  'subagent_event',
]);

export function isNativeChatProgressEvent(eventName: unknown): boolean {
  return typeof eventName === 'string' && PROGRESS_EVENTS.has(eventName);
}

export function isNativeChatStreamWaitExpired(
  startedAt: number,
  lastProgressAt: number,
  now: number,
  idleTimeoutMs = NATIVE_CHAT_STREAM_IDLE_TIMEOUT_MS,
  maxDurationMs = NATIVE_CHAT_STREAM_MAX_DURATION_MS,
): boolean {
  return now - startedAt >= maxDurationMs || now - lastProgressAt >= idleTimeoutMs;
}
