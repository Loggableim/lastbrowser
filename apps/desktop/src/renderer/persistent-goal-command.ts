import { NativeGoalCommandError } from './native-goal-errors.js';
export type ParsedPersistentGoalCommand = { args: string };
export type NativeGoalRequest=Readonly<{sessionId:string;args:string;workspacePath:string;browserProfileId:string;
  model?:string;modelProvider?:string|null;reasoningEffort?:string;expectedRevision?:number;clientRequestId?:string}>;

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
  return action === '' || ['status', 'pause', 'clear', 'cancel', 'complete', 'stop', 'done'].includes(action);
}

/** Resume/start cannot be accepted while the current chat writer is active. */
export function shouldAcceptPersistentGoalCommand(input: string, busy: boolean): boolean {
  return !busy || shouldDispatchPersistentGoalControlWhileBusy(input, true);
}

export function buildPersistentGoalCommandBody(args: string, context: {
  sessionId: string;
  profileId: string;
  workspace: string;
  model?: string;
  modelProvider?: string | null;
  reasoningEffort?: string;
  expectedRevision?: number;
  clientRequestId?: string;
}): Record<string, unknown> {
  return {
    session_id: context.sessionId,
    args: String(args || '').trim(),
    profile: context.profileId,
    ...(context.workspace ? { workspace: context.workspace } : {}),
    ...(context.workspace ? { scope_goals_to_workspace: true } : {}),
    ...(context.model ? { model: context.model } : {}),
    ...(context.modelProvider ? { model_provider: context.modelProvider } : {}),
    ...(context.reasoningEffort ? { reasoning_effort: context.reasoningEffort } : {}),
    ...(context.expectedRevision !== undefined ? { expected_revision: context.expectedRevision } : {}),
    ...(context.clientRequestId ? { client_request_id: context.clientRequestId } : {}),
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
/** Native Main maps the browser profile; no generic URL/body profile is accepted. */
export async function requestNativePersistentGoalCommand(transport:(request:NativeGoalRequest)=>Promise<Record<string,unknown>>,
  args:string,context:Parameters<typeof buildPersistentGoalCommandBody>[1]&{browserProfileId:string}):Promise<Record<string,unknown>> {
  const response=await transport({sessionId:context.sessionId,args:args.trim(),workspacePath:context.workspace,browserProfileId:context.browserProfileId,
    ...(context.model?{model:context.model}:{}),...(context.modelProvider?{modelProvider:context.modelProvider}:{}),
    ...(context.reasoningEffort?{reasoningEffort:context.reasoningEffort}:{}),
    ...(context.expectedRevision!==undefined?{expectedRevision:context.expectedRevision}:{}),
    ...(context.clientRequestId?{clientRequestId:context.clientRequestId}:{})});
  if(response.ok!==true)throw new NativeGoalCommandError(typeof response.error==='string'?response.error:'goal_action_unconfirmed');
  if(response.session_id!==undefined&&response.session_id!==context.sessionId)throw new NativeGoalCommandError('goal_response_foreign_session');
  const action = args.trim().toLowerCase();
  if (action === 'complete') {
    const goal = response.goal && typeof response.goal === 'object' && !Array.isArray(response.goal)
      ? response.goal as Record<string, unknown> : null;
    if (response.session_id !== context.sessionId || !goal || goal.session_id !== context.sessionId || goal.status !== 'done'
      || !Number.isSafeInteger(goal.revision) || response.revision !== goal.revision
      || typeof context.expectedRevision === 'number' && Number(goal.revision) < context.expectedRevision) {
      throw new NativeGoalCommandError('goal_completion_unconfirmed');
    }
  } else if (action === 'cancel' && (response.session_id !== context.sessionId || response.action !== 'clear'
    || !Number.isSafeInteger(response.revision))) {
    throw new NativeGoalCommandError('goal_cancel_unconfirmed');
  }
  return response;
}
export function requestNativePersistentGoalControlWhileBusy(transport:Parameters<typeof requestNativePersistentGoalCommand>[0],input:string,busy:boolean,
  context:Parameters<typeof requestNativePersistentGoalCommand>[2]):Promise<Record<string,unknown>>|null {
  if(!shouldDispatchPersistentGoalControlWhileBusy(input,busy))return null;
  const command=parsePersistentGoalCommand(input);
  return command?requestNativePersistentGoalCommand(transport,command.args,context):null;
}
