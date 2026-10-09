import { readFileSync } from 'node:fs';
import path from 'node:path';
import { minimatch } from 'minimatch';
import { expect, it } from 'vitest';

it('retains in-tree service sources, excludes private data, and omits the unqualified local runtime', () => {
  const manifest = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
  const resource = manifest.build.extraResources.find((entry: { to: string }) => entry.to === 'services');
  const included = (file: string) => resource.filter.some((pattern: string) =>
    !pattern.startsWith('!') && minimatch(file, pattern, { dot: true })) &&
    !resource.filter.some((pattern: string) =>
      pattern.startsWith('!') && minimatch(file, pattern.slice(1), { dot: true }));

  for (const file of ['sidekick/runtime/independent/manager.py', 'sidekick/web/api/routes.py']) {
    expect(included(file), file).toBe(true);
  }
  for (const file of [
    'sidekick/state.db', 'sidekick/state.db-shm', 'sidekick/state.db-wal',
    'sidekick/.test-profile/auth.json', 'sidekick/.test-profile/config.yaml',
    'sidekick/models/router.gguf'
  ]) {
    expect(included(file), file).toBe(false);
  }
  expect(manifest.build.extraResources.some((entry: { from: string; to: string }) =>
    entry.from === 'runtime/local-ai/b11377-cpu' || entry.to === 'apps/desktop/runtime/local-ai/b11377-cpu')).toBe(false);
});
