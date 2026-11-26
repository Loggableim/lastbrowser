import type { ScopedModelSelection } from './independent-contracts.js';
import { isModelActive } from './active-model-selection.js';
import { canSelectNativeModel, mapScopedModelPickerOptions } from './model-picker-options.js';
import { parseProviderModelId } from './provider-model-selection.js';
import { providerDeployment } from './provider-presentation.js';
import { isProviderModelQualified } from './provider-chat-evidence.js';
import type { QuickchatFavorite, QuickchatPreferenceScope } from './quickchat-preferences.js';

// These adapters cannot currently deliver a direct text-only Quickchat.
const UNSUPPORTED = new Set(['antigravity', 'gemini', 'copilot-acp', 'google-gemini-cli', 'auto', 'main']);
export function isDirectQuickchatProvider(provider: string): boolean {
  return !!provider.trim() && !UNSUPPORTED.has(provider.trim().toLowerCase());
}

export function quickchatEligibleGroups(selection: ScopedModelSelection) {
  return mapScopedModelPickerOptions(selection)
    .filter(group => group.configured && isDirectQuickchatProvider(group.providerId))
    .map(group => ({ ...group, models: group.models.filter(model => model.supportsIndependent
      && (canSelectNativeModel(group.providerId, model.nativeAvailability)
        || (group.deployment === 'local' && model.quickchatAvailable === true))) }));
}
export type QuickchatChoice = { provider: string; model: string; basis: 'favorite' | 'measured' | 'estimated' };
type Candidate = { provider: string; model: string; label: string; deployment?: string };
const normalizedName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Match existing catalog identities; these names are never sent as invented model IDs. */
function isDesignatedFastCandidate(candidate: Candidate): boolean {
  const provider = candidate.provider.toLowerCase();
  const names = [candidate.model, candidate.label].map(normalizedName);
  if (['openai', 'openai-codex', 'codex'].includes(provider)) return names.includes('gpt6luna');
  if (provider === 'xiaomi' || /(^|[-_:])mimo($|[-_:])/.test(provider)) return names.some(name =>
    ['mimov26flash', 'mimo26flash', 'xiaomimimov26flash', 'xiaomimimo26flash', 'v26flash', '26flash'].includes(name));
  if (!/(^|[-_:])ollama($|[-_:])/.test(provider)) return false;
  const actualCloudSuffix = /(?:[-:/]cloud)$/i.test(candidate.model);
  const cloud = provider === 'ollama-cloud' || candidate.deployment === 'cloud' || actualCloudSuffix;
  return cloud && names.some(name => name === 'gptoss20b' || name === 'gptoss20bcloud');
}

function designatedAutomaticPool(candidates: Candidate[]): Candidate[] {
  const preferredProviders = new Set(candidates.filter(isDesignatedFastCandidate).map(candidate => candidate.provider));
  return candidates.filter(candidate => !preferredProviders.has(candidate.provider) || isDesignatedFastCandidate(candidate));
}

/** Initial estimates are deliberately not represented as measured performance. */
function initialRank(model: string): number {
  const id = model.toLowerCase();
  if (/nano|flash-lite|instant/.test(id)) return 0;
  if (/haiku|flash|mini|spark/.test(id)) return 1;
  if (/fast|small|lite/.test(id)) return 2;
  if (/opus|pro|large|deepseek.*r1|reasoner|thinking/.test(id)) return 4;
  return 3;
}

export function chooseQuickchatModel(selection: ScopedModelSelection, scope: QuickchatPreferenceScope,
  favorite: QuickchatFavorite | null, storage: Storage, showBetas: boolean): QuickchatChoice | null {
  const candidates = quickchatEligibleGroups(selection).flatMap(group => group.models
    .map(model => ({ provider: group.providerId, model: parseProviderModelId(model.id, group.providerId).model, label: model.label, deployment: model.deploymentKind ?? group.deployment })))
    .filter(choice => isModelActive(storage, scope, choice.provider, choice.model)
      && (showBetas || choice.deployment === 'local'
        || isProviderModelQualified(choice.provider, choice.model, scope.browserProfileId, scope.backendProfileName, storage)));
  if (favorite) {
    const choice = candidates.find(row => row.provider === favorite.provider && row.model === favorite.model);
    // An explicit favorite must never silently send its prompt to another provider.
    return choice ? { provider: choice.provider, model: choice.model, basis: 'favorite' } : null;
  }
  const selected = parseProviderModelId(selection.model || '', selection.provider || '');
  const configuredProvider = (selection.provider || '').trim().toLowerCase();
  const selectedProvider = (selected.provider || '').trim().toLowerCase();
  if (configuredProvider && selectedProvider && configuredProvider !== selectedProvider) return null;
  const configuredGroup = selection.groups?.find(group => group.provider_id.trim().toLowerCase() === selectedProvider);
  const deployment = selectedProvider && providerDeployment(selectedProvider, undefined,
    configuredGroup?.deploymentKind ?? configuredGroup?.deployment);
  const restrictProvider = selectedProvider && (deployment === 'local' || deployment === 'unknown');
  // Unknown endpoints may be local, so they must not silently fall back to a
  // different provider either. Explicit favorites remain available above.
  const automaticCandidates = designatedAutomaticPool(restrictProvider
    ? candidates.filter(candidate => candidate.provider.trim().toLowerCase() === selectedProvider
      && (deployment !== 'local' || (candidate.deployment === 'local' && !/(?:[-:/]cloud)$/i.test(candidate.model))))
    : candidates);
  const now = Date.now() / 1000;
  const measured = (selection.quickchatLatency?.models ?? []).filter(row => row.samples >= 3
    && Number.isFinite(row.median_ttft_ms) && row.median_ttft_ms >= 0
    && row.last_measured_at <= now + 60 && row.last_measured_at >= now - 7 * 86400);
  const withMeasurements = automaticCandidates.flatMap(choice => {
    const timing = measured.find(row => row.provider === choice.provider && row.model === choice.model);
    return timing ? [{ ...choice, time: timing.median_ttft_ms }] : [];
  }).sort((a, b) => a.time - b.time || a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model));
  if (withMeasurements[0]) return { provider: withMeasurements[0].provider, model: withMeasurements[0].model, basis: 'measured' };
  // OpenCode receives no guessed provider winner while its measured benchmark is pending.
  // Router ranks sit behind every ordinary estimate so adding them cannot
  // replace an existing automatic choice. Free still beats the paid auto router.
  const estimatedRank = (candidate: Candidate) => {
    if (candidate.provider === 'openrouter' && candidate.model === 'openrouter/auto') return 7;
    if (candidate.provider === 'openrouter' && candidate.model === 'openrouter/free') return 6;
    return /^(opencode)(?:[-_:]|$)/i.test(candidate.provider) ? 3 : initialRank(candidate.model);
  };
  automaticCandidates.sort((a, b) => estimatedRank(a) - estimatedRank(b)
    || a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model));
  return automaticCandidates[0] ? { provider: automaticCandidates[0].provider, model: automaticCandidates[0].model, basis: 'estimated' } : null;
}
