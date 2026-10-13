import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatComposer, type ChatComposerProps } from '../src/renderer/panels/ChatComponents.js';
import { DesktopI18nProvider } from '../src/renderer/i18n.js';

function renderComposer(overrides: Partial<ChatComposerProps> = {}): string {
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

describe('chat composer model guidance', () => {
  it('keeps the no-active-model hint in the model selector without a persistent banner', () => {
    const markup = renderComposer({ noActiveModels: true });

    expect(markup).toContain('No models are active. Activate a scanned model in AI &amp; local models.');
    expect(markup).not.toContain('class="composer-model-notice"');
  });

  it('moves beta opt-in into the More menu instead of repeating it in the composer', () => {
    const markup = renderComposer({
      emptyQualifiedCatalog: true,
      modelOptions: [{ provider: 'MiMo', providerId: 'xiaomi', models: [{ id: 'mimo-v2.6-flash', label: 'MiMo V2.6 Flash' }] }],
    });
    const moreMenu = markup.indexOf('class="composer-more-content"');
    const betaToggle = markup.indexOf('data-testid="provider-beta-catalog-toggle"');

    const betaInfo = markup.indexOf('class="composer-beta-catalog-opt-in"');
    expect(moreMenu).toBeGreaterThanOrEqual(0);
    expect(betaInfo).toBeGreaterThan(moreMenu);
    expect(betaToggle).toBeGreaterThan(moreMenu);
  });

  it('retains loading and catalog-error messages with their retry action', () => {
    const loading = renderComposer({ modelCatalogLoading: true });
    const failure = renderComposer({ modelCatalogError: true, onRetryModelCatalog: () => undefined });

    expect(loading).toContain('class="composer-model-notice"');
    expect(failure).toContain('class="composer-model-notice" role="alert"');
    expect(failure).toContain('Retry model list');
  });

  it('retains the actionable explanation when a saved choice actually blocks sending', () => {
    const markup = renderComposer({ betaSelectionBlocked: true, multiAgentBetaBlocked: true });

    expect(markup).toContain('This saved choice runs a multi-agent mode.');
    expect(markup).toContain('class="composer-model-notice" role="status"');
  });
});
