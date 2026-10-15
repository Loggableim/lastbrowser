import type { AccessAuthStatus } from './access-auth.js';

export type AccessAuthStatusFetch = () => Promise<AccessAuthStatus>;

export type AccessAuthStatusRetryOptions = {
  /** Total attempts, including the first one. Defaults to 3. */
  maxAttempts?: number;
  /** First backoff delay; each following attempt doubles it. Defaults to 1000 ms. */
  baseDelayMs?: number;
  /** Cancels the pending backoff wait between attempts. */
  signal?: AbortSignal;
  /** Test seam; production uses a cancellable timer. */
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
};

/**
 * Matches an authoritative main-process auth rejection.
 *
 * A confirmed sign-out or 401 cannot be fixed by repeating the same protection
 * request, so those failures must fail closed immediately instead of retrying.
 * Everything else from `getAccessAuthStatus` is a transport failure: the public
 * `/api/auth/status` route never answers with a real auth rejection.
 */
export function isAuthoritativeAccessAuthError(error: unknown): boolean {
  return /authentication required|unauthorized|\b401\b/i.test(String(error));
}

function cancellableSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('Auth status check cancelled'));
      return;
    }
    const cancel = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Auth status check cancelled'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

/**
 * Verify the session state with bounded, backed-off retries.
 *
 * The bundled WebUI is single-threaded: a heavy chat turn, model discovery, or
 * filesystem work can stall `/api/auth/status` past the desktop bridge timeout.
 * A single timeout must not lock the whole browser to the startup screen, so a
 * transient failure is retried before it is reported. After the attempts are
 * exhausted the caller still receives the error, so the session gate stays
 * fail-closed and shows its "try again" state.
 */
export async function fetchAccessAuthStatusWithRetry(
  fetchStatus: AccessAuthStatusFetch,
  options: AccessAuthStatusRetryOptions = {}
): Promise<AccessAuthStatus> {
  const maxAttempts = Math.max(1, Math.trunc(options.maxAttempts ?? 3));
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 1_000);
  const sleep = options.sleep ?? cancellableSleep;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted) throw options.signal.reason ?? new Error('Auth status check cancelled');
    try {
      return await fetchStatus();
    } catch (error) {
      lastError = error;
      if (isAuthoritativeAccessAuthError(error)) throw error;
      if (attempt === maxAttempts) break;
      await sleep(baseDelayMs * 2 ** (attempt - 1), options.signal);
    }
  }
  throw lastError;
}
