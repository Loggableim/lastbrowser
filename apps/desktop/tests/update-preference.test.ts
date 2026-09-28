import { describe, expect, it } from 'vitest';
import { resolveAutoUpdateCheckPreference } from '../src/renderer/update-preference.js';

describe('automatic update preference hydration', () => {
  it('does not overwrite the main-process setting before renderer settings hydrate', () => {
    expect(resolveAutoUpdateCheckPreference(null, false)).toBeNull();
    expect(resolveAutoUpdateCheckPreference(null, true)).toBeNull();
  });

  it('applies the hydrated value and defaults on only when a settings object exists', () => {
    expect(resolveAutoUpdateCheckPreference({ check_for_updates: false }, true)).toBe(false);
    expect(resolveAutoUpdateCheckPreference({ check_for_updates: true }, true)).toBe(true);
    expect(resolveAutoUpdateCheckPreference({}, true)).toBe(true);
  });
});
