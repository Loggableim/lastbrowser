import React from 'react';
import {
  SNAP_LAYOUT_DEFINITIONS,
  type SnapLayoutType,
  type GhostTarget
} from '../types/snap-layouts.js';
import { useDesktopI18n } from '../i18n.js';
import { snapLayoutDescriptionKey, snapLayoutLabelKey, snapSlotNameKey } from '../snap-i18n.js';

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
  const { t } = useDesktopI18n();
  if (!visible) return null;

  const layoutOrder: Array<Exclude<SnapLayoutType, 'single'>> = [
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
    <div className={`snap-bar-flyout ${visible ? 'is-visible' : ''}`} role="region" aria-label={t('snap.title')}>
      <div className="snap-bar-header">
        <span className="snap-bar-title">✦ {t('snap.title')}</span>
        <span className="snap-bar-hint">{t('snap.dragInstruction')}</span>
      </div>
      <div className="snap-bar-cards">
        {layoutOrder.map((layoutKey) => {
          const def = SNAP_LAYOUT_DEFINITIONS[layoutKey];
          const layoutLabel = t(snapLayoutLabelKey(layoutKey));
          return (
            <div key={layoutKey} className="snap-bar-card" title={t(snapLayoutDescriptionKey(layoutKey))}>
              <div className={`snap-card-preview layout-${layoutKey}`}>
                {def.slots.map((slot, idx) => {
                  const isHovered =
                    activeSlot?.layout === layoutKey && activeSlot?.slotIndex === idx;

                  const handleMouseEnter = () => {
                    onHoverSlot?.({
                      layout: layoutKey,
                      slotIndex: idx,
                      label: `${layoutLabel} · ${t(snapSlotNameKey(layoutKey, idx))}`,
                      bounds: slot.bounds
                    });
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
                      onFocus={handleMouseEnter}
                      onBlur={() => onHoverSlot?.(null)}
                      onClick={() => onSelectSlot?.(layoutKey, idx)}
                      onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); handleMouseEnter(); }}
                      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); handleMouseEnter(); }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onSelectSlot?.(layoutKey, idx);
                      }}
                      aria-label={`${layoutLabel} ${t(snapSlotNameKey(layoutKey, idx))}`}
                    />
                  );
                })}
              </div>
              <span className="snap-card-label">{layoutLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
