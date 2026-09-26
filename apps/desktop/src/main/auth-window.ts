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
 * Detect whether a URL belongs to a streaming service login / identity flow
 * that sends X-Frame-Options or CSP frame-ancestors headers which prevent
 * the Electron webview from rendering the login page.
 *
 * Domains covered:
 *  - Disney+ BAM SSO:  sso.id.bamgrid.com, disneyplus.com (login paths)
 *  - Amazon Prime:     www.amazon.com (signin), api.amazon.com
 *  - HBO/Max:          auth.max.com, id.hbo.com
 *  - Paramount+:       login.paramountplus.com
 *  - Apple TV+:        idmsa.apple.com, appleid.apple.com
 */
export function isStreamingLoginUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    const h = hostname.toLowerCase();
    // Disney+ / BAM identity provider and login bridge
    if (h === 'sso.id.bamgrid.com' || h.endsWith('.bamgrid.com')) return true;
    if (h === 'login.disney.com' || h.endsWith('.disney.com') && /\/(login|bridge|identity|sso)/i.test(pathname)) return true;
    if ((h === 'www.disneyplus.com' || h === 'disneyplus.com') &&
        /^\/(login|de\/login|en-gb\/login|signup|identity)/i.test(pathname)) return true;
    // Amazon Prime Video signin
    if ((h === 'www.amazon.com' || h === 'www.amazon.de' || h.endsWith('.amazon.com')) &&
        /\/(ap\/signin|gp\/sign-in|auth)/i.test(pathname)) return true;
    // HBO / Max
    if (h === 'auth.max.com' || h === 'id.hbo.com' || h.endsWith('.hbo.com')) return true;
    // Paramount+
    if (h === 'login.paramountplus.com' || h.endsWith('.paramountplus.com')) return true;
    // Apple TV+
    if (h === 'idmsa.apple.com' || h === 'appleid.apple.com') return true;
    return false;
  } catch {
    return false;
  }
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

// Retained for the existing main-process session policy. The generic auth window
// deliberately does not call these helpers; Google OAuth uses the system browser.
export function cleanOAuthUserAgent(rawUserAgent: string): string {
  if (!rawUserAgent) return '';
  return rawUserAgent.replace(/Electron\/[^\s]+/gi, '').replace(/Lastbrowser\/[^\s]+/gi, '').replace(/\s{2,}/g, ' ').trim();
}

export function sanitizeSecChUa(headerValue: string): string {
  if (!headerValue) return headerValue;
  const filtered = headerValue.split(',').map((part) => part.trim()).filter((part) => !/electron|lastbrowser/i.test(part));
  if (filtered.some((part) => /"Chromium"/i.test(part)) && !filtered.some((part) => /"Google Chrome"/i.test(part))) {
    const version = /"Chromium";v="([^\"]+)"/i.exec(headerValue)?.[1] ?? '134';
    filtered.push(`"Google Chrome";v="${version}"`);
  }
  return filtered.join(', ');
}

/**
 * Open a dedicated, sandboxed Lastbrowser Connect window for generic website sign-ins.
 * Gemini CLI OAuth is started from its account panel in the OS browser.
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
