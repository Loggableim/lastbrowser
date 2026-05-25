import type { BrowserTab } from './tabs.js';
import { isAiBrowserHomeUrl } from './tabs.js';

export type BrowserBookmark = {
  id: string;
  title: string;
  url: string;
  createdAt: number;
};

export const bookmarksStorageKey = 'lastbrowser.bookmarks.v1';

type BookmarkStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function isBookmarkableUrl(url: string): boolean {
  const value = url.trim();
  if (!value || value === 'about:blank' || isAiBrowserHomeUrl(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function loadBookmarks(storage: Pick<Storage, 'getItem'> = window.localStorage): BrowserBookmark[] {
  const raw = storage.getItem(bookmarksStorageKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeBookmark(entry))
      .filter((entry): entry is BrowserBookmark => Boolean(entry));
  } catch {
    return [];
  }
}

export function saveBookmarks(storage: BookmarkStorage = window.localStorage, bookmarks: BrowserBookmark[]): void {
  storage.setItem(bookmarksStorageKey, JSON.stringify(bookmarks));
}

export function bookmarkFromTab(tab: BrowserTab): BrowserBookmark {
  const title = readableBookmarkTitle(tab.title, tab.url);
  return {
    id: `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    url: tab.url,
    createdAt: Date.now()
  };
}

export function upsertBookmark(bookmarks: BrowserBookmark[], bookmark: BrowserBookmark): BrowserBookmark[] {
  const normalized = normalizeBookmarkUrl(bookmark.url);
  if (!normalized || !isBookmarkableUrl(bookmark.url)) return bookmarks;
  const index = bookmarks.findIndex((entry) => normalizeBookmarkUrl(entry.url) === normalized);
  if (index < 0) return [...bookmarks, bookmark];
  const next = [...bookmarks];
  next[index] = {
    ...bookmark,
    id: bookmarks[index].id,
    createdAt: bookmarks[index].createdAt
  };
  return next;
}

export function removeBookmark(bookmarks: BrowserBookmark[], url: string): BrowserBookmark[] {
  const normalized = normalizeBookmarkUrl(url);
  return bookmarks.filter((entry) => normalizeBookmarkUrl(entry.url) !== normalized);
}

export function isBookmarked(bookmarks: BrowserBookmark[], url: string): boolean {
  const normalized = normalizeBookmarkUrl(url);
  return Boolean(normalized) && bookmarks.some((entry) => normalizeBookmarkUrl(entry.url) === normalized);
}

function normalizeBookmark(entry: unknown): BrowserBookmark | null {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as Partial<BrowserBookmark>;
  if (!candidate.id || !candidate.url || !isBookmarkableUrl(candidate.url)) return null;
  const title = readableBookmarkTitle(String(candidate.title || ''), candidate.url);
  return {
    id: String(candidate.id),
    title,
    url: String(candidate.url),
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now()
  };
}

function readableBookmarkTitle(title: string, url: string): string {
  const cleanTitle = title.trim();
  if (cleanTitle && cleanTitle.toLowerCase() !== 'new tab') return cleanTitle;
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
}

function normalizeBookmarkUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.trim().replace(/\/$/, '');
  }
}
