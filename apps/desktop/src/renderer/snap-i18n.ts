import type { DesktopTranslationKey } from './i18n/keys.js';
import type { SnapLayoutType } from './types/snap-layouts.js';

const layoutPrefixes: Record<Exclude<SnapLayoutType, 'single'>, string> = {
  'dual-50-50': 'snap.layout.dual-50-50',
  'dual-66-33': 'snap.layout.dual-66-33',
  'dual-33-66': 'snap.layout.dual-33-66',
  'dual-75-25': 'snap.layout.dual-75-25',
  'dual-25-75': 'snap.layout.dual-25-75',
  'trio-stacked-right': 'snap.layout.trio-stacked-right',
  'trio-stacked-left': 'snap.layout.trio-stacked-left',
  'trio-main-right': 'snap.layout.trio-main-right',
  'trio-columns': 'snap.layout.trio-columns',
  'quad-grid': 'snap.layout.quad-grid'
};

export function snapLayoutLabelKey(layout: Exclude<SnapLayoutType, 'single'>): DesktopTranslationKey {
  return `${layoutPrefixes[layout]}.label` as DesktopTranslationKey;
}

export function snapLayoutDescriptionKey(layout: Exclude<SnapLayoutType, 'single'>): DesktopTranslationKey {
  return `${layoutPrefixes[layout]}.description` as DesktopTranslationKey;
}

export function snapSlotNameKey(layout: Exclude<SnapLayoutType, 'single'>, index: number): DesktopTranslationKey {
  const slotKeys: Record<Exclude<SnapLayoutType, 'single'>, DesktopTranslationKey[]> = {
    'dual-50-50': ['snap.slot.left', 'snap.slot.right'],
    'dual-66-33': ['snap.slot.left67', 'snap.slot.right33'],
    'dual-33-66': ['snap.slot.left33', 'snap.slot.right67'],
    'dual-75-25': ['snap.slot.left75', 'snap.slot.right25'],
    'dual-25-75': ['snap.slot.left25', 'snap.slot.right75'],
    'trio-stacked-right': ['snap.slot.main', 'snap.slot.topRight', 'snap.slot.bottomRight'],
    'trio-stacked-left': ['snap.slot.topLeft', 'snap.slot.bottomLeft', 'snap.slot.mainRight'],
    'trio-main-right': ['snap.slot.topLeft', 'snap.slot.bottomLeft', 'snap.slot.mainRight'],
    'trio-columns': ['snap.slot.column1', 'snap.slot.column2', 'snap.slot.column3'],
    'quad-grid': ['snap.slot.quadTopLeft', 'snap.slot.quadTopRight', 'snap.slot.quadBottomLeft', 'snap.slot.quadBottomRight']
  };
  return slotKeys[layout][index] ?? 'snap.tabHere';
}
