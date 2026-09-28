import { describe, expect, it } from 'vitest';
import { capturePageDataUrl, normalizeCapturePageRect } from '../src/main/capture-page.js';

describe('renderer-requested WebView capture crops', () => {
  it('rejects malformed, negative, or zero-sized rectangles', () => {
    expect(normalizeCapturePageRect(null)).toBeNull();
    expect(normalizeCapturePageRect({ x: Number.NaN, y: 0, width: 10, height: 10 })).toBeNull();
    expect(normalizeCapturePageRect({ x: -1, y: 0, width: 10, height: 10 })).toBeNull();
    expect(normalizeCapturePageRect({ x: 0, y: 0, width: 0, height: 10 })).toBeNull();
  });

  it('rounds coordinates and caps each capture dimension', () => {
    expect(normalizeCapturePageRect({ x: 3.4, y: 5.6, width: 800, height: 2.2 })).toEqual({
      x: 3, y: 6, width: 256, height: 2
    });
  });

  it('rejects coordinates outside the browser page guardrail', () => {
    expect(normalizeCapturePageRect({ x: 32_769, y: 0, width: 10, height: 10 })).toBeNull();
  });
});

describe('Electron page capture liveness', () => {
  it('returns a valid image data URL from a completed capture', async () => {
    await expect(capturePageDataUrl(async () => ({ toDataURL: () => `data:image/png;base64,${'x'.repeat(128)}` })))
      .resolves.toMatch(/^data:image\/png;base64,/);
  });

  it('falls back promptly when Electron capturePage never resolves', async () => {
    await expect(capturePageDataUrl(() => new Promise(() => {}), 5)).resolves.toBeNull();
  });

  it('rejects an invalid timeout instead of creating an unbounded wait', async () => {
    await expect(capturePageDataUrl(async () => ({ toDataURL: () => `data:image/png;base64,${'x'.repeat(128)}` }), 0))
      .resolves.toBeNull();
  });
});
