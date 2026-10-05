import type {
  ActivitySnapshot, GlobalActivitySnapshot, IndependentWaitingQuestion, RunProgress, AssistantResetPreview, AssistantResetResult, AssistantControlResolution, AssistantControlResponse, ApiError, ApprovalView, NativeChatApproval, IndependentRunApproval, AssistantMessage, AssistantSnapshot, BrowserLeaseView, BrowserPreview, NativeBrowserPreview, NativeBrowserTakeover, CapabilityBinding,
  CapabilityCatalogEntry, CapabilityCatalog, SpaceBindingsView, EventRecovery, IndependentBridge, IndependentOperation, IndependentOperations,
  IndependentRequest, IndependentResult, IndependentScope, IndependentTransport, InterviewAnswerRecord,
  InterviewQuestion, InterviewReview, InterviewState, PermissionView, ProfilePatch, ResolvedAssistantScope,
  BackendProfileEntry, BackendProfilesResponse, ProfileBindingEntry, ProfileBindingsResponse,
  RunEvent, RunView, AgentDefinitionView, DefinitionResult, ConnectionSetupFlow, ConnectionConfigureAck, BrowserAccountFlow, CapabilityConnection, ScopedModelSelection, ScopedModelEntry, ScopedModelGroup, ScopedModelProvider, LocalAiBootstrapStatus, SpaceAssistantProfile, TaskDispatchView, UnderstoodTopic
} from './independent-contracts.js';
import { sameAssistantScope } from './independent-contracts.js';
import { isSafePluginStartUrl } from './plugin-browser-navigation.js';
import { isLocalAiHardwareInventory,isLocalAiResponse } from './local-ai-contracts.js';
import { isLocalAiRuntimeRequest,isLocalAiRuntimeResponse,runtimeResponseMatches } from './local-ai-runtime-contracts.js';

