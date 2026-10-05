import { isIndependentRecord, isIndependentScope } from './independent-assistant-client.js';
import { sameAssistantScope, type IndependentScope, type RunView } from './independent-contracts.js';

export type IndependentSessionRun = Readonly<{
  runId: string; dispatchId: string; scope: IndependentScope; state: RunView['state']; stateRevision: number;
  assistantConversationId: string; deliveryKey?: string; writerOwner?: 'independent_run' | 'legacy_chat';
}>;
const states: readonly RunView['state'][] = ['queued', 'running', 'waiting_for_user', 'waiting_for_approval', 'pausing', 'paused', 'cancelling', 'cancelled', 'completed', 'failed', 'interrupted'];
const terminal = new Set<RunView['state']>(['completed', 'failed', 'cancelled', 'interrupted']);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length < 1024 && !/[\u0000-\u001f]/.test(value);

export function hasIndependentSessionMarker(session: unknown): boolean {
  return isIndependentRecord(session) && session.independent !== undefined && session.independent !== null;
}
export function readIndependentSessionRun(session: unknown): IndependentSessionRun | null {
  if (!isIndependentRecord(session) || !isIndependentRecord(session.independent)) return null;
  const run = session.independent;
  const state = states.find(state => state === run.state);
  if (!(id(run.runId) && id(run.dispatchId) && isIndependentScope(run.scope) && state
    && typeof run.stateRevision === 'number' && Number.isSafeInteger(run.stateRevision) && run.stateRevision >= 1
    && id(run.assistantConversationId) && (run.deliveryKey === undefined || id(run.deliveryKey))
    && (run.writerOwner === undefined || run.writerOwner === 'independent_run' || run.writerOwner === 'legacy_chat'))) return null;
  return { runId: run.runId, dispatchId: run.dispatchId, scope: run.scope, state, stateRevision: run.stateRevision,
    assistantConversationId: run.assistantConversationId, deliveryKey: run.deliveryKey, writerOwner: run.writerOwner };
}
export function isIndependentOwnedSession(session: unknown): boolean {
  if (!hasIndependentSessionMarker(session)) return false;
  return readIndependentSessionRun(session)?.writerOwner !== 'legacy_chat';
}
/** Missing/malformed activity cannot release an independent writer lease. */
export function isIndependentWriterProtected(session: unknown, liveRun?: RunView | null): boolean {
  if (!isIndependentOwnedSession(session)) return false;
  const marker = readIndependentSessionRun(session);
  if (!marker || liveRun === null) return true;
  if (liveRun && (liveRun.runId !== marker.runId || !sameAssistantScope(liveRun.scope, marker.scope))) return true;
  return !terminal.has(liveRun?.state ?? marker.state);
}
