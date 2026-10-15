import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveWebviewSrc, type WebviewSrcLock } from '../src/renderer/webview-src.js';

const elementKey = 'persist:default:tab-1:1';

function step(input: {
  tabUrl: string;
  guestUrl?: string | null;
  shellToken?: number;
  shellUrl?: string | null;
  elementKey?: string;
  previous: WebviewSrcLock | null;
}): { src: string; lock: WebviewSrcLock } {
  return resolveWebviewSrc({
    tabUrl: input.tabUrl,
    elementKey: input.elementKey ?? elementKey,
    shellToken: input.shellToken ?? 0,
    shellUrl: input.shellUrl ?? null,
    guestUrl: input.guestUrl ?? null,
    previous: input.previous
  });
}

describe('resolveWebviewSrc', () => {
  it('keeps the src attribute stable across guest redirects', () => {
    const first = step({ tabUrl: 'https://www.willhaben.at/iad', previous: null });
    const redirected = step({
      tabUrl: 'https://www.willhaben.at/iad/kaufen-und-verkaufen/',
      guestUrl: 'https://www.willhaben.at/iad/kaufen-und-verkaufen/',
      previous: first.lock
    });
    const again = step({
      tabUrl: 'https://www.willhaben.at/iad/kaufen-und-verkaufen/?page=2',
      guestUrl: 'https://www.willhaben.at/iad/kaufen-und-verkaufen/?page=2',
      previous: redirected.lock
    });

    expect(first.src).toBe('https://www.willhaben.at/iad');
    expect(redirected.src).toBe(first.src);
    expect(again.src).toBe(first.src);
  });

  it('loads a shell navigation and a remount of the current tab URL', () => {
    const locked = step({ tabUrl: 'https://www.willhaben.at/iad', previous: null });
    const guest = step({
      tabUrl: 'https://www.willhaben.at/iad/kaufen-und-verkaufen/',
      guestUrl: 'https://www.willhaben.at/iad/kaufen-und-verkaufen/',
      previous: locked.lock
    });
    const shell = step({
      tabUrl: 'https://example.com/',
      guestUrl: 'https://www.willhaben.at/iad/kaufen-und-verkaufen/',
      shellToken: 1,
      shellUrl: 'https://example.com/',
      previous: guest.lock
    });
    const remount = step({
      tabUrl: 'https://www.willhaben.at/iad/kaufen-und-verkaufen/',
      guestUrl: 'https://www.willhaben.at/iad/kaufen-und-verkaufen/',
      shellToken: 1,
      shellUrl: 'https://example.com/',
      elementKey: 'persist:default:tab-1:2',
      previous: shell.lock
    });

    expect(shell.src).toBe('https://example.com/');
    expect(remount.src).toBe('https://www.willhaben.at/iad/kaufen-und-verkaufen/');
  });

  it('adopts a tab URL that did not come from the guest', () => {
    const locked = step({ tabUrl: 'https://example.com/a', previous: null });
    const restored = step({ tabUrl: 'https://example.com/restored', previous: locked.lock });
    expect(restored.src).toBe('https://example.com/restored');
  });

  it('wires guest navigations away from the live webview src', () => {
    const app = readFileSync(path.resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
    const updateUrl = app.slice(app.indexOf('function updateUrl'), app.indexOf('function updateFavicon'));
    const navigate = app.slice(app.indexOf('function navigate'), app.indexOf('function webviewHistoryFlag'));
    expect(updateUrl).toContain('guestNavigationRef.current.set(tabId, url)');
    expect(updateUrl).not.toContain('shellNavigationRef');
    expect(navigate).toContain('shellNavigationRef.current.set');
    expect(app).toContain('resolveWebviewSrc(');
    expect(app).not.toContain('src={entry.tab.url}');
  });
});
