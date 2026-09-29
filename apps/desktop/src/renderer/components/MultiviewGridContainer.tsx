import React, { useCallback, useEffect, useRef } from 'react';
import { ExternalLink, Maximize2, X } from 'lucide-react';
import type { BrowserTab } from '../tabs.js';
import { useTabStore } from '../stores/useTabStore.js';
import { prepareSnapTabDrag, SNAP_LAYOUT_DEFINITIONS, getSnapSlotBounds, type SnapLayoutRatios, type SnapLayoutType } from '../types/snap-layouts.js';
import { useDesktopI18n } from '../i18n.js';

export interface ScreenBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** True when a native drag ended outside the current app window. */
export function isPointOutsideWindow(x: number, y: number, bounds: ScreenBounds): boolean {
  return x < bounds.left || y < bounds.top || x >= bounds.left + bounds.width || y >= bounds.top + bounds.height;
}

export function detachPaneIfDraggedOutside(
  tab: BrowserTab,
  x: number,
  y: number,
  bounds: ScreenBounds,
  onDetach: (tab: BrowserTab, screenX: number, screenY: number) => void
): boolean {
  if (!isPointOutsideWindow(x, y, bounds)) return false;
  onDetach(tab, x, y);
  return true;
}

export interface MultiviewGridContainerProps {
  layout: SnapLayoutType;
  tabIds: string[];
  slotIndexes: number[];
  tabs: BrowserTab[];
  activeTabId: string;
  ratios: SnapLayoutRatios;
  onSetRatio: (axis: 'x' | 'y', index: number, ratio: number) => void;
  onActivateTab?: (tabId: string) => void;
  onRemoveSplitTab?: (tabId: string) => void;
  onDetachTab?: (tab: BrowserTab, screenX: number, screenY: number) => void;
  onMaximizeTab?: (tabId: string) => void;
  onDropToSlot?: (slotIndex: number) => void;
}

const SNAP_POINTS = [25, 33.33, 50, 66.67, 75];

function snapRatio(value: number): number {
  const nearest = SNAP_POINTS.reduce((best, point) => Math.abs(point - value) < Math.abs(best - value) ? point : best, SNAP_POINTS[0]);
  return Math.abs(nearest - value) <= 2.5 ? nearest : value;
}

export function getHorizontalDividerBounds(layout: SnapLayoutType, ratios: SnapLayoutRatios): Array<{ top: number; left: number; width: number }> {
  const splitX = ratios.x[0] ?? 50;
  const heights = layout === 'quad-grid'
    ? [ratios.y[0] ?? 50, ratios.y[1] ?? ratios.y[0] ?? 50]
    : ratios.y;
  return heights.map((top, index) => {
    if (layout === 'quad-grid') return { top, left: index === 0 ? 0 : splitX, width: index === 0 ? splitX : 100 - splitX };
    if (layout === 'trio-stacked-right') return { top, left: splitX, width: 100 - splitX };
    if (layout === 'trio-stacked-left' || layout === 'trio-main-right') return { top, left: 0, width: splitX };
    return { top, left: 0, width: 100 };
  });
}

