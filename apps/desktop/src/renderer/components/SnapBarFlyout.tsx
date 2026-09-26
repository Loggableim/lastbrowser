import React from 'react';
import {
  SNAP_LAYOUT_DEFINITIONS,
  type SnapLayoutType,
  type GhostTarget
} from '../types/snap-layouts.js';

export interface SnapBarFlyoutProps {
  visible: boolean;
  onHoverSlot?: (target: GhostTarget | null) => void;
  onSelectSlot?: (layout: SnapLayoutType, slotIndex: number) => void;
  activeSlot?: { layout: SnapLayoutType; slotIndex: number } | null;
}

export function SnapBarFlyout({
  visible,
  onHoverSlot,
  onSelectSlot,
  activeSlot
}: SnapBarFlyoutProps): React.JSX.Element | null {
  if (!visible) return null;

  const layoutOrder: SnapLayoutType[] = [
    'dual-50-50',
    'dual-66-33',
    'dual-33-66',
    'dual-75-25',
    'dual-25-75',
    'trio-stacked-right',
    'trio-stacked-left',
    'trio-main-right',
    'trio-columns',
    'quad-grid'
  ];

  return (
    <div className={`snap-bar-flyout ${visible ? 'is-visible' : ''}`} role="region" aria-label="Snap Layouts">
      <div className="snap-bar-header">
        <span className="snap-bar-title">✦ Snap Layouts (Windows 11)</span>
        <span className="snap-bar-hint">Tab in einen Bereich ziehen zum Andocken</span>
      </div>
      <div className="snap-bar-cards">
        {layoutOrder.map((layoutKey) => {
          const def = SNAP_LAYOUT_DEFINITIONS[layoutKey];
          return (
            <div key={layoutKey} className="snap-bar-card" title={def.description}>
              <div className={`snap-card-preview layout-${layoutKey}`}>
                {def.slots.map((slot, idx) => {
                  const isHovered =
                    activeSlot?.layout === layoutKey && activeSlot?.slotIndex === idx;

                  const handleMouseEnter = () => {
                    onHoverSlot?.({
                      layout: layoutKey,
                      slotIndex: idx,
                      label: `${def.label} · ${slot.name}`,
                      bounds: slot.bounds
                    });
                  };

                  const handleMouseUp = () => {
                    onSelectSlot?.(layoutKey, idx);
                  };

                  return (
                    <button
                      key={slot.slotId}
                      type="button"
                      className={`snap-card-slot slot-${idx} ${isHovered ? 'hovered' : ''}`}
                      style={{
                        top: `${slot.bounds.top}%`,
                        left: `${slot.bounds.left}%`,
                        width: `${slot.bounds.width}%`,
                        height: `${slot.bounds.height}%`
                      }}
                      onMouseEnter={handleMouseEnter}
                      onMouseLeave={() => onHoverSlot?.(null)}
                      onMouseUp={handleMouseUp}
                      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); handleMouseEnter(); }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onSelectSlot?.(layoutKey, idx);
                      }}
                      aria-label={`${def.label} ${slot.name}`}
                    />
                  );
                })}
              </div>
              <span className="snap-card-label">{def.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
