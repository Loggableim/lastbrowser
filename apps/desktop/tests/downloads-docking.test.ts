import { describe, expect, it } from 'vitest';
import { anchoredDownloadBounds, clampDownloadBounds, downloadDockTarget, downloadDockZoneBounds, getDownloadAnchors, parseDownloadDockState } from '../src/renderer/downloads-docking.js';
const rect = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height, width, height }) as DOMRect;
describe('download docking geometry and persistence', () => {
  it('rejects malformed persistence and unsupported dock modes', () => {
    expect(parseDownloadDockState('{', 800, 600).mode).toBe('top');
    expect(parseDownloadDockState('{"mode":"old","bounds":{}}', 800, 600).mode).toBe('top');
    expect(parseDownloadDockState('{"mode":"sidebar","bounds":{"x":"bad","y":-8,"width":9999,"height":null}}', 800, 600)).toEqual({ mode: 'sidebar', bounds: { x: 0, y: 0, width: 800, height: 340 } });
  });
  it('keeps the entire panel reachable after viewport shrink including tiny viewports', () => {
    expect(clampDownloadBounds({ x: 900, y: 600, width: 500, height: 400 }, 320, 220)).toEqual({ x: 0, y: 0, width: 320, height: 220 });
    expect(clampDownloadBounds({ x: NaN, y: Infinity, width: -1, height: -1 }, 100, 90)).toEqual({ x: 0, y: 0, width: 100, height: 90 });
  });
  it('offers snapping only near actual visible anchor rectangles', () => {
    expect(downloadDockTarget(700, 40, {})).toBeNull();
    expect(downloadDockTarget(700, 40, { top: rect(680, 20, 32, 32) })).toBe('top');
    expect(downloadDockTarget(70, 560, { sidebar: rect(20, 540, 140, 32) })).toBe('sidebar');
    expect(downloadDockTarget(300, 300, { top: rect(680, 20, 32, 32) })).toBeNull();
    expect(downloadDockTarget(0, 0, { top: rect(0, 0, 0, 0) })).toBeNull();
  });
  it('shows and hit-tests the same clipped zone around each rendered anchor', () => {
    const sidebar = rect(20, 540, 140, 32);
    const zone = downloadDockZoneBounds(sidebar, 800, 600);
    expect(zone).toEqual({ x: 0, y: 516, width: 184, height: 80 });
    expect(downloadDockTarget(zone.x + zone.width / 2, zone.y + zone.height / 2, { sidebar })).toBe('sidebar');
  });
  it('positions dropdown below toolbar and sidebar expansion above bottom entry', () => {
    const bounds = { x: 0, y: 0, width: 300, height: 200 };
    expect(anchoredDownloadBounds('top', rect(600, 20, 32, 32), bounds, 800, 600)).toEqual({ ...bounds, x: 332, y: 60 });
    expect(anchoredDownloadBounds('sidebar', rect(20, 540, 140, 32), bounds, 800, 600)).toEqual({ ...bounds, x: 20, y: 332 });
  });
  it('ignores hidden launcher buttons normally, offers their rendered hosts during a drag, and excludes a hidden sidebar', () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const styles = new Map<object, { display: string; visibility: string; opacity: string }>();
        const makeElement = (rectValue: DOMRect, style: { display: string; visibility: string; opacity: string }, parent: object | null = null) => {
      const element: Record<string, unknown> = {
        isConnected: true,
        parentElement: parent,
        getBoundingClientRect: () => rectValue,
        getClientRects: () => parent && styles.get(parent)?.display === 'none' ? [] : [rectValue]
      };
      styles.set(element, style);
      return element;
    };
    const body = makeElement(rect(0, 0, 800, 600), { display: 'block', visibility: 'visible', opacity: '1' });
    const topWrapper = makeElement(rect(700, 10, 32, 32), { display: 'inline-flex', visibility: 'visible', opacity: '1' }, body);
    const topButton = makeElement(rect(700, 10, 32, 32), { display: 'inline-flex', visibility: 'visible', opacity: '1' }, topWrapper);
    (topWrapper as { querySelector: () => object }).querySelector = () => topButton;
    (topButton as { getAttribute: () => null }).getAttribute = () => null;
    const sidebarParent = makeElement(rect(0, 0, 200, 600), { display: 'block', visibility: 'visible', opacity: '1' }, body);
    const sidebarWrapper = makeElement(rect(10, 540, 140, 32), { display: 'inline-flex', visibility: 'visible', opacity: '1' }, sidebarParent);
    const sidebarButton = makeElement(rect(10, 540, 140, 32), { display: 'inline-flex', visibility: 'hidden', opacity: '1' }, sidebarWrapper);
    (sidebarWrapper as { querySelector: () => object }).querySelector = () => sidebarButton;
    (sidebarButton as { getAttribute: () => string }).getAttribute = () => 'true';
    const fakeWindow = {
      innerWidth: 800, innerHeight: 600,
      getComputedStyle: (element: object) => ({ ...(styles.get(element) ?? { display: 'block', visibility: 'visible', opacity: '1' }), getPropertyValue: () => '' })
    };
    const fakeDocument = { querySelectorAll: (selector: string) => selector.includes('top') ? [topWrapper] : [sidebarWrapper] };
    Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument });
    try {
      expect(Object.keys(getDownloadAnchors())).toEqual(['top']);
      expect(Object.keys(getDownloadAnchors({ includeInactive: true }))).toEqual(['top', 'sidebar']);
      styles.set(sidebarParent, { display: 'none', visibility: 'visible', opacity: '1' });
      expect(Object.keys(getDownloadAnchors({ includeInactive: true }))).toEqual(['top']);
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else Reflect.deleteProperty(globalThis, 'window');
      if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else Reflect.deleteProperty(globalThis, 'document');
    }
  });
});
