/**
 * Per-profile tab persistence.
 *
 * Every browser profile keeps its own set of tabs, so switching profiles
 * restores that profile's browsing session instead of sharing one global
 * tab list.
 */
import type { BrowserTab } from './tabs.js';
import { getDefaultSnapLayoutRatios, SNAP_LAYOUT_DEFINITIONS, type SnapLayoutRatios, type SnapLayoutType } from './types/snap-layouts.js';

export type ProfileTabState = {
  tabs: BrowserTab[];
  activeTabId: string | null;
};

export const tabSessionsStorageKey = 'lastbrowser.tabSessions.v1';
export const snapGroupsStorageKey = 'lastbrowser.snapGroups.v1';

/** Serializable occupied panes for one profile/Space. Array positions pair. */
export type PersistedSnapGroup = {
  layout: SnapLayoutType;
  tabIds: string[];
  slotIndexes: number[];
  ratios?: SnapLayoutRatios;
};

type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'setItem'>;
type ReadWriteStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function emptyTabState(): ProfileTabState {
  return { tabs: [], activeTabId: null };
}

export function computeSpaceSessionKey(profileId: string, spacePath?: string | null): string {
  const safeSpace = (spacePath || 'home').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  return `${profileId}::${safeSpace}`;
}

export function computeSpacePartition(profileId: string, spacePath?: string | null, incognito?: boolean): string {
  if (incognito) return 'in-memory-incognito';
  const safeSpace = (spacePath || 'home').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  return `persist:space_${safeSpace}_${profileId}`;
}

export function loadSpaceSnapGroup(
  profileId: string,
  spacePath: string | null | undefined,
  availableTabIds: string[],
  storage: ReadStorage = window.localStorage
): PersistedSnapGroup | null {
  const all = readSnapGroups(storage);
  const entry = all[computeSpaceSessionKey(profileId, spacePath)];
  return normalizeSnapGroup(entry, availableTabIds);
}

export function saveSpaceSnapGroup(
  profileId: string,
  spacePath: string | null | undefined,
  group: PersistedSnapGroup | null,
  availableTabIds: string[],
  storage: ReadWriteStorage = window.localStorage
): void {
  const all = readSnapGroups(storage);
  const key = computeSpaceSessionKey(profileId, spacePath);
  const normalized = normalizeSnapGroup(group, availableTabIds);
  if (normalized) all[key] = normalized;
  else delete all[key];
  storage.setItem(snapGroupsStorageKey, JSON.stringify(all));
}

function readSnapGroups(storage: ReadStorage): Record<string, unknown> {
  const raw = storage.getItem(snapGroupsStorageKey);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function normalizeSnapGroup(entry: unknown, availableTabIds: string[]): PersistedSnapGroup | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const candidate = entry as Partial<PersistedSnapGroup>;
  const layout = candidate.layout;
  if (typeof layout !== 'string' || !Object.hasOwn(SNAP_LAYOUT_DEFINITIONS, layout) || layout === 'single') return null;
  if (!Array.isArray(candidate.tabIds) || !Array.isArray(candidate.slotIndexes)) return null;
  const available = new Set(availableTabIds);
  const seenTabs = new Set<string>();
  const seenSlots = new Set<number>();
  const tabIds: string[] = [];
  const slotIndexes: number[] = [];
  const capacity = SNAP_LAYOUT_DEFINITIONS[layout as SnapLayoutType].slots.length;
  for (let i = 0; i < Math.min(candidate.tabIds.length, candidate.slotIndexes.length); i += 1) {
    const id = candidate.tabIds[i];
    const slot = candidate.slotIndexes[i];
    if (typeof id !== 'string' || !id.trim() || !available.has(id) || seenTabs.has(id)) continue;
    if (!Number.isInteger(slot) || (slot as number) < 0 || (slot as number) >= capacity || seenSlots.has(slot as number)) continue;
    seenTabs.add(id);
    seenSlots.add(slot as number);
    tabIds.push(id);
    slotIndexes.push(slot as number);
  }
  if (!tabIds.length) return null;
  const snapLayout = layout as SnapLayoutType;
  const ratios = normalizeSnapRatios(candidate.ratios, snapLayout);
  return { layout: snapLayout, tabIds, slotIndexes, ratios };
}

function normalizeSnapRatios(value: unknown, layout: SnapLayoutType): SnapLayoutRatios {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return getDefaultSnapLayoutRatios(layout);
  const candidate = value as Partial<SnapLayoutRatios>;
  const defaults = getDefaultSnapLayoutRatios(layout);
  const normalizeAxis = (input: unknown, fallback: number[]): number[] => {
    if (!Array.isArray(input) || input.length !== fallback.length) return fallback;
    return input.map((ratio, index) => {
      if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return fallback[index];
      return Math.min(95, Math.max(5, ratio));
    });
  };
  const x = normalizeAxis(candidate.x, defaults.x);
  const y = normalizeAxis(candidate.y, defaults.y);
  // Multi-divider layouts must remain ordered with at least a 5% pane between dividers.
  if (layout === 'trio-columns' && x[1] <= x[0] + 4) return { x: defaults.x, y };
  return { x, y };
}

export function loadProfileTabs(
  profileId: string,
  storage: ReadStorage = window.localStorage
): ProfileTabState {
  const all = readAll(storage);
  const entry = all[profileId];
  if (!entry) return emptyTabState();
  return normalizeTabState(entry);
}

export function loadSpaceTabs(
  profileId: string,
  spacePath?: string | null,
  storage: ReadStorage = window.localStorage
): ProfileTabState {
  const key = computeSpaceSessionKey(profileId, spacePath);
  const all = readAll(storage);
  const entry = all[key];
  if (!entry) {
    if (!spacePath || spacePath === 'home') {
      const legacyEntry = all[profileId];
      if (legacyEntry) return normalizeTabState(legacyEntry);
    }
    return emptyTabState();
  }
  return normalizeTabState(entry);
}

