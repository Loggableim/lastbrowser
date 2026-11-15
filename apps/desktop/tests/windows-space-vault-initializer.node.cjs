const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readdir, rm } = require('node:fs/promises');
const { randomBytes, randomUUID } = require('node:crypto');
const { tmpdir } = require('node:os');
const path = require('node:path');

test('a failed vault initialization leaves no published or staging directory', {
  skip: process.platform !== 'win32'
}, async t => {
  const { initializeWindowsSpaceVault } = await import('../src/main/windows-space-vault-initializer.ts');
  const root = await mkdtemp(path.join(tmpdir(), 'lastbrowser-vault-init-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vault = path.join(root, 'vault');
  const options = {
    java: process.execPath,
    libraryDirectory: root,
    initializerSource: path.join(root, 'missing.java'),
    vaultDirectory: vault,
    vaultId: randomUUID(),
    key: randomBytes(32)
  };
  await assert.rejects(initializeWindowsSpaceVault(options), /could not be initialized/);
  assert.deepEqual(await readdir(root), []);
  await mkdir(vault);
  await assert.rejects(initializeWindowsSpaceVault(options), /already exists/);
  assert.deepEqual(await readdir(root), ['vault']);
});
