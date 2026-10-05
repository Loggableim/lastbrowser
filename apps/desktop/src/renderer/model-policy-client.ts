import { isIndependentRecord,isIndependentScope } from './independent-assistant-client.js';
import { sameAssistantScope,type IndependentScope } from './independent-contracts.js';
export type ActualModelPair=Readonly<{provider:string;model:string}>;
export type ModelPolicyBudget=Readonly<{requestsPerMinute:number;tokensPerMinute:number;maxConcurrent:number;maxCostMicrousdPerMinute:number|null;maxOutputTokens:number}>;
export type ModelSelectionPolicy=Readonly<{schemaVersion:1;scope:IndependentScope;sessionId:string;revision:number;mode:'fixed'|'auto';allowedModels:readonly ActualModelPair[];
  orchestrator:ActualModelPair|null;cloudPolicy:'deny'|'allow';allowedCloudDataClasses:readonly ('public'|'private'|'workspace'|'browsing')[];budget:ModelPolicyBudget;updatedAt:string}>;
export type ModelPolicyDraft=Pick<ModelSelectionPolicy,'mode'|'allowedModels'|'orchestrator'|'cloudPolicy'|'allowedCloudDataClasses'|'budget'>;
export type ProviderLimitBucket=Readonly<{resource:'requests'|'tokens'|'input_tokens'|'output_tokens'|'project_tokens';limit:number|null;remaining:number|null;resetAt:string|null}>;
export type ProviderLimitObservation=Readonly<{schemaVersion:1;provider:string;groupKey:string;observedAt:string;observedRequestId:string|null;source:'response_headers'|'unknown';
  buckets:readonly ProviderLimitBucket[];retryAt:string|null;actionRequired:boolean;statusCode:number|null;stale:boolean}>;
export type ModelPolicyResponse=Readonly<{schemaVersion:1;scope:IndependentScope;sessionId:string;policy:ModelSelectionPolicy;
  status:readonly Readonly<{provider:string;snapshots:readonly ProviderLimitObservation[]}>[];
  executionAvailability:Readonly<{available:boolean;sealedWorker:boolean;managedCallAuthorizer?:boolean;reasonCode?:string}>}>;
export type ModelPolicyRequest=Readonly<{action:'get';sessionId:string;workspacePath:string;browserProfileId:string}>
  |Readonly<{action:'set';sessionId:string;workspacePath:string;browserProfileId:string;draft:ModelPolicyDraft;expectedRevision:number;clientRequestId:string}>;
