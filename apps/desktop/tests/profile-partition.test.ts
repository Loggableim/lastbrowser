import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { profilePartition, defaultProfileId } from '../src/renderer/profiles.js';
import { computeSpacePartition } from '../src/renderer/App.js';

const appSource = readFileSync(path.resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8');

describe('browser profile integration contract', () => {
  it('imports the profile module', () => {
    expect(appSource).toMatch(/from\s+['"]\.\/profiles\.js['"]/);
  });

  it('uses a dynamic partition for the webview', () => {
    // The partition must be derived from the active profile and space, not hardcoded.
    const dynamicPartition = /partition=\{?[^}\n]*(?:profilePartition|computeSpacePartition)[^}\n]*\}?/;
    expect(appSource).toMatch(dynamicPartition);
  });

  it('does not contain the old hardcoded partition', () => {
    expect(appSource).not.toContain('persist:lastbrowser-main');
  });

  it('renders a profile switcher', () => {
    expect(appSource).toMatch(/<ProfileSwitcher\b/);
  });
});

describe('profilePartition helper', () => {
  it('produces distinct partitions per profile', () => {
    const a = profilePartition('profile-1');
    const b = profilePartition('profile-2');
    expect(a).not.toBe(b);
    expect(a.startsWith('persist:')).toBe(true);
    expect(b.startsWith('persist:')).toBe(true);
  });

  it('produces a stable partition for the default profile', () => {
    expect(profilePartition(defaultProfileId)).toBe('persist:profile-default');
  });
});

describe('computeSpacePartition helper', () => {
  it('returns in-memory-incognito when incognito is true', () => {
    expect(computeSpacePartition('default', 'home', true)).toBe('in-memory-incognito');
  });

  it('creates isolated persistent partition per space and profile', () => {
    const home = computeSpacePartition('p1', 'home');
    const work = computeSpacePartition('p1', 'firma');
    expect(home).toBe('persist:space_home_p1');
    expect(work).toBe('persist:space_firma_p1');
    expect(home).not.toBe(work);
  });

  it('defaults to home when spacePath is empty or null', () => {
    expect(computeSpacePartition('p1', '')).toBe('persist:space_home_p1');
    expect(computeSpacePartition('p1', null)).toBe('persist:space_home_p1');
  });
});
