import React from 'react';
import type { GhostTarget } from '../types/snap-layouts.js';

export interface SnapGhostOverlayProps {
  target: GhostTarget | null;
  active: boolean;
}

export function SnapGhostOverlay({ target, active }: SnapGhostOverlayProps): React.JSX.Element | null {
  if (!active || !target) return null;

  const style: React.CSSProperties = {
    position: 'absolute',
    top: `${target.bounds.top}%`,
    left: `${target.bounds.left}%`,
    width: `${target.bounds.width}%`,
    height: `${target.bounds.height}%`,
    pointerEvents: 'none',
    zIndex: 9999
  };

  return (
    <div className="snap-ghost-overlay" style={style} aria-hidden="true">
      <div className="snap-ghost-inner">
        <div className="snap-ghost-badge">
          <span className="snap-ghost-dot" />
          <span className="snap-ghost-label">{target.label}</span>
        </div>
      </div>
    </div>
  );
}
