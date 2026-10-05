import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { manualModelPickerOptions, mapScopedModelPickerOptions } from '../src/renderer/model-picker-options.js';
import {
  isProviderModelSelected,
  parseProviderModelId,
  qualifyModelForProvider,
  resolveCatalogModelSelection,
  resolveLiteralCatalogModelSelection,
  resolvePreferredChatModel,
  resolvePreferredChatModelSelection
} from '../src/renderer/provider-model-selection.js';

describe('provider-aware model selection', () => {
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
    expect(app).toContain('const chatModelSelection = await readCapturedSpaceModelSelection(turnContext)');
    expect(app).toContain("includeCatalog: false");
    expect(app).toContain('const copilotModelSelection = resolvePreferredChatModelSelection({');
    expect(copilot).toContain('const activeModelId = modelName || selectedModel;');
    expect(chat).toContain('setModelCatalogError(true)');
    expect(chat).toContain("t('chat.retryModels')");
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
