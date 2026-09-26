import { describe, expect, it } from 'vitest';
import {
  desktopLocaleCatalogs,
  desktopLocaleOverrides,
  desktopLocaleIds,
  desktopTranslationKeys,
  normalizeDesktopLocale,
  resolveDesktopLocale,
  createDesktopI18n
} from '../src/renderer/i18n.js';

describe('desktop i18n', () => {
  it('normalizes supported locale inputs to desktop locale ids', () => {
    expect(normalizeDesktopLocale('de-DE')).toBe('de');
    expect(normalizeDesktopLocale('it_IT')).toBe('it');
    expect(normalizeDesktopLocale('es')).toBe('es');
    expect(normalizeDesktopLocale('fr-FR')).toBe('fr');
    expect(normalizeDesktopLocale('pt-br')).toBe('pt-BR');
    expect(normalizeDesktopLocale('pt_BR')).toBe('pt-BR');
    expect(normalizeDesktopLocale('ru-RU')).toBe('ru');
    expect(normalizeDesktopLocale('ru_RU')).toBe('ru');
    expect(normalizeDesktopLocale('Русский')).toBe('ru');
    expect(normalizeDesktopLocale('xx-YY')).toBeNull();
  });

  it('resolves locale precedence from settings, browser locale, then English', () => {
    expect(resolveDesktopLocale({ settingsLanguage: 'it-IT', browserLanguage: 'de-DE' })).toBe('it');
    expect(resolveDesktopLocale({ settingsLanguage: 'zz-ZZ', browserLanguage: 'fr-CA' })).toBe('fr');
    expect(resolveDesktopLocale({ settingsLanguage: '', browserLanguage: '' })).toBe('en');
    expect(resolveDesktopLocale({ savedLocale: 'unsupported', settingsLanguage: 'ru-RU', browserLanguage: 'de' })).toBe('ru');
    expect(resolveDesktopLocale({ savedLocale: 'ru_RU', settingsLanguage: 'it', browserLanguage: 'de' })).toBe('ru');
  });

  it('falls back to English when a locale is missing a key', () => {
    const i18n = createDesktopI18n('en');
    expect(i18n.t('browser.aiBrowser.title')).toBe('AI Browser');
    expect(i18n.t('desktop.unknown.key' as never)).toBe('desktop.unknown.key');
  });

  it('keeps the locale catalogs in parity across all shipped languages', () => {
    expect(desktopLocaleIds).toEqual(['en', 'de', 'it', 'es', 'fr', 'pt-BR', 'ru']);
    const englishKeys = new Set(desktopTranslationKeys);

    for (const localeId of desktopLocaleIds) {
      const catalog = desktopLocaleCatalogs[localeId];
      const keys = Object.keys(catalog);
      expect(keys.length).toBe(desktopTranslationKeys.length);
      expect(new Set(keys)).toEqual(englishKeys);
    }
  });

  it('requires every raw locale resource to cover every key before English fallback', () => {
    const expected = new Set<string>(desktopTranslationKeys);

    for (const localeId of desktopLocaleIds) {
      const raw = desktopLocaleOverrides[localeId];
      expect(new Set(Object.keys(raw)), `${localeId} raw keys`).toEqual(expected);
      for (const [key, value] of Object.entries(raw)) {
        expect(value.trim(), `${localeId}.${key} must not be empty`).not.toBe('');
        expect(value, `${localeId}.${key} must not contain temporary translation markers`).not.toMatch(/\[(?:EN|DE|ES|FR|IT|PT(?:-BR)?|RU|TODO|TRANSLATE)\]/i);
        const enParams = [...(desktopLocaleOverrides.en[key as keyof typeof desktopLocaleOverrides.en] || '').matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();
        const localeParams = [...value.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();
        expect(localeParams, `${localeId}.${key} interpolation parameters`).toEqual(enParams);
      }
    }
  });

  it('translates Russian UI strings and preserves named interpolation parameters', () => {
    const i18n = createDesktopI18n('ru');
    expect(i18n.t('settings.title')).toBe('Настройки');
    expect(i18n.t('firstRun.section2Title', { botName: 'Nova' })).toContain('Nova');
    expect(i18n.t('firstRun.section2Title', { botName: 'Nova' })).not.toContain('{botName}');
  });
});
