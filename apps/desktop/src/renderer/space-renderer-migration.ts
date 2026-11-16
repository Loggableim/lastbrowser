type StorageProposal = {
  protectedValues: Record<string, string>;
  legacyUpdates: Record<string, string | null>;
};
type StorageReader = { getItem(key: string): string | null };
type SpaceSelection = { profileId: string; sessionKey: string; spacePath: string; bookmarkIds: readonly string[] };

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid legacy renderer storage');
  }
  return value as Record<string, unknown>;
}

/** Collect an in-memory migration proposal without modifying the legacy shell. */
export function splitSpaceRendererStorage(
  source: StorageReader,
  selection: SpaceSelection
): StorageProposal {
  const { profileId, sessionKey, spacePath, bookmarkIds } = selection;
  if (!profileId || !sessionKey.startsWith(`${profileId}::`)) throw new Error('Invalid Space session selection');
  const protectedValues: Record<string, string> = {};
  const legacyUpdates: Record<string, string | null> = {};
  const home = spacePath === '' || spacePath === 'home';
  const activeProfileKey = 'lastbrowser.activeProfile.v1';
  const activeSpaceKey = 'lastbrowser.activeSpacePath.v1';
  protectedValues[activeProfileKey] = profileId;
  protectedValues[activeSpaceKey] = home ? '' : spacePath;
  if (source.getItem(activeProfileKey) === profileId) {
    legacyUpdates[activeProfileKey] = null;
    if (source.getItem(activeSpaceKey) !== null) legacyUpdates[activeSpaceKey] = null;
  }
  const profileKey = 'lastbrowser.profiles.v1';
  const profiles: unknown = JSON.parse(source.getItem(profileKey) ?? '[]');
  if (!Array.isArray(profiles)) throw new Error('Invalid legacy renderer profiles');
  const records = profiles.map(asRecord);
  const selectedProfile = records.filter(profile => profile.id === profileId);
  if (selectedProfile.length > 1) throw new Error('The browser profile selection is ambiguous');
  if (selectedProfile.length) {
    protectedValues[profileKey] = JSON.stringify(selectedProfile);
    legacyUpdates[profileKey] = JSON.stringify(records.filter(profile => profile.id !== profileId));
  }

  for (const key of ['lastbrowser.tabSessions.v1', 'lastbrowser.snapGroups.v1']) {
    const raw = source.getItem(key);
    if (raw === null) continue;
    const all = asRecord(JSON.parse(raw));
    const selectedKeys = home ? new Set([sessionKey, profileId]) : new Set([sessionKey]);
    const selected = Object.entries(all).filter(([entry]) => selectedKeys.has(entry));
    if (selected.length) {
      protectedValues[key] = JSON.stringify(Object.fromEntries(selected));
      legacyUpdates[key] = JSON.stringify(Object.fromEntries(Object.entries(all).filter(([entry]) => !selectedKeys.has(entry))));
    }
  }

  const snapshotKey = 'lastbrowser.sessionSnapshot.v1';
  const snapshotRaw = source.getItem(snapshotKey);
  if (snapshotRaw) {
    const snapshot = asRecord(JSON.parse(snapshotRaw));
    if (snapshot.profileId === profileId && (snapshot.spacePath ?? '') === (home ? '' : spacePath)) {
      protectedValues[snapshotKey] = JSON.stringify(snapshot);
      legacyUpdates[snapshotKey] = null;
    }
  }

  const bookmarkKey = 'lastbrowser.bookmarks.v1';
  const selectedIds = new Set(bookmarkIds);
  if (selectedIds.size !== bookmarkIds.length) throw new Error('Bookmark selection contains duplicate IDs');
  if (selectedIds.size) {
    const bookmarks: unknown = JSON.parse(source.getItem(bookmarkKey) ?? '[]');
    if (!Array.isArray(bookmarks)) throw new Error('Invalid legacy renderer bookmarks');
    const moved: Record<string, unknown>[] = [];
    const retained: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    for (const bookmark of bookmarks) {
      const value = asRecord(bookmark);
      if (typeof value.id === 'string' && selectedIds.has(value.id)) {
        if (seen.has(value.id)) throw new Error('Bookmark selection is ambiguous');
        seen.add(value.id);
        moved.push(value);
      } else {
        retained.push(value);
      }
    }
    if (seen.size !== selectedIds.size) throw new Error('Bookmark selection no longer matches the legacy browser');
    protectedValues[bookmarkKey] = JSON.stringify(moved);
    legacyUpdates[bookmarkKey] = JSON.stringify(retained);
  }

  return { protectedValues, legacyUpdates };
}

/** The shared browser store must be split once for both vaults. */
export function splitProtectedSpacePair(source: StorageReader, primary: SpaceSelection, decoy: SpaceSelection) {
  if (primary.profileId === decoy.profileId || primary.sessionKey === decoy.sessionKey) {
    throw new Error('The selected Spaces share browser profile data');
  }
  const assigned = new Set(primary.bookmarkIds);
  if (decoy.bookmarkIds.some(id => assigned.has(id))) throw new Error('A bookmark is assigned to both Spaces');
  const observed = new Map<string, string | null>();
  const snapshot: StorageReader = {
    getItem(key) {
      if (!observed.has(key)) observed.set(key, source.getItem(key));
      return observed.get(key) ?? null;
    }
  };
  const first = splitSpaceRendererStorage(snapshot, primary);
  const second = splitSpaceRendererStorage({
    getItem(key) {
      return Object.hasOwn(first.legacyUpdates, key) ? first.legacyUpdates[key] : snapshot.getItem(key);
    }
  }, decoy);
  const legacyUpdates = { ...first.legacyUpdates, ...second.legacyUpdates };
  return {
    rendererSeeds: { primary: first.protectedValues, decoy: second.protectedValues },
    legacyUpdates,
    expectedLegacyValues: Object.fromEntries(Object.keys(legacyUpdates).map(key => [key, observed.get(key) ?? null]))
  };
}

/** Apply only after both vaults were verified and the legacy renderer is exclusive. */
export function applyProtectedSpaceRendererRemovals(
  storage: StorageReader & { setItem(key: string, value: string): void; removeItem(key: string): void },
  proposal: Pick<ReturnType<typeof splitProtectedSpacePair>, 'expectedLegacyValues' | 'legacyUpdates'>
): void {
  const pending = Object.entries(proposal.legacyUpdates).filter(([key, value]) => {
    const current = storage.getItem(key);
    if (current === value) return false;
    if (current !== proposal.expectedLegacyValues[key]) {
      throw new Error('The legacy browser data changed since migration');
    }
    return true;
  });
  for (const [key, value] of pending) {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  }
}
