export type ConfigurableProviderId = 'openrouter' | 'alibaba' | 'xiaomi';

export interface ProviderSettingsRequest {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
  scopeSelection?: Readonly<{ browserProfileId: string; workspacePath: string | null; backendProfileName?: string }>;
}

export type ProviderSettingsRequester = (request: ProviderSettingsRequest) => Promise<unknown>;
export type ProviderScopeSelection = NonNullable<ProviderSettingsRequest['scopeSelection']>;

export function isProviderSettingsScopeCurrent(captured: ProviderScopeSelection, current: ProviderScopeSelection,
  capturedGeneration: number, currentGeneration: number): boolean {
  return capturedGeneration === currentGeneration && captured.browserProfileId === current.browserProfileId
    && captured.workspacePath === current.workspacePath && (captured.backendProfileName ?? '') === (current.backendProfileName ?? '');
}

export function requestProviderSettingsInScope(requester: ProviderSettingsRequester, request: ProviderSettingsRequest,
  scope: ProviderScopeSelection, isCurrent: () => boolean): Promise<unknown> {
  if (!isCurrent()) return Promise.reject(new Error('provider_settings_scope_stale'));
  return requester({ ...request, scopeSelection: scope });
}

export type XiaomiKeyKind = 'paygo' | 'token-plan' | 'unknown';
export function xiaomiKeyKind(apiKey: string): XiaomiKeyKind {
  const key = apiKey.trim();
  if (key.startsWith('sk-')) return 'paygo';
  if (key.startsWith('tp-') || key.startsWith('ttp-')) return 'token-plan';
  return 'unknown';
}

export function validateXiaomiBaseUrl(apiKey: string, baseUrl: string, hasSavedKey = false): string | null {
  const keyKind = xiaomiKeyKind(apiKey);
  const value = baseUrl.trim();
  if (keyKind === 'unknown' && !hasSavedKey) return 'mimo_key_type_invalid';
  if (keyKind === 'paygo' && value !== 'https://api.xiaomimimo.com/v1') return 'mimo_base_url_invalid';
  if ((keyKind === 'token-plan' || keyKind === 'unknown' && hasSavedKey) && !value) return 'mimo_token_plan_base_url_required';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.port && url.port !== '443')
      || !['api.xiaomimimo.com','token-plan-ams.xiaomimimo.com','token-plan-cn.xiaomimimo.com'].includes(url.hostname.toLowerCase())
      || url.pathname !== '/v1') return 'mimo_base_url_invalid';
    if (keyKind === 'token-plan' && !['token-plan-ams.xiaomimimo.com','token-plan-cn.xiaomimimo.com'].includes(url.hostname.toLowerCase()))
      return 'mimo_base_url_invalid';
  } catch { return 'mimo_base_url_invalid'; }
  return null;
}

const mimoSafeErrors = new Set(['mimo_api_key_required','mimo_key_type_invalid','mimo_token_plan_base_url_required','mimo_base_url_invalid',
  'mimo_auth_failed','mimo_rate_limited','mimo_provider_unavailable','mimo_invalid_response']);
export function safeXiaomiErrorCode(error: unknown): string {
  const candidate = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  return mimoSafeErrors.has(candidate) ? candidate : 'mimo_provider_unavailable';
}

export function isXiaomiProviderSaveAck(value: unknown, expectedBaseUrl: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ack = value as Record<string, unknown>;
  return ack.ok === true && ack.provider === 'xiaomi' && (ack.action === 'updated' || ack.action === 'preserved')
    && ack.has_key === true && ack.base_url === expectedBaseUrl;
}

export async function readXiaomiProviderStatus(request: ProviderSettingsRequester): Promise<{ hasKey: boolean; baseUrl: string } | null> {
  const response = await request({ method: 'GET', path: '/api/providers' });
  if (!response || typeof response !== 'object' || Array.isArray(response)) return null;
  const providers = (response as Record<string, unknown>).providers;
  if (!Array.isArray(providers)) return null;
  const provider = providers.find(row => Boolean(row && typeof row === 'object' && !Array.isArray(row)
    && (row as Record<string, unknown>).id === 'xiaomi')) as Record<string, unknown> | undefined;
  if (!provider || typeof provider.has_key !== 'boolean' || typeof provider.base_url !== 'string') return null;
  return { hasKey: provider.has_key, baseUrl: provider.base_url };
}