export function saveProfileTabs(
  profileId: string,
  state: ProfileTabState,
  storage: WriteStorage = window.localStorage
): void {
  const all = readAll(storage as unknown as ReadStorage);
  const persistableTabs = state.tabs.filter((tab) => !tab.incognito);
  all[profileId] = {
    tabs: persistableTabs.map((tab) => ({ ...tab })),
    activeTabId: persistableTabs.some((t) => t.id === state.activeTabId)
      ? state.activeTabId
      : (persistableTabs[0]?.id ?? null)
  };
  storage.setItem(tabSessionsStorageKey, JSON.stringify(all));
}

export function saveSpaceTabs(
  profileId: string,
  spacePath: string | null | undefined,
  state: ProfileTabState,
  storage: WriteStorage = window.localStorage
): void {
  const key = computeSpaceSessionKey(profileId, spacePath);
  const all = readAll(storage as unknown as ReadStorage);
  const persistableTabs = state.tabs.filter((tab) => !tab.incognito);
  all[key] = {
    tabs: persistableTabs.map((tab) => ({ ...tab })),
    activeTabId: persistableTabs.some((t) => t.id === state.activeTabId)
      ? state.activeTabId
      : (persistableTabs[0]?.id ?? null)
  };
  storage.setItem(tabSessionsStorageKey, JSON.stringify(all));
}

export function getSpaceTabCount(
  profileId: string,
  spacePath: string | null | undefined,
  storage: ReadStorage = window.localStorage
): number {
  const state = loadSpaceTabs(profileId, spacePath, storage);
  return state.tabs.length;
}

export function removeProfileTabs(
  profileId: string,
  storage: ReadWriteStorage = window.localStorage
): void {
  const all = readAll(storage);
  if (!(profileId in all)) return;
  delete all[profileId];
  storage.setItem(tabSessionsStorageKey, JSON.stringify(all));
}

export const sessionSnapshotStorageKey = 'lastbrowser.sessionSnapshot.v1';

export type SessionSnapshot = {
  timestamp: number;
  profileId: string;
  state: ProfileTabState;
};

export function saveSessionSnapshot(
  profileId: string,
  state: ProfileTabState,
  storage: WriteStorage = window.localStorage
): void {
  const persistableTabs = state.tabs.filter((tab) => !tab.incognito);
  if (!persistableTabs.length) return;
  const snapshot: SessionSnapshot = {
    timestamp: Date.now(),
    profileId,
    state: {
      tabs: persistableTabs.map((tab) => ({ ...tab })),
      activeTabId: persistableTabs.some((t) => t.id === state.activeTabId)
        ? state.activeTabId
        : (persistableTabs[0]?.id ?? null)
    }
  };
  storage.setItem(sessionSnapshotStorageKey, JSON.stringify(snapshot));
}

export function loadSessionSnapshot(
  profileId?: string,
  storage: ReadStorage = window.localStorage
): SessionSnapshot | null {
  const raw = storage.getItem(sessionSnapshotStorageKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const candidate = parsed as Partial<SessionSnapshot>;
    if (typeof candidate.timestamp !== 'number' || !candidate.profileId || !candidate.state) {
      return null;
    }
    if (profileId && candidate.profileId !== profileId) {
      return null;
    }
    const normalizedState = normalizeTabState(candidate.state);
    if (!normalizedState.tabs.length) return null;
    return {
      timestamp: candidate.timestamp,
      profileId: candidate.profileId,
      state: normalizedState
    };
  } catch {
    return null;
  }
}

export function clearSessionSnapshot(
  storage: ReadWriteStorage = window.localStorage
): void {
  if (typeof (storage as Storage).removeItem === 'function') {
    (storage as Storage).removeItem(sessionSnapshotStorageKey);
  } else {
    storage.setItem(sessionSnapshotStorageKey, '');
  }
}

export function hasRecoverableSession(
  profileId: string,
  currentTabs: BrowserTab[],
  storage: ReadStorage = window.localStorage
): boolean {
  const snapshot = loadSessionSnapshot(profileId, storage);
  if (!snapshot || !snapshot.state.tabs.length) return false;
  if (currentTabs.length === snapshot.state.tabs.length) {
    const currentUrls = currentTabs.map((t) => t.url).join('|');
    const snapshotUrls = snapshot.state.tabs.map((t) => t.url).join('|');
    if (currentUrls === snapshotUrls) return false;
  }
  return true;
}

function readAll(storage: ReadStorage): Record<string, unknown> {
  const raw = storage.getItem(tabSessionsStorageKey);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeTabState(entry: unknown): ProfileTabState {
  if (!entry || typeof entry !== 'object') return emptyTabState();
  const candidate = entry as Partial<ProfileTabState>;
  const tabs = Array.isArray(candidate.tabs)
    ? candidate.tabs.map((tab) => normalizeTab(tab)).filter((tab): tab is BrowserTab => Boolean(tab))
    : [];
  const activeTabId = typeof candidate.activeTabId === 'string' && tabs.some((tab) => tab.id === candidate.activeTabId)
    ? candidate.activeTabId
    : (tabs[0]?.id ?? null);
  return { tabs, activeTabId };
}

function normalizeTab(entry: unknown): BrowserTab | null {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as Partial<BrowserTab>;
  const id = String(candidate.id || '').trim();
  const url = String(candidate.url || '').trim();
  if (!id || !url) return null;
  return {
    id,
    url,
    title: String(candidate.title || '').trim() || 'New tab',
    pinned: candidate.pinned === true
  };
}
