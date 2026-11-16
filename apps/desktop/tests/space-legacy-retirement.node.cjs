const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');

test('legacy retirement requires validation and removes only the named stores', async t => {
  const { retireMigratedSpaceStores } = await import('../src/main/space-legacy-retirement.ts');
  const root = await mkdtemp(path.join(tmpdir(), 'lastbrowser-retire-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const legacy = path.join(root, 'selected');
  const unrelated = path.join(root, 'other-space');
  await writeFile(legacy, 'synthetic migrated data');
  await writeFile(unrelated, 'synthetic unrelated data');
  const options = { root, transactionId: randomUUID(), stores: [legacy], journalKey: randomBytes(32) };
  await assert.rejects(retireMigratedSpaceStores({
    ...options, stores: [legacy, path.join(legacy, 'nested')], async verifyCopies() {}
  }), /Overlapping/);
  await assert.rejects(retireMigratedSpaceStores({ ...options, async verifyCopies() {
    throw new Error('copies unverified');
  } }), /copies unverified/);
  assert.equal(await readFile(legacy, 'utf8'), 'synthetic migrated data');
  let verified = 0;
  await retireMigratedSpaceStores({ ...options, async verifyCopies() { verified++; } });
  await assert.rejects(readFile(legacy), { code: 'ENOENT' });
  assert.equal(await readFile(unrelated, 'utf8'), 'synthetic unrelated data');
  await retireMigratedSpaceStores({ ...options, async verifyCopies() { verified++; } });
  assert.equal(verified, 1);
  await assert.rejects(retireMigratedSpaceStores({
    ...options, stores: [unrelated], async verifyCopies() {}
  }), /journal does not match/);
  await writeFile(legacy, 'synthetic data recreated later');
  await assert.rejects(retireMigratedSpaceStores({ ...options, async verifyCopies() {} }), /reappeared/);
  assert.equal(await readFile(legacy, 'utf8'), 'synthetic data recreated later');
});
