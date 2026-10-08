import { BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

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
    title: 'LastBrowser Connect',
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

/**
 * Return candidate paths to pre-installed native OS browsers on Windows
 * (Edge, Chrome, Firefox, Brave) where Google BotGuard never flags embedded webviews.
 */
export function getKnownWindowsBrowserPaths(): string[] {
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const localAppData = process.env['LOCALAPPDATA'] || '';

  return [
    `${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
    localAppData ? `${localAppData}\\Google\\Chrome\\Application\\chrome.exe` : '',
    `${programFiles}\\Mozilla Firefox\\firefox.exe`,
    `${programFilesX86}\\Mozilla Firefox\\firefox.exe`,
    `${programFiles}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`
  ].filter(Boolean);
}

/**
 * Attempt to open a URL directly in an authentic native browser (Edge, Chrome, etc.)
 * on Windows. Avoids loopback when Lastbrowser itself is registered as the default browser.
 */
export function openInExternalSystemBrowser(
  url: string,
  existsFn: (path: string) => boolean = existsSync,
  spawnFn: typeof spawn = spawn
): boolean {
  if (process.platform !== 'win32') return false;
  const candidates = getKnownWindowsBrowserPaths();
  for (const browserPath of candidates) {
    try {
      if (existsFn(browserPath)) {
        const child = spawnFn(browserPath, [url], { detached: true, stdio: 'ignore' });
        child?.unref?.();
        return true;
      }
    } catch {
      // try next candidate
    }
  }
  return false;
}

/**
 * Validate the target and report whether the OS accepted a request to open it.
 * Google OAuth callers use this so a malformed or unsupported URL cannot be
 * reported as a successful sign-in launch.
 */
export async function openExternalUrl(
  url: string,
  options: {
    platform?: NodeJS.Platform;
    existsFn?: (path: string) => boolean;
    spawnFn?: typeof spawn;
    shellOpenExternal?: (url: string) => Promise<void>;
  } = {}
): Promise<boolean> {
  let target: URL;
  try {
    target = new URL(String(url || '').trim());
  } catch {
    return false;
  }
  if (!['http:', 'https:', 'mailto:'].includes(target.protocol)) return false;

  const normalizedUrl = target.toString();
  if (options.platform === 'win32' && isOAuthUrl(normalizedUrl)) {
    const opened = openInExternalSystemBrowser(normalizedUrl, options.existsFn, options.spawnFn);
    if (opened) return true;
  }

  if (!options.shellOpenExternal) return false;
  try {
    await options.shellOpenExternal(normalizedUrl);
    return true;
  } catch {
    return false;
  }
}
