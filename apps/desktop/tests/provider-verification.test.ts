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
  it('does not infer live verification from provider identity alone', () => {
    for (const providerId of ONBOARDING_PROVIDER_IDS) {
      const result = providerVerification(providerId);
      expect(result.verified, providerId).toBe(false);
      expect(result.statusKey, providerId).toBe('settings.panels.providers.betaUntested');
    }
  });

  it('does not treat dated adapter proof or a catalog result as current qualification', () => {
    const catalogOnly = providerVerification('ollama-cloud', { catalogVerified: true });
    expect(catalogOnly.verified).toBe(false);
    expect(catalogOnly.statusKey).toBe('settings.panels.providers.betaUntested');

    const noEvidence = providerVerification('ollama-cloud');
    expect(noEvidence.verified).toBe(false);
    expect(noEvidence.statusKey).toBe('settings.panels.providers.betaUntested');
  });

  it('accepts successful Lastbrowser chat evidence, including direct Ollama', () => {
    for (const providerId of ['ollama', 'ollama-cloud', 'openrouter']) {
      const result = providerVerification(providerId, { successfulChat: true, modelId: 'tested-model' });
      expect(result.verified, providerId).toBe(true);
      expect(result.statusKey, providerId).toBe('settings.panels.providers.lastSuccessfulChat');
    }
  });

  it('does not claim OpenRouter or Anthropic chat evidence by default', () => {
    for (const providerId of ['openrouter', 'anthropic']) {
      const result = providerVerification(providerId);
      expect(result.verified, providerId).toBe(false);
      expect(result.statusKey, providerId).toBe('settings.panels.providers.betaUntested');
    }
  });

  it('does not treat a historical Codex backend probe as current in-app chat evidence', () => {
    const backend = providerVerification('openai-codex');
    expect(backend.statusKey).toBe('settings.panels.providers.betaUntested');
    expect(backend.verified).toBe(false);
    expect(providerVerification('openai-codex', { successfulChat: true }).verified).toBe(false);
    expect(providerVerification('openai-codex', { successfulChat: true, modelId: 'gpt-6-luna' }).statusKey)
      .toBe('settings.panels.providers.lastSuccessfulChat');
  });

  it('does not mark an unsuccessful runtime chat as verified', () => {
    const result = providerVerification('ollama', { successfulChat: false });
    expect(result.verified).toBe(false);
    expect(result.statusKey).toBe('settings.panels.providers.betaUntested');
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
    expect(providerVerification(' OLLAMA-CLOUD ').statusKey).toBe('settings.panels.providers.betaUntested');
    expect(providerVerification(' OLLAMA ', { successfulChat: true, modelId: 'tested-model' }).verified).toBe(true);
    expect(providerVerification('new-provider').verified).toBe(false);
    expect(providerVerification('new-provider').statusKey).toBe('settings.panels.providers.betaUntested');
  });

  it('keeps the beta and successful-chat labels localized in every shipped language', () => {
    for (const locale of desktopLocaleIds) {
      const i18n = createDesktopI18n(locale);
      expect(i18n.t('settings.panels.providers.betaUntested')).not.toBe('settings.panels.providers.betaUntested');
      expect(i18n.t('settings.panels.providers.connectionSuccess')).not.toBe('settings.panels.providers.connectionSuccess');
      expect(i18n.t('settings.panels.providers.lastSuccessfulChat')).not.toBe('settings.panels.providers.lastSuccessfulChat');
      expect(i18n.t('settings.panels.providers.antigravityQuotaOnly')).not.toBe('settings.panels.providers.antigravityQuotaOnly');
      expect(i18n.t('settings.panels.providers.ollamaCloudSourceEvidence')).not.toBe('settings.panels.providers.ollamaCloudSourceEvidence');
      expect(i18n.t('settings.panels.providers.codexSourceEvidence')).not.toBe('settings.panels.providers.codexSourceEvidence');
      expect(i18n.t('settings.panels.providers.betaUntested').toLowerCase()).toContain(locale === 'ru' ? 'бета' : locale === 'fr' ? 'bêta' : locale === 'ja' ? 'ベータ' : 'beta');
    }
  });
});
