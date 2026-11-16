// Run on a disposable TPM-capable Windows system with Node 24+ and TPM owner authorization.
// All keys, passwords, and files used here are newly generated test fixtures.
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { lstat, mkdir, mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');

async function main() {
  const [helperOrFlag, testAdapter] = process.argv.slice(2);
  const simulated = helperOrFlag === '--simulator';
  const nvKeyHelper = simulated ? testAdapter : helperOrFlag;
  if (process.platform !== 'win32' || process.argv.length !== (simulated ? 4 : 3)
    || !nvKeyHelper || !path.isAbsolute(nvKeyHelper)) {
    throw new Error('Supply the absolute path to the TPM helper, or --simulator and the test-only adapter');
  }
  const {
    createWindowsSpaceKeyProvider, createWindowsTpmNvSecretProvider, provisionWindowsTpmNvSlot
  } = await import('../dist/main/windows-space-key-provider.js');
  const { wrapSpaceKey, unwrapSpaceKey } = await import('../src/main/space-key-envelope.ts');
  const { createSpaceUnlock } = await import('../src/main/space-emergency-unlock.ts');
  const { removeRevokedPrimaryVault } = await import('../src/main/active-space-config.ts');
  const folder = await mkdtemp(path.join(tmpdir(), 'lastbrowser-key-replay-'));
  const source = path.join(folder, 'active-vaults.json');
  const snapshot = path.join(folder, 'before-emergency.json');
  const passwords = { primary: randomBytes(32), decoy: randomBytes(32) };
  const vaultKeys = { primary: randomBytes(32), decoy: randomBytes(32) };
  const wrapped = new Map();
  const provider = createWindowsSpaceKeyProvider(nvKeyHelper, wrapped);
  let primaryProvider;
  let phase = 'provisioning';

  async function protect(role) {
    const id = randomUUID();
    let binding;
    let secret;
    if (role === 'primary') {
      const nvSlot = await provisionWindowsTpmNvSlot(nvKeyHelper, passwords.primary);
      assert.deepEqual(Object.keys(nvSlot).sort(), ['index', 'salt']);
      binding = { nvSlot };
      primaryProvider = createWindowsTpmNvSecretProvider(nvKeyHelper, nvSlot);
      secret = await primaryProvider.readSecret(passwords.primary);
    } else {
      const sealed = await provider.create(id);
      wrapped.set(id, sealed);
      binding = { wrapped: sealed };
      secret = await provider.readSecret(id);
    }
    if (!secret) throw new Error('New Windows platform key is unavailable');
    try {
      return { id, ...binding, envelope: await wrapSpaceKey(vaultKeys[role], passwords[role], secret, id) };
    } finally {
      secret.fill(0);
    }
  }

  const sessions = [];
  function reopen(header) {
    const { primary, decoy } = JSON.parse(header);
    const restoredPrimary = createWindowsTpmNvSecretProvider(nvKeyHelper, primary.nvSlot);
    const restoredDecoy = createWindowsSpaceKeyProvider(nvKeyHelper, new Map([[decoy.id, decoy.wrapped]]));
    return createSpaceUnlock({
      primary, decoy, unwrapSpaceKey,
      provider: {
        async readSecret(id, password) {
          if (id === primary.id) return restoredPrimary.readSecret(password);
          return restoredDecoy.readSecret(id);
        },
        async revoke(id) {
          assert.equal(id, primary.id);
          await restoredPrimary.revoke();
          await removeRevokedPrimaryVault(folder, id);
        }
      },
      async lockPrimary() {},
      async openSpace(id, key) {
        const role = id === primary.id ? 'primary' : 'decoy';
        if (Buffer.compare(key, vaultKeys[role]) !== 0) throw new Error('Unexpected vault key');
        sessions.push(role);
      }
    });
  }

  try {
    const primary = await protect('primary');
    const decoy = await protect('decoy');
    const header = JSON.stringify({
      version: 3, state: 'active', primary, decoy: { ...decoy, wrappedPlatformSecret: decoy.wrapped }
    });
    const primaryDirectory = path.join(folder, primary.id);
    const decoyDirectory = path.join(folder, decoy.id);
    await mkdir(primaryDirectory);
    await mkdir(decoyDirectory);
    const ciphertext = 'synthetic ciphertext placeholder';
    await writeFile(path.join(primaryDirectory, 'vault-fixture'), ciphertext);
    await writeFile(source, header, { flag: 'wx' });
    await writeFile(snapshot, header, { flag: 'wx' });
    phase = 'baseline and emergency login';
    const login = reopen(await readFile(source, 'utf8'));
    assert.equal(await login(passwords.primary), true);
    assert.equal(await login(randomBytes(32)), false);
    assert.equal(await login(passwords.decoy), true);
    assert.deepEqual(sessions, ['primary', 'decoy']);
    await assert.rejects(lstat(primaryDirectory), { code: 'ENOENT' });
    assert.equal((await lstat(decoyDirectory)).isDirectory(), true);

    if (simulated) execFileSync(nvKeyHelper, ['power-cycle'], { windowsHide: true, stdio: 'ignore' });
    phase = 'restored application files';
    await writeFile(source, await readFile(snapshot));
    await mkdir(primaryDirectory);
    await writeFile(path.join(primaryDirectory, 'vault-fixture'), ciphertext);
    const restored = reopen(await readFile(source, 'utf8'));
    assert.equal(await restored(passwords.primary), false);
    assert.equal(await restored(passwords.decoy), true);
    assert.deepEqual(sessions, ['primary', 'decoy', 'decoy']);
    await assert.rejects(lstat(primaryDirectory), { code: 'ENOENT' });
    console.log(JSON.stringify({ simulatedTpm: simulated, oldApplicationFilesRejected: true, decoyReadable: true }));
  } catch {
    throw new Error(`The ${simulated ? 'simulated TPM' : 'physical TPM'} replay check failed during ${phase}`);
  } finally {
    for (const value of [...Object.values(passwords), ...Object.values(vaultKeys)]) value.fill(0);
    const tasks = [...wrapped.keys()].map(id => provider.revoke(id));
    if (primaryProvider) tasks.push(primaryProvider.revoke());
    const cleanup = await Promise.allSettled(tasks);
    await rm(folder, { recursive: true, force: true });
    if (cleanup.some(result => result.status === 'rejected')) {
      throw new Error('The Windows providers did not revoke every synthetic test key');
    }
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
