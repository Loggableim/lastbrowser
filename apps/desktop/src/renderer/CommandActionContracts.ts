/** Actions originate only from the composer UI, never from attached page content. */
export interface CommandContext {
  sessionId: string | null;
  profileId: string;
  spacePath: string;
  browserProfileId: string;
  model?: string;
  modelProvider?: string | null;
  reasoningEffort?: string;
}
export type ChatCommandId = 'model' | 'plan' | 'goal' | 'grill_me' | 'boost' | 'new' | 'stop' | 'help' | 'gquota' | 'plugins';
export type CommandLifetime = 'ui' | 'next_turn' | 'chat';
export interface CommandCapabilities {
  plan: boolean;
  grill_me: boolean;
  boost: boolean;
  goal: boolean;
  gquota: boolean;
  plugins: boolean;
}
export type CommandAction =
  | { kind: 'open_model_picker' | 'open_help' | 'open_goal_editor'; context: CommandContext }
  | { kind: 'new_session' | 'stop_turn'; context: CommandContext }
  | { kind: 'set_mode'; mode: 'plan' | 'action' | 'grill_me' | 'boost'; lifetime: 'chat' | 'next_turn'; expectedRevision?: number; objective?:string; context: CommandContext }
  | { kind: 'goal_command'; args: string; expectedRevision?: number; clientRequestId: string; context: CommandContext }
  | { kind: 'legacy_adapter'; adapter: 'gquota' | 'plugins'; args: string; context: CommandContext }
  | { kind: 'unavailable'; command: ChatCommandId; reason: 'backend_unavailable' | 'missing_session' | 'invalid_arguments'; context: CommandContext };

export function captureCommandContext(context: CommandContext): CommandContext {
  return Object.freeze({ ...context });
}
export function isCommandContextCurrent(expected: CommandContext, current: CommandContext): boolean {
  return expected.sessionId === current.sessionId && expected.profileId === current.profileId
    && expected.spacePath === current.spacePath && expected.browserProfileId === current.browserProfileId;
}

/** Completion of an old request must not update a newly selected chat. */
export async function executeScopedCommand<T>(action: CommandAction, execute: (action: CommandAction) => Promise<T>,
  currentContext: () => CommandContext): Promise<{ current: boolean; result: T }> {
  const result = await execute(action);
  return { current: isCommandContextCurrent(action.context, currentContext()), result };
}

export interface AutoSelectionPolicy {
  schemaVersion: 1;
  mode: 'auto' | 'fixed';
  fixed?: { provider: string; model: string };
  allowedCandidateRefs: string[];
  cloudPolicy: 'deny' | 'explicit_allow';
  budget: { maxCost?: number; maxTokens: number; maxParallel: number };
  quality: 'lite' | 'balanced' | 'max';
  revision: number;
}
export interface AutoRouteObservation {
  state: 'available' | 'waiting' | 'unavailable';
  actualModel: { provider: string; model: string } | null;
  reason: string;
  usageState: 'known' | 'unknown' | 'stale';
  observedAt: string | null;
}
