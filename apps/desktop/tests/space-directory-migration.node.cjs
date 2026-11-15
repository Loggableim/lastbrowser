const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, rm, symlink, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

test('stages and verifies an offline storage tree without changing the legacy data', async t => {
  const { stageSpaceDirectory } = await import('../src/main/space-directory-migration.ts');
  const root = await mkdtemp(join(tmpdir(), 'lastbrowser-migration-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const legacy = join(root, 'legacy');
  const mounted = join(root, 'mounted');
  await mkdir(join(legacy, 'Network'), { recursive: true });
  await mkdir(mounted);
  await writeFile(join(legacy, 'Network', 'Cookies'), 'synthetic cookie fixture');
  await writeFile(join(legacy, 'state.db-wal'), 'synthetic WAL fixture');

  await stageSpaceDirectory(legacy, mounted, 'protected-space');
  for (const relative of [join('Network', 'Cookies'), 'state.db-wal']) {
    assert.deepEqual(await readFile(join(mounted, 'protected-space', relative)), await readFile(join(legacy, relative)));
  }
  await assert.rejects(stageSpaceDirectory(legacy, mounted, 'protected-space'), /already exists/);
});

test('refuses to copy a junction pointing outside the selected legacy tree', async t => {
  const { stageSpaceDirectory } = await import('../src/main/space-directory-migration.ts');
  const root = await mkdtemp(join(tmpdir(), 'lastbrowser-migration-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const legacy = join(root, 'legacy');
  const mounted = join(root, 'mounted');
  await mkdir(legacy);
  await mkdir(mounted);
  await symlink(mounted, join(legacy, 'external'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(stageSpaceDirectory(legacy, mounted, 'protected-space'), /unsupported entry/i);
  await assert.rejects(readFile(join(mounted, 'protected-space', 'external')), { code: 'ENOENT' });
});

test('stages the selected stores as a single protected profile', async t => {
  const { stageSpaceProfile } = await import('../src/main/space-directory-migration.ts');
  const root = await mkdtemp(join(tmpdir(), 'lastbrowser-migration-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const legacy = join(root, 'legacy');
  const mounted = join(root, 'mounted');
  await mkdir(join(legacy, 'browser'), { recursive: true });
  await mkdir(join(legacy, 'sidekick'));
  await mkdir(mounted);
  await writeFile(join(legacy, 'browser', 'Cookies'), 'synthetic browser');
  await writeFile(join(legacy, 'sidekick', 'state.db'), 'synthetic sidekick');
  await writeFile(join(legacy, 'history'), 'synthetic history');
  const stores = [
    { source: join(legacy, 'browser'), target: join('chromium', 'Partitions', 'test') },
    { source: join(legacy, 'sidekick'), target: join('runtime', 'profiles', 'test') },
    { source: join(legacy, 'history'), target: join('browser-history', 'test.json') },
    { source: join(legacy, 'missing'), target: join('password-vault', 'test.json'), optional: true }
  ];
  const profile = await stageSpaceProfile(legacy, mounted, stores);
  assert.equal(profile, join(mounted, 'profile'));
  assert.equal(await readFile(join(profile, stores[0].target, 'Cookies'), 'utf8'), 'synthetic browser');
  assert.equal(await readFile(join(profile, stores[1].target, 'state.db'), 'utf8'), 'synthetic sidekick');
  assert.equal(await readFile(join(profile, stores[2].target), 'utf8'), 'synthetic history');
  assert.equal(await readFile(stores[2].source, 'utf8'), 'synthetic history');
  assert.equal(await stageSpaceProfile(legacy, mounted, stores), profile);
  await writeFile(stores[2].source, 'edited after staging');
  await assert.rejects(stageSpaceProfile(legacy, mounted, stores), /does not match/);
});

test('a failed store copy publishes no partial protected profile', async t => {
  const { stageSpaceProfile } = await import('../src/main/space-directory-migration.ts');
  const root = await mkdtemp(join(tmpdir(), 'lastbrowser-migration-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const legacy = join(root, 'legacy');
  const mounted = join(root, 'mounted');
  await mkdir(legacy);
  await mkdir(mounted);
  await writeFile(join(legacy, 'first'), 'synthetic source');
  await assert.rejects(stageSpaceProfile(legacy, mounted, [
    { source: join(legacy, 'first'), target: 'first' },
    { source: join(legacy, 'missing'), target: 'second' }
  ]), { code: 'ENOENT' });
  await assert.rejects(readFile(join(mounted, 'profile', 'first')), { code: 'ENOENT' });
  assert.equal(await readFile(join(legacy, 'first'), 'utf8'), 'synthetic source');
});
