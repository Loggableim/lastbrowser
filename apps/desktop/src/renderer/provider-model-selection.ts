export interface ProviderModelSelection {
  model: string;
  provider?: string;
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
