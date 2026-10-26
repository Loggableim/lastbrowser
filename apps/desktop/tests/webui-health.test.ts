import { describe, expect, it, vi } from 'vitest';
import { checkWebuiHealth } from '../src/main/services.js';

describe('WebUI health checks', () => {
  it('bounds a stalled request and reports a timeout', async () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined));

    await expect(checkWebuiHealth('http://127.0.0.1:8787', fetchImpl as typeof fetch, 10))
      .resolves.toEqual({ ok: false, error: 'Local service request timed out.' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('bounds a response body that stalls after headers arrive', async () => {
    let requestSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return {
        ok: true,
        status: 200,
        arrayBuffer: () => new Promise<ArrayBuffer>(() => undefined)
      } as Response;
    });

    await expect(checkWebuiHealth('http://127.0.0.1:8787', fetchImpl as typeof fetch, 10))
      .resolves.toEqual({ ok: false, error: 'Local service request timed out.' });
    expect(requestSignal?.aborted).toBe(true);
  });

  it.each([401, 403])('treats HTTP %s as reachable when auth protects the health route', async (status) => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status,
      arrayBuffer: async () => new ArrayBuffer(0)
    } as Response));

    await expect(checkWebuiHealth('http://127.0.0.1:8787', fetchImpl as typeof fetch))
      .resolves.toEqual({ ok: true });
  });

  it('probes the cheap public /health route, not the onboarding status route', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(0)
    } as Response));

    await expect(checkWebuiHealth('http://127.0.0.1:8787', fetchImpl as typeof fetch))
      .resolves.toEqual({ ok: true });
    const requested = String(fetchImpl.mock.calls[0]?.[0]);
    expect(requested).toBe('http://127.0.0.1:8787/health');
  });

  it('keeps non-auth HTTP errors visible', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 503,
      arrayBuffer: async () => new ArrayBuffer(0)
    } as Response));

    await expect(checkWebuiHealth('http://127.0.0.1:8787', fetchImpl as typeof fetch))
      .resolves.toEqual({ ok: false, error: 'HTTP 503' });
  });
});
