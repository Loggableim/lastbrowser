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
  if (evidence.successfulChat === true) {
    return {
      statusKey: 'settings.panels.providers.lastSuccessfulChat',
      verified: true,
      ...(evidence.modelId?.trim() ? { modelId: evidence.modelId.trim() } : {}),
    };
  }

  switch (providerId.trim().toLowerCase()) {
    case 'openai-codex':
      return {
        statusKey: 'settings.panels.providers.codexSourceTested',
        evidenceKey: 'settings.panels.providers.codexSourceEvidence',
        verified: true,
      };
    case 'antigravity':
      // OAuth and onboarding reached the provider, but inference returned a
      // quota response. No successful Lastbrowser chat has been verified.
      return {
        ...BETA_UNTESTED,
        evidenceKey: 'settings.panels.providers.antigravityQuotaOnly',
      };
    case 'ollama-cloud':
      // Dated source/package chat runs verify this adapter, not the current
      // account or every model. A new catalog probe does not erase that proof.
      return {
        statusKey: 'settings.panels.providers.ollamaCloudSourceTested',
        evidenceKey: 'settings.panels.providers.ollamaCloudSourceEvidence',
        verified: true,
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
