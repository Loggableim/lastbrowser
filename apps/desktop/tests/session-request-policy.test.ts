import { describe, expect, it, vi } from 'vitest';
import { installSessionRequestPolicy } from '../src/main/session-request-policy.js';

function fixture(policy: (details: any) => { owned: boolean; allowed: boolean }) {
  const native = new Map<string, any>();
  const session = { webRequest: Object.fromEntries(['onBeforeRequest', 'onBeforeSendHeaders', 'onHeadersReceived']
    .map(event => [event, vi.fn((_filter, callback) => native.set(event, callback))])) };
  installSessionRequestPolicy(session as any, policy);
  const run = (event: string, details: any) => new Promise<any>(resolve => native.get(event)(details, resolve));
  return { session, run };
}
describe('shared session request multiplexer', () => {
  it('preserves UA cleanup and both streaming/CSP + adblock header transforms', async () => {
    const { session, run } = fixture(() => ({ owned: false, allowed: true }));
    session.webRequest.onBeforeSendHeaders((d: any, cb: any) => cb({ requestHeaders: { ...d.requestHeaders, 'User-Agent': 'clean Chrome' } }));
    session.webRequest.onHeadersReceived((d: any, cb: any) => { const h = { ...d.responseHeaders }; delete h['x-frame-options']; cb({ responseHeaders: h }); });
    session.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (d: any, cb: any) => cb({ responseHeaders: { ...d.responseHeaders, 'content-security-policy': ['adblock-csp'] } }));
    const headers = await run('onBeforeSendHeaders', { url: 'https://controlled.test/', requestHeaders: { Accept: '*/*' } });
    expect(headers.requestHeaders).toEqual({ Accept: '*/*', 'User-Agent': 'clean Chrome' });
    const response = await run('onHeadersReceived', { url: 'https://controlled.test/', responseHeaders: { 'x-frame-options': ['deny'], Server: ['test'] } });
    expect(response.responseHeaders).toEqual({ Server: ['test'], 'content-security-policy': ['adblock-csp'] });
    // Ghostery disable unregisters its latest listener only; streaming handling remains.
    session.webRequest.onHeadersReceived(null);
    const disabled = await run('onHeadersReceived', { url: 'https://controlled.test/', responseHeaders: { 'x-frame-options': ['deny'], Server: ['test'] } });
    expect(disabled.responseHeaders).toEqual({ Server: ['test'] });
  });
  it('blocks only attributed worktargets and checks adblock redirects again', async () => {
    const { session, run } = fixture(d => ({ owned: d.webContentsId === 42, allowed: d.url.startsWith('https://allowed.test/') }));
    const adblock = vi.fn((_d, cb) => cb({ redirectURL: 'data:text/plain,blocked' }));
    session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, adblock);
    expect(await run('onBeforeRequest', { url: 'https://foreign.test/', webContentsId: 42 })).toEqual({ cancel: true });
    expect(adblock).not.toHaveBeenCalled();
    expect(await run('onBeforeRequest', { url: 'https://allowed.test/', webContentsId: 42 })).toEqual({ cancel: true });
    expect(await run('onBeforeRequest', { url: 'https://foreign.test/', webContentsId: 11 })).toEqual({ redirectURL: 'data:text/plain,blocked' });
  });
  it('rechecks revoked rights after an async request handler, including websocket and subframe requests', async () => {
    let allowed = true, finish!: (v: any) => void;
    const { session, run } = fixture(() => ({ owned: true, allowed }));
    session.webRequest.onBeforeRequest((_d: any, cb: any) => { finish = cb; });
    const pending = run('onBeforeRequest', { url: 'wss://allowed.test/socket', resourceType: 'webSocket', webContentsId: 42 });
    allowed = false; finish({}); expect(await pending).toEqual({ cancel: true });
  });
});