type Guard<T> = (value: unknown) => value is T;
export function isIndependentRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const text = (value: unknown): value is string => typeof value === 'string';
const ref = (value: unknown): value is string => text(value) && value.length > 0 && value.length <= 1024 && !/[\u0000-\u001f]/.test(value);
const uuid = (value: unknown): value is string => text(value) && /^(?:[a-f\d]{32}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.test(value);
const sameUuid = (left: unknown, right: unknown): boolean => uuid(left) && uuid(right)
  && left.replaceAll('-', '').toLowerCase() === right.replaceAll('-', '').toLowerCase();
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const integer = (value: unknown): value is number => number(value) && Number.isSafeInteger(value);
const revision = (value: unknown): value is number => integer(value) && value >= 1;
const timestamp = (value: unknown): value is string => text(value) && Number.isFinite(Date.parse(value)) && /(?:Z|\+00:00)$/.test(value);
const boolean = (value: unknown): value is boolean => typeof value === 'boolean';
function list<T>(value: unknown, guard: Guard<T>): value is readonly T[];
function list(value: unknown, guard: (item: unknown) => boolean): boolean;
function list(value: unknown, guard: (item: unknown) => boolean): boolean { return Array.isArray(value) && value.length <= 20000 && value.every(guard); }
function nullable<T>(value: unknown, guard: Guard<T>): value is T | null;
function nullable(value: unknown, guard: (item: unknown) => boolean): boolean;
function nullable(value: unknown, guard: (item: unknown) => boolean): boolean { return value === null || guard(value); }
function optional<T>(value: unknown, guard: Guard<T>): value is T | undefined;
function optional(value: unknown, guard: (item: unknown) => boolean): boolean;
function optional(value: unknown, guard: (item: unknown) => boolean): boolean { return value === undefined || guard(value); }
function oneOf<const T extends readonly string[]>(value: unknown, choices: T): value is T[number] { return text(value) && choices.some(choice => choice === value); }
const topics = ['purpose', 'help', 'style', 'context', 'connections', 'background_work'] as const;
const runStates = ['queued', 'running', 'waiting_for_user', 'waiting_for_approval', 'pausing', 'paused', 'cancelling', 'cancelled', 'completed', 'failed', 'interrupted'] as const;
const effect = (value: unknown): value is 'read' | 'write' | 'send' | 'delete' | 'purchase' => oneOf(value, ['read', 'write', 'send', 'delete', 'purchase']);
const versioned = (value: unknown): value is Record<string, unknown> & { schemaVersion: 1 } => isIndependentRecord(value) && value.schemaVersion === 1;
const unique = (values: readonly string[]) => new Set(values).size === values.length;

export function isIndependentScope(value: unknown): value is IndependentScope {
  return isIndependentRecord(value) && uuid(value.backendProfileId) && uuid(value.spaceId)
    && text(value.browserProfileId) && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(value.browserProfileId);
}
export function isProfilePatch(value: unknown): value is ProfilePatch {
  return isIndependentRecord(value) && Object.keys(value).every(key => ['purpose', 'requestedHelp', 'workingStyle', 'backgroundPreferences'].includes(key))
    && optional(value.purpose, v => nullable(v, text)) && optional(value.requestedHelp, v => nullable(v, v => list(v, text)))
    && optional(value.workingStyle, v => nullable(v, text)) && optional(value.backgroundPreferences, v => nullable(v, text));
}
const isUnderstood: Guard<UnderstoodTopic> = (value): value is UnderstoodTopic => isIndependentRecord(value) && oneOf(value.topic, topics) && text(value.summary) && list(value.answerIds, uuid);
export function isInterviewQuestion(value: unknown): value is InterviewQuestion {
  if (!versioned(value) || value.kind !== 'question' || !revision(value.basedOnRevision) || !oneOf(value.topic, topics)
    || !ref(value.prompt) || value.allowFreeText !== true || !oneOf(value.selection, ['single', 'multiple'])
    || !list(value.understood, isUnderstood) || !isProfilePatch(value.profilePatch)
    || !optional(value.explanation, v => nullable(v, text)) || !Array.isArray(value.options) || value.options.length < 3 || value.options.length > 4) return false;
  const optionIds: string[] = [];
  for (const option of value.options) {
    if (!isIndependentRecord(option) || !ref(option.id) || !ref(option.label) || !optional(option.description, v => nullable(v, text))) return false;
    optionIds.push(option.id);
  }
  return unique(optionIds);
}
export function isInterviewReview(value: unknown): value is InterviewReview {
  return versioned(value) && value.kind === 'review' && revision(value.basedOnRevision) && text(value.summary) && value.summary.length > 0
    && list(value.missingTopics, v => oneOf(v, topics)) && oneOf(value.completionReason, ['user_finished', 'sufficient_context'])
    && list(value.understood, isUnderstood) && isProfilePatch(value.profilePatch) && !('options' in value);
}
const isAnswer: Guard<InterviewAnswerRecord> = (value): value is InterviewAnswerRecord => versioned(value) && uuid(value.answerId) && uuid(value.questionId)
  && oneOf(value.topic, topics) && isInterviewQuestion(value.question) && list(value.selectedOptionIds, ref)
  && unique(value.selectedOptionIds) && nullable(value.freeText, text) && text(value.text) && uuid(value.clientRequestId)
  && nullable(value.replacesAnswerId, uuid) && timestamp(value.at);
export function isInterviewState(value: unknown): value is InterviewState {
  return versioned(value) && uuid(value.interviewId) && isIndependentScope(value.scope) && revision(value.revision)
    && oneOf(value.stage, ['interview', 'review', 'confirmed', 'skipped']) && text(value.locale)
    && nullable(value.questionId, uuid) && nullable(value.question, isInterviewQuestion)
    && ((value.questionId === null) === (value.question === null)) && list(value.answers, isAnswer)
    && isProfilePatch(value.draft) && list(value.understood, isUnderstood) && list(value.unresolvedTopics, v => oneOf(v, topics))
    && nullable(value.review, isInterviewReview) && nullable(value.modelError, text) && boolean(value.manualFallback);
}
const isProfile: Guard<SpaceAssistantProfile> = (value): value is SpaceAssistantProfile => versioned(value) && uuid(value.profileId) && isIndependentScope(value.scope)
  && revision(value.revision) && oneOf(value.status, ['confirmed', 'skipped']) && isProfilePatch(value.values)
  && timestamp(value.recordedAt) && nullable(value.confirmedAt, timestamp) && list(value.sourceAnswerIds, uuid)
  && (value.status !== 'confirmed' || value.confirmedAt !== null);
const isMessage: Guard<AssistantMessage> = (value): value is AssistantMessage => isIndependentRecord(value) && ref(value.id) && oneOf(value.role, ['user', 'assistant', 'system'])
  && text(value.content) && timestamp(value.at) && ['turnId', 'clientRequestId', 'dispatchId', 'runId', 'targetSessionId', 'deliveryKey'].every(key => optional(value[key], ref))
  && optional(value.pending, boolean) && optional(value.controlResolution, isControlResolution)
  && optional(value.controlStatus, v => oneOf(v, controlStatuses)) && optional(value.controlResults, v => list(v, isRunView))
  && (value.controlResolution !== undefined || value.controlStatus === undefined && value.controlResults === undefined);
const controlStatuses = ['choose_target', 'completed', 'rejected', 'unknown', 'unsupported_manager'] as const;
const isControlResolution: Guard<AssistantControlResolution> = (v): v is AssistantControlResolution => isIndependentRecord(v)
  && oneOf(v.kind, ['conversation', 'clarification', 'proposal', 'unavailable']) && isIndependentScope(v.scope)
  && uuid(v.humanTurnId) && uuid(v.sourceMessageId) && text(v.originalText) && v.originalText.trim().length > 0
  && nullable(v.command, value => oneOf(value, ['cancel', 'pause', 'resume'])) && ref(v.reason)
  && text(v.requestDigest) && /^[a-f0-9]{64}$/.test(v.requestDigest)
  && list(v.candidates, c => isIndependentRecord(c) && uuid(c.runId) && uuid(c.dispatchId) && text(c.title)
    && oneOf(c.state, runStates) && revision(c.expectedRevision) && integer(c.controlEpoch))
  && Array.isArray(v.candidates) && unique(v.candidates.map(c => String(c.runId)))
  && (v.kind !== 'clarification' && v.kind !== 'proposal' || v.command !== null && v.candidates.length > 0);
export function isRunView(value: unknown): value is RunView {
  return versioned(value) && uuid(value.runId) && uuid(value.dispatchId) && isIndependentScope(value.scope) && uuid(value.definitionId)
    && revision(value.definitionRevision) && oneOf(value.state, runStates) && revision(value.stateRevision) && nullable(value.reasonCode, text)
    && timestamp(value.createdAt) && timestamp(value.updatedAt) && nullable(value.assistantProfileRevision, revision)
    && nullable(value.targetSessionId, ref) && nullable(value.checkpointId, uuid) && nullable(value.resultRef, text) && integer(value.controlEpoch)
    && isIndependentRecord(value.counters) && integer(value.counters.toolCalls) && integer(value.counters.providerRequests)
    && number(value.counters.activeSeconds) && nullable(value.counters.measuredTokens, integer)
    && nullable(value.waitingFor, v => isIndependentRecord(v) && oneOf(v.kind, ['login', 'approval', 'resource', 'clarification'])
      && nullable(v.resourceId, ref) && nullable(v.expiresAt, timestamp));
}
export function isTaskDispatchView(value: unknown): value is TaskDispatchView {
  return versioned(value) && uuid(value.dispatchId) && isIndependentScope(value.scope) && oneOf(value.state, ['prepared', 'materializing', 'started', 'failed'])
    && ref(value.assistantConversationId) && ref(value.sourceMessageId) && nullable(value.targetSessionId, ref)
    && nullable(value.runId, uuid) && nullable(value.reasonCode, text) && timestamp(value.createdAt) && timestamp(value.updatedAt);
}
export const isApproval: Guard<ApprovalView> = (value): value is ApprovalView => {
  if(!versioned(value)||!uuid(value.approvalId)||!isIndependentScope(value.scope)||!text(value.actionDigest)||!/^[a-f\d]{64}$/.test(value.actionDigest)
    ||!effect(value.effect)||!text(value.targetSummary)||!revision(value.permissionRevision)||!nullable(value.navigationEpoch,integer)||!nullable(value.connectionRevision,revision)
    ||!timestamp(value.expiresAt)||!oneOf(value.state,['pending','approved','consumed','revoked','expired'])||!nullable(value.actorRef,text))return false;
  if(value.ownerKind==='native_chat')return value.runId===null&&ref(value.sessionId)&&ref(value.streamId)&&ref(value.writerGeneration)&&ref(value.writerLeaseId)
    &&uuid(value.actionId)&&integer(value.controlEpoch)&&isIndependentRecord(value.ownerRef)
    &&value.ownerRef.sessionId===value.sessionId&&value.ownerRef.streamId===value.streamId&&value.ownerRef.writerGeneration===value.writerGeneration&&value.ownerRef.writerLeaseId===value.writerLeaseId
    &&Object.keys(value.ownerRef).every(key=>['sessionId','streamId','writerGeneration','writerLeaseId'].includes(key))
    &&isIndependentRecord(value.connectionRevisions)&&Object.values(value.connectionRevisions).every(integer)
    &&[value.leaseId,value.targetId,value.mainGeneration,value.runnerGeneration].every(item=>optional(item,field=>nullable(field,ref)));
  return uuid(value.runId)&&optional(value.ownerKind,item=>item==='independent_run')&&optional(value.ownerRef,item=>nullable(item,ref));
};
const isRunApproval:Guard<IndependentRunApproval>=(value):value is IndependentRunApproval=>isApproval(value)&&value.ownerKind!=='native_chat';
const isNativeApproval:Guard<NativeChatApproval>=(value):value is NativeChatApproval=>isApproval(value)&&value.ownerKind==='native_chat';
export function isActivitySnapshot(value: unknown): value is ActivitySnapshot {
  if (!versioned(value) || !isIndependentScope(value.scope) || !timestamp(value.observedAt) || !integer(value.watermark)
    || !oneOf(value.sourceState, ['live', 'stale', 'unavailable']) || !nullable(value.lastSuccessfulAt, timestamp)
    || !list(value.runs, isRunView) || !list(value.dispatches, isTaskDispatchView) || !list(value.approvals, isRunApproval)
    || !optional(value.nativeApprovals,rows=>list(rows,isNativeApproval))
    || !optional(value.nativeChatObservation, row => nullable(row, item => isIndependentRecord(item)
      && oneOf(item.sourceState, ['live', 'partial', 'unavailable']) && timestamp(item.observedAt)))
    || !list(value.activeChats, v => isIndependentRecord(v) && ref(v.sessionId) && optional(v.dispatchId, ref) && timestamp(v.observedAt)
      && optional(v.activeStreamId,ref) && optional(v.sourceActuality,item=>item==='live') && optional(v.state,item=>item==='streaming')
      && optional(v.title,text) && optional(v.model,item=>nullable(item,text)) && optional(v.modelProvider,item=>nullable(item,text))
      && ((v.activeStreamId===undefined&&v.sourceActuality===undefined)||(ref(v.activeStreamId)&&v.sourceActuality==='live')))
    || !list(value.schedules, v => isIndependentRecord(v) && uuid(v.definitionId) && boolean(v.enabled)
      && optional(v.scheduleRevision, revision) && optional(v.nextRunAt, v => nullable(v, timestamp)))
    || !optional(value.clarificationQuestions, v => list(v, isWaitingQuestion)) || !optional(value.runProgress, v => list(v, isRunProgress))) return false;
  const scope = value.scope;
  const runs = value.runs;
  return [...value.runs, ...value.dispatches, ...value.approvals,...(value.nativeApprovals??[])].every(item => sameAssistantScope(item.scope, scope))
    && unique([...value.approvals,...(value.nativeApprovals??[])].map(approval=>approval.approvalId))
    && unique((value.clarificationQuestions ?? []).map(question => question.runId))
    && unique((value.runProgress ?? []).map(progress => progress.runId))
    && (value.runProgress ?? []).every(progress => sameAssistantScope(progress.scope, scope)
      && runs.some(run => run.runId === progress.runId && run.targetSessionId === progress.targetSessionId))
    && (value.clarificationQuestions ?? []).every(question => {
      const run = runs.find(item => item.runId === question.runId);
      return sameAssistantScope(question.scope, scope) && run?.state === 'waiting_for_user' && run.waitingFor?.kind === 'clarification'
        && run.checkpointId === question.questionIdentity && run.stateRevision === question.expectedRevision && run.controlEpoch === question.controlEpoch;
    });
}
const isWaitingQuestion: Guard<IndependentWaitingQuestion> = (v): v is IndependentWaitingQuestion => versioned(v)
  && isIndependentScope(v.scope) && uuid(v.runId) && uuid(v.questionIdentity) && text(v.question)
  && v.question.trim().length > 0 && v.question.length <= 8000 && revision(v.expectedRevision) && integer(v.controlEpoch);
const isRunCounters = (v: unknown): v is RunView['counters'] => isIndependentRecord(v) && integer(v.toolCalls) && integer(v.providerRequests)
  && number(v.activeSeconds) && nullable(v.measuredTokens, integer);
const isRunProgress: Guard<RunProgress> = (v): v is RunProgress => versioned(v) && uuid(v.runId) && isIndependentScope(v.scope)
  && nullable(v.targetSessionId, ref) && revision(v.progressRevision) && timestamp(v.observedAt) && oneOf(v.runState, runStates)
  && isRunCounters(v.counters) && isDefinitionBudget(v.budget) && text(v.text) && v.text.length <= 64000 && boolean(v.textTruncated) && v.source === 'sdk_output_text';
export function isAssistantSnapshot(value: unknown): value is AssistantSnapshot {
  if (!versioned(value) || !isIndependentScope(value.scope) || !ref(value.conversationId) || !revision(value.revision)
    || !list(value.messages, isMessage) || !unique(value.messages.map(message => message.id))
    || !nullable(value.interview, isInterviewState) || !nullable(value.confirmedProfile, isProfile)
    || !boolean(value.providerReady) || !text(value.provider) || !text(value.model) || !isActivitySnapshot(value.activity)) return false;
  const scope=value.scope, messages=value.messages;
  return sameAssistantScope(value.activity.scope, scope)
    && (value.interview === null || sameAssistantScope(value.interview.scope, value.scope))
    && (value.confirmedProfile === null || sameAssistantScope(value.confirmedProfile.scope, value.scope))
    && messages.every(message => {
      const resolution = message.controlResolution;
      if (!resolution) return true;
      return message.role === 'assistant' && sameAssistantScope(resolution.scope, scope) && message.turnId === resolution.humanTurnId
        && messages.some(source => source.id === resolution.sourceMessageId && source.role === 'user'
          && source.turnId === resolution.humanTurnId && source.content === resolution.originalText)
        && (message.controlResults ?? []).every(run => sameAssistantScope(run.scope, scope)
          && resolution.candidates.some(candidate => candidate.runId === run.runId && candidate.dispatchId === run.dispatchId));
    });
}
const isControlResponse: Guard<AssistantControlResponse> = (v): v is AssistantControlResponse => {
  if(!isIndependentRecord(v))return false;
  const outcome=v.controlOutcome;
  if(!isAssistantSnapshot(v) || !isIndependentRecord(outcome) || !oneOf(outcome.status,controlStatuses) || !list(outcome.results,isRunView))return false;
  return outcome.results.every(run=>sameAssistantScope(run.scope,v.scope));
};
const isResolvedScope: Guard<ResolvedAssistantScope> = (value): value is ResolvedAssistantScope => versioned(value) && isIndependentScope(value.scope)
  && text(value.spaceName) && nullable(value.workspacePath, text) && revision(value.bindingRevision) && oneOf(value.setupStatus, ['legacy', 'in_progress', 'confirmed', 'skipped'])
  && optional(value.backendProfileName, v => text(v) && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(v));
export const isBackendProfileEntry: Guard<BackendProfileEntry> = (v): v is BackendProfileEntry =>
  isIndependentRecord(v) && text(v.name) && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(v.name) && boolean(v.isDefault);
export const isBackendProfilesResponse: Guard<BackendProfilesResponse> = (v): v is BackendProfilesResponse =>
  versioned(v) && list(v.profiles, isBackendProfileEntry);
export const isProfileBindingEntry: Guard<ProfileBindingEntry> = (v): v is ProfileBindingEntry =>
  isIndependentRecord(v) && isIndependentScope(v.scope) && text(v.browserProfileId) && text(v.backendProfileName)
  && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(v.backendProfileName) && nullable(v.workspacePath, text) && text(v.spaceName)
  && text(v.partitionKey) && revision(v.bindingRevision);
export const isProfileBindingsResponse: Guard<ProfileBindingsResponse> = (v): v is ProfileBindingsResponse =>
  versioned(v) && list(v.bindings, isProfileBindingEntry);
export function normalizedBrowserAccountOrigin(value:string):string|null {
  try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password||url.search||url.hash||url.pathname!=='/')return null;
    return url.origin;}catch{return null;}
}
const isBrowserAccountFlow:Guard<BrowserAccountFlow>=(value):value is BrowserAccountFlow=>versioned(value)&&isIndependentScope(value.scope)
  &&uuid(value.flowId)&&value.connectionId===`browser_account:${value.flowId}`&&text(value.origin)&&normalizedBrowserAccountOrigin(value.origin)===value.origin
  &&revision(value.revision)&&oneOf(value.setupStatus,['starting','awaiting_user','user_confirmed','cancelled','expired','interrupted','revoking','revoked'])
  &&integer(value.permissionRevision)&&integer(value.permissionEpoch)&&timestamp(value.createdAt)&&timestamp(value.updatedAt)&&timestamp(value.expiresAt)
  &&optional(value.accountLabel,v=>text(v)&&v.length<=80)&&optional(value.reasonCode,ref)&&value.partitionKind==='dedicated_agent'&&value.accountSource==='explicit_agent_login'
  &&oneOf(value.authenticationStatus,['user_confirmed','unknown'])&&value.healthStatus==='unknown'&&oneOf(value.evidenceKind,['explicit_user_confirmation','owned_login_target'])
  &&(value.setupStatus==='user_confirmed'?value.authenticationStatus==='user_confirmed'&&value.evidenceKind==='explicit_user_confirmation':value.authenticationStatus==='unknown')
  &&['leaseId','mainProof','mainGeneration','runnerGeneration','partitionKey','targetId'].every(field=>value[field]===undefined);
