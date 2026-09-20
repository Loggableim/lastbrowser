import { describe, expect, it } from 'vitest';
import {
  closedTabLimit,
  rememberClosedTab,
  takeLastClosedTab,
  type ClosedTab
} from '../src/renderer/tabs.js';

function closed(url: string, title = 'Page'): ClosedTab {
  return { url, title, closedAt: Date.now() };
}

describe('rememberClosedTab', () => {
  it('appends a closed tab', () => {
    const next = rememberClosedTab([], { url: 'https://example.com', title: 'Example' });
    expect(next).toHaveLength(1);
    expect(next[0].url).toBe('https://example.com');
    expect(next[0].title).toBe('Example');
  });

  it('keeps the newest entry last', () => {
    let list = rememberClosedTab([], { url: 'https://first.com', title: 'First' });
    list = rememberClosedTab(list, { url: 'https://second.com', title: 'Second' });
    expect(list[list.length - 1].url).toBe('https://second.com');
  });

  it('ignores the browser start page', () => {
    const next = rememberClosedTab([], { url: 'lastbrowser://start', title: 'New tab' });
    expect(next).toHaveLength(0);
  });

  it('ignores an empty url', () => {
    const next = rememberClosedTab([], { url: '', title: 'Blank' });
    expect(next).toHaveLength(0);
  });

  it('caps the list at the limit, dropping the oldest', () => {
    let list: ClosedTab[] = [];
    for (let i = 0; i < closedTabLimit + 5; i += 1) {
      list = rememberClosedTab(list, { url: `https://site${i}.com`, title: `Site ${i}` });
    }
    expect(list).toHaveLength(closedTabLimit);
    expect(list[0].url).toBe('https://site5.com');
  });
});

describe('takeLastClosedTab', () => {
  it('returns the newest entry and the remaining list', () => {
    const list = [closed('https://first.com'), closed('https://second.com')];
    const { tab, rest } = takeLastClosedTab(list);
    expect(tab?.url).toBe('https://second.com');
    expect(rest).toHaveLength(1);
    expect(rest[0].url).toBe('https://first.com');
  });

  it('returns null for an empty list', () => {
    const { tab, rest } = takeLastClosedTab([]);
    expect(tab).toBeNull();
    expect(rest).toHaveLength(0);
  });

  it('empties the list after taking the only entry', () => {
    const { tab, rest } = takeLastClosedTab([closed('https://only.com')]);
    expect(tab?.url).toBe('https://only.com');
    expect(rest).toHaveLength(0);
  });

  it('supports taking entries repeatedly (Ctrl+Shift+T twice)', () => {
    let list = [closed('https://a.com'), closed('https://b.com'), closed('https://c.com')];
    const first = takeLastClosedTab(list);
    list = first.rest;
    const second = takeLastClosedTab(list);
    expect(first.tab?.url).toBe('https://c.com');
    expect(second.tab?.url).toBe('https://b.com');
    expect(second.rest).toHaveLength(1);
  });
});
