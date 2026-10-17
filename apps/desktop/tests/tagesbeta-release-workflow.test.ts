import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'tagesbeta.yml');
const docPath = path.join(repoRoot, 'docs', 'tagesbeta-release.md');

describe('tagesbeta unsigned release pipeline', () => {
  it('documents unsigned beta builds separately from signed stable tags', () => {
    expect(existsSync(docPath)).toBe(true);
    const doc = readFileSync(docPath, 'utf8');
    expect(doc).toContain('unsigned');
    expect(doc).toContain('beta.yml');
    expect(doc).toContain('release.md');
  });

  it('exposes a manual workflow that skips signing and publishes draft prereleases', () => {
    expect(existsSync(workflowPath)).toBe(true);
    const workflow = readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain('workflow_dispatch');
    expect(workflow).toContain('CSC_IDENTITY_AUTO_DISCOVERY');
    expect(workflow).toContain('--publish never');
    expect(workflow).toContain('signAndEditExecutable=false');
    expect(workflow).toContain('draft: true');
    expect(workflow).toContain('prerelease: true');
    expect(workflow).toContain('resolve-release-channel.mjs');
  });
});
