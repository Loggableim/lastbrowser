import { describe, expect, it } from 'vitest';
import {
  bookmarkFromTab,
  isBookmarkableUrl,
  isBookmarked,
  loadBookmarks,
  removeBookmark,
  saveBookmarks,
  upsertBookmark
} from '../src/renderer/bookmarks.js';
import type { BrowserBookmark } from '../src/renderer/bookmarks.js';

function memoryStorage(seed?: string): Storage {
  const values = new Map<string, string>();
  if (seed !== undefined) values.set('lastbrowser.bookmarks.v1', seed);
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => void values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, value)
  };
}

describe('browser bookmarks', () => {
  it('loads only valid bookmark entries from storage', () => {
    const storage = memoryStorage(JSON.stringify([
      { id: '1', title: 'Example', url: 'https://example.com', createdAt: 1 },
      { id: '', title: '', url: 'lastbrowser://ai-browser' },
      { id: '2', title: 'Search', url: 'https://google.com/search?q=test' }
    ]));

    expect(loadBookmarks(storage)).toEqual([
      { id: '1', title: 'Example', url: 'https://example.com', createdAt: 1 },
      { id: '2', title: 'Search', url: 'https://google.com/search?q=test', createdAt: expect.any(Number) }
    ]);
  });

  it('upserts bookmarks by normalized url and removes them by url', () => {
    const original: BrowserBookmark[] = [
      { id: 'existing', title: 'Example', url: 'https://example.com', createdAt: 1 }
    ];

    const updated = upsertBookmark(original, { id: 'new', title: 'Example Domain', url: 'https://example.com/', createdAt: 2 });

    expect(updated).toEqual([
      { id: 'existing', title: 'Example Domain', url: 'https://example.com/', createdAt: 1 }
    ]);
    expect(isBookmarked(updated, 'https://example.com')).toBe(true);
    expect(removeBookmark(updated, 'https://example.com')).toEqual([]);
  });

  it('creates readable bookmarks from browser tabs and persists them', () => {
    const storage = memoryStorage();
    const bookmark = bookmarkFromTab({ id: 'tab-1', title: 'Example Domain', url: 'https://example.com' });

    saveBookmarks(storage, [bookmark]);

    expect(bookmark.title).toBe('Example Domain');
    expect(bookmark.url).toBe('https://example.com');
    expect(loadBookmarks(storage)).toHaveLength(1);
    expect(isBookmarkableUrl('lastbrowser://ai-browser')).toBe(false);
    expect(isBookmarkableUrl('https://example.com')).toBe(true);
  });
});
