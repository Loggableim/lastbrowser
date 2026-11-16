const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

function requestFrame(primary, emergency, document) {
  const header = Buffer.alloc(12);
  const payload = Buffer.from(JSON.stringify(document), 'utf8');
  header.writeUInt32BE(primary.length, 0);
  header.writeUInt32BE(emergency.length, 4);
  header.writeUInt32BE(payload.length, 8);
  return Buffer.concat([header, primary, emergency, payload]);
}

const proposal = {
  primarySpaceId: 'first', decoySpaceId: 'second', rendererSeeds: { primary: {}, decoy: {} },
  rendererStore: { expectedLegacyValues: { example: 'before' }, legacyUpdates: { example: null } }
};

test('the migration request carries an explicit local storage mode', async () => {
  const { encodeWindowsSpaceMigrationRequest, readWindowsSpaceMigrationRequest } = await import('../src/main/windows-space-migration-request.ts');
  const selected = { ...proposal, protection: 'local' };
  const frame = encodeWindowsSpaceMigrationRequest(selected, Buffer.from([1]), Buffer.from([2]));
  const request = await readWindowsSpaceMigrationRequest(Readable.from([frame]));
  try {
    assert.equal(request.proposal.protection, 'local');
  } finally {
    request.clearPasswords();
  }
  assert.throws(() => encodeWindowsSpaceMigrationRequest({ ...proposal, protection: 'unknown' },
    Buffer.from([1]), Buffer.from([2])), /Invalid protected Space migration request/);
});

test('migration request accepts binary passwords over a fragmented inherited pipe', async () => {
  const { encodeWindowsSpaceMigrationRequest, readWindowsSpaceMigrationRequest } = await import('../src/main/windows-space-migration-request.ts');
  const primary = Buffer.from([10, 0, 255]);
  const emergency = Buffer.from([13, 10, 4]);
  const frame = encodeWindowsSpaceMigrationRequest(proposal, primary, emergency);
  const result = await readWindowsSpaceMigrationRequest(Readable.from([
    frame.subarray(0, 3), frame.subarray(3, 16), frame.subarray(16)
  ]));
  try {
    assert.deepEqual(result.primaryPassword, primary);
    assert.deepEqual(result.emergencyPassword, emergency);
    assert.deepEqual(result.proposal, proposal);
    assert.ok(frame.every(value => value === 0));
  } finally {
    result.clearPasswords();
  }
  assert.ok(result.primaryPassword.every(value => value === 0));
  assert.ok(result.emergencyPassword.every(value => value === 0));
});

test('migration request rejects truncation, extra bytes, invalid fields and empty or oversized passwords', async () => {
  const { readWindowsSpaceMigrationRequest } = await import('../src/main/windows-space-migration-request.ts');
  const one = Buffer.from([1]);
  const two = Buffer.from([2]);
  const valid = requestFrame(one, two, proposal);
  const invalid = [
    Buffer.from(valid.subarray(0, -1)),
    Buffer.concat([valid, one]),
    requestFrame(one, two, { ...proposal, primarySpaceId: proposal.decoySpaceId }),
    requestFrame(one, two, { ...proposal, rendererSeeds: { primary: { a: 1 }, decoy: {} } }),
    requestFrame(one, two, { ...proposal, added: true }),
    requestFrame(one, two, { ...proposal, rendererStore: { ...proposal.rendererStore, expectedLegacyValues: {} } }),
    requestFrame(Buffer.alloc(0), two, proposal),
    requestFrame(Buffer.alloc(4097, 3), two, proposal)
  ];
  for (const frame of invalid) {
    await assert.rejects(readWindowsSpaceMigrationRequest(Readable.from([frame])), /Invalid protected Space migration request/);
    assert.ok(frame.every(value => value === 0));
  }
});

test('the offline step waits for the previous process and rejects a writer that stays alive', async t => {
  const { waitForPreviousBrowserExit } = await import('../src/main/windows-space-migration-request.ts');
  await assert.rejects(waitForPreviousBrowserExit(process.pid, 0), /still running/);
  const browser = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  t.after(() => browser.kill());
  await once(browser, 'spawn');
  const closed = once(browser, 'exit');
  let ready = false;
  const offline = waitForPreviousBrowserExit(browser.pid).then(() => { ready = true; });
  await new Promise(resolve => setTimeout(resolve, 125));
  assert.equal(ready, false);
  browser.kill();
  await closed;
  await offline;
  assert.equal(ready, true);
});
