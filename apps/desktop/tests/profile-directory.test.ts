import { mkdirSync, mkdtempSync, rmdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureProfileDirectory } from '../src/main/profile-directory.js';

describe('desktop profile directory', () => {
  let root: string;
  let legacyParent: string;
  let legacyDirectory: string;
  let hasLegacy: boolean;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-profile-directory-'));
    legacyParent = path.join(root, '@lastbrowser');
    legacyDirectory = path.join(legacyParent, 'desktop');
    hasLegacy = false;
  });

  afterEach(() => {
    if (hasLegacy) {
      rmdirSync(legacyDirectory);
      rmdirSync(legacyParent);
    }
    rmdirSync(root);
  });

  function fakeElectron(explicitProfile = false) {
    const app = {
      commandLine: { hasSwitch: vi.fn((name: string) => explicitProfile && name === 'user-data-dir') },
      getPath: vi.fn(() => root),
      setName: vi.fn(),
      setPath: vi.fn(),
    };
    configureProfileDirectory(app as unknown as Parameters<typeof configureProfileDirectory>[0]);
    return app;
  }

  it('names a fresh profile before resolving the data path for the first time', () => {
    const app = fakeElectron();
    expect(app.setName).toHaveBeenCalledExactlyOnceWith('Lastbrowser');
    expect(app.setName.mock.invocationCallOrder[0]).toBeLessThan(app.getPath.mock.invocationCallOrder[0]);
    expect(app.getPath).toHaveBeenCalledExactlyOnceWith('appData');
    expect(app.setPath).not.toHaveBeenCalled();
  });

  it('continues to use the legacy profile on upgrade', () => {
    mkdirSync(legacyDirectory, { recursive: true });
    hasLegacy = true;
    expect(fakeElectron().setPath).toHaveBeenCalledExactlyOnceWith('userData', legacyDirectory);
  });

  it('does not replace an explicitly provided user-data directory with an older profile', () => {
    mkdirSync(legacyDirectory, { recursive: true });
    hasLegacy = true;
    const app = fakeElectron(true);
    expect(app.getPath).not.toHaveBeenCalled();
    expect(app.setPath).not.toHaveBeenCalled();
  });
});
