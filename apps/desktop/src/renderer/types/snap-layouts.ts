export type SnapLayoutType =
  | 'single'
  | 'dual-50-50'
  | 'dual-66-33'
  | 'dual-33-66'
  | 'dual-75-25'
  | 'dual-25-75'
  | 'trio-stacked-right'
  | 'trio-stacked-left'
  | 'trio-main-right'
  | 'trio-columns'
  | 'quad-grid';

export interface SnapSlotBounds {
  top: number;    // Percentage (0 - 100)
  left: number;   // Percentage (0 - 100)
  width: number;  // Percentage (0 - 100)
  height: number; // Percentage (0 - 100)
}

export interface SnapSlotConfig {
  slotId: string;
  name: string;
  bounds: SnapSlotBounds;
}

export interface SnapLayoutDefinition {
  type: SnapLayoutType;
  label: string;
  description: string;
  slots: SnapSlotConfig[];
}

export interface ActiveSnapGroup {
  id: string;
  layout: SnapLayoutType;
  tabIds: (string | null)[];
  splitRatios?: number[]; // e.g. [50, 50] or [66.7, 33.3]
}

export interface GhostTarget {
  layout: SnapLayoutType;
  slotIndex: number;
  label: string;
  bounds: SnapSlotBounds;
}

/** Ensure native HTML drag operations carry an allowed payload across Chromium/Electron. */
export function prepareSnapTabDrag(dataTransfer: Pick<DataTransfer, 'effectAllowed' | 'setData'>, tabId: string): void {
  dataTransfer.effectAllowed = 'move';
  dataTransfer.setData('text/plain', tabId);
}

export interface SnapLayoutRatios {
  x: number[];
  y: number[];
}

export function getDefaultSnapLayoutRatios(layout: SnapLayoutType): SnapLayoutRatios {
  if (layout === 'dual-66-33') return { x: [66.67], y: [] };
  if (layout === 'dual-33-66') return { x: [33.33], y: [] };
  if (layout === 'dual-75-25') return { x: [75], y: [] };
  if (layout === 'dual-25-75') return { x: [25], y: [] };
  if (layout === 'trio-columns') return { x: [33.33, 66.67], y: [] };
  if (layout === 'trio-stacked-right' || layout === 'trio-stacked-left' || layout === 'trio-main-right') return { x: [50], y: [50] };
  if (layout === 'quad-grid') return { x: [50], y: [50] };
  return { x: [50], y: [] };
}

export function getSnapSlotBounds(layout: SnapLayoutType, slotIndex: number, ratios = getDefaultSnapLayoutRatios(layout)): SnapSlotBounds {
  const base = SNAP_LAYOUT_DEFINITIONS[layout].slots[slotIndex]?.bounds;
  if (!base) return { top: 0, left: 0, width: 0, height: 0 };
  if (layout.startsWith('dual-')) {
    const split = ratios.x[0] ?? 50;
    return slotIndex === 0 ? { top: 0, left: 0, width: split, height: 100 } : { top: 0, left: split, width: 100 - split, height: 100 };
  }
  if (layout === 'trio-columns') {
    const [first, second] = ratios.x;
    if (slotIndex === 0) return { top: 0, left: 0, width: first, height: 100 };
    if (slotIndex === 1) return { top: 0, left: first, width: second - first, height: 100 };
    return { top: 0, left: second, width: 100 - second, height: 100 };
  }
  if (layout === 'trio-stacked-right') {
    const x = ratios.x[0], y = ratios.y[0];
    if (slotIndex === 0) return { top: 0, left: 0, width: x, height: 100 };
    return slotIndex === 1 ? { top: 0, left: x, width: 100 - x, height: y } : { top: y, left: x, width: 100 - x, height: 100 - y };
  }
  if (layout === 'trio-stacked-left' || layout === 'trio-main-right') {
    const x = ratios.x[0], y = ratios.y[0];
    if (slotIndex === 0) return { top: 0, left: 0, width: x, height: y };
    if (slotIndex === 1) return { top: y, left: 0, width: x, height: 100 - y };
    return { top: 0, left: x, width: 100 - x, height: 100 };
  }
  if (layout === 'quad-grid') {
    const x = ratios.x[0], y = ratios.y[0];
    return {
      top: slotIndex < 2 ? 0 : y,
      left: slotIndex % 2 === 0 ? 0 : x,
      width: slotIndex % 2 === 0 ? x : 100 - x,
      height: slotIndex < 2 ? y : 100 - y
    };
  }
  return base;
}

