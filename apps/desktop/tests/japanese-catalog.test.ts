import { describe, expect, it } from 'vitest';
import { desktopJaOverrides } from '../src/renderer/i18n/locales/ja.js';
import { desktopEnOverrides } from '../src/renderer/i18n/locales/en.js';
import { desktopTranslationKeys } from '../src/renderer/i18n/keys.js';
import { desktopSystemPanelCoreOverrides } from '../src/renderer/i18n/system-panels-extra.js';
import { settingsAppearanceTranslations } from '../src/renderer/i18n/settings-appearance-translations.js';
import { settingsProviderTranslations } from '../src/renderer/i18n/settings-provider-translations.js';
import { settingsOtherPanelsTranslations } from '../src/renderer/i18n/settings-other-panels-translations.js';
import { geminiSubscriptionTranslations } from '../src/renderer/i18n/gemini-subscription-translations.js';
import { spaceSetupTranslations } from '../src/renderer/i18n/space-setup-translations.js';
import { browserChromeTranslations } from '../src/renderer/i18n/browser-chrome-translations.js';
import { visionImpairedTranslations } from '../src/renderer/i18n/vision-impaired-translations.js';
import { splitMagnifierTranslations } from '../src/renderer/i18n/split-magnifier-translations.js';
import { sidekickUxTranslations } from '../src/renderer/i18n/sidekick-ux-translations.js';
import { teamworkUxTranslations } from '../src/renderer/i18n/teamwork-ux-translations.js';
import { agentPanelsTranslations } from '../src/renderer/i18n/agent-panels-translations.js';
import { spaceAssistantTranslations } from '../src/renderer/i18n/space-assistant-translations.js';
import { whatsNewTranslations } from '../src/renderer/i18n/whats-new-translations.js';

// Raw English sources: parity must not be hidden by the runtime's fallback.
const english: Record<string, string> = {
  ...desktopEnOverrides, ...desktopSystemPanelCoreOverrides.en,
  ...settingsAppearanceTranslations.en, ...settingsProviderTranslations.en,
  ...settingsOtherPanelsTranslations.en, ...geminiSubscriptionTranslations.en,
  ...spaceSetupTranslations.en, ...browserChromeTranslations.en,
  ...visionImpairedTranslations.en, ...splitMagnifierTranslations.en,
  ...sidekickUxTranslations.en, ...agentPanelsTranslations.en,
  ...teamworkUxTranslations.en,
  ...spaceAssistantTranslations.en,
  ...whatsNewTranslations.en,
};

describe('complete Japanese raw UI catalog', () => {
  it('covers declared keys and all English supplements without a fallback', () => {
    expect(new Set(Object.keys(desktopJaOverrides))).toEqual(new Set(desktopTranslationKeys));
    expect(Object.keys(desktopJaOverrides).sort()).toEqual(Object.keys(english).sort());
  });

  it('retains every interpolation parameter and has no empty or provisional values', () => {
    const parameters = (value: string) => [...value.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]).sort();
    for (const [key, value] of Object.entries(desktopJaOverrides)) {
      expect(value.trim(), key).not.toBe('');
      expect(value, key).not.toMatch(/\[(?:TODO|TRANSLATE|EN|JA)\]/i);
      expect(parameters(value), key).toEqual(parameters(english[key]));
    }
  });

  it('uses Japanese for the interface rather than relabeling an English copy', () => {
    const values = Object.values(desktopJaOverrides);
    const japaneseCount = values.filter(value => /[\u3040-\u30ff\u3400-\u9fff]/.test(value)).length;
    // Brand names, URLs, palette/font names and language autonyms stay intact.
    expect(japaneseCount / values.length).toBeGreaterThan(0.94);
    expect(desktopJaOverrides['common.save']).toBe('保存');
    expect(desktopJaOverrides['settings.title']).toBe('設定');
    expect(desktopJaOverrides['spaceAssistant.noPermission']).toContain('権限');
    expect(desktopJaOverrides['agentPanels.memoryDetail']).toContain('メモリー');
    expect(desktopJaOverrides['firstRun.section2Title']).toContain('{botName}');
  });
});
