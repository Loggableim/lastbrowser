import type { DesktopTranslationKey } from './i18n/keys.js';

export function accessLockErrorKey(error: string, context: 'login' | 'status'): DesktopTranslationKey {
  const message = error.toLowerCase();
  if (/too many attempts|rate limit|\b429\b/.test(message)) return 'access.lock.error.rateLimited';
  if (context === 'login' && /invalid password|incorrect password|wrong password|\b401\b/.test(message)) return 'access.lock.error.invalid';
  if (/timeout|timed out|network|failed to fetch|fetch failed|econn|unreachable|offline/.test(message)) return 'access.lock.error.unreachable';
  if (context === 'status' || /authenticated session|secure session/.test(message)) return 'access.lock.error.session';
  return 'access.lock.error.generic';
}
