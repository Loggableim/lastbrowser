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

function requestBodyRecord(value: unknown): Record<string, unknown> | null {
  return record(value) ? value : null;
}

const configurableProviderIds = new Set(['alibaba', 'openrouter', 'xiaomi']);
const keyProviderIds = new Set(['alibaba', 'anthropic', 'deepseek', 'gemini', 'google', 'kimi-coding', 'lmstudio',
  'minimax', 'minimax-cn', 'mistralai', 'morph', 'nvidia', 'ollama', 'ollama-cloud', 'openai', 'openrouter',
  'opencode-go', 'opencode-zen', 'x-ai', 'xiaomi', 'zai']);
const ollamaTestProviderIds = new Set(['ollama', 'ollama-cloud', 'xiaomi']);

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}

function isProviderSaveBody(value: unknown): boolean {
  const body = requestBodyRecord(value);
  if (!body || !onlyKeys(body, ['provider', 'api_key', 'base_url', 'models'])
    || typeof body.provider !== 'string') return false;
  const provider = body.provider.trim().toLowerCase();
  if (body.provider !== provider || !keyProviderIds.has(provider)) return false;
  if ('api_key' in body && typeof body.api_key !== 'string') return false;
  if ('base_url' in body && (typeof body.base_url !== 'string' || !['alibaba', 'xiaomi'].includes(provider))) return false;
  if ('models' in body && (!Array.isArray(body.models) || body.models.length > 500
    || !['alibaba', 'openrouter'].includes(provider)
    || body.models.some(model => typeof model !== 'string' || model !== model.trim() || model.length > 256
      || !/^[A-Za-z0-9_.:/+@-]+$/.test(model)))) return false;
  return ['api_key', 'base_url', 'models'].some(key => key in body);
}

function isProviderTestBody(value: unknown): boolean {
  const body = requestBodyRecord(value);
  if (!body || !onlyKeys(body, ['provider', 'base_url', 'api_key'])
    || typeof body.provider !== 'string' || typeof body.base_url !== 'string') return false;
  if ('api_key' in body && typeof body.api_key !== 'string') return false;
  const provider = body.provider.trim().toLowerCase();
  return body.provider === provider && ollamaTestProviderIds.has(provider);
}

function configurationCatalogProvider(raw: Record<string, unknown>, url: URL): string | null {
  if (url.pathname !== '/api/models/live') return null;
  let entries: Array<[string, unknown]>;
  if (raw.query !== undefined) {
    if (url.search !== '' || !record(raw.query)) return null;
    entries = Object.entries(raw.query);
    if (entries.some(([, value]) => typeof value !== 'string')) return null;
  } else {
    entries = [...url.searchParams.entries()];
  }
  if (entries.length !== 2 || entries.some(([key]) => key !== 'provider' && key !== 'catalog')) return null;
  const query = new Map(entries as Array<[string, string]>);
  const provider = query.get('provider');
  return provider && query.get('catalog') === 'configuration' && configurableProviderIds.has(provider) ? provider : null;
}

function isProviderSettingsScopedRequest(raw: Record<string, unknown>, endpoint: string, url: URL): boolean {
  const method = raw.method ?? 'GET';
  if (url.pathname !== endpoint) return false;
  if (endpoint === '/api/providers' && method === 'GET') return url.search === '' && raw.query === undefined;
  if (endpoint === '/api/providers' && method === 'POST')
    return url.search === '' && raw.query === undefined && isProviderSaveBody(raw.body);
  if (endpoint === '/api/providers/test' && method === 'POST')
    return url.search === '' && raw.query === undefined && isProviderTestBody(raw.body);
  if (endpoint === '/api/models/live' && method === 'GET') return configurationCatalogProvider(raw, url) !== null;
  if (endpoint === '/api/models' && method === 'GET') return url.search === '' && raw.query === undefined;
  return false;
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
  if (!raw.path.startsWith('/api/') || raw.path.startsWith('//') || raw.path.includes('\\') || raw.path.includes('#'))
    throw new Error('Invalid WebUI bridge path');
  const { scopeSelection, ...request } = raw;
  let endpoint: string;
  let parsedRequestUrl: URL;
  try {
    parsedRequestUrl = new URL(raw.path, 'http://127.0.0.1');
    if (parsedRequestUrl.origin !== 'http://127.0.0.1') throw new Error('Invalid WebUI bridge path');
    endpoint = decodeURIComponent(parsedRequestUrl.pathname).replace(/\/+$/, '');
  }
  catch { throw new Error('Invalid WebUI bridge path'); }
  const requiresSpaceBinding = ['/api/teamwork/config', '/api/teamwork/status'].includes(endpoint)
    || endpoint === '/api/providers' || endpoint === '/api/providers/test' || endpoint === '/api/models/live'
    || endpoint === '/api/models';
  if (requiresSpaceBinding && scopeSelection === undefined)
    throw new Error('A saved Space selection is required for this WebUI endpoint');
  let boundRequest = request as WebuiRequest;
  if (scopeSelection !== undefined) {
    const method = raw.method ?? 'GET';
    const teamworkRequest = (endpoint === '/api/teamwork/config' && (method === 'GET' || method === 'POST'))
      || (endpoint === '/api/teamwork/status' && method === 'GET');
    const exactTeamworkRequest = teamworkRequest && parsedRequestUrl.search === '' && raw.query === undefined;
    const providerSettingsRequest = isProviderSettingsScopedRequest(raw, endpoint, parsedRequestUrl);
    if (!exactTeamworkRequest && !providerSettingsRequest)
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
