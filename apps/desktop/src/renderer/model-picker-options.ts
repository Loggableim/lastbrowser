import type { NativeAvailabilityReason, NativeModelAvailability, ScopedModelSelection, ScopedModelEntry, LocalStoreRuntimeCapability } from './independent-contracts.js';
import { AI_ORCHESTRATION_ENABLED } from './orchestration-feature.js';
import { isRetiredProvider } from './retired-providers.js';
import { providerDeployment, providerHostingLabel, type ProviderDeployment } from './provider-presentation.js';

export type ModelPickerOptionGroup = Readonly<{
  provider: string;
  providerId: string;
  catalogTier?: 'paid' | 'free';
  configured: boolean;
  deployment?: ProviderDeployment;
  disabledReason?: 'unavailable' | 'notConfigured';
  models: readonly Readonly<{ id: string; label: string; listingStatus?: 'current' | 'configured' | 'fallback'; reasoningEfforts: string[]; supportsIndependent: boolean; nativeAvailability?: NativeModelAvailability;
    deploymentKind?:ProviderDeployment;modelSource?:'explicit_config'|'local_catalog';contextLength?:number|null;contextLengthSource?:'live_catalog'|'local_catalog'|'official_model_docs'|'catalog'|'provided_catalog'|'models_dev'|'explicit_config'|'unknown';localRuntime?:LocalStoreRuntimeCapability;localUnavailableReason?:string }>[];
}>;

/** Device evidence is necessary, but never overrides the native adapter gate. */
export function isLocalStoreModelRuntimeReady(entry:Pick<ScopedModelEntry,'id'|'deploymentKind'|'contextLength'|'contextLengthSource'|'localRuntime'>):boolean {
  const runtime=entry.localRuntime;
  return entry.deploymentKind==='local'&&runtime?.state==='ready'&&runtime.toolCallingQualified===true
    &&runtime.artifactId===entry.id&&entry.contextLengthSource==='local_catalog'&&entry.contextLength===runtime.contextTokens;
}

export function isLocalStoreModelQualified(providerId:string|undefined,entry:Pick<ScopedModelEntry,'id'|'deploymentKind'|'contextLength'|'contextLengthSource'|'localRuntime'|'nativeAvailability'> & {supportsIndependent?:boolean}):boolean {
  return providerId==='local-store'&&entry.supportsIndependent!==false&&isLocalStoreModelRuntimeReady(entry)
    &&canSelectNativeModel(providerId,entry.nativeAvailability);
}

export function localStoreModelUnavailableLabel(entry:Pick<ScopedModelEntry,'id'|'deploymentKind'|'contextLength'|'contextLengthSource'|'localRuntime'>):string|null {
  if(isLocalStoreModelRuntimeReady(entry))return null;
  const runtime=entry.localRuntime;
  const code=runtime?.state==='unavailable'?runtime.reasonCode:runtime?.state==='ready'&&!runtime.toolCallingQualified?'local_standard_tool_quality_proof_required':'';
  return ({text_model_not_qualified:'Lokales Modell noch nicht freigegeben',model_not_installed_verified:'Installation noch nicht geprüft',
    successful_device_benchmark_required:'Gerätetest fehlt',local_standard_tool_quality_proof_required:'Ausführlicher Werkzeugtest fehlt',
    fresh_hardware_admission_required:'Aktuelle Speicherprüfung erforderlich'} as Record<string,string>)[code]??'Lokale Ausführung noch nicht bestätigt';
}

export function isModelCatalogResponseCurrent(capturedScopeKey: string, activeScopeKey: string): boolean {
  return capturedScopeKey === activeScopeKey;
}

export function isModelCatalogCacheCurrent(cachedScopeKey: string | null, activeScopeKey: string): boolean {
  return cachedScopeKey !== null && cachedScopeKey === activeScopeKey;
}

