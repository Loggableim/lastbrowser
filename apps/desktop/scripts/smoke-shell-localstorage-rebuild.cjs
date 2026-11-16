// Windows only. Pass an Electron executable that can run isolated fixtures.
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { mkdir, mkdtemp, readFile, readdir, rm, stat } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');

async function contains(store, marker) {
  for (const file of await readdir(store, { withFileTypes: true })) {
    if (file.isFile() && (await readFile(path.join(store, file.name))).includes(marker)) return true;
  }
  return false;
}

async function main() {
  const electron = process.argv[2];
  if (process.platform !== 'win32' || !electron || !path.isAbsolute(electron)) {
    throw new Error('Pass the absolute path of a Windows Electron executable');
  }
  const root = await mkdtemp(path.join(tmpdir(), 'lastbrowser-shell-store-'));
  try {
    const { replaceLegacyRendererStore, stageLegacyRendererStore } = await import('../src/main/legacy-renderer-db-replacement.ts');
    const { createRendererStoreWorker } = await import('../dist/main/renderer-store-worker-client.js');
    const worker = createRendererStoreWorker(electron, [path.join(__dirname, '..')]);
    const legacy = path.join(root, 'legacy');
    const empty = path.join(root, 'empty');
    await mkdir(legacy);
    await mkdir(empty);
    await worker.build(empty, {});
    assert.deepEqual(await worker.read(empty), {});
    assert.equal((await stat(path.join(empty, 'Local Storage', 'leveldb'))).isDirectory(), true);
    const removed = randomUUID();
    const retained = randomUUID();
    const bookmarks = 'lastbrowser.bookmarks.v1';
    const before = { [bookmarks]: JSON.stringify([{ id: removed }, { id: retained }]), unrelated: randomUUID() };
    const after = { ...before, [bookmarks]: JSON.stringify([{ id: retained }]) };
    await worker.build(legacy, before);
    assert.deepEqual(await worker.read(legacy), before);
    await assert.rejects(worker.build(legacy, after));
    const live = path.join(legacy, 'Local Storage', 'leveldb');
    assert.equal(await contains(live, removed), true);
    const transactionId = randomUUID();
    const verifyDatabase = await stageLegacyRendererStore({
      root: legacy, transactionId, journalKey: randomBytes(32),
      expectedLegacyValues: { [bookmarks]: before[bookmarks] }, legacyUpdates: { [bookmarks]: after[bookmarks] },
      ...worker
    });
    await replaceLegacyRendererStore({ root: legacy, transactionId, async verify(store) {
      await verifyDatabase(store);
      assert.equal(await contains(store, removed), false);
      assert.equal(await contains(store, retained), true);
    } });
    assert.deepEqual(await worker.read(legacy), after);
    console.log('Replaced Chromium LevelDB retained selected fixtures across restart and excluded removed fixtures on disk');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
