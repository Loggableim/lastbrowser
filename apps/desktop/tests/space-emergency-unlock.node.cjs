const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

async function fixture() {
  const { wrapSpaceKey, unwrapSpaceKey } = await import('../src/main/space-key-envelope.ts');
  const { createSpaceUnlock } = await import('../src/main/space-emergency-unlock.ts');
  const primaryPassword = randomBytes(24);
  const emergencyPassword = randomBytes(24);
  const secrets = new Map();
  async function configure(id, password) {
    const secret = randomBytes(32);
    secrets.set(id, secret);
    return { id, envelope: await wrapSpaceKey(randomBytes(32), password, secret, id) };
  }
  const primary = await configure('synthetic-primary', primaryPassword);
  const decoy = await configure('synthetic-decoy', emergencyPassword);
  const events = [];
  const mainReadAttempts = [];
  const provider = {
    async readSecret(id, password) {
      if (id === primary.id) {
        mainReadAttempts.push(Boolean(password && Buffer.from(password).equals(primaryPassword)));
        if (!mainReadAttempts.at(-1)) return null;
      }
      return secrets.has(id) ? Buffer.from(secrets.get(id)) : null;
    },
    async revoke(id) {
      events.push('revoke');
      secrets.delete(id);
    }
  };
  const resolveUnlock = (overrides = {}) => createSpaceUnlock({
    primary, decoy, provider, unwrapSpaceKey,
    async lockPrimary() { events.push('lock'); },
    async openSpace(id) { events.push(id); },
    ...overrides
  });
  return { primaryPassword, emergencyPassword, provider, resolveUnlock, events, mainReadAttempts };
}

test('emergency unlock revokes the primary before opening the decoy and rejects a restored envelope', async () => {
  const space = await fixture();
  const login = space.resolveUnlock();
  assert.equal(await login(randomBytes(24)), false);
  assert.deepEqual(space.events, []);
  assert.equal(await login(space.primaryPassword), true);
  assert.equal(await login(space.emergencyPassword), true);
  assert.deepEqual(space.mainReadAttempts, [false, true]);
  assert.deepEqual(space.events, ['synthetic-primary', 'lock', 'revoke', 'synthetic-decoy']);

  // Recreate the coordinator with the original app files and the current
  // device state. This is a software simulation of the hardware replay gate.
  const reopened = space.resolveUnlock();
  assert.equal(await reopened(space.primaryPassword), false);
  assert.equal(await reopened(space.emergencyPassword), true);
  assert.equal(space.events.at(-1), 'synthetic-decoy');
});

test('a failed revocation does not grant an emergency session', async () => {
  const space = await fixture();
  space.provider.revoke = async () => { throw new Error('synthetic device failure'); };
  await assert.rejects(space.resolveUnlock()(space.emergencyPassword), /synthetic device failure/);
  assert.deepEqual(space.events, ['lock']);
});

test('opening the decoy can be retried after interruption without restoring the primary', async () => {
  const space = await fixture();
  const firstAttempt = space.resolveUnlock({
    async openSpace() { throw new Error('synthetic mount failure'); }
  });
  await assert.rejects(firstAttempt(space.emergencyPassword), /synthetic mount failure/);
  const reopened = space.resolveUnlock();
  assert.equal(await reopened(space.primaryPassword), false);
  assert.equal(await reopened(space.emergencyPassword), true);
  assert.equal(space.events.at(-1), 'synthetic-decoy');
});
