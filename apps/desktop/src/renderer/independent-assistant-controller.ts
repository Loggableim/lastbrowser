import {
  assistantScopeKey, newIndependentRequestId, type ApiError, type AssistantSnapshot, type AssistantControlRequest, type DispatchRequest,
  type IndependentBridge, type IndependentOperations, type IndependentRequest, type IndependentResult,
  type IndependentScope, type InterviewAnswerRequest, type InterviewTopic, type ProfilePatch,
  type RunView, type ScopeSelectionRequest, type TaskDispatchView
} from './independent-contracts.js';
import { isAssistantSnapshot } from './independent-assistant-client.js';
import { useSpaceAssistantStore, type createSpaceAssistantStore } from './stores/useSpaceAssistantStore.js';

type AssistantStore = ReturnType<typeof createSpaceAssistantStore>;
type SnapshotOperation = 'assistantSnapshot' | 'assistantTurn' | 'assistantControl' | 'interviewStart' | 'interviewAnswer' | 'interviewReview' | 'interviewContinue' | 'interviewConfirm' | 'interviewSkip';
const unavailable: ApiError = { schemaVersion: 1, code: 'assistant_not_ready', message: 'Load the Space assistant before sending an answer.', retryable: true };
const scopeResolutionRetryDelaysMs = [250, 500, 1000, 2000, 4000] as const;
const scopeResolutionCancelled: ApiError = { schemaVersion: 1, code: 'scope_resolution_superseded',
  message: 'The selected Space changed before it could be loaded.', retryable: false };

function waitForScopeRetry(delayMs: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    const finish = (elapsed: boolean) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolve(elapsed);
    };
    const timer = setTimeout(() => finish(true), delayMs);
    const abort = () => finish(false);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

