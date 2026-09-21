import type { BrowserBookmark } from './bookmarks.js';
import { isBookmarkableUrl, upsertBookmark } from './bookmarks.js';

export function exportBookmarksToHtml(bookmarks: BrowserBookmark[]): string {
  const lines: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>'
  ];

  for (const b of bookmarks) {
    const addDate = Math.floor((b.createdAt || Date.now()) / 1000);
    const escapedTitle = escapeHtml(b.title || b.url);
    const escapedUrl = escapeHtml(b.url);
    lines.push(`    <DT><A HREF="${escapedUrl}" ADD_DATE="${addDate}">${escapedTitle}</A>`);
  }

  lines.push('</DL><p>');
  return lines.join('\n');
}

export function importBookmarksFromHtml(html: string): BrowserBookmark[] {
  const bookmarks: BrowserBookmark[] = [];
  const regex = /<A\s+[^>]*HREF=["']([^"']+)["'][^>]*>(.*?)<\/A>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const rawUrl = unescapeHtml(match[1]);
    const rawTitle = unescapeHtml(match[2].replace(/<[^>]+>/g, '').trim());

    if (isBookmarkableUrl(rawUrl)) {
      const fullTag = match[0];
      const dateMatch = /ADD_DATE=["'](\d+)["']/i.exec(fullTag);
      const createdAt = dateMatch ? Number(dateMatch[1]) * 1000 : Date.now();

      bookmarks.push({
        id: `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: rawTitle || rawUrl,
        url: rawUrl,
        createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : Date.now()
      });
    }
  }

  return bookmarks;
}

export function exportBookmarksToJson(bookmarks: BrowserBookmark[]): string {
  return JSON.stringify(bookmarks, null, 2);
}

export function importBookmarksFromJson(jsonStr: string): BrowserBookmark[] {
  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    if (!Array.isArray(parsed)) return [];
    const valid: BrowserBookmark[] = [];
    for (const item of parsed) {
      if (item && typeof item === 'object') {
        const candidate = item as Partial<BrowserBookmark>;
        if (candidate.url && isBookmarkableUrl(candidate.url)) {
          valid.push({
            id: candidate.id || `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title: String(candidate.title || candidate.url).trim(),
            url: String(candidate.url).trim(),
            createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now()
          });
        }
      }
    }
    return valid;
  } catch {
    return [];
  }
}

export function mergeBookmarks(existing: BrowserBookmark[], imported: BrowserBookmark[]): BrowserBookmark[] {
  let result = [...existing];
  for (const item of imported) {
    result = upsertBookmark(result, item);
  }
  return result;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function unescapeHtml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'");
}
