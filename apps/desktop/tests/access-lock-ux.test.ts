import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { accessLockErrorKey, classifyAccessLockError } from '../src/renderer/access-lock-errors.js';

const rendererRoot = path.resolve(process.cwd(), 'src/renderer');

describe('access lock error copy', () => {
  it('classifies invalid passwords from backend and HTTP failures', () => {
    expect(classifyAccessLockError('Invalid password')).toBe('invalid');
    expect(classifyAccessLockError(new Error('HTTP 401'))).toBe('invalid');
  });

  it('classifies throttled unlock attempts', () => {
    expect(classifyAccessLockError('Too many attempts. Try again in a minute.')).toBe('rateLimited');
    expect(classifyAccessLockError(new Error('HTTP 429'))).toBe('rateLimited');
  });

  it('classifies missing secure sessions', () => {
    expect(classifyAccessLockError('Login did not create an authenticated session.')).toBe('session');
  });

  it('classifies transport failures as unreachable', () => {
    expect(classifyAccessLockError('Sidekick API request failed.')).toBe('unreachable');
    expect(classifyAccessLockError('Sidekick API request timed out after 15000 ms.')).toBe('unreachable');
    expect(classifyAccessLockError('fetch failed')).toBe('unreachable');
  });

  it('falls back to generic copy for unknown or empty failures', () => {
    expect(classifyAccessLockError('')).toBe('generic');
    expect(classifyAccessLockError(undefined)).toBe('generic');
    expect(classifyAccessLockError(new Error('  '))).toBe('generic');
    expect(classifyAccessLockError('unexpected backend detail')).toBe('generic');
  });

  it('maps every kind to a distinct localized translation key', () => {
    const keys = ['Invalid password', 'Too many attempts', 'authenticated session', 'request failed', 'backend detail']
      .map((failure) => accessLockErrorKey(failure));
    expect(keys).toEqual([
      'access.lock.error.invalid',
      'access.lock.error.rateLimited',
      'access.lock.error.session',
      'access.lock.error.unreachable',
      'access.lock.error.generic'
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('access lock screen wiring', () => {
  const app = readFileSync(path.join(rendererRoot, 'App.tsx'), 'utf8');
  const settings = readFileSync(path.join(rendererRoot, 'panels/SystemPanels.tsx'), 'utf8');
  const lockScreen = app.slice(app.indexOf('className="access-lock-screen"'), app.indexOf('className={`app-shell panel-'));

  it('keeps the password form visible while the lock is required', () => {
    expect(lockScreen).toContain('{accessAuthRequired ? (');
    expect(lockScreen).toContain('id="access-lock-password"');
    expect(lockScreen).toContain('{!accessAuthChecked && !accessAuthBusy && !accessAuthError && <p className="access-lock-status" role="status">{t(\'access.lock.checking\')}</p>}');
  });

  it('localizes errors instead of rendering raw backend messages', () => {
    expect(lockScreen).toContain('t(accessLockErrorKey(accessAuthError))');
    expect(lockScreen).not.toContain('{accessAuthError}</div>');
    expect(lockScreen).not.toContain('(accessAuthError || t(\'access.lock.checking\'))');
  });

  it('offers a show/hide password toggle with pressed state and labels', () => {
    expect(lockScreen).toContain("type={accessPasswordVisible ? 'text' : 'password'}");
    expect(lockScreen).toContain('aria-pressed={accessPasswordVisible}');
    expect(lockScreen).toContain("t(accessPasswordVisible ? 'access.lock.hidePassword' : 'access.lock.showPassword')");
    expect(lockScreen).toContain('setAccessPasswordVisible((visible) => !visible)');
  });

  it('resets the password visibility whenever the lock is shown or cleared', () => {
    const lockHandler = app.slice(app.indexOf('const lockBrowser = () => {'));
    expect(lockHandler.slice(0, 400)).toContain('setAccessPasswordVisible(false)');
    const unlockHandler = app.slice(app.indexOf('async function unlockBrowser('));
    expect(unlockHandler.slice(0, 1200)).toContain('setAccessPasswordVisible(false)');
  });

  it('points users at the settings password field and marks it as a new password', () => {
    expect(lockScreen).toContain("t('access.lock.hint')");
    const field = settings.indexOf('settings.panels.system.accessPassword');
    expect(field).toBeGreaterThanOrEqual(0);
    expect(settings.slice(field, field + 400)).toContain('autoComplete="new-password"');
  });
});
