import { BrowserWindow } from 'electron';

export type AuthWindowOptions = {
  url: string;
  parentWindow?: BrowserWindow | null;
  BrowserWindowConstructor?: typeof BrowserWindow;
  onCallbackReached?: () => void;
};

/**
 * Detect whether a destination URL belongs to a known OAuth or identity provider.
 */
export function isOAuthUrl(url: string): boolean {
  return /^https?:\/\/(accounts\.google\.com|login\.microsoftonline\.com|github\.com\/login|auth0\.com|.*\.auth0\.com|claude\.ai|console\.anthropic\.com|platform\.openai\.com|auth\.openai\.com|chatgpt\.com)\//i.test(url);
}

/**
 * Detect whether a redirect or navigation target is the local Sidekick callback server.
 */
export function isLocalhostCallback(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/**
 * Remove Electron and app-specific tokens from the User-Agent string.
 * Google OAuth blocks embedded Chromium webviews that include "Electron" with a
 * 403 disallowed_useragent error. Stripping the token lets Google accept the connection.
 */
export function cleanOAuthUserAgent(rawUserAgent: string): string {
  return rawUserAgent
    .replace(/\s*Electron\/[^\s]+/i, '')
    .replace(/\s*Lastbrowser\/[^\s]+/i, '')
    .trim();
}

/**
 * Open a dedicated Lastbrowser Connect window for OAuth flows (Google Gemini,
 * ChatGPT, GitHub, etc.) instead of kicking the user out to their default OS browser.
 */
export function openAuthConnectWindow(options: AuthWindowOptions): BrowserWindow {
  const {
    url,
    parentWindow,
    BrowserWindowConstructor = BrowserWindow,
    onCallbackReached
  } = options;

  const win = new BrowserWindowConstructor({
    width: 640,
    height: 780,
    minWidth: 480,
    minHeight: 520,
    parent: parentWindow || undefined,
    modal: false,
    title: 'Lastbrowser Connect',
    autoHideMenuBar: true,
    backgroundColor: '#07111f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  try {
    if (win.webContents?.getUserAgent) {
      const currentUA = win.webContents.getUserAgent();
      win.webContents.setUserAgent(cleanOAuthUserAgent(currentUA));
    }
  } catch {
    // webContents may be mocked or unavailable in test environments
  }

  const handleNav = (targetUrl: string) => {
    if (isLocalhostCallback(targetUrl)) {
      onCallbackReached?.();
      setTimeout(() => {
        try {
          if (!win.isDestroyed()) {
            win.close();
          }
        } catch {
          // ignore window close errors
        }
      }, 1200);
    }
  };

  win.webContents?.on?.('will-navigate', (_event, navUrl) => handleNav(navUrl));
  win.webContents?.on?.('will-redirect', (_event, redirUrl) => handleNav(redirUrl));

  void win.loadURL(url);
  return win;
}
