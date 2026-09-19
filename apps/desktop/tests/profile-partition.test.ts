import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { profilePartition, defaultProfileId } from '../src/renderer/profiles.js';

const appSource = readFileSync(path.resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8');

describe('browser profile integration contract', () => {
  it('imports the profile module', () => {
    expect(appSource).toMatch(/from\s+['"]\.\/profiles\.js['"]/);
  });

  it('uses a dynamic partition for the webview', () => {
    // The partition must be derived from the active profile, not hardcoded.
    const dynamicPartition = /partition=\{?[^}\n]*profilePartition[^}\n]*\}?/;
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
