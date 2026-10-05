import { sameAssistantScope, type IndependentScope } from './independent-contracts.js';
import { isIndependentScope, isIndependentRecord } from './independent-assistant-client.js';
import type { NativeChatBinding } from './native-chat-control.js';

export type TeamworkStage = 'grounding' | 'planning' | 'debate' | 'critic' | 'synthesizing' | 'single_provider';
export type TeamworkDraftStatus = 'planned' | 'running' | 'complete' | 'failed' | 'skipped' | 'aborted';
export type TeamworkDraft = {
  workerId?: string;
  workerIndex?: number;
  attempt?: number;
  model: string;
  provider?: string;
  name: string;
  role: string;
  content: string;
  execution_ms: number;
  status: TeamworkDraftStatus;
  error?: string | null;
  failureCode?: string;
  swapped?: boolean;
};
export type TeamworkCandidateDiagnostic = Readonly<{ provider: string; model: string; code: string }>;
export type TeamworkMetadata = {
  status: 'running' | 'stopped' | 'partial' | 'failed' | 'complete';
  cancelled?: boolean;
  stage?: TeamworkStage;
  completeReceived?: boolean;
  planCompleted?: boolean;
  candidateDiagnostics?: TeamworkCandidateDiagnostic[];
  strategy?: string;
  drafts?: TeamworkDraft[];
  plannedWorkers?: TeamworkDraft[];
  critic?: { model: string; review: string; execution_ms: number } | null;
  stats?: { duration_ms: number; drafts_count: number; auto_scaled: boolean };
};

export type TeamworkStreamUpdate = Readonly<{
  kind: 'stage' | 'plan' | 'draft' | 'critic' | 'complete' | 'terminal';
  event: string;
  data: Record<string, unknown>;
}>;

export type TeamworkLiveMessage = Readonly<{
  role?: string;
  pending?: boolean;
  streaming?: boolean;
  content?: string;
  reasoning?: string;
  isPartial?: boolean;
  chatStreamId?: string;
  chatStreamSessionId?: string;
  teamwork?: unknown;
}>;

const stages = new Set<TeamworkStage>(['grounding', 'planning', 'debate', 'critic', 'synthesizing', 'single_provider']);
const teamworkEvents: Record<string, TeamworkStreamUpdate['kind']> = {
  teamwork_stage: 'stage', teamwork_plan: 'plan', teamwork_draft: 'draft',
  teamwork_critic: 'critic', teamwork_complete: 'complete',
  teamwork_worker_start: 'draft', teamwork_worker_delta: 'draft',
  teamwork_worker_end: 'draft',
  stream_end: 'terminal', cancel: 'terminal', error: 'terminal', apperror: 'terminal', worker_exit: 'terminal',
};
const isRecord = (value: unknown): value is Record<string, unknown> => isIndependentRecord(value);
const boundedText = (value: unknown, limit: number): string => typeof value === 'string' ? value.slice(0, limit) : '';
const positiveMs = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(600_000, Math.round(value)) : 0;
const workerId = (value: unknown): string | undefined => typeof value === 'string' && value.trim() && value.length <= 160 ? value.trim() : undefined;
const safeFailureCodes = new Set([
  'native_teamwork_authority_changed', 'native_teamwork_claim_contract_mismatch', 'native_teamwork_claim_mismatch',
  'native_teamwork_decision_unknown', 'native_teamwork_model_not_in_parent_plan', 'native_teamwork_policy_changed',
  'native_teamwork_private_worker_required', 'native_teamwork_request_purpose_invalid', 'native_teamwork_role_not_in_parent_plan',
  'native_teamwork_stage_output_limit', 'native_teamwork_turn_budget_exhausted', 'native_teamwork_turn_closed',
  'native_teamwork_context_changed', 'native_teamwork_plan_missing', 'native_teamwork_fixed_policy_changed',
  'native_teamwork_parent_decision_scope_invalid', 'native_teamwork_compute_replay', 'native_teamwork_compute_not_held',
  'native_nova_execution_adapter_required', 'native_nova_sdk_capability_changed', 'provider_connection_changed',
  'provider_admission_denied', 'scope_connection_changed', 'scope_connection_adapter_required', 'nova_governance_admission_required',
]);
function workerEndStatus(value: unknown): TeamworkDraftStatus | null {
  if (value === 'complete') return 'complete';
  if (value === 'failed' || value === 'partial_failed') return 'failed';
  if (value === 'aborted') return 'aborted';
  return null;
}
function normalizeCandidateDiagnostics(value: unknown): TeamworkCandidateDiagnostic[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).slice(0, 64).flatMap((entry) => {
    const provider = boundedText(entry.provider, 80).trim();
    const model = boundedText(entry.model, 200).trim();
    const code = typeof entry.code === 'string' && safeFailureCodes.has(entry.code) ? entry.code : '';
    return provider && model && code ? [{ provider, model, code }] : [];
  });
}

