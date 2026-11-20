import { EventEmitter, once } from 'node:events';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { MenuItemConstructorOptions, WebContents } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerBrowserContextMenu } from '../src/main/browser-context-menu.js';
import { captureHandoffTarget, createSidekickTabHandoff } from '../src/main/sidekick-tab-handoff.js';

vi.mock('electron', () => ({ BrowserWindow: { fromWebContents: (host: { owner: unknown }) => host.owner } }));

const code = 'a1'.repeat(16);
const token = 'b2'.repeat(32);
const originalOrigin = 'https://signin.example';
const pending = { runId: 'run-one', approvalId: 'approval-one' };

class Host extends EventEmitter {
  owner = { isDestroyed: () => false };
  isDestroyed() { return false; }
}

class Guest extends EventEmitter {
  url = `${originalOrigin}/login?private=value#form`;
  type = 'webview';
  destroyed = false;
  loading = false;
  hostWebContents = new Host();
  executeJavaScriptInIsolatedWorld = vi.fn(async () => 'Authorized visible fixture');

  constructor(public session: object) { super(); }
  setWindowOpenHandler() {}
  canGoBack() { return false; }
  canGoForward() { return false; }
  getURL() { return this.url; }
  getType() { return this.type; }
  isCrashed() { return false; }
  isDestroyed() { return this.destroyed; }
  isLoadingMainFrame() { return this.loading; }

  target() {
    return captureHandoffTarget(this as unknown as WebContents);
  }
}

function select(handoff: ReturnType<typeof createSidekickTabHandoff>, guest: Guest, host = guest.hostWebContents) {
  handoff.setSelectedGuest(host as unknown as WebContents, guest as unknown as WebContents);
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(close => close()));
});

