import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { canSelectNativeModel, isModelCatalogResponseCurrent, manualModelPickerOptions, mapScopedModelPickerOptions } from '../src/renderer/model-picker-options.js';
import { quickChatModelGateReason } from '../src/renderer/quick-chat-model-gate.js';
import {
  isProviderModelSelected,
  isMultiAgentModelSelection,
  parseProviderModelId,
  qualifyModelForProvider,
  resolveCatalogModelSelection,
  resolveLiteralCatalogModelSelection,
  resolvePreferredChatModel,
  resolvePreferredChatModelSelection
} from '../src/renderer/provider-model-selection.js';

describe('provider-aware model selection', () => {
  it('classifies saved Teamwork and orchestration defaults for the Beta gate', () => {
    expect(isMultiAgentModelSelection({ model: 'teamwork', provider: 'orchestrator' })).toBe(true);
    expect(isMultiAgentModelSelection({ model: 'smart-track-medium', provider: 'orchestrator' })).toBe(true);
    expect(isMultiAgentModelSelection({ model: 'comode', provider: 'orchestrator' })).toBe(true);
    expect(isMultiAgentModelSelection({ model: 'gpt-6-luna', provider: 'openai-codex' })).toBe(false);
  });
  it('keeps the real Gemini provider group visible in both available and unavailable scopes and drops stale A results in B', () => {
    const catalogFor = (scope: string, available: boolean) => ({
      schemaVersion: 1 as const,
      scope: { backendProfileId: `backend-${scope}`, spaceId: `space-${scope}`, browserProfileId: 'profile' },
      revision: 1, model: 'gemini-3.1-pro', provider: 'antigravity', configured: available, supportsIndependent: true,
      groups: [{ provider: 'Antigravity', provider_id: 'antigravity', configured: available,
        models: [{ id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro', supportsIndependent: true }] }],
      providers: [{ id: 'antigravity', display_name: 'Antigravity', has_key: available, oauth_connected: available,
        auth_state: available ? 'connected' as const : 'not_configured' as const, provider_available: available, models: [] }]
    });
    const available = mapScopedModelPickerOptions(catalogFor('a', true));
    const unavailable = mapScopedModelPickerOptions(catalogFor('b', false));
    expect(available).toContainEqual(expect.objectContaining({ providerId: 'antigravity', configured: true,
      models: [expect.objectContaining({ id: 'gemini-3.1-pro' })] }));
    expect(unavailable).toContainEqual(expect.objectContaining({ providerId: 'antigravity', configured: false,
      disabledReason: 'unavailable', models: [expect.objectContaining({ id: 'gemini-3.1-pro' })] }));
    const scopeA = JSON.stringify({ browserProfileId: 'profile', workspacePath: 'C:/space-a', backendProfileName: 'backend-a' });
    const scopeB = JSON.stringify({ browserProfileId: 'profile', workspacePath: 'C:/space-b', backendProfileName: 'backend-b' });
    expect(isModelCatalogResponseCurrent(scopeA, scopeB)).toBe(false);
    expect(isModelCatalogResponseCurrent(scopeB, scopeB)).toBe(true);
  });
  it('blocks an A-selected model in B with an empty catalog, then permits a valid B catalog selection', () => {
    const scopeA = JSON.stringify({ browserProfileId: 'profile', workspacePath: 'C:/space-a', backendProfileName: 'backend-a' });
    const scopeB = JSON.stringify({ browserProfileId: 'profile', workspacePath: 'C:/space-b', backendProfileName: 'backend-b' });
    const selectedModel = 'gemini-3.1-pro';
    const selectedProvider = 'antigravity';
    const staleSelectionReason = quickChatModelGateReason({ selectedModel, selectedProvider, activeScopeKey: scopeB,
      loadedCatalogScopeKey: scopeB, failedCatalogScopeKey: null, availableModels: [] });
    let submitted = 0;
    if (staleSelectionReason === null) submitted += 1;
    expect(staleSelectionReason).toBe('model-unavailable');
    expect(submitted).toBe(0);
    const validBReason = quickChatModelGateReason({ selectedModel, selectedProvider, activeScopeKey: scopeB,
      loadedCatalogScopeKey: scopeB, failedCatalogScopeKey: null, availableModels: [{ id: selectedModel, providerId: selectedProvider, category: 'gemini' }] });
    if (validBReason === null) submitted += 1;
    expect(validBReason).toBeNull();
    expect(submitted).toBe(1);
    const component = readFileSync(path.resolve(process.cwd(), 'src/renderer/components/CopilotSplitView.tsx'), 'utf8').replace(/\r\n/g, '\n');
    expect(component).toContain('if (!trimmed || busy || modelGateReason !== null) return;');
    expect(component).toContain('disabled={!inputText.trim() || modelGateReason !== null}');
    expect(component.indexOf('modelGateReason !== null) return;')).toBeLessThan(component.indexOf('onSendMessage(trimmed'));
    expect(isModelCatalogResponseCurrent(scopeA, scopeB)).toBe(false);
  });
  it('marks provider/model/scope/revision-mismatched native availability as a binding mismatch', () => {
    const scope = { backendProfileId: 'backend-b', spaceId: 'space-b', browserProfileId: 'profile' };
    const availability = { schemaVersion: 1 as const, supported: true, available: true, reasonCode: null,
      provider: 'antigravity', model: 'gemini-3.1-pro', scope, selectionRevision: 7 };
    const mismatchCases = [
      { ...availability, provider: 'other-provider' },
      { ...availability, model: 'gemini-2.5-pro' },
      { ...availability, scope: { ...scope, spaceId: 'space-a' } },
      { ...availability, selectionRevision: 6 }
    ];
    for (const nativeAvailability of mismatchCases) {
      const mapped = mapScopedModelPickerOptions({ schemaVersion: 1, scope, revision: 7, model: 'gemini-3.1-pro', provider: 'antigravity',
        configured: true, supportsIndependent: true, groups: [{ provider: 'Antigravity', provider_id: 'antigravity', configured: true,
          models: [{ id: 'gemini-3.1-pro', label: 'Gemini', supportsIndependent: true, nativeAvailability }] }] });
      const mappedAvailability = mapped[0]?.models[0]?.nativeAvailability;
      expect(mappedAvailability).toMatchObject({ supported: false, available: false, reasonCode: 'binding_mismatch' });
      expect(canSelectNativeModel('antigravity', mappedAvailability)).toBe(false);
    }
    const nativeChat = readFileSync(path.resolve(process.cwd(), 'src/renderer/panels/NativeChatMain.tsx'), 'utf8').replace(/\r\n/g, '\n');
    expect(nativeChat).toContain('mapScopedModelPickerOptions(data)');
    expect(nativeChat).toContain('canSelectNativeModel(candidate.provider, selectedEntry?.nativeAvailability)');
  });
  it('keeps extra models and unavailable providers visible without making them selectable, while binding real manual IDs', () => {
    const catalog={schemaVersion:1 as const,scope:{backendProfileId:'p',spaceId:'s',browserProfileId:'b'},revision:2,model:'default',provider:'configured',configured:true,supportsIndependent:true,
      groups:[
        {provider:'Configured',provider_id:'configured',configured:true,models:[{id:'chat-model',label:'Chat model',supportsIndependent:true,reasoning_efforts:['low','high']}],extra_models:[{id:'extra-model',label:'Extra model',supportsIndependent:true,reasoning_efforts:['medium']}]},
        {provider:'Offline',provider_id:'offline',configured:false,models:[{id:'offline-model',label:'Offline model',supportsIndependent:true}]},
        {provider:'AUTO presets',provider_id:'',configured:true,models:[{id:'teamwork',label:'Teamwork',supportsIndependent:false}]}
      ],providers:[{id:'offline',display_name:'Offline',has_key:false,oauth_connected:false,auth_state:'not_configured',provider_available:false,models:[]}]};
    const all=mapScopedModelPickerOptions(catalog);
    expect(all.find(group=>group.providerId==='configured')?.models).toHaveLength(2);
    expect(all.find(group=>group.providerId==='configured')?.models[0].reasoningEfforts).toEqual(['low','high']);
    expect(all.find(group=>group.providerId==='offline')).toMatchObject({configured:false,disabledReason:'unavailable'});
    expect(manualModelPickerOptions(all).find(group=>group.providerId==='')?.models.map(model=>model.id)).toEqual(['teamwork']);
    expect(manualModelPickerOptions([
      { providerId: '', models: [{ id: 'teamwork' }, { id: 'smart-track-low' }, { id: 'smart-track-medium' }, { id: 'smart-track-high' }] },
      { providerId: '', models: [{ id: 'unknown-providerless-model' }] },
      { providerId: '', models: [{ id: 'teamwork' }, { id: 'unknown-providerless-model' }] },
      { providerId: 'configured-real-provider', models: [{ id: 'real-model' }] }
    ])).toEqual([
      { providerId: '', models: [{ id: 'teamwork' }, { id: 'smart-track-low' }, { id: 'smart-track-medium' }, { id: 'smart-track-high' }] },
      { providerId: 'configured-real-provider', models: [{ id: 'real-model' }] }
    ]);
    const choice=resolveLiteralCatalogModelSelection('@configured:extra-model',all);
    expect(choice).toEqual({provider:'configured',model:'extra-model'});
  });
  it('preserves literal IDs for the bound broker and refuses ambiguous picker values', () => {
    const groups = [
      { providerId: 'custom:local', models: [{ id: 'gemma4:31b' }, { id: '@custom:local:already-qualified' }] },
      { providerId: 'second', models: [{ id: 'gemma4:31b' }] },
      { providerId: '', models: [{ id: 'teamwork' }, { id: 'smart-track-high' }] }
    ];
    expect(resolveLiteralCatalogModelSelection('@custom:local:gemma4:31b', groups)).toEqual({ model: 'gemma4:31b', provider: 'custom:local' });
    expect(resolveLiteralCatalogModelSelection('@custom:local:already-qualified', groups)).toEqual({ model: '@custom:local:already-qualified', provider: 'custom:local' });
    expect(resolveLiteralCatalogModelSelection('teamwork', groups)).toEqual({ model: 'teamwork', provider: '' });
    expect(resolveLiteralCatalogModelSelection('@missing:gemma4:31b', groups)).toBe(null);
    expect(resolveLiteralCatalogModelSelection('teamwork', [...groups, groups[2]])).toBe(null);
  });

  it('keeps provider and model identity distinct when providers expose the same model ID', () => {
    const groups = mapScopedModelPickerOptions({schemaVersion:1,scope:{backendProfileId:'p',spaceId:'s',browserProfileId:'b'},revision:3,
      model:'same-model',provider:'provider-b',configured:true,supportsIndependent:true,groups:[
        {provider:'Provider A',provider_id:'provider-a',configured:true,models:[{id:'same-model',label:'Same model A',supportsIndependent:true}]},
        {provider:'Provider B',provider_id:'provider-b',configured:true,models:[{id:'same-model',label:'Same model B',supportsIndependent:true}]}
      ]});
    expect(resolveLiteralCatalogModelSelection('@provider-a:same-model',groups)).toEqual({provider:'provider-a',model:'same-model'});
    expect(resolveLiteralCatalogModelSelection('@provider-b:same-model',groups)).toEqual({provider:'provider-b',model:'same-model'});
    expect(resolveLiteralCatalogModelSelection('same-model',groups)).toBeNull();
  });

  it('preserves unsupported rows for explanation but does not turn them into an available choice', () => {
    const groups = mapScopedModelPickerOptions({schemaVersion:1,scope:{backendProfileId:'p',spaceId:'s',browserProfileId:'b'},revision:3,
      model:'fixed',provider:'configured',configured:true,supportsIndependent:true,groups:[
        {provider:'Configured',provider_id:'configured',configured:true,models:[{id:'fixed',label:'Fixed',supportsIndependent:true},
          {id:'legacy-only',label:'Legacy only',supportsIndependent:false}]}
      ]});
    expect(groups[0].models.find(model=>model.id==='legacy-only')?.supportsIndependent).toBe(false);
    expect(manualModelPickerOptions(groups).find(group=>group.providerId==='configured')?.models.find(model=>model.id==='legacy-only')?.supportsIndependent).toBe(false);
  });
  it('fails closed on provider models without native availability and preserves only explicitly supported pairs', () => {
    const scope = { backendProfileId: 'p', spaceId: 's', browserProfileId: 'b' };
    const available = { schemaVersion: 1 as const, supported: true, available: true, reasonCode: null, provider: 'provider', model: 'ready', scope, selectionRevision: 4 };
    const unavailable = { schemaVersion: 1 as const, supported: true, available: false, reasonCode: 'cloud_denied' as const, provider: 'provider', model: 'blocked', scope, selectionRevision: 4 };
    expect(canSelectNativeModel('provider', undefined)).toBe(false);
    expect(canSelectNativeModel('provider', available)).toBe(true);
    expect(canSelectNativeModel('provider', unavailable)).toBe(false);
    expect(canSelectNativeModel('', undefined)).toBe(true);
    const mapped = mapScopedModelPickerOptions({ schemaVersion: 1, scope, revision: 4, model: 'ready', provider: 'provider', configured: true, supportsIndependent: true,
      groups: [{ provider: 'Provider', provider_id: 'provider', configured: true, models: [
        { id: 'ready', label: 'Ready', supportsIndependent: true, nativeAvailability: available },
        { id: 'blocked', label: 'Blocked', supportsIndependent: true, nativeAvailability: unavailable }
      ] }] });
    expect(mapped[0].models.map(row => row.nativeAvailability?.available)).toEqual([true, false]);
  });
  it('keeps provider identity separate while parsing qualified backend IDs', () => {
    expect(parseProviderModelId('@openrouter:vendor/model:free', 'other-provider')).toEqual({
      provider: 'openrouter',
      model: 'vendor/model:free'
    });
    expect(parseProviderModelId('vendor/model:free', 'openrouter')).toEqual({
      provider: 'openrouter',
      model: 'vendor/model:free'
    });
    expect(parseProviderModelId('@openrouter:vendor/model:free', 'openrouter')).toEqual({
      provider: 'openrouter',
      model: 'vendor/model:free'
    });
  });

  it('round-trips namespaced custom provider IDs with a matching provider hint', () => {
    const qualified = qualifyModelForProvider('GLM-5', 'custom:jingdong');
    expect(qualified).toBe('@custom:jingdong:GLM-5');
    expect(parseProviderModelId(qualified, 'custom:jingdong')).toEqual({
      provider: 'custom:jingdong',
      model: 'GLM-5'
    });
    expect(resolvePreferredChatModelSelection({
      spaceSelection: { model: qualified, provider: 'custom:jingdong' },
      selectedModel: 'gemini-2.5-pro',
      selectedModelProvider: 'google-gemini-cli',
    })).toEqual({ provider: 'custom:jingdong', model: 'GLM-5' });
  });

  it('keeps generic custom model colons intact and leaves an unhinted ambiguous ID unchanged', () => {
    const qualified = qualifyModelForProvider('gemma4:31b', 'custom');
    expect(qualified).toBe('@custom:gemma4:31b');
    expect(parseProviderModelId(qualified, 'custom')).toEqual({
      provider: 'custom',
      model: 'gemma4:31b'
    });
    expect(parseProviderModelId('@custom:gemma4:31b')).toEqual({
      provider: 'custom',
      model: 'gemma4:31b'
    });
  });

  it('uses the longest catalog provider prefix when parsing qualified custom defaults', () => {
    const groups = [
      { providerId: 'custom', models: [{ id: 'gemma4:31b' }, { id: 'jingdong:GLM-5' }] },
      { providerId: 'custom:jingdong', models: [{ id: 'GLM-5' }] },
    ];
    expect(resolveCatalogModelSelection('@custom:jingdong:GLM-5', groups)).toEqual({
      provider: 'custom:jingdong',
      model: 'GLM-5'
    });
    expect(resolveCatalogModelSelection('@custom:gemma4:31b', groups)).toEqual({
      provider: 'custom',
      model: 'gemma4:31b'
    });
  });

  it('matches backend catalog entries that are already provider-qualified', () => {
    const groups = [{
      providerId: 'custom:jingdong',
      models: [{ id: '@custom:jingdong:GLM-5' }],
    }];
    expect(resolveCatalogModelSelection('@custom:jingdong:GLM-5', groups)).toEqual({
      provider: 'custom:jingdong',
      model: 'GLM-5'
    });
  });

  it('normalizes qualified catalog entries for bare defaults and empty-default fallback', () => {
    const qualifiedGroups = [
      { providerId: 'other-provider', models: [{ id: '@other-provider:deepseek-v4.1-flash' }] },
      { providerId: 'ollama-cloud', models: [{ id: '@ollama-cloud:deepseek-v4.1-flash' }] },
    ];
    expect(resolveCatalogModelSelection('deepseek-v4.1-flash', qualifiedGroups, 'ollama-cloud')).toEqual({
      model: 'deepseek-v4.1-flash',
      provider: 'ollama-cloud'
    });
    expect(resolveCatalogModelSelection('', qualifiedGroups, 'ollama-cloud')).toEqual({
      model: 'deepseek-v4.1-flash',
      provider: 'ollama-cloud'
    });

    const rawGroups = [
      { providerId: 'other-provider', models: [{ id: 'deepseek-v4.1-flash' }] },
      { providerId: 'ollama-cloud', models: [{ id: 'deepseek-v4.1-flash' }] },
    ];
    expect(resolveCatalogModelSelection('deepseek-v4.1-flash', rawGroups, 'ollama-cloud')).toEqual({
      model: 'deepseek-v4.1-flash',
      provider: 'ollama-cloud'
    });
    expect(resolveCatalogModelSelection('', rawGroups, 'ollama-cloud')).toEqual({
      model: 'deepseek-v4.1-flash',
      provider: 'ollama-cloud'
    });
  });

  it('rejects a qualified model entry that belongs to a different provider group', () => {
    const groups = [
      { providerId: 'ollama-cloud', models: [{ id: '@openrouter:vendor/model:free' }] },
      { providerId: 'openrouter', models: [{ id: '@openrouter:vendor/model:free' }] },
    ];
    expect(resolveCatalogModelSelection('vendor/model:free', groups, 'ollama-cloud')).toEqual({
      model: 'vendor/model:free',
      provider: 'openrouter'
    });
    expect(resolveCatalogModelSelection('', groups, 'ollama-cloud')).toEqual({ model: '' });
  });

  it('uses active provider to disambiguate a duplicate bare catalog model ID', () => {
    const groups = [
      { providerId: 'custom', models: [{ id: 'GLM-5' }, { id: 'gemma4:31b' }] },
      { providerId: 'custom:jingdong', models: [{ id: 'GLM-5' }] },
      { providerId: 'openrouter', models: [{ id: 'GLM-5' }] },
    ];
    expect(resolveCatalogModelSelection('GLM-5', groups, 'custom:jingdong')).toEqual({
      model: 'GLM-5',
      provider: 'custom:jingdong'
    });
    expect(resolveCatalogModelSelection('GLM-5', groups, 'openrouter')).toEqual({
      model: 'GLM-5',
      provider: 'openrouter'
    });
    expect(resolveCatalogModelSelection('GLM-5', groups)).toEqual({
      model: 'GLM-5',
      provider: 'custom'
    });
  });

  it('keeps a qualified provider ahead of an unrelated active provider hint', () => {
    const groups = [
      { providerId: 'custom', models: [{ id: 'gemma4:31b' }] },
      { providerId: 'openrouter', models: [{ id: 'vendor/model:free' }] },
    ];
    expect(resolveCatalogModelSelection('@openrouter:vendor/model:free', groups, 'custom')).toEqual({
      model: 'vendor/model:free',
      provider: 'openrouter'
    });
  });

  it('distinguishes identical model IDs offered by different providers', () => {
    const openRouter = { id: 'shared-model', providerId: 'openrouter' };
    const ollama = { id: 'shared-model', providerId: 'ollama-cloud' };
    expect(isProviderModelSelected(openRouter, 'shared-model', 'openrouter')).toBe(true);
    expect(isProviderModelSelected(ollama, 'shared-model', 'openrouter')).toBe(false);
    expect(isProviderModelSelected(ollama, 'shared-model', 'ollama-cloud')).toBe(true);
  });

  it('uses an explicit chat selection before stale setup defaults and preserves Space precedence', () => {
    expect(resolvePreferredChatModel('space-model', 'chat-choice', 'wizard-model')).toBe('space-model');
    expect(resolvePreferredChatModel('', 'chat-choice', 'wizard-model')).toBe('chat-choice');
    expect(resolvePreferredChatModel('', '', 'wizard-model')).toBe('wizard-model');
    expect(resolvePreferredChatModel('', null, '  ')).toBe('');
  });

  it('uses the same Space-qualified model/provider pair for the chat route and Copilot header', () => {
    const selection = resolvePreferredChatModelSelection({
      spaceSelection: { model: '@ollama-cloud:deepseek-v4.1-flash', provider: 'stale-provider' },
      selectedModel: 'gemini-2.5-pro',
      selectedModelProvider: 'google-gemini-cli',
      setupModel: 'gemini-2.5-pro',
      setupProvider: 'google-gemini-cli',
    });

    expect(selection).toEqual({ model: 'deepseek-v4.1-flash', provider: 'ollama-cloud' });
    expect(resolvePreferredChatModelSelection({
      spaceSelection: { model: '', provider: 'ollama-cloud' },
      selectedModel: 'gemini-2.5-pro',
      selectedModelProvider: 'google-gemini-cli',
    })).toEqual({ model: 'gemini-2.5-pro', provider: 'google-gemini-cli' });
    expect(resolvePreferredChatModelSelection({
      spaceSelection: { model: 'qwen-plus', provider: 'alibaba' },
      selectedModel: 'qwen-plus',
      selectedModelProvider: 'openrouter',
    })).toEqual({ model: 'qwen-plus', provider: 'alibaba' });
  });

  it('keeps provider identity when saving a bare model and avoids double qualification', () => {
    expect(qualifyModelForProvider('deepseek-v4.1-flash', 'ollama-cloud'))
      .toBe('@ollama-cloud:deepseek-v4.1-flash');
    expect(qualifyModelForProvider('@ollama-cloud:deepseek-v4.1-flash', 'ollama-cloud'))
      .toBe('@ollama-cloud:deepseek-v4.1-flash');
  });

  it('keeps an Alibaba chat selection distinct when another provider has the same model ID', () => {
    const options = [
      { id: 'qwen-plus', providerId: 'openrouter' },
      { id: 'qwen-plus', providerId: 'alibaba' }
    ];
    const optionValues = options.map((option) => qualifyModelForProvider(option.id, option.providerId));
    const selectedValue = qualifyModelForProvider(options[1].id, options[1].providerId);
    const selection = parseProviderModelId(selectedValue);

    expect(optionValues).toEqual(['@openrouter:qwen-plus', '@alibaba:qwen-plus']);
    expect(selectedValue).toBe('@alibaba:qwen-plus');
    expect(selection).toEqual({ provider: 'alibaba', model: 'qwen-plus' });
    expect(qualifyModelForProvider(selection.model, selection.provider)).toBe('@alibaba:qwen-plus');
  });

  it('wires qualified provider IDs through the visible chat model picker', () => {
    const composer = readFileSync(path.resolve(process.cwd(), 'src/renderer/panels/ChatComponents.tsx'), 'utf8');
    const chat = readFileSync(path.resolve(process.cwd(), 'src/renderer/panels/NativeChatMain.tsx'), 'utf8');
    const app = readFileSync(path.resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
    const copilot = readFileSync(path.resolve(process.cwd(), 'src/renderer/components/CopilotSplitView.tsx'), 'utf8');
    expect(composer).toContain('value={qualifyModelForProvider(model, modelProvider)}');
    expect(composer).toContain('<label className="composer-model composer-current-model"');
    expect(composer).not.toContain('{modelOptions.length > 0 && (');
    expect(composer).toContain('value={qualifyModelForProvider(m.id, group.providerId)}');
    expect(composer).toContain('key={`${group.providerId || group.provider}:${m.id}`}');
    expect(chat).toContain('resolveLiteralCatalogModelSelection(selection, modelCatalog)');
    expect(chat).toContain("operation: 'modelSelection'");
    expect(chat).not.toContain('sidekick.setDefaultModel');
    expect(chat).toContain('modelProvider={modelProvider}');
    expect(app).toContain('chatModelSelection = await readCapturedSpaceModelSelection(turnContext)');
    expect(app).toContain("includeCatalog: false");
    expect(app).toContain('const copilotModelSelection = resolvePreferredChatModelSelection({');
    expect(copilot).toContain('const activeModelId = modelName || selectedModel;');
    expect(chat).toContain('setModelCatalogError(true)');
    expect(chat).toContain("t('chat.retryModels')");
  });

  it('sends the active scoped model selection as an explicit chat model/provider pair', () => {
    const app = readFileSync(path.resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
    const selectionRead = app.indexOf('chatModelSelection = await readCapturedSpaceModelSelection(turnContext)');
    const startChat = app.indexOf('window.lastbrowser.sidekick.startChat({', selectionRead);
    const requestEnd = app.indexOf('\n      });', startChat);
    const requestBody = app.slice(startChat, requestEnd);

    expect(selectionRead).toBeGreaterThanOrEqual(0);
    expect(startChat).toBeGreaterThan(selectionRead);
    expect(app).toContain('const chatModelProvider = chatModelSelection.provider || undefined;');
    expect(app).toContain('const configuredChatModel = chatModelSelection.model || undefined;');
    expect(requestBody).toContain('model: configuredChatModel');
    expect(requestBody).toContain('modelProvider: chatModelProvider');
    expect(requestBody).toContain('profile: turnContext.profileId');
    expect(requestBody).toContain('workspace: turnContext.spacePath');
  });

  it('maps a provider-qualified configured default to the bare picker ID', () => {
    const groups = [{ providerId: 'ollama-cloud', models: [{ id: 'deepseek-v4.1-flash' }] }];
    expect(resolveCatalogModelSelection('@ollama-cloud:deepseek-v4.1-flash', groups)).toEqual({
      provider: 'ollama-cloud',
      model: 'deepseek-v4.1-flash'
    });
    expect(resolveCatalogModelSelection('deepseek-v4.1-flash', groups)).toEqual({
      provider: 'ollama-cloud',
      model: 'deepseek-v4.1-flash'
    });
  });

  it('falls back to the first model from the active provider when no default is configured', () => {
    const groups = [
      { providerId: 'openrouter', models: [{ id: 'free-model' }] },
      { providerId: 'ollama-cloud', models: [{ id: 'deepseek-v4.1-flash' }] }
    ];
    expect(resolveCatalogModelSelection(null, groups, 'ollama-cloud')).toEqual({
      provider: 'ollama-cloud',
      model: 'deepseek-v4.1-flash'
    });
    expect(resolveCatalogModelSelection(null, groups, 'missing-provider')).toEqual({ model: '' });
  });
});
