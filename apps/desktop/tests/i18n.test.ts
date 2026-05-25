import { describe, expect, it } from 'vitest';
import {
  desktopLocaleCatalogs,
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
    expect(normalizeDesktopLocale('xx-YY')).toBeNull();
  });

  it('resolves locale precedence from settings, browser locale, then English', () => {
    expect(resolveDesktopLocale({ settingsLanguage: 'it-IT', browserLanguage: 'de-DE' })).toBe('it');
    expect(resolveDesktopLocale({ settingsLanguage: 'zz-ZZ', browserLanguage: 'fr-CA' })).toBe('fr');
    expect(resolveDesktopLocale({ settingsLanguage: '', browserLanguage: '' })).toBe('en');
  });

  it('falls back to English when a locale is missing a key', () => {
    const i18n = createDesktopI18n('en');
    expect(i18n.t('browser.aiBrowser.title')).toBe('AI Browser');
    expect(i18n.t('desktop.unknown.key' as never)).toBe('desktop.unknown.key');
  });

  it('keeps the locale catalogs in parity across all shipped languages', () => {
    expect(desktopLocaleIds).toEqual(['en', 'de', 'it', 'es', 'fr', 'pt-BR']);
    const englishKeys = new Set(desktopTranslationKeys);

    for (const localeId of desktopLocaleIds) {
      const catalog = desktopLocaleCatalogs[localeId];
      const keys = Object.keys(catalog);
      expect(keys.length).toBe(desktopTranslationKeys.length);
      expect(new Set(keys)).toEqual(englishKeys);
    }
  });
});
