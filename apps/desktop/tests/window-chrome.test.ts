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
    expect(options.title).toBe('Lastbrowser');
    expect(options.webPreferences?.nodeIntegration).toBe(false);
    expect(options.webPreferences?.contextIsolation).toBe(true);
    expect(options.webPreferences?.preload).toBe('C:\\Lastbrowser\\resources\\app.asar\\dist\\main\\preload.js');
  });
});
