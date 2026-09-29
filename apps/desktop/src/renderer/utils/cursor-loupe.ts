export type LoupeCaptureRect = { x: number; y: number; width: number; height: number };
export type LoupeViewportBounds = { x: number; y: number; width: number; height: number };

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
