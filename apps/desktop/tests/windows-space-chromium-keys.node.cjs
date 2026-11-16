const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { mkdir, mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

test('Windows migration preserves Chromium key preferences without leaking other shared Local State data', async t => {
  const { readWindowsChromiumKeys, stageWindowsChromiumKeys } = await import('../src/main/windows-space-chromium-keys.ts');
  const root = await mkdtemp(path.join(tmpdir(), 'lastbrowser-chromium-keys-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vault = path.join(root, 'vault');
  await mkdir(vault);
  const shared = path.join(root, 'Local State');
  assert.equal(await readWindowsChromiumKeys(root), null);
  const os_crypt = { encrypted_key: randomBytes(48).toString('base64'), audit_enabled: true };
  await writeFile(shared, JSON.stringify({ os_crypt: { ...os_crypt, unexpected_field: 'unrelated' }, profile: { fixture: 'other Space' } }));
  const keys = await readWindowsChromiumKeys(root);
  assert.deepEqual(keys, { os_crypt });
  await stageWindowsChromiumKeys(vault, keys);
  await stageWindowsChromiumKeys(vault, keys);
  assert.deepEqual(JSON.parse(await readFile(path.join(vault, 'Local State'), 'utf8')), { os_crypt });
  const modified = { os_crypt: { ...keys.os_crypt, encrypted_key: randomBytes(48).toString('base64') } };
  await assert.rejects(stageWindowsChromiumKeys(vault, modified), /do not match/);
  await writeFile(shared, JSON.stringify({ os_crypt: { encrypted_key: 13 } }));
  await assert.rejects(readWindowsChromiumKeys(root), /Invalid Chromium/);
});