const text=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=1000;
const count=(value:unknown,min=0,max=Number.MAX_SAFE_INTEGER):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const timestamp=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const nullableCount=(value:unknown)=>value===null||count(value);
const nullableTime=(value:unknown)=>value===null||timestamp(value);
export const modelPairKey=(pair:ActualModelPair)=>JSON.stringify([pair.provider,pair.model]);
export function isActualModelPair(value:unknown):value is ActualModelPair {
  return isIndependentRecord(value)&&text(value.provider)&&text(value.model)&&value.model.toLowerCase()!=='auto';
}
export function isModelPolicyBudget(value:unknown):value is ModelPolicyBudget {
  return isIndependentRecord(value)&&count(value.requestsPerMinute,1,1000)&&count(value.tokensPerMinute,1,10000000)
    &&count(value.maxConcurrent,1,6)&&count(value.maxOutputTokens,1,100000)
    &&(value.maxCostMicrousdPerMinute===null||count(value.maxCostMicrousdPerMinute,0,1000000000));
}
export function isModelSelectionPolicy(value:unknown):value is ModelSelectionPolicy {
  if(!isIndependentRecord(value)||value.schemaVersion!==1||!isIndependentScope(value.scope)||!text(value.sessionId)||!count(value.revision)
    ||!['fixed','auto'].includes(String(value.mode))||!Array.isArray(value.allowedModels)||value.allowedModels.length>64
    ||!value.allowedModels.every(isActualModelPair)||new Set(value.allowedModels.map(modelPairKey)).size!==value.allowedModels.length
    ||!(value.orchestrator===null||isActualModelPair(value.orchestrator))||!['deny','allow'].includes(String(value.cloudPolicy))
    ||!Array.isArray(value.allowedCloudDataClasses)||value.allowedCloudDataClasses.length>4
    ||!value.allowedCloudDataClasses.every(entry=>['public','private','workspace','browsing'].includes(String(entry)))
    ||new Set(value.allowedCloudDataClasses).size!==value.allowedCloudDataClasses.length||!isModelPolicyBudget(value.budget)||!timestamp(value.updatedAt))return false;
  const orchestrator=value.orchestrator;
  return (value.mode!=='auto'||value.allowedModels.length>0)&&(value.cloudPolicy!=='deny'||value.allowedCloudDataClasses.length===0)
    &&(orchestrator===null||value.allowedModels.some(pair=>modelPairKey(pair)===modelPairKey(orchestrator)));
}
function isStatusRow(value:unknown):value is ModelPolicyResponse['status'][number] {
  return isIndependentRecord(value)&&text(value.provider)&&Array.isArray(value.snapshots)&&value.snapshots.length<=64&&value.snapshots.every(isLimitObservation);
}
function isLimitObservation(value:unknown):value is ProviderLimitObservation {
  return isIndependentRecord(value)&&value.schemaVersion===1&&text(value.provider)&&text(value.groupKey)&&timestamp(value.observedAt)
    &&(value.observedRequestId===null||text(value.observedRequestId))&&['response_headers','unknown'].includes(String(value.source))
    &&Array.isArray(value.buckets)&&value.buckets.length<=5&&value.buckets.every(bucket=>isIndependentRecord(bucket)
      &&['requests','tokens','input_tokens','output_tokens','project_tokens'].includes(String(bucket.resource))
      &&nullableCount(bucket.limit)&&nullableCount(bucket.remaining)&&nullableTime(bucket.resetAt))
    &&nullableTime(value.retryAt)&&typeof value.actionRequired==='boolean'&&(value.statusCode===null||count(value.statusCode,100,599))&&typeof value.stale==='boolean';
}
export function readModelPolicyResponse(value:unknown,scope:IndependentScope,sessionId:string):ModelPolicyResponse {
  if(!isIndependentRecord(value)||value.schemaVersion!==1||!isIndependentScope(value.scope)||!sameAssistantScope(value.scope,scope)
    ||value.sessionId!==sessionId||!isModelSelectionPolicy(value.policy)||!sameAssistantScope(value.policy.scope,scope)||value.policy.sessionId!==sessionId
    ||!Array.isArray(value.status)||value.status.length>64||!value.status.every(isStatusRow)
    ||!isIndependentRecord(value.executionAvailability)||typeof value.executionAvailability.available!=='boolean'
    ||typeof value.executionAvailability.sealedWorker!=='boolean'||!(value.executionAvailability.managedCallAuthorizer===undefined||typeof value.executionAvailability.managedCallAuthorizer==='boolean')
    ||!(value.executionAvailability.reasonCode===undefined||text(value.executionAvailability.reasonCode)))throw Error('model_policy_response_invalid');
  const availability=value.executionAvailability;
  return {schemaVersion:1,scope:value.scope,sessionId,policy:value.policy,status:value.status,
    executionAvailability:{available:availability.available===true,sealedWorker:availability.sealedWorker===true,
      ...(typeof availability.managedCallAuthorizer==='boolean'?{managedCallAuthorizer:availability.managedCallAuthorizer}:{}),
      ...(typeof availability.reasonCode==='string'?{reasonCode:availability.reasonCode}:{})}};
}
export function canExecuteAutomaticPolicy(value:ModelPolicyResponse):boolean {
  // The server checks actual Nova enrollment. Unmanaged Spaces do not need a
  // managed authorizer, while available already attests that server-side gate.
  return value.executionAvailability.available&&value.executionAvailability.sealedWorker;
}
export async function requestModelPolicy(transport:(request:ModelPolicyRequest)=>Promise<unknown>,request:ModelPolicyRequest,scope:IndependentScope) {
  if(request.browserProfileId!==scope.browserProfileId)throw Error('model_policy_scope_invalid');
  return readModelPolicyResponse(await transport(request),scope,request.sessionId);
}
export type ActualDecisionRecord = Readonly<{
  provider: string;
  model: string;
  sessionId: string;
  turnId?: string | null;
  observedAt: number;
  source: 'provider_evidence' | 'session_rehydration';
  isHistorical?: boolean;
}>;
function isSuccessfulGatewayRouting(routing: unknown, data?: Record<string, unknown> | null): boolean {
  if (!isIndependentRecord(routing)) return false;
  if (data && (data.error || data.interrupted === true || data.partial === true)) return false;
  if (routing.error) return false;
  if (typeof routing.status === 'string' && ['failed', 'error', 'timeout', 'rejected', 'aborted'].includes(routing.status.toLowerCase())) {
    return false;
  }
  if (routing.successful_chat === false) return false;

  if (Array.isArray(routing.routing) && routing.routing.length > 0) {
    const attempts = routing.routing.filter(isIndependentRecord);
    const selected = attempts.find(a => a.selected === true);
    if (selected) {
      if (selected.error) return false;
      const status = typeof selected.status === 'string' ? selected.status.toLowerCase() : '';
      if (['failed', 'error', 'timeout', 'rejected', 'aborted'].includes(status)) return false;
    }
    const allFailed = attempts.every(a => {
      const status = typeof a.status === 'string' ? a.status.toLowerCase() : '';
      return Boolean(a.error || ['failed', 'error', 'timeout', 'rejected', 'aborted'].includes(status));
    });
    if (allFailed) return false;

    const usedModel = typeof routing.used_model === 'string' ? routing.used_model.trim().toLowerCase() : '';
    if (usedModel) {
      const matching = attempts.find(a => typeof a.model === 'string' && a.model.trim().toLowerCase() === usedModel);
      if (matching) {
        if (matching.error) return false;
        const status = typeof matching.status === 'string' ? matching.status.toLowerCase() : '';
        if (['failed', 'error', 'timeout', 'rejected', 'aborted'].includes(status)) return false;
      }
    }
  }
  return true;
}

