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
      ...['Cookie', 'Authorization', 'X-Sidekick-Profile', 'X-Sidekick-Session-Token', 'X-LastBrowser-Bridge-Token'].map(key => ({ ...selectedRequest, headers: { [key]: 'foreign' } })),
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

  it('rejects absolute, authority and backslash paths before binding lookup or request', async () => {
    const { event, options } = fixture();
    const paths = [
      'https://attacker.invalid/api/providers',
      '//attacker.invalid/api/providers',
      '///attacker.invalid/api/providers',
      '\\\\attacker.invalid\\api\\providers',
      '/api\\providers'
    ];
    for (const path of paths) {
      await expect(requestScopedWebui(event, { path, scopeSelection: selection }, options))
        .rejects.toThrow(/Invalid WebUI bridge path/);
    }
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

  it('binds provider settings and both live and provider-specific model catalogs to the selected saved Space', async () => {
    const { event, options } = fixture();
    const requests = [
      { method: 'GET', path: '/api/providers' },
      { method: 'POST', path: '/api/providers', body: { provider: 'xiaomi', api_key: 'synthetic-test-key', base_url: 'https://api.xiaomimimo.com/v1' } },
      { method: 'POST', path: '/api/providers', body: { provider: 'openrouter', models: ['openai/gpt-4o'] } },
      { method: 'POST', path: '/api/providers', body: { provider: 'alibaba', models: ['qwen-plus'] } },
      { method: 'POST', path: '/api/providers/test', body: { provider: 'xiaomi', api_key: 'synthetic-test-key', base_url: 'https://api.xiaomimimo.com/v1' } },
      { method: 'POST', path: '/api/providers/test', body: { provider: 'ollama-cloud', base_url: 'https://ollama.com/v1' } },
      { method: 'GET', path: '/api/models/live', query: { provider: 'xiaomi', catalog: 'configuration' } },
      { method: 'GET', path: '/api/models/live', query: { provider: 'alibaba', catalog: 'configuration' } },
      { method: 'GET', path: '/api/models' }
    ];
    for (const request of requests) {
      try { await requestScopedWebui(event, { ...request, scopeSelection: selection }, options); }
      catch (error) { throw new Error(`${JSON.stringify(request)}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    expect(options.lookupBinding).toHaveBeenCalledTimes(requests.length);
    expect(options.request.mock.calls.map(([request]) => (request as any).profile)).toEqual([
      ...requests.map(() => 'alpha')
    ]);
  });

  it('requires exact saved-Space bindings and rejects malformed provider/catalog requests', async () => {
    const { event, options } = fixture();
    const requests = [
      { method: 'GET', path: '/api/providers' },
      { method: 'POST', path: '/api/providers', body: { provider: '../beta' }, scopeSelection: selection },
      { method: 'POST', path: '/api/providers', body: { provider: ' OpenRouter ', api_key: 'synthetic-test-key' }, scopeSelection: selection },
      { method: 'POST', path: '/api/providers', body: { provider: 'arbitrary-provider', api_key: 'synthetic-test-key' }, scopeSelection: selection },
      { method: 'POST', path: '/api/providers', body: { provider: 'openrouter', api_key: 'synthetic-test-key', extra: true }, scopeSelection: selection },
      { method: 'POST', path: '/api/providers', body: { provider: 'openrouter', models: [1] }, scopeSelection: selection },
      { method: 'POST', path: '/api/providers', body: { provider: 'openrouter', models: ['bad model'] }, scopeSelection: selection },
      { method: 'POST', path: '/api/providers', body: { provider: 'openrouter', models: ['x'.repeat(257)] }, scopeSelection: selection },
      { method: 'POST', path: '/api/providers', body: { provider: 'xiaomi', base_url: 'https://api.xiaomimimo.com/v1', models: ['mimo'] }, scopeSelection: selection },
      { method: 'POST', path: '/api/providers', body: '{"provider":"openrouter","provider":"xiaomi","api_key":"synthetic-test-key"}', scopeSelection: selection },
      { method: 'POST', path: '/api/providers/test', body: { provider: 'openrouter', base_url: 'https://example.invalid' }, scopeSelection: selection },
      { method: 'POST', path: '/api/providers/test', body: {}, scopeSelection: selection },
      { method: 'GET', path: '/api/models/live', query: { provider: 'xiaomi', catalog: 'configuration', profile: 'beta' }, scopeSelection: selection },
      { method: 'GET', path: '/api/models/live?provider=xiaomi&catalog=configuration', query: { provider: 'alibaba', catalog: 'configuration' }, scopeSelection: selection },
      { method: 'GET', path: '/api/%70roviders', scopeSelection: selection },
      { method: 'GET', path: '/api/models/live?provider=xiaomi&catalog=configuration&extra=1', scopeSelection: selection },
      { method: 'GET', path: '/api/models?profile=beta', scopeSelection: selection }
    ];
    for (const request of requests) await expect(requestScopedWebui(event, request, options)).rejects.toThrow();
    expect(options.lookupBinding).not.toHaveBeenCalled();
    expect(options.request).not.toHaveBeenCalled();
  });

  it('keeps a started Xiaomi save bound to captured profile even if the UI switches profiles during lookup', async () => {
    const { event, options } = fixture();
    let selectedProfile = 'alpha';
    options.lookupBinding.mockImplementation(async (_browser: string, _workspace: string | null, profile?: string) => {
      const captured = profile ?? selectedProfile;
      selectedProfile = 'beta';
      return { scope: { browserProfileId: 'browser-a' }, backendProfileName: captured };
    });
    await requestScopedWebui(event, {
      method: 'POST', path: '/api/providers', body: { provider: 'xiaomi', base_url: 'https://token-plan-ams.xiaomimimo.com/v1' },
      scopeSelection: selection
    }, options);
    expect(options.request).toHaveBeenCalledWith(expect.objectContaining({ profile: 'alpha' }));
    expect(selectedProfile).toBe('beta');
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
