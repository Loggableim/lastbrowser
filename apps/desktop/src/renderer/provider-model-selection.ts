export interface ProviderModelSelection {
  model: string;
  provider?: string;
}

export interface PreferredChatModelSelectionInput {
  spaceSelection?: ProviderModelSelection | null;
  selectedModel?: unknown;
  selectedModelProvider?: unknown;
  setupModel?: unknown;
  setupProvider?: unknown;
  configuredSelection?: ProviderModelSelection | null;
}

/** Resolve one model/provider pair for every chat surface and its backend request. */
export function resolvePreferredChatModelSelection(input: PreferredChatModelSelectionInput): ProviderModelSelection {
  const candidates = [
    input.spaceSelection,
    { model: input.selectedModel, provider: input.selectedModelProvider },
    { model: input.setupModel, provider: input.setupProvider },
    input.configuredSelection,
  ];
  for (const candidate of candidates) {
    const rawModel = typeof candidate?.model === 'string' ? candidate.model.trim() : '';
    if (!rawModel) continue;
    const rawProvider = typeof candidate?.provider === 'string' ? candidate.provider.trim() : '';
    return parseProviderModelId(rawModel, rawProvider);
  }
  return { model: '' };
}

/** Resolve an API default to the raw id used by the chat model picker. */
export function resolveCatalogModelSelection(
  rawId: unknown,
  groups: Array<{ providerId?: string; models: Array<{ id: string }> }>,
  activeProvider?: unknown,
): ProviderModelSelection {
  const value = typeof rawId === 'string' ? rawId.trim() : '';
  if (!value) {
    const provider = typeof activeProvider === 'string' ? activeProvider.trim() : '';
    const activeGroup = provider
      ? groups.find((candidate) => candidate.providerId === provider)
      : undefined;
    const firstModel = activeGroup?.models
      .map((model) => catalogModelForGroup(model.id, activeGroup.providerId, groups))
      .find((model): model is ProviderModelSelection => Boolean(model?.model));
    return firstModel || { model: '' };
  }

  const parsed = parseProviderModelId(value, findQualifiedGroupProvider(value, groups));
  if (parsed.provider) return parsed;
  const preferredProvider = typeof activeProvider === 'string' ? activeProvider.trim() : '';
  const preferredGroup = preferredProvider
    ? groups.find((candidate) => candidate.providerId === preferredProvider
      && candidate.models.some((model) => catalogModelForGroup(model.id, candidate.providerId, groups)?.model === parsed.model))
    : undefined;
  const group = preferredGroup
    || groups.find((candidate) => candidate.models.some((model) => catalogModelForGroup(model.id, candidate.providerId, groups)?.model === parsed.model));
  return { model: parsed.model, ...(group?.providerId ? { provider: group.providerId } : {}) };
}

function catalogModelForGroup(
  rawModelId: string,
  groupProviderId: string | undefined,
  groups: Array<{ providerId?: string; models: Array<{ id: string }> }>,
): ProviderModelSelection | null {
  const rawId = typeof rawModelId === 'string' ? rawModelId.trim() : '';
  if (!rawId) return null;
  const providerId = typeof groupProviderId === 'string' ? groupProviderId.trim() : '';
  if (!providerId) {
    const parsed = parseProviderModelId(rawId);
    return parsed.provider ? parsed : { model: rawId };
  }
  if (!rawId.startsWith('@')) return { model: rawId, provider: providerId };

  const catalogProvider = findQualifiedGroupProvider(rawId, groups) || parseProviderModelId(rawId).provider;
  if (catalogProvider !== providerId) return null;
  const parsed = parseProviderModelId(rawId, providerId);
  if (parsed.provider !== providerId) return null;
  return parsed;
}

function findQualifiedGroupProvider(
  value: string,
  groups: Array<{ providerId?: string; models: Array<{ id: string }> }>,
): string | undefined {
  if (!value.startsWith('@')) return undefined;
  const body = value.slice(1);
  const matches = groups.flatMap((group) => {
    const providerId = typeof group.providerId === 'string' ? group.providerId.trim() : '';
    if (!providerId || !body.startsWith(`${providerId}:`)) return [];
    const modelId = body.slice(providerId.length + 1);
    const containsModel = group.models.some((model) => {
      if (model.id === modelId) return true;
      const groupModel = parseProviderModelId(model.id, providerId);
      return groupModel.provider === providerId && groupModel.model === modelId;
    });
    return containsModel ? [{ providerId }] : [];
  });
  return matches.sort((left, right) => right.providerId.length - left.providerId.length)[0]?.providerId;
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

/** Split the backend's optional @provider:model spelling without mangling model IDs containing colons.
 * Colon-bearing provider IDs are unambiguous only when supplied as the group hint; without one,
 * retain the historical first-colon split (for example @custom:gemma4:31b -> custom + gemma4:31b).
 */
export function parseProviderModelId(rawId: string, groupProviderId?: string): ProviderModelSelection {
  const value = String(rawId || '').trim();
  if (value.startsWith('@')) {
    const hintedProvider = String(groupProviderId || '').trim();
    const body = value.slice(1);
    const hintedPrefix = hintedProvider ? `${hintedProvider}:` : '';
    if (hintedPrefix && body.startsWith(hintedPrefix) && body.length > hintedPrefix.length) {
      return { provider: hintedProvider, model: body.slice(hintedPrefix.length) };
    }
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
