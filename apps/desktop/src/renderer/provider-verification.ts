import type { DesktopTranslationKey } from './i18n/keys.js';

export type ProviderVerification = {
  statusKey: DesktopTranslationKey;
  evidenceKey?: DesktopTranslationKey;
  verified: boolean;
};

export type ProviderRuntimeEvidence = {
  /** True only after Lastbrowser receives a successful response from chat. */
  successfulChat?: boolean;
  /** True only when the provider's model catalog was actually loaded. */
  catalogVerified?: boolean;
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
  if (evidence.successfulChat === true) {
    return {
      statusKey: 'settings.panels.providers.connectionSuccess',
      verified: true,
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
    case 'ollama-cloud':
      return {
        ...BETA_UNTESTED,
        ...(evidence.catalogVerified === true
          ? { evidenceKey: 'settings.panels.providers.ollamaCloudCatalogOnly' as const }
          : {}),
      };
    case 'openrouter':
      return BETA_UNTESTED;
    case 'morph':
      return {
        ...BETA_UNTESTED,
        evidenceKey: 'settings.panels.providers.morphTokenLimitWarning',
      };
    default:
      return BETA_UNTESTED;
  }
}
