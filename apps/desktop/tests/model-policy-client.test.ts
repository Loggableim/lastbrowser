import { describe,expect,it,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { canExecuteAutomaticPolicy,isModelSelectionPolicy,readModelPolicyResponse,readObservedDecisionFromSession,readObservedDecisionFromStreamEvent,readStreamEventIdentity,resolveActiveObservedDecision,requestModelPolicy,type ActualDecisionRecord,type ModelPolicyRequest } from '../src/renderer/model-policy-client.js';
import { modelPolicyCopy } from '../src/renderer/i18n/model-policy-copy.js';
import { ModelPolicyControls } from '../src/renderer/components/ModelPolicyControls.js';
const scope={backendProfileId:randomUUID(),spaceId:randomUUID(),browserProfileId:'browser-a'},sessionId='native-chat';
const policy={schemaVersion:1,scope,sessionId,revision:0,mode:'fixed',allowedModels:[],orchestrator:null,cloudPolicy:'deny',allowedCloudDataClasses:[],
  budget:{requestsPerMinute:6,tokensPerMinute:100000,maxConcurrent:1,maxCostMicrousdPerMinute:null,maxOutputTokens:2048},updatedAt:'2026-10-04T00:00:00Z'};
const response={schemaVersion:1,scope,sessionId,policy,status:[],executionAvailability:{available:false,sealedWorker:false,managedCallAuthorizer:false,reasonCode:'native_auto_execution_adapter_required'}};
describe('actual native AUTO selection policy',()=>{
  it('accepts an actual initial fixed policy without inventing models or quota',()=>{
    expect(isModelSelectionPolicy(policy)).toBe(true);expect(readModelPolicyResponse(response,scope,sessionId).policy.revision).toBe(0);
    expect(canExecuteAutomaticPolicy(readModelPolicyResponse(response,scope,sessionId))).toBe(false);
    expect(canExecuteAutomaticPolicy(readModelPolicyResponse({...response,executionAvailability:{available:true,sealedWorker:true,managedCallAuthorizer:false}},scope,sessionId))).toBe(true);
    expect(canExecuteAutomaticPolicy(readModelPolicyResponse({...response,executionAvailability:{available:true,sealedWorker:false,managedCallAuthorizer:true}},scope,sessionId))).toBe(false);
  });
  it('rejects foreign scopes/chats, pseudo-models, unchecked orchestrators, cloud deny leaks and invalid budgets',()=>{
    const pair={provider:'actual-provider',model:'actual-model'};
    for(const invalid of [{...response,scope:{...scope,spaceId:randomUUID()}},{...response,sessionId:'foreign'},
      {...response,policy:{...policy,scope:{...scope,spaceId:randomUUID()}}},{...response,policy:{...policy,mode:'auto'}},
      {...response,policy:{...policy,mode:'auto',allowedModels:[{...pair,model:'auto'}]}},
      {...response,policy:{...policy,allowedModels:[pair,pair]}},{...response,policy:{...policy,orchestrator:pair}},
      {...response,policy:{...policy,allowedCloudDataClasses:['private']}},{...response,policy:{...policy,budget:{...policy.budget,maxConcurrent:7}}},
      {...response,executionAvailability:{available:'yes',sealedWorker:true}}])expect(()=>readModelPolicyResponse(invalid,scope,sessionId)).toThrow('model_policy_response_invalid');
  });
  it('preserves nullable and stale quota evidence shared by an actual provider alias',()=>{
    const snapshot={schemaVersion:1,provider:'observed-alias',groupKey:'shared-origin-group',observedAt:policy.updatedAt,observedRequestId:null,source:'response_headers',
      buckets:[{resource:'tokens',limit:100,remaining:null,resetAt:null}],retryAt:null,actionRequired:false,statusCode:200,stale:true};
    const parsed=readModelPolicyResponse({...response,status:[{provider:'actual-provider',snapshots:[snapshot]}]},scope,sessionId);
    expect(parsed.status[0].snapshots[0].buckets[0].remaining).toBeNull();
    expect(parsed.status[0].snapshots[0].stale).toBe(true);expect(parsed.status[0].snapshots[0].provider).toBe('observed-alias');
  });
  it('sends only purpose fields with actual CAS/request identity and known candidate pairs',async()=>{
    const request:ModelPolicyRequest={action:'set',sessionId,workspacePath:'C:/controlled/a',browserProfileId:scope.browserProfileId,expectedRevision:0,clientRequestId:randomUUID(),
      draft:{mode:'auto',allowedModels:[{provider:'actual-provider',model:'actual-model'}],orchestrator:null,cloudPolicy:'deny',allowedCloudDataClasses:[],budget:policy.budget}};
    const transport=vi.fn(async(_request:ModelPolicyRequest)=>({...response,policy:{...policy,...request.draft,revision:1}}));
    await requestModelPolicy(transport,request,scope);expect(transport.mock.calls[0][0]).toEqual(request);expect(transport.mock.calls[0][0]).not.toHaveProperty('spaceScope');
    await expect(requestModelPolicy(transport,{...request,browserProfileId:'foreign'},scope)).rejects.toThrow('model_policy_scope_invalid');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('provides all actual policy/quota labels in each of the eight desktop languages',()=>{
    const en=modelPolicyCopy('en');for(const locale of ['en','de','es','fr','it','pt-BR','ru','ja'] as const){
      const translated=modelPolicyCopy(locale);expect(Object.keys(translated)).toEqual(Object.keys(en));expect(Object.values(translated).every(value=>typeof value==='string'&&value.length>0)).toBe(true);
    }
    expect(modelPolicyCopy('ja').cloud).toBe('クラウドの使用');
    expect(modelPolicyCopy('de').actualDecision).toBe('Tatsächliche Entscheidung');
    expect(modelPolicyCopy('ja').actualDecision).toBe('実際の決定');
    expect(modelPolicyCopy('de').lastCompletedTurn).toBe('Letzter abgeschlossener Turn');
    expect(modelPolicyCopy('ja').lastCompletedTurn).toBe('最後に完了したターン');
  });
  it('separates configured preference from actual decision and displays decision unknown when not observed', () => {
    const autoPolicy = {
      ...policy,
      mode: 'auto' as const,
      allowedModels: [{ provider: 'prov-a', model: 'model-a' }, { provider: 'prov-b', model: 'model-b' }],
      orchestrator: { provider: 'prov-a', model: 'model-a' },
    };
    const autoResponse = { ...response, policy: autoPolicy };
    const htmlEn = renderToStaticMarkup(React.createElement(ModelPolicyControls, {
      value: autoResponse,
      candidates: [{ pair: { provider: 'prov-a', model: 'model-a' }, label: 'model-a', providerLabel: 'prov-a', available: true }],
      pending: false,
      error: '',
      open: true,
      onOpen: () => {},
      onSave: () => {},
      onRefresh: () => {},
      locale: 'en',
    }));
    expect(htmlEn).toContain('model-policy-decision');
    expect(htmlEn).toContain('<strong>Actual decision</strong>: Decision not yet known');
    expect(htmlEn).toContain('<strong>Configured preference</strong>: prov-a · model-a (Configured orchestrator)');
    expect(htmlEn).not.toContain('<strong>Actual decision</strong>: prov-a · model-a');

    const htmlDe = renderToStaticMarkup(React.createElement(ModelPolicyControls, {
      value: autoResponse,
      candidates: [{ pair: { provider: 'prov-a', model: 'model-a' }, label: 'model-a', providerLabel: 'prov-a', available: true }],
      pending: false,
      error: '',
      open: true,
      onOpen: () => {},
      onSave: () => {},
      onRefresh: () => {},
      locale: 'de',
    }));
    expect(htmlDe).toContain('<strong>Tatsächliche Entscheidung</strong>: Entscheidung noch nicht bekannt');
    expect(htmlDe).toContain('<strong>Konfigurierte Präferenz</strong>: prov-a · model-a (Konfigurierter Orchestrator)');

    const autoPolicyNoOrch = { ...autoPolicy, orchestrator: null };
    const htmlNoOrch = renderToStaticMarkup(React.createElement(ModelPolicyControls, {
      value: { ...response, policy: autoPolicyNoOrch },
      candidates: [],
      pending: false,
      error: '',
      open: true,
      onOpen: () => {},
      onSave: () => {},
      onRefresh: () => {},
      locale: 'en',
    }));
    expect(htmlNoOrch).toContain('<strong>Actual decision</strong>: Decision not yet known');
    expect(htmlNoOrch).toContain('<strong>Configured preference</strong>: prov-a · model-a (Configured candidate)');
  });

  it('renders actual decision when observed without confounding with configured preference', () => {
    const autoPolicy = {
      ...policy,
      mode: 'auto' as const,
      allowedModels: [{ provider: 'prov-a', model: 'model-a' }, { provider: 'prov-b', model: 'model-b' }],
      orchestrator: { provider: 'prov-a', model: 'model-a' },
    };
    const autoResponse = { ...response, policy: autoPolicy };
    const observed: ActualDecisionRecord = {
      provider: 'prov-observed',
      model: 'model-observed',
      sessionId,
      turnId: 'stream-turn-1',
      observedAt: 1728000000000,
      source: 'provider_evidence',
    };
    const html = renderToStaticMarkup(React.createElement(ModelPolicyControls, {
      value: autoResponse,
      candidates: [],
      pending: false,
      error: '',
      open: true,
      onOpen: () => {},
      onSave: () => {},
      onRefresh: () => {},
      locale: 'en',
      observedDecision: observed,
    }));
    expect(html).toContain('<strong>Actual decision</strong>: prov-observed · model-observed');
    expect(html).toContain('<strong>Configured preference</strong>: prov-a · model-a (Configured orchestrator)');
  });

  it('rejects stream events or sessions with missing session ID (fehlende Session-ID)', () => {
    const eventWithoutSessionId = {
      streamId: 'stream-turn-1',
      event: 'done',
      data: {
        provider_evidence: { provider_id: 'prov-stream', model_id: 'model-stream', successful_chat: true },
      },
    };
    expect(readObservedDecisionFromStreamEvent(eventWithoutSessionId, sessionId, 'stream-turn-1')).toBeNull();
    expect(readObservedDecisionFromStreamEvent(eventWithoutSessionId, '', 'stream-turn-1')).toBeNull();
    expect(readObservedDecisionFromStreamEvent(eventWithoutSessionId, '   ', 'stream-turn-1')).toBeNull();

    const sessionWithoutSessionId = {
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello', provider_evidence: { provider_id: 'prov-a', model_id: 'model-a', successful_chat: true } },
      ],
    };
    expect(readObservedDecisionFromSession(sessionWithoutSessionId, sessionId)).toBeNull();
  });

  it('rejects stream events with missing stream or turn ID (fehlende Stream-/Turn-ID)', () => {
    const eventWithoutStreamId = {
      event: 'done',
      data: {
        session: { session_id: sessionId },
        provider_evidence: { provider_id: 'prov-stream', model_id: 'model-stream', successful_chat: true },
      },
    };
    expect(readObservedDecisionFromStreamEvent(eventWithoutStreamId, sessionId, 'stream-turn-1')).toBeNull();

    const eventWithEmptyStreamId = {
      ...eventWithoutStreamId,
      streamId: '',
    };
    expect(readObservedDecisionFromStreamEvent(eventWithEmptyStreamId, sessionId, 'stream-turn-1')).toBeNull();

    const validStreamEvent = {
      streamId: 'stream-turn-1',
      event: 'done',
      data: {
        session: { session_id: sessionId },
        provider_evidence: { provider_id: 'prov-stream', model_id: 'model-stream', successful_chat: true },
      },
    };
    expect(readObservedDecisionFromStreamEvent(validStreamEvent, sessionId, null)).toBeNull();
    expect(readObservedDecisionFromStreamEvent(validStreamEvent, sessionId, '')).toBeNull();
    expect(readObservedDecisionFromStreamEvent(validStreamEvent, sessionId, '   ')).toBeNull();
  });

  it('rejects stream events and sessions from foreign sessions (fremde Session)', () => {
    const foreignSessionEvent = {
      streamId: 'stream-turn-1',
      event: 'done',
      data: {
        provider_evidence: { provider_id: 'prov-stream', model_id: 'model-stream', successful_chat: true },
        session: { session_id: 'foreign-session' },
      },
    };
    expect(readObservedDecisionFromStreamEvent(foreignSessionEvent, sessionId, 'stream-turn-1')).toBeNull();

    const foreignRootEvent = {
      sessionId: 'foreign-session',
      streamId: 'stream-turn-1',
      event: 'done',
      data: { provider_evidence: { provider_id: 'prov-stream', model_id: 'model-stream', successful_chat: true } },
    };
    expect(readObservedDecisionFromStreamEvent(foreignRootEvent, sessionId, 'stream-turn-1')).toBeNull();

    const foreignSession = {
      session_id: 'foreign-session',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello', provider_evidence: { provider_id: 'prov-a', model_id: 'model-a', successful_chat: true } },
      ],
    };
    expect(readObservedDecisionFromSession(foreignSession, sessionId)).toBeNull();
  });

  it('rejects stale previous streams of the same session (verspäteter vorheriger Stream derselben Session)', () => {
    const staleStreamEvent = {
      streamId: 'stream-turn-old',
      event: 'done',
      data: {
        session: { session_id: sessionId },
        provider_evidence: { provider_id: 'prov-stream', model_id: 'model-stream', successful_chat: true },
      },
    };
    expect(readObservedDecisionFromStreamEvent(staleStreamEvent, sessionId, 'stream-turn-new')).toBeNull();
  });

  it('handles historical assistant turn with changed model configuration (historische Assistantantwort plus geänderte Modellkonfiguration)', () => {
    const historicalSession = {
      session_id: sessionId,
      messages: [
        { role: 'user', content: 'initial query' },
        {
          role: 'assistant',
          content: 'historical answer',
          pending: false,
          provider_evidence: { provider_id: 'prov-hist', model_id: 'model-hist', successful_chat: true },
        },
      ],
    };

    const rehydrated = readObservedDecisionFromSession(historicalSession, sessionId);
    expect(rehydrated).not.toBeNull();
    expect(rehydrated?.provider).toBe('prov-hist');
    expect(rehydrated?.model).toBe('model-hist');
    expect(rehydrated?.isHistorical).toBe(true);

    const changedPolicy = {
      ...policy,
      mode: 'auto' as const,
      allowedModels: [{ provider: 'prov-new', model: 'model-new' }],
      orchestrator: { provider: 'prov-new', model: 'model-new' },
    };
    const changedResponse = { ...response, policy: changedPolicy };

    // English
    const htmlEn = renderToStaticMarkup(React.createElement(ModelPolicyControls, {
      value: changedResponse,
      candidates: [],
      pending: false,
      error: '',
      open: true,
      onOpen: () => {},
      onSave: () => {},
      onRefresh: () => {},
      locale: 'en',
      observedDecision: rehydrated,
    }));
    expect(htmlEn).toContain('<strong>Actual decision</strong>: prov-hist · model-hist (Last completed turn)');
    expect(htmlEn).toContain('<strong>Configured preference</strong>: prov-new · model-new (Configured orchestrator)');

    // German
    const htmlDe = renderToStaticMarkup(React.createElement(ModelPolicyControls, {
      value: changedResponse,
      candidates: [],
      pending: false,
      error: '',
      open: true,
      onOpen: () => {},
      onSave: () => {},
      onRefresh: () => {},
      locale: 'de',
      observedDecision: rehydrated,
    }));
    expect(htmlDe).toContain('<strong>Tatsächliche Entscheidung</strong>: prov-hist · model-hist (Letzter abgeschlossener Turn)');
    expect(htmlDe).toContain('<strong>Konfigurierte Präferenz</strong>: prov-new · model-new (Konfigurierter Orchestrator)');

    // Japanese
    const htmlJa = renderToStaticMarkup(React.createElement(ModelPolicyControls, {
      value: changedResponse,
      candidates: [],
      pending: false,
      error: '',
      open: true,
      onOpen: () => {},
      onSave: () => {},
      onRefresh: () => {},
      locale: 'ja',
      observedDecision: rehydrated,
    }));
    expect(htmlJa).toContain('<strong>実際の決定</strong>: prov-hist · model-hist (最後に完了したターン)');
    expect(htmlJa).toContain('<strong>設定された優先設定</strong>: prov-new · model-new (設定されたオーケストレーター)');
  });

  it('prevents stale decision from appearing as current decision of a new, aborted or failed turn (neuer abgebrochener/fehlgeschlagener Turn)', () => {
    const turn1Decision: ActualDecisionRecord = {
      provider: 'prov-1',
      model: 'model-1',
      sessionId,
      turnId: 'stream-1',
      observedAt: 1728000000000,
      source: 'provider_evidence',
    };

    const sessionWithTurn2 = {
      session_id: sessionId,
      messages: [
        { role: 'user', content: 'query 1' },
        { role: 'assistant', content: 'answer 1', pending: false, provider_evidence: { provider_id: 'prov-1', model_id: 'model-1', successful_chat: true } },
        { role: 'user', content: 'query 2 (aborted)' },
      ],
    };

    // While turn 2 is running, the decision cannot be claimed by turn 2
    const runningDecision = resolveActiveObservedDecision({
      sessionId,
      activeSession: sessionWithTurn2,
      observedDecision: turn1Decision,
      running: true,
    });
    expect(runningDecision).not.toBeNull();
    expect(runningDecision?.provider).toBe('prov-1');
    expect(runningDecision?.isHistorical).toBe(true);

    // After turn 2 failed or was aborted
    const failedDecision = resolveActiveObservedDecision({
      sessionId,
      activeSession: sessionWithTurn2,
      observedDecision: turn1Decision,
      running: false,
      hasError: true,
    });
    expect(failedDecision).not.toBeNull();
    expect(failedDecision?.provider).toBe('prov-1');
    expect(failedDecision?.isHistorical).toBe(true);

    // In ModelPolicyControls, it is explicitly shown as Last completed turn
    const autoPolicy = { ...policy, mode: 'auto' as const, allowedModels: [{ provider: 'prov-1', model: 'model-1' }] };
    const htmlFailed = renderToStaticMarkup(React.createElement(ModelPolicyControls, {
      value: { ...response, policy: autoPolicy },
      candidates: [],
      pending: false,
      error: '',
      open: true,
      onOpen: () => {},
      onSave: () => {},
      onRefresh: () => {},
      locale: 'de',
      observedDecision: failedDecision,
    }));
    expect(htmlFailed).toContain('<strong>Tatsächliche Entscheidung</strong>: prov-1 · model-1 (Letzter abgeschlossener Turn)');

    // If an initial session turn fails before any completed assistant turn exists
    const initialFailedSession = {
      session_id: sessionId,
      messages: [
        { role: 'user', content: 'initial query' },
        { role: 'assistant', content: '', interrupted: true, error: true },
      ],
    };
    const initialFailedDecision = resolveActiveObservedDecision({
      sessionId,
      activeSession: initialFailedSession,
      observedDecision: null,
      running: false,
      hasError: true,
    });
    expect(initialFailedDecision).toBeNull();

    const htmlInitialFailed = renderToStaticMarkup(React.createElement(ModelPolicyControls, {
      value: { ...response, policy: autoPolicy },
      candidates: [],
      pending: false,
      error: '',
      open: true,
      onOpen: () => {},
      onSave: () => {},
      onRefresh: () => {},
      locale: 'de',
      observedDecision: initialFailedDecision,
    }));
    expect(htmlInitialFailed).toContain('<strong>Tatsächliche Entscheidung</strong>: Entscheidung noch nicht bekannt');
  });

  it('accepts only authoritative turn-bound execution proof from stream and session (gültiger turngebundener Ausführungsbeleg)', () => {
    // 1. Session message with provider_evidence
    const sessionWithProviderEvidence = {
      session_id: sessionId,
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello', pending: false, provider_evidence: { provider_id: 'prov-pe', model_id: 'model-pe', successful_chat: true } },
      ],
    };
    const decisionPe = readObservedDecisionFromSession(sessionWithProviderEvidence, sessionId);
    expect(decisionPe).not.toBeNull();
    expect(decisionPe?.provider).toBe('prov-pe');
    expect(decisionPe?.model).toBe('model-pe');
    expect(decisionPe?.isHistorical).toBe(true);

    // 2. Session message with _gatewayRouting
    const sessionWithGatewayRouting = {
      session_id: sessionId,
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello', pending: false, _gatewayRouting: { used_provider: 'prov-gw', used_model: 'model-gw' } },
      ],
    };
    const decisionGw = readObservedDecisionFromSession(sessionWithGatewayRouting, sessionId);
    expect(decisionGw).not.toBeNull();
    expect(decisionGw?.provider).toBe('prov-gw');
    expect(decisionGw?.model).toBe('model-gw');

    // 3. Stream event requiring successful_chat === true
    const unsuccessfulStreamEvent = {
      streamId: 'stream-turn-1',
      event: 'done',
      data: {
        session: { session_id: sessionId },
        provider_evidence: { provider_id: 'prov-stream', model_id: 'model-stream', successful_chat: false },
      },
    };
    expect(readObservedDecisionFromStreamEvent(unsuccessfulStreamEvent, sessionId, 'stream-turn-1')).toBeNull();

    const successfulStreamEvent = {
      streamId: 'stream-turn-1',
      event: 'done',
      data: {
        session: { session_id: sessionId },
        provider_evidence: { provider_id: 'prov-stream', model_id: 'model-stream', successful_chat: true },
      },
    };
    const decisionStream = readObservedDecisionFromStreamEvent(successfulStreamEvent, sessionId, 'stream-turn-1');
    expect(decisionStream).not.toBeNull();
    expect(decisionStream?.provider).toBe('prov-stream');
    expect(decisionStream?.model).toBe('model-stream');
    expect(decisionStream?.isHistorical).toBeUndefined();
  });

  it('returns null and displays decision unknown on reload without stored execution proof (Reload ohne gespeicherten Ausführungsbeleg)', () => {
    // Session has model / model_provider and completed assistant messages, but NO turn-bound execution proof
    const sessionWithoutExecutionProof = {
      session_id: sessionId,
      model: 'unverified-model',
      model_provider: 'unverified-provider',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hello there without evidence', pending: false },
      ],
    };
    expect(readObservedDecisionFromSession(sessionWithoutExecutionProof, sessionId)).toBeNull();

    const autoPolicy = {
      ...policy,
      mode: 'auto' as const,
      allowedModels: [{ provider: 'prov-a', model: 'model-a' }],
      orchestrator: { provider: 'prov-a', model: 'model-a' },
    };
    const autoResponse = { ...response, policy: autoPolicy };

    const htmlReload = renderToStaticMarkup(React.createElement(ModelPolicyControls, {
      value: autoResponse,
      candidates: [],
      pending: false,
      error: '',
      open: true,
      onOpen: () => {},
      onSave: () => {},
      onRefresh: () => {},
      locale: 'de',
      observedDecision: readObservedDecisionFromSession(sessionWithoutExecutionProof, sessionId),
    }));
    expect(htmlReload).toContain('<strong>Tatsächliche Entscheidung</strong>: Entscheidung noch nicht bekannt');
    expect(htmlReload).toContain('<strong>Konfigurierte Präferenz</strong>: prov-a · model-a (Konfigurierter Orchestrator)');
    expect(htmlReload).not.toContain('unverified-model');
  });

  it('rejects stored evidence without explicit positive success confirmation (fehlender Erfolgsbeleg bei gespeicherter Evidence)', () => {
    // Missing successful_chat field entirely
    const sessionMissingSuccess = {
      session_id: sessionId,
      messages: [
        { role: 'user', content: 'test' },
        { role: 'assistant', content: 'reply', pending: false, provider_evidence: { provider_id: 'prov-a', model_id: 'model-a' } },
      ],
    };
    expect(readObservedDecisionFromSession(sessionMissingSuccess, sessionId)).toBeNull();

    // successful_chat set to null or false
    const sessionNullSuccess = {
      session_id: sessionId,
      messages: [
        { role: 'user', content: 'test' },
        { role: 'assistant', content: 'reply', pending: false, provider_evidence: { provider_id: 'prov-a', model_id: 'model-a', successful_chat: null } },
      ],
    };
    expect(readObservedDecisionFromSession(sessionNullSuccess, sessionId)).toBeNull();

    const sessionFalseSuccess = {
      session_id: sessionId,
      messages: [
        { role: 'user', content: 'test' },
        { role: 'assistant', content: 'reply', pending: false, execution_evidence: { provider: 'prov-a', model: 'model-a', successful_chat: false } },
      ],
    };
    expect(readObservedDecisionFromSession(sessionFalseSuccess, sessionId)).toBeNull();
  });

  it('rejects failed or incomplete gateway turns from stream and session (fehlgeschlagener Gateway-Turn)', () => {
    // Gateway routing with status 'failed'
    const failedGatewayEvent = {
      streamId: 'stream-gw-fail',
      event: 'done',
      data: {
        session: { session_id: sessionId },
        gateway_routing: { used_provider: 'prov-gw', used_model: 'model-gw', status: 'failed', error: 'Rate limit exceeded' },
      },
    };
    expect(readObservedDecisionFromStreamEvent(failedGatewayEvent, sessionId, 'stream-gw-fail')).toBeNull();

    // Stream with top-level data.error or interrupted
    const interruptedEvent = {
      streamId: 'stream-gw-int',
      event: 'done',
      data: {
        session: { session_id: sessionId },
        interrupted: true,
        gateway_routing: { used_provider: 'prov-gw', used_model: 'model-gw' },
      },
    };
    expect(readObservedDecisionFromStreamEvent(interruptedEvent, sessionId, 'stream-gw-int')).toBeNull();

    // Gateway routing where all attempts failed
    const allAttemptsFailedEvent = {
      streamId: 'stream-gw-attempts',
      event: 'done',
      data: {
        session: { session_id: sessionId },
        gateway_routing: {
          used_provider: 'prov-gw',
          used_model: 'model-gw',
          routing: [
            { provider: 'prov-gw', model: 'model-gw', status: 'error', error: 'Model overloaded' },
            { provider: 'prov-fallback', model: 'model-fb', status: 'failed', error: 'Budget exhausted' },
          ],
        },
      },
    };
    expect(readObservedDecisionFromStreamEvent(allAttemptsFailedEvent, sessionId, 'stream-gw-attempts')).toBeNull();

    // Session with failed gateway routing
    const sessionWithFailedGateway = {
      session_id: sessionId,
      messages: [
        { role: 'user', content: 'test' },
        { role: 'assistant', content: 'reply', pending: false, _gatewayRouting: { used_provider: 'prov-gw', used_model: 'model-gw', status: 'error', error: 'Fatal backend error' } },
      ],
    };
    expect(readObservedDecisionFromSession(sessionWithFailedGateway, sessionId)).toBeNull();
  });

  it('recognizes valid completion even when active_stream_id was reset before done (gültiger Abschluss trotz zurückgesetztem active_stream_id)', () => {
    // Simulate real stream sequence:
    // 1. Session had active_stream_id = 'stream-run-42' during turn
    // 2. Chunks arrived, tracking streamId = 'stream-run-42' for sessionId
    const lastStreamIdBySession: Record<string, string> = {};
    const turnStreamId = 'stream-run-42';
    lastStreamIdBySession[sessionId] = turnStreamId;

    // 3. Backend cleared s.active_stream_id = None before emitting done_payload
    const activeSessionAfterReset = {
      session_id: sessionId,
      active_stream_id: null,
      messages: [
        { role: 'user', content: 'Calculate pi' },
      ],
    };

    // 4. When done arrives:
    const doneEvent = {
      streamId: turnStreamId,
      event: 'done',
      data: {
        session: activeSessionAfterReset,
        provider_evidence: { provider_id: 'prov-actual', model_id: 'model-actual', successful_chat: true },
      },
    };

    // Expected stream ID resolved via fallback tracking when active_stream_id is null:
    const expectedStreamId = activeSessionAfterReset.active_stream_id || lastStreamIdBySession[sessionId];
    expect(expectedStreamId).toBe(turnStreamId);

    const decision = readObservedDecisionFromStreamEvent(doneEvent, sessionId, expectedStreamId);
    expect(decision).not.toBeNull();
    expect(decision?.provider).toBe('prov-actual');
    expect(decision?.model).toBe('model-actual');
    expect(decision?.turnId).toBe(turnStreamId);
  });

  it('rejects delayed completion of a previous stream when a new turn is active (verspäteten Abschluss eines früheren Streams)', () => {
    const turn1StreamId = 'stream-turn-1';
    const turn2StreamId = 'stream-turn-2';

    // Turn 2 is now active
    const lastStreamIdBySession: Record<string, string> = { [sessionId]: turn2StreamId };
    const activeSessionTurn2 = {
      session_id: sessionId,
      active_stream_id: turn2StreamId,
      messages: [{ role: 'user', content: 'Turn 2' }],
    };

    // Delayed done event from Turn 1 arrives
    const staleTurn1DoneEvent = {
      streamId: turn1StreamId,
      event: 'done',
      data: {
        session: { session_id: sessionId },
        provider_evidence: { provider_id: 'prov-stale', model_id: 'model-stale', successful_chat: true },
      },
    };

    const expectedStreamId = activeSessionTurn2.active_stream_id || lastStreamIdBySession[sessionId];
    expect(expectedStreamId).toBe(turn2StreamId);

    // Stale event is rejected because streamId !== expectedStreamId
    const staleDecision = readObservedDecisionFromStreamEvent(staleTurn1DoneEvent, sessionId, expectedStreamId);
    expect(staleDecision).toBeNull();
  });

  it('isolates observed decisions across sessions during chat switch at turn completion (Wechsel zu einem anderen Chat während des Abschlusses)', () => {
    const sessionA = 'chat-session-a';
    const sessionB = 'chat-session-b';
    const streamA = 'stream-chat-a';

    const lastStreamIdBySession: Record<string, string> = { [sessionA]: streamA };
    const observedDecisions: Record<string, ActualDecisionRecord> = {};

    // User is currently viewing Session B
    const activeSessionId = sessionB;
    const activeSessionB = {
      session_id: sessionB,
      active_stream_id: null,
      messages: [{ role: 'user', content: 'Hello in B' }, { role: 'assistant', content: 'Answer in B' }],
    };

    // Done event arrives for Session A while Session B is active in the view
    const doneEventA = {
      streamId: streamA,
      event: 'done',
      data: {
        session: { session_id: sessionA },
        provider_evidence: { provider_id: 'prov-session-a', model_id: 'model-session-a', successful_chat: true },
      },
    };

    // Event resolves for its own eventSessionId (sessionA)
    const eventSessionId = sessionA;
    const expectedStreamIdA = lastStreamIdBySession[eventSessionId];
    const decisionA = readObservedDecisionFromStreamEvent(doneEventA, eventSessionId, expectedStreamIdA);
    expect(decisionA).not.toBeNull();
    expect(decisionA?.sessionId).toBe(sessionA);
    expect(decisionA?.provider).toBe('prov-session-a');

    // Store in observedDecisions under sessionA
    observedDecisions[decisionA!.sessionId] = decisionA!;

    // 1. Session B view MUST NOT see Session A's decision
    const activeDecisionForViewB = resolveActiveObservedDecision({
      sessionId: activeSessionId,
      activeSession: activeSessionB,
      observedDecision: observedDecisions[activeSessionId] ?? null,
      running: false,
    });
    expect(activeDecisionForViewB).toBeNull();

    // 2. When user switches to Session A, Session A's decision is correctly displayed
    const activeSessionA = {
      session_id: sessionA,
      active_stream_id: null,
      messages: [{ role: 'user', content: 'Hello in A' }, { role: 'assistant', content: 'Answer in A' }],
    };
    const activeDecisionForViewA = resolveActiveObservedDecision({
      sessionId: sessionA,
      activeSession: activeSessionA,
      observedDecision: observedDecisions[sessionA] ?? null,
      running: false,
    });
    expect(activeDecisionForViewA).not.toBeNull();
    expect(activeDecisionForViewA?.provider).toBe('prov-session-a');
    expect(activeDecisionForViewA?.model).toBe('model-session-a');
  });

  describe('readStreamEventIdentity', () => {
    it('extracts valid session and stream IDs from various authentic payload shapes', () => {
      // Shape 1: data.session.session_id + payload.streamId
      expect(readStreamEventIdentity({
        streamId: 'stream-1',
        data: { session: { session_id: 'session-1' } },
      })).toEqual({ sessionId: 'session-1', streamId: 'stream-1' });

      // Shape 2: nativeContext.sessionId + nativeContext.streamId
      expect(readStreamEventIdentity({
        nativeContext: { sessionId: 'session-2', streamId: 'stream-2' },
      })).toEqual({ sessionId: 'session-2', streamId: 'stream-2' });

      // Shape 3: top-level sessionId + streamId
      expect(readStreamEventIdentity({
        sessionId: 'session-3',
        streamId: 'stream-3',
      })).toEqual({ sessionId: 'session-3', streamId: 'stream-3' });
    });

    it('rejects payloads with missing or invalid identity fields without UI borrowing', () => {
      expect(readStreamEventIdentity(null)).toBeNull();
      expect(readStreamEventIdentity('invalid')).toBeNull();
      expect(readStreamEventIdentity({})).toBeNull();
      expect(readStreamEventIdentity({ streamId: 'stream-only' })).toBeNull();
      expect(readStreamEventIdentity({ sessionId: 'session-only' })).toBeNull();
      expect(readStreamEventIdentity({ streamId: '   ', sessionId: 'session-1' })).toBeNull();
      expect(readStreamEventIdentity({ streamId: 'stream-1', sessionId: '   ' })).toBeNull();
    });
  });

  it('handles the concrete stream race: Stream 2 begins -> delayed token 1 -> delayed done 1 -> valid done 2', () => {
    const sessionRace = 'race-session-id';
    const stream1 = 'stream-1';
    const stream2 = 'stream-2';

    // 1. Authoritative turn binding: Stream 2 has started
    const authoritativeStreamIdBySession: Record<string, string> = { [sessionRace]: stream2 };
    const observedDecisions: Record<string, ActualDecisionRecord> = {};

    // 2. Delayed token chunk arrives from Stream 1
    const delayedTokenStream1 = {
      streamId: stream1,
      event: 'token',
      data: {
        session: { session_id: sessionRace },
        delta: 'some late token from turn 1',
      },
    };
    const tokenIdentity = readStreamEventIdentity(delayedTokenStream1);
    expect(tokenIdentity).toEqual({ sessionId: sessionRace, streamId: stream1 });

    // Non-done events (tokens) DO NOT update authoritativeStreamIdBySession!
    expect(authoritativeStreamIdBySession[sessionRace]).toBe(stream2);

    // 3. Delayed done event arrives from Stream 1
    const delayedDoneStream1 = {
      streamId: stream1,
      event: 'done',
      data: {
        session: { session_id: sessionRace },
        provider_evidence: { provider_id: 'prov-stale', model_id: 'model-stale', successful_chat: true },
      },
    };
    const doneIdentity1 = readStreamEventIdentity(delayedDoneStream1);
    expect(doneIdentity1).toEqual({ sessionId: sessionRace, streamId: stream1 });

    const expectedStreamIdForDone1 = authoritativeStreamIdBySession[doneIdentity1!.sessionId];
    expect(expectedStreamIdForDone1).toBe(stream2);

    // Delayed done from Stream 1 is rejected because streamId ('stream-1') !== expectedStreamId ('stream-2')
    const decisionFromDelayedDone1 = readObservedDecisionFromStreamEvent(delayedDoneStream1, doneIdentity1!.sessionId, expectedStreamIdForDone1);
    expect(decisionFromDelayedDone1).toBeNull();

    // 4. Valid done event arrives from Stream 2
    const validDoneStream2 = {
      streamId: stream2,
      event: 'done',
      data: {
        session: { session_id: sessionRace },
        provider_evidence: { provider_id: 'prov-2', model_id: 'model-2', successful_chat: true },
      },
    };
    const doneIdentity2 = readStreamEventIdentity(validDoneStream2);
    expect(doneIdentity2).toEqual({ sessionId: sessionRace, streamId: stream2 });

    const expectedStreamIdForDone2 = authoritativeStreamIdBySession[doneIdentity2!.sessionId];
    expect(expectedStreamIdForDone2).toBe(stream2);

    // Valid done from Stream 2 is accepted
    const decisionFromValidDone2 = readObservedDecisionFromStreamEvent(validDoneStream2, doneIdentity2!.sessionId, expectedStreamIdForDone2);
    expect(decisionFromValidDone2).not.toBeNull();
    expect(decisionFromValidDone2?.provider).toBe('prov-2');
    expect(decisionFromValidDone2?.model).toBe('model-2');
    expect(decisionFromValidDone2?.turnId).toBe(stream2);

    observedDecisions[sessionRace] = decisionFromValidDone2!;
    expect(observedDecisions[sessionRace].model).toBe('model-2');
  });

  it('handles the concrete stream race with an intermediate chat switch: Stream 2 starts -> switch to Chat B -> delayed token 1 -> delayed done 1 -> valid done 2 -> switch back to Chat A', () => {
    const sessionA = 'chat-session-a';
    const sessionB = 'chat-session-b';
    const stream1A = 'stream-1-a';
    const stream2A = 'stream-2-a';

    // Stream 2 starts for Session A
    const authoritativeStreamIdBySession: Record<string, string> = { [sessionA]: stream2A };
    const observedDecisions: Record<string, ActualDecisionRecord> = {};

    // User switches to Session B
    let currentViewSessionId = sessionB;
    const activeSessionB = {
      session_id: sessionB,
      active_stream_id: null,
      messages: [{ role: 'user', content: 'Chatting in B' }],
    };

    // Delayed token from Stream 1 of Session A arrives while user is in Session B
    const delayedTokenA1 = {
      streamId: stream1A,
      event: 'token',
      data: { session: { session_id: sessionA } },
    };
    const tokenIdentityA1 = readStreamEventIdentity(delayedTokenA1);
    expect(tokenIdentityA1?.sessionId).toBe(sessionA);
    // Authoritative stream for A is NOT mutated
    expect(authoritativeStreamIdBySession[sessionA]).toBe(stream2A);

    // Delayed done from Stream 1 of Session A arrives
    const delayedDoneA1 = {
      streamId: stream1A,
      event: 'done',
      data: {
        session: { session_id: sessionA },
        provider_evidence: { provider_id: 'prov-a1', model_id: 'model-a1', successful_chat: true },
      },
    };
    const doneIdentityA1 = readStreamEventIdentity(delayedDoneA1);
    expect(doneIdentityA1?.sessionId).toBe(sessionA);

    const expectedStreamForDoneA1 = authoritativeStreamIdBySession[doneIdentityA1!.sessionId];
    const decisionA1 = readObservedDecisionFromStreamEvent(delayedDoneA1, doneIdentityA1!.sessionId, expectedStreamForDoneA1);
    expect(decisionA1).toBeNull(); // Rejected!

    // Valid done from Stream 2 of Session A arrives
    const validDoneA2 = {
      streamId: stream2A,
      event: 'done',
      data: {
        session: { session_id: sessionA },
        provider_evidence: { provider_id: 'prov-a2', model_id: 'model-a2', successful_chat: true },
      },
    };
    const doneIdentityA2 = readStreamEventIdentity(validDoneA2);
    expect(doneIdentityA2?.sessionId).toBe(sessionA);

    const expectedStreamForDoneA2 = authoritativeStreamIdBySession[doneIdentityA2!.sessionId];
    const decisionA2 = readObservedDecisionFromStreamEvent(validDoneA2, doneIdentityA2!.sessionId, expectedStreamForDoneA2);
    expect(decisionA2).not.toBeNull();
    expect(decisionA2?.model).toBe('model-a2');

    // Stored under sessionA
    observedDecisions[decisionA2!.sessionId] = decisionA2!;

    // Current view in Session B must NOT show Session A's decision
    const viewBDecision = resolveActiveObservedDecision({
      sessionId: currentViewSessionId,
      activeSession: activeSessionB,
      observedDecision: observedDecisions[currentViewSessionId] ?? null,
      running: false,
    });
    expect(viewBDecision).toBeNull();

    // User switches back to Session A
    currentViewSessionId = sessionA;
    const activeSessionA = {
      session_id: sessionA,
      active_stream_id: null,
      messages: [{ role: 'user', content: 'Turn 2 question' }, { role: 'assistant', content: 'Turn 2 answer' }],
    };
    const viewADecision = resolveActiveObservedDecision({
      sessionId: currentViewSessionId,
      activeSession: activeSessionA,
      observedDecision: observedDecisions[currentViewSessionId] ?? null,
      running: false,
    });
    expect(viewADecision).not.toBeNull();
    expect(viewADecision?.provider).toBe('prov-a2');
    expect(viewADecision?.model).toBe('model-a2');
    expect(viewADecision?.turnId).toBe(stream2A);
  });
});


