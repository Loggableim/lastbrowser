import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMainWindowOptions, installBrowserChrome, resolveWindowIconPath } from '../src/main/window-chrome.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-chrome-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

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
    expect(options.webPreferences?.sandbox).toBe(true);
    expect(options.webPreferences?.preload).toBe('C:\\Lastbrowser\\resources\\app.asar\\dist\\main\\preload.cjs');
  });

  it('prefers the packaged Lastbrowser icon next to the renderer bundle', () => {
    const root = makeTempDir();
    const mainDir = path.join(root, 'dist', 'main');
    const rendererDir = path.join(root, 'dist', 'renderer');
    mkdirSync(rendererDir, { recursive: true });
    writeFileSync(path.join(rendererDir, 'Lastbrowser.ico'), 'ico');
    writeFileSync(path.join(rendererDir, 'app-icon-256.png'), 'png');

    expect(resolveWindowIconPath(mainDir)).toBe(path.join(rendererDir, 'Lastbrowser.ico'));
  });

  it('falls back to the raster brand icon when Lastbrowser.ico is absent', () => {
    const root = makeTempDir();
    const mainDir = path.join(root, 'dist', 'main');
    const rendererDir = path.join(root, 'dist', 'renderer');
    mkdirSync(rendererDir, { recursive: true });
    writeFileSync(path.join(rendererDir, 'app-icon-256.png'), 'png');

    expect(resolveWindowIconPath(mainDir)).toBe(path.join(rendererDir, 'app-icon-256.png'));
  });
});
