export type ConfigurableProviderId = 'openrouter' | 'alibaba';

export interface ProviderSettingsRequest {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
}

export type ProviderSettingsRequester = (request: ProviderSettingsRequest) => Promise<unknown>;

/** Save provider credentials or an updated Alibaba endpoint, then fetch its model catalog. */
export async function requestProviderModelCatalog(
  options: {
    providerId: ConfigurableProviderId;
    apiKey: string;
    hasSavedKey: boolean;
    baseUrl: string;
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
      }
    });
  } else if (!hasSavedKey) {
    throw new Error('provider-key-required');
  } else if (providerId === 'alibaba') {
    // A URL-only update preserves the saved key on the backend.
    await requestWebui({
      method: 'POST',
      path: '/api/providers',
      body: { provider: 'alibaba', base_url: baseUrl }
    });
  }

  const response = await requestWebui({
    method: 'GET',
    path: `/api/models/live?provider=${providerId}&catalog=configuration`
  }) as { models?: unknown } | null;
  return Array.isArray(response?.models) ? response.models : [];
}
