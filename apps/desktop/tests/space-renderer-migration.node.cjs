const { test } = require('node:test');
const assert = require('node:assert/strict');

test('renderer migration moves only the selected Space and explicitly assigned bookmarks', async () => {
  const { splitSpaceRendererStorage } = await import('../src/renderer/space-renderer-migration.ts');
  const source = new Map([
    ['lastbrowser.tabSessions.v1', JSON.stringify({
      'one::first': { tabs: ['selected fixture'] }, 'two::second': { tabs: ['unrelated fixture'] }
    })],
    ['lastbrowser.bookmarks.v1', JSON.stringify([{ id: 'move' }, { id: 'keep' }])],
    ['lastbrowser.sessionSnapshot.v1', JSON.stringify({ profileId: 'two', spacePath: 'second' })]
  ]);
  const proposal = splitSpaceRendererStorage({ getItem: key => source.get(key) ?? null }, {
    profileId: 'one', sessionKey: 'one::first', spacePath: 'first', bookmarkIds: ['move']
  });
  assert.deepEqual(JSON.parse(proposal.protectedValues['lastbrowser.tabSessions.v1']), {
    'one::first': { tabs: ['selected fixture'] }
  });
  assert.deepEqual(JSON.parse(proposal.legacyUpdates['lastbrowser.tabSessions.v1']), {
    'two::second': { tabs: ['unrelated fixture'] }
  });
  assert.deepEqual(JSON.parse(proposal.protectedValues['lastbrowser.bookmarks.v1']), [{ id: 'move' }]);
  assert.deepEqual(JSON.parse(proposal.legacyUpdates['lastbrowser.bookmarks.v1']), [{ id: 'keep' }]);
  assert.equal(proposal.protectedValues['lastbrowser.sessionSnapshot.v1'], undefined);
  assert.equal(proposal.legacyUpdates['lastbrowser.sessionSnapshot.v1'], undefined);
  assert.match(source.get('lastbrowser.bookmarks.v1'), /move/);
});

test('a missing bookmark or malformed legacy input prevents migration', async () => {
  const { splitSpaceRendererStorage } = await import('../src/renderer/space-renderer-migration.ts');
  const choice = { profileId: 'one', sessionKey: 'one::first', spacePath: 'first', bookmarkIds: ['move'] };
  assert.throws(() => splitSpaceRendererStorage({ getItem: () => null }, choice), /Bookmark selection/);
  assert.throws(() => splitSpaceRendererStorage({ getItem: () => '[]' }, choice), /legacy renderer/);
});

test('the legacy remainder excludes both selected Spaces and preserves unrelated records', async () => {
  const { splitProtectedSpacePair, applyProtectedSpaceRendererRemovals } = await import('../src/renderer/space-renderer-migration.ts');
  const tabs = 'lastbrowser.tabSessions.v1';
  const bookmarks = 'lastbrowser.bookmarks.v1';
  const profiles = 'lastbrowser.profiles.v1';
  const activeProfile = 'lastbrowser.activeProfile.v1';
  const activeSpace = 'lastbrowser.activeSpacePath.v1';
  const source = {
    [tabs]: JSON.stringify({ 'a::first': { tabs: ['a'] }, 'b::second': { tabs: ['b'] }, 'c::other': { tabs: ['c'] } }),
    [bookmarks]: JSON.stringify([{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
    [profiles]: JSON.stringify([{ id: 'a', name: 'primary' }, { id: 'b', name: 'decoy' }, { id: 'c', name: 'other' }]),
    [activeProfile]: 'a',
    [activeSpace]: 'first'
  };
  const storage = {
    getItem: key => source[key] ?? null,
    setItem: (key, value) => { source[key] = value; },
    removeItem: key => { delete source[key]; }
  };
  const primary = { profileId: 'a', sessionKey: 'a::first', spacePath: 'first', bookmarkIds: ['a'] };
  const decoy = { profileId: 'b', sessionKey: 'b::second', spacePath: 'second', bookmarkIds: ['b'] };
  const pair = splitProtectedSpacePair(storage, primary, decoy);
  assert.deepEqual(JSON.parse(pair.rendererSeeds.primary[tabs]), { 'a::first': { tabs: ['a'] } });
  assert.deepEqual(JSON.parse(pair.rendererSeeds.decoy[tabs]), { 'b::second': { tabs: ['b'] } });
  assert.deepEqual(JSON.parse(pair.legacyUpdates[tabs]), { 'c::other': { tabs: ['c'] } });
  assert.deepEqual(JSON.parse(pair.legacyUpdates[bookmarks]), [{ id: 'c' }]);
  assert.deepEqual(JSON.parse(pair.rendererSeeds.primary[profiles]), [{ id: 'a', name: 'primary' }]);
  assert.deepEqual(JSON.parse(pair.legacyUpdates[profiles]), [{ id: 'c', name: 'other' }]);
  assert.equal(pair.legacyUpdates[activeProfile], null);
  assert.equal(pair.legacyUpdates[activeSpace], null);
  assert.equal(pair.expectedLegacyValues[tabs], source[tabs]);
  assert.throws(() => splitProtectedSpacePair(storage, primary, { ...decoy, bookmarkIds: ['a'] }), /assigned to both/);
  source[bookmarks] = '[]';
  assert.throws(() => applyProtectedSpaceRendererRemovals(storage, pair), /changed/);
  assert.equal(source[tabs], pair.expectedLegacyValues[tabs]);
  source[bookmarks] = pair.expectedLegacyValues[bookmarks];
  applyProtectedSpaceRendererRemovals(storage, pair);
  applyProtectedSpaceRendererRemovals(storage, pair);
  assert.deepEqual(JSON.parse(source[tabs]), { 'c::other': { tabs: ['c'] } });
  assert.deepEqual(JSON.parse(source[bookmarks]), [{ id: 'c' }]);
});
