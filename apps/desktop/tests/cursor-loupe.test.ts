import { describe, expect, it } from 'vitest';
import { hasLoupePointerMoved } from '../src/renderer/utils/cursor-loupe.js';

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
});
