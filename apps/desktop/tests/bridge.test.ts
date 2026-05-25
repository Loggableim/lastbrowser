import { describe, expect, it } from 'vitest';
import { buildSidekickPrompt, clampContextText } from '../src/renderer/bridge.js';

const context = {
  url: 'https://example.com/article',
  title: 'A useful article',
  selectedText: 'This exact paragraph needs a plain-language explanation.',
  pageText: 'This is the visible article text. It has enough information for a concise summary.'
};

describe('sidekick bridge prompts', () => {
  it('builds a page-summary prompt from active tab context', () => {
    const result = buildSidekickPrompt('summarize-page', context);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.prompt).toContain('Summarize the active browser page');
    expect(result.prompt).toContain('URL: https://example.com/article');
    expect(result.prompt).toContain('Title: A useful article');
    expect(result.prompt).toContain('This is the visible article text');
  });

  it('requires selected text before explaining a selection', () => {
    const result = buildSidekickPrompt('explain-selection', { ...context, selectedText: '  ' });

    expect(result).toEqual({
      ok: false,
      reason: 'Select text in the active tab before asking Sidekick to explain it.'
    });
  });

  it('uses selected text for explain-selection when available', () => {
    const result = buildSidekickPrompt('explain-selection', context);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.prompt).toContain('Explain the selected text');
    expect(result.prompt).toContain(context.selectedText);
    expect(result.prompt).toContain('URL: https://example.com/article');
  });

  it('clamps long page text before sending it to Sidekick', () => {
    const clamped = clampContextText('x'.repeat(7000), 120);

    expect(clamped).toHaveLength(121);
    expect(clamped.endsWith('…')).toBe(true);
  });
});
