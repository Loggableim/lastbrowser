import { describe, expect, it, vi } from 'vitest';
import { buildSidekickPrompt, clampContextText, createTeamworkGroundingContext, dispatchSidekickAction, resolveSidekickAction } from '../src/renderer/bridge.js';

const context = {
  url: 'https://example.com/article',
  title: 'A useful article',
  selectedText: 'This exact paragraph needs a plain-language explanation.',
  pageText: 'This is the visible article text. It has enough information for a concise summary.'
};

describe('sidekick bridge prompts', () => {
  it('builds bounded Teamwork context with query strings and fragments removed', () => {
    expect(createTeamworkGroundingContext(
      'https://user:password@example.test/article?session=private#section',
      'Page title',
      'visible excerpt',
    )).toEqual({
      url: 'https://example.test/article',
      title: 'Page title',
      snippet: 'visible excerpt',
    });
    expect(createTeamworkGroundingContext('file:///private/document.html', 'x'.repeat(500), 'y'.repeat(5000))).toMatchObject({
      url: '',
      title: `${'x'.repeat(240)}…`,
      snippet: `${'y'.repeat(1800)}…`,
    });
  });

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

  it('collects active page context and resolves each explicit Research Bar action', async () => {
    const pageContext = { selectedText: context.selectedText, pageText: context.pageText };
    const webview = { executeJavaScript: async () => pageContext, getURL: () => context.url, getTitle: () => context.title } as unknown as Electron.WebviewTag;
    for (const [action, expected] of [['summarize-page', 'Summarize the active browser page'], ['explain-selection', 'Explain the selected text'], ['research-page', 'Research this active browser page']] as const) {
      const result = await resolveSidekickAction(action, webview, { url: 'fallback:', title: 'fallback' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.prompt).toContain(expected);
        expect(result.prompt).toContain(context.url);
        expect(result.prompt).toContain(context.title);
      }
    }
  });

  it('returns an actionable failure when Explain is clicked without a selection', async () => {
    const webview = { executeJavaScript: async () => ({ selectedText: '', pageText: 'Readable page' }), getURL: () => context.url, getTitle: () => context.title } as unknown as Electron.WebviewTag;
    const dispatch = vi.fn();
    expect(await dispatchSidekickAction('explain-selection', webview, context, dispatch)).toMatchObject({ ok: false, reason: expect.stringContaining('Select text') });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
