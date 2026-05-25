import { describe, expect, it } from 'vitest';
import { aiBrowserHomeUrl, createInitialTab, isAiBrowserHomeUrl, normalizeNavigationInput, renameTab } from '../src/renderer/tabs.js';

describe('browser tabs', () => {
  it('normalizes plain input as search and URLs as navigations', () => {
    expect(normalizeNavigationInput('openai.com')).toBe('https://openai.com');
    expect(normalizeNavigationInput('https://example.com/docs')).toBe('https://example.com/docs');
    expect(normalizeNavigationInput('sidekick browser help')).toBe('https://www.google.com/search?q=sidekick%20browser%20help');
  });

  it('creates Lastbrowser tabs with stable ids and readable titles', () => {
    const tab = createInitialTab();

    expect(tab.id).toMatch(/^tab-/);
    expect(tab.url).toBe(aiBrowserHomeUrl);
    expect(tab.title).toBe('New tab');
  });

  it('treats the native AI Browser home as an internal browser tab', () => {
    expect(isAiBrowserHomeUrl(aiBrowserHomeUrl)).toBe(true);
    expect(isAiBrowserHomeUrl('https://example.com')).toBe(false);
    expect(normalizeNavigationInput(aiBrowserHomeUrl)).toBe(aiBrowserHomeUrl);
  });

  it('renames a tab without mutating the original tab object', () => {
    const original = createInitialTab('https://example.com');
    const renamed = renameTab(original, 'Example Domain');

    expect(renamed.title).toBe('Example Domain');
    expect(original.title).toBe('New tab');
  });
});
