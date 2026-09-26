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

/** Only providers with a real live chat in the current audit get verified status. */
export function providerVerification(providerId: string): ProviderVerification {
  switch (providerId.trim().toLowerCase()) {
    case 'ollama-cloud':
    case 'openrouter':
      return {
        ...BETA_UNTESTED,
        evidenceKey: providerId.trim().toLowerCase() === 'ollama-cloud'
          ? 'settings.panels.providers.ollamaCloudCatalogOnly'
          : 'settings.panels.providers.openrouterCatalogOnly',
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
