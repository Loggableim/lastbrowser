import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { assistantScopeKey, type ActivitySnapshot, type AssistantSnapshot, type IndependentScope, type InterviewState, type RunEvent } from '../src/renderer/independent-contracts.js';
import { IndependentAssistantClient, isActivitySnapshot, isAssistantSnapshot, isInterviewQuestion, isProfilePatch, isRunEvent } from '../src/renderer/independent-assistant-client.js';
import { IndependentAssistantController } from '../src/renderer/independent-assistant-controller.js';
import { createSpaceAssistantStore } from '../src/renderer/stores/useSpaceAssistantStore.js';
import { useSpaceAssistantStore } from '../src/renderer/stores/useSpaceAssistantStore.js';
import { isIndependentOwnedSession, isIndependentWriterProtected, readIndependentSessionRun } from '../src/renderer/independent-work-chat.js';
import { SpaceAssistantPanel } from '../src/renderer/components/SpaceAssistantPanel.js';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SpaceInterview } from '../src/renderer/components/SpaceInterview.js';
import { DesktopI18nProvider, desktopLocaleIds, desktopLocaleOverrides } from '../src/renderer/i18n.js';
import { spaceAssistantTranslationKeys } from '../src/renderer/i18n/space-assistant-translations.js';
import { clarificationLabels } from '../src/renderer/components/IndependentRunClarification.js';
import { IndependentClarification } from '../src/renderer/components/IndependentClarification.js';
import { assistantResetCopy } from '../src/renderer/components/IndependentResetSection.js';
import { independentBrowserSessionCopy } from '../src/renderer/i18n/independent-browser-copy.js';

