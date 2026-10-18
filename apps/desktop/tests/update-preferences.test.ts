import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isUpdateChannel,
  loadUpdatePreferences,
  saveUpdatePreferences,
  updatePreferencePath
} from '../src/main/update-preferences.js';

const directories: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'lastbrowser-update-prefs-'));
  directories.push(dir);
  return dir;
}

describe('update preferences', () => {
  afterEach(() => {
    for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('defaults to the stable channel when no preference file exists', () => {
    expect(loadUpdatePreferences(tempDir())).toEqual({ channel: 'stable' });
  });

  it('round-trips the selected channel', () => {
    const dir = tempDir();
    expect(saveUpdatePreferences(dir, { channel: 'beta' })).toEqual({ channel: 'beta' });
    expect(loadUpdatePreferences(dir)).toEqual({ channel: 'beta' });
  });

  it('falls back to stable for corrupt or unsupported channel values', () => {
    const dir = tempDir();
    writeFileSync(updatePreferencePath(dir), '{not json');
    expect(loadUpdatePreferences(dir)).toEqual({ channel: 'stable' });
    writeFileSync(updatePreferencePath(dir), JSON.stringify({ channel: 'nightly' }));
    expect(loadUpdatePreferences(dir)).toEqual({ channel: 'stable' });
    expect(saveUpdatePreferences(dir, { channel: 'nightly' as never })).toEqual({ channel: 'stable' });
  });

  it('writes the preference atomically and privately', () => {
    const dir = tempDir();
    saveUpdatePreferences(dir, { channel: 'beta' });
    expect(readdirSync(dir)).toEqual(['update-preferences.json']);
    expect(statSync(updatePreferencePath(dir)).mode & 0o777).toBe(0o600);
  });

  it('accepts only the two shipped channels', () => {
    expect(isUpdateChannel('stable')).toBe(true);
    expect(isUpdateChannel('beta')).toBe(true);
    expect(isUpdateChannel('latest')).toBe(false);
    expect(isUpdateChannel(undefined)).toBe(false);
  });
});
