import { SNAP_LAYOUT_DEFINITIONS, type SnapLayoutType } from './types/snap-layouts.js';

export interface SnapDropState {
  tabIds: string[];
  slotIndexes: number[];
  activeTabId: string;
  availableTabIds: string[];
}

export interface SnapDropGroup {
  tabIds: string[];
  slotIndexes: number[];
}

/** Pure slot assignment used by pointer drops and the Snap flyout. */
export function buildSnapGroupAfterDrop(
  layout: SnapLayoutType,
  targetSlot: number,
  draggedId: string,
  state: SnapDropState
): SnapDropGroup {
  const capacity = SNAP_LAYOUT_DEFINITIONS[layout].slots.length;
  if (!draggedId || targetSlot < 0 || targetSlot >= capacity || !state.availableTabIds.includes(draggedId)) {
    return { tabIds: [], slotIndexes: [] };
  }

  const entries: Array<{ id: string; slot: number }> = [];
  const seen = new Set<string>();
  state.tabIds.forEach((id, index) => {
    const slot = state.slotIndexes[index] ?? index;
    if (!state.availableTabIds.includes(id) || seen.has(id) || !Number.isInteger(slot) || slot < 0) return;
    seen.add(id);
    entries.push({ id, slot });
  });

  const hasGroupContext = entries.some(({ id }) => id === state.activeTabId || id === draggedId);
  let group = hasGroupContext ? entries : [];
  if (!group.length) {
    const partner = state.activeTabId !== draggedId && state.availableTabIds.includes(state.activeTabId)
      ? state.activeTabId
      : state.availableTabIds.find((id) => id !== draggedId);
    if (partner) {
      const partnerSlot = Array.from({ length: capacity }, (_, index) => index).find((slot) => slot !== targetSlot) ?? -1;
      group = [{ id: partner, slot: partnerSlot }];
    }
  }

  // Keep a dragged member even when changing from a larger layout to a smaller one.
  if (group.some(({ id }) => id === draggedId) && group.length > capacity) {
    group = [group.find((entry) => entry.id === draggedId)!, ...group.filter(({ id }) => id !== draggedId)];
  }
  group = group.slice(0, capacity);

  const usedSlots = new Set<number>();
  group = group.map((entry) => {
    const preferred = entry.slot;
    if (preferred >= 0 && preferred < capacity && !usedSlots.has(preferred)) {
      usedSlots.add(preferred);
      return entry;
    }
    const free = Array.from({ length: capacity }, (_, index) => index).find((slot) => !usedSlots.has(slot)) ?? 0;
    usedSlots.add(free);
    return { ...entry, slot: free };
  });

  const draggedIndex = group.findIndex(({ id }) => id === draggedId);
  const occupantIndex = group.findIndex(({ slot }) => slot === targetSlot);
  if (draggedIndex >= 0) {
    if (occupantIndex >= 0 && occupantIndex !== draggedIndex) {
      group[occupantIndex].slot = group[draggedIndex].slot;
    }
    group[draggedIndex].slot = targetSlot;
  } else {
    if (occupantIndex >= 0) group.splice(occupantIndex, 1);
    if (group.length >= capacity) group.pop();
    group.push({ id: draggedId, slot: targetSlot });
  }

  group.sort((a, b) => a.slot - b.slot);
  return { tabIds: group.map(({ id }) => id), slotIndexes: group.map(({ slot }) => slot) };
}
