const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');

test('startup finds the one installed pair and blocks incomplete or ambiguous migration', async t => {
  const { findWindowsProtectedPair } = await import('../src/main/active-space-config.ts');
  const profile = await mkdtemp(path.join(tmpdir(), 'lastbrowser-protected-startup-'));
  t.after(() => rm(profile, { recursive: true, force: true }));
  assert.equal(await findWindowsProtectedPair(profile), null);
  const setupLock = path.join(profile, '.protected-space-setup.lock');
  await writeFile(setupLock, '');
  await assert.rejects(findWindowsProtectedPair(profile), /in progress/);
  await rm(setupLock);
  const root = path.join(profile, 'protected-spaces');
  const pair = path.join(root, 'space-pair-first');
  await mkdir(pair, { recursive: true });
  await writeFile(path.join(pair, 'prepared-vaults.json'), '{}');
  await assert.rejects(findWindowsProtectedPair(profile), /in progress/);
  await writeFile(path.join(pair, 'active-vaults.json'), '{}');
  assert.equal(await findWindowsProtectedPair(profile), pair);
  const second = path.join(root, 'space-pair-second');
  await mkdir(second);
  await writeFile(path.join(second, 'prepared-vaults.json'), '{}');
  await assert.rejects(findWindowsProtectedPair(profile), /in progress/);
  await writeFile(path.join(second, 'active-vaults.json'), '{}');
  await assert.rejects(findWindowsProtectedPair(profile), /multiple active/i);
  await rm(second, { recursive: true });
  await symlink(profile, second, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(findWindowsProtectedPair(profile), /redirected/);
});

test('active configuration uses only vault paths inside the selected pair', async t => {
  const { loadActiveSpaceConfiguration, removeRevokedPrimaryVault } = await import('../src/main/active-space-config.ts');
  const pair = await mkdtemp(path.join(tmpdir(), 'lastbrowser-active-pair-'));
  t.after(() => rm(pair, { recursive: true, force: true }));
  const configuration = path.join(pair, 'active-vaults.json');
  const vault = () => ({
    id: randomUUID(), envelope: { version: 1 },
    wrappedPlatformSecret: randomBytes(256).toString('base64')
  });
  const primary = { ...vault(), nvSlot: { index: '01504142', salt: randomBytes(16).toString('base64') } };
  const decoy = vault();
  await mkdir(path.join(pair, primary.id));
  await mkdir(path.join(pair, decoy.id));
  const payload = { version: 3, state: 'active', primary, decoy };
  await writeFile(configuration, JSON.stringify({ ...payload, version: 2 }));
  await assert.rejects(loadActiveSpaceConfiguration(pair), /not active/);
  await writeFile(configuration, JSON.stringify({
    ...payload, primary: { ...primary, nvSlot: { ...primary.nvSlot, authorization: randomBytes(32).toString('base64') } }
  }));
  await assert.rejects(loadActiveSpaceConfiguration(pair), /not active/);
  await writeFile(configuration, JSON.stringify({ ...payload, state: 'prepared' }));
  await assert.rejects(loadActiveSpaceConfiguration(pair), /not active/);
  await writeFile(configuration, JSON.stringify({
    ...payload, primary: { ...primary, vaultDirectory: path.dirname(pair) }
  }));
  const selected = await loadActiveSpaceConfiguration(pair);
  assert.equal(selected.primary.vaultDirectory, path.join(pair, primary.id));
  await writeFile(configuration, JSON.stringify({ ...payload, decoy: primary }));
  await assert.rejects(loadActiveSpaceConfiguration(pair), /not active/);
  await writeFile(configuration, JSON.stringify(payload));
  await writeFile(path.join(pair, primary.id, 'ciphertext'), 'synthetic encrypted fixture');
  await writeFile(path.join(pair, decoy.id, 'keep'), 'synthetic decoy fixture');
  await symlink(path.join(pair, decoy.id), path.join(pair, primary.id, 'redirect'),
    process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(removeRevokedPrimaryVault(pair, decoy.id), /identity/);
  await removeRevokedPrimaryVault(pair, primary.id);
  await assert.rejects(lstat(path.join(pair, primary.id)), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(pair, decoy.id, 'keep'), 'utf8'), 'synthetic decoy fixture');
  await removeRevokedPrimaryVault(pair, primary.id);
  assert.equal((await loadActiveSpaceConfiguration(pair)).decoy.id, decoy.id);
  assert.equal((await loadActiveSpaceConfiguration(pair)).primary.vaultDirectory, path.join(pair, primary.id));
  await symlink(path.dirname(pair), path.join(pair, primary.id), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(loadActiveSpaceConfiguration(pair), /redirected/);
  await assert.rejects(removeRevokedPrimaryVault(pair, primary.id), /redirected/);
  await assert.rejects(removeRevokedPrimaryVault(pair, '../outside'), /identity/);
  assert.equal((await readFile(configuration, 'utf8')).length > 0, true);
});
