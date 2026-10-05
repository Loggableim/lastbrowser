import { create } from 'zustand';
import {
  assistantScopeKey, sameAssistantScope, type ActivitySnapshot, type ApiError, type AssistantMessage,
  type AssistantSnapshot, type IndependentScope, type RunEvent
} from '../independent-contracts.js';
import { isIndependentRecord } from '../independent-assistant-client.js';

export type ScopeAssistantState = Readonly<{
  scope: IndependentScope; snapshot: AssistantSnapshot | null; activity: ActivitySnapshot | null;
  composer: string; busy: boolean; loading: boolean; requestId: string | null; inFlightRequestId: string | null; turnId: string | null;
  error: ApiError | null; eventCursor: number; needsResync: boolean; streamingMessage: AssistantMessage | null;
}>;
export interface SpaceAssistantStore {
  entries: Readonly<Record<string, ScopeAssistantState>>;
  ensure: (scope: IndependentScope) => void;
  setComposer: (scope: IndependentScope, composer: string) => void;
  beginRequest: (scope: IndependentScope, requestId: string, loading?: boolean) => boolean;
  finishRequest: (scope: IndependentScope, requestId: string, error?: ApiError | null) => void;
  acceptSnapshot: (scope: IndependentScope, snapshot: AssistantSnapshot) => boolean;
  acceptActivity: (scope: IndependentScope, activity: ActivitySnapshot, resync?: boolean) => boolean;
  applyEvent: (event: RunEvent) => boolean;
  markUnavailable: (scope: IndependentScope, error: ApiError) => void;
}
function empty(scope: IndependentScope): ScopeAssistantState {
  return { scope: { ...scope }, snapshot: null, activity: null, composer: '', busy: false, loading: false,
    requestId: null, inFlightRequestId: null, turnId: null, error: null, eventCursor: 0, needsResync: false, streamingMessage: null };
}
/** A slower snapshot response may carry earlier SDK text even at the same
 * activity watermark. Preserve the newer observed text for the same target. */
function retainNewestProgress(previous: ActivitySnapshot | null, incoming: ActivitySnapshot): ActivitySnapshot {
  if (!previous?.runProgress?.length || !incoming.runProgress) return incoming;
  return { ...incoming, runProgress: incoming.runProgress.map(candidate => {
    const newer = previous.runProgress?.find(item => item.runId === candidate.runId && item.targetSessionId === candidate.targetSessionId
      && item.progressRevision > candidate.progressRevision);
    return newer ?? candidate;
  }) };
}
export function createSpaceAssistantStore() {
  return create<SpaceAssistantStore>((set, get) => {
    function edit(scope: IndependentScope, change: (entry: ScopeAssistantState) => ScopeAssistantState): void {
      const key = assistantScopeKey(scope);
      set(state => ({ entries: { ...state.entries, [key]: change(state.entries[key] ?? empty(scope)) } }));
    }
    return {
      entries: {},
      ensure: scope => { const key = assistantScopeKey(scope); if (!get().entries[key]) edit(scope, entry => entry); },
      setComposer: (scope, composer) => edit(scope, entry => ({ ...entry, composer })),
      beginRequest: (scope, requestId, loading = false) => {
        if (get().entries[assistantScopeKey(scope)]?.busy) return false;
        edit(scope, entry => ({ ...entry, busy: true, loading, requestId, inFlightRequestId: requestId, error: null, streamingMessage: null }));
        return true;
      },
      finishRequest: (scope, requestId, error = null) => edit(scope, entry => entry.inFlightRequestId !== requestId && entry.requestId !== requestId ? entry
        : entry.snapshot?.messages.some(message => message.pending && message.turnId === entry.turnId) && !error
          ? ({ ...entry, busy: true, loading: false, inFlightRequestId: null })
          : ({ ...entry, busy: false, loading: false, requestId: null, inFlightRequestId: null, turnId: null, streamingMessage: null, error })),
      acceptSnapshot: (scope, snapshot) => {
        const current = get().entries[assistantScopeKey(scope)];
        if (!sameAssistantScope(scope, snapshot.scope) || (current?.snapshot && snapshot.revision < current.snapshot.revision)) return false;
        edit(scope, entry => {
          const activity = !entry.activity || snapshot.activity.watermark >= entry.activity.watermark ? retainNewestProgress(entry.activity, snapshot.activity) : entry.activity;
          const pending = [...snapshot.messages].reverse().find(message => message.pending && message.turnId);
          const user = pending ? snapshot.messages.find(message => message.role === 'user' && message.turnId === pending.turnId) : null;
          // Activity may have observed later events than the conversation read.
          // Only consumed events or an explicit resync advance their cursor.
          return { ...entry, snapshot, activity, error: null,
            busy: Boolean(pending) || Boolean(entry.inFlightRequestId), requestId: pending ? user?.clientRequestId ?? entry.requestId : entry.inFlightRequestId,
            turnId: pending?.turnId ?? null, streamingMessage: pending ? entry.streamingMessage : null };
        });
        return true;
      },
      acceptActivity: (scope, activity, resync = false) => {
        const current = get().entries[assistantScopeKey(scope)];
        if (!sameAssistantScope(scope, activity.scope) || (!resync && current?.activity && activity.watermark < current.activity.watermark)) return false;
        edit(scope, entry => ({ ...entry, activity: retainNewestProgress(entry.activity, activity), eventCursor: resync ? activity.watermark : entry.eventCursor, needsResync: false }));
        return true;
      },
      applyEvent: event => {
        const entry = get().entries[assistantScopeKey(event.scope)];
        if (!entry || event.seq <= entry.eventCursor) return false;
        if (event.seq !== entry.eventCursor + 1) {
          edit(event.scope, current => ({ ...current, needsResync: true }));
          return false;
        }
        edit(event.scope, current => {
          let streamingMessage = current.streamingMessage;
          let turnId = current.turnId;
          const payload = event.payload;
          if (event.kind === 'assistant' && isIndependentRecord(payload) && payload.requestId === current.requestId
            && payload.conversationId === current.snapshot?.conversationId && typeof payload.turnId === 'string'
            && typeof payload.delta === 'string'
            && (payload.revision === undefined || (typeof payload.revision === 'number' && payload.revision >= (current.snapshot?.revision ?? 1)))) {
            turnId = payload.turnId;
            const content = streamingMessage?.turnId === turnId ? streamingMessage.content + payload.delta : payload.delta;
            streamingMessage = { id: `stream:${turnId}`, turnId, role: 'assistant', content, at: event.at, pending: true };
          }
          return { ...current, eventCursor: event.seq, streamingMessage, turnId };
        });
        return true;
      },
      markUnavailable: (scope, error) => edit(scope, entry => ({ ...entry, error,
        activity: entry.activity ? { ...entry.activity, sourceState: 'stale', lastSuccessfulAt: entry.activity.lastSuccessfulAt ?? entry.activity.observedAt } : null }))
    };
  });
}
export const useSpaceAssistantStore = createSpaceAssistantStore();