const isCapabilityConnection: Guard<CapabilityConnection> = (value): value is CapabilityConnection => isIndependentRecord(value) && ref(value.connectionId) && optional(value.providerId, ref)
  && optional(value.title, text) && revision(value.revision) && oneOf(value.status, ['configured', 'connected', 'not_configured', 'reauth_required', 'unavailable', 'restricted'])
  && oneOf(value.configurationStatus, ['configured', 'not_configured', 'disabled', 'unknown']) && oneOf(value.authenticationStatus, ['credential_present', 'required', 'unknown','user_confirmed'])
  && optional(value.origin,text)&&optional(value.accountLabel,v=>nullable(v,text))
  && ((value.partitionKind===undefined&&value.accountSource===undefined)||(value.partitionKind==='dedicated_agent'&&value.accountSource==='explicit_agent_login'))
  && (value.authenticationStatus!=='user_confirmed'||value.partitionKind==='dedicated_agent'&&text(value.origin))
  && oneOf(value.healthStatus, ['unknown', 'not_checked']) && boolean(value.installed) && boolean(value.adapterAvailable)
  && list(value.setupActions, action => isIndependentRecord(action) && oneOf(action.kind, ['oauth', 'settings']) && oneOf(action.availability, ['available', 'unavailable'])
    && optional(action.providerId, ref) && optional(action.reasonCode, ref));
