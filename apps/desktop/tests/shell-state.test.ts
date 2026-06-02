import { describe, expect, it } from 'vitest';
import {
  lastbrowserPanels,
  contextSidebarWidthStorageKey,
  isInstalledSidebarApp,
  loadInitialPanel,
  loadInstalledSidebarApps,
  loadNumericPreference,
  normalizePanelId,
  saveActivePanel,
  saveNumericPreference,
  workspacePanelWidthStorageKey
} from '../src/renderer/shell-state.js';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('Lastbrowser shell state', () => {
  it('defines the native WebUI-style navigation panels', () => {
    expect(lastbrowserPanels.map((panel) => panel.id)).toEqual([
      'chat',
      'tasks',
      'kanban',
      'skills',
      'agents',
      'memory',
      'workspaces',
      'profiles',
      'todos',
      'insights',
      'logs',
      'gmail',
      'browser',
      'discord',
      'appstore',
      'settings',
      'terminal'
    ]);
    expect(lastbrowserPanels.find((panel) => panel.id === 'browser')?.label).toBe('AI Search');
    expect(lastbrowserPanels.find((panel) => panel.id === 'browser')?.tooltip).toBe('AI Search');
  });

  it('uses browser as the default panel and rejects stale localStorage values', () => {
    const storage = new MemoryStorage();

    expect(loadInitialPanel(storage)).toBe('browser');
    storage.setItem('lastbrowser.activePanel', 'old-sidekick');
    expect(loadInitialPanel(storage)).toBe('browser');
    storage.setItem('lastbrowser.activePanel', 'chat');
    expect(loadInitialPanel(storage)).toBe('chat');
    expect(normalizePanelId('gmail')).toBe('gmail');
    expect(normalizePanelId('missing')).toBe('browser');
  });

  it('persists the selected native panel under the Lastbrowser key', () => {
    const storage = new MemoryStorage();

    saveActivePanel(storage, 'workspaces');

    expect(storage.getItem('lastbrowser.activePanel')).toBe('workspaces');
  });

  it('persists sidebar widths and clamps invalid values back to defaults', () => {
    const storage = new MemoryStorage();

    saveNumericPreference(storage, contextSidebarWidthStorageKey, 301);
    saveNumericPreference(storage, workspacePanelWidthStorageKey, 499);

    expect(loadNumericPreference(storage, contextSidebarWidthStorageKey, 280, 220, 420)).toBe(301);
    expect(loadNumericPreference(storage, workspacePanelWidthStorageKey, 320, 260, 520)).toBe(499);

    storage.setItem(contextSidebarWidthStorageKey, '9999');
    storage.setItem(workspacePanelWidthStorageKey, 'not-a-number');

    expect(loadNumericPreference(storage, contextSidebarWidthStorageKey, 280, 220, 420)).toBe(420);
    expect(loadNumericPreference(storage, workspacePanelWidthStorageKey, 320, 260, 520)).toBe(320);
  });

  it('keeps gmail and discord hidden until installed through the appstore', () => {
    const storage = new MemoryStorage();

    expect(loadInstalledSidebarApps(storage)).toEqual([]);
    expect(isInstalledSidebarApp('chat', [])).toBe(true);
    expect(isInstalledSidebarApp('gmail', [])).toBe(false);
    expect(isInstalledSidebarApp('discord', [])).toBe(false);

    storage.setItem('lastbrowser.installedSidebarApps', JSON.stringify(['gmail', 'discord', 'gmail', 'browser']));

    expect(loadInstalledSidebarApps(storage)).toEqual(['gmail', 'discord']);
    expect(isInstalledSidebarApp('gmail', ['gmail'])).toBe(true);
    expect(isInstalledSidebarApp('discord', ['gmail'])).toBe(false);
  });
});
