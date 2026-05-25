import { describe, expect, it, vi } from 'vitest';
import {
  browserOpenTabChannel,
  buildBrowserContextMenuTemplate
} from '../src/main/browser-context-menu.js';

describe('browser context menu', () => {
  it('builds link actions that open links in Lastbrowser tabs', () => {
    const openLinkInNewTab = vi.fn();
    const copyText = vi.fn();
    const template = buildBrowserContextMenuTemplate({
      linkURL: 'https://example.com/docs',
      pageURL: 'https://example.com',
      selectionText: '',
      isEditable: false,
      editFlags: {}
    }, {
      canGoBack: true,
      canGoForward: false,
      openLinkInNewTab,
      copyText
    });

    expect(browserOpenTabChannel).toBe('lastbrowser:browser:openTab');
    expect(template.map((item) => item.label)).toContain('Open link in new tab');
    template.find((item) => item.label === 'Open link in new tab')?.click?.({} as never, {} as never, {} as never);
    template.find((item) => item.label === 'Copy link address')?.click?.({} as never, {} as never, {} as never);
    expect(openLinkInNewTab).toHaveBeenCalledWith('https://example.com/docs');
    expect(copyText).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('exposes normal browser navigation and edit actions', () => {
    const template = buildBrowserContextMenuTemplate({
      linkURL: '',
      pageURL: 'https://example.com',
      selectionText: 'Example Domain',
      isEditable: true,
      editFlags: { canCopy: true, canPaste: true, canSelectAll: true }
    }, {
      canGoBack: false,
      canGoForward: true,
      openLinkInNewTab: vi.fn(),
      copyText: vi.fn()
    });

    expect(template.map((item) => item.label ?? item.role)).toEqual(expect.arrayContaining([
      'Back',
      'Forward',
      'Reload',
      'copy',
      'paste',
      'selectAll'
    ]));
  });
});
