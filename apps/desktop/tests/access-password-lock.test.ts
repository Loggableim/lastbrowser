import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canReleaseAccessGateFromStartupPreflight, canRenderBrowserForAccessAuth } from '../src/renderer/access-auth.js';
import { initialAccessAuthGateState, reduceAccessAuthGate } from '../src/renderer/access-auth-gate.js';

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

  it('releases the startup auth wait only when Main confirms authentication is disabled', () => {
    expect(canReleaseAccessGateFromStartupPreflight('disabled')).toBe(true);
    expect(canReleaseAccessGateFromStartupPreflight('enabled')).toBe(false);
    expect(canReleaseAccessGateFromStartupPreflight('unknown')).toBe(false);
  });

  it('keeps the real auth consumer locked when a disabled preflight resolves after a lock event', () => {
    const preflightGeneration = initialAccessAuthGateState.generation;
    const locked = reduceAccessAuthGate(initialAccessAuthGateState, { type: 'lock' });
    const afterLatePreflight = reduceAccessAuthGate(locked, {
      type: 'preflight', generation: preflightGeneration, scopeId: 'profile-a', policy: 'disabled'
    });

    expect(afterLatePreflight.required).toBe(true);
    expect(afterLatePreflight.checked).toBe(true);
    expect(canRenderBrowserForAccessAuth(afterLatePreflight.checked, {
      auth_enabled: afterLatePreflight.required, logged_in: !afterLatePreflight.required
    })).toBe(false);
  });

  it('invalidates pending auth status on lock and pending results on scope change', () => {
    const firstScope = reduceAccessAuthGate(initialAccessAuthGateState, { type: 'scope-change', scopeId: 'profile-a' });
    const statusGeneration = firstScope.generation;
    const locked = reduceAccessAuthGate(firstScope, { type: 'lock' });
    const afterLateStatus = reduceAccessAuthGate(locked, {
      type: 'status', generation: statusGeneration, auth: { auth_enabled: false, logged_in: false }
    });
    expect(afterLateStatus.required).toBe(true);

    const beforeScopeSwitch = reduceAccessAuthGate(initialAccessAuthGateState, { type: 'scope-change', scopeId: 'profile-a' });
    const afterScopeSwitch = reduceAccessAuthGate(beforeScopeSwitch, { type: 'scope-change', scopeId: 'profile-b' });
    const staleScopeResult = reduceAccessAuthGate(afterScopeSwitch, {
      type: 'preflight', generation: beforeScopeSwitch.generation, scopeId: 'profile-a', policy: 'disabled'
    });
    expect(staleScopeResult).toMatchObject({ checked: false, required: true, scopeId: 'profile-b' });
  });

  it('allows a fresh retry or verified login while remaining fail-closed for enabled and unknown policy', () => {
    const locked = reduceAccessAuthGate(initialAccessAuthGateState, { type: 'lock' });
    const retry = reduceAccessAuthGate(locked, { type: 'retry' });
    expect(reduceAccessAuthGate(retry, {
      type: 'preflight', generation: retry.generation, scopeId: 'profile-a', policy: 'disabled'
    })).toMatchObject({ checked: true, required: false });

    const enabled = reduceAccessAuthGate(initialAccessAuthGateState, {
      type: 'preflight', generation: 0, scopeId: 'profile-a', policy: 'enabled'
    });
    const unknown = reduceAccessAuthGate(initialAccessAuthGateState, {
      type: 'preflight', generation: 0, scopeId: 'profile-a', policy: 'unknown'
    });
    expect(enabled.checked).toBe(false);
    expect(unknown.checked).toBe(false);
    const unknownStatus = reduceAccessAuthGate(initialAccessAuthGateState, {
      type: 'status', generation: 0, auth: { logged_in: false }
    });
    expect(unknownStatus).toMatchObject({ checked: true, required: true });

    const loginAttempt = reduceAccessAuthGate(locked, { type: 'retry' });
    const loggedIn = reduceAccessAuthGate(loginAttempt, { type: 'login-success', generation: loginAttempt.generation });
    expect(loggedIn).toMatchObject({ checked: true, required: false });

    const pendingLoginGeneration = loginAttempt.generation;
    const relocked = reduceAccessAuthGate(loginAttempt, { type: 'lock' });
    const staleLogin = reduceAccessAuthGate(relocked, { type: 'login-success', generation: pendingLoginGeneration });
    expect(staleLogin).toMatchObject({ checked: true, required: true });
  });

  it('keeps auth disabled usable when Python is offline while blocking enabled and unknown auth', () => {
    const disabled = reduceAccessAuthGate(initialAccessAuthGateState, {
      type: 'preflight', generation: 0, scopeId: 'profile-a', policy: 'disabled'
    });
    const sidekickTransportReady = false;
    expect(sidekickTransportReady).toBe(false);
    expect(canRenderBrowserForAccessAuth(disabled.checked, {
      auth_enabled: disabled.required, logged_in: !disabled.required
    })).toBe(true);

    for (const policy of ['enabled', 'unknown'] as const) {
      const blocked = reduceAccessAuthGate(initialAccessAuthGateState, {
        type: 'preflight', generation: 0, scopeId: 'profile-a', policy
      });
      expect(canRenderBrowserForAccessAuth(blocked.checked, {
        auth_enabled: policy === 'enabled', logged_in: false
      })).toBe(false);
    }
  });

  it('shows the disabled auth state after removing the password gate', () => {
    const source = readFileSync(settingsPanelsPath, 'utf8').replace(/\r\n/g, '\n');
    expect(source).toContain("t(passwordEnvLocked ? 'settings.panels.system.lockedByEnvironment' : authEnabled ? 'settings.panels.system.disableAuth' : 'settings.panels.system.authDisabled')");
    expect(source).toContain("showToast(t('settings.panels.system.authDisabled'))");
    expect(source).toContain('if (result.auth_enabled !== false)');
    expect(source).toContain("t('settings.panels.system.authDisableNotConfirmed')");
    expect(source).toContain("t('settings.panels.system.disableAuthFailed')");
    expect(source).toContain('disabled={!ready || !authEnabled || !loggedIn || passwordEnvLocked}');
    expect(source).toContain("t('settings.panels.system.authDisableLoginRequired')");
    expect(source).toContain('onRefresh={refreshSettingsData}');
    expect(source).toContain('pluginsState.refresh()');
    expect(source).toContain("path: '/api/auth/status' });\n      if (confirmedAuth.auth_enabled !== false)");
    expect(source).toContain('authState.setData(confirmedAuth)');
    const shared = readFileSync(path.resolve(process.cwd(), 'src/renderer/panels/RestPanelShared.tsx'), 'utf8');
    expect(shared).toContain('setData: React.Dispatch<React.SetStateAction<AnyRecord | null>>');
  });
});
