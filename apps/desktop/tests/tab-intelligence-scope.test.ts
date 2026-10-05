import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ contents: [] as any[], fetch: vi.fn() }));
vi.mock('electron', () => ({ webContents: { getAllWebContents: () => fake.contents }, net: { fetch: fake.fetch } }));
import { extractActiveWebview, synthesizeTabs } from '../src/main/tab-intelligence.js';

const guest = (id: number, owner: number, focused = false) => ({ id, hostWebContents: { id: owner }, isDestroyed: () => false,
  isFocused: () => focused, getType: () => 'webview', getURL: () => 'https://same.test/',
  executeJavaScript: vi.fn(async () => ({ title: `Account ${id}`, url: 'https://same.test/', text: `Account ${id}`, html: `<body>Account ${id}</body>` })) });
const authority = { isAllowed: (wc: any) => wc.hostWebContents?.id === 1, allowNetworkFetch: false };
beforeEach(() => { fake.contents.length = 0; fake.fetch.mockReset(); });
describe('legacy tab IPC uses caller ownership instead of global URL/first-tab fallback', () => {
  it('does not read another shell even for identical URLs', async () => {
    const foreign = guest(20, 2), own = guest(10, 1); fake.contents.push(foreign, own);
    await synthesizeTabs({ tabs: [{ id: 'picked', title: 'Selected', url: 'https://same.test/' }] }, authority);
    expect(own.executeJavaScript).toHaveBeenCalled(); expect(foreign.executeJavaScript).not.toHaveBeenCalled(); expect(fake.fetch).not.toHaveBeenCalled();
  });
  it('refuses ambiguous same-URL owned guests and does not fetch under a different session', async () => {
    const a = guest(10, 1), b = guest(11, 1); fake.contents.push(a, b);
    const result = await synthesizeTabs({ tabs: [{ id: 'picked', title: 'Selected', url: 'https://same.test/' }] }, authority);
    expect(result.tabCount).toBe(0); expect(a.executeJavaScript).not.toHaveBeenCalled(); expect(b.executeJavaScript).not.toHaveBeenCalled(); expect(fake.fetch).not.toHaveBeenCalled();
  });
  it('reads only the unique focused owned guest for active context', async () => {
    const foreign = guest(20, 2, true), unfocused = guest(10, 1); fake.contents.push(foreign, unfocused);
    expect(await extractActiveWebview(4000, authority)).toBeNull(); expect(foreign.executeJavaScript).not.toHaveBeenCalled();
  });
});
