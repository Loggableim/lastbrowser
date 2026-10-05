import type { AutoRouteObservation, AutoSelectionPolicy } from './CommandActionContracts.js';

/** AUTO is a selection policy. This adapter never writes `auto` into a model field. */
export function validateAutoSelectionPolicy(value: AutoSelectionPolicy): boolean {
  return value.schemaVersion === 1 && ['auto','fixed'].includes(value.mode)
    && Number.isSafeInteger(value.revision) && value.revision >= 0
    && ['deny','explicit_allow'].includes(value.cloudPolicy)
    && ['lite','balanced','max'].includes(value.quality)
    && Array.isArray(value.allowedCandidateRefs) && value.allowedCandidateRefs.every(ref => typeof ref === 'string' && ref.trim())
    && Number.isSafeInteger(value.budget.maxTokens) && value.budget.maxTokens > 0
    && Number.isSafeInteger(value.budget.maxParallel) && value.budget.maxParallel > 0
    && (value.budget.maxCost === undefined || Number.isFinite(value.budget.maxCost) && value.budget.maxCost >= 0)
    && (value.mode !== 'fixed' || Boolean(value.fixed?.provider.trim() && value.fixed?.model.trim() && value.fixed.model.toLowerCase() !== 'auto'));
}
export function autoPolicyDisplay(value: AutoSelectionPolicy, observation: AutoRouteObservation | null): {
  selection: 'AUTO' | string; actualModel: string | null; state: 'available' | 'waiting' | 'unavailable';
  usageState: 'known' | 'unknown' | 'stale'; reason: string | null;
} {
  return { selection: value.mode === 'auto' ? 'AUTO' : `${value.fixed?.provider || ''}/${value.fixed?.model || ''}`,
    actualModel: observation?.actualModel ? `${observation.actualModel.provider}/${observation.actualModel.model}` : null,
    state: observation?.state || 'unavailable', usageState: observation?.usageState || 'unknown',
    reason: observation?.reason || null };
}
