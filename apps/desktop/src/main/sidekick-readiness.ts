export type SidekickReadinessStatus = {
  sidekick?: string;
  webuiHealth?: string;
  webuiUrl?: string;
  lastError?: string | null;
};

export type SidekickReadinessOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  retryDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Wait until the Sidekick HTTP server has passed its health probe, not just spawned. */
export async function waitForSidekickWebui(
  getStatus: () => SidekickReadinessStatus | null | undefined,
  options: SidekickReadinessOptions = {}
): Promise<string> {
  const timeoutMs = Math.max(0, options.timeoutMs ?? 45_000);
  const intervalMs = Math.max(1, options.intervalMs ?? 150);
  const sleep = options.sleep ?? defaultSleep;
  const deadline = Date.now() + timeoutMs;
  let status = getStatus();

  while (true) {
    if (status?.webuiHealth === 'ready' && status.webuiUrl) return status.webuiUrl;

    if (status?.sidekick === 'missing' || status?.sidekick === 'error' || status?.sidekick === 'stopped') {
      const detail = status.lastError?.trim();
      throw new Error(detail
        ? `Sidekick could not start: ${detail}`
        : 'Sidekick could not start. Check its status in Settings and try again.');
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error('Sidekick is still starting and did not become available in time. Try again; if this continues, restart the Sidekick service in Settings.');
    }

    await sleep(Math.min(intervalMs, remainingMs));
    status = getStatus();
  }
}

/** Run an action only after health is ready; retry once only when no connection was established. */
export async function withSidekickWebuiReady<T>(
  getStatus: () => SidekickReadinessStatus | null | undefined,
  action: (webuiUrl: string) => Promise<T>,
  options: SidekickReadinessOptions = {}
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  const webuiUrl = await waitForSidekickWebui(getStatus, options);
  try {
    return await action(webuiUrl);
  } catch (error) {
    if (!isTransientSidekickConnectionError(error)) throw error;

    // ECONNREFUSED means the request could not reach the HTTP handler, so a
    // single retry cannot duplicate a non-idempotent action such as addSpace.
    await sleep(options.retryDelayMs ?? 250);
    const retryUrl = await waitForSidekickWebui(getStatus, options);
    return action(retryUrl);
  }
}

/** Fetch can fail between the health probe and a request; only retry connection failures. */
export function isTransientSidekickConnectionError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && !seen.has(current); depth += 1) {
    seen.add(current);
    if (typeof current === 'object') {
      const candidate = current as { code?: unknown; cause?: unknown; message?: unknown };
      if (String(candidate.code || '') === 'ECONNREFUSED') return true;
      current = candidate.cause;
      continue;
    }
    if (typeof current === 'string' && /ECONNREFUSED/i.test(current)) return true;
    break;
  }
  return false;
}
