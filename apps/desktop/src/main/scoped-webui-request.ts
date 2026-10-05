import type { IpcMainInvokeEvent, WebContents } from 'electron';
import { captureTrustedShellSender } from './ipc-sender.js';
import type { WebuiRequest } from './sidekick-api.js';

export type WebuiScopeSelection = Readonly<{
  browserProfileId: string;
  workspacePath: string | null;
  backendProfileName?: string;
}>;

type BoundProfile = { scope: { browserProfileId: string }; backendProfileName: string };
type Options = {
  isShell: (contents: WebContents) => boolean;
  lookupBinding: (browserProfileId: string, workspacePath: string | null, backendProfileName?: string) => Promise<BoundProfile | null>;
  request: (request: WebuiRequest) => Promise<Record<string, unknown>>;
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** The renderer selects a saved Space; only Main can attach its backend cookie. */
export async function requestScopedWebui(
  event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>,
  raw: unknown,
  options: Options
): Promise<Record<string, unknown>> {
  const recheck = captureTrustedShellSender(event, options.isShell);
  if (!record(raw) || typeof raw.path !== 'string' || 'profile' in raw || 'backendProfileName' in raw)
    throw new Error('Invalid WebUI bridge request');
  const { scopeSelection, ...request } = raw;
  let endpoint: string;
  try { endpoint = decodeURIComponent(new URL(raw.path, 'http://127.0.0.1').pathname).replace(/\/+$/, ''); }
  catch { throw new Error('Invalid WebUI bridge path'); }
  if (['/api/teamwork/config', '/api/teamwork/status'].includes(endpoint) && scopeSelection === undefined)
    throw new Error('Teamwork requires a saved Space selection');
  let boundRequest = request as WebuiRequest;
  if (scopeSelection !== undefined) {
    const method = raw.method ?? 'GET';
    if (!((raw.path === '/api/teamwork/config' && (method === 'GET' || method === 'POST'))
      || (raw.path === '/api/teamwork/status' && method === 'GET')))
      throw new Error('This WebUI endpoint does not support a Space binding');
    if (!record(scopeSelection)
      || Object.keys(scopeSelection).some(key => !['browserProfileId', 'workspacePath', 'backendProfileName'].includes(key))
      || typeof scopeSelection.browserProfileId !== 'string'
      || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(scopeSelection.browserProfileId)
      || !(scopeSelection.workspacePath === null || (typeof scopeSelection.workspacePath === 'string'
        && scopeSelection.workspacePath.length <= 2048 && !/[\x00-\x1f]/.test(scopeSelection.workspacePath)))
      || (scopeSelection.backendProfileName !== undefined && (typeof scopeSelection.backendProfileName !== 'string'
        || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(scopeSelection.backendProfileName))))
      throw new Error('Invalid WebUI Space selection');
    if (raw.headers !== undefined && (!record(raw.headers)
      || Object.entries(raw.headers).some(([key, value]) => typeof value !== 'string'
        || /^(cookie|authorization|x-sidekick-profile|x-sidekick-session-token|x-lastbrowser-bridge-token)$/i.test(key))))
      throw new Error('Renderer cannot choose WebUI profile or authentication headers');
    const selection = scopeSelection as WebuiScopeSelection;
    const binding = await options.lookupBinding(selection.browserProfileId, selection.workspacePath, selection.backendProfileName);
    recheck();
    if (!binding || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(binding.backendProfileName)
      || binding.scope.browserProfileId !== selection.browserProfileId
      || (selection.backendProfileName !== undefined && binding.backendProfileName !== selection.backendProfileName))
      throw new Error('The selected Space has no matching backend profile binding');
    boundRequest = { ...boundRequest, profile: binding.backendProfileName };
  }
  recheck();
  const response = await options.request(boundRequest);
  recheck();
  return response;
}