export function mapScopedModelPickerOptions(selection: ScopedModelSelection & { catalog_status?: Record<string, string> }): ModelPickerOptionGroup[] {
  const catalogStatus = (selection as { catalog_status?: Record<string, string> }).catalog_status;
  const providerCatalog = selection.providerModelCatalog;
  const catalogScopeMatches = providerCatalog?.scope.browserProfileId === selection.scope.browserProfileId
    && providerCatalog.scope.backendProfileId === selection.scope.backendProfileId
    && providerCatalog.scope.spaceId === selection.scope.spaceId;
  const currentModels = providerCatalog && catalogScopeMatches
    ? new Map(providerCatalog.providers.map(provider => [provider.providerId, new Map(provider.models.filter(model =>
      model.listed.status === 'current' || model.listed.status === 'configured' || model.listed.status === 'fallback')
      .map(model => [model.id, model.listed.status as 'current' | 'configured' | 'fallback']))]))
    : null;
  const providers = new Map((selection.providers ?? []).map(provider => [provider.id, provider]));
  return (selection.groups ?? [])
    .filter(group => {
      const pid = String(group.provider_id || '').toLowerCase();
      if (isRetiredProvider(pid)) return false;
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
        .filter(entry => {
          if (group.catalog_tier === 'paid' || group.catalog_tier === 'free') return true;
          if (!currentModels) return true;
          const listed = currentModels.get(group.provider_id);
          if (!listed || listed.has(entry.id)) return true;
          return group.provider_id === 'openrouter' && entry.id === 'openrouter/free';
        })
        .map(entry => {
          const availability = entry.nativeAvailability;
          const listingStatus = currentModels?.get(group.provider_id)?.get(entry.id);
          const identityMatches = !availability || nativeModelAvailabilityMatchesIdentity(availability, {
            provider: group.provider_id, model: entry.id, scope: selection.scope, selectionRevision: selection.revision
          });
          const local = group.provider_id==='local-store';
          const localUnavailableReason=local?localStoreModelUnavailableLabel(entry):null;
          return { id: entry.id, label: `${entry.label}${localUnavailableReason?` · ${localUnavailableReason}`:''}`, ...(listingStatus ? { listingStatus } : {}), reasoningEfforts: [...(entry.reasoning_efforts ?? [])], supportsIndependent: entry.supportsIndependent&&(!local||isLocalStoreModelRuntimeReady(entry)),
            ...(entry.deploymentKind?{deploymentKind:entry.deploymentKind}:{}),
            ...(entry.modelSource?{modelSource:entry.modelSource}:{}),
            ...(entry.contextLength!==undefined?{contextLength:entry.contextLength}:{}),
            ...(entry.contextLengthSource?{contextLengthSource:entry.contextLengthSource}:{}),
            ...(entry.localRuntime?{localRuntime:entry.localRuntime}:{}),
            ...(localUnavailableReason?{localUnavailableReason}:{}),
            ...(availability ? { nativeAvailability: identityMatches ? availability : { ...availability, supported: false, available: false, reasonCode: 'binding_mismatch' as const } } : {}) };
        });
      const deployment = providerDeployment(group.provider_id, undefined, group.deploymentKind??group.deployment);
      const catalogTier = group.catalog_tier === 'paid' || group.catalog_tier === 'free' ? group.catalog_tier : undefined;
      const providerLabel = catalogTier ? group.provider : providerHostingLabel(group.provider_id, group.provider, deployment);
      return { provider: providerLabel, ...(catalogTier ? { catalogTier } : {}), deployment, providerId: group.provider_id, configured: group.configured,
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

export function manualModelPickerOptions<T extends Readonly<{ providerId?: string; models?: readonly Readonly<{ id?: string }>[] }>>(
  groups: readonly T[], orchestrationEnabled = AI_ORCHESTRATION_ENABLED): T[] {
  return groups.filter(group => {
    if (group.providerId) return true;
    if (!orchestrationEnabled) return false;
    // Empty provider IDs are reserved for the renderer's fixed orchestration entries.
    // Do not let arbitrary catalog groups masquerade as selectable virtual models.
    return Boolean(group.models?.length) && group.models!.every(model => VIRTUAL_ORCHESTRATION_MODEL_IDS.has(model.id ?? ''));
  });
}
