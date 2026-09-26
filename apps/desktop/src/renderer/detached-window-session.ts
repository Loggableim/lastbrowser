import type { BrowserTab } from './tabs.js';
import type { SplitLayoutMode } from './stores/useTabStore.js';
import type { SnapLayoutRatios } from './types/snap-layouts.js';

export const DETACHED_WINDOW_SESSION_KEY = 'lastbrowser.detachedWindowSession.v1';

export interface DetachedWindowSession {
  profileId: string;
  spacePath: string;
  tabs: BrowserTab[];
  activeTabId: string;
  splitLayout: SplitLayoutMode;
  splitTabIds: string[];
  splitSlotIndexes: number[];
  snapRatios: SnapLayoutRatios;
}

export interface DetachedWindowSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const SNAP_LAYOUTS = new Set<SplitLayoutMode>([
  'single', 'dual-50-50', 'dual-66-33', 'dual-33-66', 'dual-75-25', 'dual-25-75',
  'trio-stacked-right', 'trio-stacked-left', 'trio-main-right', 'trio-columns', 'quad-grid',
  'columns', 'rows', 'grid'
]);

function isFiniteNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

function isBrowserTab(value: unknown): value is BrowserTab {
  if (!value || typeof value !== 'object') return false;
  const tab = value as Partial<BrowserTab>;
  return typeof tab.id === 'string' && tab.id.trim().length > 0
    && typeof tab.url === 'string'
    && typeof tab.title === 'string';
}

function isDetachedWindowSession(value: unknown): value is DetachedWindowSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<DetachedWindowSession>;
  if (typeof session.profileId !== 'string' || typeof session.spacePath !== 'string') return false;
  if (!Array.isArray(session.tabs) || session.tabs.length === 0 || !session.tabs.every(isBrowserTab)) return false;
  const ids = session.tabs.map((tab) => tab.id);
  if (new Set(ids).size !== ids.length || typeof session.activeTabId !== 'string' || !ids.includes(session.activeTabId)) return false;
  if (!SNAP_LAYOUTS.has(session.splitLayout as SplitLayoutMode)) return false;
  if (!Array.isArray(session.splitTabIds) || !session.splitTabIds.every((id) => typeof id === 'string' && ids.includes(id))) return false;
  if (new Set(session.splitTabIds).size !== session.splitTabIds.length) return false;
  if (!Array.isArray(session.splitSlotIndexes) || !session.splitSlotIndexes.every((index) => Number.isInteger(index) && index >= 0)) return false;
  const ratios = session.snapRatios;
  return Boolean(ratios && isFiniteNumberArray(ratios.x) && isFiniteNumberArray(ratios.y));
}

/** Read only this renderer window's recovery state. Never falls back to shared profile or Space tabs. */
export function loadDetachedWindowSession(storage: DetachedWindowSessionStorage): DetachedWindowSession | null {
  try {
    const serialized = storage.getItem(DETACHED_WINDOW_SESSION_KEY);
    if (!serialized) return null;
    const value: unknown = JSON.parse(serialized);
    return isDetachedWindowSession(value) ? value : null;
  } catch {
    return null;
  }
}

/** Persist tab recovery in sessionStorage, which is scoped to this BrowserWindow and survives reloads. */
export function saveDetachedWindowSession(storage: DetachedWindowSessionStorage, session: DetachedWindowSession): boolean {
  if (!isDetachedWindowSession(session)) return false;
  try {
    storage.setItem(DETACHED_WINDOW_SESSION_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}
