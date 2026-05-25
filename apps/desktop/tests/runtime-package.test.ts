import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('desktop runtime packaging', () => {
  it('runs the Python runtime preparation before Windows packaging', () => {
    const packageJson = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.scripts['prepare:python']).toBe('node scripts/prepare-python-runtime.mjs');
    expect(packageJson.scripts['package:win']).toContain('npm run prepare:python');
  });

  it('ships the prepared Python runtime as an Electron resource', () => {
    const packageJson = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.build.extraResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'runtime/python',
          to: 'runtime/python'
        })
      ])
    );
  });

  it('uses branded NSIS resources for the assisted installer', () => {
    const packageJson = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.build.nsis).toMatchObject({
      installerHeader: 'build/installerHeader.bmp',
      installerSidebar: 'build/installerSidebar.bmp',
      uninstallerSidebar: 'build/installerSidebar.bmp',
      include: 'build/installer.nsh'
    });
  });
});
