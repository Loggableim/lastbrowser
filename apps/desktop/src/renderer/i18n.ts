import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { DesktopCatalog, DesktopLocaleId, DesktopTranslationKey } from './i18n/keys.js';
import {
  desktopLocaleIds,
  legacyDesktopLocaleIds,
  desktopLocaleNames,
  desktopTranslationKeys
} from './i18n/keys.js';
import { desktopDeOverrides } from './i18n/locales/de.js';
import { desktopEnOverrides } from './i18n/locales/en.js';
import { desktopEsOverrides } from './i18n/locales/es.js';
import { desktopFrOverrides } from './i18n/locales/fr.js';
import { desktopItOverrides } from './i18n/locales/it.js';
import { desktopPtBrOverrides } from './i18n/locales/pt-BR.js';
import { desktopRuOverrides } from './i18n/locales/ru.js';
import { desktopJaOverrides } from './i18n/locales/ja.js';
import { desktopSystemPanelCoreOverrides } from './i18n/system-panels-extra.js';
import { systemPanelsRomanTranslations } from './i18n/system-panels-roman.js';
import { settingsAppearanceTranslations } from './i18n/settings-appearance-translations.js';
import { settingsProviderTranslations } from './i18n/settings-provider-translations.js';
import { settingsOtherPanelsTranslations } from './i18n/settings-other-panels-translations.js';
import { geminiSubscriptionTranslations } from './i18n/gemini-subscription-translations.js';
import { spaceSetupTranslations } from './i18n/space-setup-translations.js';
import { browserChromeTranslations } from './i18n/browser-chrome-translations.js';
import { visionImpairedTranslations } from './i18n/vision-impaired-translations.js';
import { splitMagnifierTranslations } from './i18n/split-magnifier-translations.js';
import { sidekickUxTranslations } from './i18n/sidekick-ux-translations.js';
import { teamworkUxTranslations } from './i18n/teamwork-ux-translations.js';
import { agentPanelsTranslations } from './i18n/agent-panels-translations.js';
import { spaceAssistantTranslations } from './i18n/space-assistant-translations.js';
import { whatsNewTranslations } from './i18n/whats-new-translations.js';

for (const locale of legacyDesktopLocaleIds) {
  Object.assign(visionImpairedTranslations[locale], splitMagnifierTranslations[locale]);
}
for (const locale of legacyDesktopLocaleIds) {
  Object.assign(sidekickUxTranslations[locale], teamworkUxTranslations[locale]);
}

const systemPanelOverrides = {
  de: systemPanelsRomanTranslations.de,
  es: systemPanelsRomanTranslations.es,
  fr: systemPanelsRomanTranslations.fr,
  it: systemPanelsRomanTranslations.it
} as const;

export const desktopLocaleStorageKey = 'lastbrowser.locale';
export { desktopLocaleIds, desktopLocaleNames, desktopTranslationKeys } from './i18n/keys.js';

type I18nContextValue = {
  locale: DesktopLocaleId;
  setLocale: (locale: string) => void;
  t: (key: DesktopTranslationKey, params?: TranslationParams) => string;
  localeOptions: Array<{ id: DesktopLocaleId; label: string }>;
};

type TranslationParams = Record<string, unknown> | unknown[] | string | number | boolean | null | undefined;

const I18nContext = createContext<I18nContextValue | null>(null);

const defaultEnglishCatalog = buildDefaultEnglishCatalog();