/** Accept only events carried by Main's session/stream/scope-bound native provenance envelope. */
export function readTeamworkStreamUpdate(
  payload: unknown,
  binding: NativeChatBinding | undefined,
  expectedSessionId: string,
  expectedStreamId: string,
): TeamworkStreamUpdate | null {
  if (!binding || !isRecord(payload) || payload.streamId !== expectedStreamId || binding.streamId !== expectedStreamId
    || binding.sessionId !== expectedSessionId || typeof payload.event !== 'string') return null;
  const nativeContext = payload.nativeContext;
  if (!isRecord(nativeContext) || nativeContext.schemaVersion !== 1 || nativeContext.sessionId !== expectedSessionId
    || nativeContext.streamId !== expectedStreamId || typeof nativeContext.writerGeneration !== 'string'
    || !nativeContext.writerGeneration.trim() || !isIndependentScope(nativeContext.scope)
    || !sameAssistantScope(nativeContext.scope as IndependentScope, binding.scope)) return null;
  if (payload.sessionId !== undefined && payload.sessionId !== expectedSessionId) return null;

  const eventKind = teamworkEvents[payload.event];
  if (!eventKind) return null;
  const data = isRecord(payload.data) ? payload.data : {};
  const sessionId = data.session_id ?? data.sessionId;
  const streamId = data.stream_id ?? data.streamId;
  if (sessionId !== undefined && sessionId !== expectedSessionId) return null;
  if (streamId !== undefined && streamId !== expectedStreamId) return null;
  return { kind: eventKind, event: payload.event, data };
}

function emptyMetadata(): TeamworkMetadata {
  return { status: 'running', drafts: [], plannedWorkers: [] };
}

function normalizeDraft(data: Record<string, unknown>, status: TeamworkDraftStatus): TeamworkDraft {
  return {
    ...(workerId(data.worker_id ?? data.workerId) ? { workerId: workerId(data.worker_id ?? data.workerId) } : {}),
    model: boundedText(data.model ?? data.model_id, 200), provider: boundedText(data.provider ?? data.provider_id, 80),
    name: boundedText(data.name, 120), role: boundedText(data.role, 80),
    content: boundedText(data.content, 24_000), execution_ms: positiveMs(data.execution_ms), status,
    error: typeof data.error === 'string' ? data.error.slice(0, 160) : null,
    ...(typeof data.failure_code === 'string' && safeFailureCodes.has(data.failure_code) ? { failureCode: data.failure_code } : {}),
    swapped: data.swapped === true,
    ...(Number.isSafeInteger(data.worker_index) && Number(data.worker_index) >= 0 ? { workerIndex: Number(data.worker_index) } : {}),
    ...(Number.isSafeInteger(data.attempt) && Number(data.attempt) > 0 ? { attempt: Number(data.attempt) } : {}),
  };
}

function withPlanStatus(planned: TeamworkDraft[], completed: TeamworkDraft): TeamworkDraft[] {
  const index = planned.findIndex((worker) => completed.workerId && worker.workerId === completed.workerId);
  const workerIndex = index < 0 ? planned.findIndex((worker) => completed.workerIndex !== undefined && worker.workerIndex === completed.workerIndex) : index;
  const modelIndex = workerIndex < 0 ? planned.findIndex((worker) => completed.model && worker.model === completed.model && (!completed.role || worker.role === completed.role)) : workerIndex;
  if (modelIndex < 0) return [...planned, completed];
  return planned.map((worker, itemIndex) => itemIndex === modelIndex ? { ...worker, ...completed } : worker);
}

function hasPartialOutput(message: TeamworkLiveMessage, metadata: TeamworkMetadata): boolean {
  return Boolean(message.content?.trim() && message.content !== 'Working on it...')
    || Boolean(message.reasoning?.trim())
    || Boolean(metadata.drafts?.some((draft) => draft.status !== 'planned' && draft.content.trim()));
}

