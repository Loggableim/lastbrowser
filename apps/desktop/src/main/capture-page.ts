export type CapturePageRect = { x: number; y: number; width: number; height: number };

const CAPTURE_PAGE_TIMEOUT_MS = 1_500;

interface CapturePageImage {
  toDataURL(): string;
}

/** Bound Electron's capturePage wait so a stalled guest cannot block the renderer. */
export async function capturePageDataUrl(
  capture: () => Promise<CapturePageImage>,
  timeoutMs = CAPTURE_PAGE_TIMEOUT_MS
): Promise<string | null> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return null;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const image = await Promise.race([
      Promise.resolve().then(capture),
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), timeoutMs);
      })
    ]);
    if (!image) return null;
    const dataUrl = image.toDataURL();
    return dataUrl.length > 100 ? dataUrl : null;
  } catch {
    return null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/** Clamp renderer-provided page crops before handing them to Electron. */
export function normalizeCapturePageRect(value: unknown): CapturePageRect | null {
  if (!value || typeof value !== 'object') return null;
  const rect = value as Record<string, unknown>;
  const numbers = [rect.x, rect.y, rect.width, rect.height].map(Number);
  if (!numbers.every(Number.isFinite) || numbers[0] < 0 || numbers[1] < 0
    || numbers[0] > 32_768 || numbers[1] > 32_768 || numbers[2] <= 0 || numbers[3] <= 0) {
    return null;
  }
  return {
    x: Math.round(numbers[0]),
    y: Math.round(numbers[1]),
    width: Math.min(256, Math.max(1, Math.round(numbers[2]))),
    height: Math.min(256, Math.max(1, Math.round(numbers[3])))
  };
}
