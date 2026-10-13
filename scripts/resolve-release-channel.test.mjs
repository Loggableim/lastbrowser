import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveReleaseChannel } from './resolve-release-channel.mjs';

test('stable 0.1.56 uses the latest feed and a regular release', () => {
  assert.deepEqual(resolveReleaseChannel('v0.1.56', '0.1.56'), {
    channel: 'latest', prerelease: false, version: '0.1.56',
  });
});

test('first 0.1.57 beta uses the beta feed and prerelease status', () => {
  assert.deepEqual(resolveReleaseChannel('v0.1.57-beta.1', '0.1.57-beta.1'), {
    channel: 'beta', prerelease: true, version: '0.1.57-beta.1',
  });
});

test('later beta versions remain supported', () => {
  assert.equal(resolveReleaseChannel('v0.1.58-beta.1', '0.1.58-beta.1').channel, 'beta');
});

test('rejects beta tags for 0.1.56 and mismatched package versions', () => {
  assert.throws(() => resolveReleaseChannel('v0.1.56-beta.1', '0.1.56-beta.1'), /0\.1\.57 line/);
  assert.throws(() => resolveReleaseChannel('v0.1.57-beta.1', '0.1.57'), /does not match/);
});

test('rejects unsupported prerelease forms', () => {
  assert.throws(() => resolveReleaseChannel('v0.1.57-rc.1', '0.1.57-rc.1'), /Unsupported release tag/);
});
