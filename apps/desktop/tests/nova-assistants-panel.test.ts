import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DesktopI18nProvider } from '../src/renderer/i18n.js';
import { NativeAssistantsMain } from '../src/renderer/panels/AgentPanels.js';
import { bundledNovaAssistants } from '../src/renderer/nova-assistant-templates.js';
import {
  clearNovaAssistantsForProfile, decideNovaAssistantSwitch, deleteNovaAssistantProfile, readNovaAssistantForSpace,
  readNovaAssistantProfiles, saveNovaAssistantProfile, selectNovaAssistantForSpace,
} from '../src/renderer/nova-assistant-profiles.js';

function storageFixture() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const first = { id: '6e30db98-ecc7-445b-bc38-164e4bfd3409', name: 'Writing assistant', instructions: 'Use examples.' };
const second = { id: 'fb63416b-9b92-402a-bc97-85fa803a6b44', name: 'Reading assistant', instructions: 'Include a summary.' };
const activeSpace = { browserProfileId: 'profile-a', spaceId: 'space-a', backendProfileId: 'backend-a' };

describe('Nova Assistants panel', () => {
  it.each([
    ['en', ['Assistants', 'Activity', 'Manage']],
    ['de', ['Assistenten', 'Aktivität', 'Verwalten']],
    ['ja', ['アシスタント', 'アクティビティ', '管理']],
  ])('opens with the three navigation tabs in %s', (locale, labels) => {
    vi.stubGlobal('localStorage', { getItem: () => locale });
    try {
      const component = React.createElement(NativeAssistantsMain, {
        activeContextItem: 'Dashboard',
        serviceStatus: null,
        browserProfileId: 'profile-a',
      });
      const markup = renderToStaticMarkup(React.createElement(DesktopI18nProvider, { children: component }));
      const tabs = [...markup.matchAll(/role="tab"[^>]*>([^<]+)</g)].map((tab) => tab[1]);
      expect(tabs).toEqual(labels);
      expect(markup).toContain('Developer Agent');
      expect(markup).not.toContain('agent-terminal');
      expect(markup).not.toContain('agent-chat-card');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps management in the browser profile and selections in the exact Space', () => {
    const storage = storageFixture();
    const anotherSpace = { ...activeSpace, spaceId: 'space-b' };
    const anotherBrowser = { ...activeSpace, browserProfileId: 'profile-b' };
    const anotherBackend = { ...activeSpace, backendProfileId: 'backend-b' };
    saveNovaAssistantProfile(storage, activeSpace.browserProfileId, first);
    saveNovaAssistantProfile(storage, anotherBrowser.browserProfileId, second);
    selectNovaAssistantForSpace(storage, activeSpace, first.id);
    expect(readNovaAssistantForSpace(storage, activeSpace)).toEqual(first);
    expect(readNovaAssistantForSpace(storage, anotherSpace)).toBeUndefined();
    expect(readNovaAssistantForSpace(storage, anotherBrowser)).toBeUndefined();
    expect(readNovaAssistantForSpace(storage, anotherBackend)).toBeUndefined();
    expect(() => selectNovaAssistantForSpace(storage, anotherBrowser, first.id)).toThrow();
    expect(readNovaAssistantProfiles(storage, anotherBrowser.browserProfileId)).toEqual([second]);
  });

  it.each(['Use\u0000examples.', 'Use\u007fexamples.', 'Use \ud800.'])(
    'rejects instructions that Sidekick cannot store without replacing the last saved draft (%j)', (instructions) => {
      const storage = storageFixture();
      saveNovaAssistantProfile(storage, activeSpace.browserProfileId, first);
      expect(() => saveNovaAssistantProfile(storage, activeSpace.browserProfileId, { ...first, instructions })).toThrow();
      expect(readNovaAssistantProfiles(storage, activeSpace.browserProfileId)).toEqual([first]);
    },
  );

  it('accepts multiline instructions with tabs and Unicode characters', () => {
    const storage = storageFixture();
    const assistant = { ...first, instructions: 'Examples 📝\n\tUse headings.' };
    saveNovaAssistantProfile(storage, activeSpace.browserProfileId, assistant);
    expect(readNovaAssistantProfiles(storage, activeSpace.browserProfileId)).toEqual([assistant]);
  });

  it('keeps the other profile after deleting a profile and clears selections for removed assistants', () => {
    const storage = storageFixture();
    saveNovaAssistantProfile(storage, 'profile-a', first);
    saveNovaAssistantProfile(storage, 'profile-b', second);
    selectNovaAssistantForSpace(storage, activeSpace, first.id);
    deleteNovaAssistantProfile(storage, 'profile-a', first.id);
    expect(readNovaAssistantForSpace(storage, activeSpace)).toBeUndefined();
    clearNovaAssistantsForProfile(storage, 'profile-a');
    expect(storage.length).toBe(1);
    expect(readNovaAssistantProfiles(storage, 'profile-b')).toEqual([second]);
  });

  it('allows a bundled choice in each Space without loading or copying a global legacy profile', () => {
    const storage = storageFixture();
    const preset = bundledNovaAssistants('de').find((assistant) => assistant.name === 'Projektmanager')!;
    selectNovaAssistantForSpace(storage, activeSpace, preset.id);
    expect(readNovaAssistantForSpace(storage, activeSpace, 'de')).toEqual(preset);
    expect(readNovaAssistantProfiles(storage, activeSpace.browserProfileId)).toEqual([]);
    expect(readNovaAssistantForSpace(storage, { ...activeSpace, browserProfileId: 'profile-b' })).toBeUndefined();
    expect(() => saveNovaAssistantProfile(storage, activeSpace.browserProfileId, preset)).toThrow();
  });

  it('asks for every change of assistant in an existing chat, including a return to Nova', () => {
    const confirm = vi.fn(() => true);
    expect(decideNovaAssistantSwitch(null, null, first.id, confirm)).toBe('create');
    expect(decideNovaAssistantSwitch('chat', first.id, first.id, confirm)).toBe('reuse');
    expect(confirm).not.toHaveBeenCalled();
    expect(decideNovaAssistantSwitch('chat', null, first.id, confirm)).toBe('create');
    expect(decideNovaAssistantSwitch('chat', first.id, second.id, confirm)).toBe('create');
    expect(decideNovaAssistantSwitch('chat', second.id, null, confirm)).toBe('create');
    expect(decideNovaAssistantSwitch('unloaded-chat', undefined, null, confirm)).toBe('create');
    expect(confirm).toHaveBeenCalledTimes(4);
    confirm.mockReturnValue(false);
    expect(decideNovaAssistantSwitch('chat', first.id, second.id, confirm)).toBe('cancelled');
    expect(confirm).toHaveBeenCalledTimes(5);
  });
});
