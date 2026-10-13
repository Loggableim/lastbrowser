import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatComposer, type ChatComposerProps } from '../src/renderer/panels/ChatComponents.js';
import { createDesktopI18n, DesktopI18nProvider, desktopLocaleStorageKey } from '../src/renderer/i18n.js';

const testLocales = [
  { locale: 'de-DE', catalogLocale: 'de' },
  { locale: 'en-US', catalogLocale: 'en' },
] as const;

function renderComposer(locale: string, overrides: Partial<ChatComposerProps> = {}): string {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => key === desktopLocaleStorageKey ? locale : null,
    setItem: () => undefined,
  });

  const props: ChatComposerProps = {
    busy: false,
    mode: 'action',
    model: 'gpt-6-luna',
    modelProvider: 'openai-codex',
    modelOptions: [],
    reasoningEffort: '',
    reasoningEfforts: [],
    profile: 'default',
    ready: true,
    runState: 'idle',
    text: '',
    workspace: 'default',
    onMode: () => undefined,
    onModelChange: () => undefined,
    onReasoningEffort: () => undefined,
    onSend: () => undefined,
    onStop: () => undefined,
    onText: () => undefined,
    ...overrides,
  };
  return renderToStaticMarkup(React.createElement(
    DesktopI18nProvider,
    null,
    React.createElement(ChatComposer, props),
  ));
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
  })[character]!);
}

afterEach(() => vi.unstubAllGlobals());

describe('chat composer model guidance', () => {
  it.each(testLocales)('keeps the no-active-model hint in the selector for $locale without a persistent banner', ({ locale, catalogLocale }) => {
    const markup = renderComposer(locale, { noActiveModels: true });
    const noActiveModels = escapeHtml(createDesktopI18n(catalogLocale).t('settings.panels.providers.noActiveModels'));
    const modelSelectStart = markup.indexOf('<select');
    const modelSelectEnd = markup.indexOf('</select>', modelSelectStart);
    const noActiveModelsIndex = markup.indexOf(noActiveModels);

    expect(noActiveModelsIndex).toBeGreaterThan(modelSelectStart);
    expect(noActiveModelsIndex).toBeLessThan(modelSelectEnd);
    expect(markup).not.toContain('class="composer-model-notice"');
  });

  it.each(testLocales)('moves beta opt-in into the More menu for $locale instead of repeating it in the composer', ({ locale }) => {
    const markup = renderComposer(locale, {
      emptyQualifiedCatalog: true,
      modelOptions: [{ provider: 'MiMo', providerId: 'xiaomi', models: [{ id: 'mimo-v2.6-flash', label: 'MiMo V2.6 Flash' }] }],
    });
    const moreMenu = markup.indexOf('class="composer-more-content"');
    const betaToggle = markup.indexOf('data-testid="provider-beta-catalog-toggle"');

    const betaInfo = markup.indexOf('class="composer-beta-catalog-opt-in"');
    expect(moreMenu).toBeGreaterThanOrEqual(0);
    expect(betaInfo).toBeGreaterThan(moreMenu);
    expect(betaToggle).toBeGreaterThan(moreMenu);
    expect(markup).not.toContain('class="composer-model-notice composer-beta-catalog-opt-in"');
  });

  it.each(testLocales)('retains loading and catalog-error states with localized retry action for $locale', ({ locale, catalogLocale }) => {
    const translations = createDesktopI18n(catalogLocale);
    const loading = renderComposer(locale, { modelCatalogLoading: true });
    const failure = renderComposer(locale, { modelCatalogError: true, onRetryModelCatalog: () => undefined });

    expect(loading).toContain('class="composer-model-notice"');
    expect(failure).toContain('class="composer-model-notice" role="alert"');
    expect(failure).toContain(escapeHtml(translations.t('chat.retryModels')));
  });

  it.each(testLocales)('retains the actionable explanation when a saved choice blocks sending for $locale', ({ locale, catalogLocale }) => {
    const markup = renderComposer(locale, {
      betaSelectionBlocked: true,
      multiAgentBetaBlocked: true,
      sendBlocked: true,
      text: 'This message must not be sent',
    });
    const blockedNotice = escapeHtml(createDesktopI18n(catalogLocale).t('settings.panels.providers.multiAgentBetaRequired'));
    const sendButton = markup.match(/<button type="submit" class="composer-send"[^>]*>/)?.[0];

    expect(markup).toContain(blockedNotice);
    expect(markup).toContain('class="composer-model-notice" role="status"');
    expect(sendButton).toContain('disabled=""');
  });
});
