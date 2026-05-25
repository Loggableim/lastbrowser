import { describe, expect, it } from 'vitest';
import {
  lastbrowserPanels,
  loadInitialPanel,
  normalizePanelId,
  saveActivePanel
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
      'settings'
    ]);
    expect(lastbrowserPanels.find((panel) => panel.id === 'browser')?.label).toBe('AI Browser');
    expect(lastbrowserPanels.find((panel) => panel.id === 'browser')?.tooltip).toBe('AI Browser');
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
});
