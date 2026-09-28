import { describe, expect, it, vi } from 'vitest';
import {
  applySmartInvertToWebview,
  refreshSmartInvertForWebview,
  removeSmartInvertFromWebview
} from '../src/renderer/utils/smart-invert.js';

describe('Smart Invert live WebView lifecycle', () => {
  it('injects once, removes on disable, and can be enabled again without navigation', async () => {
    const insertCSS = vi.fn().mockResolvedValueOnce('inserted-1').mockResolvedValueOnce('inserted-2');
    const removeInsertedCSS = vi.fn().mockResolvedValue(undefined);
    const webview = { insertCSS, removeInsertedCSS } as unknown as Electron.WebviewTag;

    await applySmartInvertToWebview(webview);
    await applySmartInvertToWebview(webview);
    expect(insertCSS).toHaveBeenCalledTimes(1);

    await removeSmartInvertFromWebview(webview);
    expect(removeInsertedCSS).toHaveBeenCalledWith('inserted-1');

    await refreshSmartInvertForWebview(webview, true);
    expect(insertCSS).toHaveBeenCalledTimes(2);
  });

  it('removes a previously inserted style when refresh observes a disabled setting', async () => {
    const insertCSS = vi.fn().mockResolvedValue('inserted');
    const removeInsertedCSS = vi.fn().mockResolvedValue(undefined);
    const webview = { insertCSS, removeInsertedCSS } as unknown as Electron.WebviewTag;

    await applySmartInvertToWebview(webview);
    await refreshSmartInvertForWebview(webview, false);

    expect(removeInsertedCSS).toHaveBeenCalledWith('inserted');
    expect(insertCSS).toHaveBeenCalledTimes(1);
  });

  it('does not throw when a guest is detached during removal', async () => {
    const insertCSS = vi.fn().mockResolvedValue('inserted');
    const removeInsertedCSS = vi.fn().mockRejectedValue(new Error('guest detached'));
    const webview = { insertCSS, removeInsertedCSS } as unknown as Electron.WebviewTag;

    await applySmartInvertToWebview(webview);
    await expect(removeSmartInvertFromWebview(webview)).resolves.toBeUndefined();
  });
});
