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

  it('keeps the password form mounted while a session error is displayed', () => {
    expect(app).toContain("const accessAuthForm = accessAuthRequired ? (");
    expect(app).not.toContain("const accessAuthForm = accessAuthRequired && !startupFailureStage");
    expect(app).toContain('{!accessAuthChecked && !accessAuthBusy && !accessAuthError && <p className="startup-screen__auth-status" role="status">{t(\'access.lock.checking\')}</p>}');
  });

  it('renders the lock form before the phase line and hides the phase while locked', () => {
    const lockedPath = app.slice(app.indexOf('if (accessAuthRequired) {'));
    expect(lockedPath.slice(0, lockedPath.indexOf('const showStartupAnimation'))).toContain('phase={null}');
    const placeholder = readFileSync(path.join(rendererRoot, 'startup/StartupPlaceholder.tsx'), 'utf8');
    expect(placeholder.indexOf('{retryContent}')).toBeLessThan(placeholder.indexOf('startup-placeholder__phase'));
  });

  it('localizes errors instead of rendering raw backend messages', () => {
    expect(app).toContain('t(accessLockErrorKey(accessAuthError))');
    expect(app).not.toContain('{accessAuthError}</div>');
  });

  it('offers a show/hide password toggle with pressed state and labels', () => {
    expect(app).toContain("type={accessPasswordVisible ? 'text' : 'password'}");
    expect(app).toContain('aria-pressed={accessPasswordVisible}');
    expect(app).toContain("t(accessPasswordVisible ? 'access.lock.hidePassword' : 'access.lock.showPassword')");
  });

  it('points users at the settings password field and marks it as a new password', () => {
    expect(app).toContain("t('access.lock.hint')");
    const field = settings.indexOf('settings.panels.system.accessPassword');
    expect(field).toBeGreaterThanOrEqual(0);
    expect(settings.slice(field, field + 400)).toContain('autoComplete="new-password"');
  });
});
