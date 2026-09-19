/**
 * Per-profile tab persistence.
 *
 * Every browser profile keeps its own set of tabs, so switching profiles
 * restores that profile's browsing session instead of sharing one global
 * tab list.
 */
import type { BrowserTab } from './tabs.js';

export type ProfileTabState = {
  tabs: BrowserTab[];
  activeTabId: string | null;
};

export const tabSessionsStorageKey = 'lastbrowser.tabSessions.v1';

type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'setItem'>;
type ReadWriteStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function emptyTabState(): ProfileTabState {
  return { tabs: [], activeTabId: null };
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

export function saveProfileTabs(
  profileId: string,
  state: ProfileTabState,
  storage: WriteStorage = window.localStorage
): void {
  const all = readAll(storage as unknown as ReadStorage);
  all[profileId] = {
    tabs: state.tabs.map((tab) => ({ ...tab })),
    activeTabId: state.activeTabId
  };
  storage.setItem(tabSessionsStorageKey, JSON.stringify(all));
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
