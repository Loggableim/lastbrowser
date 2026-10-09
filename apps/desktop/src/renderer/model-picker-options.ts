import type { NativeAvailabilityReason, NativeModelAvailability, ScopedModelSelection } from './independent-contracts.js';

export type ModelPickerOptionGroup = Readonly<{
  provider: string;
  providerId: string;
  configured: boolean;
  disabledReason?: 'unavailable' | 'notConfigured';
  models: readonly Readonly<{ id: string; label: string; reasoningEfforts: string[]; supportsIndependent: boolean; nativeAvailability?: NativeModelAvailability }>[];
}>;

export function isModelCatalogResponseCurrent(capturedScopeKey: string, activeScopeKey: string): boolean {
  return capturedScopeKey === activeScopeKey;
}

export function mapScopedModelPickerOptions(selection: ScopedModelSelection & { catalog_status?: Record<string, string> }): ModelPickerOptionGroup[] {
  const catalogStatus = (selection as { catalog_status?: Record<string, string> }).catalog_status;
  const providers = new Map((selection.providers ?? []).map(provider => [provider.id, provider]));
  return (selection.groups ?? [])
    .filter(group => {
      const pid = String(group.provider_id || '').toLowerCase();
      if (catalogStatus) {
        if (pid === 'antigravity' && String(catalogStatus.antigravity || '').toLowerCase() !== 'ready') {
          return false;
        }
        if (catalogStatus[group.provider_id] && String(catalogStatus[group.provider_id]).toLowerCase() === 'unavailable') {
          return false;
        }
      }
      return true;
    })
    .map(group => {
      const provider = providers.get(group.provider_id);
      const models = [...new Map([...group.models, ...(group.extra_models ?? [])].map(entry => [entry.id, entry])).values()]
        .map(entry => {
          const availability = entry.nativeAvailability;
          const identityMatches = !availability || nativeModelAvailabilityMatchesIdentity(availability, {
            provider: group.provider_id, model: entry.id, scope: selection.scope, selectionRevision: selection.revision
          });
          return { id: entry.id, label: entry.label, reasoningEfforts: [...(entry.reasoning_efforts ?? [])], supportsIndependent: entry.supportsIndependent,
            ...(availability ? { nativeAvailability: identityMatches ? availability : { ...availability, supported: false, available: false, reasonCode: 'binding_mismatch' as const } } : {}) };
        });
      return { provider: group.provider, providerId: group.provider_id, configured: group.configured,
        ...(!group.configured ? { disabledReason: provider?.provider_available === false ? 'unavailable' as const : 'notConfigured' as const } : {}), models };
    }).filter(group => group.models.length > 0);
}

export function nativeModelAvailabilityMatchesIdentity(
  availability: NativeModelAvailability,
  expected: Readonly<{ provider: string; model: string; scope: ScopedModelSelection['scope']; selectionRevision: number }>
): boolean {
  return availability.provider === expected.provider && availability.model === expected.model
    && availability.scope.backendProfileId === expected.scope.backendProfileId
    && availability.scope.spaceId === expected.scope.spaceId
    && availability.scope.browserProfileId === expected.scope.browserProfileId
    && availability.selectionRevision === expected.selectionRevision;
}

export function nativeModelUnavailableReason(availability: NativeModelAvailability | undefined): NativeAvailabilityReason | 'binding_mismatch' {
  if (!availability || !availability.supported || !availability.available) return availability?.reasonCode ?? 'binding_mismatch';
  return 'binding_mismatch';
}

export function canSelectNativeModel(providerId: string | undefined, availability: NativeModelAvailability | undefined): boolean {
  return !providerId || Boolean(availability?.supported && availability.available && availability.reasonCode === null);
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
