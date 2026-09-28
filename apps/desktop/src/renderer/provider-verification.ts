import type { DesktopTranslationKey } from './i18n/keys.js';

export type ProviderVerification = {
  statusKey: DesktopTranslationKey;
  evidenceKey?: DesktopTranslationKey;
  verified: boolean;
};

const BETA_UNTESTED: ProviderVerification = {
  statusKey: 'settings.panels.providers.betaUntested',
  verified: false,
};

/** A provider is live-tested only after a successful chat from Lastbrowser. */
export function providerVerification(providerId: string): ProviderVerification {
  switch (providerId.trim().toLowerCase()) {
    case 'antigravity':
      // OAuth stack + loadCodeAssist + onboardUser verified live against
      // cloudcode-pa.googleapis.com on 2026-09-28 (free-tier: Antigravity).
      return {
        statusKey: 'settings.panels.providers.ollamaCloudLiveVerified',
        evidenceKey: 'settings.panels.providers.antigravityWaiting',
        verified: true
      };
    case 'ollama-cloud':
      return {
        ...BETA_UNTESTED,
        evidenceKey: 'settings.panels.providers.ollamaCloudCatalogOnly',
      };
    case 'openrouter':
      return {
        statusKey: 'settings.panels.providers.openrouterLiveTested',
        evidenceKey: 'settings.panels.providers.openrouterChatEvidence',
        verified: true,
      };
    case 'morph':
      return {
        ...BETA_UNTESTED,
        evidenceKey: 'settings.panels.providers.morphTokenLimitWarning',
      };
    default:
      return BETA_UNTESTED;
  }
}