export function getSnapTargetForPointer(x: number, y: number): GhostTarget {
  let layout: SnapLayoutType = 'dual-50-50';
  let slotIndex = x < 0.5 ? 0 : 1;
  if (y < 0.32 && x < 0.3) { layout = 'quad-grid'; slotIndex = 0; }
  else if (y < 0.32 && x > 0.7) { layout = 'quad-grid'; slotIndex = 1; }
  else if (y > 0.68 && x < 0.3) { layout = 'quad-grid'; slotIndex = 2; }
  else if (y > 0.68 && x > 0.7) { layout = 'quad-grid'; slotIndex = 3; }
  else if (x < 0.22) { layout = 'dual-25-75'; slotIndex = 0; }
  else if (x > 0.78) { layout = 'dual-75-25'; slotIndex = 1; }
  const definition = SNAP_LAYOUT_DEFINITIONS[layout];
  const slot = definition.slots[slotIndex];
  return { layout, slotIndex, label: `${definition.label} · ${slot.name}`, bounds: slot.bounds };
}

export const SNAP_LAYOUT_DEFINITIONS: Record<SnapLayoutType, SnapLayoutDefinition> = {
  single: {
    type: 'single',
    label: 'Standard',
    description: 'Einzelner Tab im Vollbild',
    slots: [
      { slotId: 'main', name: 'Vollbild', bounds: { top: 0, left: 0, width: 100, height: 100 } }
    ]
  },
  'dual-50-50': {
    type: 'dual-50-50',
    label: 'Dual 50 / 50',
    description: 'Zwei Tabs gleichmäßig nebeneinander',
    slots: [
      { slotId: 'left', name: 'Links (50%)', bounds: { top: 0, left: 0, width: 50, height: 100 } },
      { slotId: 'right', name: 'Rechts (50%)', bounds: { top: 0, left: 50, width: 50, height: 100 } }
    ]
  },
  'dual-66-33': {
    type: 'dual-66-33',
    label: 'Dual 2/3 - 1/3',
    description: 'Großer Hauptarbeitsbereich links, Referenzspalte rechts',
    slots: [
      { slotId: 'left-wide', name: 'Hauptbereich (66%)', bounds: { top: 0, left: 0, width: 66.66, height: 100 } },
      { slotId: 'right-slim', name: 'Spalte (33%)', bounds: { top: 0, left: 66.66, width: 33.34, height: 100 } }
    ]
  },
  'dual-33-66': {
    type: 'dual-33-66',
    label: 'Dual 1/3 - 2/3',
    description: 'Kompakte Spalte links, Hauptbereich rechts',
    slots: [
      { slotId: 'left-slim', name: 'Spalte (33%)', bounds: { top: 0, left: 0, width: 33.34, height: 100 } },
      { slotId: 'right-wide', name: 'Hauptbereich (66%)', bounds: { top: 0, left: 33.34, width: 66.66, height: 100 } }
    ]
  },
  'dual-75-25': {
    type: 'dual-75-25',
    label: 'Dual 3/4 - 1/4',
    description: 'Breiter Viewport links, schlanker Feed rechts',
    slots: [
      { slotId: 'left-ultra', name: 'Hauptbereich (75%)', bounds: { top: 0, left: 0, width: 75, height: 100 } },
      { slotId: 'right-side', name: 'Seitenleiste (25%)', bounds: { top: 0, left: 75, width: 25, height: 100 } }
    ]
  },
  'dual-25-75': {
    type: 'dual-25-75',
    label: 'Dual 1/4 - 3/4',
    description: 'Schlanker Feed links, breiter Viewport rechts',
    slots: [
      { slotId: 'left-side', name: 'Seitenleiste (25%)', bounds: { top: 0, left: 0, width: 25, height: 100 } },
      { slotId: 'right-ultra', name: 'Hauptbereich (75%)', bounds: { top: 0, left: 25, width: 75, height: 100 } }
    ]
  },
  'trio-stacked-right': {
    type: 'trio-stacked-right',
    label: 'Trio Gestapelt Rechts',
    description: '1 Hauptseite links, 2 übereinander rechts',
    slots: [
      { slotId: 'left-main', name: 'Hauptseite (50%)', bounds: { top: 0, left: 0, width: 50, height: 100 } },
      { slotId: 'top-right', name: 'Oben Rechts (25%)', bounds: { top: 0, left: 50, width: 50, height: 50 } },
      { slotId: 'bottom-right', name: 'Unten Rechts (25%)', bounds: { top: 50, left: 50, width: 50, height: 50 } }
    ]
  },
  'trio-stacked-left': {
    type: 'trio-stacked-left',
    label: 'Trio Gestapelt Links',
    description: '2 übereinander links, 1 Hauptseite rechts',
    slots: [
      { slotId: 'top-left', name: 'Oben Links (25%)', bounds: { top: 0, left: 0, width: 50, height: 50 } },
      { slotId: 'bottom-left', name: 'Unten Links (25%)', bounds: { top: 50, left: 0, width: 50, height: 50 } },
      { slotId: 'right-main', name: 'Hauptseite (50%)', bounds: { top: 0, left: 50, width: 50, height: 100 } }
    ]
  },
  'trio-main-right': {
    type: 'trio-main-right',
    label: 'Trio Hauptbereich rechts',
    description: 'Zwei übereinander links, Hauptseite rechts',
    slots: [
      { slotId: 'top-left', name: 'Oben Links (25%)', bounds: { top: 0, left: 0, width: 50, height: 50 } },
      { slotId: 'bottom-left', name: 'Unten Links (25%)', bounds: { top: 50, left: 0, width: 50, height: 50 } },
      { slotId: 'right-main', name: 'Hauptseite (50%)', bounds: { top: 0, left: 50, width: 50, height: 100 } }
    ]
  },
  'trio-columns': {
    type: 'trio-columns',
    label: 'Trio 3 Spalten',
    description: 'Drei gleich breite vertikale Spalten',
    slots: [
      { slotId: 'col-1', name: 'Spalte 1', bounds: { top: 0, left: 0, width: 33.33, height: 100 } },
      { slotId: 'col-2', name: 'Spalte 2', bounds: { top: 0, left: 33.33, width: 33.34, height: 100 } },
      { slotId: 'col-3', name: 'Spalte 3', bounds: { top: 0, left: 66.67, width: 33.33, height: 100 } }
    ]
  },
  'quad-grid': {
    type: 'quad-grid',
    label: 'Quad 2x2 Grid',
    description: 'Vier Quadranten für maximale Übersicht',
    slots: [
      { slotId: 'quad-tl', name: 'Oben Links (25%)', bounds: { top: 0, left: 0, width: 50, height: 50 } },
      { slotId: 'quad-tr', name: 'Oben Rechts (25%)', bounds: { top: 0, left: 50, width: 50, height: 50 } },
      { slotId: 'quad-bl', name: 'Unten Links (25%)', bounds: { top: 50, left: 0, width: 50, height: 50 } },
      { slotId: 'quad-br', name: 'Unten Rechts (25%)', bounds: { top: 50, left: 50, width: 50, height: 50 } }
    ]
  }
};
