import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('address bar localization wiring', () => {
  it('uses locale strings for input, bookmark controls and omnibox suggestions', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/renderer/components/AddressBar.tsx'), 'utf8');
    for (const key of [
      'browser.omnibox.addressLabel',
      'browser.chrome.searchPlaceholder',
      'browser.omnibox.addBookmark',
      'browser.omnibox.removeBookmark',
      'browser.omnibox.navigate',
      'browser.omnibox.searchSuggestion',
      'browser.omnibox.openUrl',
      'browser.omnibox.bookmarkBadge',
      'browser.omnibox.historyBadge'
    ]) {
      expect(source).toContain(key);
    }
    expect(source).not.toContain('aria-label="Address or search"');
    expect(source).not.toContain('placeholder="Search the web or enter address"');
    expect(source).not.toContain("badge: 'Open URL'");
    expect(source).not.toContain("badge: 'Bookmark'");
    expect(source).not.toContain("badge: 'History'");
  });
});