function applyUpdate(metadata: TeamworkMetadata, message: TeamworkLiveMessage, update: TeamworkStreamUpdate): TeamworkMetadata {
  const data = update.data;
  switch (update.kind) {
    case 'stage': {
      const stageValue = boundedText(data.stage, 40) as TeamworkStage;
      const next: TeamworkMetadata = { ...metadata, status: 'running', ...(stages.has(stageValue) ? { stage: stageValue } : {}) };
      if (stageValue === 'debate' && Array.isArray(data.workers)) {
        next.plannedWorkers = data.workers.filter(isRecord).slice(0, 8).map((worker, index) => ({
          ...normalizeDraft({ ...worker, worker_index: worker.worker_index ?? index }, 'planned'),
          workerIndex: Number.isSafeInteger(worker.worker_index) ? Number(worker.worker_index) : index,
        }));
      }
      if (stageValue === 'single_provider' && (typeof data.model === 'string' || typeof data.model_id === 'string')) {
        const single = normalizeDraft({ ...data, worker_id: 'single-provider', worker_index: 0,
          role: typeof data.role === 'string' ? data.role : 'single_provider' }, 'running');
        next.plannedWorkers = withPlanStatus(metadata.plannedWorkers || [], single);
      }
      return next;
    }
    case 'plan':
      return { ...metadata, status: 'running', stage: 'planning', planCompleted: data.status === 'complete',
        ...(Array.isArray(data.candidateDiagnostics) ? { candidateDiagnostics: normalizeCandidateDiagnostics(data.candidateDiagnostics) } : {}) };
    case 'draft': {
      if (update.event === 'teamwork_worker_end') {
        const id = workerId(data.worker_id);
        const status = workerEndStatus(data.status);
        const attempt = Number.isSafeInteger(data.attempt) && Number(data.attempt) > 0 ? Number(data.attempt) : 1;
        if (!id || !status) return metadata;
        const plannedWorkers = (metadata.plannedWorkers || []).map((worker) => {
          if (worker.workerId !== id || (worker.attempt || 0) > attempt) return worker;
          return { ...worker, ...normalizeDraft(data, status), workerId: id, attempt,
            content: worker.content || '', status };
        });
        return { ...metadata, plannedWorkers };
      }
      if (update.event === 'teamwork_worker_start' || update.event === 'teamwork_worker_delta') {
        const id = workerId(data.worker_id);
        if (!id) return metadata;
        const old = (metadata.drafts || []).find((entry) => entry.workerId === id);
        const incomingAttempt = Number.isSafeInteger(data.attempt) && Number(data.attempt) > 0 ? Number(data.attempt) : 1;
        const planned = (metadata.plannedWorkers || []).find((entry) => entry.workerId === id);
        const knownAttempt = Math.max(old?.attempt || 0, planned?.attempt || 0);
        if (incomingAttempt < knownAttempt || incomingAttempt === knownAttempt
          && planned && !['planned', 'running'].includes(planned.status)) return metadata;
        const started = update.event === 'teamwork_worker_start';
        const normalized = normalizeDraft(data, 'running');
        const draft: TeamworkDraft = {
          ...(old && old.attempt === incomingAttempt ? old : normalizeDraft(data, 'running')),
          ...normalized,
          model: normalized.model || old?.model || '',
          provider: normalized.provider || old?.provider,
          name: normalized.name || old?.name || '',
          role: normalized.role || old?.role || '',
          workerId: id,
          attempt: incomingAttempt,
          content: started || old?.attempt !== incomingAttempt ? '' : old?.content || '',
        };
        if (update.event === 'teamwork_worker_delta') {
          if (data.status !== 'streaming' || typeof data.content !== 'string') return metadata;
          draft.content = `${draft.content}${boundedText(data.content, 4_000)}`.slice(0, 24_000);
        }
        const drafts = [...(metadata.drafts || []).filter((entry) => entry.workerId !== id), draft].slice(0, 8);
        return { ...metadata, status: 'running', drafts,
          plannedWorkers: withPlanStatus(metadata.plannedWorkers || [], draft) };
      }
      const status: TeamworkDraftStatus = data.status === 'failed' || Boolean(data.error)
        ? 'failed' : data.skipped === true || data.status === 'skipped' ? 'skipped' : 'complete';
      const draft = normalizeDraft(data, status);
      const drafts = [...(metadata.drafts || [])];
      let existing = drafts.findIndex((entry) => draft.workerId && entry.workerId === draft.workerId);
      if (existing < 0) existing = drafts.findIndex((entry) => entry.status === 'running' && draft.model && entry.model === draft.model && (!draft.role || entry.role === draft.role));
      if (existing < 0) existing = drafts.findIndex((entry) => entry.status === 'running' && draft.role && entry.role === draft.role);
      if (existing >= 0) drafts[existing] = { ...drafts[existing], ...draft,
        content: draft.content || drafts[existing].content };
      else drafts.push(draft);
      return { ...metadata, status: 'running', drafts, plannedWorkers: withPlanStatus(metadata.plannedWorkers || [], draft) };
    }
    case 'critic':
      return { ...metadata, status: 'running', stage: 'critic', critic: {
        model: boundedText(data.model, 200), review: boundedText(data.review, 24_000), execution_ms: positiveMs(data.execution_ms),
      } };
    case 'complete': {
      const completedDrafts = Array.isArray(data.drafts)
        ? data.drafts.filter(isRecord).slice(0, 8).map((draft) => normalizeDraft(draft, draft.error ? 'failed' : 'complete'))
        : (metadata.drafts || []).map((draft) => draft.status === 'running' ? { ...draft, status: 'failed' as const } : draft);
      if (completedDrafts.length === 0 && Array.isArray(data.model_roles)) {
        completedDrafts.push(...data.model_roles.filter(isRecord).slice(0, 8).map((row, index) => normalizeDraft({
          ...row,
          worker_id: row.role === 'single_provider' ? 'single-provider' : row.worker_id,
          worker_index: row.worker_index ?? index,
          name: row.name ?? (row.role === 'single_provider' ? 'Teamwork' : ''),
        }, row.error ? 'failed' : 'complete')));
      }
      const critic = isRecord(data.critic) ? {
        model: boundedText(data.critic.model, 200), review: boundedText(data.critic.review, 24_000), execution_ms: positiveMs(data.critic.execution_ms),
      } : metadata.critic;
      const statsData = isRecord(data.stats) ? data.stats : {};
      return { ...metadata, status: 'running', completeReceived: true, drafts: completedDrafts, critic,
        strategy: boundedText(data.strategy, 40) || metadata.strategy,
        stats: { duration_ms: positiveMs(statsData.duration_ms), drafts_count: Math.max(0, Math.min(8, Number(statsData.drafts_count) || 0)), auto_scaled: statsData.auto_scaled === true } };
    }
    case 'terminal': {
      if (metadata.status === 'stopped') return metadata;
      if (update.event === 'cancel' || update.event === 'worker_exit' && ['cancelled', 'paused'].includes(String(data.status))) {
        return { ...metadata, status: 'stopped' };
      }
      if (update.event === 'error' || update.event === 'apperror') {
        return { ...metadata, status: hasPartialOutput(message, metadata) ? 'partial' : 'failed' };
      }
      if (update.event === 'worker_exit' || update.event === 'stream_end') {
        if (metadata.completeReceived) return { ...metadata, status: 'complete' };
        return { ...metadata, status: hasPartialOutput(message, metadata) ? 'partial' : 'failed' };
      }
      return metadata;
    }
  }
}

