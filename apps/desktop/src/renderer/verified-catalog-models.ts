/**
 * OpenCode Go models that returned assistant text from one ping.
 * Ids that failed stay unmarked. This list is not the whole catalog.
 */
export const VERIFIED_CATALOG_MODELS: Readonly<Record<string, readonly string[]>> = {
  'opencode-go': [
    'cat-jam-free',
    'claude-haiku-5-5',
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'deepseek-v4.1-flash',
    'gemini-4-argon-contributor',
    'glm-5.1',
    'glm-5.2',
    'glm-5.3',
    'gpt-5.6-luna',
    'gpt-6-luna',
    'grok-4.6',
    'grok-4.7',
    'hy3',
    'hy4-preview',
    'kimi-k2.6',
    'kimi-k2.7-code',
    'kimi-k3',
    'longcat-2.5-preview-free',
    'mimo-v2.5',
    'mimo-v2.5-pro',
    'mimo-v2.6-flash',
    'mimo-v2.6-pro',
    'minimax-m2.5',
    'minimax-m2.7',
    'minimax-m3',
    'muse-spark-1.2-contributor',
    'omen-alpha',
    'qwen3.6-plus',
    'qwen3.7-max',
    'qwen3.7-plus',
    'qwen3.8-flash',
    'qwen3.8-max',
    'space-bunny',
    'step-5-preview',
  ],
};

function canonicalProvider(providerId: string): string {
  const id = providerId.trim().toLowerCase().replace(/_/g, '-');
  return id === 'go' || id === 'opencode-go-sub' ? 'opencode-go' : id;
}

/** True only for a provider/model pair that answered the ping. */
export function isVerifiedCatalogModel(providerId: string, modelId: string): boolean {
  const ids = VERIFIED_CATALOG_MODELS[canonicalProvider(providerId)];
  return Boolean(modelId.trim()) && Boolean(ids?.includes(modelId.trim()));
}

/**
 * OpenCode Go is a stable provider, so the provider itself does not sit
 * behind the untested-beta gate. Individual models still do, unless they
 * are in the verified list or have a successful chat in this profile.
 */
export function providerUsesVerifiedModelList(providerId: string): boolean {
  return canonicalProvider(providerId) === 'opencode-go';
}
