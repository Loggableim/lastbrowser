import { describe, expect, it } from 'vitest';
import {
  aiBrowserHomeUrl,
  createInitialTab,
  isAiBrowserHomeUrl,
  normalizeNavigationInput,
  renameTab,
  reorderTabs,
  togglePinnedTab,
  updateTabTitle,
  updateTabUrl
} from '../src/renderer/tabs.js';

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
    expect(tab.pinned).toBe(false);
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

  it('updates navigation and title events only on the owning tab', () => {
    const oldWebTab = createInitialTab('https://google.com');
    const newNativeTab = createInitialTab();
    const tabs = [oldWebTab, newNativeTab];

    const navigated = updateTabUrl(tabs, oldWebTab.id, 'https://google.com/search?q=sidekick');
    const titled = updateTabTitle(navigated, oldWebTab.id, 'Google Search');

    expect(titled.find((tab) => tab.id === oldWebTab.id)?.url).toBe('https://google.com/search?q=sidekick');
    expect(titled.find((tab) => tab.id === oldWebTab.id)?.title).toBe('Google Search');
    expect(titled.find((tab) => tab.id === newNativeTab.id)?.url).toBe(aiBrowserHomeUrl);
    expect(titled.find((tab) => tab.id === newNativeTab.id)?.title).toBe('New tab');
  });

  it('pins tabs and keeps pinned tabs before regular tabs', () => {
    const first = createInitialTab('https://example.com');
    const second = createInitialTab('https://openai.com');
    const pinned = togglePinnedTab([first, second], second.id);

    expect(pinned[0].id).toBe(second.id);
    expect(pinned[0].pinned).toBe(true);
    expect(pinned[1].id).toBe(first.id);
  });

  it('reorders tabs through drag and drop targets', () => {
    const first = createInitialTab('https://example.com');
    const second = createInitialTab('https://openai.com');
    const third = createInitialTab('https://lastbrowser.com');

    const reordered = reorderTabs([first, second, third], third.id, first.id);

    expect(reordered.map((tab) => tab.id)).toEqual([third.id, first.id, second.id]);
  });
});