function updateStreamMessage<T extends TeamworkLiveMessage>(
  messages: T[],
  streamId: string,
  updater: (message: T) => T,
  requireInFlight = true,
): T[] {
  let index = -1;
  for (let cursor = messages.length - 1; cursor >= 0; cursor -= 1) {
    const message = messages[cursor];
    if (message.role === 'assistant' && message.chatStreamId === streamId
      && (!requireInFlight || message.pending === true || message.streaming === true)) { index = cursor; break; }
  }
  if (index < 0) return messages;
  const next = [...messages];
  next[index] = updater(messages[index]);
  return next;
}

/** Start a visible, stream-bound Teamwork card before the first backend stage arrives. */
export function beginLiveTeamworkTurn<T extends TeamworkLiveMessage>(messages: T[], streamId: string): T[] {
  return updateStreamMessage(messages, streamId, (message) => ({ ...message, teamwork: emptyMetadata() }));
}

/** Apply one authenticated Teamwork SSE update only to its own pending assistant message. */
export function applyLiveTeamworkUpdate<T extends TeamworkLiveMessage>(messages: T[], streamId: string, update: TeamworkStreamUpdate): T[] {
  return updateStreamMessage(messages, streamId, (message) => {
    const prior = isRecord(message.teamwork) ? message.teamwork as TeamworkMetadata : emptyMetadata();
    const teamwork = applyUpdate(prior, message, update);
    const isPartial = teamwork.status === 'stopped' || teamwork.status === 'partial' || teamwork.status === 'failed';
    return { ...message, teamwork, ...(isPartial ? { isPartial: hasPartialOutput(message, teamwork) } : {}) };
  });
}

/** Keep stream identity on the pending assistant, so older same-session SSE cannot mutate a newer turn. */
export function bindLiveChatAssistantStream<T extends TeamworkLiveMessage>(messages: T[], sessionId: string, streamId: string, userText?: string): T[] {
  if (!sessionId || !streamId) return messages;
  let index = -1;
  for (let cursor = messages.length - 1; cursor >= 0; cursor -= 1) {
    const message = messages[cursor];
    if (message.role !== 'assistant' || !(message.pending || message.streaming)) continue;
    const precedingUser = messages.slice(0, cursor).reverse().find((entry) => entry.role === 'user');
    if (userText !== undefined && precedingUser?.content !== userText) continue;
    index = cursor;
    break;
  }
  if (index < 0) return messages;
  const next = [...messages];
  next[index] = { ...messages[index], chatStreamId: streamId, chatStreamSessionId: sessionId };
  return next;
}

/** Finalize a cancelled/failed/completed Teamwork card when its exact stream terminates. */
export function finalizeLiveTeamworkTurn<T extends TeamworkLiveMessage>(messages: T[], streamId: string, update: TeamworkStreamUpdate): T[] {
  return applyLiveTeamworkUpdate(messages, streamId, update);
}
