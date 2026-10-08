import type { DesktopTranslationKey } from './i18n/keys.js';

export type ProviderVerification = {
  statusKey: DesktopTranslationKey;
  evidenceKey?: DesktopTranslationKey;
  verified: boolean;
  modelId?: string;
};

export type ProviderRuntimeEvidence = {
  /** True only after Lastbrowser receives a successful response from chat. */
  successfulChat?: boolean;
  /** True only when the provider's model catalog was actually loaded. */
  catalogVerified?: boolean;
  modelId?: string;
};

const BETA_UNTESTED: ProviderVerification = {
  statusKey: 'settings.panels.providers.betaUntested',
  verified: false,
};

/**
 * Provider labels describe observed runtime evidence, never provider capability.
 * Callers that have not observed a successful in-app chat must omit that proof.
 */
export function providerVerification(
  providerId: string,
  evidence: ProviderRuntimeEvidence = {}
): ProviderVerification {
  if (evidence.successfulChat === true && evidence.modelId?.trim()) {
    return {
      statusKey: 'settings.panels.providers.lastSuccessfulChat',
      verified: true,
      modelId: evidence.modelId.trim(),
    };
  }

  switch (providerId.trim().toLowerCase()) {
    case 'antigravity':
      // OAuth and onboarding reached the provider, but inference returned a
      // quota response. No successful Lastbrowser chat has been verified.
      return {
        ...BETA_UNTESTED,
        evidenceKey: 'settings.panels.providers.antigravityQuotaOnly',
      };
    case 'openrouter':
      return evidence.catalogVerified === true
        ? { statusKey: 'settings.panels.providers.openrouterCatalogOnly', verified: false }
        : BETA_UNTESTED;
    case 'morph':
      return {
        ...BETA_UNTESTED,
        evidenceKey: 'settings.panels.providers.morphTokenLimitWarning',
      };
    default:
      return BETA_UNTESTED;
  }
}
