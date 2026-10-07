import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isProviderSettingsScopeCurrent, readXiaomiProviderStatus, requestProviderSettingsInScope, safeXiaomiErrorCode, saveAndLoadXiaomiModels, testXiaomiConnection, validateXiaomiBaseUrl, xiaomiKeyKind } from '../src/renderer/provider-settings.js';

describe('Xiaomi MiMo settings contract', () => {
  it('uses the MiMo-specific key placeholder and keeps saved-key state unknown until scoped readback', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/renderer/panels/SystemPanels.tsx'), 'utf8').replace(/\r\n/g, '\n');
    expect(source).toContain('useState<boolean | null>(null)');
    expect(source).toContain('setXiaomiHasSavedKey(status?.hasKey ?? null)');
    expect(source).toContain("t('settings.panels.providers.xiaomiKeyPlaceholder')");
    expect(source).not.toContain("placeholder={xiaomiHasSavedKey ? t('settings.panels.providers.openrouterKeyPlaceholder') : t('settings.panels.providers.cloudKeyPlaceholder')}");
    expect(source).toContain("provider: 'xiaomi', base_url: xiaomiBaseUrl.trim(),");
    expect(source).not.toContain("provider: 'xiaomi', base_url: xiaomiBaseUrl.trim(), models:");
  });
  it('distinguishes supported key plans without retaining or returning the key', () => {
    expect(xiaomiKeyKind('sk-synthetic')).toBe('paygo');
    expect(xiaomiKeyKind('tp-synthetic')).toBe('token-plan');
    expect(xiaomiKeyKind('ttp-synthetic')).toBe('token-plan');
    expect(xiaomiKeyKind('bad-synthetic')).toBe('unknown');
  });

  it('requires the fixed paygo URL and accepts the account-provided AMS Token Plan URL', () => {
    expect(validateXiaomiBaseUrl('sk-synthetic', 'https://api.xiaomimimo.com/v1')).toBeNull();
    expect(validateXiaomiBaseUrl('sk-synthetic', 'https://token-plan-ams.xiaomimimo.com/v1')).toBe('mimo_base_url_invalid');
    expect(validateXiaomiBaseUrl('tp-synthetic', 'https://api.xiaomimimo.com/v1')).toBe('mimo_base_url_invalid');
    expect(validateXiaomiBaseUrl('tp-synthetic', 'https://token-plan-ams.xiaomimimo.com/v1')).toBeNull();
    expect(validateXiaomiBaseUrl('tp-synthetic', 'https://token-plan-cn.xiaomimimo.com/v1')).toBeNull();
    expect(validateXiaomiBaseUrl('', 'https://token-plan-ams.xiaomimimo.com/v1', true)).toBeNull();
    for (const invalid of ['http://token-plan-ams.xiaomimimo.com/v1', 'https://attacker.example/v1', 'https://other.xiaomimimo.com/v1',
      'https://user@token-plan-ams.xiaomimimo.com/v1', 'https://token-plan-ams.xiaomimimo.com/v1?x=1',
      'https://token-plan-ams.xiaomimimo.com/v2']) {
      expect(validateXiaomiBaseUrl('tp-synthetic', invalid)).toBe('mimo_base_url_invalid');
    }
  });

  it('saves a key only through the provider endpoint, omits blank keys, and fetches the configuration catalog', async () => {
    const request = vi.fn(async ({ method, path }: { method: string; path: string }) => method === 'GET' && path === '/api/models/live?provider=xiaomi&catalog=configuration'
      ? { models: [{ id: 'mimo-v2.6-flash' }] } : method === 'GET' && path === '/api/providers'
        ? { providers: [{ id: 'xiaomi', has_key: true, base_url: 'https://token-plan-ams.xiaomimimo.com/v1' }] }
        : { ok: true, provider: 'xiaomi', action: 'updated', has_key: true, base_url: 'https://token-plan-ams.xiaomimimo.com/v1' });
    const models = await saveAndLoadXiaomiModels({ apiKey: 'tp-synthetic', hasSavedKey: false,
      baseUrl: 'https://token-plan-ams.xiaomimimo.com/v1' }, request);
    expect(models).toEqual([{ id: 'mimo-v2.6-flash' }]);
    expect(request.mock.calls.map(([arg]) => arg)).toEqual([
      { method: 'POST', path: '/api/providers', body: { provider: 'xiaomi', base_url: 'https://token-plan-ams.xiaomimimo.com/v1', api_key: 'tp-synthetic' } },
      { method: 'GET', path: '/api/providers' },
      { method: 'GET', path: '/api/models/live?provider=xiaomi&catalog=configuration' }
    ]);

    request.mockClear();
    await saveAndLoadXiaomiModels({ apiKey: '', hasSavedKey: true, baseUrl: 'https://token-plan-ams.xiaomimimo.com/v1' }, request);
    expect(request.mock.calls[0]?.[0]).toEqual({ method: 'POST', path: '/api/providers', body: {
      provider: 'xiaomi', base_url: 'https://token-plan-ams.xiaomimimo.com/v1'
    } });
  });

  it('reads only has_key and base_url as authoritative saved-state metadata', async () => {
    const request = vi.fn(async () => ({ providers: [{ id: 'xiaomi', has_key: true,
      base_url: 'https://token-plan-ams.xiaomimimo.com/v1', api_key: 'must-not-be-read' }] }));
    await expect(readXiaomiProviderStatus(request)).resolves.toEqual({ hasKey: true, baseUrl: 'https://token-plan-ams.xiaomimimo.com/v1' });
    expect(request).toHaveBeenCalledWith({ method: 'GET', path: '/api/providers' });
    await expect(readXiaomiProviderStatus(async () => ({ providers: [{ id: 'xiaomi', has_key: 'yes', base_url: 'https://token-plan-ams.xiaomimimo.com/v1' }] }))).resolves.toBeNull();
  });

  it('does not load a model catalog when scoped persistence readback does not match the saved key and URL', async () => {
    const request = vi.fn(async ({ method, path }: { method: string; path: string }) => method === 'POST'
      ? { ok: true, provider: 'xiaomi', action: 'updated', has_key: true, base_url: 'https://token-plan-ams.xiaomimimo.com/v1' }
      : { providers: [{ id: 'xiaomi', has_key: false, base_url: 'https://token-plan-cn.xiaomimimo.com/v1' }] });
    await expect(saveAndLoadXiaomiModels({ apiKey: 'tp-synthetic', hasSavedKey: false,
      baseUrl: 'https://token-plan-ams.xiaomimimo.com/v1' }, request)).rejects.toThrow('mimo_invalid_response');
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.map(([arg]) => arg.path)).toEqual(['/api/providers', '/api/providers']);
  });

  it('tests the configured connection without claiming the entered key was saved', async () => {
    const request = vi.fn(async () => ({ ok: true }));
    await expect(testXiaomiConnection({ apiKey: 'tp-synthetic', hasSavedKey: false,
      baseUrl: 'https://token-plan-ams.xiaomimimo.com/v1' }, request)).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({ method: 'POST', path: '/api/providers/test', body: {
      provider: 'xiaomi', base_url: 'https://token-plan-ams.xiaomimimo.com/v1', api_key: 'tp-synthetic'
    } });
    expect(safeXiaomiErrorCode(new Error('untrusted upstream message'))).toBe('mimo_provider_unavailable');
    expect(safeXiaomiErrorCode(new Error('mimo_rate_limited'))).toBe('mimo_rate_limited');
  });

  it('discards a deferred response after switching Space or closing and reopening the settings form', async () => {
    const deferred = <T,>() => {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>(done => { resolve = done; });
      return { promise, resolve };
    };
    const response = deferred<{ models: string[] }>();
    const captured = { browserProfileId: 'profile-a', workspacePath: 'C:/space-a', backendProfileName: 'profile_a' };
    let current = { ...captured };
    let generation = 4;
    const capturedGeneration = generation;
    let renderedModels: string[] = [];
    const request = vi.fn(() => response.promise);
    const pending = requestProviderSettingsInScope(request, { method: 'GET', path: '/api/providers' }, captured,
      () => isProviderSettingsScopeCurrent(captured, current, capturedGeneration, generation)).then(value => {
      if (isProviderSettingsScopeCurrent(captured, current, capturedGeneration, generation)) renderedModels = value.models;
    });
    expect(request).toHaveBeenCalledWith({ method: 'GET', path: '/api/providers', scopeSelection: captured });
    current = { browserProfileId: 'profile-a', workspacePath: 'C:/space-b', backendProfileName: 'profile_b' };
    generation += 1; // close/reopen invalidates the previous operation even if the selected Space later matches again
    current = { ...captured };
    response.resolve({ models: ['stale-model'] });
    await pending;
    expect(renderedModels).toEqual([]);
    expect(isProviderSettingsScopeCurrent(captured, current, capturedGeneration, generation)).toBe(false);
  });
});
