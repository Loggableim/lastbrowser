const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, rm, writeFile, rename } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');

test('renderer store replacement validates the new files before renaming the old store', async t => {
  const { replaceLegacyRendererStore } = await import('../src/main/legacy-renderer-db-replacement.ts');
  const root = await mkdtemp(path.join(tmpdir(), 'lastbrowser-renderer-swap-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const transactionId = randomUUID();
  const storage = path.join(root, 'Local Storage');
  const live = path.join(storage, 'leveldb');
  const next = path.join(storage, `.protected-next-${transactionId}`);
  const old = path.join(storage, `.protected-old-${transactionId}`);
  await mkdir(live, { recursive: true });
  await mkdir(next);
  await writeFile(path.join(live, 'data'), 'synthetic legacy data');
  await writeFile(path.join(next, 'data'), 'synthetic retained data');
  await assert.rejects(replaceLegacyRendererStore({ root, transactionId, async verify() {
    throw new Error('wrong renderer data');
  } }), /wrong renderer data/);
  assert.equal(await readFile(path.join(live, 'data'), 'utf8'), 'synthetic legacy data');
  await rename(live, old);

  const options = { root, transactionId, async verify(directory) {
    assert.equal(await readFile(path.join(directory, 'data'), 'utf8'), 'synthetic retained data');
  } };
  await replaceLegacyRendererStore(options);
  await replaceLegacyRendererStore(options);
  assert.equal(await readFile(path.join(live, 'data'), 'utf8'), 'synthetic retained data');
  await assert.rejects(readFile(path.join(old, 'data')), { code: 'ENOENT' });
});

test('staging writes only the sanitized snapshot and verifies the rebuilt database before adoption', async t => {
  const { stageLegacyRendererStore, replaceLegacyRendererStore } = await import('../src/main/legacy-renderer-db-replacement.ts');
  const root = await mkdtemp(path.join(tmpdir(), 'lastbrowser-renderer-prepare-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const transactionId = randomUUID();
  const leveldb = profile => path.join(profile, 'Local Storage', 'leveldb');
  const store = profile => path.join(leveldb(profile), 'data');
  const original = { scoped: 'secret fixture', shared: 'previous state', other: 'unrelated fixture' };
  const retained = { shared: 'retained state', other: 'unrelated fixture' };
  await mkdir(leveldb(root), { recursive: true });
  await writeFile(store(root), JSON.stringify(original));
  const options = {
    root, transactionId, journalKey: randomBytes(32),
    expectedLegacyValues: { scoped: 'secret fixture', shared: 'previous state' },
    legacyUpdates: { scoped: null, shared: 'retained state' },
    async read(profile) { return JSON.parse(await readFile(store(profile), 'utf8')); },
    async build(profile, entries) {
      assert.deepEqual(entries, retained);
      await mkdir(leveldb(profile), { recursive: true });
      await writeFile(store(profile), JSON.stringify(entries));
    }
  };
  await assert.rejects(stageLegacyRendererStore({
    ...options, expectedLegacyValues: { ...options.expectedLegacyValues, scoped: 'stale' }
  }), /changed since/);
  await assert.rejects(stageLegacyRendererStore({
    ...options, async read(profile) { return profile === root ? original : { ...retained, scoped: original.scoped }; }
  }), /expected renderer data/);
  const verify = await stageLegacyRendererStore(options);
  assert.deepEqual(JSON.parse(await readFile(store(root), 'utf8')), original);
  const staged = path.join(root, 'Local Storage', `.protected-next-${transactionId}`, 'data');
  await writeFile(staged, 'tampered');
  await assert.rejects(replaceLegacyRendererStore({ root, transactionId, verify }), /verified renderer database changed/);
  assert.deepEqual(JSON.parse(await readFile(store(root), 'utf8')), original);
  await writeFile(staged, JSON.stringify(retained));
  const resume = {
    ...options,
    async read() { assert.fail('retry never reopens the original renderer data'); },
    async build() { assert.fail('retry never creates a new LevelDB'); }
  };
  await assert.rejects(stageLegacyRendererStore({ ...resume, journalKey: randomBytes(32) }), /journal/);
  const resumed = await stageLegacyRendererStore(resume);
  await replaceLegacyRendererStore({ root, transactionId, verify: resumed });
  const afterSwap = await stageLegacyRendererStore(resume);
  await replaceLegacyRendererStore({ root, transactionId, verify: afterSwap });
  assert.deepEqual(JSON.parse(await readFile(store(root), 'utf8')), retained);
});
