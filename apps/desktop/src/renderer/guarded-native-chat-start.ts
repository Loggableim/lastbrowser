import { isActiveTurnContextCurrent } from './goal-continuation.js';
import type { TeamworkGroundingContext } from './bridge.js';
import type { IndependentScope } from './independent-contracts.js';
import { isMultiAgentModelSelection } from './provider-model-selection.js';
import { isProviderModelQualified } from './provider-chat-evidence.js';

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
  backendProfileName: string;
  reasoningEffort?: string;
  groundingContext?: TeamworkGroundingContext;
}>;

export type NativeChatStartResponse = Readonly<{ sessionId: string; streamId: string }>;

export type GuardedNativeChatStartInput = Readonly<{
  message: string;
  captured: NativeChatStartBinding;
  current: Readonly<Omit<NativeChatStartBinding, 'sessionId'>> & Readonly<{ sessionId: string | null }>;
  selection: NativeChatStartSelection;
  allowUntestedBetas: boolean;
  qualificationBackendProfileName: string;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  reasoningEffort?: string;
  groundingContext?: TeamworkGroundingContext;
}>;

export type GuardedNativeChatStartBlockReason =
  | 'empty_message'
  | 'stale_context'
  | 'multi_agent_beta_required'
  | 'model_unqualified';

export type PreparedNativeChatStart =
  | Readonly<{ ok: true; payload: NativeChatStartPayload }>
  | Readonly<{ ok: false; reason: GuardedNativeChatStartBlockReason }>;

export type GuardedNativeChatStartResult =
  | Readonly<{ ok: true; payload: NativeChatStartPayload; response: NativeChatStartResponse }>
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
  const multiAgent = isMultiAgentModelSelection(pair);
  if (multiAgent && !input.allowUntestedBetas) return { ok: false, reason: 'multi_agent_beta_required' };
  if (!multiAgent && !input.allowUntestedBetas
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
    payload: {
      sessionId: input.captured.sessionId || null,
      message,
      model: input.selection.model || undefined,
      modelProvider: input.selection.provider || undefined,
      profile: input.captured.profileId,
      workspace: input.captured.spacePath,
      backendProfileName: input.captured.backendProfileName,
      ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
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
    return { ok: true, payload: prepared.payload, response: await startChat(prepared.payload) };
  } catch (error) {
    return { ok: false, reason: 'transport_error', payload: prepared.payload, error };
  }
}
