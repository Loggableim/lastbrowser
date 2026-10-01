export type ParsedPersistentGoalCommand = { args: string };

/** Match the native chat command without treating longer slash commands as goals. */
export function parsePersistentGoalCommand(input: string): ParsedPersistentGoalCommand | null {
  const match = String(input || '').trim().match(/^\/goal(?:\s+([\s\S]*))?$/i);
  return match ? { args: (match[1] || '').trim() } : null;
}

/**
 * Goal controls that are safe to send while a chat turn is already running.
 * Resume and goal creation can start another model turn, so they must wait for
 * the active stream to finish.
 */
export function shouldDispatchPersistentGoalControlWhileBusy(input: string, busy: boolean): boolean {
  if (!busy) return false;
  const command = parsePersistentGoalCommand(input);
  if (!command) return false;
  const action = command.args.toLowerCase();
  return action === '' || ['status', 'pause', 'clear', 'stop', 'done'].includes(action);
}

export function buildPersistentGoalCommandBody(args: string, context: {
  sessionId: string;
  profileId: string;
  workspace: string;
  model?: string;
  modelProvider?: string | null;
}): Record<string, unknown> {
  return {
    session_id: context.sessionId,
    args: String(args || '').trim(),
    profile: context.profileId,
    ...(context.workspace ? { workspace: context.workspace } : {}),
    ...(context.workspace ? { scope_goals_to_workspace: true } : {}),
    ...(context.model ? { model: context.model } : {}),
    ...(context.modelProvider ? { model_provider: context.modelProvider } : {}),
  };
}

export function requestPersistentGoalCommand(
  requestWebui: (request: { method: 'POST'; path: '/api/goal'; body: Record<string, unknown> }) => Promise<Record<string, unknown>>,
  args: string,
  context: Parameters<typeof buildPersistentGoalCommandBody>[1]
): Promise<Record<string, unknown>> {
  return requestWebui({
    method: 'POST',
    path: '/api/goal',
    body: buildPersistentGoalCommandBody(args, context),
  });
}

/** Send only non-starting goal controls while a chat stream is active. */
export function requestPersistentGoalControlWhileBusy(
  requestWebui: Parameters<typeof requestPersistentGoalCommand>[0],
  input: string,
  busy: boolean,
  context: Parameters<typeof buildPersistentGoalCommandBody>[1]
): Promise<Record<string, unknown>> | null {
  if (!shouldDispatchPersistentGoalControlWhileBusy(input, busy)) return null;
  const command = parsePersistentGoalCommand(input);
  return command ? requestPersistentGoalCommand(requestWebui, command.args, context) : null;
}