export const desktopLocaleCatalogs: Record<DesktopLocaleId, Readonly<DesktopCatalog>> = {
  en: mergeCatalog(defaultEnglishCatalog, { ...desktopEnOverrides, ...desktopSystemPanelCoreOverrides.en, ...settingsAppearanceTranslations.en, ...settingsProviderTranslations.en, ...settingsOtherPanelsTranslations.en, ...geminiSubscriptionTranslations.en, ...spaceSetupTranslations.en, ...browserChromeTranslations.en, ...visionImpairedTranslations.en, ...sidekickUxTranslations.en, ...agentPanelsTranslations.en }),
  de: mergeCatalog(defaultEnglishCatalog, { ...desktopDeOverrides, ...desktopSystemPanelCoreOverrides.de, ...systemPanelOverrides.de, ...settingsAppearanceTranslations.de, ...settingsProviderTranslations.de, ...settingsOtherPanelsTranslations.de, ...geminiSubscriptionTranslations.de, ...spaceSetupTranslations.de, ...browserChromeTranslations.de, ...visionImpairedTranslations.de, ...sidekickUxTranslations.de, ...agentPanelsTranslations.de }),
  it: mergeCatalog(defaultEnglishCatalog, { ...desktopItOverrides, ...desktopSystemPanelCoreOverrides.it, ...systemPanelOverrides.it, ...settingsAppearanceTranslations.it, ...settingsProviderTranslations.it, ...settingsOtherPanelsTranslations.it, ...geminiSubscriptionTranslations.it, ...spaceSetupTranslations.it, ...browserChromeTranslations.it, ...visionImpairedTranslations.it, ...sidekickUxTranslations.it, ...agentPanelsTranslations.it }),
  es: mergeCatalog(defaultEnglishCatalog, { ...desktopEsOverrides, ...desktopSystemPanelCoreOverrides.es, ...systemPanelOverrides.es, ...settingsAppearanceTranslations.es, ...settingsProviderTranslations.es, ...settingsOtherPanelsTranslations.es, ...geminiSubscriptionTranslations.es, ...spaceSetupTranslations.es, ...browserChromeTranslations.es, ...visionImpairedTranslations.es, ...sidekickUxTranslations.es, ...agentPanelsTranslations.es }),
  fr: mergeCatalog(defaultEnglishCatalog, { ...desktopFrOverrides, ...desktopSystemPanelCoreOverrides.fr, ...systemPanelOverrides.fr, ...settingsAppearanceTranslations.fr, ...settingsProviderTranslations.fr, ...settingsOtherPanelsTranslations.fr, ...geminiSubscriptionTranslations.fr, ...spaceSetupTranslations.fr, ...browserChromeTranslations.fr, ...visionImpairedTranslations.fr, ...sidekickUxTranslations.fr, ...agentPanelsTranslations.fr }),
  'pt-BR': mergeCatalog(defaultEnglishCatalog, { ...desktopPtBrOverrides, ...desktopSystemPanelCoreOverrides['pt-BR'], ...settingsAppearanceTranslations['pt-BR'], ...settingsProviderTranslations['pt-BR'], ...settingsOtherPanelsTranslations['pt-BR'], ...geminiSubscriptionTranslations['pt-BR'], ...spaceSetupTranslations['pt-BR'], ...browserChromeTranslations['pt-BR'], ...visionImpairedTranslations['pt-BR'], ...sidekickUxTranslations['pt-BR'], ...agentPanelsTranslations['pt-BR'] }),
  ru: mergeCatalog(defaultEnglishCatalog, { ...desktopRuOverrides, ...desktopSystemPanelCoreOverrides.ru, ...settingsAppearanceTranslations.ru, ...settingsProviderTranslations.ru, ...settingsOtherPanelsTranslations.ru, ...geminiSubscriptionTranslations.ru, ...spaceSetupTranslations.ru, ...browserChromeTranslations.ru, ...visionImpairedTranslations.ru, ...sidekickUxTranslations.ru, ...agentPanelsTranslations.ru }),
  ja: Object.freeze(mergeCatalog(defaultEnglishCatalog, desktopJaOverrides))
};

