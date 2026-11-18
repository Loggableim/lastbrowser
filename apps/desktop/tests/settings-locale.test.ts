import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createDesktopI18n, DesktopI18nProvider, desktopLocaleIds, desktopLocaleOverrides } from '../src/renderer/i18n.js';
import { NativeHeader } from '../src/renderer/panels/RestPanelShared.js';
import { NativeSettingsMain } from '../src/renderer/panels/SystemPanels.js';

function renderInLanguage(language: string, children: ReturnType<typeof createElement>): string {
  try {
    vi.stubGlobal('navigator', { language });
    vi.stubGlobal('localStorage', { getItem: () => null });
    return renderToStaticMarkup(createElement(DesktopI18nProvider, { children }));
  } finally { vi.unstubAllGlobals(); }
}

describe('Settings language switch', () => {
  const source = readFileSync(path.resolve(process.cwd(), 'src/renderer/panels/SystemPanels.tsx'), 'utf8');

  it('updates the live React catalog and persists the selected language', () => {
    expect(source).toContain('const { t, locale, setLocale } = useDesktopI18n();');
    expect(source).toContain("updateDraftField('language', event.target.value);");
    expect(source).toContain('setLocale(event.target.value);');
    expect(source).not.toContain('window.lastbrowser?.i18n?.setLocale?.(event.target.value)');
  });

  it('localizes the default-browser action feedback in every shipped language', () => {
    for (const locale of desktopLocaleIds) {
      const i18n = createDesktopI18n(locale);
      expect(i18n.t('settings.panels.preferences.defaultBrowserOpened')).not.toBe('Default Browser Opened');
      expect(i18n.t('settings.panels.preferences.defaultBrowserError')).not.toBe('Default Browser Error');
    }
    expect(source).toContain("showToast(t('settings.panels.preferences.defaultBrowserOpened'))");
    expect(source).toContain("showToast(t('settings.panels.preferences.defaultBrowserError'))");
  });
});

describe('Localized native settings copy', () => {
  it('keeps the native header and Codex CLI description in every shipped catalog', () => {
    for (const locale of desktopLocaleIds) {
      const copy = desktopLocaleOverrides[locale];
      for (const key of ['common.online', 'common.starting', 'common.refresh', 'common.close'] as const) {
        expect(copy[key], `${locale} ${key}`).toBeTruthy();
      }
      expect(copy['settings.sectionDescriptions.codexCli'], locale).toContain('Codex CLI');
    }
  });

  it.each([
    ['fr-FR', 'En ligne', 'Démarrage', 'Actualiser', 'Fermer'],
    ['ja-JP', 'オンライン', '起動中', '更新', '閉じる'],
  ])('renders native header controls and status for %s', (language, online, starting, refresh, close) => {
    const header = { icon: null, title: 'Fixture', kicker: 'Fixture', detail: 'Fixture', onRefresh: async () => {}, onClose: () => {} };
    const ready = renderInLanguage(language, createElement(NativeHeader, { ...header, ready: true }));
    expect(ready).toContain(`${online}</span>`);
    expect(ready).toContain(`<span>${refresh}</span>`);
    expect(ready).toContain(`aria-label="${close}"`);
    const pending = renderInLanguage(language, createElement(NativeHeader, { ...header, ready: false, closeLabel: 'Fixture override' }));
    expect(pending).toContain(`${starting}</span>`);
    expect(pending).toContain('aria-label="Fixture override"');
  });

  it.each([
    ['fr-FR', 'Lancez le Codex CLI installé dans cet espace.'],
    ['ja-JP', 'このスペースで、インストール済みの Codex CLI を起動します。'],
  ])('renders the Codex CLI settings description for %s', (language, description) => {
    const settings = renderInLanguage(language, createElement(NativeSettingsMain, {
      serviceStatus: null,
      activeContextItem: 'codex-cli',
      onboardingStatus: null,
      onReopenSetup: () => {},
      searchEngineId: 'google',
      onSearchEngineChange: () => {},
      profiles: [],
      activeProfileId: 'fixture',
      onSelectProfile: () => {},
      onCreateProfile: () => {},
      onRenameProfile: () => {},
      onDeleteProfile: () => {},
    }));
    const navigation = settings.match(/<nav class="settings-section-nav[^>]*>.*?<\/nav>/)?.[0];
    expect(navigation).toContain(`<strong>Codex CLI</strong><small>${description}</small>`);
    expect(settings).toContain(`<strong>Codex CLI</strong><span>${description}</span>`);
  });
});
