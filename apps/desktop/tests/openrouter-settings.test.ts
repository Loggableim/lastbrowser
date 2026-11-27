import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { requestProviderModelCatalog } from '../src/renderer/provider-settings.js';

describe('OpenRouter provider settings flow', () => {
  it('saves Groq credentials and loads its catalog in the selected scope', async () => {
    const scopeSelection = { browserProfileId: 'profile-b', workspacePath: 'C:/spaces/b', backendProfileName: 'backend-b' };
    const requests: any[] = [];
    const models = await requestProviderModelCatalog({ providerId: 'groq', apiKey: 'fixture-key', hasSavedKey: false,
      baseUrl: '', scopeSelection }, async request => {
      requests.push(request);
      return request.method === 'GET' || request.path === '/api/models/probe' ? { models: [{ id: 'fixture-model' }] } : { ok: true };
    });
    expect(requests).toEqual([
      { method: 'POST', path: '/api/models/probe', body: { provider: 'groq', api_key: 'fixture-key' }, scopeSelection },
      { method: 'POST', path: '/api/providers', body: { provider: 'groq', api_key: 'fixture-key' }, scopeSelection },
      { method: 'GET', path: '/api/models/live?provider=groq&catalog=configuration', scopeSelection }
    ]);
    expect(models).toEqual([{ id: 'fixture-model' }]);
  });
  it.each(['provider_key_invalid', 'provider_rate_limited'])('does not save Groq credentials after %s', async error_code => {
    const requests: any[] = [];
    await expect(requestProviderModelCatalog({ providerId: 'groq', apiKey: 'fixture-key', hasSavedKey: false, baseUrl: '' }, async request => {
      requests.push(request);
      return { error_code, models: [] };
    })).rejects.toThrow(error_code);
    expect(requests.map(request => request.path)).toEqual(['/api/models/probe']);
  });
  it('sends provider saves and model catalog reads to the selected Space scope', async () => {
    const scopeSelection = { browserProfileId: 'profile-b', workspacePath: 'C:/spaces/b', backendProfileName: 'backend-b' };
    const requests: any[] = [];
    const models = await requestProviderModelCatalog({ providerId: 'alibaba', apiKey: '', hasSavedKey: true,
      baseUrl: 'https://workspace.example/v1', scopeSelection }, async request => {
      requests.push(request);
      return request.method === 'GET' ? { models: [{ id: 'qwen-plus' }] } : { ok: true };
    });
    expect(models).toEqual([{ id: 'qwen-plus' }]);
    expect(requests).toHaveLength(2);
    expect(requests.map(request => request.scopeSelection)).toEqual([scopeSelection, scopeSelection]);
  });
  // Normalize CRLF so line-ending churn in the working tree cannot break
  // multi-line source assertions.
  const source = readFileSync(path.resolve(process.cwd(), 'src/renderer/panels/SystemPanels.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('opens configuration for OpenRouter whether active or inactive', () => {
    expect(source).toContain("['openrouter', 'alibaba', 'groq'].includes(option.id)");
    expect(source).toContain("openOpenRouterSettings(option.id as 'openrouter' | 'alibaba' | 'groq')");
  });

  it('saves provider-scoped key and loads the live OpenRouter catalog', () => {
    expect(source).toContain('requestProviderModelCatalog');
    expect(source).toContain('openrouterNoModels');
  });

  it('lets users choose an allowlist and activates the selected default model', () => {
    expect(source).toContain('openRouterSelectedModels');
    expect(source).toContain('const nextSelection = priorSelection.length || hasSelection ? priorSelection : [];');
    expect(source).toContain('provider: openRouterConfigProvider, models: selectedModels');
    expect(source).toContain("openRouterConfigProvider === 'openrouter' ? 'https://openrouter.ai/api/v1' : alibabaBaseUrl.trim()");
    expect(source).toContain('setDefaultModel({ model: selectedDefault })');
  });

  it('requires an HTTPS workspace endpoint before scanning and saving Alibaba credentials', () => {
    expect(source).toContain("if (openRouterConfigProvider === 'alibaba') body.base_url = alibabaBaseUrl.trim()");
    expect(source).toContain("t('settings.panels.providers.alibabaBaseUrlPlaceholder')");
    expect(source).toContain("new URL(alibabaBaseUrl.trim()).protocol !== 'https:'");
  });

  it('scans a saved Alibaba credential with the just-loaded endpoint before React state updates', () => {
    expect(source).toContain("baseUrl = alibabaBaseUrl");
    expect(source).toContain("const providerBaseUrl = settingsText(provider?.base_url, '');");
    expect(source).toContain("providerId === 'alibaba' ? providerBaseUrl : alibabaBaseUrl");
  });

  it('updates only the saved Alibaba endpoint, then scans the full returned catalog', async () => {
    const requests: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
    const requestWebui = async (request: { method: 'GET' | 'POST'; path: string; body?: Record<string, unknown> }) => {
      requests.push(request);
      if (request.method === 'GET') return { models: [
        { id: 'qwen-plus', label: 'Qwen Plus' },
        { id: 'qwen-max', label: 'Qwen Max' }
      ] };
      return { ok: true };
    };

    const models = await requestProviderModelCatalog({
      providerId: 'alibaba',
      apiKey: '',
      hasSavedKey: true,
      baseUrl: 'https://workspace.example/v1'
    }, requestWebui);

    expect(requests).toEqual([
      {
        method: 'POST',
        path: '/api/providers',
        body: { provider: 'alibaba', base_url: 'https://workspace.example/v1' }
      },
      { method: 'GET', path: '/api/models/live?provider=alibaba&catalog=configuration' }
    ]);
    expect(requests[0].body).not.toHaveProperty('api_key');
    expect(models).toEqual([
      { id: 'qwen-plus', label: 'Qwen Plus' },
      { id: 'qwen-max', label: 'Qwen Max' }
    ]);
  });

  it('rejects a non-HTTPS Alibaba endpoint before making requests', async () => {
    const requestWebui = async () => { throw new Error('request should not run'); };
    await expect(requestProviderModelCatalog({
      providerId: 'alibaba', apiKey: '', hasSavedKey: true, baseUrl: 'http://workspace.example/v1'
    }, requestWebui)).rejects.toThrow('alibaba-https-required');
  });
});
