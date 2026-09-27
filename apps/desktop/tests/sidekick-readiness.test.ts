import { describe, expect, it, vi } from 'vitest';
import { isTransientSidekickConnectionError, waitForSidekickWebui, withSidekickWebuiReady } from '../src/main/sidekick-readiness.js';

describe('Sidekick WebUI readiness', () => {
  it('waits for HTTP health after the child process has spawned', async () => {
    const statuses = [
      { sidekick: 'ready', webuiHealth: 'checking', webuiUrl: 'http://127.0.0.1:8787' },
      { sidekick: 'ready', webuiHealth: 'ready', webuiUrl: 'http://127.0.0.1:8787' }
    ];
    const getStatus = vi.fn(() => statuses.shift());
    const sleep = vi.fn(async () => undefined);

    await expect(waitForSidekickWebui(getStatus, { sleep })).resolves.toBe('http://127.0.0.1:8787');
    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it('returns an actionable error when Sidekick fails to start', async () => {
    await expect(waitForSidekickWebui(() => ({
      sidekick: 'error',
      webuiHealth: 'unreachable',
      lastError: 'Python runtime missing'
    }))).rejects.toThrow('Sidekick could not start: Python runtime missing');
  });

  it('explains the timeout when HTTP health never becomes ready', async () => {
    await expect(waitForSidekickWebui(() => ({
      sidekick: 'ready',
      webuiHealth: 'checking',
      webuiUrl: 'http://127.0.0.1:8787'
    }), { timeoutMs: 0 })).rejects.toThrow('did not become available in time');
  });

  it('recognizes nested transient connection errors without retrying API responses', () => {
    expect(isTransientSidekickConnectionError({
      name: 'TypeError',
      message: 'fetch failed',
      cause: { code: 'ECONNREFUSED' }
    })).toBe(true);
    expect(isTransientSidekickConnectionError(new Error('Workspace already in list'))).toBe(false);
    expect(isTransientSidekickConnectionError(new Error('HTTP 401'))).toBe(false);
  });

  it('retries one ECONNREFUSED only after a healthy readiness check', async () => {
    const getStatus = vi.fn(() => ({ sidekick: 'ready', webuiHealth: 'ready', webuiUrl: 'http://127.0.0.1:8787' }));
    const action = vi.fn()
      .mockRejectedValueOnce(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }))
      .mockResolvedValueOnce({ ok: true });

    await expect(withSidekickWebuiReady(getStatus, action, {
      sleep: vi.fn(async () => undefined)
    })).resolves.toEqual({ ok: true });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('does not retry HTTP errors from a reachable Sidekick', async () => {
    const action = vi.fn().mockRejectedValue(new Error('Workspace already in list'));

    await expect(withSidekickWebuiReady(
      () => ({ sidekick: 'ready', webuiHealth: 'ready', webuiUrl: 'http://127.0.0.1:8787' }),
      action,
      { sleep: vi.fn(async () => undefined) }
    )).rejects.toThrow('Workspace already in list');
    expect(action).toHaveBeenCalledOnce();
  });
});
