import { describe, expect, it } from 'vitest';
import { createEdgeScroller, type EdgeScrollScheduler } from '../src/renderer/sidebar-edge-scroll.js';

function harness(maximum = 300) {
  let clock = 0;
  let id = 0;
  let position = 0;
  const delays = new Map<number, { due: number; callback: () => void }>();
  const frames = new Map<number, (time: number) => void>();
  const scheduler: EdgeScrollScheduler = {
    delay(callback, milliseconds) { delays.set(++id, { due: clock + milliseconds, callback }); return id; },
    cancelDelay(key) { delays.delete(key); },
    frame(callback) { frames.set(++id, callback); return id; },
    cancelFrame(key) { frames.delete(key); }
  };
  const controller = createEdgeScroller((pixels) => {
    position = Math.max(0, Math.min(maximum, position + pixels));
    return pixels < 0 ? position > 1 : position < maximum - 1;
  }, scheduler);
  return {
    ...controller,
    position: () => position,
    pending: () => delays.size + frames.size,
    advance(milliseconds: number) {
      clock += milliseconds;
      for (const [key, timer] of delays) {
        if (timer.due <= clock) { delays.delete(key); timer.callback(); }
      }
      const batch = Array.from(frames);
      frames.clear();
      for (const [, callback] of batch) callback(clock);
    }
  };
}

describe('sidebar edge hover scrolling', () => {
  it('waits 250 ms and moves at 120 pixels per second', () => {
    const scroll = harness();
    scroll.start(1);
    scroll.advance(249);
    expect(scroll.position()).toBe(0);
    scroll.advance(1);
    scroll.advance(50);
    expect(scroll.position()).toBe(6);
    scroll.advance(50);
    expect(scroll.position()).toBe(12);
  });

  it('cancels both a pending hover and an active animation', () => {
    const scroll = harness();
    scroll.start(1);
    scroll.stop();
    scroll.advance(300);
    expect(scroll.pending()).toBe(0);
    expect(scroll.position()).toBe(0);
    scroll.start(1);
    scroll.advance(250);
    scroll.advance(50);
    scroll.stop();
    scroll.advance(50);
    expect(scroll.position()).toBe(6);
    expect(scroll.pending()).toBe(0);
  });

  it('stops automatically at both boundaries and reverses without duplicate loops', () => {
    const scroll = harness(12);
    scroll.start(1);
    scroll.advance(250);
    scroll.advance(50);
    scroll.advance(50);
    expect(scroll.position()).toBe(12);
    expect(scroll.pending()).toBe(0);
    scroll.start(1);
    scroll.start(-1);
    expect(scroll.pending()).toBe(1);
    scroll.advance(250);
    scroll.advance(50);
    scroll.advance(50);
    expect(scroll.position()).toBe(0);
    expect(scroll.pending()).toBe(0);
  });

  it('caps long frames so restoring a background window cannot jump', () => {
    const scroll = harness();
    scroll.start(1);
    scroll.advance(250);
    scroll.advance(5000);
    expect(scroll.position()).toBe(6);
  });
});
