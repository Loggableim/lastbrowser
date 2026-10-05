import type { ScopedModelSelection } from './independent-contracts.js';

export type ModelPickerOptionGroup = Readonly<{
  provider: string;
  providerId: string;
  configured: boolean;
  disabledReason?: 'unavailable' | 'notConfigured';
  models: readonly Readonly<{ id: string; label: string; reasoningEfforts: string[]; supportsIndependent: boolean }>[];
}>;

export function mapScopedModelPickerOptions(selection: ScopedModelSelection): ModelPickerOptionGroup[] {
  const providers = new Map((selection.providers ?? []).map(provider => [provider.id, provider]));
  return (selection.groups ?? []).map(group => {
    const provider = providers.get(group.provider_id);
    const models = [...new Map([...group.models, ...(group.extra_models ?? [])].map(entry => [entry.id, entry])).values()]
      .map(entry => ({ id: entry.id, label: entry.label, reasoningEfforts: [...(entry.reasoning_efforts ?? [])], supportsIndependent: entry.supportsIndependent }));
    return { provider: group.provider, providerId: group.provider_id, configured: group.configured,
      ...(!group.configured ? { disabledReason: provider?.provider_available === false ? 'unavailable' as const : 'notConfigured' as const } : {}), models };
  }).filter(group => group.models.length > 0);
}

export function manualModelPickerOptions<T extends Readonly<{ providerId?: string }>>(groups: readonly T[]): T[] {
  return groups.filter(group => Boolean(group.providerId));
}