/** Raw locale resources, exported so coverage tests can detect keys hidden by English fallback. */
export const desktopLocaleOverrides: Record<DesktopLocaleId, Readonly<DesktopCatalog>> = {
  en: { ...desktopEnOverrides, ...desktopSystemPanelCoreOverrides.en, ...settingsAppearanceTranslations.en, ...settingsProviderTranslations.en, ...settingsOtherPanelsTranslations.en, ...geminiSubscriptionTranslations.en, ...spaceSetupTranslations.en, ...browserChromeTranslations.en, ...visionImpairedTranslations.en, ...sidekickUxTranslations.en, ...agentPanelsTranslations.en },
  de: { ...desktopDeOverrides, ...desktopSystemPanelCoreOverrides.de, ...systemPanelOverrides.de, ...settingsAppearanceTranslations.de, ...settingsProviderTranslations.de, ...settingsOtherPanelsTranslations.de, ...geminiSubscriptionTranslations.de, ...spaceSetupTranslations.de, ...browserChromeTranslations.de, ...visionImpairedTranslations.de, ...sidekickUxTranslations.de, ...agentPanelsTranslations.de },
  it: { ...desktopItOverrides, ...desktopSystemPanelCoreOverrides.it, ...systemPanelOverrides.it, ...settingsAppearanceTranslations.it, ...settingsProviderTranslations.it, ...settingsOtherPanelsTranslations.it, ...geminiSubscriptionTranslations.it, ...spaceSetupTranslations.it, ...browserChromeTranslations.it, ...visionImpairedTranslations.it, ...sidekickUxTranslations.it, ...agentPanelsTranslations.it },
  es: { ...desktopEsOverrides, ...desktopSystemPanelCoreOverrides.es, ...systemPanelOverrides.es, ...settingsAppearanceTranslations.es, ...settingsProviderTranslations.es, ...settingsOtherPanelsTranslations.es, ...geminiSubscriptionTranslations.es, ...spaceSetupTranslations.es, ...browserChromeTranslations.es, ...visionImpairedTranslations.es, ...sidekickUxTranslations.es, ...agentPanelsTranslations.es },
  fr: { ...desktopFrOverrides, ...desktopSystemPanelCoreOverrides.fr, ...systemPanelOverrides.fr, ...settingsAppearanceTranslations.fr, ...settingsProviderTranslations.fr, ...settingsOtherPanelsTranslations.fr, ...geminiSubscriptionTranslations.fr, ...spaceSetupTranslations.fr, ...browserChromeTranslations.fr, ...visionImpairedTranslations.fr, ...sidekickUxTranslations.fr, ...agentPanelsTranslations.fr },
  'pt-BR': { ...desktopPtBrOverrides, ...desktopSystemPanelCoreOverrides['pt-BR'], ...settingsAppearanceTranslations['pt-BR'], ...settingsProviderTranslations['pt-BR'], ...settingsOtherPanelsTranslations['pt-BR'], ...geminiSubscriptionTranslations['pt-BR'], ...spaceSetupTranslations['pt-BR'], ...browserChromeTranslations['pt-BR'], ...visionImpairedTranslations['pt-BR'], ...sidekickUxTranslations['pt-BR'], ...agentPanelsTranslations['pt-BR'] },
  ru: { ...desktopRuOverrides, ...desktopSystemPanelCoreOverrides.ru, ...settingsAppearanceTranslations.ru, ...settingsProviderTranslations.ru, ...settingsOtherPanelsTranslations.ru, ...geminiSubscriptionTranslations.ru, ...spaceSetupTranslations.ru, ...browserChromeTranslations.ru, ...visionImpairedTranslations.ru, ...sidekickUxTranslations.ru, ...agentPanelsTranslations.ru },
  ja: Object.freeze({ ...desktopJaOverrides })
};

for (const locale of legacyDesktopLocaleIds) {
  desktopLocaleCatalogs[locale] = Object.freeze({ ...desktopLocaleCatalogs[locale], ...spaceAssistantTranslations[locale] });
  desktopLocaleOverrides[locale] = Object.freeze({ ...desktopLocaleOverrides[locale], ...spaceAssistantTranslations[locale] });
}

for (const locale of desktopLocaleIds) {
  desktopLocaleCatalogs[locale] = Object.freeze({ ...desktopLocaleCatalogs[locale], ...whatsNewTranslations[locale] });
  desktopLocaleOverrides[locale] = Object.freeze({ ...desktopLocaleOverrides[locale], ...whatsNewTranslations[locale] });
}

export function normalizeDesktopLocale(value: unknown): DesktopLocaleId | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/_/g, '-');
  const lower = normalized.toLowerCase();

  if (lower === 'pt' || lower === 'pt-br' || lower === 'ptbr') return 'pt-BR';
  if (lower === 'russian' || lower === 'русский' || lower.startsWith('ru-') || lower === 'ru') return 'ru';
  if (lower === 'japanese' || lower === '日本語' || lower.startsWith('ja-') || lower === 'ja') return 'ja';
  if (lower.startsWith('de')) return 'de';
  if (lower.startsWith('it')) return 'it';
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('fr')) return 'fr';
  if (lower.startsWith('en')) return 'en';
  return desktopLocaleIds.find((locale) => locale.toLowerCase() === lower) || null;
}

export function resolveDesktopLocale(options: {
  settingsLanguage?: unknown;
  browserLanguage?: string | null;
  savedLocale?: unknown;
}): DesktopLocaleId {
  const persisted = normalizeDesktopLocale(options.savedLocale);
  if (persisted) return persisted;

  const fromSettings = normalizeDesktopLocale(options.settingsLanguage);
  if (fromSettings) return fromSettings;

  const browserLocale = normalizeDesktopLocale(
    options.browserLanguage !== undefined ? options.browserLanguage : navigatorLanguage()
  );
  if (browserLocale) return browserLocale;

  return 'en';
}

