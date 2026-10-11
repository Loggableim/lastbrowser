import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { chooseActiveModel, setModelActive } from '../src/renderer/active-model-selection.js';
import { CopilotSplitView } from '../src/renderer/components/CopilotSplitView.js';
import { DesktopI18nProvider } from '../src/renderer/i18n.js';
import { acceptQuickChatModelChoice } from '../src/renderer/quick-chat-model-choice.js';
import { resolvePreferredChatModelSelection } from '../src/renderer/provider-model-selection.js';
import { loadSpaceModelSelection, saveSpaceModel } from '../src/renderer/space-models.js';

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

describe('A-027 saved Space model fallback through App and Copilot', () => {
  it('shows active B after disabled A falls back, remains B on rerender and reopen', () => {
    const storage = memoryStorage();
    const spacePath = 'C:/work/space-a';
    const scope = { browserProfileId: 'browser-a', backendProfileName: 'personal' };
    const catalog = [{ id: 'model-a', providerId: 'provider-a' }, { id: 'model-b', providerId: 'provider-a' }];
    let selectedModel = 'model-a';
    let selectedProvider = 'provider-a';

    // App gives a saved Space choice priority over the Chat store when it renders Copilot.
    const appSelection = () => resolvePreferredChatModelSelection({
      spaceSelection: loadSpaceModelSelection(spacePath, storage),
      selectedModel, selectedModelProvider: selectedProvider,
    });
    const copilotChoice = () => chooseActiveModel(catalog, appSelection(), storage, scope);
    saveSpaceModel(spacePath, 'model-a', storage, 'provider-a');
    setModelActive(storage, scope, 'provider-a', 'model-a', false);
    expect(appSelection()).toMatchObject({ model: 'model-a', provider: 'provider-a' });
    expect(copilotChoice()).toEqual({ choice: catalog[1], changed: true });

    // Copilot's fallback calls App's picker callback with B.
    const fallback = copilotChoice().choice!;
    expect(acceptQuickChatModelChoice({ storage, ...scope, spacePath, model: fallback.id, provider: fallback.providerId,
      allowMultiAgent: false, setSelectedModel: value => { selectedModel = value; },
      setSelectedModelProvider: value => { selectedProvider = value; } })).toBe(true);

    expect(loadSpaceModelSelection(spacePath, storage)).toEqual({ model: 'model-b', provider: 'provider-a' });
    vi.stubGlobal('window', { localStorage: storage });
    vi.stubGlobal('navigator', { language: 'en-US' });
    try {
      for (let render = 0; render < 2; render += 1) {
        const selection = appSelection();
        expect(selection).toMatchObject({ model: 'model-b', provider: 'provider-a' });
        expect(copilotChoice()).toEqual({ choice: catalog[1], changed: false });
        const html = renderToStaticMarkup(createElement(DesktopI18nProvider, null,
          createElement(CopilotSplitView, { isOpen: true, onClose: () => {},
            modelName: selection.model, modelProvider: selection.provider,
            messages: [], busy: false, onSendMessage: () => {},
            browserProfileId: scope.browserProfileId, workspacePath: spacePath,
            backendProfileName: scope.backendProfileName })));
        expect(html).toContain('class="copilot-header-model-name">model-b</span>');
        expect(html).not.toContain('class="copilot-header-model-name">model-a</span>');
      }
    } finally {
      vi.unstubAllGlobals();
    }

    // Keep the integration route in place: the tested callback is invoked by App's Copilot prop.
    const app = readFileSync(path.resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
    const copilot = readFileSync(path.resolve(process.cwd(), 'src/renderer/components/CopilotSplitView.tsx'), 'utf8');
    expect(app).toContain('if (!acceptQuickChatModelChoice({ storage: window.localStorage,');
    expect(copilot).toContain('onSelectModel?.(choice.choice.id, choice.choice.providerId);');
  });
});
