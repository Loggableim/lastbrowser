const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');

test('browser runs with the mounted profile and the mount closes after browser exit', async t => {
  const { runProtectedSpaceProcess } = await import('../src/main/protected-space-process.ts');
  const root = await mkdtemp(path.join(tmpdir(), 'lastbrowser-space-child-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const entry = path.join(root, 'browser.cjs');
  const receipt = path.join(root, 'receipt');
  await writeFile(entry, 'require("node:fs").writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)))');
  let closed = false;
  const code = await runProtectedSpaceProcess(process.execPath, [entry, receipt], async () => ({
    root,
    closed: new Promise(() => {}),
    async close() {
      assert.deepEqual(JSON.parse(await readFile(receipt)), [
        `--user-data-dir=${root}`, `--lastbrowser-protected-profile=${root}`
      ]);
      closed = true;
    }
  }));
  assert.equal(code, 0);
  assert.equal(closed, true);
});

test('a disappeared mount terminates the child and reports the failure', async t => {
  const { runProtectedSpaceProcess } = await import('../src/main/protected-space-process.ts');
  const root = await mkdtemp(path.join(tmpdir(), 'lastbrowser-space-child-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const entry = path.join(root, 'browser.cjs');
  await writeFile(entry, 'setInterval(() => {}, 1000)');
  let cleanedUp = false;
  await assert.rejects(runProtectedSpaceProcess(process.execPath, [entry], async () => ({
    root,
    closed: Promise.resolve(),
    async close() { cleanedUp = true; }
  })), /mount closed/);
  assert.equal(cleanedUp, true);
});
