import { beforeEach, describe, expect, it } from 'vitest';
import {
  parseNaturalLanguageBrowserCommand,
  executeBrowserAction,
  BROWSER_AGENT_TOOLS_SCHEMA
} from '../src/renderer/browser-agent-tools.js';
import { useTabStore } from '../src/renderer/stores/useTabStore.js';
import { createInitialTab } from '../src/renderer/tabs.js';
import { loadBookmarks } from '../src/renderer/bookmarks.js';

describe('Natural Language Browser Command Parser (Phase 10.4)', () => {
  it('detects close duplicate tabs in German and English', () => {
    expect(parseNaturalLanguageBrowserCommand('Schließe alle doppelten Tabs')?.type).toBe('close_duplicate_tabs');
    expect(parseNaturalLanguageBrowserCommand('doppelte tabs schließen')?.type).toBe('close_duplicate_tabs');
    expect(parseNaturalLanguageBrowserCommand('Tabs entdoppeln')?.type).toBe('close_duplicate_tabs');
    expect(parseNaturalLanguageBrowserCommand('Close all duplicate tabs')?.type).toBe('close_duplicate_tabs');
    expect(parseNaturalLanguageBrowserCommand('Deduplicate tabs')?.type).toBe('close_duplicate_tabs');
  });

  it('detects sort tabs by domain in German and English', () => {
    expect(parseNaturalLanguageBrowserCommand('Sortiere alle Tabs nach Domain')?.type).toBe('sort_tabs_by_domain');
    expect(parseNaturalLanguageBrowserCommand('tabs nach host sortieren')?.type).toBe('sort_tabs_by_domain');
    expect(parseNaturalLanguageBrowserCommand('Sort tabs by domain')?.type).toBe('sort_tabs_by_domain');
    expect(parseNaturalLanguageBrowserCommand('Order tabs by domain')?.type).toBe('sort_tabs_by_domain');
  });

  it('detects close unpinned tabs in German and English', () => {
    expect(parseNaturalLanguageBrowserCommand('Schließe alle nicht angepinnten Tabs')?.type).toBe('close_unpinned_tabs');
    expect(parseNaturalLanguageBrowserCommand('unpinned tabs schließen')?.type).toBe('close_unpinned_tabs');
    expect(parseNaturalLanguageBrowserCommand('Close all unpinned tabs')?.type).toBe('close_unpinned_tabs');
  });

  it('detects bookmark folder creation with extracted folder name', () => {
    const cmdDe = parseNaturalLanguageBrowserCommand("Speichere alle Recherche-Tabs als Lesezeichen-Ordner 'Marktanalyse'");
    expect(cmdDe?.type).toBe('create_bookmark_folder');
    expect(cmdDe?.params?.folderName).toBe('Marktanalyse');

    const cmdEn = parseNaturalLanguageBrowserCommand('Save tabs as bookmark folder "Project Alpha"');
    expect(cmdEn?.type).toBe('create_bookmark_folder');
    expect(cmdEn?.params?.folderName).toBe('Project Alpha');
  });

  it('detects grouping tabs into workspace with extracted topic and name', () => {
    const cmdDe = parseNaturalLanguageBrowserCommand("Fasse alle Tabs zum Thema TypeScript im Workspace 'Dev' zusammen");
    expect(cmdDe?.type).toBe('group_tabs_to_space');
    expect(cmdDe?.params?.spaceName).toBe('Dev');
    expect(cmdDe?.params?.filterQuery).toBe('TypeScript');

    const cmdEn = parseNaturalLanguageBrowserCommand('Group tabs about React into workspace "Frontend"');
    expect(cmdEn?.type).toBe('group_tabs_to_space');
    expect(cmdEn?.params?.spaceName).toBe('Frontend');
    expect(cmdEn?.params?.filterQuery).toBe('React');
  });

  it('detects new tab creation with URL', () => {
    const cmd = parseNaturalLanguageBrowserCommand('Neuer Tab https://news.ycombinator.com');
    expect(cmd?.type).toBe('create_tab');
    expect(cmd?.params?.url).toBe('https://news.ycombinator.com');
  });

  it('returns null for regular non-browser questions', () => {
    expect(parseNaturalLanguageBrowserCommand('Was ist der Unterschied zwischen Let und Const?')).toBeNull();
    expect(parseNaturalLanguageBrowserCommand('Schreibe mir ein Python Skript für Bilderkennung')).toBeNull();
    expect(parseNaturalLanguageBrowserCommand('Hallo!')).toBeNull();
  });
});

