import React, { useCallback, useEffect, useRef } from 'react';
import { ExternalLink, Maximize2, X } from 'lucide-react';
import type { BrowserTab } from '../tabs.js';
import { SNAP_LAYOUT_DEFINITIONS, getSnapSlotBounds, type SnapLayoutRatios, type SnapLayoutType } from '../types/snap-layouts.js';

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

/** Pane chrome only. Each browser guest remains mounted once in BrowserMain. */
export function MultiviewGridContainer({
  layout, tabIds, slotIndexes, tabs, activeTabId, ratios,
  onSetRatio, onActivateTab, onRemoveSplitTab, onDetachTab,
  onMaximizeTab, onDropToSlot
}: MultiviewGridContainerProps): React.JSX.Element {
  const definition = SNAP_LAYOUT_DEFINITIONS[layout];
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => resizeCleanupRef.current?.(), []);
  const beginResize = useCallback((axis: 'x' | 'y', index: number, event: React.MouseEvent) => {
    event.preventDefault();
    const container = (event.currentTarget as HTMLElement).parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const move = (moveEvent: MouseEvent) => {
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
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      resizeCleanupRef.current = null;
    };
    resizeCleanupRef.current?.();
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up, { once: true });
    resizeCleanupRef.current = up;
  }, [layout, onSetRatio, ratios]);

  return (
    <div className={`multiview-grid-container layout-${layout}`} aria-label="Multiview controls">
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
                <span className="multiview-pane-title" title={tab.title}>{tab.title || tab.url}</span>
                <div className="multiview-pane-controls" onClick={(event) => event.stopPropagation()}>
                  {onDetachTab && <button type="button" className="multiview-pane-btn" title="In eigenem Fenster öffnen" onClick={(event) => onDetachTab(tab, event.screenX, event.screenY)}><ExternalLink size={12} /></button>}
                  {onMaximizeTab && <button type="button" className="multiview-pane-btn" title="Diesen Tab maximieren" onClick={() => onMaximizeTab(tab.id)}><Maximize2 size={12} /></button>}
                  <button type="button" className="multiview-pane-btn close-pane" title="Aus dem Multiview lösen" onClick={() => onRemoveSplitTab?.(tab.id)}><X size={12} /></button>
                </div>
              </div>
            ) : <span className="multiview-empty-label">Tab hier ablegen</span>}
          </div>
        );
      })}
      {ratios.x.map((ratio, index) => <div key={`x-${index}`} className="multiview-divider-vertical" style={{ left: `calc(${ratio}% - 4px)` }} onMouseDown={(event) => beginResize('x', index, event)} role="separator" aria-orientation="vertical" aria-label="Bereichsgröße ändern"><div className="multiview-divider-grip" /></div>)}
      {ratios.y.map((ratio, index) => {
        const stackedRight = layout === 'trio-stacked-right';
        const stackedLeft = layout === 'trio-stacked-left' || layout === 'trio-main-right';
        const splitX = ratios.x[0] ?? 50;
        return <div key={`y-${index}`} className="multiview-divider-horizontal" style={{ top: `calc(${ratio}% - 4px)`, left: stackedRight ? `${splitX}%` : 0, width: stackedRight ? `${100 - splitX}%` : stackedLeft ? `${splitX}%` : '100%' }} onMouseDown={(event) => beginResize('y', index, event)} role="separator" aria-orientation="horizontal" aria-label="Bereichsgröße ändern"><div className="multiview-divider-grip" /></div>;
      })}
    </div>
  );
}