const isCapability: Guard<CapabilityCatalogEntry> = (value): value is CapabilityCatalogEntry => isIndependentRecord(value) && optional(value.schemaVersion, v => v === 1)
  && ref(value.capabilityId) && optional(value.scope, isIndependentScope) && optional(value.title, text)
  && optional(value.startUrl, isSafePluginStartUrl)
  && list(value.supportedTasks, text) && oneOf(value.connectionKind, ['provider', 'connector', 'browser_account', 'none'])
  && optional(value.connectionId, v => nullable(v, text)) && oneOf(value.status, ['not_configured', 'configured', 'connected', 'reauth_required', 'unavailable', 'restricted'])
  && optional(value.requiredPermissions, v => list(v, text)) && optional(value.verifiedAt, v => nullable(v, timestamp)) && oneOf(value.evidenceKind, ['configuration', 'credential_probe', 'model_inference', 'read_action','explicit_user_confirmation'])
  && optional(value.reasonCode, ref) && optional(value.connections, v => list(v, isCapabilityConnection));
const isBinding: Guard<CapabilityBinding> = (value): value is CapabilityBinding => isIndependentRecord(value) && ref(value.bindingId) && isIndependentScope(value.scope)
  && ref(value.capabilityId) && nullable(value.connectionId, ref) && revision(value.revision)
  && oneOf(value.status, ['active', 'revoking', 'revoked']) && list(value.permittedUse, text) && optional(value.connectionRevision, revision)
  && optional(value.connectionKind, v => nullable(v, v => oneOf(v, ['provider', 'connector', 'browser_account']))) && optional(value.updatedAt, timestamp);
const isPermissions: Guard<PermissionView> = (value): value is PermissionView => isIndependentRecord(value) && revision(value.revision)
  && ['browserOrigins', 'networkOrigins', 'connectorBindings', 'allowedWorkspaceRoots'].every(key => list(value[key], text))
  && list(value.allowedEffects, effect) && value.rawCdp === false && value.terminal === false && value.desktop === false;
export function isRunEvent(value: unknown): value is RunEvent {
  return versioned(value) && uuid(value.eventId) && isIndependentScope(value.scope) && revision(value.seq) && timestamp(value.at)
    && oneOf(value.kind, ['run_state', 'run_progress', 'checkpoint', 'approval', 'dispatch', 'result', 'connection_changed', 'connection_setup_changed', 'assistant_control', 'schedule', 'activity_changed', 'assistant', 'interview', 'control', 'action'])
    && isIndependentRecord(value.payload) && (value.kind !== 'run_progress' || uuid(value.payload.runId) && nullable(value.payload.targetSessionId, ref)
      && revision(value.payload.progressRevision) && timestamp(value.payload.observedAt) && oneOf(value.payload.runState, runStates)
      && isRunCounters(value.payload.counters) && text(value.payload.textPreview) && value.payload.textPreview.length <= 512
      && boolean(value.payload.textTruncated) && value.payload.source === 'sdk_output_text');
}
const isRecovery: Guard<EventRecovery> = (value): value is EventRecovery => isIndependentRecord(value) && list(value.events, isRunEvent)
  && nullable(value.snapshot, isActivitySnapshot) && integer(value.watermark) && boolean(value.resyncRequired)
  && (!value.resyncRequired || value.snapshot !== null);
const isApiError: Guard<ApiError> = (value): value is ApiError => versioned(value) && ref(value.code) && text(value.message) && boolean(value.retryable)
  && optional(value.currentRevision, v => nullable(v, revision)) && optional(value.requestId, v => nullable(v, text));

