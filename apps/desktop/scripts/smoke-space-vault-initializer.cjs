// node smoke-space-vault-initializer.cjs <java path> <Cryptomator jar directory>
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { mkdtemp, readFile, readdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');

async function main() {
  const [java, libraryDirectory] = process.argv.slice(2);
  if (!java || !libraryDirectory || !path.isAbsolute(java) || !path.isAbsolute(libraryDirectory)) {
    throw new Error('Pass the absolute Java and Cryptomator library paths');
  }
  const { initializeWindowsSpaceVault } = await import('../src/main/windows-space-vault-initializer.ts');
  const root = await mkdtemp(path.join(tmpdir(), 'lastbrowser-real-vault-init-'));
  const vaultId = randomUUID();
  const key = randomBytes(32);
  const vaultDirectory = path.join(root, 'synthetic-vault');
  const marker = Buffer.from(vaultId);
  try {
    await initializeWindowsSpaceVault({
      java, libraryDirectory, vaultDirectory, vaultId, key,
      initializerSource: path.join(__dirname, 'InitializeSpaceVault.java')
    });
    const entries = await readdir(vaultDirectory, { recursive: true, withFileTypes: true });
    assert.ok(entries.some(entry => entry.name === 'masterkey.cryptomator'));
    assert.ok(entries.some(entry => entry.name === 'vault.cryptomator'));
    assert.ok(entries.some(entry => entry.isFile() && entry.name.endsWith('.c9r')));
    for (const entry of entries.filter(item => item.isFile())) {
      const bytes = await readFile(path.join(entry.parentPath, entry.name));
      assert.notEqual(bytes.includes(marker), true, 'The vault identity leaked into plaintext');
      assert.notEqual(bytes.includes(key), true, 'The volume passphrase leaked into plaintext');
      assert.notEqual(bytes.includes(key.toString('hex')), true, 'The volume passphrase leaked as hex');
    }
    console.log('Fresh vault created and reopened using only its wrapped master key');
  } finally {
    key.fill(0);
    await rm(root, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
