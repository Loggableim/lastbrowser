import { describe, expect, it } from 'vitest';
import { setStartupUpdateNoticeHidden, shouldShowStartupUpdateNotice, startupUpdateNoticeKey } from '../src/renderer/update-notice.js';

describe('startup update notice preference', () => {
  it('hides only the startup notice and can be restored', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(shouldShowStartupUpdateNotice(storage)).toBe(true);
    expect(setStartupUpdateNoticeHidden(storage, true)).toBe(true);
    expect(shouldShowStartupUpdateNotice(storage)).toBe(false);
    expect([...values.keys()]).toEqual([startupUpdateNoticeKey]);
    expect(setStartupUpdateNoticeHidden(storage, false)).toBe(true);
    expect(shouldShowStartupUpdateNotice(storage)).toBe(true);
  });

  it('reports storage failures without breaking the update UI', () => {
    const storage = { getItem: () => { throw new Error('restricted'); }, setItem: () => { throw new Error('quota'); } };
    expect(shouldShowStartupUpdateNotice(storage)).toBe(true);
    expect(setStartupUpdateNoticeHidden(storage, true)).toBe(false);
  });
});
