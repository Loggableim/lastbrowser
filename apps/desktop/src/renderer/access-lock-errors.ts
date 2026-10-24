import type { DesktopTranslationKey } from './i18n/keys.js';

export type AccessLockErrorKind = 'invalid' | 'rateLimited' | 'session' | 'unreachable' | 'generic';

export const accessLockErrorKeys: Record<AccessLockErrorKind, DesktopTranslationKey> = {
  invalid: 'access.lock.error.invalid',
  rateLimited: 'access.lock.error.rateLimited',
  session: 'access.lock.error.session',
  unreachable: 'access.lock.error.unreachable',
  generic: 'access.lock.error.generic'
};

/** Maps raw IPC/HTTP failures to stable UI copy so the lock screen never leaks English backend text. */
export function classifyAccessLockError(error: unknown): AccessLockErrorKind {
  const message = typeof error === 'string'
    ? error
    : error instanceof Error ? error.message : '';
  const normalized = message.toLowerCase();
  if (!normalized.trim()) return 'generic';
  if (/invalid password|incorrect password|wrong password|\b401\b/.test(normalized)) return 'invalid';
  if (/too many attempts|rate limit|\b429\b/.test(normalized)) return 'rateLimited';
  if (/authenticated session|secure session/.test(normalized)) return 'session';
  if (/timed out|timeout|request failed|network|failed to fetch|fetch failed|econn|unreachable|offline/.test(normalized)) return 'unreachable';
  return 'generic';
}

export function accessLockErrorKey(error: unknown): DesktopTranslationKey {
  return accessLockErrorKeys[classifyAccessLockError(error)];
}
