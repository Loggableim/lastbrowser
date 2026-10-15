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

function modelSelectBounds(markup: string, modelLabel: string): { start: number; end: number } {
  const host = markup.indexOf('composer-current-model');
  const start = host < 0 ? -1 : markup.indexOf('<select', host);
  const end = start < 0 ? -1 : markup.indexOf('</select>', start);
  const openEnd = start < 0 ? -1 : markup.indexOf('>', start);
  const opening = start < 0 || openEnd < 0 ? '' : markup.slice(start, openEnd + 1);
  expect(opening).toContain(`aria-label="${escapeHtml(modelLabel)}`);
  return { start, end };
}

afterEach(() => vi.unstubAllGlobals());

describe('chat composer model guidance', () => {
  it.each(testLocales)('keeps the no-active-model hint in the selector for $locale without a persistent banner', ({ locale, catalogLocale }) => {
    const markup = renderComposer(locale, { noActiveModels: true });
    const translations = createDesktopI18n(catalogLocale);
    const noActiveModels = escapeHtml(translations.t('settings.panels.providers.noActiveModels'));
    const { start: modelSelectStart, end: modelSelectEnd } = modelSelectBounds(markup, translations.t('chat.model'));
    const shortLabel = escapeHtml(locale.startsWith('de') ? 'Keine Modelle aktiv' : 'No active models');
    const shortIndex = markup.indexOf(shortLabel);

    expect(shortIndex).toBeGreaterThan(modelSelectStart);
    expect(shortIndex).toBeLessThan(modelSelectEnd);
    expect(markup).toContain(`title="${noActiveModels}"`);
    expect(markup).not.toContain('class="composer-model-notice"');
  });

  it.each(testLocales)('moves beta opt-in into the More menu for $locale instead of repeating it in the composer', ({ locale }) => {
    const markup = renderComposer(locale, {
      emptyQualifiedCatalog: true,
      modelOptions: [{ provider: 'MiMo', providerId: 'xiaomi', models: [{ id: 'mimo-v2.6-flash', label: 'MiMo V2.6 Flash' }] }],
    });
    const moreMenu = markup.indexOf('class="composer-more-content"');
    const statusNotice = markup.indexOf('class="composer-model-notice" role="status"');
    const betaToggle = markup.indexOf('data-testid="provider-beta-catalog-toggle"');

    expect(moreMenu).toBeGreaterThanOrEqual(0);
    expect(statusNotice).toBeGreaterThan(moreMenu);
    expect(betaToggle).toBeGreaterThan(statusNotice);
    expect(markup.split('data-testid="provider-beta-catalog-toggle"').length - 1).toBe(1);
    expect(markup).not.toContain('class="composer-beta-catalog-opt-in"');
  });

  it.each(testLocales)('retains loading and catalog-error states with localized retry action for $locale', ({ locale, catalogLocale }) => {
    const translations = createDesktopI18n(catalogLocale);
    const loading = renderComposer(locale, { modelCatalogLoading: true });
    const failure = renderComposer(locale, { modelCatalogError: true, onRetryModelCatalog: () => undefined });

    expect(loading).toContain('class="composer-model-notice"');
    expect(failure).toContain('class="composer-model-notice" role="alert"');
    expect(failure).toContain(escapeHtml(translations.t('chat.retryModels')));
  });

  it.each(testLocales)('shows the neutral slow-catalog hint with retry instead of "no models" for $locale', ({ locale, catalogLocale }) => {
    const translations = createDesktopI18n(catalogLocale);
    const markup = renderComposer(locale, { modelCatalogSlow: true, onRetryModelCatalog: () => undefined });

    expect(markup).toContain('class="composer-model-notice" role="status"');
    expect(markup).toContain(escapeHtml(translations.t('chat.modelCatalogSlow')));
    expect(markup).toContain(escapeHtml(translations.t('chat.retryModels')));
    // While the catalog is slow the selector must not claim that no models exist.
    expect(markup).not.toContain(escapeHtml(translations.t('chat.noManualModels')));
  });

  it.each(testLocales)('leaves the send button enabled during catalog loading or after a catalog error for $locale when the parent does not block', ({ locale }) => {
    // The parent decides sendBlocked from the chosen model; the composer must not add its own catalog block.
    const loading = renderComposer(locale, { modelCatalogLoading: true, text: 'Sent while the catalog loads' });
    const failure = renderComposer(locale, { modelCatalogError: true, onRetryModelCatalog: () => undefined, text: 'Sent after a catalog error' });
    const loadingSend = loading.match(/<button type="submit" class="composer-send"[^>]*>/)?.[0];
    const failureSend = failure.match(/<button type="submit" class="composer-send"[^>]*>/)?.[0];

    expect(loadingSend).toBeDefined();
    expect(loadingSend).not.toContain('disabled=""');
    expect(failureSend).toBeDefined();
    expect(failureSend).not.toContain('disabled=""');
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

  it.each(testLocales)('places browser tabs inside More, beside Action and Plan and left of the model, for $locale', ({ locale, catalogLocale }) => {
    const markup = renderComposer(locale);
    const translations = createDesktopI18n(catalogLocale);
    const tabs = escapeHtml(translations.t('browser.chrome.tabs'));
    const moreMenu = markup.indexOf('class="composer-more-content"');
    const moreControl = markup.indexOf('class="composer-more"');
    const modelSelect = modelSelectBounds(markup, translations.t('chat.model')).start;
    const field = markup.indexOf('<textarea');
    const send = markup.indexOf('class="composer-send"');

    expect(moreControl).toBeGreaterThanOrEqual(0);
    expect(moreControl).toBeLessThan(modelSelect);
    expect(markup.indexOf(tabs)).toBeGreaterThan(moreMenu);
    expect(field).toBeGreaterThan(modelSelect);
    expect(send).toBeGreaterThan(field);
    expect(markup).toContain('rows="1"');
    expect(markup).not.toContain('composer-context-group');
  });
});
