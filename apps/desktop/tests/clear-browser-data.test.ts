import { describe, expect, it, vi } from 'vitest';
import { clearBrowserDataWithFeedback, clearHistorySelection } from '../src/renderer/utils/clear-browser-data.js';

describe('browser data clear feedback', () => {
  it('reports success only after the main process confirms every session cleared', async () => {
    const notify = vi.fn();
    const clearData = vi.fn(async () => ({ ok: true }));

    await expect(clearBrowserDataWithFeedback(clearData, notify)).resolves.toBe(true);
    expect(clearData).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(true);
  });

  it('reports a partial clear failure instead of showing the success toast', async () => {
    const notify = vi.fn();
    const clearData = vi.fn(async () => ({ ok: false }));

    await expect(clearBrowserDataWithFeedback(clearData, notify)).resolves.toBe(false);
    expect(notify).toHaveBeenCalledWith(false);
  });

  it('reports missing bridge and thrown IPC errors as failures', async () => {
    const notifyMissing = vi.fn();
    await expect(clearBrowserDataWithFeedback(undefined, notifyMissing)).resolves.toBe(false);
    expect(notifyMissing).toHaveBeenCalledWith(false);

    const notifyRejected = vi.fn();
    await expect(clearBrowserDataWithFeedback(async () => { throw new Error('IPC failed'); }, notifyRejected)).resolves.toBe(false);
    expect(notifyRejected).toHaveBeenCalledWith(false);
  });

  it('keeps the history dialog open path from clearing history when browser-data cleanup fails', async () => {
    const clearHistory = vi.fn();
    const onFailure = vi.fn();
    const clearData = vi.fn(async () => ({ ok: false }));

    await expect(clearHistorySelection(
      { history: true, cache: true, cookies: false },
      clearData,
      clearHistory,
      onFailure
    )).resolves.toBe(false);

    expect(clearData).toHaveBeenCalledWith({ cache: true, cookies: false, storage: false });
    expect(clearHistory).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledOnce();
  });

  it('clears browser history after the selected browser-data categories succeed', async () => {
    const clearHistory = vi.fn();
    const clearData = vi.fn(async () => ({ ok: true }));

    await expect(clearHistorySelection(
      { history: true, cache: false, cookies: true },
      clearData,
      clearHistory,
      vi.fn()
    )).resolves.toBe(true);

    expect(clearData).toHaveBeenCalledWith({ cache: false, cookies: true, storage: true });
    expect(clearHistory).toHaveBeenCalledOnce();
  });
});
