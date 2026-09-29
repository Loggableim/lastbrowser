export async function clearBrowserDataWithFeedback(
  clearData: (() => Promise<{ ok: boolean } | undefined> | { ok: boolean } | undefined) | undefined,
  notify: (cleared: boolean) => void
): Promise<boolean> {
  let cleared = false;
  try {
    cleared = clearData ? (await clearData())?.ok === true : false;
  } catch {
    cleared = false;
  }
  notify(cleared);
  return cleared;
}

export async function clearHistorySelection(
  selection: { history: boolean; cache: boolean; cookies: boolean },
  clearData: ((options: { cache: boolean; cookies: boolean; storage: boolean }) => Promise<{ ok: boolean } | undefined>) | undefined,
  clearHistory: () => void,
  onFailure: () => void
): Promise<boolean> {
  if (selection.cache || selection.cookies) {
    const cleared = await clearBrowserDataWithFeedback(
      clearData ? () => clearData({
        cache: selection.cache,
        cookies: selection.cookies,
        storage: selection.cookies
      }) : undefined,
      (success) => { if (!success) onFailure(); }
    );
    if (!cleared) return false;
  }

  if (selection.history) clearHistory();
  return true;
}
