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

const VIRTUAL_ORCHESTRATION_MODEL_IDS = new Set([
  'teamwork',
  'smart-track-low',
  'smart-track-medium',
  'smart-track-high'
]);

export function manualModelPickerOptions<T extends Readonly<{ providerId?: string; models?: readonly Readonly<{ id?: string }>[] }>>(groups: readonly T[]): T[] {
  return groups.filter(group => {
    if (group.providerId) return true;
    // Empty provider IDs are reserved for the renderer's fixed orchestration entries.
    // Do not let arbitrary catalog groups masquerade as selectable virtual models.
    return Boolean(group.models?.length) && group.models!.every(model => VIRTUAL_ORCHESTRATION_MODEL_IDS.has(model.id ?? ''));
  });
}
