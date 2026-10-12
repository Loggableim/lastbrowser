/** Drop a terminal id that the main process no longer owns. */
export function reconcileStoredTerminal(storedId: string, liveIds: readonly string[]): string {
  if (!storedId) return '';
  return liveIds.includes(storedId) ? storedId : '';
}
