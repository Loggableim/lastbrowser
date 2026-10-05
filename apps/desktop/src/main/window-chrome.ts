import path from 'node:path';
import type { BrowserWindowConstructorOptions, Menu as ElectronMenu } from 'electron';

export type ApplicationMenuApi = {
  setApplicationMenu(menu: ElectronMenu | null): void;
};

export function installBrowserChrome(menuApi: ApplicationMenuApi): void {
  menuApi.setApplicationMenu(null);
}

export function createMainWindowOptions(mainDir: string): BrowserWindowConstructorOptions {
  return {
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: 'LastBrowser',
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#07111F',
    // The renderer build ships the app icon next to index.html; without this
    // the window falls back to the generic Electron icon.
    icon: path.join(mainDir, '..', 'renderer', 'Lastbrowser.ico'),
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
