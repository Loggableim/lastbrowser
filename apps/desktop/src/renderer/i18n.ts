import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { DesktopCatalog, DesktopLocaleId, DesktopTranslationKey } from './i18n/keys.js';
import {
  desktopLocaleIds,
  desktopLocaleNames,
  desktopTranslationKeys
} from './i18n/keys.js';
import { desktopDeOverrides } from './i18n/locales/de.js';
import { desktopEnOverrides } from './i18n/locales/en.js';
import { desktopEsOverrides } from './i18n/locales/es.js';
import { desktopFrOverrides } from './i18n/locales/fr.js';
import { desktopItOverrides } from './i18n/locales/it.js';
import { desktopPtBrOverrides } from './i18n/locales/pt-BR.js';

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
  en: mergeCatalog(defaultEnglishCatalog, desktopEnOverrides),
  de: mergeCatalog(defaultEnglishCatalog, desktopDeOverrides),
  it: mergeCatalog(defaultEnglishCatalog, desktopItOverrides),
  es: mergeCatalog(defaultEnglishCatalog, desktopEsOverrides),
  fr: mergeCatalog(defaultEnglishCatalog, desktopFrOverrides),
  'pt-BR': mergeCatalog(defaultEnglishCatalog, desktopPtBrOverrides)
};

export function normalizeDesktopLocale(value: unknown): DesktopLocaleId | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/_/g, '-');
  const lower = normalized.toLowerCase();

  if (lower === 'pt' || lower === 'pt-br' || lower === 'ptbr') return 'pt-BR';
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
  return mergeCatalog(catalog, desktopEnOverrides) as Readonly<Record<DesktopTranslationKey, string>>;
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
    return params.reduce((acc, value, index) => acc.replace(new RegExp(`\\{${index}\\}`, 'g'), String(value)), template);
  }
  return Object.entries(params).reduce((acc, [key, value]) => acc.replace(new RegExp(`\\{${escapeRegExp(key)}\\}`, 'g'), String(value)), template);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
