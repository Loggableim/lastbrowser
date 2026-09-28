import { describe, expect, it } from 'vitest';
import { providerVerification } from '../src/renderer/provider-verification.js';
import { createDesktopI18n, desktopLocaleIds } from '../src/renderer/i18n.js';

// Mirrors the stable provider IDs returned by Sidekick onboarding. A newly
// added provider must remain untested unless a live successful chat call is
// recorded in the audit evidence. A catalog response alone is insufficient.
const ONBOARDING_PROVIDER_IDS = [
  'openrouter', 'anthropic', 'openai-codex', 'openai', 'google-gemini-cli', 'antigravity',
  'ollama', 'ollama-cloud', 'lmstudio', 'custom', 'gemini', 'deepseek',
  'xiaomi', 'zai', 'nvidia', 'mistralai', 'x-ai',
  // Other canonical Sidekick runtime providers and current provider plugins.
  'nous', 'copilot-acp', 'minimax-oauth', 'azure-foundry', 'qwen-oauth',
  // Additional providers configured in this local installation.
  'copilot', 'minimax', 'opencode-go', 'morph'
];

describe('provider verification claims', () => {
  it('marks OpenRouter as live-tested only for the model used in the audit', () => {
    for (const providerId of ONBOARDING_PROVIDER_IDS) {
      const result = providerVerification(providerId);
      if (providerId === 'openrouter') {
        expect(result.verified).toBe(true);
        expect(result.statusKey).toBe('settings.panels.providers.openrouterLiveTested');
        expect(result.evidenceKey).toBe('settings.panels.providers.openrouterChatEvidence');
      } else {
        expect(result.verified, providerId).toBe(false);
        expect(result.statusKey, providerId).toBe('settings.panels.providers.betaUntested');
      }
    }
  });

  it('does not imply that other OpenRouter catalog models were tested', () => {
    const result = providerVerification('OpenRouter');
    expect(result.verified).toBe(true);
    expect(result.statusKey).toBe('settings.panels.providers.openrouterLiveTested');
    expect(result.evidenceKey).toBe('settings.panels.providers.openrouterChatEvidence');
  });

  it('distinguishes Ollama Cloud catalog evidence from an unverified chat path', () => {
    const result = providerVerification('ollama-cloud');
    expect(result.verified).toBe(false);
    expect(result.statusKey).toBe('settings.panels.providers.betaUntested');
    expect(result.evidenceKey).toBe('settings.panels.providers.ollamaCloudCatalogOnly');
  });

  it('does not claim Antigravity chat success from OAuth and onboarding alone', () => {
    const result = providerVerification('antigravity');
    expect(result.verified).toBe(false);
    expect(result.statusKey).toBe('settings.panels.providers.betaUntested');
    expect(result.evidenceKey).toBe('settings.panels.providers.antigravityQuotaOnly');
  });

  it('keeps Morph beta and exposes the live output-limit anomaly', () => {
    const result = providerVerification('morph');
    expect(result.verified).toBe(false);
    expect(result.statusKey).toBe('settings.panels.providers.betaUntested');
    expect(result.evidenceKey).toBe('settings.panels.providers.morphTokenLimitWarning');
  });

  it('normalizes provider ID casing and keeps unknown providers untested', () => {
    expect(providerVerification(' OLLAMA-CLOUD ').verified).toBe(false);
    expect(providerVerification('new-provider').verified).toBe(false);
    expect(providerVerification('new-provider').statusKey).toBe('settings.panels.providers.betaUntested');
  });

  it('keeps the beta and verified labels localized in every shipped language', () => {
    for (const locale of desktopLocaleIds) {
      const i18n = createDesktopI18n(locale);
      expect(i18n.t('settings.panels.providers.betaUntested')).not.toBe('settings.panels.providers.betaUntested');
      expect(i18n.t('settings.panels.providers.ollamaCloudLiveVerified')).not.toBe('settings.panels.providers.ollamaCloudLiveVerified');
      expect(i18n.t('settings.panels.providers.openrouterLiveTested')).not.toBe('settings.panels.providers.openrouterLiveTested');
      expect(i18n.t('settings.panels.providers.openrouterChatEvidence')).not.toBe('settings.panels.providers.openrouterChatEvidence');
      expect(i18n.t('settings.panels.providers.antigravityQuotaOnly')).not.toBe('settings.panels.providers.antigravityQuotaOnly');
      expect(i18n.t('settings.panels.providers.betaUntested').toLowerCase()).toContain(locale === 'ru' ? 'бета' : locale === 'fr' ? 'bêta' : 'beta');
    }
  });
});