/** Pane chrome only. Each browser guest remains mounted once in BrowserMain. */
export function MultiviewGridContainer({
  layout, tabIds, slotIndexes, tabs, activeTabId, ratios,
  onSetRatio, onActivateTab, onRemoveSplitTab, onDetachTab,
  onMaximizeTab, onDropToSlot
}: MultiviewGridContainerProps): React.JSX.Element {
  const { t } = useDesktopI18n();
  const definition = SNAP_LAYOUT_DEFINITIONS[layout];
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => resizeCleanupRef.current?.(), []);
  const beginResize = useCallback((axis: 'x' | 'y', index: number, event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.pointerType === 'mouse' && event.isPrimary === false)) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const container = handle.parentElement;
    if (!container) return;
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture may be unavailable in embedded Electron contexts;
      // the window listeners below remain as a fallback.
    }
    const rect = container.getBoundingClientRect();
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      const span = axis === 'x' ? rect.width : rect.height;
      if (!span) return;
      const position = axis === 'x' ? moveEvent.clientX - rect.left : moveEvent.clientY - rect.top;
      const next = [...ratios[axis]];
      let min = 18, max = 82;
      if (axis === 'x' && layout === 'trio-columns') {
        min = index === 0 ? 15 : next[0] + 15;
        max = index === 0 ? next[1] - 15 : 85;
      }
      let value = snapRatio(Math.min(max, Math.max(min, (position / span) * 100)));
      value = Math.min(max, Math.max(min, value));
      onSetRatio(axis, index, value);
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cleanup);
      try {
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      } catch {
        // The pointer can already be released when the window is torn down.
      }
      resizeCleanupRef.current = null;
    };
    const up = (upEvent: PointerEvent) => {
      if (upEvent.pointerId === event.pointerId) cleanup();
    };
    resizeCleanupRef.current?.();
    // Captured events bubble to the window. The window listeners also serve as
    // a fallback for Electron versions that do not preserve capture across a guest view.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', cleanup, { once: true });
    resizeCleanupRef.current = cleanup;
  }, [layout, onSetRatio, ratios]);

  return (
    <div className={`multiview-grid-container layout-${layout}`} aria-label={t('snap.title')}>
      {definition.slots.map((slot, index) => {
        const tabIndex = slotIndexes.indexOf(index);
        const tab = tabIndex >= 0 ? tabs.find((item) => item.id === tabIds[tabIndex]) : undefined;
        const bounds = getSnapSlotBounds(layout, index, ratios);
        return (
          <div
            key={slot.slotId}
            className={`multiview-pane-chrome ${tab ? 'occupied' : 'empty'} ${tab?.id === activeTabId ? 'active-pane' : ''}`}
            style={{ top: `${bounds.top}%`, left: `${bounds.left}%`, width: `${bounds.width}%`, height: `${bounds.height}%` }}
            onClick={() => tab && onActivateTab?.(tab.id)}
            onDragOver={(event) => { if (!tab) { event.preventDefault(); event.stopPropagation(); } }}
            onDrop={(event) => {
              if (!tab) {
                event.preventDefault();
                event.stopPropagation();
                onDropToSlot?.(index);
              }
            }}
          >
            {tab ? (
              <div className="multiview-pane-header">
                <span
                  className="multiview-pane-title"
                  title={`${tab.title || tab.url} · ${t('snap.dragToMoveOrDetach')}`}
                  draggable
                  onDragStart={(event) => {
                    prepareSnapTabDrag(event.dataTransfer, tab.id);
                    useTabStore.getState().setDraggedTabId(tab.id);
                  }}
                  onDragEnd={(event) => {
                    const bounds = {
                      left: window.screenX,
                      top: window.screenY,
                      width: window.outerWidth,
                      height: window.outerHeight
                    };
                    if (onDetachTab) detachPaneIfDraggedOutside(tab, event.screenX, event.screenY, bounds, onDetachTab);
                    useTabStore.getState().setDraggedTabId(null);
                  }}
                >{tab.title || tab.url}</span>
                <div className="multiview-pane-controls" onClick={(event) => event.stopPropagation()}>
                  {onDetachTab && <button type="button" className="multiview-pane-btn" aria-label={t('snap.detachTab')} title={t('snap.detachTab')} onClick={(event) => onDetachTab(tab, event.screenX, event.screenY)}><ExternalLink size={12} /></button>}
                  {onMaximizeTab && <button type="button" className="multiview-pane-btn" aria-label={t('snap.maximizePane')} title={t('snap.maximizePane')} onClick={() => onMaximizeTab(tab.id)}><Maximize2 size={12} /></button>}
                  <button type="button" className="multiview-pane-btn close-pane" aria-label={t('snap.removePane')} title={t('snap.removePane')} onClick={() => onRemoveSplitTab?.(tab.id)}><X size={12} /></button>
                </div>
              </div>
            ) : <span className="multiview-empty-label">{t('snap.tabHere')}</span>}
          </div>
        );
      })}
      {ratios.x.map((ratio, index) => <div key={`x-${index}`} className="multiview-divider-vertical" style={{ left: `calc(${ratio}% - 4px)` }} onPointerDown={(event) => beginResize('x', index, event)} role="separator" aria-orientation="vertical" aria-label={t('snap.resizePane')}><div className="multiview-divider-grip" /></div>)}
      {getHorizontalDividerBounds(layout, ratios).map((divider, index) => {
        return <div key={`y-${index}`} className="multiview-divider-horizontal" style={{ top: `calc(${divider.top}% - 4px)`, left: `${divider.left}%`, width: `${divider.width}%` }} onPointerDown={(event) => beginResize('y', index, event)} role="separator" aria-orientation="horizontal" aria-label={t('snap.resizePane')}><div className="multiview-divider-grip" /></div>;
      })}
    </div>
  );
}
