export type ParsedPersistentGoalCommand = { args: string };

/** Match the native chat command without treating longer slash commands as goals. */
export function parsePersistentGoalCommand(input: string): ParsedPersistentGoalCommand | null {
  const match = String(input || '').trim().match(/^\/goal(?:\s+([\s\S]*))?$/i);
  return match ? { args: (match[1] || '').trim() } : null;
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
