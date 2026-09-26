import { describe, expect, it } from 'vitest';
import { desktopLocaleIds } from '../src/renderer/i18n/keys.js';
import { localizedProviderRecommendation } from '../src/renderer/i18n/provider-recommendations.js';

describe('onboarding provider recommendations', () => {
  it('provides translated copy for every featured provider and locale', () => {
    for (const providerId of ['openai-codex', 'ollama', 'openrouter']) {
      for (const locale of desktopLocaleIds) {
        const recommendation = localizedProviderRecommendation(providerId, locale);
        expect(recommendation?.headline, `${providerId}/${locale} headline`).toBeTruthy();
        expect(recommendation?.benefits.length, `${providerId}/${locale} benefits`).toBeGreaterThan(0);
        expect(recommendation?.bestFor, `${providerId}/${locale} bestFor`).toBeTruthy();
      }
    }
  });

  it('does not advertise retired or account-dependent model names as guarantees', () => {
    for (const providerId of ['openai-codex', 'ollama']) {
      for (const locale of desktopLocaleIds) {
        const text = JSON.stringify(localizedProviderRecommendation(providerId, locale));
        expect(text).not.toMatch(/Gemini 3\.8|Gemini 2\.5 Pro|Gemini 3\.1 Pro|GPT-4o|o3-mini|Qwen 2\.5/i);
      }
    }
  });
});
