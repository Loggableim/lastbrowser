import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SpaceSetupModal,
  isDuplicateSpaceName,
  normalizePinnedApp,
  resolvePresetModel,
  submitSpaceSetup,
  type SpaceSetupData
} from '../src/renderer/components/SpaceSetupModal.js';
import { DesktopI18nProvider, desktopLocaleOverrides, desktopLocaleIds, createDesktopI18n, resolveDesktopLocale } from '../src/renderer/i18n.js';

const setupData: SpaceSetupData = {
  path: 'spaces/research',
  name: 'Research',
  color: '#a855f7',
  model: 'smart-track',
  pinnedApps: [{ name: 'Notion', url: 'https://notion.so' }],
  startUrl: 'https://notion.so'
};

describe('Space setup validation and model defaults', () => {
  it('detects duplicate names after trimming and without case sensitivity', () => {
    expect(isDuplicateSpaceName('  Research  ', ['research'])).toBe(true);
    expect(isDuplicateSpaceName('Research', ['Coding', ' research '])).toBe(true);
    expect(isDuplicateSpaceName('Research', ['Research Notes'])).toBe(false);
    expect(isDuplicateSpaceName('   ', [''])).toBe(false);
  });

  it('uses the preset model only when available, otherwise preserves a live choice', () => {
    expect(resolvePresetModel('gemini-2.5-pro', 'openai/gpt-live', ['openai/gpt-live'])).toBe('openai/gpt-live');
    expect(resolvePresetModel('gemini-2.5-pro', 'gemini-2.5-pro', ['openai/gpt-live'])).toBe('smart-track');
    expect(resolvePresetModel('smart-track', 'openai/gpt-live', ['openai/gpt-live'])).toBe('smart-track');
    expect(resolvePresetModel('openai/gpt-live', 'smart-track', ['openai/gpt-live'])).toBe('openai/gpt-live');
  });

  it('accepts custom HTTP(S) pinned apps and rejects invalid or unsafe URLs', () => {
    expect(normalizePinnedApp('  My Tool ', 'https://example.com/path')).toEqual({
      name: 'My Tool', url: 'https://example.com/path'
    });
    expect(normalizePinnedApp('Tool', 'javascript:alert(1)')).toBeNull();
    expect(normalizePinnedApp('', 'https://example.com')).toBeNull();
    expect(normalizePinnedApp('Tool', 'not a URL')).toBeNull();
  });

  it('waits for space creation before closing the wizard', async () => {
    let resolveCreate!: (success: boolean) => void;
    const onCreate = () => new Promise<boolean>((resolve) => { resolveCreate = resolve; });
    const onClose = () => closed.push(true);
    const closed: boolean[] = [];

    const resultPromise = submitSpaceSetup(setupData, onCreate, onClose);
    expect(closed).toEqual([]);
    resolveCreate(true);

    expect(await resultPromise).toBeNull();
    expect(closed).toEqual([true]);
  });

  it('keeps the wizard open and reports a failed or rejected creation', async () => {
    const onClose = () => closed.push(true);
    const closed: boolean[] = [];

    const rejected = await submitSpaceSetup(setupData, async () => false, onClose);
    expect(rejected?.message).toContain('Could not create the Space');
    expect(closed).toEqual([]);

    const failure = new Error('Backend unavailable');
    expect(await submitSpaceSetup(setupData, async () => { throw failure; }, onClose)).toBe(failure);
    expect(closed).toEqual([]);
  });
});

describe('Space setup translations and rendered dialog', () => {
  it('provides every Space setup translation in all supported locales', () => {
    const setupKeys = Object.keys(desktopLocaleOverrides.en).filter((key) => key.startsWith('spaceSetup.'));
    expect(setupKeys.length).toBeGreaterThan(40);
    for (const locale of desktopLocaleIds) {
      const catalog = desktopLocaleOverrides[locale];
      for (const key of setupKeys) {
        expect(catalog[key as keyof typeof catalog]?.trim(), `${locale}.${key}`).toBeTruthy();
        const sourceParams = [...(desktopLocaleOverrides.en[key as keyof typeof desktopLocaleOverrides.en] || '').matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();
        const localizedParams = [...(catalog[key as keyof typeof catalog] || '').matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();
        expect(localizedParams, `${locale}.${key} interpolation`).toEqual(sourceParams);
      }
    }
  });

  it('renders the open Space setup dialog with accessible title and localized controls', () => {
    const markup = renderToStaticMarkup(
      React.createElement(DesktopI18nProvider, null,
        React.createElement(SpaceSetupModal, {
          isOpen: true,
          onClose: () => undefined,
          onCreateSpace: async () => true
        })
      )
    );
    const browserLocale = resolveDesktopLocale({ browserLanguage: typeof navigator !== 'undefined' ? navigator.language : 'en' });
    const localized = createDesktopI18n(browserLocale);
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-labelledby="space-setup-title"');
    expect(markup).toContain(localized.t('spaceSetup.title'));
    expect(markup).toContain(localized.t('spaceSetup.chooseTemplate'));
    // The wizard starts on step 1, so it should show the localized next-step
    // action. The final create action is intentionally gated until step 3.
    expect(markup).toContain(localized.t('common.next'));
    expect(markup).not.toContain(localized.t('spaceSetup.createAndOpen'));
  });

  it('localizes Russian Space setup labels and keeps interpolation values', () => {
    const russian = createDesktopI18n('ru');
    expect(russian.t('spaceSetup.title')).toBe('Настройка нового пространства');
    expect(russian.t('spaceSetup.pathHint', { path: 'spaces/research' })).toContain('spaces/research');
    expect(russian.t('spaceSetup.model.availableVia', { provider: 'Ollama' })).toContain('Ollama');
  });
});
