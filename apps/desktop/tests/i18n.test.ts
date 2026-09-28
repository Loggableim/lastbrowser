import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('keeps prominent navigation and settings copy localized instead of leaking English labels', () => {
    const visibleUiKeys = [
      'settings.panels.appearance.themeTitle',
      'settings.panels.appearance.typographyTitle',
      'settings.panels.appearance.messageLayoutTitle',
      'settings.panels.notifications.title',
      'settings.panels.notifications.sound',
      'settings.panels.notifications.browser',
      'settings.panels.providers.configure',
      'settings.panels.providers.apiKey',
      'settings.panels.providers.openrouterChooseModels',
      'settings.panels.providers.saveActivate',
      'spaceSetup.title',
      'spaceSetup.chooseTemplate',
      'spaceSetup.createAndOpen',
      'sidebar.space.workspace',
      'sidebar.space.switch'
    ] as const;
    const english = desktopLocaleOverrides.en;
    const visibleRendererSources = [
      'src/renderer/panels/SystemPanels.tsx',
      'src/renderer/components/SpaceSetupModal.tsx',
      'src/renderer/components/SidekickSidebar.tsx'
    ].map((relativePath) => readFileSync(resolve(__dirname, '..', relativePath), 'utf8'));

    for (const locale of desktopLocaleIds.filter((id) => id !== 'en')) {
      const i18n = createDesktopI18n(locale);
      for (const key of visibleUiKeys) {
        expect(visibleRendererSources.some((source) => source.includes(`t('${key}')`)), `${key} must be wired to visible UI`).toBe(true);
        const translated = i18n.t(key);
        expect(translated.trim(), `${locale}.${key} must be visible copy`).not.toBe('');
        expect(translated, `${locale}.${key} must not show the raw key`).not.toBe(key);
        expect(translated, `${locale}.${key} is an untranslated English value`).not.toBe(english[key]);
      }
    }
  });

  it('localizes the Space picker chrome in all supported languages', () => {
    const expected: Record<string, string[]> = {
      en: ['Workspace', 'Switch space', 'Spaces'],
      de: ['Arbeitsbereich', 'Space wechseln', 'Spaces'],
      es: ['Espacio de trabajo', 'Cambiar de espacio', 'Espacios'],
      fr: ['Espace de travail', 'Changer d’espace', 'Espaces'],
      it: ['Area di lavoro', 'Cambia spazio', 'Spazi'],
      'pt-BR': ['Área de trabalho', 'Trocar espaço', 'Espaços'],
      ru: ['Рабочее пространство', 'Сменить пространство', 'Пространства']
    };
    for (const locale of desktopLocaleIds) {
      const i18n = createDesktopI18n(locale);
      expect([
        i18n.t('sidebar.space.workspace'),
        i18n.t('sidebar.space.switch'),
        i18n.t('sidebar.space.spaces')
      ]).toEqual(expected[locale]);
    }
  });

  it('translates the Nova empty state and native chat composer across all locales', () => {
    const expectedTitles: Record<string, string> = {
      en: 'Ask Nova about this page',
      de: 'Frag Nova zu dieser Seite',
      es: 'Pregunta a Nova sobre esta página',
      fr: 'Interrogez Nova sur cette page',
      it: 'Chiedi a Nova informazioni su questa pagina',
      'pt-BR': 'Pergunte ao Nova sobre esta página',
      ru: 'Спросите Nova об этой странице'
    };

    for (const locale of desktopLocaleIds) {
      const i18n = createDesktopI18n(locale);
      expect(i18n.t('copilot.emptyTitle', { botName: 'Nova' })).toBe(expectedTitles[locale]);
      expect(i18n.t('copilot.emptyDescription').trim()).not.toBe('');
      expect(i18n.t('chat.composerPlaceholder').trim()).not.toBe('');
      expect(i18n.t('chat.runtimeStarting').trim()).not.toBe('');
    }
  });

  it('localizes address bar labels and omnibox suggestion badges in every locale', () => {
    const expectedLabels: Record<string, string> = {
      en: 'Address or search',
      de: 'Adresse oder Suche',
      es: 'Dirección o búsqueda',
      fr: 'Adresse ou recherche',
      it: 'Indirizzo o ricerca',
      'pt-BR': 'Endereço ou pesquisa',
      ru: 'Адрес или поиск'
    };
    for (const locale of desktopLocaleIds) {
      const i18n = createDesktopI18n(locale);
      expect(i18n.t('browser.omnibox.addressLabel')).toBe(expectedLabels[locale]);
      expect(i18n.t('browser.omnibox.searchSuggestion', { engine: 'Google', query: 'example' })).toContain('Google');
      expect(i18n.t('browser.omnibox.searchSuggestion', { engine: 'Google', query: 'example' })).toContain('example');
      for (const key of [
        'browser.omnibox.addBookmark',
        'browser.omnibox.bookmarkBadge',
        'browser.omnibox.historyBadge',
        'browser.omnibox.navigate',
        'browser.omnibox.openUrl',
        'browser.omnibox.removeBookmark'
      ] as const) {
        expect(i18n.t(key).trim(), `${locale}.${key}`).not.toBe('');
      }
    }
  });
});
