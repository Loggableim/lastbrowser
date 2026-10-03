export type LoupeCaptureRect = { x: number; y: number; width: number; height: number };
export type LoupeViewportBounds = { x: number; y: number; width: number; height: number };
export type CursorShakeSample = { t: number; x: number };

export type LoupeCaptureRetryState = { point: { x: number; y: number } | null; attempts: number };

/** Retry transient empty captures a few times, including without pointer movement. */
export function nextLoupeCaptureRetry(
  point: { x: number; y: number },
  previous: LoupeCaptureRetryState,
  maxAttempts = 3
): LoupeCaptureRetryState & { exhausted: boolean } {
  const moved = previous.point !== null && hasLoupePointerMoved(point, previous.point);
  const attempts = moved || previous.point === null ? 1 : previous.attempts + 1;
  return { point, attempts, exhausted: attempts >= maxAttempts };
}

/** Avoid repeating an expensive capture until the pointer moves after the last attempt. */
export function hasLoupePointerMoved(
  point: { x: number; y: number },
  previousPoint: { x: number; y: number },
  threshold = 3
): boolean {
  if (![point.x, point.y].every(Number.isFinite)) return false;
  if (![previousPoint.x, previousPoint.y].every(Number.isFinite)) return true;
  return Math.abs(point.x - previousPoint.x) + Math.abs(point.y - previousPoint.y) >= threshold;
}

/** Require a sustained, alternating horizontal shake; one fast sweep is not a shake. */
export function isCursorShake(samples: readonly CursorShakeSample[]): boolean {
  if (samples.length < 4) return false;
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last || last.t - first.t > 700) return false;

  let totalTravel = 0;
  let minX = first.x;
  let maxX = first.x;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (!previous || !current || !Number.isFinite(previous.x) || !Number.isFinite(current.x)) return false;
    totalTravel += Math.abs(current.x - previous.x);
    minX = Math.min(minX, current.x);
    maxX = Math.max(maxX, current.x);
  }
  if (totalTravel < 280 || maxX - minX < 70) return false;

  let direction = 0;
  let legStartX = first.x;
  let previousX = first.x;
  let previousLegDirection = 0;
  let reversals = 0;
  for (const sample of samples.slice(1)) {
    const delta = sample.x - previousX;
    if (Math.abs(delta) < 4) {
      previousX = sample.x;
      continue;
    }
    const nextDirection = Math.sign(delta);
    if (!direction) {
      direction = nextDirection;
      legStartX = sample.x - delta;
      previousX = sample.x;
      continue;
    }
    if (nextDirection === direction) {
      previousX = sample.x;
      continue;
    }

    // Ignore tiny corrections and hand tremor; only count a reversal after a
    // substantial leg has been completed.
    if (Math.abs(previousX - legStartX) < 55) {
      previousX = sample.x;
      continue;
    }
    if (previousLegDirection && previousLegDirection !== direction) reversals += 1;
    previousLegDirection = direction;
    direction = nextDirection;
    legStartX = previousX;
    previousX = sample.x;
  }
  return reversals >= 2;
}

/** Place the HUD beside the pointer while keeping the complete loupe in-window. */
export function getLoupePosition(
  x: number, y: number, viewportWidth: number, viewportHeight: number,
  loupeSize: number, offsetX: number, offsetY: number
): { x: number; y: number } | null {
  if (![x, y, viewportWidth, viewportHeight, loupeSize, offsetX, offsetY].every(Number.isFinite)) return null;
  if (viewportWidth <= 0 || viewportHeight <= 0 || loupeSize <= 0) return null;
  return {
    x: Math.min(Math.max(0, viewportWidth - loupeSize), Math.max(0, x + offsetX)),
    y: Math.min(Math.max(0, viewportHeight - loupeSize), Math.max(0, y + offsetY))
  };
}

/** Return a square guest-page crop centered on the pointer and clamped to the viewport. */
export function getLoupeCaptureRect(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  loupeSize: number,
  magnification: number
): LoupeCaptureRect | null {
  if (![x, y, viewportWidth, viewportHeight, loupeSize, magnification].every(Number.isFinite)) return null;
  if (viewportWidth <= 0 || viewportHeight <= 0 || loupeSize <= 0 || magnification <= 0) return null;

  const size = Math.min(loupeSize / magnification, viewportWidth, viewportHeight);
  if (size <= 0) return null;
  const left = Math.max(0, Math.min(viewportWidth - size, x - size / 2));
  const top = Math.max(0, Math.min(viewportHeight - size, y - size / 2));
  return { x: Math.round(left), y: Math.round(top), width: Math.round(size), height: Math.round(size) };
}

/** Return a page-local crop only when the pointer is actually over this WebView. */
export function getWebviewLoupeCaptureRect(
  pointerX: number,
  pointerY: number,
  bounds: LoupeViewportBounds,
  loupeSize: number,
  magnification: number
): LoupeCaptureRect | null {
  if (![pointerX, pointerY, bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return null;
  if (pointerX < bounds.x || pointerY < bounds.y
    || pointerX >= bounds.x + bounds.width || pointerY >= bounds.y + bounds.height) return null;
  return getLoupeCaptureRect(
    pointerX - bounds.x,
    pointerY - bounds.y,
    bounds.width,
    bounds.height,
    loupeSize,
    magnification
  );
}
