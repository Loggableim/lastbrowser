import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoundedRequestTimeoutError, withAbortTimeout } from '../src/main/bounded-request.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('withAbortTimeout', () => {
  it('aborts a pending local request and settles at the configured bound', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const request = withAbortTimeout((signal) => {
      requestSignal = signal;
      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    }, 2500);
    const assertion = expect(request).rejects.toBeInstanceOf(BoundedRequestTimeoutError);

    await vi.advanceTimersByTimeAsync(2500);
    await assertion;

    expect(requestSignal?.aborted).toBe(true);
  });

  it('enforces the bound even if an operation ignores its abort signal', async () => {
    vi.useFakeTimers();
    const request = withAbortTimeout(() => new Promise<never>(() => undefined), 1000);
    const assertion = expect(request).rejects.toBeInstanceOf(BoundedRequestTimeoutError);

    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('returns a response before the deadline and clears the timeout', async () => {
    vi.useFakeTimers();
    await expect(withAbortTimeout(async () => 'ready', 3000)).resolves.toBe('ready');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves request failures that happen before the deadline', async () => {
    vi.useFakeTimers();
    await expect(withAbortTimeout(async () => { throw new Error('connection refused'); }, 3000))
      .rejects.toThrow('connection refused');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects invalid timeout values', async () => {
    await expect(withAbortTimeout(async () => 'ready', 0)).rejects.toThrow(RangeError);
  });
});
