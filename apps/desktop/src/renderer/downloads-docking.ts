import { useSyncExternalStore } from 'react';

export type DownloadDock = 'top' | 'sidebar' | 'floating';
export type DockBounds = { x: number; y: number; width: number; height: number };
export type DockState = { mode: DownloadDock; bounds: DockBounds };
export const DOWNLOAD_DOCK_STORAGE = 'lastbrowser.downloads.docking.v2';
const listeners = new Set<() => void>();
const defaults: DockState = { mode: 'top', bounds: { x: 60, y: 80, width: 440, height: 340 } };

export function clampDownloadBounds(bounds: DockBounds, width: number, height: number): DockBounds {
  const w = Math.max(1, Number.isFinite(width) ? width : 800);
  const h = Math.max(1, Number.isFinite(height) ? height : 600);
  const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
  const panelWidth = Math.min(w, Math.max(Math.min(300, w), finite(bounds.width, 440)));
  const panelHeight = Math.min(h, Math.max(Math.min(160, h), finite(bounds.height, 340)));
  return { x: Math.min(w - panelWidth, Math.max(0, finite(bounds.x, 60))), y: Math.min(h - panelHeight, Math.max(0, finite(bounds.y, 80))), width: panelWidth, height: panelHeight };
}

export function parseDownloadDockState(raw: string | null, width: number, height: number): DockState {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (value && ['top', 'sidebar', 'floating'].includes(value.mode) && value.bounds) {
      return { mode: value.mode, bounds: clampDownloadBounds(value.bounds, width, height) };
    }
  } catch { /* Corrupt or unavailable storage uses safe defaults. */ }
  return { ...defaults, bounds: clampDownloadBounds(defaults.bounds, width, height) };
}

let state: DockState = defaults;
let initialized = false;
function initialize() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(DOWNLOAD_DOCK_STORAGE);
    if (!raw) {
      const oldMode = window.localStorage.getItem('lastbrowser.downloads.mode.v1');
      const oldPosition = JSON.parse(window.localStorage.getItem('lastbrowser.downloads.pos.v1') ?? 'null');
      const mode: DownloadDock = oldMode === 'floating' ? 'floating' : oldMode === 'dock-sidekick' ? 'sidebar' : 'top';
      raw = JSON.stringify({ mode, bounds: { ...defaults.bounds, ...(oldPosition && typeof oldPosition === 'object' ? { x: oldPosition.x, y: oldPosition.y } : {}) } });
    }
  } catch { /* Optional persistence. */ }
  state = parseDownloadDockState(raw, window.innerWidth, window.innerHeight);
}
export function getDownloadDockState(): DockState { initialize(); return state; }
export function setDownloadDockState(next: DockState, persist = true) {
  state = next;
  if (persist) try { window.localStorage.setItem(DOWNLOAD_DOCK_STORAGE, JSON.stringify(next)); } catch { /* Optional persistence. */ }
  listeners.forEach((listener) => listener());
}
export function useDownloadDockState(): DockState {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, getDownloadDockState);
}
export const DOWNLOAD_DOCK_TARGET_PADDING = 24;
export type DownloadDockAnchors = Partial<Record<'top' | 'sidebar', DOMRect>>;

export function downloadDockTarget(x: number, y: number, anchors: DownloadDockAnchors): 'top' | 'sidebar' | null {
  const candidates = (['top', 'sidebar'] as const).flatMap((mode) => {
    const rect = anchors[mode];
    if (!rect || rect.width <= 0 || rect.height <= 0
      || x < rect.left - DOWNLOAD_DOCK_TARGET_PADDING || x > rect.right + DOWNLOAD_DOCK_TARGET_PADDING
      || y < rect.top - DOWNLOAD_DOCK_TARGET_PADDING || y > rect.bottom + DOWNLOAD_DOCK_TARGET_PADDING) return [];
    const dx = x - (rect.left + rect.width / 2);
    const dy = y - (rect.top + rect.height / 2);
    return [{ mode, distance: dx * dx + dy * dy }];
  });
  return candidates.sort((a, b) => a.distance - b.distance)[0]?.mode ?? null;
}

export function downloadDockZoneBounds(anchor: DOMRect, viewportWidth: number, viewportHeight: number): DockBounds {
  const left = Math.max(0, anchor.left - DOWNLOAD_DOCK_TARGET_PADDING);
  const top = Math.max(0, anchor.top - DOWNLOAD_DOCK_TARGET_PADDING);
  const right = Math.min(viewportWidth, anchor.right + DOWNLOAD_DOCK_TARGET_PADDING);
  const bottom = Math.min(viewportHeight, anchor.bottom + DOWNLOAD_DOCK_TARGET_PADDING);
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

function isRenderedInCurrentLayout(element: HTMLElement): boolean {
  if (!element.isConnected || element.getClientRects().length === 0) return false;
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = window.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return false;
  }
  return true;
}

/**
 * By default, return launchers the user can currently see. During an explicit
 * floating-panel drag, includeInactive exposes only rendered anchor hosts so
 * the panel can draw a visible drop zone over their actual locations.
 */
export function getDownloadAnchors(options: { includeInactive?: boolean } = {}): DownloadDockAnchors {
  const result: DownloadDockAnchors = {};
  for (const mode of ['top', 'sidebar'] as const) {
    const elements = document.querySelectorAll<HTMLElement>('[data-download-dock-anchor="' + mode + '"]');
    for (const element of elements) {
      const button = element.querySelector('button');
      if (!button || !isRenderedInCurrentLayout(element)) continue;
      if (!options.includeInactive && (button.getAttribute('aria-hidden') === 'true' || !isRenderedInCurrentLayout(button))) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight) {
        result[mode] = rect;
        break;
      }
    }
  }
  return result;
}
export function anchoredDownloadBounds(mode: 'top' | 'sidebar', anchor: DOMRect, bounds: DockBounds, width: number, height: number): DockBounds {
  return clampDownloadBounds({ ...bounds, x: mode === 'top' ? anchor.right - bounds.width : anchor.left, y: mode === 'top' ? anchor.bottom + 8 : anchor.top - bounds.height - 8 }, width, height);
}
