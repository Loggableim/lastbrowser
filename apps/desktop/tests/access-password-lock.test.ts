import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');
const preloadPath = path.resolve(process.cwd(), 'src/main/preload.ts');

describe('desktop access password lock', () => {
  it('gates the browser shell before rendering the app and its webviews', () => {
    const source = readFileSync(appPath, 'utf8');
    const gate = source.indexOf('if (!accessAuthChecked || accessAuthRequired)');
    const lockedScreen = source.indexOf('className="access-lock-screen"', gate);
    const browserShell = source.indexOf('className={`app-shell panel-', gate);
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(lockedScreen).toBeGreaterThan(gate);
    expect(browserShell).toBeGreaterThan(lockedScreen);
    expect(source).toContain('getAccessAuthStatus()');
    expect(source).toContain('loginAccessPassword({ password: accessPassword })');
  });

  it('uses main-process auth IPC and broadcasts sign-out locks to every BrowserWindow', () => {
    const main = readFileSync(mainPath, 'utf8');
    const preload = readFileSync(preloadPath, 'utf8');
    expect(main).toContain("BrowserWindow.getAllWindows()");
    expect(main).toContain("'lastbrowser:access-auth-locked'");
    expect(preload).toContain("'lastbrowser:sidekick:loginAccessPassword'");
    expect(preload).toContain("'lastbrowser:sidekick:lockAccessWindows'");
  });
});
