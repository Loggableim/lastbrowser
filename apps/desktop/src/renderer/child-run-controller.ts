import type { ChildRunBinding, ChildRunEvent, ChildRunIdentity, ChildRunSnapshot, ChildRunStatus } from './child-run-contracts';
export const CHILD_RUN_LIMITS = Object.freeze({ children: 64, messages: 128, text: 262144 });
export type ChildRunEntry = Readonly<{ snapshot: ChildRunSnapshot; requiresResync: boolean; truncated: boolean }>;
export type ChildRunState = Readonly<{ binding: ChildRunBinding; children: Readonly<Record<string, ChildRunEntry>>; missing: Readonly<Record<string, ChildRunIdentity>>; overflow: boolean }>;
export const isTerminalChildRun = (status: ChildRunStatus) => ['completed', 'failed', 'cancelled', 'interrupted'].includes(status);
export function createChildRunState(binding: ChildRunBinding): ChildRunState { return { binding, children: {}, missing: {}, overflow: false }; }
function bound(state: ChildRunState, value: ChildRunBinding): boolean {
  const a = state.binding, b = value;
  return a.parentSessionId === b.parentSessionId && a.parentTurnId === b.parentTurnId && a.scope.backendProfileId === b.scope.backendProfileId && a.scope.spaceId === b.scope.spaceId && a.scope.browserProfileId === b.scope.browserProfileId;
}
function limit(snapshot: ChildRunSnapshot): ChildRunEntry {
  let remaining: number = CHILD_RUN_LIMITS.text, truncated = Boolean(snapshot.truncated) || snapshot.messages.length > CHILD_RUN_LIMITS.messages;
  const messages = snapshot.messages.slice(-CHILD_RUN_LIMITS.messages).map(message => {
    const content = message.content.slice(0, remaining); remaining -= content.length;
    truncated ||= content.length !== message.content.length;
    return { ...message, content };
  });
  return { snapshot: { ...snapshot, messages }, requiresResync: false, truncated };
}
function sameChild(old: ChildRunSnapshot, value: ChildRunSnapshot | ChildRunEvent): boolean {
  return old.parentSubagentId === value.parentSubagentId && old.depth === value.depth && old.model.provider === value.model.provider && old.model.model === value.model.model && (old.childSessionId === null || old.childSessionId === value.childSessionId);
}
export function recoverChildRun(state: ChildRunState, snapshot: ChildRunSnapshot): ChildRunState {
  if (!bound(state, snapshot) || snapshot.schemaVersion !== 1 || !snapshot.subagentId || !Number.isSafeInteger(snapshot.watermark) || snapshot.watermark < 0) return state;
  const old = Object.hasOwn(state.children, snapshot.subagentId) ? state.children[snapshot.subagentId] : undefined;
  if (old && (!sameChild(old.snapshot, snapshot) || snapshot.watermark < old.snapshot.watermark || snapshot.revision < old.snapshot.revision || (isTerminalChildRun(old.snapshot.status) && old.snapshot.status !== snapshot.status))) return state;
  if (!old && Object.keys(state.children).length >= CHILD_RUN_LIMITS.children) return { ...state, overflow: true };
  const missing = { ...state.missing }; delete missing[snapshot.subagentId];
  return { ...state, missing, children: { ...state.children, [snapshot.subagentId]: limit(snapshot) } };
}
export function reduceChildRunEvent(state: ChildRunState, event: ChildRunEvent): ChildRunState {
  if (!bound(state, event) || event.schemaVersion !== 1 || !Number.isSafeInteger(event.sequence) || event.sequence < 1) return state;
  const old = Object.hasOwn(state.children, event.subagentId) ? state.children[event.subagentId] : undefined;
  if (old && !sameChild(old.snapshot, event)) return state;
  if (old && event.sequence <= old.snapshot.watermark) return state;
  if (event.payload.snapshot && typeof event.payload.snapshot === 'object') {
    const snapshot = event.payload.snapshot as ChildRunSnapshot;
    if (snapshot.subagentId !== event.subagentId || snapshot.watermark !== event.sequence) return state;
    return recoverChildRun(state, snapshot);
  }
  if (!old) {
    if (Object.keys(state.missing).length >= CHILD_RUN_LIMITS.children) return { ...state, overflow: true };
    const { scope, parentSessionId, parentTurnId, subagentId, parentSubagentId, childSessionId, depth, model } = event;
    return { ...state, missing: { ...state.missing, [subagentId]: { scope, parentSessionId, parentTurnId, subagentId, parentSubagentId, childSessionId, depth, model } } };
  }
  if (old.requiresResync || event.sequence !== old.snapshot.watermark + 1) return { ...state, children: { ...state.children, [event.subagentId]: { ...old, requiresResync: true } } };
  if (isTerminalChildRun(old.snapshot.status)) return state;
  let snapshot = { ...old.snapshot, watermark: event.sequence, observedAt: event.at };
  let incomingTruncated = false;
  if (event.kind === 'answer_delta' && typeof event.payload.delta === 'string') {
    const delta = event.payload.delta.slice(0, CHILD_RUN_LIMITS.text);
    incomingTruncated = delta.length !== event.payload.delta.length;
    const id = typeof event.payload.messageId === 'string' ? event.payload.messageId : `answer:${event.subagentId}`;
    const messages = [...snapshot.messages], index = messages.findIndex(message => message.id === id);
    if (index >= 0) messages[index] = { ...messages[index], content: messages[index].content + delta };
    else messages.push({ id, role: 'assistant', content: delta, at: event.at });
    snapshot = { ...snapshot, messages };
  }
  const statuses: ChildRunStatus[] = ['queued', 'running', 'waiting_for_approval', 'paused', 'completed', 'failed', 'cancelled', 'interrupted'];
  if (typeof event.payload.status === 'string' && statuses.includes(event.payload.status as ChildRunStatus)) snapshot = { ...snapshot, status: event.payload.status as ChildRunStatus };
  const entry = limit(snapshot);
  return { ...state, children: { ...state.children, [event.subagentId]: { ...entry, truncated: old.truncated || entry.truncated || incomingTruncated } } };
}
