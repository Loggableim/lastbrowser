import { describe, expect, it, vi } from 'vitest';
import {
  cleanOAuthUserAgent,
  sanitizeSecChUa,
  isLocalhostCallback,
  isOAuthUrl,
  isStreamingLoginUrl,
  openAuthConnectWindow,
  getKnownWindowsBrowserPaths,
  openInExternalSystemBrowser,
  openExternalUrl
} from '../src/main/auth-window.js';

describe('auth-window logic', () => {
  it('correctly identifies OAuth and identity provider URLs', () => {
    expect(isOAuthUrl('https://accounts.google.com/o/oauth2/v2/auth?client_id=123')).toBe(true);
    expect(isOAuthUrl('https://auth.openai.com/authorize?client_id=xyz')).toBe(true);
    expect(isOAuthUrl('https://chatgpt.com/auth/login')).toBe(true);
    expect(isOAuthUrl('https://login.microsoftonline.com/common/oauth2')).toBe(true);
    expect(isOAuthUrl('https://github.com/login/oauth/authorize')).toBe(true);
    expect(isOAuthUrl('https://claude.ai/login')).toBe(true);

    expect(isOAuthUrl('https://example.com/')).toBe(false);
    expect(isOAuthUrl('https://news.ycombinator.com/')).toBe(false);
    expect(isOAuthUrl('https://google.com/search?q=test')).toBe(false);
  });

  it('identifies Disney+ BAM SSO and streaming service login URLs for header stripping', () => {
    // Disney+ BAM identity provider
    expect(isStreamingLoginUrl('https://sso.id.bamgrid.com/sso/login')).toBe(true);
    expect(isStreamingLoginUrl('https://auth.bamgrid.com/oauth/token')).toBe(true);
    // Disney+ login pages
    expect(isStreamingLoginUrl('https://www.disneyplus.com/login')).toBe(true);
    expect(isStreamingLoginUrl('https://disneyplus.com/de/login')).toBe(true);
    // Amazon Prime signin
    expect(isStreamingLoginUrl('https://www.amazon.de/ap/signin')).toBe(true);
    expect(isStreamingLoginUrl('https://www.amazon.com/gp/sign-in')).toBe(true);
    // HBO / Max
    expect(isStreamingLoginUrl('https://auth.max.com/oauth/authorize')).toBe(true);
    expect(isStreamingLoginUrl('https://id.hbo.com/login')).toBe(true);
    // Paramount+
    expect(isStreamingLoginUrl('https://login.paramountplus.com/account/signin')).toBe(true);

    // Must NOT match normal browsing pages
    expect(isStreamingLoginUrl('https://www.disneyplus.com/home')).toBe(false);
    expect(isStreamingLoginUrl('https://www.netflix.com/login')).toBe(false);
    expect(isStreamingLoginUrl('https://www.amazon.com/s?k=tv')).toBe(false);
    expect(isStreamingLoginUrl('https://accounts.google.com/signin')).toBe(false);
    expect(isStreamingLoginUrl('invalid-url')).toBe(false);
  });

  it('detects localhost OAuth redirect callbacks', () => {
    expect(isLocalhostCallback('http://localhost:8085/auth/callback?code=abc123xyz')).toBe(true);
    expect(isLocalhostCallback('http://127.0.0.1:8787/api/oauth/callback')).toBe(true);
    expect(isLocalhostCallback('http://localhost:3000/')).toBe(true);

    expect(isLocalhostCallback('https://accounts.google.com/signin')).toBe(false);
    expect(isLocalhostCallback('invalid-url')).toBe(false);
  });

  it('instantiates a sandboxed generic connect window without auth fingerprint spoofing', () => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const mockWebContents = {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      })
    };

    const mockWindow = {
      webContents: mockWebContents,
      loadURL: vi.fn(),
      isDestroyed: vi.fn().mockReturnValue(false),
      close: vi.fn()
    };

    const mockConstructor = vi.fn().mockImplementation(() => mockWindow);

    const win = openAuthConnectWindow({
      url: 'https://accounts.google.com/o/oauth2/v2/auth?scope=email',
      BrowserWindowConstructor: mockConstructor as never
    });

    expect(mockConstructor).toHaveBeenCalledWith(expect.objectContaining({
      width: 640,
      height: 780,
      title: 'LastBrowser Connect',
      autoHideMenuBar: true,
      webPreferences: expect.objectContaining({
        sandbox: true
      })
    }));
    expect(mockWebContents).not.toHaveProperty('setUserAgent');
    expect(mockWindow.loadURL).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?scope=email');
    expect(win).toBe(mockWindow);
  });

  it('lists common candidate paths for Windows browsers', () => {
    const paths = getKnownWindowsBrowserPaths();
    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.includes('msedge.exe'))).toBe(true);
  });

  it('delegates to native browser executable when found on Windows', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    const mockExists = vi.fn((path: string) => path.includes('msedge.exe'));
    const mockUnref = vi.fn();
    const mockSpawn = vi.fn().mockReturnValue({ unref: mockUnref });

    const launched = openInExternalSystemBrowser(
      'https://accounts.google.com/o/oauth2/v2/auth',
      mockExists,
      mockSpawn as never
    );

    expect(launched).toBe(true);
    expect(mockSpawn).toHaveBeenCalledWith(
      expect.stringContaining('msedge.exe'),
      ['https://accounts.google.com/o/oauth2/v2/auth'],
      expect.objectContaining({ detached: true })
    );
    expect(mockUnref).toHaveBeenCalled();

    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  it('validates external URLs and reports OS launch failures', async () => {
    const shellOpenExternal = vi.fn().mockResolvedValue(undefined);
    await expect(openExternalUrl('javascript:alert(1)', { shellOpenExternal }))
      .resolves.toBe(false);
    await expect(openExternalUrl('not a url', { shellOpenExternal }))
      .resolves.toBe(false);
    await expect(openExternalUrl('https://accounts.google.com/o/oauth2/auth', {
      platform: 'win32',
      existsFn: () => false,
      shellOpenExternal: vi.fn().mockRejectedValue(new Error('no browser'))
    })).resolves.toBe(false);
    await expect(openExternalUrl('https://example.com', { shellOpenExternal }))
      .resolves.toBe(true);
    expect(shellOpenExternal).toHaveBeenCalledWith('https://example.com/');
  });
});