describe('Browser Action Execution Engine (Phase 10.4)', () => {
  beforeEach(() => {
    const memoryStore: Record<string, string> = {};
    (globalThis as any).window = {
      localStorage: {
        getItem: (k: string) => memoryStore[k] ?? null,
        setItem: (k: string, v: string) => { memoryStore[k] = v; },
        removeItem: (k: string) => { delete memoryStore[k]; }
      }
    };

    useTabStore.setState({
      tabs: [
        { ...createInitialTab('https://example.com/one'), id: 't1', title: 'Example One', pinned: false },
        { ...createInitialTab('https://example.com/two'), id: 't2', title: 'Example Two', pinned: true },
        { ...createInitialTab('https://example.com/one/'), id: 't3', title: 'Example One Dup', pinned: false },
        { ...createInitialTab('https://developer.mozilla.org/en-US/'), id: 't4', title: 'MDN Web Docs', pinned: false }
      ],
      activeTabId: 't1'
    });
  });

  it('executes close_duplicate_tabs and reports closed counts', async () => {
    const result = await executeBrowserAction({ type: 'close_duplicate_tabs' });

    expect(result.success).toBe(true);
    expect(result.action).toBe('close_duplicate_tabs');
    expect(result.details?.closedCount).toBe(1);
    expect(result.details?.remainingCount).toBe(3);
    expect(result.message).toContain('1 doppelte(r) Tab(s)');
    expect(result.message).toContain('erfolgreich geschlossen');
  });

  it('executes sort_tabs_by_domain and reports sorted tab count', async () => {
    const result = await executeBrowserAction({ type: 'sort_tabs_by_domain' });

    expect(result.success).toBe(true);
    expect(result.action).toBe('sort_tabs_by_domain');
    expect(result.details?.tabCount).toBe(4);
    expect(result.message).toContain('4 Tabs');
  });

  it('executes close_unpinned_tabs and preserves pinned tabs', async () => {
    const result = await executeBrowserAction({ type: 'close_unpinned_tabs' });

    expect(result.success).toBe(true);
    expect(result.details?.closedCount).toBe(3);
    expect(result.details?.remainingCount).toBe(1);
    expect(useTabStore.getState().tabs).toHaveLength(1);
    expect(useTabStore.getState().tabs[0].id).toBe('t2'); // pinned tab
  });

  it('executes create_bookmark_folder and stores bookmarks', async () => {
    const result = await executeBrowserAction({
      type: 'create_bookmark_folder',
      params: { folderName: 'Dev Links' }
    });

    expect(result.success).toBe(true);
    expect(result.details?.folderName).toBe('Dev Links');
    expect(result.details?.tabCount).toBeGreaterThan(0);
    expect(result.message).toContain('Dev Links');

    const bookmarks = loadBookmarks();
    expect(bookmarks.some((b) => b.title.includes('Example') || b.title.includes('MDN'))).toBe(true);
  });

  it('executes group_tabs_to_space with matching tabs', async () => {
    const result = await executeBrowserAction({
      type: 'group_tabs_to_space',
      params: { spaceName: 'Documentation', filterQuery: 'MDN' }
    });

    expect(result.success).toBe(true);
    expect(result.details?.spaceName).toBe('Documentation');
    expect(result.details?.tabCount).toBe(1);
    expect(result.message).toContain('Documentation');
  });
});

describe('Browser Agent Tools Schema', () => {
  it('exports valid function calling schemas for Sidekick LLM tool use', () => {
    expect(Array.isArray(BROWSER_AGENT_TOOLS_SCHEMA)).toBe(true);
    expect(BROWSER_AGENT_TOOLS_SCHEMA.length).toBeGreaterThanOrEqual(5);

    const names = BROWSER_AGENT_TOOLS_SCHEMA.map((t) => t.name);
    expect(names).toContain('close_duplicate_tabs');
    expect(names).toContain('sort_tabs_by_domain');
    expect(names).toContain('close_unpinned_tabs');
    expect(names).toContain('create_bookmark_folder');
    expect(names).toContain('group_tabs_to_space');
  });
});
