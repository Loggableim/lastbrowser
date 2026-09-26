import { describe, expect, it, vi } from 'vitest';
import { getDefaultSnapLayoutRatios, getSnapSlotBounds, getSnapTargetForPointer, prepareSnapTabDrag, SNAP_LAYOUT_DEFINITIONS } from '../src/renderer/types/snap-layouts.js';

describe('Snap layout targets', () => {
  it('marks tab drags as move operations and includes the tab id in native drag data', () => {
    const setData = vi.fn();
    const transfer = { effectAllowed: 'all' as DataTransfer['effectAllowed'], setData };
    prepareSnapTabDrag(transfer, 'tab-123');
    expect(transfer.effectAllowed).toBe('move');
    expect(setData).toHaveBeenCalledWith('text/plain', 'tab-123');
  });

  it('offers each required dual, trio, and quad layout', () => {
    expect(Object.keys(SNAP_LAYOUT_DEFINITIONS)).toEqual(expect.arrayContaining([
      'dual-50-50', 'dual-66-33', 'dual-33-66', 'dual-75-25', 'dual-25-75',
      'trio-columns', 'trio-main-right', 'quad-grid'
    ]));
  });

  it.each([
    [0.05, 0.5, 'dual-25-75', 0],
    [0.95, 0.5, 'dual-75-25', 1],
    [0.45, 0.5, 'dual-50-50', 0],
    [0.6, 0.5, 'dual-50-50', 1],
    [0.1, 0.1, 'quad-grid', 0],
    [0.9, 0.1, 'quad-grid', 1],
    [0.1, 0.9, 'quad-grid', 2],
    [0.9, 0.9, 'quad-grid', 3]
  ] as const)('maps pointer (%s, %s) to %s slot %s', (x, y, layout, slotIndex) => {
    const target = getSnapTargetForPointer(x, y);
    expect(target.layout).toBe(layout);
    expect(target.slotIndex).toBe(slotIndex);
    expect(target.bounds).toEqual(SNAP_LAYOUT_DEFINITIONS[layout].slots[slotIndex].bounds);
  });

  it('keeps dynamic slot geometry aligned with resized dividers', () => {
    expect(getSnapSlotBounds('dual-50-50', 0, { x: [66], y: [] })).toEqual({ top: 0, left: 0, width: 66, height: 100 });
    expect(getSnapSlotBounds('dual-50-50', 1, { x: [66], y: [] })).toEqual({ top: 0, left: 66, width: 34, height: 100 });
    expect(getSnapSlotBounds('quad-grid', 3, { x: [40], y: [60] })).toEqual({ top: 60, left: 40, width: 60, height: 40 });
    expect(getSnapSlotBounds('trio-columns', 1, { x: [30, 70], y: [] })).toEqual({ top: 0, left: 30, width: 40, height: 100 });
    expect(getSnapSlotBounds('trio-stacked-right', 2, { x: [55], y: [42] })).toEqual({ top: 42, left: 55, width: 45, height: 58 });
  });

  it('provides layout defaults that match all supported pane counts', () => {
    for (const [layout, definition] of Object.entries(SNAP_LAYOUT_DEFINITIONS)) {
      const ratios = getDefaultSnapLayoutRatios(layout as keyof typeof SNAP_LAYOUT_DEFINITIONS);
      definition.slots.forEach((_slot, index) => {
        const bounds = getSnapSlotBounds(layout as keyof typeof SNAP_LAYOUT_DEFINITIONS, index, ratios);
        expect(bounds.width).toBeGreaterThan(0);
        expect(bounds.height).toBeGreaterThan(0);
      });
    }
  });
});