export function readStreamEventIdentity(payload: unknown): { sessionId: string; streamId: string } | null {
  if (!isIndependentRecord(payload)) return null;
  const nativeContext = isIndependentRecord(payload.nativeContext) ? payload.nativeContext : null;
  const streamId = (typeof payload.streamId === 'string' && payload.streamId.trim())
    ? payload.streamId.trim()
    : (typeof nativeContext?.streamId === 'string' && nativeContext.streamId.trim() ? nativeContext.streamId.trim() : '');

  const data = isIndependentRecord(payload.data) ? payload.data : isIndependentRecord(payload) ? payload : null;
  const session = (data && isIndependentRecord(data.session)) ? data.session : null;
  const sessionId = (typeof session?.session_id === 'string' && session.session_id.trim())
    ? session.session_id.trim()
    : (typeof nativeContext?.sessionId === 'string' && nativeContext.sessionId.trim())
      ? nativeContext.sessionId.trim()
      : (typeof payload.sessionId === 'string' && payload.sessionId.trim() ? payload.sessionId.trim() : '');

  if (!sessionId || !streamId) return null;
  return { sessionId, streamId };
}

export function readObservedDecisionFromStreamEvent(
  payload: unknown,
  expectedSessionId: string,
  expectedStreamId?: string | null,
): ActualDecisionRecord | null {
  if (!isIndependentRecord(payload) || payload.event !== 'done') return null;
  if (!expectedSessionId || typeof expectedSessionId !== 'string' || !expectedSessionId.trim()) return null;
  if (!expectedStreamId || typeof expectedStreamId !== 'string' || !expectedStreamId.trim()) return null;

  const identity = readStreamEventIdentity(payload);
  if (!identity || identity.sessionId !== expectedSessionId || identity.streamId !== expectedStreamId) {
    return null;
  }
  const { sessionId: eventSessionId, streamId } = identity;

  const data = isIndependentRecord(payload.data) ? payload.data : isIndependentRecord(payload) ? payload : null;
  if (!data) return null;

  if (data.error || data.interrupted === true || data.partial === true) {
    return null;
  }

  // Authoritative turn-bound execution evidence from stream completion: requires successful_chat === true
  const evidence = isIndependentRecord(data.provider_evidence) ? data.provider_evidence : null;
  if (evidence && typeof evidence.provider_id === 'string' && typeof evidence.model_id === 'string' && evidence.successful_chat === true) {
    const provider = evidence.provider_id.trim();
    const model = evidence.model_id.trim();
    if (provider && model && model.toLowerCase() !== 'auto') {
      return { provider, model, sessionId: eventSessionId, turnId: streamId, observedAt: Date.now(), source: 'provider_evidence' };
    }
  }

  const gatewayRouting = isIndependentRecord(data.gateway_routing)
    ? data.gateway_routing
    : (isIndependentRecord(data.usage) && isIndependentRecord(data.usage.gateway_routing))
      ? data.usage.gateway_routing
      : null;
  if (gatewayRouting && isSuccessfulGatewayRouting(gatewayRouting, data) && typeof gatewayRouting.used_provider === 'string' && typeof gatewayRouting.used_model === 'string') {
    const provider = gatewayRouting.used_provider.trim();
    const model = gatewayRouting.used_model.trim();
    if (provider && model && model.toLowerCase() !== 'auto') {
      return { provider, model, sessionId: eventSessionId, turnId: streamId, observedAt: Date.now(), source: 'provider_evidence' };
    }
  }

  return null;
}
export function readObservedDecisionFromSession(
  session: unknown,
  expectedSessionId: string,
): ActualDecisionRecord | null {
  if (!isIndependentRecord(session)) return null;
  const sessionId = typeof session.session_id === 'string' ? session.session_id.trim() : '';
  if (!sessionId || sessionId !== expectedSessionId) return null;

  const messages = Array.isArray(session.messages) ? session.messages : [];
  let lastAssistant: Record<string, unknown> | null = null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (isIndependentRecord(m) && m.role === 'assistant') {
      lastAssistant = m;
      break;
    }
  }
  if (!lastAssistant) return null;
  if (lastAssistant.pending === true || lastAssistant.streaming === true || lastAssistant.interrupted === true || lastAssistant.error) {
    return null;
  }
  if (typeof lastAssistant.content === 'string' && !lastAssistant.content.trim()) {
    return null;
  }

  // Require explicit positive turn-bound execution evidence on the message itself
  let provider = '';
  let model = '';

  const evidence = isIndependentRecord(lastAssistant.provider_evidence)
    ? lastAssistant.provider_evidence
    : isIndependentRecord(lastAssistant.execution_evidence)
      ? lastAssistant.execution_evidence
      : null;
  if (evidence && typeof evidence.provider_id === 'string' && typeof evidence.model_id === 'string' && evidence.successful_chat === true) {
    provider = evidence.provider_id.trim();
    model = evidence.model_id.trim();
  } else if (evidence && typeof evidence.provider === 'string' && typeof evidence.model === 'string' && evidence.successful_chat === true) {
    provider = evidence.provider.trim();
    model = evidence.model.trim();
  } else {
    const routing = isIndependentRecord(lastAssistant._gatewayRouting)
      ? lastAssistant._gatewayRouting
      : isIndependentRecord(lastAssistant.gateway_routing)
        ? lastAssistant.gateway_routing
        : null;
    if (routing && isSuccessfulGatewayRouting(routing)) {
      if (typeof routing.used_provider === 'string' && typeof routing.used_model === 'string') {
        provider = routing.used_provider.trim();
        model = routing.used_model.trim();
      } else if (typeof routing.provider === 'string' && typeof routing.model === 'string') {
        provider = routing.provider.trim();
        model = routing.model.trim();
      }
    }
  }

  if (!provider || !model || model.toLowerCase() === 'auto') return null;

  const turnId = typeof lastAssistant.turn_id === 'string'
    ? lastAssistant.turn_id
    : typeof lastAssistant.stream_id === 'string'
      ? lastAssistant.stream_id
      : typeof lastAssistant._streamId === 'string'
        ? lastAssistant._streamId
        : null;

  return {
    provider,
    model,
    sessionId: expectedSessionId,
    turnId,
    observedAt: Date.now(),
    source: 'session_rehydration',
    isHistorical: true,
  };
}
export function resolveActiveObservedDecision(params: {
  sessionId: string;
  activeSession: unknown;
  observedDecision: ActualDecisionRecord | null;
  running?: boolean;
  hasError?: boolean;
}): ActualDecisionRecord | null {
  const { sessionId, activeSession, observedDecision, running = false, hasError = false } = params;
  if (!sessionId || !isIndependentRecord(activeSession) || activeSession.session_id !== sessionId) {
    return null;
  }

  const messages = Array.isArray(activeSession.messages) ? activeSession.messages : [];
  let lastUserIndex = -1;
  let lastAssistantIndex = -1;
  let lastCompletedAssistantIndex = -1;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (isIndependentRecord(m)) {
      if (m.role === 'assistant') {
        if (lastAssistantIndex === -1) lastAssistantIndex = i;
        const isCompleted = m.pending !== true && m.streaming !== true && m.interrupted !== true && !m.error
          && (typeof m.content === 'string' ? m.content.trim().length > 0 : true);
        if (isCompleted && lastCompletedAssistantIndex === -1) {
          lastCompletedAssistantIndex = i;
        }
      } else if (m.role === 'user' && lastUserIndex === -1) {
        lastUserIndex = i;
      }
    }
  }

  const isCurrentTurnUnfinishedOrFailed = running
    || hasError
    || (lastUserIndex > lastAssistantIndex)
    || (lastAssistantIndex >= 0 && lastAssistantIndex !== lastCompletedAssistantIndex);

  let candidate: ActualDecisionRecord | null = null;
  if (observedDecision && observedDecision.sessionId === sessionId) {
    candidate = observedDecision;
  } else {
    candidate = readObservedDecisionFromSession(activeSession, sessionId);
  }

  if (!candidate) return null;

  if (isCurrentTurnUnfinishedOrFailed) {
    return { ...candidate, isHistorical: true };
  }

  if (candidate.source === 'session_rehydration') {
    return { ...candidate, isHistorical: true };
  }

  return candidate;
}


