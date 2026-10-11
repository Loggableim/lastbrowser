import { describe, expect, it } from 'vitest';
import { createStartupLaunchIconSelector, startupLaunchIconIds } from '../src/main/startup-launch-state.js';
import { startupIconIds } from '../src/renderer/startup/startup-screen-state.js';

describe('Main-owned startup launch icon', () => {
  it('uses all six shared icon ids and keeps one selection for the process lifetime', () => {
    const selected = startupLaunchIconIds.map((_, index) => {
      let calls = 0;
      const choose = createStartupLaunchIconSelector((maxExclusive) => {
        calls += 1;
        expect(maxExclusive).toBe(6);
        return index;
      });
      const first = choose();
      expect(choose()).toBe(first);
      expect(calls).toBe(1);
      return first;
    });
    expect(selected).toEqual(startupIconIds);
  });

  it('rejects an invalid index instead of caching a broken launch choice', () => {
    const choose = createStartupLaunchIconSelector(() => 6);
    expect(choose).toThrow(RangeError);
  });
});
