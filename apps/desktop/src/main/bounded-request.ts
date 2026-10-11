export class BoundedRequestTimeoutError extends Error {
  constructor() {
    super('Local service request timed out.');
    this.name = 'BoundedRequestTimeoutError';
  }
}

/** Run local service work with an abort signal and a hard upper bound. */
export async function withAbortTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('A positive request timeout is required.');
  }

  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(new BoundedRequestTimeoutError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } catch (error) {
    if (controller.signal.aborted) throw new BoundedRequestTimeoutError();
    throw error;
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}
