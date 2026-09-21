import { describe, expect, it } from 'vitest';
import type { BrowserBookmark } from '../src/renderer/bookmarks.js';
import {
  exportBookmarksToHtml,
  importBookmarksFromHtml,
  exportBookmarksToJson,
  importBookmarksFromJson,
  mergeBookmarks
} from '../src/renderer/bookmark-io.js';

describe('bookmark-io', () => {
  const sampleBookmarks: BrowserBookmark[] = [
    {
      id: 'b-1',
      title: 'Google & Search',
      url: 'https://www.google.com',
      createdAt: 1710000000000
    },
    {
      id: 'b-2',
      title: 'GitHub: Where the world builds software',
      url: 'https://github.com',
      createdAt: 1710005000000
    }
  ];

  it('exports bookmarks to valid Netscape Bookmark HTML format', () => {
    const html = exportBookmarksToHtml(sampleBookmarks);

    expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
    expect(html).toContain('<TITLE>Bookmarks</TITLE>');
    expect(html).toContain('<H1>Bookmarks</H1>');
    expect(html).toContain('<A HREF="https://www.google.com" ADD_DATE="1710000000">Google &amp; Search</A>');
    expect(html).toContain('<A HREF="https://github.com" ADD_DATE="1710005000">GitHub: Where the world builds software</A>');
  });

  it('imports bookmarks from Netscape Bookmark HTML format', () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://news.ycombinator.com" ADD_DATE="1700000000">Hacker News</A>
    <DT><A HREF="https://en.wikipedia.org/wiki/Main_Page">Wikipedia</A>
    <DT><A HREF="javascript:alert(1)">Malicious</A>
    <DT><A HREF="about:blank">Blank</A>
</DL><p>`;

    const imported = importBookmarksFromHtml(html);

    expect(imported).toHaveLength(2);
    expect(imported[0].title).toBe('Hacker News');
    expect(imported[0].url).toBe('https://news.ycombinator.com');
    expect(imported[0].createdAt).toBe(1700000000000);
    expect(imported[1].title).toBe('Wikipedia');
    expect(imported[1].url).toBe('https://en.wikipedia.org/wiki/Main_Page');
  });

  it('handles roundtrip HTML export and import', () => {
    const exported = exportBookmarksToHtml(sampleBookmarks);
    const imported = importBookmarksFromHtml(exported);

    expect(imported).toHaveLength(2);
    expect(imported[0].title).toBe('Google & Search');
    expect(imported[0].url).toBe('https://www.google.com');
    expect(imported[1].title).toBe('GitHub: Where the world builds software');
    expect(imported[1].url).toBe('https://github.com');
  });

  it('exports and imports JSON bookmarks with roundtrip', () => {
    const json = exportBookmarksToJson(sampleBookmarks);
    const imported = importBookmarksFromJson(json);

    expect(imported).toHaveLength(2);
    expect(imported[0].title).toBe(sampleBookmarks[0].title);
    expect(imported[0].url).toBe(sampleBookmarks[0].url);
    expect(imported[1].title).toBe(sampleBookmarks[1].title);
    expect(imported[1].url).toBe(sampleBookmarks[1].url);
  });

  it('handles invalid JSON gracefully', () => {
    expect(importBookmarksFromJson('invalid json')).toEqual([]);
    expect(importBookmarksFromJson('{"not": "an array"}')).toEqual([]);
    expect(importBookmarksFromJson('[{ "invalid": "entry" }]')).toEqual([]);
  });

  it('merges bookmarks without duplicates', () => {
    const existing: BrowserBookmark[] = [
      { id: '1', title: 'Old Title', url: 'https://example.com', createdAt: 100 }
    ];
    const incoming: BrowserBookmark[] = [
      { id: '2', title: 'New Title', url: 'https://example.com/', createdAt: 200 },
      { id: '3', title: 'New Site', url: 'https://newsite.com', createdAt: 300 }
    ];

    const merged = mergeBookmarks(existing, incoming);

    expect(merged).toHaveLength(2);
    expect(merged[0].url).toBe('https://example.com/');
    expect(merged[0].title).toBe('New Title'); // updated
    expect(merged[1].url).toBe('https://newsite.com');
  });
});