const at = '2026-10-03T12:00:00Z';
function scope(): IndependentScope { return { backendProfileId: randomUUID(), spaceId: randomUUID(), browserProfileId: 'default' }; }
function activity(s: IndependentScope, watermark = 0): ActivitySnapshot {
  return { schemaVersion: 1, scope: s, observedAt: at, watermark, sourceState: 'live', lastSuccessfulAt: null,
    runs: [], dispatches: [], activeChats: [], schedules: [], approvals: [] };
}
function snapshot(s: IndependentScope, revision = 1): AssistantSnapshot {
  return { schemaVersion: 1, scope: s, conversationId: randomUUID(), revision, messages: [], interview: null,
    confirmedProfile: null, providerReady: true, provider: 'test-provider', model: 'contract-test', activity: activity(s) };
}
function interview(s: IndependentScope): InterviewState {
  return { schemaVersion: 1, interviewId: randomUUID(), scope: s, revision: 3, stage: 'interview', locale: 'en', questionId: randomUUID(),
    question: { schemaVersion: 1, kind: 'question', basedOnRevision: 3, topic: 'purpose', prompt: 'What is this Space for?',
      options: [{ id: 'research', label: 'Research' }, { id: 'work', label: 'Work' }, { id: 'personal', label: 'Personal' }],
      allowFreeText: true, selection: 'single', understood: [], profilePatch: {} },
    answers: [], draft: {}, understood: [], unresolvedTopics: ['purpose', 'help', 'style'], review: null, modelError: null, manualFallback: false };
}
function event(s: IndependentScope, seq: number, payload: Record<string, unknown> = {}): RunEvent {
  return { schemaVersion: 1, scope: s, eventId: randomUUID(), seq, at, kind: 'assistant', payload };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

describe('independent assistant presentation boundaries', () => {
  it('rehydrates after a transient local-service failure using reads only', async () => {
    const s = scope(), stored = createSpaceAssistantStore(), current = snapshot(s);
    stored.getState().markUnavailable(s, { schemaVersion: 1, code: 'sidekick_not_ready',
      message: 'The local Sidekick service is starting.', retryable: true });
    const operations: string[] = [];
    const bridge = { request: vi.fn(async (request: any) => {
      operations.push(request.operation);
      if (request.operation === 'events') return { ok: true, value: { events: [], snapshot: null, watermark: 0, resyncRequired: false } };
      if (request.operation === 'activity') return { ok: true, value: current.activity };
      if (request.operation === 'assistantSnapshot') return { ok: true, value: current };
      throw new Error(`Unexpected operation: ${request.operation}`);
    }) };
    const controller = new IndependentAssistantController(bridge as any, stored);
    await controller.poll(s);
    expect(stored.getState().entries[assistantScopeKey(s)]?.error).toBeNull();
    expect(operations).toEqual(['events', 'activity', 'assistantSnapshot']);
    controller.dispose();
  });

  it('retries only transient startup refusal for the exact selected Space', async () => {
    vi.useFakeTimers();
    try {
      const selected = scope(), resolved = { schemaVersion: 1 as const, scope: selected,
        spaceName: 'Selected Space', workspacePath: 'C:\\controlled\\selected', bindingRevision: 4, setupStatus: 'confirmed' as const };
      const request = vi.fn()
        .mockResolvedValueOnce({ ok: false, error: { schemaVersion: 1, code: 'sidekick_not_ready', message: 'starting', retryable: true } })
        .mockResolvedValueOnce({ ok: false, error: { schemaVersion: 1, code: 'sidekick_not_ready', message: 'starting', retryable: true } })
        .mockResolvedValueOnce({ ok: true, value: resolved });
      const controller = new IndependentAssistantController({ request } as any, createSpaceAssistantStore());
      const resolving = controller.resolveScope({ browserProfileId: selected.browserProfileId, workspacePath: resolved.workspacePath }, 'default');
      await vi.advanceTimersByTimeAsync(750);
      await expect(resolving).resolves.toEqual({ ok: true, value: resolved });
      expect(request).toHaveBeenCalledTimes(3);
      expect(request.mock.calls.map(([call]) => call)).toEqual(Array.from({ length: 3 }, () => ({
        schemaVersion: 1, operation: 'resolveScope',
        payload: { browserProfileId: selected.browserProfileId, workspacePath: resolved.workspacePath },
        backendProfileName: 'default'
      })));
      controller.dispose();
    } finally { vi.useRealTimers(); }
  });

  it('does not retry non-startup errors and bounds repeated startup refusal', async () => {
    vi.useFakeTimers();
    try {
      const selected = scope();
      const denied = { ok: false, error: { schemaVersion: 1, code: 'scope_ambiguous', message: 'Choose a profile', retryable: true } };
      const deniedRequest = vi.fn().mockResolvedValue(denied);
      const controller = new IndependentAssistantController({ request: deniedRequest } as any, createSpaceAssistantStore());
      await expect(controller.resolveScope({ browserProfileId: selected.browserProfileId, workspacePath: null })).resolves.toEqual(denied);
      expect(deniedRequest).toHaveBeenCalledTimes(1);

      const startup = { ok: false, error: { schemaVersion: 1, code: 'sidekick_not_ready', message: 'starting', retryable: true } };
      const refusedRequest = vi.fn().mockResolvedValue(startup);
      const retrying = new IndependentAssistantController({ request: refusedRequest } as any, createSpaceAssistantStore());
      const result = retrying.resolveScope({ browserProfileId: selected.browserProfileId, workspacePath: null });
      await vi.advanceTimersByTimeAsync(7750);
      await expect(result).resolves.toEqual(startup);
      expect(refusedRequest).toHaveBeenCalledTimes(6);
      controller.dispose(); retrying.dispose();
    } finally { vi.useRealTimers(); }
  });

  it('discards an in-flight Space A answer after selection changes to Space B', async () => {
    vi.useFakeTimers();
    try {
      const first = scope(), next = scope();
      const late = deferred<any>();
      const resolvedNext = { schemaVersion: 1 as const, scope: next, spaceName: 'Space B', workspacePath: 'C:\\controlled\\b', bindingRevision: 1, setupStatus: 'confirmed' as const };
      const request = vi.fn()
        .mockReturnValueOnce(late.promise)
        .mockReturnValueOnce(Promise.resolve({ ok: true, value: resolvedNext }));
      const store = createSpaceAssistantStore();
      const controller = new IndependentAssistantController({ request } as any, store);
      const abortFirst = new AbortController();
      const firstResult = controller.resolveScope({ browserProfileId: first.browserProfileId, workspacePath: 'C:\\controlled\\a' }, 'default', { signal: abortFirst.signal });
      await Promise.resolve(); // The first IPC request is now pending.
      abortFirst.abort();
      const secondResult = await controller.resolveScope({ browserProfileId: next.browserProfileId, workspacePath: resolvedNext.workspacePath }, 'other', { signal: new AbortController().signal });
      expect(secondResult).toEqual({ ok: true, value: resolvedNext });
      late.resolve({ ok: true, value: { schemaVersion: 1, scope: first, spaceName: 'Stale Space A', workspacePath: 'C:\\controlled\\a', bindingRevision: 1, setupStatus: 'confirmed' } });
      await expect(firstResult).resolves.toMatchObject({ ok: false, error: { code: 'scope_resolution_superseded' } });
      expect(request).toHaveBeenCalledTimes(2);
      expect(store.getState().entries).toEqual({});
      controller.dispose();
    } finally { vi.useRealTimers(); }
  });

  it('aborts the bounded startup retry when its caller leaves the selected Space', async () => {
    vi.useFakeTimers();
    try {
      const selected = scope();
      const request = vi.fn().mockResolvedValue({ ok: false,
        error: { schemaVersion: 1, code: 'sidekick_not_ready', message: 'starting', retryable: true } });
      const controller = new IndependentAssistantController({ request } as any, createSpaceAssistantStore());
      const abort = new AbortController();
      const resolving = controller.resolveScope({ browserProfileId: selected.browserProfileId, workspacePath: null }, 'default', { signal: abort.signal });
      await Promise.resolve(); // Start the bounded backoff after the first refused request.
      abort.abort();
      await expect(resolving).resolves.toMatchObject({ ok: false, error: { code: 'scope_resolution_superseded' } });
      await vi.advanceTimersByTimeAsync(8000);
      expect(request).toHaveBeenCalledTimes(1);
      controller.dispose();
    } finally { vi.useRealTimers(); }
  });

  it('does not skip Assistant completion events when activity observes a newer watermark', () => {
    const s = scope(), store = createSpaceAssistantStore(), initial = snapshot(s);
    const turnId = randomUUID();
    store.getState().acceptSnapshot(s, { ...initial, messages: [{ id: randomUUID(), role: 'assistant',
      content: '', at, pending: true, turnId }], activity: activity(s, 5) });
    store.getState().acceptActivity(s, activity(s, 8));
    expect(store.getState().entries[assistantScopeKey(s)].eventCursor).toBe(0);
    expect(store.getState().applyEvent(event(s, 1))).toBe(true);
    store.getState().acceptSnapshot(s, { ...initial, revision: 2, activity: activity(s, 8) });
    expect(store.getState().entries[assistantScopeKey(s)].busy).toBe(false);
    expect(store.getState().entries[assistantScopeKey(s)].eventCursor).toBe(1);
  });
  it('labels only an evidenced dedicated task-browser session and rejects a different run preview',async()=>{
    const s=scope(),runId=randomUUID(),preview={schemaVersion:1,kind:'preview',runId,leaseId:'controlled-lease',navigationEpoch:1,
      permissionEpoch:1,mimeType:'image/png',base64:'AA==',observedAt:at,partitionKind:'dedicated_agent',accountSource:'explicit_agent_login'};
    const request={schemaVersion:1 as const,operation:'openBrowser' as const,scope:s,payload:{runId}};
    const client=(value:unknown)=>new IndependentAssistantClient({request:async()=>({ok:true,value})});
    expect((await client(preview).request(request)).ok).toBe(true);
    for(const invalid of [{...preview,runId:randomUUID()},{...preview,partitionKind:'ordinary_browser'},
      {...preview,accountSource:'copied_browser_login'},{...preview,partitionKind:undefined}])expect((await client(invalid).request(request)).ok).toBe(false);
    for(const locale of desktopLocaleIds)expect(independentBrowserSessionCopy[locale].trim()).toBeTruthy();
  });
  it('requires the reviewed reset action, scope, revision and impact digest', async () => {
    const s=scope(), digest='a'.repeat(64), conversationId=randomUUID();
    const preview={schemaVersion:1,scope:s,action:'clear_interview_history',expectedRevision:3,conversationId,previewDigest:digest,
      removedInterviewMessages:3,removedConversationMessages:0,removedAnswerRecords:1,clearedCachedStates:2,
      removedProfileFields:[],removedDraftFields:['purpose'],preservedProfileFields:['purpose'],confirmedProfileId:randomUUID(),
      preservedSnapshotCount:2,preservedSnapshotEvidenceCount:1,preservedDefinitions:[],preservedRuns:[],preservedConnections:[],preservedSchedules:[],
      permissionRevision:1,permissionControlEpoch:0,browserBindingRevision:1};
    const request={schemaVersion:1 as const,operation:'assistantReset' as const,scope:s,payload:{mode:'preview' as const,action:'clear_interview_history' as const,expectedRevision:3}};
    const client=(candidate:unknown)=>new IndependentAssistantClient({request:async()=>({ok:true,value:candidate})});
    expect((await client(preview).request(request)).ok).toBe(true);
    for(const invalid of [{...preview,scope:scope()},{...preview,expectedRevision:2},{...preview,action:'reset_assistant'},
      {...preview,removedInterviewMessages:-1},{...preview,removedProfileFields:['permissions']}]) expect((await client(invalid).request(request)).ok).toBe(false);
    const result={schemaVersion:1,scope:s,action:preview.action,revision:4,interviewRevision:2,conversationId,confirmedProfileId:preview.confirmedProfileId,previewDigest:digest};
    const apply={...request,payload:{mode:'apply' as const,action:'clear_interview_history' as const,expectedRevision:3,previewDigest:digest,clientRequestId:randomUUID()}};
    expect((await client(result).request(apply)).ok).toBe(true);
    expect((await client(preview).request(apply)).ok).toBe(false);
    expect((await client({...result,previewDigest:'b'.repeat(64)}).request(apply)).ok).toBe(false);
    expect((await client({...result,revision:3}).request(apply)).ok).toBe(false);
    for(const locale of desktopLocaleIds) for(const value of Object.values(assistantResetCopy[locale])) expect(value.trim()).toBeTruthy();
  });
  it('renders only a real question bound to the waiting run checkpoint and control epoch', () => {
    const s = scope(), runId = randomUUID(), questionIdentity = randomUUID();
    const run = { schemaVersion: 1, scope: s, runId, dispatchId: randomUUID(), definitionId: randomUUID(), definitionRevision: 1,
      state: 'waiting_for_user', stateRevision: 4, reasonCode: null, createdAt: at, updatedAt: at, assistantProfileRevision: null,
      targetSessionId: 'controlled-session', checkpointId: questionIdentity, resultRef: null, controlEpoch: 2,
      counters: { toolCalls: 0, providerRequests: 1, activeSeconds: 0, measuredTokens: null },
      waitingFor: { kind: 'clarification', resourceId: null, expiresAt: null } };
    const question = { schemaVersion: 1 as const, scope: s, runId, questionIdentity, question: 'Which destination do you mean?', expectedRevision: 4, controlEpoch: 2 };
    const candidate = { ...activity(s), runs: [run], clarificationQuestions: [question] };
    expect(isActivitySnapshot(candidate)).toBe(true);
    for (const invalid of [{ ...question, scope: scope() }, { ...question, runId: randomUUID() },
      { ...question, questionIdentity: randomUUID() }, { ...question, expectedRevision: 3 }, { ...question, controlEpoch: 1 }, { ...question, question: ' ' }]) {
      expect(isActivitySnapshot({ ...candidate, clarificationQuestions: [invalid] })).toBe(false);
    }
    expect(isActivitySnapshot({ ...candidate, clarificationQuestions: [question, question] })).toBe(false);
    expect(isActivitySnapshot({ ...candidate, runs: [{ ...run, state: 'running' }] })).toBe(false);
    const progress={schemaVersion:1,scope:s,runId,targetSessionId:run.targetSessionId,progressRevision:2,observedAt:at,runState:'running',
      counters:run.counters,budget:{maxToolCalls:3,maxProviderRequests:2,maxActiveSeconds:60,maxMeasuredTokens:1000,maxSafeReadRetries:2,providerTimeoutSeconds:30,toolTimeoutSeconds:10},
      text:'Genuine output before clarification',textTruncated:false,source:'sdk_output_text'};
    const projected={...candidate,runProgress:[progress]};
    expect(isActivitySnapshot(projected)).toBe(true); // Earlier observed progress may precede the actual waiting state.
    for(const invalid of [{...progress,scope:scope()},{...progress,targetSessionId:'foreign-session'},
      {...progress,runId:randomUUID()},{...progress,text:'x'.repeat(64001)},{...progress,source:'reasoning'},{...progress,progressRevision:0}]) {
      expect(isActivitySnapshot({...projected,runProgress:[invalid]})).toBe(false);
    }
    expect(isActivitySnapshot({...projected,runProgress:[progress,progress]})).toBe(false);
    if(!isActivitySnapshot(projected))throw new Error('Controlled progress fixture invalid');
    const store=createSpaceAssistantStore();store.getState().acceptActivity(s,projected);
    store.getState().acceptActivity(s,{...projected,runProgress:projected.runProgress?.map(p=>({...p,progressRevision:1,text:'Earlier SDK text'}))});
    expect(store.getState().entries[assistantScopeKey(s)].activity?.runProgress?.[0].text).toBe(progress.text);
    const progressEvent={...event(s,1),kind:'run_progress',payload:{runId,targetSessionId:run.targetSessionId,progressRevision:2,observedAt:at,
      runState:'running',counters:run.counters,textPreview:'Real preview',textTruncated:false,source:'sdk_output_text'}};
    expect(isRunEvent(progressEvent)).toBe(true);
    expect(isRunEvent({...progressEvent,payload:{...progressEvent.payload,textPreview:'x'.repeat(513)}})).toBe(false);
    for (const labels of Object.values(clarificationLabels)) {
      const markup = renderToStaticMarkup(React.createElement(IndependentClarification, { waiting: question, labels, onSubmit: async () => {} }));
      expect(markup).toContain(question.question); expect(markup).toContain('maxLength="16000"'); expect(markup).toContain(labels.submit);
      expect(markup).not.toContain('type="radio"');
    }
  });
  it('rejects an answer acknowledgement for a different run', async () => {
    const s = scope(), runId = randomUUID();
    const value = { schemaVersion: 1, scope: s, runId: randomUUID(), dispatchId: randomUUID(), definitionId: randomUUID(), definitionRevision: 1,
      state: 'running', stateRevision: 4, reasonCode: null, createdAt: at, updatedAt: at, assistantProfileRevision: null,
      targetSessionId: null, checkpointId: null, resultRef: null, controlEpoch: 2,
      counters: { toolCalls: 0, providerRequests: 1, activeSeconds: 0, measuredTokens: null }, waitingFor: null };
    const client = new IndependentAssistantClient({ request: async () => ({ ok: true, value }) });
    expect((await client.request({ schemaVersion: 1, operation: 'runControl', scope: s, payload: { command: 'answer', runId,
      questionIdentity: randomUUID(), expectedRevision: 3, controlEpoch: 2, clientRequestId: randomUUID(), answer: 'Controlled answer' } })).ok).toBe(false);
  });
  it('fails closed on malformed or missing independent run records and releases only terminal or explicit legacy ownership', () => {
    const s = scope(); const marker = { runId: randomUUID(), dispatchId: randomUUID(), scope: s, state: 'running', stateRevision: 2, assistantConversationId: randomUUID() };
    expect(isIndependentWriterProtected({ independent: marker })).toBe(true);
    expect(isIndependentWriterProtected({ independent: { runId: marker.runId } })).toBe(true);
    expect(isIndependentWriterProtected({ independent: { ...marker, state: 'completed' } }, null)).toBe(true);
    expect(isIndependentWriterProtected({ independent: { ...marker, state: 'completed' } })).toBe(false);
    expect(isIndependentWriterProtected({ independent: { ...marker, state: 'completed', writerOwner: 'legacy_chat' } })).toBe(false);
    expect(isIndependentOwnedSession({ independent: { ...marker, writerOwner: 'legacy_chat' } })).toBe(false);
    expect(readIndependentSessionRun({ independent: { ...marker, stateRevision: 0 } })).toBe(null);
    expect(isIndependentWriterProtected({})).toBe(false);
  });
  it('does not describe unavailable backend data as an empty activity list', () => {
    const s = scope(); const initial = snapshot(s);
    useSpaceAssistantStore.getState().acceptSnapshot(s, { ...initial, activity: { ...initial.activity, sourceState: 'unavailable' } });
    const controller = new IndependentAssistantController(new IndependentAssistantClient({ request: vi.fn() }));
    const html = renderToStaticMarkup(React.createElement(DesktopI18nProvider, null, React.createElement(SpaceAssistantPanel, {
      selection: { schemaVersion: 1, scope: s, spaceName: 'A', workspacePath: 'C:\\controlled\\a', bindingRevision: 1, setupStatus: 'legacy' }, controller,
      onClose: () => {}, onOpenWorkChat: () => {}, onOpenGlobalOverview: () => {}, onEnterSpace: () => {}, onOpenProviderSettings: () => {}
    })));
    expect(html).toContain('Live-Daten nicht verfügbar'); expect(html).not.toContain('Keine aktive Aufgabe gespeichert');
    controller.dispose(); useSpaceAssistantStore.setState({ entries: {} });
  });
  it('keeps the helper conversation primary and setup optional with activity collapsed', () => {
    const s = scope(), initial = snapshot(s);
    useSpaceAssistantStore.getState().acceptSnapshot(s, initial);
    const serverState = useSpaceAssistantStore.getInitialState();
    const originalServerEntries = serverState.entries;
    serverState.entries = useSpaceAssistantStore.getState().entries;
    const controller = new IndependentAssistantController(new IndependentAssistantClient({ request: vi.fn() }));
    const html = renderToStaticMarkup(React.createElement(DesktopI18nProvider, null, React.createElement(SpaceAssistantPanel, {
      selection: { schemaVersion: 1, scope: s, spaceName: 'Research Space', workspacePath: 'C:\\controlled\\research', bindingRevision: 1, setupStatus: 'legacy' }, controller,
      onClose: () => {}, onOpenWorkChat: () => {}, onOpenGlobalOverview: () => {}, onEnterSpace: () => {}, onOpenProviderSettings: () => {}
    })));
    serverState.entries = originalServerEntries;
    expect(html).toContain('Research Space');
    expect(html).not.toContain('test-provider · contract-test');
    expect(html).not.toContain('space-assistant-tabs');
    expect(html).toMatch(/<details class="space-assistant-setup"/);
    expect(html).toContain('space-assistant-compact-activity');
    expect(html).toContain('space-assistant-quick-actions');
    expect(html).not.toContain('spaceAssistant.connections');
    expect(html).toMatch(/<details class="space-assistant-activity"[^>]*aria-label="[^"]+"/);
    controller.dispose(); useSpaceAssistantStore.setState({ entries: {} });
  });
  it('shows startup as loading instead of a false missing-provider warning', () => {
    const s = scope();
    const controller = new IndependentAssistantController(new IndependentAssistantClient({ request: vi.fn() }));
    const html = renderToStaticMarkup(React.createElement(DesktopI18nProvider, null, React.createElement(SpaceAssistantPanel, {
      selection: { schemaVersion: 1, scope: s, spaceName: 'Loading Space', workspacePath: 'C:\\controlled\\loading', bindingRevision: 1, setupStatus: 'legacy' }, controller,
      onClose: () => {}, onOpenWorkChat: () => {}, onOpenGlobalOverview: () => {}, onEnterSpace: () => {}, onOpenProviderSettings: () => {}
    })));
    expect(html).toContain('Assistant wird gestartet');
    expect(html).not.toContain('space-assistant-not-ready');
    expect(html).toContain('>—</span>');
    controller.dispose(); useSpaceAssistantStore.setState({ entries: {} });
  });
  it('shows one explicit provider setup CTA only after an authoritative snapshot says unavailable', () => {
    const s = scope();
    useSpaceAssistantStore.getState().acceptSnapshot(s, { ...snapshot(s), providerReady: false, provider: '', model: '' });
    const serverState = useSpaceAssistantStore.getInitialState();
    const originalServerEntries = serverState.entries;
    serverState.entries = useSpaceAssistantStore.getState().entries;
    const controller = new IndependentAssistantController(new IndependentAssistantClient({ request: vi.fn() }));
    const html = renderToStaticMarkup(React.createElement(DesktopI18nProvider, null, React.createElement(SpaceAssistantPanel, {
      selection: { schemaVersion: 1, scope: s, spaceName: 'Unconfigured Space', workspacePath: 'C:\\controlled\\unconfigured', bindingRevision: 1, setupStatus: 'legacy' }, controller,
      onClose: () => {}, onOpenWorkChat: () => {}, onOpenGlobalOverview: () => {}, onEnterSpace: () => {}, onOpenProviderSettings: () => {}
    })));
    expect(html.match(/>Verbindung einrichten<\/button>/g) ?? []).toHaveLength(1);
    expect(html).toContain('Modellverbindung fehlt');
    serverState.entries = originalServerEntries; controller.dispose(); useSpaceAssistantStore.setState({ entries: {} });
  });
  it('opens actual pending approvals into the activity view instead of hiding them', () => {
    const s = scope();
    const approval = { schemaVersion: 1 as const, approvalId: randomUUID(), scope: s, actionDigest: 'a'.repeat(64), effect: 'write' as const,
      targetSummary: 'Controlled write', permissionRevision: 1, navigationEpoch: null, connectionRevision: null,
      expiresAt: '2099-01-01T00:00:00Z', state: 'pending' as const, actorRef: null, runId: randomUUID() };
    const initial = snapshot(s);
    useSpaceAssistantStore.getState().acceptSnapshot(s, { ...initial, activity: { ...initial.activity, approvals: [approval] } });
    const serverState = useSpaceAssistantStore.getInitialState();
    const originalServerEntries = serverState.entries;
    serverState.entries = useSpaceAssistantStore.getState().entries;
    const controller = new IndependentAssistantController(new IndependentAssistantClient({ request: vi.fn() }));
    const html = renderToStaticMarkup(React.createElement(DesktopI18nProvider, null, React.createElement(SpaceAssistantPanel, {
      selection: { schemaVersion: 1, scope: s, spaceName: 'Approval Space', workspacePath: 'C:\\controlled\\approval', bindingRevision: 1, setupStatus: 'legacy' }, controller,
      onClose: () => {}, onOpenWorkChat: () => {}, onOpenGlobalOverview: () => {}, onEnterSpace: () => {}, onOpenProviderSettings: () => {}
    })));
    expect(html).toMatch(/class="space-assistant-activity"[^>]*open=""/);
    expect(html).toContain(`data-independent-approval="${approval.approvalId}"`);
    expect(html).toContain('1 Freigabe(n) prüfen');
    serverState.entries = originalServerEntries; controller.dispose(); useSpaceAssistantStore.setState({ entries: {} });
  });
  it('preserves and displays partial native activity without claiming there are no tasks', () => {
    const s = scope(); const initial = snapshot(s);
    const partial = { ...initial.activity, nativeChatObservation: { sourceState: 'partial' as const, observedAt: at } };
    expect(isActivitySnapshot(partial)).toBe(true);
    expect(isActivitySnapshot({ ...partial, nativeChatObservation: { sourceState: 'invented', observedAt: at } })).toBe(false);
    expect(isActivitySnapshot({ ...partial, nativeChatObservation: { sourceState: 'partial', observedAt: 'invalid' } })).toBe(false);
    useSpaceAssistantStore.getState().acceptSnapshot(s, { ...initial, activity: partial });
    // SSR reads Zustand's initial snapshot, not its current client snapshot.
    const serverState = useSpaceAssistantStore.getInitialState();
    const originalServerEntries = serverState.entries;
    serverState.entries = useSpaceAssistantStore.getState().entries;
    const controller = new IndependentAssistantController(new IndependentAssistantClient({ request: vi.fn() }));
    const html = renderToStaticMarkup(React.createElement(DesktopI18nProvider, null, React.createElement(SpaceAssistantPanel, {
      selection: { schemaVersion: 1, scope: s, spaceName: 'A', workspacePath: 'C:\\controlled\\a', bindingRevision: 1, setupStatus: 'legacy' }, controller,
      onClose: () => {}, onOpenWorkChat: () => {}, onOpenGlobalOverview: () => {}, onEnterSpace: () => {}, onOpenProviderSettings: () => {}
    })));
    serverState.entries = originalServerEntries;
    expect(html).toContain('Der Status normaler Chats ist nicht vollständig verfügbar');
    expect(html).not.toContain('Keine aktive Aufgabe gespeichert');
    expect(html).toContain(at);
    controller.dispose(); useSpaceAssistantStore.setState({ entries: {} });
  });
  it('refuses global activity from another browser or backend profile', async () => {
    const s = scope(); const otherBrowser = { ...s, browserProfileId: 'other' };
    const client = new IndependentAssistantClient({ request: async () => ({ ok: true, value: {
      schemaVersion: 1, backendProfileId: s.backendProfileId, observedAt: at, spaces: [{ spaceName: 'Other', scope: otherBrowser, activity: activity(otherBrowser) }]
    } }) });
    expect((await client.request({ schemaVersion: 1, operation: 'globalActivity', scope: s, payload: {} })).ok).toBe(false);
  });
  it('rejects a foreign event before it can affect another loaded Space', async () => {
    const a = scope(), b = scope(); const store = createSpaceAssistantStore();
    store.getState().acceptSnapshot(a, snapshot(a)); store.getState().acceptSnapshot(b, snapshot(b));
    const originalB = store.getState().entries[assistantScopeKey(b)];
    const controller = new IndependentAssistantController(new IndependentAssistantClient({ request: async () => ({ ok: true,
      value: { events: [event(b, 1, { delta: 'foreign' })], snapshot: null, watermark: 1, resyncRequired: false } }) }), store);
    await controller.poll(a);
    expect(store.getState().entries[assistantScopeKey(a)].error?.code).toBe('invalid_response');
    expect(store.getState().entries[assistantScopeKey(b)]).toBe(originalB); controller.dispose();
  });
  it('decodes scoped literal model IDs, orchestration preferences and committed retry acknowledgements', async () => {
    const s = scope(); const availability = { schemaVersion: 1, supported: true, available: true, reasonCode: null, provider: 'custom:local', model: 'gemma4:31b', scope: s, selectionRevision: 2 };
    const value = { schemaVersion: 1, scope: s, revision: 2, model: 'smart-track-high', provider: '', configured: true,
      supportsIndependent: false, reasonCode: 'independent_orchestration_not_supported', groups: [
        { provider: 'Orchestration', provider_id: '', configured: true, models: [{ id: 'smart-track-high', label: 'Smart Track High', supportsIndependent: false,
          nativeAvailability: { schemaVersion: 1, supported: false, available: false, reasonCode: 'independent_unsupported', provider: '', model: 'smart-track-high', scope: s, selectionRevision: 2 } }] },
        { provider: 'Local', provider_id: 'custom:local', configured: true, models: [{ id: 'gemma4:31b', label: 'Local model', supportsIndependent: true, reasoning_efforts: ['low', 'high'], nativeAvailability: availability }] }
      ] };
    const client = new IndependentAssistantClient({ request: async () => ({ ok: true, value }) });
    const result = await client.request({ schemaVersion: 1, operation: 'modelSelection', scope: s, payload: { action: 'get' } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.groups?.[1].models[0].id).toBe('gemma4:31b');
    const acknowledgement = { ...value, groups: undefined };
    const retry = new IndependentAssistantClient({ request: async () => ({ ok: true, value: acknowledgement }) });
    expect((await retry.request({ schemaVersion: 1, operation: 'modelSelection', scope: s, payload: {
      action: 'set', model: 'smart-track-high', provider: '', expectedRevision: 1, clientRequestId: randomUUID()
    } })).ok).toBe(true);
    const wrong = new IndependentAssistantClient({ request: async () => ({ ok: true, value: { ...value, scope: scope() } }) });
    expect((await wrong.request({ schemaVersion: 1, operation: 'modelSelection', scope: s, payload: { action: 'get' } })).ok).toBe(false);
    const badPair = new IndependentAssistantClient({ request: async () => ({ ok: true, value: { ...value, groups: [value.groups[0], { ...value.groups[1], models: [{ ...value.groups[1].models[0],
      nativeAvailability: { ...availability, model: 'foreign-model' } }] }] } }) });
    expect((await badPair.request({ schemaVersion: 1, operation: 'modelSelection', scope: s, payload: { action: 'get' } })).ok).toBe(false);
    const contradictory = new IndependentAssistantClient({ request: async () => ({ ok: true, value: { ...value, groups: [value.groups[0], { ...value.groups[1], models: [{ ...value.groups[1].models[0],
      nativeAvailability: { ...availability, supported: false } }] }] } }) });
    expect((await contradictory.request({ schemaVersion: 1, operation: 'modelSelection', scope: s, payload: { action: 'get' } })).ok).toBe(false);
  });
  it('keeps configured keyless capabilities distinct from credentials, health and execution adapters', async () => {
    const s = scope();
    const connection = { connectionId: 'provider:ollama', providerId: 'ollama', revision: 2, status: 'configured',
      configurationStatus: 'configured', authenticationStatus: 'unknown', healthStatus: 'not_checked', installed: true, adapterAvailable: true,
      setupActions: [{ kind: 'settings', availability: 'available' }] };
    const value = { schemaVersion: 1, scope: s, observedAt: at, entries: [{ capabilityId: 'assistant.conversation', title: 'Conversation',
      supportedTasks: ['conversation'], connectionKind: 'provider', status: 'configured', evidenceKind: 'configuration', connections: [connection] }] };
    const client = new IndependentAssistantClient({ request: async () => ({ ok: true, value }) });
    const result = await client.request({ schemaVersion: 1, operation: 'capabilities', scope: s, payload: {} });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.entries[0].connections?.[0]).toMatchObject({ authenticationStatus: 'unknown', healthStatus: 'not_checked' });
    const invalid = new IndependentAssistantClient({ request: async () => ({ ok: true, value: { ...value,
      entries: [{ ...value.entries[0], connections: [{ ...connection, healthStatus: 'connected' }] }] } }) });
    expect((await invalid.request({ schemaVersion: 1, operation: 'capabilities', scope: s, payload: {} })).ok).toBe(false);
  });
  it('binds setup replies to the requested flow and refuses foreign human forms and OAuth URLs', async () => {
    const s = scope(); const flowId = randomUUID();
    const value = { schemaVersion: 1, scope: s, flowId, connectionId: 'provider:openai-codex', providerId: 'openai-codex',
      setupStatus: 'awaiting_user', revision: 1, createdAt: at, updatedAt: at, expiresAt: at,
      evidence: { source: 'setup_worker', configurationStatus: 'not_configured', authenticationStatus: 'pending', healthStatus: 'not_checked', observedAt: at },
      nextStep: { kind: 'oauth', authorizationUrl: 'https://auth.openai.com/oauth/authorize?controlled=true', requiresUserNavigation: true } };
    const request = { schemaVersion: 1 as const, operation: 'connectionSetup' as const, scope: s, payload: { action: 'poll' as const, flowId } };
    const client = (candidate: unknown) => new IndependentAssistantClient({ request: async () => ({ ok: true, value: candidate }) });
    expect((await client(value).request(request)).ok).toBe(true);
    expect((await client({ ...value, flowId: randomUUID() }).request(request)).ok).toBe(false);
    for (const authorizationUrl of ['https://auth.openai.com.evil.test/oauth/authorize', 'javascript:controlled()',
      'https://untrusted.test/oauth/authorize', 'https://user@auth.openai.com/oauth/authorize', 'https://auth.openai.com/oauth/authorize#controlled']) {
      expect((await client({ ...value, nextStep: { ...value.nextStep, authorizationUrl } }).request(request)).ok).toBe(false);
    }
    expect((await client({ ...value, nextStep: { kind: 'human_form', providerId: 'openai-codex', connectionId: value.connectionId,
      backendProfileId: randomUUID(), expectedConnectionRevision: 1, fields: ['apiKey'] } }).request(request)).ok).toBe(false);
  });
  it('accepts only a redacted acknowledgement for the configured connection', async () => {
    const s = scope(); const value = { schemaVersion: 1, scope: s, connectionId: 'provider:ollama', providerId: 'ollama', applied: true,
      connectionRevision: 2, configurationStatus: 'configured', authenticationStatus: 'unknown', healthStatus: 'not_checked' };
    const request = { schemaVersion: 1 as const, operation: 'connectionConfigure' as const, scope: s, payload: { connectionId: value.connectionId,
      expectedConnectionRevision: 1, clientRequestId: randomUUID(), configuration: { model: 'controlled-model' } } };
    const client = (candidate: unknown) => new IndependentAssistantClient({ request: async () => ({ ok: true, value: candidate }) });
    expect((await client(value).request(request)).ok).toBe(true);
    for (const key of ['apiKey', 'model', 'baseUrl', 'configuration', 'privateHash']) {
      expect((await client({ ...value, [key]: 'controlled' }).request(request)).ok).toBe(false);
    }
    expect((await client({ ...value, connectionId: 'provider:other' }).request(request)).ok).toBe(false);
    expect((await client({ ...value, healthStatus: 'connected' }).request(request)).ok).toBe(false);
  });
  it('rejects mixed definition scopes, missing scheduler projections and mismatched control acknowledgement kinds', async () => {
    const s = scope(); const definitionId = randomUUID(); const { revision: _revision, ...permissionScope } = { revision: 1, browserOrigins: [], networkOrigins: [],
      connectorBindings: [], allowedWorkspaceRoots: [], allowedEffects: [], rawCdp: false, terminal: false, desktop: false };
    const definition = { schemaVersion: 1, scope: s, definitionId, revision: 2, title: 'Controlled task', instruction: 'Read authorized sources', desiredResult: null,
      provider: { provider: 'ollama', model: 'controlled-model', providerConfigRef: 'controlled-digest', configRevision: 1, contextLength: null },
      permissionScope, budget: { maxToolCalls: 3, maxProviderRequests: 2, maxActiveSeconds: 60, maxMeasuredTokens: 1000, maxSafeReadRetries: 2,
        providerTimeoutSeconds: 30, toolTimeoutSeconds: 10 }, profileSnapshotRef: null, connectionBindings: [], activationConversationId: null,
      activationMessageId: null, capabilityRefs: [], enabled: true, schedule: null, createdAt: at };
    const value = { schemaVersion: 1, scope: s, definitions: [definition], schedules: [], observedAt: at };
    const request = { schemaVersion: 1 as const, operation: 'definitions' as const, scope: s, payload: { action: 'list' as const } };
    const client = (candidate: unknown) => new IndependentAssistantClient({ request: async () => ({ ok: true, value: candidate }) });
    expect((await client(value).request(request)).ok).toBe(true);
    expect((await client({ ...value, definitions: [{ ...definition, scope: scope() }] }).request(request)).ok).toBe(false);
    expect((await client({ ...value, schedules: undefined }).request(request)).ok).toBe(false);
    expect((await client({ schemaVersion: 1, scope: s, definition }).request(request)).ok).toBe(false);
    expect((await client({ schemaVersion: 1, scope: s, definition: { ...definition, definitionId: randomUUID() } }).request({ ...request,
      payload: { action: 'disable', definitionId, expectedRevision: 2, clientRequestId: randomUUID() } })).ok).toBe(false);
  });
  it('cancels only its own assistant turn with the current revision and refreshes the final state', async () => {
    const s = scope(); const store = createSpaceAssistantStore(); const initial = snapshot(s, 7); const turnId = randomUUID(), clientRequestId = randomUUID();
    const user = { id: randomUUID(), role: 'user' as const, content: 'hello', at, turnId, clientRequestId };
    const assistant = { id: randomUUID(), role: 'assistant' as const, content: '', at, turnId, pending: true };
    store.getState().acceptSnapshot(s, { ...initial, messages: [user, assistant] });
    const request = vi.fn(async (input: import('../src/renderer/independent-contracts.js').IndependentRequest) => {
      if (input.operation === 'cancelAssistantTurn') return { ok: true, value: { cancelled: true, turnId } };
      if (input.operation === 'assistantSnapshot') return { ok: true, value: { ...initial, revision: 8, messages: [user, { ...assistant, pending: false, content: 'stopped' }] } };
      if (input.operation === 'events') return { ok: true, value: { events: [], snapshot: null, watermark: 0, resyncRequired: false } };
      return { ok: true, value: activity(s) };
    });
    const controller = new IndependentAssistantController(new IndependentAssistantClient({ request }), store);
    await controller.cancelTurn(s);
    expect(request.mock.calls[0][0]).toMatchObject({ operation: 'cancelAssistantTurn', scope: s, payload: { turnId, expectedRevision: 7 } });
    expect(request.mock.calls.some(([input]) => input.operation === 'runControl')).toBe(false);
    expect(store.getState().entries[assistantScopeKey(s)].busy).toBe(false); controller.dispose();
  });
  it('renders structured options and an equal labelled free answer without performing a request', () => {
    const s = scope(); const result = async () => ({ ok: true as const, value: snapshot(s) }); const answer = vi.fn(result);
    const html = renderToStaticMarkup(React.createElement(DesktopI18nProvider, null, React.createElement(SpaceInterview, {
      state: interview(s), busy: false, onAnswer: answer, onReview: result, onContinue: result, onConfirm: result,
      onSkip: result, onEnterSpace: () => {}
    })));
    expect((html.match(/type="radio"/g) ?? []).length).toBe(3);
    expect(html).toContain('Eigene Antwort'); expect(html).toContain('Antwort senden');
    expect(html).toContain('Direkt in den Space'); expect(answer).not.toHaveBeenCalled();
  });
  it('includes every new label in all supported raw locale catalogues', () => {
    for (const locale of desktopLocaleIds) for (const key of spaceAssistantTranslationKeys) expect(desktopLocaleOverrides[locale][key]?.trim()).toBeTruthy();
  });
  it('keeps busy and cancellation tied to a backend pending turn after the start request returns', () => {
    const s = scope(); const store = createSpaceAssistantStore(); const initial = snapshot(s); const turnId = randomUUID(); const clientRequestId = randomUUID();
    store.getState().beginRequest(s, clientRequestId);
    store.getState().acceptSnapshot(s, { ...initial, revision: 2, messages: [
      { id: randomUUID(), role: 'user', content: 'hello', at, turnId, clientRequestId },
      { id: randomUUID(), role: 'assistant', content: '', at, turnId, pending: true }
    ] });
    store.getState().finishRequest(s, clientRequestId);
    expect(store.getState().entries[assistantScopeKey(s)].busy).toBe(true);
    expect(store.getState().entries[assistantScopeKey(s)].turnId).toBe(turnId);
    store.getState().acceptSnapshot(s, { ...initial, revision: 3 });
    expect(store.getState().entries[assistantScopeKey(s)].busy).toBe(false);
  });
  it('accepts three or four unique options and always retains equal free text', () => {
    const question = interview(scope()).question!;
    expect(isInterviewQuestion(question)).toBe(true);
    expect(isInterviewQuestion({ ...question, options: question.options.slice(0, 2) })).toBe(false);
    expect(isInterviewQuestion({ ...question, allowFreeText: false })).toBe(false);
    expect(isInterviewQuestion({ ...question, options: [question.options[0], question.options[0], question.options[2]] })).toBe(false);
  });
  it('rejects preference patches carrying permissions or task starts', () => {
    expect(isProfilePatch({ purpose: 'Help with research', requestedHelp: ['Compare sources'] })).toBe(true);
    expect(isProfilePatch({ purpose: 'Help', permissions: ['send'] })).toBe(false);
    expect(isProfilePatch({ enabled: true })).toBe(false);
  });
  it('rejects nested foreign scopes, duplicate message IDs and malformed versions', () => {
    const s = scope(); const good = snapshot(s);
    expect(isAssistantSnapshot(good)).toBe(true);
    expect(isAssistantSnapshot({ ...good, activity: activity(scope()) })).toBe(false);
    expect(isAssistantSnapshot({ ...good, schemaVersion: 2 })).toBe(false);
    const message = { id: randomUUID(), role: 'user', content: 'hello', at };
    expect(isAssistantSnapshot({ ...good, messages: [message, message] })).toBe(false);
  });
  it('returns safe invalid-response errors instead of trusting foreign snapshots', async () => {
    const s = scope(); const client = new IndependentAssistantClient({ request: async () => ({ ok: true, value: snapshot(scope()) }) });
    const result = await client.request({ schemaVersion: 1, operation: 'assistantSnapshot', scope: s, payload: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_response');
  });
  it('keeps composers, busy states and late responses in their original Space', async () => {
    const a = scope(); const b = scope(); const store = createSpaceAssistantStore(); const delayed = deferred<unknown>();
    const client = new IndependentAssistantClient({ request: async request => request.scope?.spaceId === a.spaceId ? delayed.promise : { ok: true, value: snapshot(b) } });
    const controller = new IndependentAssistantController(client, store);
    store.getState().setComposer(a, 'A draft'); store.getState().setComposer(b, 'B draft');
    const pending = controller.load(a);
    expect(store.getState().entries[assistantScopeKey(a)].busy).toBe(true);
    await controller.load(b);
    delayed.resolve({ ok: true, value: snapshot(a) }); await pending;
    expect(store.getState().entries[assistantScopeKey(a)].composer).toBe('A draft');
    expect(store.getState().entries[assistantScopeKey(b)].composer).toBe('B draft');
    expect(store.getState().entries[assistantScopeKey(b)].snapshot?.scope).toEqual(b);
    controller.dispose();
  });
  it('coalesces an identical request and refuses a reused ID for another instruction', async () => {
    const s = scope(); const store = createSpaceAssistantStore(); const initial = snapshot(s); store.getState().acceptSnapshot(s, initial);
    const delayed = deferred<unknown>(); const request = vi.fn(async () => delayed.promise);
    const controller = new IndependentAssistantController(new IndependentAssistantClient({ request }), store);
    const id = randomUUID(); const one = controller.send(s, 'Do this', [], id); const two = controller.send(s, 'Do this', [], id);
    const other = await controller.send(s, 'Do something else', [], id);
    expect(other.ok).toBe(false); if (!other.ok) expect(other.error.code).toBe('idempotency_conflict');
    expect(request).toHaveBeenCalledTimes(1);
    delayed.resolve({ ok: true, value: { ...initial, revision: 2 } });
    expect((await one).ok).toBe(true); expect((await two).ok).toBe(true); controller.dispose();
  });
  it('does not let a stale snapshot replace corrected answers', () => {
    const s = scope(); const store = createSpaceAssistantStore(); const current = { ...snapshot(s, 4), interview: interview(s) };
    store.getState().acceptSnapshot(s, current);
    expect(store.getState().acceptSnapshot(s, snapshot(s, 3))).toBe(false);
    expect(store.getState().entries[assistantScopeKey(s)].snapshot).toBe(current);
  });
  it('detects sequence gaps, deduplicates events and resyncs from the authoritative watermark', () => {
    const s = scope(); const store = createSpaceAssistantStore(); store.getState().ensure(s);
    expect(store.getState().applyEvent(event(s, 2))).toBe(false);
    expect(store.getState().entries[assistantScopeKey(s)].needsResync).toBe(true);
    store.getState().acceptActivity(s, activity(s, 8), true);
    expect(store.getState().applyEvent(event(s, 9))).toBe(true);
    expect(store.getState().applyEvent(event(s, 9))).toBe(false);
    expect(store.getState().entries[assistantScopeKey(s)].eventCursor).toBe(9);
  });
  it('marks actual cached activity stale while retaining its last observed timestamp', async () => {
    const s = scope(); const store = createSpaceAssistantStore(); store.getState().acceptSnapshot(s, snapshot(s));
    const controller = new IndependentAssistantController(new IndependentAssistantClient({ request: async () => { throw new Error('private provider error'); } }), store);
    await controller.poll(s); const entry = store.getState().entries[assistantScopeKey(s)];
    expect(entry.activity?.sourceState).toBe('stale'); expect(entry.activity?.observedAt).toBe(at);
    expect(entry.error?.message).not.toContain('private provider error'); controller.dispose();
  });
  it('unsubscribes observation without sending any cancellation or task control', () => {
    vi.useFakeTimers(); const s = scope(); const calls: string[] = [];
    const controller = new IndependentAssistantController(new IndependentAssistantClient({ request: async request => {
      calls.push(request.operation); return { ok: true, value: { events: [], snapshot: null, watermark: 0, resyncRequired: false } };
    } }), createSpaceAssistantStore());
    const release = controller.observe(s); release(); release(); controller.dispose();
    expect(calls).not.toContain('cancelAssistantTurn'); expect(calls).not.toContain('runControl');
    vi.useRealTimers();
  });
});
