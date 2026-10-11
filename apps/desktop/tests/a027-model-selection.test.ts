import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { manualModelPickerOptions } from '../src/renderer/model-picker-options.js';
import { normalizeSettingsSectionId, visibleSettingsSections } from '../src/renderer/panels/SystemPanels.js';
import { prepareGuardedNativeChatStart } from '../src/renderer/guarded-native-chat-start.js';
import { chooseActiveModel, isModelActive, setModelActive } from '../src/renderer/active-model-selection.js';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
    clear: () => { values.clear(); },
    key: index => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; },
  };
}

function startInput(storage: Storage) {
  const scope = { backendProfileId: 'backend-a', spaceId: 'space-a', browserProfileId: 'browser-a' };
  return {
    message: 'hello',
    captured: { sessionId: 'session-a', profileId: 'browser-a', spacePath: 'C:/space-a', backendProfileName: 'personal' },
    current: { sessionId: 'session-a', profileId: 'browser-a', spacePath: 'C:/space-a', backendProfileName: 'personal' },
    selection: { scope, provider: 'provider-a', model: 'model-a' },
    availableModels: [{ provider: 'Provider A', provider_id: 'provider-a', configured: true, models: [{ id: 'model-a', label: 'Model A', supportsIndependent: true,
      nativeAvailability: { schemaVersion: 1, supported: true, available: true, reasonCode: null,
        provider: 'provider-a', model: 'model-a', scope, selectionRevision: 1 } }] }],
    allowUntestedBetas: false,
    qualificationBackendProfileName: 'personal',
    storage,
  } as const;
}

describe('A-027 release model choices', () => {
  it('hides virtual orchestration entries from the manual single-model picker by default', () => {
    const options = [{ providerId: '', models: [{ id: 'teamwork' }, { id: 'smart-track-low' }] },
      { providerId: 'provider-a', models: [{ id: 'model-a' }] }];
    expect(manualModelPickerOptions(options)).toEqual([options[1]]);
    const composer = readFileSync(path.resolve(process.cwd(), 'src/renderer/panels/ChatComponents.tsx'), 'utf8');
    expect(composer).toContain('{manualModelPickerOptions(modelOptions).map((group) => (');
  });

  it('does not allow direct navigation to AI Orchestration with the release flag off', () => {
    expect(normalizeSettingsSectionId('teamwork')).toBeNull();
    expect(visibleSettingsSections().map(([id]) => id)).not.toContain('teamwork');
    expect(visibleSettingsSections(true).map(([id]) => id)).toContain('teamwork');
  });

  it('can start a discovered connected model without prior chat evidence', () => {
    expect(prepareGuardedNativeChatStart(startInput(memoryStorage()))).toMatchObject({ ok: true,
      payload: { model: 'model-a', modelProvider: 'provider-a' } });
  });

  it('rejects a saved virtual model even when beta selection was enabled', () => {
    const input = startInput(memoryStorage());
    expect(prepareGuardedNativeChatStart({ ...input, selection: { ...input.selection, provider: '', model: 'teamwork' },
      allowUntestedBetas: true })).toMatchObject({ ok: false });
  });

  it('persists explicit opt-outs while new scan results and other providers stay active', () => {
    const storage = memoryStorage();
    const scope = { browserProfileId: 'browser-a', backendProfileName: 'personal' };
    expect(isModelActive(storage, scope, 'provider-a', 'model-a')).toBe(true);
    setModelActive(storage, scope, 'provider-a', 'model-a', false);
    expect(isModelActive(storage, scope, 'provider-a', 'model-a')).toBe(false);
    expect(isModelActive(storage, scope, 'provider-a', 'new-model')).toBe(true);
    expect(isModelActive(storage, scope, 'provider-b', 'model-a')).toBe(true);
    expect(isModelActive(storage, { ...scope, backendProfileName: 'other' }, 'provider-a', 'model-a')).toBe(true);
    const restartedStorage = memoryStorage();
    restartedStorage.setItem('lastbrowser.activeModelSelection.v1', storage.getItem('lastbrowser.activeModelSelection.v1') || '');
    expect(isModelActive(restartedStorage, scope, 'provider-a', 'model-a')).toBe(false);
    expect(isModelActive(restartedStorage, scope, 'provider-a', 'new-model')).toBe(true);
    setModelActive(storage, scope, 'provider-a', 'model-a', true);
    expect(isModelActive(storage, scope, 'provider-a', 'model-a')).toBe(true);
  });

  it('falls back to another active model and exposes an empty selection without crashing', () => {
    const storage = memoryStorage();
    const scope = { browserProfileId: 'browser-a', backendProfileName: 'personal' };
    const choices = [{ providerId: 'provider-a', id: 'model-a' }, { providerId: 'provider-a', id: 'model-b' }];
    setModelActive(storage, scope, 'provider-a', 'model-a', false);
    expect(chooseActiveModel(choices, { provider: 'provider-a', model: 'model-a' }, storage, scope))
      .toEqual({ choice: choices[1], changed: true });
    setModelActive(storage, scope, 'provider-a', 'model-b', false);
    expect(chooseActiveModel(choices, { provider: 'provider-a', model: 'model-a' }, storage, scope))
      .toEqual({ choice: null, changed: true });
  });

  it('sends the checked P003 catalog models from the captured backend profile', () => {
    const storage = memoryStorage();
    const scope = { browserProfileId: 'browser-a', backendProfileName: 'connected-profile' };
    const reportedChoices = [
      { providerId: 'ollama-cloud', id: 'deepseek-v4.1-flash' },
      { providerId: 'openai-codex', id: 'gpt-6-luna' },
      { providerId: 'xiaomi', id: 'mimo-v2.6-flash' },
    ];
    for (const choice of reportedChoices) {
      expect(isModelActive(storage, scope, choice.providerId, choice.id)).toBe(true);
      expect(chooseActiveModel(reportedChoices, { provider: choice.providerId, model: choice.id }, storage, scope))
        .toEqual({ choice, changed: false });
    }

    const app = readFileSync(path.resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
    expect(app).toContain('context.backendProfileName ?? activeBackendProfileNameRef.current ?? undefined');
    expect(app).toContain('backendProfileName });');
    const composer = readFileSync(path.resolve(process.cwd(), 'src/renderer/components/CopilotSplitView.tsx'), 'utf8');
    expect(composer).toContain('await submitQuickChatDraft({ gate: draftGateRef.current, draft: inputText,');
    expect(composer).toContain('current: () => ({ revision: draftRevisionRef.current, scope: draftScopeRef.current })');
    expect(composer).toContain('setDraft: setInputText, send: () => onSendMessage(trimmed, effectiveReasoningEffort || undefined)');
  });

  it('refuses a model disabled in Settings at the native send guard', () => {
    const storage = memoryStorage();
    setModelActive(storage, { browserProfileId: 'browser-a', backendProfileName: 'personal' }, 'provider-a', 'model-a', false);
    expect(prepareGuardedNativeChatStart(startInput(storage))).toMatchObject({ ok: false, reason: 'no_active_models' });
  });
});
