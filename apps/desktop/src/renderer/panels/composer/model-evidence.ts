import type { LocalStoreRuntimeCapability, NativeModelAvailability } from '../../independent-contracts.js';
import type { ProviderChatEvidence } from '../../provider-chat-evidence.js';
import { canSelectNativeModel } from '../../model-picker-options.js';
import { getComposerMoreUxCopy } from '../../i18n/sidekick-ux-translations.js';

export interface ComposerModelEntry {
  id: string;
  label: string;
  listingStatus?: 'current' | 'configured' | 'fallback';
  reasoningEfforts?: string[];
  supportsIndependent?: boolean;
  nativeAvailability?: NativeModelAvailability;
  qualified?: boolean;
  releaseVerified?: boolean;
  qualification?: ProviderChatEvidence;
  localRuntime?: LocalStoreRuntimeCapability;
  localUnavailableReason?: string;
}

export interface ComposerModelGroup {
  provider: string;
  providerId?: string;
  configured?: boolean;
  disabledReason?: string;
  models: ComposerModelEntry[];
}

export interface FormattedModelEvidence {
  isUnavailableInSpace: boolean;
  isIndependentUnsupported: boolean;
  isDisabled: boolean;
  isDesiredDefault: boolean;
  displayTitle: string;
  summaryText: string;
  tooltipText: string;
  badgeTone: 'qualified' | 'beta' | 'unavailable';
}

export const DESIRED_CHAT_DEFAULT = {
  providerId: 'opencode',
  modelId: 'deepseek-v4.1-flash-free',
} as const;

export function isDesiredDefaultModel(providerId: string | undefined, modelId: string): boolean {
  return providerId === DESIRED_CHAT_DEFAULT.providerId && modelId === DESIRED_CHAT_DEFAULT.modelId;
}

export function formatModelOptionLabel(
  entry: ComposerModelEntry,
  providerLabel: string,
  t: (key: string) => string
): string {
  const statusSuffix =
    entry.listingStatus === 'configured'
      ? ' · configured · unverified'
      : entry.listingStatus === 'fallback'
        ? ` · ${t('settings.panels.providers.catalogFallbackUnverified')}`
        : '';
  return `${entry.label}${statusSuffix} · ${providerLabel}`;
}

export function formatModelEvidence(params: {
  group: ComposerModelGroup;
  entry: ComposerModelEntry;
  locale: string;
  browserProfileId: string;
  profile: string;
  backendProfileName: string;
  ready: boolean;
  running: boolean;
  t: (key: string) => string;
}): FormattedModelEvidence {
  const { group, entry, locale, browserProfileId, profile, backendProfileName, ready, running, t } = params;
  const copy = getComposerMoreUxCopy(locale);

  const isUnavailableInSpace = !canSelectNativeModel(group.providerId, entry.nativeAvailability);
  const isIndependentUnsupported = entry.supportsIndependent === false;
  const isDisabled =
    group.configured === false ||
    isIndependentUnsupported ||
    isUnavailableInSpace ||
    !ready ||
    running;

  const isDesiredDefault = isDesiredDefaultModel(group.providerId, entry.id);
  const displayTitle = isDesiredDefault
    ? `${entry.label} · ${t('settings.panels.providers.requestedChatDefault')}`
    : entry.label;

  const isLocal = group.providerId === 'local-store';
  const expiry = entry.qualification
    ? new Date(entry.qualification.recordedAt + 24 * 60 * 60 * 1000).toLocaleString(locale)
    : '';

  let detailedEvidence: string;
  if (isLocal) {
    detailedEvidence = entry.qualified
      ? copy.localVerified
      : entry.localUnavailableReason || copy.localUnverified;
  } else if (entry.qualification) {
    detailedEvidence = [
      `${t('settings.panels.providers.qualificationUntil')}: ${expiry}`,
      `${t('settings.panels.providers.browserProfileLabel')}: ${entry.qualification.browserProfileId}`,
      `${t('settings.panels.providers.backendProfileLabel')}: ${entry.qualification.backendProfileName}`,
      `${t('settings.panels.providers.runtimeLabel')}: ${entry.qualification.runtimeGeneration}`,
      `${t('settings.panels.providers.buildLabel')}: ${entry.qualification.appBuildId}`,
      `${t('settings.panels.providers.providerConfigLabel')}: ${entry.qualification.providerConfigGeneration}`,
      `${t('settings.panels.providers.backendConfigLabel')}: ${entry.qualification.backendConfigGeneration}`,
    ].join('; ');
  } else if (entry.releaseVerified) {
    detailedEvidence = t('settings.panels.providers.stableRelease');
  } else {
    detailedEvidence = [
      t('settings.panels.providers.betaUntested'),
      `${t('settings.panels.providers.browserProfileLabel')}: ${browserProfileId || profile}`,
      `${t('settings.panels.providers.backendProfileLabel')}: ${backendProfileName}`,
    ].join('; ');
  }

  let statusFragment: string;
  let badgeTone: 'qualified' | 'beta' | 'unavailable';

  if (isUnavailableInSpace) {
    statusFragment = t('chat.modelUnavailableInSpace');
    badgeTone = 'unavailable';
  } else if (isIndependentUnsupported) {
    statusFragment = t('chat.modelIndependentUnsupported');
    badgeTone = 'unavailable';
  } else if (isLocal) {
    statusFragment = detailedEvidence;
    badgeTone = entry.qualified ? 'qualified' : 'unavailable';
  } else if (entry.qualified) {
    statusFragment = `${t('settings.panels.providers.lastSuccessfulChat')}${expiry ? ` · ${expiry}` : ''}`;
    badgeTone = 'qualified';
  } else if (entry.releaseVerified) {
    statusFragment = t('settings.panels.providers.stableRelease');
    badgeTone = 'qualified';
  } else {
    statusFragment = t('settings.panels.providers.betaUntested');
    badgeTone = 'beta';
  }

  return {
    isUnavailableInSpace,
    isIndependentUnsupported,
    isDisabled,
    isDesiredDefault,
    displayTitle,
    summaryText: `${group.provider} · ${entry.id} · ${statusFragment}`,
    tooltipText: `${group.provider} · ${entry.id} · ${detailedEvidence}`,
    badgeTone,
  };
}
