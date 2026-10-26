import { describe, expect, it, vi } from 'vitest';
import {
  describeSidekickAuthStatusFailure,
  isTransientSidekickConnectionError,
  waitForSidekickWebui,
  withSidekickWebuiReady
} from '../src/main/sidekick-readiness.js';

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

  it('backs off between readiness polls instead of polling at a fixed rate', async () => {
    const statuses = [
      { sidekick: 'ready', webuiHealth: 'checking', webuiUrl: 'http://127.0.0.1:8787' },
      { sidekick: 'ready', webuiHealth: 'checking', webuiUrl: 'http://127.0.0.1:8787' },
      { sidekick: 'ready', webuiHealth: 'checking', webuiUrl: 'http://127.0.0.1:8787' },
      { sidekick: 'ready', webuiHealth: 'ready', webuiUrl: 'http://127.0.0.1:8787' }
    ];
    const getStatus = vi.fn(() => statuses.shift());
    const sleep = vi.fn(async () => undefined);

    await waitForSidekickWebui(getStatus, { sleep, intervalMs: 100, maxIntervalMs: 300 });
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([100, 150, 225]);
  });

  it('includes the last health error when readiness times out', async () => {
    await expect(waitForSidekickWebui(() => ({
      sidekick: 'ready',
      webuiHealth: 'checking',
      webuiUrl: 'http://127.0.0.1:8787',
      lastError: 'Local service request timed out.'
    }), { timeoutMs: 0 })).rejects.toThrow('Local service request timed out.');
  });

  it('names the port when the backend does not answer its health probe', () => {
    const error = describeSidekickAuthStatusFailure({
      webuiUrl: 'http://127.0.0.1:8788',
      health: { ok: false, error: 'Local service request timed out.' },
      requestError: new Error('Sidekick API request timed out after 30000 ms.')
    });
    expect(error.message).toContain('Sidekick backend is not responding on port 8788');
    expect(error.message).toContain('Local service request timed out.');
  });

  it('keeps the request error when the backend answers health', () => {
    const error = describeSidekickAuthStatusFailure({
      webuiUrl: 'http://127.0.0.1:8787',
      health: { ok: true },
      requestError: new Error('Sidekick API request timed out after 30000 ms.')
    });
    expect(error.message).toContain('answers its health probe');
    expect(error.message).toContain('Sidekick API request timed out after 30000 ms.');
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