const decode = <T>(guard: Guard<T>) => (value: unknown): T => {
  if (!guard(value)) throw new Error('invalid_response');
  return value;
};
const decodeSnapshot = decode(isAssistantSnapshot);
const isBrowserAccountSource = (v:Record<string,unknown>):boolean => v.partitionKind===undefined && v.accountSource===undefined
  || v.partitionKind==='dedicated_agent' && v.accountSource==='explicit_agent_login';
const decodeLease = decode<BrowserLeaseView>((v): v is BrowserLeaseView => isIndependentRecord(v) && uuid(v.runId) && ref(v.leaseId)
  && isIndependentScope(v.scope) && ref(v.partitionKey) && ref(v.targetId) && revision(v.webContentsId)
  && uuid(v.mainGeneration) && uuid(v.runnerGeneration) && integer(v.navigationEpoch) && revision(v.permissionEpoch)
  && oneOf(v.state, ['ready', 'pausing', 'paused', 'revoked', 'lost', 'closing', 'closed']) && text(v.url)
  && timestamp(v.observedAt) && number(v.expiresAt) && boolean(v.visible) && isBrowserAccountSource(v));
const decodePreview = decode<BrowserPreview>((v): v is BrowserPreview => versioned(v) && v.kind === 'preview' && uuid(v.runId)
  && ref(v.leaseId) && integer(v.navigationEpoch) && revision(v.permissionEpoch) && v.mimeType === 'image/png'
  && text(v.base64) && v.base64.length < 20_000_000 && /^[a-zA-Z\d+/]*={0,2}$/.test(v.base64) && timestamp(v.observedAt) && isBrowserAccountSource(v));
const isNativeBrowserDetails = (v:unknown):v is Record<string,unknown> & {owner:Record<string,unknown>} => versioned(v)&&isIndependentScope(v.scope)
  &&isIndependentRecord(v.owner)&&v.owner.runId===null&&v.owner.ownerKind==='native_chat'&&ref(v.owner.sessionId)&&ref(v.owner.streamId)
  &&ref(v.owner.writerGeneration)&&ref(v.owner.writerLeaseId)&&Object.keys(v.owner).every(key=>['runId','ownerKind','sessionId','streamId','writerGeneration','writerLeaseId'].includes(key))
  &&revision(v.controlRevision)&&revision(v.permissionRevision)&&integer(v.controlEpoch)&&integer(v.navigationEpoch)
  &&v.writerAvailable===true&&timestamp(v.observedAt)&&boolean(v.visible)
  &&v.partitionKind==='dedicated_agent'&&v.accountSource==='explicit_agent_login';
const decodeNativePreview=decode<NativeBrowserPreview>((v):v is NativeBrowserPreview=>isNativeBrowserDetails(v)&&v.kind==='native_browser_preview'
  &&oneOf(v.state,['ready','pausing','paused'])&&boolean(v.automationPaused)&&isIndependentRecord(v.preview)&&v.preview.mimeType==='image/png'
  &&text(v.preview.base64)&&v.preview.base64.length>0&&v.preview.base64.length<20_000_000&&/^[a-zA-Z\d+/]*={0,2}$/.test(v.preview.base64)&&timestamp(v.preview.observedAt)
  &&integer(v.preview.navigationEpoch)&&v.preview.navigationEpoch===v.navigationEpoch);
const decodeNativeTakeover=decode<NativeBrowserTakeover>((v):v is NativeBrowserTakeover=>isNativeBrowserDetails(v)&&v.kind==='native_browser_takeover'
  &&v.state==='paused'&&v.automationPaused===true&&v.visible===true);
const isModelEntry: Guard<ScopedModelEntry> = (v): v is ScopedModelEntry => isIndependentRecord(v) && ref(v.id) && ref(v.label)
  && boolean(v.supportsIndependent) && optional(v.reasoning_efforts, values => list(values, ref));
const isModelGroup: Guard<ScopedModelGroup> = (v): v is ScopedModelGroup => isIndependentRecord(v) && ref(v.provider) && text(v.provider_id)
  && boolean(v.configured) && list(v.models, isModelEntry) && optional(v.extra_models, values => list(values, isModelEntry));
const isModelProvider: Guard<ScopedModelProvider> = (v): v is ScopedModelProvider => isIndependentRecord(v) && ref(v.id)
  && ref(v.display_name) && boolean(v.has_key) && boolean(v.oauth_connected) && ref(v.auth_state)
  && boolean(v.provider_available) && list(v.models, ref);
const isLocalAiBootstrapStatus: Guard<LocalAiBootstrapStatus> = (v):v is LocalAiBootstrapStatus => versioned(v)
  && v.installKey==='router-lfm2.5-230m-qad-q4_0-v1'&&revision(v.revision)
  && oneOf(v.state,['idle','pending','downloading','verifying','cancelling','complete','cancelled','offline','failed'])
    && nullable(v.jobId,uuid)&&integer(v.attempt)&&v.attempt<=3&&integer(v.downloadedBytes)&&integer(v.verifiedBytes)&&v.downloadedBytes<=149091630&&v.verifiedBytes<=149091630
  && v.totalBytes===149091630&&v.artifactId==='LiquidAI/LFM2.5-230M-GGUF:LFM2.5-230M-QAD-Q4_0'
  && v.artifactRevision==='b27f8147d98080b0d6f063ff41de6e381ea9a530'
  && v.sha256==='e75f83268de11b2a1bcfab5f3b5c5c0c97569ddbbc0990aad88437e45b8ba292'
  && v.licenseLabel==='LFM Open License v1.0'
  && v.licenseUrl==='https://huggingface.co/LiquidAI/LFM2.5-230M-GGUF/blob/b27f8147d98080b0d6f063ff41de6e381ea9a530/LICENSE'
    && v.commercialThresholdUsd===10000000&&v.executionUnavailable===true&&nullable(v.errorCode,ref)&&timestamp(v.updatedAt)
    && Object.keys(v).every(key=>['schemaVersion','installKey','revision','state','jobId','attempt','downloadedBytes','verifiedBytes','totalBytes','artifactId','artifactRevision','sha256','licenseLabel','licenseUrl','commercialThresholdUsd','executionUnavailable','errorCode','updatedAt'].includes(key))
  && (v.state!=='complete'||v.downloadedBytes===v.totalBytes&&v.verifiedBytes===v.totalBytes);
const isPermissionScope = (v: unknown): boolean => isIndependentRecord(v) && isPermissions({ ...v, revision: 1 });
const isDefinitionBudget = (v: unknown): boolean => isIndependentRecord(v)
  && ['maxToolCalls', 'maxProviderRequests', 'maxActiveSeconds', 'maxMeasuredTokens', 'providerTimeoutSeconds', 'toolTimeoutSeconds'].every(key => revision(v[key]))
  && integer(v.maxSafeReadRetries) && v.maxSafeReadRetries <= 2;
