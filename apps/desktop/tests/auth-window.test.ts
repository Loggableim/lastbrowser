import { describe, expect, it, vi } from 'vitest';
import {
  cleanOAuthUserAgent,
  isLocalhostCallback,
  isOAuthUrl,
  openAuthConnectWindow
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

  it('detects localhost OAuth redirect callbacks', () => {
    expect(isLocalhostCallback('http://localhost:8085/auth/callback?code=abc123xyz')).toBe(true);
    expect(isLocalhostCallback('http://127.0.0.1:8787/api/oauth/callback')).toBe(true);
    expect(isLocalhostCallback('http://localhost:3000/')).toBe(true);

    expect(isLocalhostCallback('https://accounts.google.com/signin')).toBe(false);
    expect(isLocalhostCallback('invalid-url')).toBe(false);
  });

  it('strips Electron and app tokens from User-Agent to avoid Google disallowed_useragent', () => {
    const rawUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Lastbrowser/0.1.26 Chrome/132.0.0.0 Electron/37.10.3 Safari/537.36';
    const cleaned = cleanOAuthUserAgent(rawUA);

    expect(cleaned).not.toContain('Electron');
    expect(cleaned).not.toContain('Lastbrowser');
    expect(cleaned).toContain('Chrome/132.0.0.0');
    expect(cleaned).toContain('Safari/537.36');
  });

  it('instantiates auth connect window with clean User-Agent and loads URL', () => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const mockWebContents = {
      getUserAgent: vi.fn().mockReturnValue('Mozilla/5.0 Chrome/132.0.0.0 Electron/37.10.3'),
      setUserAgent: vi.fn(),
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
      title: 'Lastbrowser Connect',
      autoHideMenuBar: true
    }));
    expect(mockWebContents.setUserAgent).toHaveBeenCalledWith('Mozilla/5.0 Chrome/132.0.0.0');
    expect(mockWindow.loadURL).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?scope=email');
    expect(win).toBe(mockWindow);
  });
});
