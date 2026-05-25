import { describe, expect, it, vi } from 'vitest';
import { hiddenWebviewScrollbarsCss, hideWebviewScrollbars } from '../src/renderer/browser-view.js';

describe('browser webview polish', () => {
  it('injects CSS that hides foreign page scrollbars without disabling scrolling', () => {
    expect(hiddenWebviewScrollbarsCss).toContain('::-webkit-scrollbar');
    expect(hiddenWebviewScrollbarsCss).toContain('display: none');
    expect(hiddenWebviewScrollbarsCss).toContain('scrollbar-width: none');
  });

  it('applies the scrollbar CSS through the webview insertCSS API', async () => {
    const insertCSS = vi.fn().mockResolvedValue('css-key');

    await hideWebviewScrollbars({ insertCSS } as unknown as Electron.WebviewTag);

    expect(insertCSS).toHaveBeenCalledTimes(1);
    expect(insertCSS).toHaveBeenCalledWith(hiddenWebviewScrollbarsCss);
  });
});