function isSetupAuthorizationUrl(value: unknown): boolean {
  if (!text(value) || value.length > 8192) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'auth.openai.com' && (!url.port || url.port === '443')
    && url.pathname === '/oauth/authorize' && !url.username && !url.password && !url.hash; } catch { return false; }
}
const isSetupFlow: Guard<ConnectionSetupFlow> = (v): v is ConnectionSetupFlow => versioned(v) && isIndependentScope(v.scope) && uuid(v.flowId) && ref(v.connectionId)
  && optional(v.providerId, ref) && revision(v.revision) && oneOf(v.setupStatus, ['starting', 'awaiting_user', 'connected', 'settings_required', 'unavailable', 'cancelled', 'expired', 'interrupted', 'failed'])
  && timestamp(v.createdAt) && timestamp(v.updatedAt) && timestamp(v.expiresAt) && optional(v.reasonCode, ref)
  && isIndependentRecord(v.evidence) && oneOf(v.evidence.source, ['capability_catalog', 'profile_auth_store', 'setup_worker'])
  && oneOf(v.evidence.configurationStatus, ['configured', 'not_configured', 'unknown']) && oneOf(v.evidence.authenticationStatus, ['connected', 'not_connected', 'pending', 'unknown'])
  && v.evidence.healthStatus === 'not_checked' && timestamp(v.evidence.observedAt)
  && optional(v.nextStep, next => isIndependentRecord(next) && (next.kind === 'oauth' && next.requiresUserNavigation === true && optional(next.authorizationUrl, isSetupAuthorizationUrl)
    || next.kind === 'settings' && oneOf(next.section, ['providers', 'plugins']) && uuid(next.backendProfileId) && isIndependentScope(v.scope) && next.backendProfileId === v.scope.backendProfileId
      && ref(next.connectionId) && next.connectionId === v.connectionId && optional(next.providerId, ref)
    || next.kind === 'human_form' && ref(next.providerId) && ref(next.connectionId) && next.connectionId === v.connectionId && uuid(next.backendProfileId)
      && isIndependentScope(v.scope) && next.backendProfileId === v.scope.backendProfileId && revision(next.expectedConnectionRevision)
      && list(next.fields, field => oneOf(field, ['apiKey', 'baseUrl', 'model']))));
const isDefinition: Guard<AgentDefinitionView> = (v): v is AgentDefinitionView => versioned(v) && uuid(v.definitionId) && isIndependentScope(v.scope)
  && revision(v.revision) && ref(v.title) && text(v.instruction) && v.instruction.length > 0 && nullable(v.desiredResult, text)
  && isIndependentRecord(v.provider) && ref(v.provider.providerConfigRef) && revision(v.provider.configRevision) && ref(v.provider.model)
  && text(v.provider.provider) && nullable(v.provider.contextLength, revision) && isPermissionScope(v.permissionScope)
  && isDefinitionBudget(v.budget) && nullable(v.profileSnapshotRef, uuid)
  && list(v.connectionBindings, row => isIndependentRecord(row) && ref(row.connectionId) && ref(row.capabilityId) && oneOf(row.kind, ['provider', 'connector', 'browser_account'])
    && revision(row.revision) && nullable(row.bindingId, uuid) && nullable(row.connectionRevision, revision))
  && nullable(v.activationConversationId, ref) && nullable(v.activationMessageId, ref) && list(v.capabilityRefs, ref) && boolean(v.enabled)
  && nullable(v.schedule, row => isIndependentRecord(row) && ref(row.cronExpression) && ref(row.timezone) && row.gapPolicy === 'skip' && row.foldPolicy === 'first'
    && oneOf(row.missedPolicy, ['skip', 'one_catch_up']) && revision(row.revision)) && timestamp(v.createdAt) && optional(v.nextRunAt, row => nullable(row, timestamp));
const isResetPreview: Guard<AssistantResetPreview> = (v): v is AssistantResetPreview => versioned(v) && isIndependentScope(v.scope)
  && oneOf(v.action, ['clear_interview_history', 'reset_assistant']) && revision(v.expectedRevision) && ref(v.conversationId)
  && typeof v.previewDigest === 'string' && /^[a-f0-9]{64}$/.test(v.previewDigest)
  && ['removedInterviewMessages', 'removedConversationMessages', 'removedAnswerRecords', 'clearedCachedStates', 'preservedSnapshotCount',
    'preservedSnapshotEvidenceCount', 'permissionControlEpoch', 'browserBindingRevision', 'permissionRevision'].every(key => integer(v[key]))
  && ['removedProfileFields', 'removedDraftFields', 'preservedProfileFields'].every(key => list(v[key], field => oneOf(field, ['purpose', 'requestedHelp', 'workingStyle', 'backgroundPreferences'])))
  && nullable(v.confirmedProfileId, uuid)
  && list(v.preservedDefinitions, row => isIndependentRecord(row) && uuid(row.definitionId) && text(row.title) && revision(row.revision) && boolean(row.enabled) && boolean(row.scheduled))
  && list(v.preservedRuns, row => isIndependentRecord(row) && uuid(row.runId) && uuid(row.definitionId) && oneOf(row.state, runStates) && revision(row.stateRevision) && integer(row.controlEpoch))
  && list(v.preservedConnections, row => isIndependentRecord(row) && uuid(row.bindingId) && ref(row.connectionId) && ref(row.capabilityId) && revision(row.revision) && oneOf(row.status, ['active', 'revoking', 'revoked']))
  && list(v.preservedSchedules, row => isIndependentRecord(row) && ref(row.jobId) && uuid(row.definitionId) && boolean(row.enabled) && nullable(row.nextRunAt, timestamp));
const isResetResult: Guard<AssistantResetResult> = (v): v is AssistantResetResult => versioned(v) && isIndependentScope(v.scope)
  && oneOf(v.action, ['clear_interview_history', 'reset_assistant']) && revision(v.revision) && revision(v.interviewRevision)
  && ref(v.conversationId) && nullable(v.confirmedProfileId, uuid) && typeof v.previewDigest === 'string' && /^[a-f0-9]{64}$/.test(v.previewDigest);
