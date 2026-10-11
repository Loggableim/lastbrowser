import { describe, expect, it } from 'vitest';
import { isOpenCodeLoginBusyInScope } from '../src/renderer/provider-settings.js';

describe('OpenCode login profile scoping', () => {
  const profileA = { browserProfileId: 'profile-a', workspacePath: null, backendProfileName: 'profile_a' };
  const profileB = { browserProfileId: 'profile-b', workspacePath: null, backendProfileName: 'profile_b' };

  it('blocks duplicate login only in the profile that owns the running login', () => {
    expect(isOpenCodeLoginBusyInScope('running', profileA, profileA)).toBe(true);
    expect(isOpenCodeLoginBusyInScope('running', profileA, profileB)).toBe(false);
    expect(isOpenCodeLoginBusyInScope('starting', profileA, profileB)).toBe(false);
    expect(isOpenCodeLoginBusyInScope('connected', profileA, profileA)).toBe(false);
  });
});
