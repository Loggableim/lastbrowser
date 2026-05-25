import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const desktopPackagePath = path.join(repoRoot, 'apps', 'desktop', 'package.json');
const rootPackagePath = path.join(repoRoot, 'package.json');
const releaseWorkflowPath = path.join(repoRoot, '.github', 'workflows', 'release.yml');
const releaseDocPath = path.join(repoRoot, 'docs', 'release.md');

function readJson(file: string): Record<string, any> {
  return JSON.parse(readFileSync(file, 'utf8'));
}

describe('GitHub release auto-update flow', () => {
  it('configures electron-builder GitHub publishing for Lastbrowser releases', () => {
    const pkg = readJson(desktopPackagePath);

    expect(pkg.dependencies['electron-updater']).toBeTruthy();
    expect(pkg.scripts['package:win:publish']).toContain('--publish always');
    expect(pkg.build.publish).toEqual([
      {
        provider: 'github',
        owner: 'Loggableim',
        repo: 'lastbrowser',
        releaseType: 'release'
      }
    ]);
  });

  it('exposes a root release command for the Windows GitHub release build', () => {
    const pkg = readJson(rootPackagePath);

    expect(pkg.scripts['release:win']).toBe('npm --workspace apps/desktop run package:win:publish');
  });

  it('builds and publishes Windows updater artifacts from version tags', () => {
    expect(existsSync(releaseWorkflowPath)).toBe(true);
    const workflow = readFileSync(releaseWorkflowPath, 'utf8');

    expect(workflow).toContain("tags: ['v*']");
    expect(workflow).toContain('contents: write');
    expect(workflow).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(workflow).toContain('npm --workspace apps/desktop run package:win:publish');
  });

  it('documents the tag-based GitHub Releases flow and required update metadata', () => {
    expect(existsSync(releaseDocPath)).toBe(true);
    const docs = readFileSync(releaseDocPath, 'utf8');

    expect(docs).toContain('latest.yml');
    expect(docs).toContain('v0.1.4');
    expect(docs).toContain('GitHub Releases');
  });
});