async function listener(read = false) {
  const requests: Array<{ path: string; headers: IncomingHttpHeaders; body: unknown }> = [];
  let current: typeof pending | null = pending;
  let redirect = false;
  let active = true;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const path = req.url!;
    requests.push({ path, headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString()) });
    res.setHeader('Content-Type', 'application/json');
    if (redirect && path.endsWith('/pair')) {
      res.writeHead(307, { Location: '/redirected' }).end();
    } else if (path.endsWith('/pair')) {
      res.end(JSON.stringify({ session: token }));
    } else if (path.endsWith('/pending')) {
      res.end(JSON.stringify({ pending: current }));
    } else if (path.endsWith('/return')) {
      res.end(JSON.stringify({ returned: true, ...(read && { read }) }));
    } else if (path.endsWith('/read')) {
      res.end(JSON.stringify(active ? { active, requestId: 'read-one' } : { active }));
    } else {
      active = false;
      res.end(JSON.stringify({ accepted: true }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  cleanups.push(() => new Promise(resolve => server.close(() => resolve())));
  const address = server.address() as { port: number };
  return {
    invitation: `http://127.0.0.1:${address.port}/lastbrowser/v1/#${code}`,
    requests,
    setPending: (next: typeof pending | null) => { current = next; },
    rejectRedirect: () => { redirect = true; }
  };
}

const approve = async () => true;

describe('native Sidekick tab handoff', () => {
  it('pairs and returns only from the exact webview and session, exporting only origin and opaque IDs', async () => {
    const server = await listener();
    const handoff = createSidekickTabHandoff();
    const profile = {};
    const paired = new Guest(profile);
    const otherTab = new Guest(profile);
    const otherProfile = new Guest({});

    await expect(handoff.pair(paired.target()!, server.invitation, approve)).resolves.toBe('paired');
    select(handoff, paired);
    for (const guest of [otherTab, otherProfile]) {
      expect(handoff.canReturn(guest.target()!)).toBe(false);
      await expect(handoff.returnTab(guest.target()!, approve)).resolves.toBe('unavailable');
    }
    paired.session = otherProfile.session;
    await expect(handoff.returnTab(paired.target()!, approve)).resolves.toBe('unavailable');
    paired.session = profile;
    paired.url = `${originalOrigin}/finished`;
    await expect(handoff.returnTab(paired.target()!, approve)).resolves.toBe('returned');
    await expect(handoff.returnTab(paired.target()!, approve)).resolves.toBe('unavailable');
    expect(server.requests.map(({ path, body }) => [path, body])).toEqual([
      ['/lastbrowser/v1/handoff/pair', { version: 1, code, origin: originalOrigin }],
      ['/lastbrowser/v1/handoff/pending', { version: 1 }],
      ['/lastbrowser/v1/handoff/pending', { version: 1 }],
      ['/lastbrowser/v1/handoff/return', { version: 1, ...pending, origin: originalOrigin }]
    ]);
    for (const [index, req] of server.requests.entries()) {
      expect(req.headers.origin).toBeUndefined();
      expect(req.headers.referer).toBeUndefined();
      expect(req.headers.cookie).toBeUndefined();
      expect(req.headers.authorization).toBe(index === 0 ? undefined : `Bearer ${token}`);
    }
  });

  it('requires a loaded browser tab at the paired origin and rejects navigation during native confirmation', async () => {
    const server = await listener();
    const handoff = createSidekickTabHandoff();
    const guest = new Guest({});
    select(handoff, guest);
    guest.loading = true;
    expect(guest.target()).toBeUndefined();
    guest.loading = false;
    guest.type = 'window';
    expect(guest.target()).toBeUndefined();
    guest.type = 'webview';
    guest.url = 'https://fixture-user:fixture-password@signin.example/';
    expect(guest.target()).toBeUndefined();
    guest.url = originalOrigin;
    await expect(handoff.pair(guest.target()!, server.invitation, approve)).resolves.toBe('paired');
    guest.url = 'https://identity.example/';
    await expect(handoff.returnTab(guest.target()!, approve)).resolves.toBe('unavailable');
    guest.url = originalOrigin;
    await expect(handoff.returnTab(guest.target()!, async () => {
      guest.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
      return true;
    })).resolves.toBe('unavailable');
    expect(server.requests.map(req => req.path.split('/').at(-1))).toEqual(['pair', 'pending']);
  });

  it.each([null, { ...pending, runId: 'wrong-run' }, { ...pending, approvalId: 'wrong-approval' }])(
    'rejects canceled or replaced approval during confirmation with subsequent pending state %j', async next => {
      const server = await listener();
      const handoff = createSidekickTabHandoff();
      const guest = new Guest({});
      select(handoff, guest);
      await handoff.pair(guest.target()!, server.invitation, approve);
      await expect(handoff.returnTab(guest.target()!, async () => {
        server.setPending(next);
        return true;
      })).resolves.toBe('stale');
      expect(server.requests.map(req => req.path.split('/').at(-1))).toEqual(['pair', 'pending', 'pending']);
    });

  it('honors local cancellation and rejects duplicate in-flight return actions', async () => {
    const server = await listener();
    const handoff = createSidekickTabHandoff();
    const guest = new Guest({});
    select(handoff, guest);
    await handoff.pair(guest.target()!, server.invitation, approve);
    const returning = handoff.returnTab(guest.target()!, async () => {
      await expect(handoff.returnTab(guest.target()!, approve)).resolves.toBe('busy');
      return false;
    });
    await expect(returning).resolves.toBe('cancelled');
    server.setPending(null);
    await expect(handoff.returnTab(guest.target()!, approve)).resolves.toBe('no-pending');
    expect(server.requests.map(req => req.path.split('/').at(-1))).toEqual(['pair', 'pending', 'pending']);
  });

  it('requires the exact loopback invitation and refuses redirects', async () => {
    const server = await listener();
    const handoff = createSidekickTabHandoff();
    const guest = new Guest({});
    for (const invitation of [
      server.invitation.replace('127.0.0.1', 'localhost'),
      server.invitation.replace('127.0.0.1', '127.0.0.1@evil.example'),
      server.invitation.replace('127.0.0.1', '127.1'),
      server.invitation.replace('/v1/', '/v1/?query'),
      server.invitation.replace('http:', 'https:')
    ]) {
      await expect(handoff.pair(guest.target()!, invitation, approve)).resolves.toBe('invalid-invitation');
    }
    expect(server.requests).toHaveLength(0);
    server.rejectRedirect();
    await expect(handoff.pair(guest.target()!, server.invitation, approve)).resolves.toBe('failed');
    expect(server.requests).toHaveLength(1);
  });

  it('exposes the actions in the originating guest’s native menu and prompts in its own window', async () => {
    const server = await listener();
    const app = new EventEmitter();
    const guest = new Guest({});
    const neighbor = new Guest(guest.session);
    const handoff = createSidekickTabHandoff();
    select(handoff, guest);
    const readText = vi.fn(() => server.invitation);
    const showMessageBox = vi.fn(async () => ({ response: 1 }));
    const popup = vi.fn();
    let items: MenuItemConstructorOptions[] = [];
    registerBrowserContextMenu({
      app: app as never,
      Menu: { buildFromTemplate: template => { items = template; return { popup }; } },
      clipboard: { readText } as never,
      dialog: { showMessageBox } as never,
      handoff,
      shell: {} as never,
      getWindow: () => null,
      getLocale: () => 'de-DE'
    });
    const openMenu = async (contents: Guest) => {
      await contents.listeners('context-menu')[0]({}, {
        linkURL: '', pageURL: contents.url, selectionText: 'Fixture', editFlags: {}, isEditable: false
      });
      return items.map(item => item.label);
    };
    const pairLabel = 'Tab mit Sidekick verbinden…';
    const returnLabel = 'An Sidekick zurückgeben…';
    const click = (label: string) => items.find(item => item.label === label)?.click?.({} as never, undefined, {} as never);
    for (const tab of [guest, neighbor]) app.emit('web-contents-created', {}, tab);
    expect(await openMenu(guest)).toContain(pairLabel);
    expect(items.map(item => item.label)).not.toContain(returnLabel);
    expect(readText).not.toHaveBeenCalled();
    expect(popup).toHaveBeenLastCalledWith({ window: guest.hostWebContents.owner });
    click(pairLabel);
    await vi.waitFor(() => expect(showMessageBox).toHaveBeenCalledTimes(2));
    expect(showMessageBox).toHaveBeenNthCalledWith(1, guest.hostWebContents.owner, expect.objectContaining({
      detail: originalOrigin, message: pairLabel
    }));
    expect(await openMenu(neighbor)).not.toContain(returnLabel);
    expect(await openMenu(guest)).toContain(returnLabel);
    click(returnLabel);
    await vi.waitFor(() => expect(showMessageBox).toHaveBeenCalledTimes(4));
    expect(showMessageBox).toHaveBeenNthCalledWith(3, guest.hostWebContents.owner, expect.objectContaining({
      detail: expect.stringContaining('einen begrenzten Ausschnitt des sichtbaren Seitentexts')
    }));
    expect(await openMenu(guest)).not.toContain(returnLabel);
    expect(readText).toHaveBeenCalledOnce();
    expect(server.requests.at(-1)?.body).toEqual({ version: 1, ...pending, origin: originalOrigin });
  });

  it('gives one fixed-world visible-text response for the handed-back run', async () => {
    const server = await listener(true);
    const handoff = createSidekickTabHandoff();
    const guest = new Guest({});
    select(handoff, guest);
    await handoff.pair(guest.target()!, server.invitation, approve);
    await expect(handoff.returnTab(guest.target()!, approve)).resolves.toBe('returned');
    await vi.waitFor(() => expect(server.requests.find(req => req.path.endsWith('/result'))?.body).toEqual({
      version: 1, runId: pending.runId, requestId: 'read-one', text: 'Authorized visible fixture'
    }));
    await vi.waitFor(() => expect(server.requests.at(-1)?.path).toBe('/lastbrowser/v1/handoff/read'));
    expect(guest.executeJavaScriptInIsolatedWorld).toHaveBeenCalledOnce();
    expect(guest.executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(1102, [{ code: expect.any(String) }], false);
  });

  it.each(['tab switch', 'profile switch', 'redirect out and back', 'destruction'])('revokes a pending snapshot on %s', async event => {
    const server = await listener(true);
    const handoff = createSidekickTabHandoff();
    const guest = new Guest({});
    const second = new Guest(event === 'profile switch' ? {} : guest.session);
    second.hostWebContents = guest.hostWebContents;
    select(handoff, guest);
    let finish!: (text: string) => void;
    guest.executeJavaScriptInIsolatedWorld.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await handoff.pair(guest.target()!, server.invitation, approve);
    await handoff.returnTab(guest.target()!, approve);
    await vi.waitFor(() => expect(guest.executeJavaScriptInIsolatedWorld).toHaveBeenCalledOnce());
    if (event === 'tab switch' || event === 'profile switch') {
      select(handoff, second);
      select(handoff, guest);
    } else if (event === 'destruction') {
      guest.emit('destroyed');
    } else {
      guest.emit('did-redirect-navigation', { isMainFrame: true, url: 'https://other.example' });
      guest.emit('did-redirect-navigation', { isMainFrame: true, url: originalOrigin });
    }
    finish('Stale fixture text');
    await vi.waitFor(() => expect(server.requests.at(-1)?.path).toBe('/lastbrowser/v1/handoff/revoke'));
    expect(server.requests.at(-1)?.body).toEqual({ version: 1, runId: pending.runId });
    expect(server.requests.some(req => req.path.endsWith('/result'))).toBe(false);
    expect(second.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
  });
});
