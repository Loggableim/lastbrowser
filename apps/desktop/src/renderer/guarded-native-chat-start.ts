import { isActiveTurnContextCurrent } from './goal-continuation.js';
import type { TeamworkGroundingContext } from './bridge.js';
import type { IndependentScope } from './independent-contracts.js';
import { isMultiAgentModelSelection, parseProviderModelId } from './provider-model-selection.js';
import { isProviderModelQualified } from './provider-chat-evidence.js';
import { isModelActive } from './active-model-selection.js';
import { AI_ORCHESTRATION_ENABLED } from './orchestration-feature.js';
import { canSelectNativeModel } from './model-picker-options.js';
import type { ScopedModelGroup } from './independent-contracts.js';

export type NativeChatStartBinding = Readonly<{
  sessionId: string;
  profileId: string;
  spacePath: string;
  backendProfileName: string;
}>;

export type NativeChatStartSelection = Readonly<{
  scope: IndependentScope;
  model?: string | null;
  provider?: string | null;
}>;

export type NativeChatStartPayload = Readonly<{
  sessionId: string | null;
  message: string;
  model?: string;
  modelProvider?: string;
  profile: string;
  workspace: string;
  backendProfileName?: string;
  reasoningEffort?: string;
  terminalEnabled?: boolean;
  groundingContext?: TeamworkGroundingContext;
}>;

export type NativeChatStartResponse = Readonly<{ sessionId: string; streamId: string }>;

export type GuardedNativeChatStartInput = Readonly<{
  message: string;
  captured: NativeChatStartBinding;
  current: Readonly<Omit<NativeChatStartBinding, 'sessionId'>> & Readonly<{ sessionId: string | null }>;
  selection: NativeChatStartSelection;
  availableModels?: readonly ScopedModelGroup[];
  allowUntestedBetas: boolean;
  qualificationBackendProfileName: string;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  reasoningEffort?: string;
  terminalEnabled?: boolean;
  groundingContext?: TeamworkGroundingContext;
}>;

export type GuardedNativeChatStartBlockReason =
  | 'empty_message'
  | 'stale_context'
  | 'multi_agent_beta_required'
  | 'model_unqualified'
  | 'model_inactive'
  | 'no_active_models'
  | 'model_unavailable';

export type PreparedNativeChatStart =
  | Readonly<{ ok: true; payload: NativeChatStartPayload; inactiveModelFallback: boolean }>
  | Readonly<{ ok: false; reason: GuardedNativeChatStartBlockReason }>;

export type GuardedNativeChatStartResult =
  | Readonly<{ ok: true; payload: NativeChatStartPayload; inactiveModelFallback: boolean; response: NativeChatStartResponse }>
  | Readonly<{ ok: false; reason: GuardedNativeChatStartBlockReason }>
  | Readonly<{ ok: false; reason: 'transport_error'; payload: NativeChatStartPayload; error: unknown }>;

/** Keep qualification, captured-scope validation, and exact IPC payload construction together. */
export function prepareGuardedNativeChatStart(input: GuardedNativeChatStartInput): PreparedNativeChatStart {
  const message = input.message.trim();
  if (!message) return { ok: false, reason: 'empty_message' };
  if (!isActiveTurnContextCurrent(input.captured, input.current)
    || input.captured.backendProfileName !== input.current.backendProfileName
    || input.selection.scope.browserProfileId !== input.captured.profileId
    || !input.selection.scope.backendProfileId.trim()
    || !input.selection.scope.spaceId.trim()) {
    return { ok: false, reason: 'stale_context' };
  }

  const pair = { model: input.selection.model ?? '', provider: input.selection.provider ?? '' };
  let inactiveModelFallback = false;
  const multiAgent = isMultiAgentModelSelection(pair);
  if (multiAgent && (!AI_ORCHESTRATION_ENABLED || !input.allowUntestedBetas)) return { ok: false, reason: 'multi_agent_beta_required' };
  if (input.availableModels && !multiAgent) {
    const candidates = input.availableModels.flatMap(group => group.configured ? [...group.models, ...(group.extra_models ?? [])]
      .filter(entry => entry.supportsIndependent && canSelectNativeModel(group.provider_id, entry.nativeAvailability))
      .map(entry => ({ provider: group.provider_id, model: parseProviderModelId(entry.id, group.provider_id).model })) : []);
    const scope = { browserProfileId: input.captured.profileId, backendProfileName: input.captured.backendProfileName };
    const active = candidates.filter(candidate => isModelActive(input.storage, scope, candidate.provider, candidate.model));
    if (!active.length) return { ok: false, reason: 'no_active_models' };
    const selectedIsActive = active.some(candidate => candidate.provider === pair.provider && candidate.model === pair.model);
    if (!selectedIsActive) {
      if (isModelActive(input.storage, scope, pair.provider, pair.model)) return { ok: false, reason: 'model_unavailable' };
      pair.provider = active[0].provider;
      pair.model = active[0].model;
      inactiveModelFallback = Boolean((input.selection.model ?? '').trim());
    }
  } else if (!multiAgent && !input.allowUntestedBetas
    && (!pair.provider || !pair.model || !isProviderModelQualified(
      pair.provider,
      pair.model,
      input.captured.profileId,
      input.qualificationBackendProfileName,
      input.storage
    ))) {
    return { ok: false, reason: 'model_unqualified' };
  }

  return {
    ok: true,
    inactiveModelFallback,
    payload: {
      sessionId: input.captured.sessionId || null,
      message,
      model: pair.model || undefined,
      modelProvider: pair.provider || undefined,
      profile: input.captured.profileId,
      workspace: input.captured.spacePath,
      ...(input.captured.backendProfileName.trim() ? { backendProfileName: input.captured.backendProfileName } : {}),
      ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
      ...(input.terminalEnabled !== undefined ? { terminalEnabled: input.terminalEnabled } : {}),
      ...(input.groundingContext ? { groundingContext: input.groundingContext } : {}),
    },
  };
}

/** The final side effect is injected; the product guards and payload stay real. */
export async function startGuardedNativeChat(
  input: GuardedNativeChatStartInput,
  startChat: (payload: NativeChatStartPayload) => Promise<NativeChatStartResponse>,
): Promise<GuardedNativeChatStartResult> {
  const prepared = prepareGuardedNativeChatStart(input);
  if (!prepared.ok) return prepared;
  try {
    return { ok: true, payload: prepared.payload, inactiveModelFallback: prepared.inactiveModelFallback, response: await startChat(prepared.payload) };
  } catch (error) {
    return { ok: false, reason: 'transport_error', payload: prepared.payload, error };
  }
}
