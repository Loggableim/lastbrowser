import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  MODEL_VISIBILITY_EVENT,
  filterVisibleModelGroups,
  filterVisibleModels,
  firstEnabledCatalogModel,
  isModelDisabled,
  loadDisabledModels,
  modelVisibilityKey,
  notifyModelVisibilityChanged,
  saveDisabledModels,
  setModelEnabled
} from '../src/renderer/model-visibility.js';

const STORAGE_KEY = 'lastbrowser.disabledModels.v1';

function makeStorage(initial?: string) {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set(STORAGE_KEY, initial);
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value); },
    raw: () => store
  };
}

describe('model visibility storage (issue #172 F3)', () => {
  it('qualifies switch keys with the provider and tolerates missing providers', () => {
    expect(modelVisibilityKey('OpenCode', 'gpt-5')).toBe('opencode:gpt-5');
    expect(modelVisibilityKey(undefined, 'gpt-5')).toBe('gpt-5');
    expect(modelVisibilityKey('  ', '  gpt-5  ')).toBe('gpt-5');
    expect(modelVisibilityKey('opencode', '   ')).toBe('');
  });

  it('loads a trimmed list, ignoring corrupt or non-array storage', () => {
    expect([...loadDisabledModels(makeStorage())]).toEqual([]);
    expect([...loadDisabledModels(makeStorage('{"not":"array"}'))]).toEqual([]);
    expect([...loadDisabledModels(makeStorage('not json'))]).toEqual([]);
    expect([...loadDisabledModels(makeStorage('["a:1"," b:2 ","",7,null]'))]).toEqual(['a:1', 'b:2']);
  });

  it('persists a normalised, sorted set and survives a failing write', () => {
    const storage = makeStorage();
    expect([...saveDisabledModels(storage, ['b:2', 'a:1', 'b:2', ''])]).toEqual(['a:1', 'b:2']);
    expect(storage.getItem(STORAGE_KEY)).toBe('["a:1","b:2"]');

    const throwing = {
      getItem: () => null,
      setItem: () => { throw new Error('quota'); }
    };
    expect([...saveDisabledModels(throwing, ['a:1'])]).toEqual(['a:1']);
  });

  it('flips one provider-qualified switch without touching the other provider', () => {
    const storage = makeStorage();
    setModelEnabled(storage, 'go', 'model-x', false);
    expect([...loadDisabledModels(storage)]).toEqual(['go:model-x']);
    expect(isModelDisabled(loadDisabledModels(storage), 'go', 'model-x')).toBe(true);
    expect(isModelDisabled(loadDisabledModels(storage), 'go-free', 'model-x')).toBe(false);

    setModelEnabled(storage, 'go', 'model-x', true);
    expect([...loadDisabledModels(storage)]).toEqual([]);
  });

  it('ignores a switch flip that carries no model id', () => {
    const storage = makeStorage();
    expect([...setModelEnabled(storage, 'go', '', false)]).toEqual([]);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('does not require a browser when setModelEnabled notifies', () => {
    expect(() => setModelEnabled(makeStorage(), 'go', 'model-x', false)).not.toThrow();
    expect(() => notifyModelVisibilityChanged()).not.toThrow();
  });

  it('matches disabled models by qualified key, bare key and provider-less check', () => {
    const disabled = new Set(['go:model-x', 'bare-model']);
    expect(isModelDisabled(disabled, 'go', 'model-x')).toBe(true);
    expect(isModelDisabled(disabled, 'GO', 'model-x')).toBe(true);
    expect(isModelDisabled(disabled, undefined, 'bare-model')).toBe(true);
    expect(isModelDisabled(disabled, undefined, 'model-x')).toBe(true);
    expect(isModelDisabled(disabled, 'other', 'model-x')).toBe(false);
    expect(isModelDisabled(disabled, 'go', '')).toBe(false);
  });

  it('drops disabled models and removes groups left empty', () => {
    const flat = [
      { id: 'keep', providerId: 'go' },
      { id: 'drop', providerId: 'go' },
      { id: 'keep2', providerId: 'go-free' }
    ];
    expect(filterVisibleModels(flat, new Set(['go:drop']))).toEqual([
      { id: 'keep', providerId: 'go' },
      { id: 'keep2', providerId: 'go-free' }
    ]);

    const groups = [
      { id: 'go', provider: 'Go', providerId: 'go', models: [{ id: 'a' }, { id: 'b' }] },
      { id: 'go-free', provider: 'Go Free', providerId: 'go-free', models: [{ id: 'c' }] }
    ];
    expect(filterVisibleModelGroups(groups, new Set(['go:a', 'go:b']))).toEqual([
      { id: 'go-free', provider: 'Go Free', providerId: 'go-free', models: [{ id: 'c' }] }
    ]);
  });

  it('picks the first enabled catalog model as the switch-off fallback', () => {
    const groups = [
      { id: 'go', provider: 'Go', providerId: 'go', models: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
      { id: 'go-free', provider: 'Go Free', providerId: 'go-free', models: [{ id: 'c' }] }
    ];
    expect(firstEnabledCatalogModel(groups, new Set())).toEqual({ providerId: 'go', id: 'a', label: 'A' });
    expect(firstEnabledCatalogModel(groups, new Set(['go:a', 'go:b']))).toEqual({ providerId: 'go-free', id: 'c', label: 'c' });
    expect(firstEnabledCatalogModel(groups, new Set(['go:a', 'go:b', 'go-free:c']))).toBeNull();
  });
});

describe('model visibility wiring', () => {
  const read = (relative: string) => readFileSync(path.resolve(__dirname, relative), 'utf8');

  it('exposes the shared change event name', () => {
    expect(MODEL_VISIBILITY_EVENT).toBe('lastbrowser:model-visibility-changed');
  });

  it('renders a settings switch per catalog model qualified by provider', () => {
    const source = read('../src/renderer/panels/SystemPanels.tsx');
    expect(source).toContain('renderModelVisibilityToggles()');
    expect(source).toContain('checked={!isModelDisabled(disabledModels, providerId, modelId)}');
    expect(source).toContain('description={providerLabel}');
    expect(source).toContain('setModelEnabled(window.localStorage, providerId, modelId, value)');
  });

  it('filters the full chat composer catalog and falls back when the model is off', () => {
    const source = read('../src/renderer/panels/NativeChatMain.tsx');
    expect(source).toContain('const disabledModels = useDisabledModels();');
    expect(source).toContain('filterVisibleModelGroups(modelCatalog, disabledModels)');
    expect(source).toContain('modelOptions={visibleModelCatalog}');
    expect(source).toContain('if (!isModelDisabled(disabledModels, modelProvider, model)) return;');
    expect(source).toContain('firstEnabledCatalogModel(modelCatalog, disabledModels)');
  });

  it('filters the quickchat picker and shows a switch-off notice', () => {
    const source = read('../src/renderer/components/CopilotSplitView.tsx');
    expect(source).toContain('const disabledModels = useDisabledModels();');
    expect(source).toContain('!isModelDisabled(disabledModels, model.providerId, model.id)');
    expect(source).toContain('setVisibilityNotice(');
    expect(source).toContain('visibilityNotice && <p role="status"');
  });
});
