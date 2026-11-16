// node smoke-space-vault-initializer.cjs <java path> <Cryptomator jar directory> [--mount]
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { existsSync } = require('node:fs');
const { mkdir, mkdtemp, readFile, readdir, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');

async function main() {
  const [java, libraryDirectory, mode] = process.argv.slice(2);
  if (!java || !libraryDirectory || !path.isAbsolute(java) || !path.isAbsolute(libraryDirectory)) {
    throw new Error('Pass the absolute Java and Cryptomator library paths');
  }
  const { initializeWindowsSpaceVault } = await import('../src/main/windows-space-vault-initializer.ts');
  const root = await mkdtemp(path.join(tmpdir(), 'lastbrowser-real-vault-init-'));
  const vaultId = randomUUID();
  const key = randomBytes(32);
  const vaultDirectory = path.join(root, 'synthetic-vault');
  const marker = Buffer.from(vaultId);
  const options = {
    java, libraryDirectory, vaultDirectory, vaultId, key,
    initializerSource: path.join(__dirname, 'InitializeSpaceVault.java')
  };
  const payload = Buffer.from(`Synthetic WinFsp test file ${randomUUID()}`);
  try {
    await initializeWindowsSpaceVault(options);
    if (mode === '--mount') await verifyMountPersistence(options, payload);
    const entries = await readdir(vaultDirectory, { recursive: true, withFileTypes: true });
    assert.ok(entries.some(entry => entry.name === 'masterkey.cryptomator'));
    assert.ok(entries.some(entry => entry.name === 'vault.cryptomator'));
    assert.ok(entries.some(entry => entry.isFile() && entry.name.endsWith('.c9r')));
    for (const entry of entries.filter(item => item.isFile())) {
      const bytes = await readFile(path.join(entry.parentPath, entry.name));
      assert.notEqual(bytes.includes(marker), true, 'The vault identity leaked into plaintext');
      assert.notEqual(bytes.includes(key), true, 'The volume passphrase leaked into plaintext');
      assert.notEqual(bytes.includes(key.toString('hex')), true, 'The volume passphrase leaked as hex');
      assert.notEqual(bytes.includes(payload), true, 'The test file leaked into plaintext');
    }
    console.log('Fresh vault created and reopened using only its wrapped master key');
  } finally {
    key.fill(0);
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyMountPersistence(options, payload) {
  const { mountWindowsSpaceVault } = await import('../src/main/windows-space-vault.ts');
  const drive = [...'ZYXWVUTSRQPONMLKJIHGFED'].map(letter => `${letter}:\\`).find(root => !existsSync(root));
  assert.ok(drive, 'An unused drive letter is required');
  const fresh = await mountWindowsSpaceVault({ ...options, drive, preparingProfile: true });
  try {
    await mkdir(path.join(fresh.root, 'profile'));
    await writeFile(path.join(fresh.root, 'profile', 'synthetic-marker'), payload);
  } finally {
    await fresh.close();
  }
  assert.equal(existsSync(drive), false);
  const reopened = await mountWindowsSpaceVault({ ...options, drive });
  try {
    assert.deepEqual(await readFile(path.join(reopened.root, 'synthetic-marker')), payload);
  } finally {
    await reopened.close();
  }
  assert.equal(existsSync(drive), false);
  console.log('WinFsp mount preserved the test file across unmount and reopen');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