const decoders: { [K in IndependentOperation]: (value: unknown) => IndependentOperations[K]['response'] } = {
  resolveScope: decode(isResolvedScope),
  backendProfiles: decode(isBackendProfilesResponse),
  profileBindings: decode(isProfileBindingsResponse),
  assistantSnapshot: decodeSnapshot, assistantTurn: decodeSnapshot,
  assistantControl: decode(isControlResponse),
  cancelAssistantTurn: decode((v): v is Readonly<{ cancelled: boolean; turnId: string }> => isIndependentRecord(v) && boolean(v.cancelled) && ref(v.turnId)),
  assistantReset: decode((v): v is AssistantResetPreview | AssistantResetResult => isResetPreview(v) || isResetResult(v)),
  interviewStart: decodeSnapshot, interviewAnswer: decodeSnapshot, interviewReview: decodeSnapshot,
  interviewContinue: decodeSnapshot, interviewConfirm: decodeSnapshot, interviewSkip: decodeSnapshot,
  activity: decode(isActivitySnapshot), events: decode(isRecovery), dispatch: decode(isTaskDispatchView), runControl: decode(isRunView),
  globalActivity: decode((v): v is GlobalActivitySnapshot => versioned(v) && uuid(v.backendProfileId) && timestamp(v.observedAt)
    && list(v.spaces, row => isIndependentRecord(row) && ref(row.spaceName) && isIndependentScope(row.scope) && isActivitySnapshot(row.activity)
      && sameAssistantScope(row.scope, row.activity.scope) && row.scope.backendProfileId === v.backendProfileId
      && optional(row.workspacePath, value => nullable(value, text)))
    && Array.isArray(v.spaces) && unique(v.spaces.map(row => isIndependentRecord(row) && isIndependentScope(row.scope) ? JSON.stringify(row.scope) : ''))),
  modelSelection: decode((v): v is ScopedModelSelection => versioned(v) && isIndependentScope(v.scope) && revision(v.revision)
    && text(v.model) && text(v.provider) && boolean(v.configured) && boolean(v.supportsIndependent)
      && optional(v.reasonCode, ref) && optional(v.groups, values => list(values, isModelGroup))
      && optional(v.providers, values => list(values, isModelProvider))),
  definitions: decode((v): v is DefinitionResult => versioned(v) && isIndependentScope(v.scope)
    && (list(v.definitions, isDefinition) && v.definitions.every(row => isIndependentScope(v.scope) && sameAssistantScope(row.scope, v.scope))
      && timestamp(v.observedAt) && list(v.schedules, row => isIndependentRecord(row) && uuid(row.definitionId) && revision(row.definitionRevision) && nullable(row.nextRunAt, timestamp) && boolean(row.enabled))
      || isDefinition(v.definition) && sameAssistantScope(v.definition.scope, v.scope)
      || isTaskDispatchView(v.dispatch) && sameAssistantScope(v.dispatch.scope, v.scope))),
  connectionSetup: decode(isSetupFlow),
  browserConnection:decode(isBrowserAccountFlow),
  localAi:decode(isLocalAiResponse),
  localAiHardwareInventory:decode(isLocalAiHardwareInventory),
  localAiBootstrap:decode(isLocalAiBootstrapStatus),
  connectionConfigure: decode((v): v is ConnectionConfigureAck => versioned(v) && isIndependentScope(v.scope) && ref(v.connectionId) && ref(v.providerId)
    && v.applied === true && revision(v.connectionRevision) && oneOf(v.configurationStatus, ['configured', 'not_configured'])
    && oneOf(v.authenticationStatus, ['credential_present', 'unknown']) && v.healthStatus === 'not_checked'
    && Object.keys(v).every(key => ['schemaVersion', 'scope', 'connectionId', 'providerId', 'applied', 'connectionRevision', 'configurationStatus', 'authenticationStatus', 'healthStatus'].includes(key))),
  permissions: decode(isPermissions), approve: decode(isApproval), capabilities: decode((v): v is CapabilityCatalog => versioned(v) && isIndependentScope(v.scope)
    && list(v.entries, isCapability) && timestamp(v.observedAt) && v.entries.every(entry => !entry.scope || isIndependentScope(v.scope) && sameAssistantScope(entry.scope, v.scope))),
  bindings: decode((v): v is SpaceBindingsView => isIndependentRecord(v) && isIndependentScope(v.scope) && isPermissions(v.permissions)
    && nullable(v.browser, browser => versioned(browser) && isIndependentScope(browser.scope) && isIndependentScope(v.scope) && sameAssistantScope(browser.scope, v.scope) && ref(browser.nativeSlug)
      && ref(browser.partitionKey) && revision(browser.revision) && nullable(browser.workspaceLocator, text) && nullable(browser.tombstonedAt, timestamp))
    && optional(v.connectionBindings, rows => list(rows, isBinding) && rows.every(row => isIndependentScope(v.scope) && sameAssistantScope(row.scope, v.scope)))),
  openBrowser: decodePreview, takeover: decodeLease, resumeBrowser: decodeLease,
  openNativeBrowser:decodeNativePreview,takeoverNativeBrowser:decodeNativeTakeover,
  selectedContext: decode((v): v is Readonly<{ ref: string; scope: IndependentScope; observedAt: string; expiresInSeconds: number }> => isIndependentRecord(v)
    && ref(v.ref) && isIndependentScope(v.scope) && timestamp(v.observedAt) && integer(v.expiresInSeconds))
};

