import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canRenderBrowserForAccessAuth } from '../src/renderer/access-auth.js';

const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const settingsPanelsPath = path.resolve(process.cwd(), 'src/renderer/panels/SystemPanels.tsx');
const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');
const preloadPath = path.resolve(process.cwd(), 'src/main/preload.ts');

describe('desktop access password lock', () => {
  it('gates the browser shell before rendering the app and its webviews', () => {
    const source = readFileSync(appPath, 'utf8');
    const gate = source.indexOf('if (!canRenderBrowserForAccessAuth(');
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
    expect(main).toContain('setAccessAuthRequiredHandler(broadcastAccessAuthLocked)');
    expect(preload).toContain("'lastbrowser:sidekick:loginAccessPassword'");
    expect(preload).toContain("'lastbrowser:sidekick:lockAccessWindows'");
    expect(preload).toContain("'lastbrowser:access-auth-locked'");
    const app = readFileSync(appPath, 'utf8');
    expect(app).toContain('onAccessAuthLocked(lockBrowser)');
    expect(app).toContain('setAccessAuthRequired(true)');
  });

  it('keeps the browser locked when the auth check fails or the session has expired', () => {
    expect(canRenderBrowserForAccessAuth(false, null)).toBe(false);
    expect(canRenderBrowserForAccessAuth(true, { auth_enabled: true, logged_in: false })).toBe(false);
    expect(canRenderBrowserForAccessAuth(true, { auth_enabled: true, logged_in: true })).toBe(true);
    expect(canRenderBrowserForAccessAuth(true, { auth_enabled: false, logged_in: false })).toBe(true);

    const source = readFileSync(appPath, 'utf8');
    expect(source).toContain('setInterval(() => void checkAccessStatus(), 10_000)');
    expect(source).toContain('setAccessAuthChecked(false)');
    expect(source).toContain("document.addEventListener('visibilitychange', onVisible)");
  });

  it('shows the disabled auth state after removing the password gate', () => {
    const source = readFileSync(settingsPanelsPath, 'utf8');
    expect(source).toContain("t(authEnabled ? 'settings.panels.system.disableAuth' : 'settings.panels.system.authDisabled')");
    expect(source).toContain("showToast(t('settings.panels.system.authDisabled'))");
  });
});
