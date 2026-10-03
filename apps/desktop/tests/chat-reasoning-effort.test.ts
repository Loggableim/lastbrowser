import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatComposer } from '../src/renderer/panels/ChatComponents.js';
import { DesktopI18nProvider } from '../src/renderer/i18n.js';
import { loadChatReasoningEffort, normalizeReasoningEfforts, saveChatReasoningEffort } from '../src/renderer/chat-reasoning-effort.js';

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
  it('renders only runtime-advertised levels and reflects the conversation choice', () => {
    const markup = renderComposer(['low', 'medium', 'high', 'max'], 'high');
    expect(markup).toContain('aria-label="Reasoning depth"');
    expect(markup).toContain('value="high" selected=""');
    expect(markup).toContain('>Low</option>');
    expect(markup).toContain('>Max</option>');
    expect(markup).not.toContain('>Ultra</option>');
    expect(markup).not.toContain('>Very high</option>');
  });

  it('renders a disabled selector with an explanation when the model advertises no levels', () => {
    const markup = renderComposer([]);
    expect(markup).toContain('aria-label="Reasoning depth"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('This model does not advertise selectable reasoning levels.');
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
});
