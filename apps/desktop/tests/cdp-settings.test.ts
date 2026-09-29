import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cdpPreferencePath, loadCdpPreference, saveCdpPreference } from '../src/main/cdp-settings.js';

describe('persisted browser automation preference', () => {
  const roots: string[] = [];
  const makeRoot = () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-cdp-pref-'));
    roots.push(root);
    return root;
  };

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('defaults to disabled and persists an explicit opt-in as a complete JSON file', () => {
    const root = makeRoot();
    expect(loadCdpPreference(root)).toEqual({ enabled: false });
    expect(saveCdpPreference(root, { enabled: true })).toEqual({ enabled: true });
    expect(loadCdpPreference(root)).toEqual({ enabled: true });
    expect(JSON.parse(readFileSync(cdpPreferencePath(root), 'utf8'))).toEqual({ enabled: true });
  });

  it('fails closed for malformed or unexpected persisted values', () => {
    const root = makeRoot();
    writeFileSync(cdpPreferencePath(root), '{broken');
    expect(loadCdpPreference(root)).toEqual({ enabled: false });
    writeFileSync(cdpPreferencePath(root), JSON.stringify({ enabled: 'yes' }));
    expect(loadCdpPreference(root)).toEqual({ enabled: false });
  });
});
