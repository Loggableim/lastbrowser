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
    title: 'Lastbrowser',
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#07111F',
    webPreferences: {
      preload: path.join(mainDir, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true
    }
  };
}
