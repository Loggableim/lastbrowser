import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sidekickMotionFromRun } from '../src/renderer/sidekick-motion.js';

const idle = { runState: 'idle' as const, sawToken: false, toolRunning: false, needsInput: false, unreachable: false, previous: 'idle' as const };

describe('animated sidekick motion', () => {
  it('uses thinking until the first token, then working, then done', () => {
    expect(sidekickMotionFromRun({ ...idle, runState: 'starting' })).toBe('thinking');
    expect(sidekickMotionFromRun({ ...idle, runState: 'streaming', sawToken: false })).toBe('thinking');
    expect(sidekickMotionFromRun({ ...idle, runState: 'streaming', sawToken: true })).toBe('working');
    expect(sidekickMotionFromRun({ ...idle, runState: 'streaming', toolRunning: true })).toBe('working');
    expect(sidekickMotionFromRun({ ...idle, previous: 'working' })).toBe('done');
  });

  it('names needs-input and error ahead of a running turn', () => {
    expect(sidekickMotionFromRun({ ...idle, needsInput: true, runState: 'streaming', sawToken: true })).toBe('needs-input');
    expect(sidekickMotionFromRun({ ...idle, unreachable: true })).toBe('error');
    expect(sidekickMotionFromRun({ ...idle, runState: 'cancelling' })).toBe('error');
  });

  it('keeps each persona drawing under 25KB', () => {
    for (const name of ['nova', 'orion', 'patch', 'spark', 'zen', 'custom']) {
      const bytes = readFileSync(new URL(`../src/assets/sidekicks/animated/${name}.js`, import.meta.url)).byteLength;
      expect(bytes).toBeLessThanOrEqual(25 * 1024);
    }
  });
});
