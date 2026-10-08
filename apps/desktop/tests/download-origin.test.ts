import { describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { createDownloadOriginTracker } from '../src/main/download-origin.js';

function guest() {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  return {
    id: 7, getType: () => 'webview', getZoomFactor: () => 2,
    hostWebContents: { isDestroyed: () => false, executeJavaScript: vi.fn(async () => ({ x: 100, y: 40, width: 400, height: 200, viewportWidth: 800, viewportHeight: 600 })) },
    executeJavaScriptInIsolatedWorld: vi.fn(async () => ({ href: 'https://example.com/file.zip', width: 200, height: 100 })),
    on: (name: string, fn: (...args: unknown[]) => void) => listeners.set(name, fn),
    once: (name: string, fn: (...args: unknown[]) => void) => listeners.set(name, fn),
    fire: (name: string, input?: unknown) => listeners.get(name)?.({}, input)
  };
}
describe('download start origin', () => {
  it('maps guest zoom and viewport bounds and consumes one matching link gesture', async () => {
    const tracker = createDownloadOriginTracker(), page = guest();
    tracker.observe(page as unknown as WebContents);
    page.fire('before-mouse-event', { type: 'mouseDown', button: 'left', x: 80, y: 60 });
    page.fire('before-mouse-event', { type: 'mouseUp', button: 'left', x: 80, y: 60 });
    expect(await tracker.resolve(page, ['https://example.com/file.zip'])).toEqual({ x: 180, y: 100, webContentsId: 7 });
    expect(await tracker.resolve(page, ['https://example.com/file.zip'])).toBeUndefined();
  });
  it('never attaches unrelated URLs or another guest to a recent click', async () => {
    const tracker = createDownloadOriginTracker(), page = guest();
    tracker.observe(page as unknown as WebContents);
    page.fire('before-mouse-event', { type: 'mouseDown', button: 'left', x: 20, y: 20 });
    expect(await tracker.resolve({ id: 8 }, ['https://example.com/file.zip'])).toBeUndefined();
    expect(await tracker.resolve(page, ['https://example.com/background.zip'])).toBeUndefined();
  });
  it('rejects invalid geometry and navigation', async () => {
    const tracker = createDownloadOriginTracker(), page = guest();
    tracker.observe(page as unknown as WebContents);
    page.fire('before-mouse-event', { type: 'mouseDown', button: 'left', x: Infinity, y: 20 });
    expect(await tracker.resolve(page, ['https://example.com/file.zip'])).toBeUndefined();
    page.fire('before-mouse-event', { type: 'mouseDown', button: 'left', x: 20, y: 20 });
    page.fire('did-navigate');
    expect(await tracker.resolve(page, ['https://example.com/file.zip'])).toBeUndefined();
  });
  it('invalidates mouse provenance on keyboard activation and expires old clicks', async () => {
    const tracker = createDownloadOriginTracker(), page = guest();
    tracker.observe(page as unknown as WebContents);
    page.fire('before-mouse-event', { type: 'mouseDown', button: 'left', x: 20, y: 20 });
    page.fire('before-input-event', { type: 'keyDown', key: 'Enter' });
    expect(await tracker.resolve(page, ['https://example.com/file.zip'])).toBeUndefined();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    page.fire('before-mouse-event', { type: 'mouseDown', button: 'left', x: 20, y: 20 });
    clock.mockReturnValue(2201);
    expect(await tracker.resolve(page, ['https://example.com/file.zip'])).toBeUndefined();
    clock.mockRestore();
  });
});
