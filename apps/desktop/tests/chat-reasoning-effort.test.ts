import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatComposer } from '../src/renderer/panels/ChatComponents.js';
import { ReasoningEffortPicker } from '../src/renderer/components/ReasoningEffortPicker.js';
import { DesktopI18nProvider } from '../src/renderer/i18n.js';
import { loadChatReasoningEffort, normalizeReasoningEfforts, resolveReasoningModel, resolveSessionReasoningEffort, saveChatReasoningEffort } from '../src/renderer/chat-reasoning-effort.js';

vi.mock('../src/renderer/i18n.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/renderer/i18n.js')>();
  return { ...actual, useDesktopI18n: () => actual.createDesktopI18n('en') };
});

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; },
  };
}

function renderComposer(reasoningEfforts: string[], reasoningEffort = '', busy = false, runState: 'idle' | 'streaming' = 'idle'): string {
  return renderToStaticMarkup(React.createElement(
    DesktopI18nProvider,
    null,
    React.createElement(ChatComposer, {
      busy,
      mode: 'action',
      model: 'gpt-6.1-sol',
      modelProvider: 'openai-codex',
      modelOptions: [],
      reasoningEffort,
      reasoningEfforts,
      profile: 'default',
      ready: true,
      runState,
      text: '',
      workspace: 'default',
      onMode: () => undefined,
      onModelChange: () => undefined,
      onReasoningEffort: () => undefined,
      onSend: () => undefined,
      onStop: () => undefined,
      onText: () => undefined,
    }),
  ));
}

describe('chat reasoning effort selection', () => {
  it('restores only the exact persistent provider/model choice without requiring live discovery', () => {
    const saved = { schemaVersion: 1, provider: 'openai-codex', model: 'gpt-5.3-codex', effort: 'high' };
    expect(resolveSessionReasoningEffort(saved, '@openai-codex:gpt-5.3-codex', '')).toBe('high');
    expect(resolveSessionReasoningEffort(saved, 'gpt-5.3-codex', 'custom')).toBeNull();
    expect(resolveSessionReasoningEffort(saved, 'gpt-5.4-mini', 'openai-codex')).toBeNull();
    expect(resolveSessionReasoningEffort(saved, 'gpt-5.3-codex', '')).toBeNull();
    expect(resolveSessionReasoningEffort({ ...saved, effort: 'ultra' }, saved.model, saved.provider)).toBeNull();
    expect(resolveSessionReasoningEffort({ ...saved, schemaVersion: 2 }, saved.model, saved.provider)).toBeNull();
  });
  it('renders only runtime-advertised levels and reflects the conversation choice', () => {
    const markup = renderComposer(['low', 'medium', 'high', 'max'], 'high');
    expect(markup).toContain('aria-label="Reasoning depth"');
    expect(markup).toContain('value="high" selected=""');
    expect(markup).toContain('>Low</option>');
    expect(markup).toContain('>Maximum</option>');
    expect(markup).not.toContain('>Ultra</option>');
    expect(markup).not.toContain('>Very high</option>');
  });

  it('renders a disabled selector with an explanation when the model advertises no levels', () => {
    const markup = renderComposer([]);
    expect(markup).toContain('aria-label="Reasoning depth"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Reasoning levels are missing from this model catalog. Reload the model list.');
  });

  it('shows catalog loading without claiming an unsupported model or using old levels', () => {
    const markup = renderToStaticMarkup(React.createElement(ReasoningEffortPicker, {
      efforts: ['low', 'high'], value: 'high', disabled: false, capabilityState: 'loading', onChange: () => undefined,
    }));
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Loading');
    expect(markup).not.toContain('value="high" selected=""');
    expect(markup).not.toContain('does not');
  });

  it('disables selection while a turn is pending and never treats orchestration-only Ultra as a model effort', () => {
    const pending = renderComposer(['low', 'ultra'], 'ultra', true, 'streaming');
    expect(pending).not.toContain('>Ultra</option>');
    expect(pending).not.toContain('value="ultra" selected=""');
    expect(pending).toContain('disabled=""');
  });

  it('normalizes only known runtime labels and preserves per-session choices', () => {
    expect(normalizeReasoningEfforts([' LOW ', 'max', 'ultra', 'unknown', 'low', null])).toEqual(['low', 'max']);
    const storage = memoryStorage();
    saveChatReasoningEffort('session-a', 'high', storage);
    saveChatReasoningEffort('session-b', 'low', storage);
    expect(loadChatReasoningEffort('session-a', storage)).toBe('high');
    expect(loadChatReasoningEffort('session-b', storage)).toBe('low');
    expect(loadChatReasoningEffort('session-c', storage)).toBe('');
  });

  it('matches qualified Codex IDs without accepting another provider or an ambiguous bare model', () => {
    const codex = { id: 'gpt-5.3-codex', reasoningEfforts: ['low', 'medium', 'high', 'xhigh'] };
    const other = { id: 'gpt-5.3-codex', reasoningEfforts: [] };
    const groups = [{ providerId: 'openai-codex', models: [codex] }, { providerId: 'custom', models: [other] }];
    expect(resolveReasoningModel('@openai-codex:gpt-5.3-codex', '', groups)).toBe(codex);
    expect(resolveReasoningModel('gpt-5.3-codex', 'openai-codex', groups)).toBe(codex);
    expect(resolveReasoningModel('gpt-5.3-codex', 'custom', groups)).toBe(other);
    expect(resolveReasoningModel('gpt-5.3-codex', '', groups)).toBeNull();
    expect(resolveReasoningModel('gpt-5.3-codex', 'unknown', groups)).toBeNull();
  });
});
