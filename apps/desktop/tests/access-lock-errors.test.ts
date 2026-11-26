import { describe, expect, it } from 'vitest';
import { accessLockErrorKey } from '../src/renderer/access-lock-errors.js';

describe('access lock error messages', () => {
  it('distinguishes a rejected password from a failed status check', () => {
    expect(accessLockErrorKey('Invalid password (401)', 'login')).toBe('access.lock.error.invalid');
    expect(accessLockErrorKey('Request failed (401)', 'status')).toBe('access.lock.error.session');
    expect(accessLockErrorKey('Too many attempts (429)', 'login')).toBe('access.lock.error.rateLimited');
    expect(accessLockErrorKey('fetch failed', 'status')).toBe('access.lock.error.unreachable');
    expect(accessLockErrorKey('unknown service failure', 'login')).toBe('access.lock.error.generic');
  });
});
