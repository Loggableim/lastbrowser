const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const path = require('node:path');

test('a protected mount refuses an occupied root before starting the vault helper', {
  skip: process.platform !== 'win32'
}, async () => {
  const { mountWindowsSpaceVault } = await import('../src/main/windows-space-vault.ts');
  const systemRoot = path.parse(process.execPath).root;
  await assert.rejects(mountWindowsSpaceVault({
    java: process.execPath, libraryDirectory: __dirname, initializerSource: __filename,
    vaultDirectory: path.dirname(process.execPath),
    drive: systemRoot, vaultId: randomUUID(),
    key: randomBytes(32)
  }), /unused drive/);
});

test('a plain directory cannot be treated as an encrypted backing store', {
  skip: process.platform !== 'win32'
}, async () => {
  const { mountWindowsSpaceVault } = await import('../src/main/windows-space-vault.ts');
  const { existsSync } = require('node:fs');
  const drive = [...'ZYXWVUTSRQPONMLKJIHGFED'].map(letter => `${letter}:\\`).find(root => !existsSync(root));
  assert.ok(drive, 'An unused test drive is required');
  await assert.rejects(mountWindowsSpaceVault({
    java: process.execPath, libraryDirectory: __dirname, initializerSource: __filename,
    vaultDirectory: __dirname,
    drive, vaultId: randomUUID(),
    key: randomBytes(32)
  }), /vault configuration/);
});
