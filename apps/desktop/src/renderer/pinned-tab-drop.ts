import type { BrowserTab } from './tabs.js';

export const PINNED_TAB_DRAG_TYPE = 'application/x-lastbrowser-tab';
let activeDrag: { tabId: string; token: string } | null = null;

/** Only a tab drag started by this renderer can create a persisted app. */
export function preparePinnedTabDrag(transfer: Pick<DataTransfer, 'setData'>, tabId: string): void {
  activeDrag = { tabId, token: crypto.randomUUID() };
  transfer.setData(PINNED_TAB_DRAG_TYPE, activeDrag.token);
}

export function canAcceptPinnedTabDrag(transfer: Pick<DataTransfer, 'types'>, draggedTabId: string | null | undefined): boolean {
  return Boolean(draggedTabId && activeDrag?.tabId === draggedTabId && Array.from(transfer.types).includes(PINNED_TAB_DRAG_TYPE));
}

export function resolvePinnedTabDrop(transfer: Pick<DataTransfer, 'types' | 'getData'>, draggedTabId: string | null | undefined, tabs: BrowserTab[]): BrowserTab | undefined {
  if (!canAcceptPinnedTabDrag(transfer, draggedTabId) || transfer.getData(PINNED_TAB_DRAG_TYPE) !== activeDrag?.token || transfer.getData('text/plain') !== draggedTabId) return;
  activeDrag = null;
  return tabs.find(tab => tab.id === draggedTabId && canPinBrowserTab(tab));
}

export function canPinBrowserTab(tab: BrowserTab): boolean {
  // An incognito drag must not persist private browsing data into ordinary pins.
  if (tab.incognito) return false;
  try { return ['http:', 'https:'].includes(new URL(tab.discardedUrl || tab.url).protocol); }
  catch { return false; }
}
