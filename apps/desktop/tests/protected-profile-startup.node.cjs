const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm, symlink } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');

function fakeApp(root, protectedProfile, environment = {}) {
  const paths = {};
  const switches = { 'user-data-dir': root, 'lastbrowser-protected-profile': protectedProfile };
  return {
    paths, environment,
    commandLine: {
      hasSwitch: name => Object.hasOwn(switches, name),
      getSwitchValue: name => switches[name] ?? ''
    },
    getPath: name => paths[name] ?? root,
    setName() {},
    setPath(name, value) { paths[name] = value; }
  };
}

test('protected bootstrap routes Chromium, downloads and process temporary files under one root', async t => {
  const { configureProfileDirectory } = await import('../src/main/profile-directory.ts');
  const root = await mkdtemp(path.join(tmpdir(), 'lastbrowser-protected-start-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const app = fakeApp(root, root, { LASTBROWSER_ENABLE_CDP: '1', LASTBROWSER_CDP_PORT: '9222', CDP_PORT: '9222' });
  configureProfileDirectory(app, app.environment);
  assert.equal(app.paths.userData, root);
  assert.equal(app.paths.sessionData, path.join(root, 'chromium'));
  assert.equal(app.paths.downloads, path.join(root, 'downloads'));
  assert.equal(app.paths.crashDumps, path.join(root, 'crash-dumps'));
  assert.equal(app.paths.temp, path.join(root, 'temp'));
  assert.equal(app.environment.TMP, app.paths.temp);
  assert.equal(app.environment.TEMP, app.paths.temp);
  assert.equal(app.environment.LASTBROWSER_ENABLE_CDP, undefined);
  assert.equal(app.environment.LASTBROWSER_CDP_PORT, undefined);
  assert.equal(app.environment.CDP_PORT, undefined);
});

test('protected bootstrap refuses a mismatched user-data root or an external path junction', async t => {
  const { configureProfileDirectory } = await import('../src/main/profile-directory.ts');
  const root = await mkdtemp(path.join(tmpdir(), 'lastbrowser-protected-start-'));
  const external = await mkdtemp(path.join(tmpdir(), 'lastbrowser-unprotected-'));
  t.after(() => Promise.all([root, external].map(value => rm(value, { recursive: true, force: true }))));
  assert.throws(() => configureProfileDirectory(fakeApp(root, external)), /must match/);
  const debugging = fakeApp(root, root);
  const hasSwitch = debugging.commandLine.hasSwitch;
  debugging.commandLine.hasSwitch = name => name === 'remote-debugging-port' || hasSwitch(name);
  assert.throws(() => configureProfileDirectory(debugging), /Remote debugging/);
  await symlink(external, path.join(root, 'chromium'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => configureProfileDirectory(fakeApp(root, root)), /escapes the protected profile/);
});