export async function saveAndLoadXiaomiModels(options: { apiKey: string; hasSavedKey: boolean; baseUrl: string }, request: ProviderSettingsRequester): Promise<unknown[]> {
  const apiKey = options.apiKey.trim();
  const baseUrl = options.baseUrl.trim();
  const invalid = validateXiaomiBaseUrl(apiKey, baseUrl, options.hasSavedKey);
  if (invalid) throw new Error(invalid);
  if (apiKey || !options.hasSavedKey) {
    if (!apiKey) throw new Error('mimo_api_key_required');
  }
  const saved = await request({ method: 'POST', path: '/api/providers', body: { provider: 'xiaomi', base_url: baseUrl, ...(apiKey ? { api_key: apiKey } : {}) } });
  if (!isXiaomiProviderSaveAck(saved, baseUrl)) throw new Error('mimo_invalid_response');
  const status = await readXiaomiProviderStatus(request);
  if (!status?.hasKey || status.baseUrl !== baseUrl) throw new Error('mimo_invalid_response');
  const response = await request({ method: 'GET', path: '/api/models/live?provider=xiaomi&catalog=configuration' }) as { models?: unknown } | null;
  return Array.isArray(response?.models) ? response.models : [];
}

export async function testXiaomiConnection(options: { apiKey: string; hasSavedKey: boolean; baseUrl: string }, request: ProviderSettingsRequester): Promise<boolean> {
  const apiKey = options.apiKey.trim();
  const invalid = validateXiaomiBaseUrl(apiKey, options.baseUrl, options.hasSavedKey);
  if (invalid) throw new Error(invalid);
  if (!apiKey && !options.hasSavedKey) throw new Error('mimo_api_key_required');
  const response = await request({ method: 'POST', path: '/api/providers/test', body: { provider: 'xiaomi', base_url: options.baseUrl.trim(), ...(apiKey ? { api_key: apiKey } : {}) } }) as { ok?: unknown; verified?: unknown } | null;
  return response?.ok === true || response?.verified === true;
}

/** Save provider credentials or an updated Alibaba endpoint, then fetch its model catalog. */
export async function requestProviderModelCatalog(
  options: {
    providerId: ConfigurableProviderId;
    apiKey: string;
    hasSavedKey: boolean;
    baseUrl: string;
    scopeSelection?: ProviderScopeSelection;
  },
  requestWebui: ProviderSettingsRequester
): Promise<unknown[]> {
  const { providerId, hasSavedKey } = options;
  const apiKey = options.apiKey.trim();
  const baseUrl = options.baseUrl.trim();

  if (providerId === 'alibaba') {
    let parsedBaseUrl: URL;
    try {
      parsedBaseUrl = new URL(baseUrl);
    } catch {
      throw new Error('alibaba-base-url-required');
    }
    if (parsedBaseUrl.protocol !== 'https:') throw new Error('alibaba-https-required');
  }

  if (apiKey) {
    await requestWebui({
      method: 'POST',
      path: '/api/providers',
      body: {
        provider: providerId,
        api_key: apiKey,
        ...(providerId === 'alibaba' ? { base_url: baseUrl } : {})
      },
      ...(options.scopeSelection ? { scopeSelection: options.scopeSelection } : {})
    });
  } else if (!hasSavedKey) {
    throw new Error('provider-key-required');
  } else if (providerId === 'alibaba') {
    // A URL-only update preserves the saved key on the backend.
    await requestWebui({
      method: 'POST',
      path: '/api/providers',
      body: { provider: 'alibaba', base_url: baseUrl },
      ...(options.scopeSelection ? { scopeSelection: options.scopeSelection } : {})
    });
  }

  const response = await requestWebui({
    method: 'GET',
    path: `/api/models/live?provider=${providerId}&catalog=configuration`,
    ...(options.scopeSelection ? { scopeSelection: options.scopeSelection } : {})
  }) as { models?: unknown } | null;
  return Array.isArray(response?.models) ? response.models : [];
}
