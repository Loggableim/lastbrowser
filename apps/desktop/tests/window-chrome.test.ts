import { describe, expect, it } from 'vitest';
import { createMainWindowOptions, installBrowserChrome } from '../src/main/window-chrome.js';

describe('window chrome', () => {
  it('removes the native Electron application menu', () => {
    let applicationMenu: unknown = 'not-called';

    installBrowserChrome({
      setApplicationMenu(menu) {
        applicationMenu = menu;
      }
    });

    expect(applicationMenu).toBeNull();
  });

  it('keeps browser controls in the app chrome instead of the Windows menu bar', () => {
    const options = createMainWindowOptions('C:/Lastbrowser/resources/app.asar/dist/main');

    expect(options.frame).toBe(false);
    expect(options.autoHideMenuBar).toBe(true);
    expect(options.title).toBe('LastBrowser');
    expect(options.webPreferences?.nodeIntegration).toBe(false);
    expect(options.webPreferences?.contextIsolation).toBe(true);
    expect(options.webPreferences?.sandbox).toBe(true);
    expect(options.webPreferences?.preload).toBe('C:\\Lastbrowser\\resources\\app.asar\\dist\\main\\preload.cjs');
  });

  it('fits the initial window and resize limits inside the display work area', () => {
    const mainDir = 'C:/Lastbrowser/resources/app.asar/dist/main';

    expect(createMainWindowOptions(mainDir, { width: 1440, height: 860 })).toMatchObject({
      width: 1440, height: 860, minWidth: 1100, minHeight: 720
    });
    expect(createMainWindowOptions(mainDir, { width: 1024, height: 600 })).toMatchObject({
      width: 1024, height: 600, minWidth: 1024, minHeight: 600
    });
  });
});