/** Decode the narrow preload bridge before allowing backend data into UI state. */
export class IndependentAssistantClient implements IndependentBridge {
  constructor(private readonly transport: IndependentTransport) {}
  async request<K extends IndependentOperation>(request: IndependentRequest<K>): Promise<IndependentResult<IndependentOperations[K]['response']>> {
    try {
      const envelope = await this.transport.request(request);
      if (!isIndependentRecord(envelope) || typeof envelope.ok !== 'boolean') throw new Error('invalid_response');
      if (!envelope.ok) {
        if (!isApiError(envelope.error)) throw new Error('invalid_response');
        return { ok: false, error: envelope.error };
      }
      const value = decoders[request.operation](envelope.value);
      if (request.operation === 'events' && request.scope && isIndependentRecord(value)) {
        const recovery = decoders.events(value), scope = request.scope;
        if (recovery.events.some(event => !sameAssistantScope(event.scope, scope))
          || (recovery.snapshot && !sameAssistantScope(recovery.snapshot.scope, scope))) throw new Error('invalid_response');
      }
      if (request.operation === 'globalActivity' && request.scope && isIndependentRecord(value)) {
        const snapshot = decoders.globalActivity(value);
        if (snapshot.backendProfileId !== request.scope.backendProfileId || snapshot.spaces.some(row => row.scope.browserProfileId !== request.scope?.browserProfileId)) throw new Error('invalid_response');
      }
      const requestPayload: unknown = request.payload;
      if (request.operation === 'assistantControl' && isIndependentRecord(requestPayload)) {
        const response = decoders.assistantControl(value);
        const reply=response.messages.find(message=>message.controlResolution?.sourceMessageId===requestPayload.sourceMessageId
          && message.controlResolution?.humanTurnId===requestPayload.humanTurnId);
        if (!reply || !reply.controlResolution?.candidates.some(candidate=>candidate.runId===requestPayload.runId)
          || reply.controlStatus!==response.controlOutcome.status
          || response.controlOutcome.results.some(run => run.runId !== requestPayload.runId)
          || response.controlOutcome.results.some(run=>!(reply.controlResults??[]).some(result=>result.runId===run.runId
            && result.dispatchId===run.dispatchId && result.stateRevision===run.stateRevision && result.controlEpoch===run.controlEpoch && result.state===run.state))
          || response.controlOutcome.status === 'completed' && response.controlOutcome.results.length !== 1) throw new Error('invalid_response');
      }
      if (request.operation === 'assistantReset' && isIndependentRecord(requestPayload)) {
        const result = decoders.assistantReset(value);
        if (result.action !== requestPayload.action || (requestPayload.mode === 'preview'
          ? !('expectedRevision' in result) || result.expectedRevision !== requestPayload.expectedRevision
          : !('revision' in result) || result.revision <= Number(requestPayload.expectedRevision) || result.previewDigest !== requestPayload.previewDigest)) throw new Error('invalid_response');
      }
      if (request.operation === 'runControl' && isIndependentRecord(requestPayload)) {
        if (decoders.runControl(value).runId !== requestPayload.runId) throw new Error('invalid_response');
      }
      if(request.operation==='approve'&&isIndependentRecord(requestPayload)){
        const approval=decoders.approve(value);
        if(approval.approvalId!==requestPayload.approvalId||approval.actionDigest!==requestPayload.actionDigest||approval.permissionRevision!==requestPayload.expectedPermissionRevision
          ||approval.ownerKind==='native_chat'&&approval.controlEpoch!==requestPayload.expectedControlEpoch)throw Error('invalid_response');
      }
      if(['openBrowser','takeover','resumeBrowser'].includes(request.operation) && isIndependentRecord(requestPayload)
        && isIndependentRecord(value) && (!('runId' in value)||value.runId!==requestPayload.runId))throw new Error('invalid_response');
      if((request.operation==='openNativeBrowser'||request.operation==='takeoverNativeBrowser')&&isIndependentRecord(requestPayload)){
        const response=request.operation==='openNativeBrowser'?decoders.openNativeBrowser(value):decoders.takeoverNativeBrowser(value);
        if(response.owner.sessionId!==requestPayload.sessionId||response.owner.streamId!==requestPayload.streamId)throw Error('invalid_response');
        if(request.operation==='takeoverNativeBrowser'&&(response.owner.writerGeneration!==requestPayload.writerGeneration||response.owner.writerLeaseId!==requestPayload.writerLeaseId
          ||response.controlRevision!==Number(requestPayload.expectedControlRevision)+1||response.permissionRevision!==requestPayload.expectedPermissionRevision
          ||response.controlEpoch!==requestPayload.expectedControlEpoch||response.navigationEpoch!==requestPayload.expectedNavigationEpoch))throw Error('invalid_response');
      }
      if (request.operation === 'connectionSetup') {
        const flow = decoders.connectionSetup(value);
        if (isIndependentRecord(requestPayload) && (requestPayload.action === 'start' ? flow.connectionId !== requestPayload.connectionId
          : flow.flowId !== requestPayload.flowId)) throw new Error('invalid_response');
      }
      if (request.operation === 'connectionConfigure') {
        const acknowledgement = decoders.connectionConfigure(value);
        if (isIndependentRecord(requestPayload) && acknowledgement.connectionId !== requestPayload.connectionId) throw new Error('invalid_response');
      }
      if(request.operation==='browserConnection'&&isIndependentRecord(requestPayload)){
        const flow=decoders.browserConnection(value);
        if(requestPayload.action==='start'?typeof requestPayload.origin!=='string'||flow.origin!==normalizedBrowserAccountOrigin(requestPayload.origin)
          :requestPayload.action==='logout'?flow.connectionId!==requestPayload.connectionId:flow.flowId!==requestPayload.flowId)throw Error('invalid_response');
        if((requestPayload.action==='confirm'||requestPayload.action==='logout')&&flow.revision<Number(requestPayload.expectedRevision))throw Error('invalid_response');
      }
      if(request.operation==='localAi'&&isIndependentRecord(requestPayload)){
        const response=decoders.localAi(value);
        if(requestPayload.action==='catalog'&&!('catalog'in response)||requestPayload.action==='scan'&&!('scan'in response)
          ||requestPayload.action==='recommend'&&(!('result'in response)||response.result.hardwareScanId!==requestPayload.scanId||response.result.requestedPreset!==requestPayload.preset))throw Error('invalid_response');
        if(requestPayload.action==='setup'&&isIndependentRecord(requestPayload.request)){
          if(!('operation'in response)||!('skipAvailable'in response)||response.operation!==requestPayload.request.operation)throw Error('invalid_response');
          const expected=requestPayload.request;
          if(expected.operation==='confirm'&&response.consent?.planDigest!==expected.planDigest||expected.operation==='start'&&response.job?.planDigest!==expected.planDigest
            ||expected.operation==='cancel'&&response.job?.jobId!==expected.jobId||expected.operation==='status'&&expected.jobId&&response.job?.jobId!==expected.jobId)throw Error('invalid_response');
          if(expected.operation==='confirm'&&response.consent&&(!Array.isArray(expected.licenseDigests)||!sameUuid(response.consent.clientRequestId,expected.clientRequestId)
            ||JSON.stringify([...response.consent.licenseDigests].sort())!==JSON.stringify([...expected.licenseDigests].sort())))throw Error('invalid_response');
        }
        if(requestPayload.action==='runtime'){
          if(!isLocalAiRuntimeRequest(requestPayload.request)||!request.scope||!isLocalAiRuntimeResponse(response)||!runtimeResponseMatches(response,requestPayload.request,request.scope))throw Error('invalid_response');
        }
      }
      if (request.operation === 'definitions' && isIndependentRecord(requestPayload)) {
        const result = decoders.definitions(value);
        const action = requestPayload.action;
        if (action === 'list' && !('definitions' in result) || action === 'start' && !('dispatch' in result)
          || ['save', 'disable'].includes(String(action)) && !('definition' in result)) throw new Error('invalid_response');
        if ('definition' in result && action === 'disable' && result.definition.definitionId !== requestPayload.definitionId) throw new Error('invalid_response');
        if ('definition' in result && action === 'save' && isIndependentRecord(requestPayload.draft) && requestPayload.draft.definitionId
          && result.definition.definitionId !== requestPayload.draft.definitionId) throw new Error('invalid_response');
      }
      if (request.scope && isIndependentRecord(value) && 'scope' in value && isIndependentScope(value.scope) && !sameAssistantScope(value.scope, request.scope)) throw new Error('invalid_response');
      return { ok: true, value };
    } catch (error) {
      const invalid = error instanceof Error && error.message === 'invalid_response';
      return { ok: false, error: { schemaVersion: 1, code: invalid ? 'invalid_response' : 'bridge_unavailable',
        message: invalid ? 'The assistant returned an invalid response.' : 'The assistant connection is unavailable.', retryable: !invalid } };
    }
  }
  onEvent(callback: (event: RunEvent) => void): () => void {
    return this.transport.onEvent?.(event => { if (isRunEvent(event)) callback(event); }) ?? (() => {});
  }
}
