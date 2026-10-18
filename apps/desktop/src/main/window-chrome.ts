import path from 'node:path';
import { existsSync } from 'node:fs';
import type { BrowserWindowConstructorOptions, Menu as ElectronMenu } from 'electron';

export type ApplicationMenuApi = {
  setApplicationMenu(menu: ElectronMenu | null): void;
};

export function installBrowserChrome(menuApi: ApplicationMenuApi): void {
  menuApi.setApplicationMenu(null);
}

/**
 * Pick the first packaged icon that exists next to the renderer bundle.
 * The renderer build ships `Lastbrowser.ico` from `brand/assets`; the PNG is
 * kept as a fallback for builds that only carry the raster brand set. Without
 * an existing file Windows falls back to the generic Electron icon.
 */
export function resolveWindowIconPath(mainDir: string): string {
  const candidates = [
    path.join(mainDir, '..', 'renderer', 'Lastbrowser.ico'),
    path.join(mainDir, '..', 'renderer', 'app-icon-256.png')
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export function createMainWindowOptions(mainDir: string): BrowserWindowConstructorOptions {
  return {
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: 'Lastbrowser',
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#07111F',
    // The renderer build ships the app icon next to index.html; without this
    // the window falls back to the generic Electron icon.
    icon: resolveWindowIconPath(mainDir),
    webPreferences: {
      // Electron's sandboxed preload loader expects CommonJS. The main process
      // is ESM, so build the bridge separately as preload.cjs.
      preload: path.join(mainDir, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true
    }
  };
}