/** UI subscriptions never own an executing task. No method calls the native-chat stop handler. */
export class IndependentAssistantController {
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly pendingSignatures = new Map<string, string>();
  private readonly loads = new Map<string, Promise<IndependentResult<AssistantSnapshot>>>();
  private readonly cancelledRequests = new Set<string>();
  private readonly observers = new Map<string, { count: number; timer: ReturnType<typeof setInterval> }>();
  private readonly unsubscribe: () => void;
  constructor(private readonly bridge: IndependentBridge, private readonly store: AssistantStore = useSpaceAssistantStore) {
    this.unsubscribe = bridge.onEvent?.(event => this.store.getState().applyEvent(event)) ?? (() => {});
  }
  dispose(): void {
    this.unsubscribe();
    for (const observer of this.observers.values()) clearInterval(observer.timer);
    this.observers.clear();
  }
  async resolveScope(selection: ScopeSelectionRequest, backendProfileName?: string, options: { signal?: AbortSignal } = {}) {
    const request = { schemaVersion: 1 as const, operation: 'resolveScope' as const, payload: selection, backendProfileName };
    for (let attempt = 0; ; attempt++) {
      if (options.signal?.aborted) return { ok: false as const, error: scopeResolutionCancelled };
      const result = await this.bridge.request(request);
      // A selection cleanup may happen while the IPC request is in flight.
      // Do not deliver that older answer into a newly selected Space.
      if (options.signal?.aborted) return { ok: false as const, error: scopeResolutionCancelled };
      if (result.ok || result.error.code !== 'sidekick_not_ready' || result.error.retryable !== true)
        return result;
      const delay = scopeResolutionRetryDelaysMs[attempt];
      if (delay === undefined) return result;
      if (!await waitForScopeRetry(delay, options.signal)) return { ok: false as const, error: scopeResolutionCancelled };
    }
  }
  listBackendProfiles() {
    return this.bridge.request({ schemaVersion: 1, operation: 'backendProfiles', payload: {} });
  }
  listProfileBindings(browserProfileId?: string) {
    return this.bridge.request({ schemaVersion: 1, operation: 'profileBindings', payload: browserProfileId ? { browserProfileId } : {} });
  }
  private entry(scope: IndependentScope) { return this.store.getState().entries[assistantScopeKey(scope)]; }
  private async snapshotRequest<K extends SnapshotOperation>(request: IndependentRequest<K>, loading = false): Promise<IndependentResult<AssistantSnapshot>> {
    const scope = request.scope;
    if (!scope) return { ok: false, error: unavailable };
    const requestId = 'clientRequestId' in request.payload && typeof request.payload.clientRequestId === 'string'
      ? request.payload.clientRequestId : newIndependentRequestId();
    const key = `${assistantScopeKey(scope)}:${requestId}`;
    const signature = JSON.stringify(request);
    const existing = this.pending.get(key);
    if (existing) {
      if (this.pendingSignatures.get(key) !== signature) return { ok: false, error: { ...unavailable, code: 'idempotency_conflict', retryable: false } };
      const result = await existing;
      if (isAssistantSnapshot(result)) return { ok: true, value: result };
      return { ok: false, error: unavailable };
    }
    if (!this.store.getState().beginRequest(scope, requestId, loading)) return { ok: false, error: { ...unavailable, code: 'assistant_busy' } };
    const work = this.bridge.request(request);
    // Keep the backend request ID stable across a deliberate retry; parallel
    // button events share the same pending Promise instead of resending.
    this.pending.set(key, work.then(result => result.ok ? result.value : null));
    this.pendingSignatures.set(key, signature);
    try {
      const result = await work;
      if (result.ok && isAssistantSnapshot(result.value)) {
        if (!this.cancelledRequests.has(requestId)) this.store.getState().acceptSnapshot(scope, result.value);
        this.store.getState().finishRequest(scope, requestId);
        return { ok: true, value: result.value };
      }
      const error = result.ok ? { ...unavailable, code: 'invalid_response', retryable: false } : result.error;
      this.store.getState().finishRequest(scope, requestId, error);
      return { ok: false, error };
    } catch {
      const error = { ...unavailable, code: 'bridge_unavailable' };
      this.store.getState().finishRequest(scope, requestId, error);
      return { ok: false, error };
    } finally {
      this.pending.delete(key);
      this.pendingSignatures.delete(key);
      this.cancelledRequests.delete(requestId);
    }
  }
  load(scope: IndependentScope): Promise<IndependentResult<AssistantSnapshot>> {
    const key = assistantScopeKey(scope), existing = this.loads.get(key);
    if (existing) return existing;
    const requestId = newIndependentRequestId();
    const claimed = !this.entry(scope)?.busy && this.store.getState().beginRequest(scope, requestId, true);
    const work = (async () => {
      const result = await this.bridge.request({ schemaVersion: 1, operation: 'assistantSnapshot', scope, payload: {} });
      if (result.ok) this.store.getState().acceptSnapshot(scope, result.value);
      else this.store.getState().markUnavailable(scope, result.error);
      if (claimed) this.store.getState().finishRequest(scope, requestId, result.ok ? null : result.error);
      return result;
    })();
    this.loads.set(key, work);
    void work.finally(() => this.loads.delete(key));
    return work;
  }
  send(scope: IndependentScope, text: string, selectedContextRefs: readonly string[] = [], requestId = newIndependentRequestId()) {
    const snapshot = this.entry(scope)?.snapshot;
    if (!snapshot || !text.trim()) return Promise.resolve<IndependentResult<AssistantSnapshot>>({ ok: false, error: unavailable });
    const composerAtSend = this.entry(scope)?.composer;
    return this.snapshotRequest({ schemaVersion: 1, operation: 'assistantTurn', scope, payload: {
      clientRequestId: requestId, expectedRevision: snapshot.revision,
      message: text.trim(), selectedContextRefs
    } }).then(result => {
      if (result.ok && this.entry(scope)?.composer === composerAtSend) this.store.getState().setComposer(scope, '');
      return result;
    });
  }
  startInterview(scope: IndependentScope, locale: string, seed?: ProfilePatch) {
    const revision = this.entry(scope)?.snapshot?.revision ?? 1;
    return this.snapshotRequest({ schemaVersion: 1, operation: 'interviewStart', scope, payload: { clientRequestId: newIndependentRequestId(), expectedRevision: revision, locale, seed } });
  }
  chooseControl(scope: IndependentScope, payload: AssistantControlRequest) {
    return this.snapshotRequest({ schemaVersion: 1, operation: 'assistantControl', scope, payload });
  }
  answer(scope: IndependentScope, request: Omit<InterviewAnswerRequest, 'clientRequestId' | 'expectedRevision'>, requestId = newIndependentRequestId()) {
    const revision = this.entry(scope)?.snapshot?.interview?.revision;
    if (!revision) return Promise.resolve<IndependentResult<AssistantSnapshot>>({ ok: false, error: unavailable });
    return this.snapshotRequest({ schemaVersion: 1, operation: 'interviewAnswer', scope, payload: { ...request, expectedRevision: revision, clientRequestId: requestId } });
  }
  review(scope: IndependentScope) { return this.interviewMutation('interviewReview', scope); }
  skip(scope: IndependentScope) { return this.interviewMutation('interviewSkip', scope); }
  continueInterview(scope: IndependentScope, topic?: InterviewTopic) { return this.interviewMutation('interviewContinue', scope, { topic }); }
  confirm(scope: IndependentScope, values?: ProfilePatch) { return this.interviewMutation('interviewConfirm', scope, { values }); }
  private interviewMutation<K extends 'interviewReview' | 'interviewSkip' | 'interviewContinue' | 'interviewConfirm'>(operation: K, scope: IndependentScope, extra: { topic?: InterviewTopic; values?: ProfilePatch } = {}) {
    const expectedRevision = this.entry(scope)?.snapshot?.interview?.revision;
    if (!expectedRevision) return Promise.resolve<IndependentResult<AssistantSnapshot>>({ ok: false, error: unavailable });
    return this.snapshotRequest({ schemaVersion: 1, operation, scope, payload: { ...extra, expectedRevision, clientRequestId: newIndependentRequestId() } });
  }
  async cancelTurn(scope: IndependentScope): Promise<void> {
    const entry = this.entry(scope);
    if (!entry?.turnId || !entry.requestId || !entry.snapshot) return;
    const result = await this.bridge.request({ schemaVersion: 1, operation: 'cancelAssistantTurn', scope,
      payload: { turnId: entry.turnId, expectedRevision: entry.snapshot.revision, clientRequestId: newIndependentRequestId() } });
    if (result.ok && result.value.cancelled) {
      this.cancelledRequests.add(entry.requestId);
      if (this.cancelledRequests.size > 256) {
        const oldest = this.cancelledRequests.values().next().value;
        if (oldest) this.cancelledRequests.delete(oldest);
      }
      this.store.getState().finishRequest(scope, entry.requestId);
      const snapshot = await this.bridge.request({ schemaVersion: 1, operation: 'assistantSnapshot', scope, payload: {} });
      if (snapshot.ok) this.store.getState().acceptSnapshot(scope, snapshot.value);
      await this.poll(scope);
    } else if (!result.ok) this.store.getState().markUnavailable(scope, result.error);
  }
  async poll(scope: IndependentScope): Promise<void> {
    const key = `poll:${assistantScopeKey(scope)}`;
    if (this.pending.has(key)) return;
    const work = (async () => {
      const recoveringTransport = this.entry(scope)?.error?.code === 'sidekick_not_ready';
      const result = await this.bridge.request({ schemaVersion: 1, operation: 'events', scope, payload: { after: this.entry(scope)?.eventCursor ?? 0 } });
      if (!result.ok) { this.store.getState().markUnavailable(scope, result.error); return; }
      if (result.value.resyncRequired && result.value.snapshot) this.store.getState().acceptActivity(scope, result.value.snapshot, true);
      let assistantChanged = result.value.resyncRequired;
      for (const event of result.value.events) {
        this.store.getState().applyEvent(event);
        if (event.kind === 'assistant' || event.kind === 'assistant_control' || event.kind === 'interview' || event.kind === 'result') assistantChanged = true;
      }
      let activityError: ApiError | null = null;
      const activity = await this.bridge.request({ schemaVersion: 1, operation: 'activity', scope, payload: {} });
      if (activity.ok) this.store.getState().acceptActivity(scope, activity.value);
      else { activityError = activity.error; this.store.getState().markUnavailable(scope, activity.error); }
      if (assistantChanged || recoveringTransport) {
        const snapshot = await this.bridge.request({ schemaVersion: 1, operation: 'assistantSnapshot', scope, payload: {} });
        if (snapshot.ok) {
          this.store.getState().acceptSnapshot(scope, snapshot.value);
          if (activityError) this.store.getState().markUnavailable(scope, activityError);
        }
        else if (recoveringTransport) this.store.getState().markUnavailable(scope, snapshot.error);
      }
    })();
    this.pending.set(key, work);
    try { await work; } finally { this.pending.delete(key); }
  }
  observe(scope: IndependentScope): () => void {
    this.store.getState().ensure(scope);
    const key = assistantScopeKey(scope);
    const existing = this.observers.get(key);
    if (existing) existing.count += 1;
    else {
      void this.poll(scope);
      const timer = setInterval(() => { void this.poll(scope); }, 1000);
      this.observers.set(key, { count: 1, timer });
    }
    let released = false;
    return () => {
      if (released) return; released = true;
      const observer = this.observers.get(key);
      if (observer && --observer.count === 0) { clearInterval(observer.timer); this.observers.delete(key); }
    };
  }
  async dispatch(scope: IndependentScope, request: DispatchRequest): Promise<IndependentResult<TaskDispatchView>> {
    const result = await this.bridge.request({ schemaVersion: 1, operation: 'dispatch', scope, payload: request });
    if (result.ok) await this.poll(scope);
    else this.store.getState().markUnavailable(scope, result.error);
    return result;
  }
  async control(scope: IndependentScope, run: RunView, command: 'pause' | 'resume' | 'cancel') {
    const result = await this.bridge.request({ schemaVersion: 1, operation: 'runControl', scope, payload: {
      runId: run.runId, command, expectedRevision: run.stateRevision, clientRequestId: newIndependentRequestId()
    } });
    if (result.ok) await this.poll(scope);
    else this.store.getState().markUnavailable(scope, result.error);
    return result;
  }
  request<K extends keyof IndependentOperations>(request: IndependentRequest<K>) { return this.bridge.request(request); }
}