export function loadDesktopLocalePreference(storage: Storage | undefined = defaultStorage()): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(desktopLocaleStorageKey);
  } catch {
    return null;
  }
}

export function saveDesktopLocalePreference(locale: DesktopLocaleId, storage: Storage | undefined = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(desktopLocaleStorageKey, locale);
  } catch {
    // Ignore unavailable storage.
  }
}

export function createDesktopI18n(locale: DesktopLocaleId): {
  locale: DesktopLocaleId;
  catalog: Readonly<DesktopCatalog>;
  t: (key: DesktopTranslationKey, params?: TranslationParams) => string;
} {
  const catalog = desktopLocaleCatalogs[locale] || desktopLocaleCatalogs.en;
  return {
    locale,
    catalog,
    t: (key, params) => translate(catalog, key, params)
  };
}

export function DesktopI18nProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [locale, setLocaleState] = useState<DesktopLocaleId>(() => resolveDesktopLocale({
    savedLocale: loadDesktopLocalePreference(),
    browserLanguage: navigatorLanguage()
  }));

  useEffect(() => {
    saveDesktopLocalePreference(locale);
    document.documentElement.lang = locale;
    void window.lastbrowser?.i18n?.setLocale?.(locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale: (nextLocale: string) => {
      const normalized = normalizeDesktopLocale(nextLocale) || 'en';
      setLocaleState(normalized);
    },
    t: (key, params) => translate(desktopLocaleCatalogs[locale], key, params),
    localeOptions: desktopLocaleIds.map((id) => ({ id, label: desktopLocaleNames[id] }))
  }), [locale]);

  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useDesktopI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useDesktopI18n must be used inside DesktopI18nProvider');
  }
  return context;
}

function defaultStorage(): Storage | undefined {
  return typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage;
}

function navigatorLanguage(): string | null {
  return typeof navigator !== 'undefined' ? navigator.language : null;
}

function mergeCatalog(base: Readonly<Record<DesktopTranslationKey, string>>, overrides: DesktopCatalog): Readonly<DesktopCatalog> {
  return { ...base, ...overrides };
}

function buildDefaultEnglishCatalog(): Readonly<Record<DesktopTranslationKey, string>> {
  const catalog = Object.fromEntries(desktopTranslationKeys.map((key) => [key, humanizeKey(key)])) as Record<DesktopTranslationKey, string>;
  return mergeCatalog(catalog, { ...desktopEnOverrides, ...desktopSystemPanelCoreOverrides.en }) as Readonly<Record<DesktopTranslationKey, string>>;
}

function humanizeKey(key: string): string {
  const segments = key.split('.');
  const tail = segments[segments.length - 1] || key;
  const words = tail
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
  return words.map((word, index) => capitalizeAcronym(word, index)).join(' ');
}

function capitalizeAcronym(word: string, index: number): string {
  const acronyms: Record<string, string> = {
    ai: 'AI',
    api: 'API',
    url: 'URL',
    ui: 'UI',
    json: 'JSON',
    ssh: 'SSH',
    mcp: 'MCP',
    llm: 'LLM',
    pdf: 'PDF',
    sdk: 'SDK',
    git: 'Git',
    tcp: 'TCP',
    tls: 'TLS',
    pt: 'PT',
    fr: 'FR',
    de: 'DE',
    it: 'IT',
    es: 'ES'
  };
  if (acronyms[word]) return acronyms[word];
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function translate(catalog: Readonly<DesktopCatalog>, key: DesktopTranslationKey, params?: TranslationParams): string {
  const template = catalog[key] || defaultEnglishCatalog[key] || key;
  return formatTranslation(template, params);
}

function formatTranslation(template: string, params?: TranslationParams): string {
  if (params === undefined || params === null) return template;
  if (typeof params === 'string' || typeof params === 'number' || typeof params === 'boolean') {
    return template.replace(/\{0\}/g, String(params));
  }
  if (Array.isArray(params)) {
    return params.reduce<string>((acc, value, index) => acc.replace(new RegExp(`\\{${index}\\}`, 'g'), String(value)), template);
  }
  return Object.entries(params).reduce((acc, [key, value]) => acc.replace(new RegExp(`\\{${escapeRegExp(key)}\\}`, 'g'), String(value)), template);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
