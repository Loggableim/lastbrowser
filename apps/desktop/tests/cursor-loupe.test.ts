import { describe, expect, it } from 'vitest';
import { hasLoupePointerMoved, nextLoupeCaptureRetry } from '../src/renderer/utils/cursor-loupe.js';

describe('cursor loupe capture scheduling', () => {
  it('allows the first capture when no prior point exists', () => {
    expect(hasLoupePointerMoved({ x: 100, y: 80 }, { x: Number.NaN, y: Number.NaN })).toBe(true);
  });

  it('does not retry a capture at a stationary pointer', () => {
    expect(hasLoupePointerMoved({ x: 100, y: 80 }, { x: 100, y: 80 })).toBe(false);
  });

  it('retries after meaningful movement, using the existing three-pixel threshold', () => {
    expect(hasLoupePointerMoved({ x: 102, y: 80 }, { x: 100, y: 80 })).toBe(false);
    expect(hasLoupePointerMoved({ x: 103, y: 80 }, { x: 100, y: 80 })).toBe(true);
  });

  it('ignores malformed current pointer coordinates', () => {
    expect(hasLoupePointerMoved({ x: Number.NaN, y: 80 }, { x: 100, y: 80 })).toBe(false);
  });

  it('retries transient empty captures at a stationary pointer, then stops after three attempts', () => {
    const point = { x: 100, y: 80 };
    const first = nextLoupeCaptureRetry(point, { point: null, attempts: 0 });
    const second = nextLoupeCaptureRetry(point, first);
    const third = nextLoupeCaptureRetry(point, second);

    expect([first.attempts, second.attempts, third.attempts]).toEqual([1, 2, 3]);
    expect([first.exhausted, second.exhausted, third.exhausted]).toEqual([false, false, true]);
  });

  it('starts a fresh bounded retry window after the pointer moves', () => {
    const retry = nextLoupeCaptureRetry(
      { x: 103, y: 80 },
      { point: { x: 100, y: 80 }, attempts: 2 }
    );

    expect(retry).toEqual({ point: { x: 103, y: 80 }, attempts: 1, exhausted: false });
  });
});
