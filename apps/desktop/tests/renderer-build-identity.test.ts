import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { rendererBuildIdentity } from '../scripts/renderer-build-identity.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'lastbrowser-build-identity-'));
  roots.push(root);
  for (const dir of ['apps/desktop/src/nested', 'brand/assets']) mkdirSync(path.join(root, dir), { recursive: true });
  for (const file of ['apps/desktop/src/nested/App.tsx', 'brand/assets/icon.svg', 'apps/desktop/package.json', 'apps/desktop/vite.config.ts']) {
    writeFileSync(path.join(root, file), file);
  }
  return root;
}
it('hashes source snapshots without Git metadata deterministically', () => {
  const root = fixture();
  expect(rendererBuildIdentity(root)).toMatch(/^[a-f0-9]{64}$/);
  expect(rendererBuildIdentity(root)).toBe(rendererBuildIdentity(root));
});
it.each(['apps/desktop/src/nested/App.tsx', 'brand/assets/icon.svg', 'apps/desktop/package.json', 'apps/desktop/vite.config.ts'])(
  'changes build identity when %s changes', (file) => {
    const root = fixture();
    const before = rendererBuildIdentity(root);
    writeFileSync(path.join(root, file), 'changed');
    expect(rendererBuildIdentity(root)).not.toBe(before);
  },
);
it('does not include unrelated output or Git state', () => {
  const root = fixture();
  const before = rendererBuildIdentity(root);
  mkdirSync(path.join(root, 'output'));
  writeFileSync(path.join(root, 'output/report.json'), 'report');
  writeFileSync(path.join(root, '.git'), 'snapshot has no repository');
  expect(rendererBuildIdentity(root)).toBe(before);
});
