import { beforeEach, describe, expect, it } from 'vitest';
import { prepareSnapTabDrag } from '../src/renderer/types/snap-layouts.js';
import { canAcceptPinnedTabDrag, canPinBrowserTab, PINNED_TAB_DRAG_TYPE, resolvePinnedTabDrop } from '../src/renderer/pinned-tab-drop.js';
import { PINNED_APPS_STORAGE_KEY_V2, usePinnedAppStore } from '../src/renderer/stores/usePinnedAppStore.js';

function transfer() {
  const data = new Map<string, string>();
  return { effectAllowed: 'all' as DataTransfer['effectAllowed'], get types() { return [...data.keys()]; }, setData: (type: string, value: string) => data.set(type, value), getData: (type: string) => data.get(type) || '' };
}
const tab = { id: 'open-tab', title: 'Research Board - Quarter 4 Launch Plan With Full Source Title', url: 'https://pin-proof.example/board', favicon: 'data:image/png;base64,aGVsbG8=' };
beforeEach(() => usePinnedAppStore.getState().setApps([]));
describe('open tab to pinned app drop', () => {
  it('accepts an internal live tab and persists its source details and owning Space without removing it', () => {
    const writes = new Map<string, string>();
    const previousWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { setItem: (key: string, value: string) => writes.set(key, value) } } });
    try {
      const tabs = [tab], data = transfer();
      prepareSnapTabDrag(data, tab.id);
      expect(canAcceptPinnedTabDrag(data, tab.id)).toBe(true);
      const dropped = resolvePinnedTabDrop(data, tab.id, tabs)!;
      const app = usePinnedAppStore.getState().pinTabAsApp(dropped, 'spaces/research');
      expect(app).toMatchObject({ name: tab.title, url: tab.url, faviconUrl: tab.favicon, spacePath: 'spaces/research' });
      expect(JSON.parse(writes.get(PINNED_APPS_STORAGE_KEY_V2)!)).toEqual([app]);
      expect(tabs).toEqual([tab]);
      expect(resolvePinnedTabDrop(data, tab.id, tabs)).toBeUndefined();
    } finally { Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow }); }
  });
  it('rejects text URLs, spoofed custom payloads, closed tabs, and another renderer drag', () => {
    const external = transfer(); external.setData('text/plain', tab.id);
    expect(resolvePinnedTabDrop(external, tab.id, [tab])).toBeUndefined();
    const internal = transfer(); prepareSnapTabDrag(internal, tab.id);
    external.setData(PINNED_TAB_DRAG_TYPE, 'untrusted-external');
    expect(resolvePinnedTabDrop(external, tab.id, [tab])).toBeUndefined();
    expect(resolvePinnedTabDrop(internal, null, [tab])).toBeUndefined();
    expect(resolvePinnedTabDrop(internal, tab.id, [])).toBeUndefined();
  });
  it('does not persist incognito, internal, script, or malformed destinations', () => {
    expect(canPinBrowserTab({ ...tab, incognito: true })).toBe(false);
    for (const url of ['lastbrowser://start', 'javascript:void(0)', 'about:blank', 'not a url']) {
      expect(canPinBrowserTab({ ...tab, url })).toBe(false);
    }
    expect(canPinBrowserTab({ ...tab, url: 'about:blank', discardedUrl: tab.url })).toBe(true);
  });
  it('deduplicates canonical www hosts symmetrically but keeps other subdomains separate', () => {
    const store = usePinnedAppStore.getState();
    for (const [firstUrl, secondUrl] of [
      ['https://www.pin-proof.example/one', 'https://pin-proof.example/two'],
      ['https://pin-proof.example/one', 'https://www.pin-proof.example/two']
    ]) {
      store.setApps([]);
      const first = store.pinTabAsApp({ ...tab, url: firstUrl }, 'spaces/research');
      const second = store.pinTabAsApp({ ...tab, url: secondUrl }, 'spaces/research');
      expect(second.id).toBe(first.id);
    }
    for (const [firstUrl, secondUrl] of [
      ['https://docs.pin-proof.example/', 'https://pin-proof.example/'],
      ['https://pin-proof.example/', 'https://docs.pin-proof.example/']
    ]) {
      store.setApps([]);
      const first = store.pinTabAsApp({ ...tab, url: firstUrl }, 'spaces/research');
      const second = store.pinTabAsApp({ ...tab, url: secondUrl }, 'spaces/research');
      expect(second.id).not.toBe(first.id);
      expect(usePinnedAppStore.getState().apps).toHaveLength(2);
    }
    store.setApps([]);
    const docs = store.pinTabAsApp({ ...tab, url: 'https://docs.pin-proof.example/' }, 'spaces/research');
    const blog = store.pinTabAsApp({ ...tab, url: 'https://blog.pin-proof.example/' }, 'spaces/research');
    expect(blog.id).not.toBe(docs.id);
  });

  it('keeps same-host dedupe scoped to the owning Space', () => {
    const store = usePinnedAppStore.getState();
    const first = store.pinTabAsApp(tab, 'spaces/research');
    expect(store.pinTabAsApp({ ...tab, url: 'https://pin-proof.example/other' }, 'spaces/research').id).toBe(first.id);
    store.pinTabAsApp(tab, 'spaces/other');
    expect(usePinnedAppStore.getState().apps).toHaveLength(2);
  });
});
