export interface ProviderModelSelection {
  model: string;
  provider?: string;
}

/** Resolve an API default to the raw id used by the chat model picker. */
export function resolveCatalogModelSelection(
  rawId: unknown,
  groups: Array<{ providerId?: string; models: Array<{ id: string }> }>,
): ProviderModelSelection {
  const value = typeof rawId === 'string' ? rawId.trim() : '';
  if (!value) return { model: '' };

  const parsed = parseProviderModelId(value);
  if (parsed.provider) return parsed;
  const group = groups.find((candidate) => candidate.models.some((model) => model.id === parsed.model));
  return { model: parsed.model, ...(group?.providerId ? { provider: group.providerId } : {}) };
}

/** Return the first explicitly selected model before any setup/default fallback. */
export function resolvePreferredChatModel(...choices: unknown[]): string {
  for (const choice of choices) {
    if (typeof choice === 'string' && choice.trim()) return choice.trim();
  }
  return '';
}

/** Attach the provider namespace before persisting a bare model ID. */
export function qualifyModelForProvider(model: string, provider?: string): string {
  const value = String(model || '').trim();
  const providerId = String(provider || '').trim();
  if (!value || value.startsWith('@') || !providerId) return value;
  return `@${providerId}:${value}`;
}

/** Split the backend's optional @provider:model spelling without mangling model IDs containing colons. */
export function parseProviderModelId(rawId: string, groupProviderId?: string): ProviderModelSelection {
  const value = String(rawId || '').trim();
  if (value.startsWith('@')) {
    const separator = value.indexOf(':');
    if (separator > 1 && separator < value.length - 1) {
      return { provider: value.slice(1, separator), model: value.slice(separator + 1) };
    }
  }
  return { model: value, ...(groupProviderId ? { provider: groupProviderId } : {}) };
}

export function isProviderModelSelected(
  candidate: { id: string; providerId?: string },
  model: string,
  provider?: string,
): boolean {
  if (candidate.id !== model) return false;
  return !provider || candidate.providerId === provider;
}
