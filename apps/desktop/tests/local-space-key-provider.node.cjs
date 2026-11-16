const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { mkdtemp, readFile, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');

test('the emergency password deletes the live local key while a pre-revocation backup still works', async t => {
  const { createLocalSpaceKeyProvider } = await import('../src/main/local-space-key-provider.ts');
  const { createSpaceUnlock } = await import('../src/main/space-emergency-unlock.ts');
  const { wrapSpaceKey, unwrapSpaceKey } = await import('../src/main/space-key-envelope.ts');
  const root = await mkdtemp(path.join(tmpdir(), 'lastbrowser-local-key-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const provider = createLocalSpaceKeyProvider(root);
  async function makeVault() {
    const id = randomUUID();
    const password = randomBytes(32);
    const key = randomBytes(32);
    const secret = await provider.create(id);
    try {
      return { id, password, key, envelope: await wrapSpaceKey(key, password, secret, id) };
    } finally { secret.fill(0); }
  }
  const primary = await makeVault();
  const decoy = await makeVault();
  const keyPath = path.join(root, `space-key-${primary.id}.bin`);
  const backup = await readFile(keyPath);
  const opened = [];
  const unlock = createSpaceUnlock({
    primary, decoy, provider, unwrapSpaceKey, async lockPrimary() {},
    async openSpace(id, key) {
      assert.deepEqual(key, id === primary.id ? primary.key : decoy.key);
      opened.push(id);
    }
  });
  assert.equal(await unlock(primary.password), true);
  assert.equal(await unlock(randomBytes(32)), false);
  assert.equal(await unlock(decoy.password), true);
  assert.equal(await provider.readSecret(primary.id), null);
  assert.equal(await unlock(primary.password), false);
  assert.deepEqual(opened, [primary.id, decoy.id]);
  await writeFile(keyPath, backup, { flag: 'wx' });
  assert.equal(await unlock(primary.password), true);
});
