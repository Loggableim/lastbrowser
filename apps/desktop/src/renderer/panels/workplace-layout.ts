export const WORKPLACE_WIDGETS = ['search', 'spaces', 'quickActions', 'speedDial', 'bookmarks', 'recent', 'notes', 'focus', 'tasks'] as const;
export type WorkplaceWidgetId = typeof WORKPLACE_WIDGETS[number];
export type WorkplaceDock = 'top' | 'main' | 'bottom';
export type WorkplaceSize = 'compact' | 'medium' | 'wide';
export type WorkplaceLayout = { order: WorkplaceWidgetId[]; tiles: Record<WorkplaceWidgetId, { dock: WorkplaceDock; size: WorkplaceSize }> };
export function defaultWorkplaceLayout(): WorkplaceLayout {
  return { order: [...WORKPLACE_WIDGETS], tiles: Object.fromEntries(WORKPLACE_WIDGETS.map(id => [id, {
    dock: id === 'search' || id === 'spaces' ? 'top' : 'main',
    size: id === 'search' || id === 'spaces' || id === 'quickActions' ? 'wide' : 'compact'
  }])) as WorkplaceLayout['tiles'] };
}
export function parseWorkplaceLayout(raw: unknown): WorkplaceLayout {
  const result = defaultWorkplaceLayout();
  if (!raw || typeof raw !== 'object') return result;
  const value = raw as Partial<WorkplaceLayout>;
  if (Array.isArray(value.order)) {
    const known = value.order.filter((id): id is WorkplaceWidgetId => WORKPLACE_WIDGETS.includes(id));
    result.order = [...new Set([...known, ...WORKPLACE_WIDGETS])];
  }
  for (const id of WORKPLACE_WIDGETS) {
    const tile = value.tiles?.[id];
    if (!tile || typeof tile !== 'object') continue;
    if (['top', 'main', 'bottom'].includes(tile.dock)) result.tiles[id].dock = tile.dock;
    if (['compact', 'medium', 'wide'].includes(tile.size)) result.tiles[id].size = tile.size;
  }
  return result;
}
export function moveWorkplaceWidget(layout: WorkplaceLayout, id: WorkplaceWidgetId, target: WorkplaceWidgetId | null, dock: WorkplaceDock): WorkplaceLayout {
  if (!WORKPLACE_WIDGETS.includes(id) || target === id) return layout;
  const order = layout.order.filter(item => item !== id);
  const index = target ? order.indexOf(target) : -1;
  order.splice(index < 0 ? order.length : index, 0, id);
  return { order, tiles: { ...layout.tiles, [id]: { ...layout.tiles[id], dock } } };
}
