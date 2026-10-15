import { describe, expect, it, vi } from 'vitest';
import {
  fetchAccessAuthStatusWithRetry,
  isAuthoritativeAccessAuthError
} from '../src/renderer/access-auth-status.js';

const status = { auth_enabled: false, logged_in: false };

describe('access auth status retry', () => {
  it('returns the first successful response without retrying', async () => {
    const fetchStatus = vi.fn().mockResolvedValue(status);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(fetchAccessAuthStatusWithRetry(fetchStatus, { sleep })).resolves.toEqual(status);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries a transient timeout with exponential backoff until it succeeds', async () => {
    const fetchStatus = vi.fn()
      .mockRejectedValueOnce(new Error('Sidekick API request timed out after 30000 ms.'))
      .mockRejectedValueOnce(new Error('Sidekick API request timed out after 30000 ms.'))
      .mockResolvedValue(status);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(fetchAccessAuthStatusWithRetry(fetchStatus, { sleep, baseDelayMs: 1_000 })).resolves.toEqual(status);
    expect(fetchStatus).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([1_000, 2_000]);
  });

  it('fails closed after the attempts are exhausted', async () => {
    const error = new Error('Sidekick API request timed out after 30000 ms.');
    const fetchStatus = vi.fn().mockRejectedValue(error);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(fetchAccessAuthStatusWithRetry(fetchStatus, { sleep, maxAttempts: 3 })).rejects.toBe(error);
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });

  it('never retries an authoritative auth failure', async () => {
    const error = new Error('HTTP 401: authentication required');
    const fetchStatus = vi.fn().mockRejectedValue(error);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(fetchAccessAuthStatusWithRetry(fetchStatus, { sleep })).rejects.toBe(error);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(isAuthoritativeAccessAuthError(error)).toBe(true);
    expect(isAuthoritativeAccessAuthError(new Error('Sidekick API request timed out after 30000 ms.'))).toBe(false);
  });

  it('stops retrying when the caller aborts', async () => {
    const controller = new AbortController();
    const fetchStatus = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(new Error('Sidekick API request timed out after 30000 ms.'));
    });

    await expect(fetchAccessAuthStatusWithRetry(fetchStatus, { signal: controller.signal }))
      .rejects.toThrow();
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });
});
