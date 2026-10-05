import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestScopedWebui } from '../src/main/scoped-webui-request.js';
import { clearAccessAuthCookie, loginAccessPassword, requestWebui } from '../src/main/sidekick-api.js';

const selection = { browserProfileId: 'browser-a', workspacePath: 'C:/controlled/alpha', backendProfileName: 'alpha' };
function fixture() {
  const frame = { url: 'app://bundle/index.html', isDestroyed: () => false };
  const sender = { mainFrame: frame, isDestroyed: () => false, getURL: () => frame.url };
  const event = { sender, senderFrame: frame } as any;
  const options = {
    isShell: (candidate: unknown) => candidate === sender,
    lookupBinding: vi.fn(async () => ({ scope: { browserProfileId: 'browser-a' }, backendProfileName: 'alpha' })),
    request: vi.fn(async (_request: unknown) => ({ enabled: true }))
  };
  return { frame, sender, event, options };
}
const selectedRequest = { path: '/api/teamwork/config', scopeSelection: selection };
afterEach(() => clearAccessAuthCookie());

describe('Main-owned Teamwork profile binding', () => {
  it('resolves the captured Space and sends only its saved backend profile', async () => {
    const { event, options } = fixture();
    await expect(requestScopedWebui(event, { ...selectedRequest, method: 'POST', body: { enabled: true } }, options))
      .resolves.toEqual({ enabled: true });
    expect(options.lookupBinding).toHaveBeenCalledWith('browser-a', 'C:/controlled/alpha', 'alpha');
    expect(options.request).toHaveBeenCalledWith({ path: '/api/teamwork/config', method: 'POST', body: { enabled: true }, profile: 'alpha' });
  });

  it('rejects guests and foreign frames before any lookup or request', async () => {
    const { sender, event, options } = fixture();
    for (const bad of [{ ...event, sender: { ...sender } }, { ...event, senderFrame: { ...sender.mainFrame } }]) {
      await expect(requestScopedWebui(bad, selectedRequest, options)).rejects.toThrow(/Untrusted/);
    }
    expect(options.lookupBinding).not.toHaveBeenCalled();
    expect(options.request).not.toHaveBeenCalled();
  });

  it('rejects navigation during lookup and late responses from replaced frames', async () => {
    const first = fixture();
    first.options.lookupBinding.mockImplementation(async () => {
      first.frame.url = 'https://controlled.invalid/';
      return { scope: { browserProfileId: 'browser-a' }, backendProfileName: 'alpha' };
    });
    await expect(requestScopedWebui(first.event, selectedRequest, first.options)).rejects.toThrow(/Untrusted/);
    expect(first.options.request).not.toHaveBeenCalled();
    const late = fixture();
    late.options.request.mockImplementation(async () => {
      late.sender.mainFrame = { ...late.frame };
      return { enabled: true };
    });
    await expect(requestScopedWebui(late.event, selectedRequest, late.options)).rejects.toThrow(/Untrusted|navigated/);
  });

  it('never defaults a missing or mismatched selected profile', async () => {
    for (const binding of [null, { scope: { browserProfileId: 'foreign' }, backendProfileName: 'alpha' },
      { scope: { browserProfileId: 'browser-a' }, backendProfileName: 'beta' }]) {
      const { event, options } = fixture();
      options.lookupBinding.mockResolvedValue(binding as any);
      await expect(requestScopedWebui(event, selectedRequest, options)).rejects.toThrow(/matching/);
      expect(options.request).not.toHaveBeenCalled();
    }
  });

  it('rejects caller cookies, internal profiles, malformed selections and unrelated scoped endpoints', async () => {
    const { event, options } = fixture();
    for (const bad of [
      { ...selectedRequest, profile: 'beta' }, { ...selectedRequest, backendProfileName: 'beta' },
      ...['Cookie', 'Authorization', 'X-Sidekick-Profile', 'X-Sidekick-Session-Token'].map(key => ({ ...selectedRequest, headers: { [key]: 'foreign' } })),
      { ...selectedRequest, scopeSelection: { ...selection, backendProfileName: '../beta' } },
      { ...selectedRequest, scopeSelection: { ...selection, workspacePath: 5 } },
      { ...selectedRequest, scopeSelection: { ...selection, scope: 'injected' } },
      { ...selectedRequest, path: '/api/settings' },
      { ...selectedRequest, path: '/api/teamwork/config?profile=beta' },
      { ...selectedRequest, path: '/api/teamwork/status', method: 'POST' }
    ]) await expect(requestScopedWebui(event, bad, options)).rejects.toThrow();
    expect(options.lookupBinding).not.toHaveBeenCalled();
    expect(options.request).not.toHaveBeenCalled();
  });

  it('cannot bypass Teamwork binding by omitting the selection or encoding its path', async () => {
    const { event, options } = fixture();
    for (const path of ['/api/teamwork/config', '/api/teamwork/status', '/api/teamwork/config?profile=beta',
      '/api/teamwork/%63onfig', '/api/teamwork/config/']) {
      await expect(requestScopedWebui(event, { path, headers: { Cookie: 'sidekick_profile=beta' } }, options))
        .rejects.toThrow(/Space selection/);
    }
    expect(options.lookupBinding).not.toHaveBeenCalled();
    expect(options.request).not.toHaveBeenCalled();
  });

  it('preserves legacy default requests and each explicitly selected A/B/A binding', async () => {
    const { event, options } = fixture();
    await requestScopedWebui(event, { path: '/api/settings' }, options);
    expect(options.lookupBinding).not.toHaveBeenCalled();
    options.lookupBinding.mockImplementation(async (_browser: string, _workspace: string | null, profile?: string) =>
      ({ scope: { browserProfileId: 'browser-a' }, backendProfileName: profile! }));
    for (const profile of ['alpha', 'beta', 'alpha']) await requestScopedWebui(event,
      { ...selectedRequest, scopeSelection: { ...selection, backendProfileName: profile } }, options);
    expect(options.request.mock.calls.map(([request]) => (request as any).profile)).toEqual([undefined, 'alpha', 'beta', 'alpha']);
  });

  it('composes Main-only profile and dashboard authentication cookies on the real fetch bridge', async () => {
    const calls: RequestInit[] = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith('/api/auth/login')) return new Response('{}', {
        headers: { 'set-cookie': 'sidekick_session=controlled-session; HttpOnly; Path=/' }
      });
      calls.push(init!);
      return new Response('{"enabled":true}');
    };
    clearAccessAuthCookie();
    await loginAccessPassword('http://127.0.0.1:8787', 'controlled-password', fetchImpl);
    await requestWebui('http://127.0.0.1:8787', { path: '/api/teamwork/config', profile: 'alpha' }, fetchImpl);
    await requestWebui('http://127.0.0.1:8787', { path: '/api/teamwork/status', profile: 'beta' }, fetchImpl);
    expect(calls.map(init => new Headers(init.headers).get('cookie'))).toEqual([
      'sidekick_session=controlled-session; sidekick_profile=alpha',
      'sidekick_session=controlled-session; sidekick_profile=beta'
    ]);
  });
});
