import type { CommandContext } from './CommandActionContracts.js';
export interface PersistentGoalView {
  sessionId: string; goal: string; status: 'active' | 'paused' | 'done' | 'cleared';
  turnsUsed: number | null; maxTurns: number | null | undefined;
  lastReason: string | null; pausedReason: string | null; lastVerdict: string | null;
  pendingJudge: boolean; revision?: number;
  continuationOwner: 'legacy_chat' | 'independent_run' | 'unknown';
}
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function count(value: unknown): number | null { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null; }
/** The legacy endpoint interprets these bare words as controls rather than goal text. */
export function isEditableGoalText(value: string): boolean {
  return Boolean(value.trim()) && !['status','pause','resume','clear','stop','done'].includes(value.trim().toLowerCase());
}
/** Only the owning session's real goal record is rendered. Missing limits stay unknown. */
export function readPersistentGoalView(session: unknown, context: CommandContext): PersistentGoalView | null {
  const record = object(session);
  if (!record || !context.sessionId || record.session_id !== context.sessionId) return null;
  const goal = object(record.goal);
  if (!goal || goal.session_id !== context.sessionId) return null;
  const objective = text(goal.goal);
  const status = goal.status;
  if (!objective || !['active','paused','done','cleared'].includes(String(status))) return null;
  const owner = goal.continuation_owner ?? goal.continuationOwner;
  return { sessionId: context.sessionId, goal: objective, status: status as PersistentGoalView['status'],
    turnsUsed: count(goal.turns_used), maxTurns: goal.max_turns === null ? null : count(goal.max_turns) ?? undefined,
    lastReason: text(goal.last_reason), pausedReason: text(goal.paused_reason), lastVerdict: text(goal.last_verdict),
    pendingJudge: goal.pending_judge === true,
    ...(count(goal.revision) !== null ? { revision: count(goal.revision)! } : {}),
    continuationOwner: owner === 'legacy_chat' || owner === 'independent_run' ? owner : 'unknown' };
}
