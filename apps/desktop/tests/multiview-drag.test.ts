import { describe, expect, it, vi } from 'vitest';
import { detachPaneIfDraggedOutside, getHorizontalDividerBounds, isPointOutsideWindow } from '../src/renderer/components/MultiviewGridContainer.js';
import { buildSnapGroupAfterDrop, isPointInsideSnapFlyout } from '../src/renderer/snap-drop.js';

describe('Multiview pane drag-out detection', () => {
  const windowBounds = { left: 100, top: 80, width: 1200, height: 800 };

  it('keeps drags ending inside the app window in the current window', () => {
    expect(isPointOutsideWindow(100, 80, windowBounds)).toBe(false);
    expect(isPointOutsideWindow(1299, 879, windowBounds)).toBe(false);
  });

  it('recognizes pointer release beyond every window edge', () => {
    expect(isPointOutsideWindow(99, 200, windowBounds)).toBe(true);
    expect(isPointOutsideWindow(200, 79, windowBounds)).toBe(true);
    expect(isPointOutsideWindow(1300, 200, windowBounds)).toBe(true);
    expect(isPointOutsideWindow(200, 880, windowBounds)).toBe(true);
  });

  it('detaches the dragged tab with the release coordinates only after an outside drop', () => {
    const tab = { id: 'tab-1', title: 'Example', url: 'https://example.com' };
    const onDetach = vi.fn();

    expect(detachPaneIfDraggedOutside(tab, 1299, 400, windowBounds, onDetach)).toBe(false);
    expect(onDetach).not.toHaveBeenCalled();

    expect(detachPaneIfDraggedOutside(tab, 1300, 400, windowBounds, onDetach)).toBe(true);
    expect(onDetach).toHaveBeenCalledWith(tab, 1300, 400);
  });
});

describe('independent quad column resizing', () => {
  it('limits each horizontal divider to its own column', () => {
    expect(getHorizontalDividerBounds('quad-grid', { x: [40], y: [70, 35] })).toEqual([
      { top: 70, left: 0, width: 40 },
      { top: 35, left: 40, width: 60 }
    ]);
  });

  it('renders both column dividers for saved legacy one-row ratios', () => {
    expect(getHorizontalDividerBounds('quad-grid', { x: [40], y: [60] })).toEqual([
      { top: 60, left: 0, width: 40 },
      { top: 60, left: 40, width: 60 }
    ]);
    expect(getHorizontalDividerBounds('quad-grid', { x: [40], y: [] })).toEqual([
      { top: 50, left: 0, width: 40 },
      { top: 50, left: 40, width: 60 }
    ]);
  });
});

describe('Snap drop slot assignment', () => {
  it('keeps the drag preview active across the complete snap flyout bounds', () => {
    const rect = { left: 280, top: 54, right: 1040, bottom: 180 };
    expect(isPointInsideSnapFlyout(977, 112, rect)).toBe(true);
    expect(isPointInsideSnapFlyout(279, 112, rect)).toBe(false);
    expect(isPointInsideSnapFlyout(977, 181, rect)).toBe(false);
  });

  it('creates a two-tab split from the active tab and a dragged tab', () => {
    expect(buildSnapGroupAfterDrop('dual-50-50', 0, 'b', {
      tabIds: [], slotIndexes: [], activeTabId: 'a', availableTabIds: ['a', 'b', 'c']
    })).toEqual({ tabIds: ['b', 'a'], slotIndexes: [0, 1] });
  });

  it('swaps existing pane slots when one split tab is dropped onto another', () => {
    expect(buildSnapGroupAfterDrop('dual-50-50', 0, 'b', {
      tabIds: ['a', 'b'], slotIndexes: [0, 1], activeTabId: 'a', availableTabIds: ['a', 'b']
    })).toEqual({ tabIds: ['b', 'a'], slotIndexes: [0, 1] });
  });

  it('remaps sparse high slots when a group is changed to a smaller layout', () => {
    const result = buildSnapGroupAfterDrop('dual-50-50', 0, 'd', {
      tabIds: ['a', 'b', 'c', 'd'], slotIndexes: [2, 3, 0, 1], activeTabId: 'a', availableTabIds: ['a', 'b', 'c', 'd']
    });
    expect(result.tabIds).toEqual(['d', 'a']);
    expect(result.slotIndexes).toEqual([0, 1]);
    expect(new Set(result.tabIds).size).toBe(result.tabIds.length);
  });

  it('fills an empty slot without duplicating tabs', () => {
    expect(buildSnapGroupAfterDrop('trio-columns', 2, 'c', {
      tabIds: ['a', 'b'], slotIndexes: [0, 1], activeTabId: 'a', availableTabIds: ['a', 'b', 'c']
    })).toEqual({ tabIds: ['a', 'b', 'c'], slotIndexes: [0, 1, 2] });
  });
});
