const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

test('space key recovery requires the password, the device secret and the original space', async () => {
  const { wrapSpaceKey, unwrapSpaceKey } = await import('../src/main/space-key-envelope.ts');
  const key = randomBytes(32);
  const deviceSecret = randomBytes(32);
  const password = randomBytes(24);
  const spaceId = 'synthetic-primary';
  const envelope = await wrapSpaceKey(key, password, deviceSecret, spaceId);

  assert.deepEqual(await unwrapSpaceKey(envelope, password, deviceSecret, spaceId), key);
  assert.equal(await unwrapSpaceKey(envelope, randomBytes(24), deviceSecret, spaceId), null);
  assert.equal(await unwrapSpaceKey(envelope, password, randomBytes(32), spaceId), null);
  assert.equal(await unwrapSpaceKey(envelope, password, deviceSecret, 'synthetic-decoy'), null);
});

test('wraps use fresh salts and nonces and reject modified or malformed envelopes', async () => {
  const { wrapSpaceKey, unwrapSpaceKey } = await import('../src/main/space-key-envelope.ts');
  const key = randomBytes(32);
  const deviceSecret = randomBytes(32);
  const password = randomBytes(24);
  const spaceId = 'synthetic-primary';
  const first = await wrapSpaceKey(key, password, deviceSecret, spaceId);
  const second = await wrapSpaceKey(key, password, deviceSecret, spaceId);

  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.nonce, second.nonce);
  const changed = Buffer.from(first.ciphertext, 'base64');
  changed[0] ^= 1;
  assert.equal(await unwrapSpaceKey({ ...first, ciphertext: changed.toString('base64') }, password, deviceSecret, spaceId), null);
  assert.equal(await unwrapSpaceKey({ ...first, version: 2 }, password, deviceSecret, spaceId), null);
  assert.equal(await unwrapSpaceKey({ ...first, nonce: '' }, password, deviceSecret, spaceId), null);
});
test('TPM NV read authorization requires the password and matches only the selected salt', async () => {
  const { deriveTpmNvReadAuthorization } = await import('../src/main/space-key-envelope.ts');
  const password = randomBytes(24);
  const salt = randomBytes(16).toString('base64');
  const expected = await deriveTpmNvReadAuthorization(password, salt);
  assert.equal(expected.length, 32);
  assert.deepEqual(await deriveTpmNvReadAuthorization(password, salt), expected);
  assert.notDeepEqual(await deriveTpmNvReadAuthorization(randomBytes(24), salt), expected);
  assert.notDeepEqual(await deriveTpmNvReadAuthorization(password, randomBytes(16).toString('base64')), expected);
  assert.throws(() => deriveTpmNvReadAuthorization(password, 'wrong-salt'), /salt/);
});
