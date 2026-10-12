import { describe, expect, it } from 'vitest';
import { resolveShellBack, resolveShellForward } from '../src/renderer/shell-history.js';

const startUrl = 'lastbrowser://start';

describe('resolveShellBack', () => {
  it('returns to the start page when the webview has no earlier entry', () => {
    expect(resolveShellBack({
      canGoBack: false,
      currentUrl: 'https://example.com/',
      startUrl
    })).toEqual({ kind: 'show-start' });
  });

  it('uses the webview when it still has history', () => {
    expect(resolveShellBack({
      canGoBack: true,
      currentUrl: 'https://example.com/docs',
      startUrl
    })).toEqual({ kind: 'webview-back' });
  });

  it('does nothing on the start page', () => {
    expect(resolveShellBack({
      canGoBack: true,
      currentUrl: startUrl,
      startUrl
    })).toEqual({ kind: 'none' });
    expect(resolveShellBack({
      canGoBack: false,
      currentUrl: '',
      startUrl
    })).toEqual({ kind: 'none' });
  });
});

describe('resolveShellForward', () => {
  it('restores the page Back left behind on the start page', () => {
    expect(resolveShellForward({
      canGoForward: false,
      onStartPage: true,
      pendingUrl: 'https://example.com/',
      startUrl
    })).toEqual({ kind: 'restore-page', url: 'https://example.com/' });
  });

  it('does not restore a missing or start-page target', () => {
    expect(resolveShellForward({
      canGoForward: true,
      onStartPage: true,
      pendingUrl: null,
      startUrl
    })).toEqual({ kind: 'none' });
    expect(resolveShellForward({
      canGoForward: false,
      onStartPage: true,
      pendingUrl: startUrl,
      startUrl
    })).toEqual({ kind: 'none' });
  });

  it('uses the webview forward stack while a page is showing', () => {
    expect(resolveShellForward({
      canGoForward: true,
      onStartPage: false,
      pendingUrl: 'https://example.com/',
      startUrl
    })).toEqual({ kind: 'webview-forward' });
    expect(resolveShellForward({
      canGoForward: false,
      onStartPage: false,
      pendingUrl: null,
      startUrl
    })).toEqual({ kind: 'none' });
  });
});
