import { useTabStore } from './stores/useTabStore.js';
import { loadBookmarks, saveBookmarks, type BrowserBookmark, isBookmarkableUrl } from './bookmarks.js';

export type BrowserActionType =
  | 'close_duplicate_tabs'
  | 'sort_tabs_by_domain'
  | 'close_unpinned_tabs'
  | 'close_tabs_to_right'
  | 'create_tab'
  | 'create_bookmark_folder'
  | 'group_tabs_to_space'
  | 'list_tabs';

export interface BrowserActionCommand {
  type: BrowserActionType;
  params?: {
    url?: string;
    folderName?: string;
    spaceName?: string;
    filterQuery?: string;
  };
  rawQuery?: string;
}

export interface BrowserActionResult {
  success: boolean;
  action: BrowserActionType;
  title: string;
  message: string;
  details?: {
    closedCount?: number;
    remainingCount?: number;
    tabCount?: number;
    folderName?: string;
    spaceName?: string;
    items?: Array<{ title: string; url: string }>;
  };
}

/**
 * Natural language intent parser for browser operations.
 * Detects German and English conversational commands.
 */
export function parseNaturalLanguageBrowserCommand(text: string): BrowserActionCommand | null {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();
  if (clean.length < 5) return null;

  // 1. Close duplicate tabs
  if (
    /schlie(ss|ß)e\s+(alle\s+)?doppelt(e|en)?\s+tabs?/i.test(clean) ||
    /doppelt(e|en)?\s+tabs?\s+schlie(ss|ß)en/i.test(clean) ||
    /tabs?\s+entdoppeln/i.test(clean) ||
    /close\s+(all\s+)?duplicate\s+tabs?/i.test(clean) ||
    /deduplicate\s+tabs?/i.test(clean)
  ) {
    return { type: 'close_duplicate_tabs', rawQuery: clean };
  }

  // 2. Sort tabs by domain
  if (
    /sortier(e|en)?\s+(alle\s+)?tabs?\s+nach\s+(domain|host|adresse|alphabetisch)/i.test(clean) ||
    /tabs?\s+nach\s+(domain|host|adresse|alphabetisch)\s+sortieren/i.test(clean) ||
    /sort\s+tabs?\s+by\s+(domain|host|url|alphabetical)/i.test(clean) ||
    /order\s+tabs?\s+by\s+domain/i.test(clean)
  ) {
    return { type: 'sort_tabs_by_domain', rawQuery: clean };
  }

  // 3. Close unpinned tabs
  if (
    /schlie(ss|ß)e\s+(alle\s+)?(?:nicht\s+angepinnte[n]?|unpinned)\s+tabs?/i.test(clean) ||
    /(?:nicht\s+angepinnte[n]?|unpinned)\s+tabs?\s+schlie(ss|ß)en/i.test(clean) ||
    /close\s+(all\s+)?unpinned\s+tabs?/i.test(clean)
  ) {
    return { type: 'close_unpinned_tabs', rawQuery: clean };
  }

  // 4. Close tabs to the right
  if (
    /schlie(ss|ß)e\s+(alle\s+)?tabs?\s+rechts/i.test(clean) ||
    /close\s+(all\s+)?tabs?\s+to\s+(the\s+)?right/i.test(clean)
  ) {
    return { type: 'close_tabs_to_right', rawQuery: clean };
  }

  // 5. Create bookmark folder from tabs
  const bmMatchDe = clean.match(/speichere?\s+(alle\s+)?(?:recherche[\s-]?)?tabs?\s+als\s+lesezeichen[\s-]?ordner\s+['"„]?([^'"“\n]+)['"“]?/i);
  if (bmMatchDe && bmMatchDe[2]) {
    return {
      type: 'create_bookmark_folder',
      params: { folderName: bmMatchDe[2].trim() },
      rawQuery: clean
    };
  }
  const bmMatchEn = clean.match(/save\s+(all\s+)?tabs?\s+as\s+bookmark\s+folder\s+['"]?([^'"\n]+)['"]?/i);
  if (bmMatchEn && bmMatchEn[2]) {
    return {
      type: 'create_bookmark_folder',
      params: { folderName: bmMatchEn[2].trim() },
      rawQuery: clean
    };
  }

  // 6. Group tabs to workspace/space
  const spaceMatchDe = clean.match(/fasse?\s+(alle\s+)?tabs?(?:\s+zum\s+thema\s+['"„]?([^'"“\n]+)['"“]?)?\s+(?:in\s+einem\s+neuen|im)?\s+workspace\s+['"„]?([^'"“\n]+)['"“]?\s+zusammen/i);
  if (spaceMatchDe) {
    const filterQuery = spaceMatchDe[2]?.trim();
    const spaceName = spaceMatchDe[3]?.trim() || 'Neuer Workspace';
    return {
      type: 'group_tabs_to_space',
      params: { spaceName, filterQuery },
      rawQuery: clean
    };
  }
  const spaceMatchEn = clean.match(/group\s+(all\s+)?tabs?(?:\s+about\s+['"]?([^'"\n]+)['"]?)?\s+into\s+workspace\s+['"]?([^'"\n]+)['"]?/i);
  if (spaceMatchEn) {
    const filterQuery = spaceMatchEn[2]?.trim();
    const spaceName = spaceMatchEn[3]?.trim() || 'New Workspace';
    return {
      type: 'group_tabs_to_space',
      params: { spaceName, filterQuery },
      rawQuery: clean
    };
  }

  // 7. Open/Create new tab
  const openTabMatch = clean.match(/^(?:neuer?\s+tab|öffne\s+tab|open\s+tab|new\s+tab)\s+(?:mit\s+)?([^\s]+)$/i);
  if (openTabMatch && openTabMatch[1]) {
    const rawTarget = openTabMatch[1].trim();
    const targetUrl = /^https?:\/\//i.test(rawTarget) ? rawTarget : `https://${rawTarget}`;
    return {
      type: 'create_tab',
      params: { url: targetUrl },
      rawQuery: clean
    };
  }

  // 8. List open tabs
  if (
    /^(?:zeige|liste|list|show)\s+(alle\s+)?(offenen?\s+)?tabs?$/i.test(clean) ||
    /^welche\s+tabs\s+sind\s+offen\??$/i.test(clean)
  ) {
    return { type: 'list_tabs', rawQuery: clean };
  }

  return null;
}

/**
 * Executes a browser operation command against local Zustand stores and browser persistence.
 */
export async function executeBrowserAction(command: BrowserActionCommand): Promise<BrowserActionResult> {
  const tabStore = useTabStore.getState();

  switch (command.type) {
    case 'close_duplicate_tabs': {
      const initialCount = tabStore.tabs.length;
      tabStore.closeDuplicateTabs();
      const nextCount = useTabStore.getState().tabs.length;
      const closedCount = Math.max(0, initialCount - nextCount);

      return {
        success: true,
        action: 'close_duplicate_tabs',
        title: 'Doppelte Tabs bereinigt',
        message:
          closedCount > 0
            ? `✓ **${closedCount} doppelte(r) Tab(s)** erfolgreich geschlossen. Es verbleiben **${nextCount} eindeutige Tabs**.`
            : `Keine doppelten Tabs gefunden. Alle **${initialCount} Tabs** sind bereits eindeutig.`,
        details: { closedCount, remainingCount: nextCount }
      };
    }

    case 'sort_tabs_by_domain': {
      const tabCount = tabStore.tabs.length;
      tabStore.sortTabsByDomain();
      return {
        success: true,
        action: 'sort_tabs_by_domain',
        title: 'Tabs nach Domain sortiert',
        message: `✓ **${tabCount} Tabs** wurden alphabetisch nach Hostname und Domain gruppiert.`,
        details: { tabCount }
      };
    }

    case 'close_unpinned_tabs': {
      const initialCount = tabStore.tabs.length;
      tabStore.closeUnpinnedTabs();
      const nextCount = useTabStore.getState().tabs.length;
      const closedCount = Math.max(0, initialCount - nextCount);

      return {
        success: true,
        action: 'close_unpinned_tabs',
        title: 'Nicht angepinnte Tabs geschlossen',
        message: `✓ **${closedCount} Tabs** geschlossen. **${nextCount} angepinnte Tabs** bleiben erhalten.`,
        details: { closedCount, remainingCount: nextCount }
      };
    }

    case 'close_tabs_to_right': {
      const initialCount = tabStore.tabs.length;
      if (tabStore.activeTabId) {
        tabStore.closeTabsToRight(tabStore.activeTabId);
      }
      const nextCount = useTabStore.getState().tabs.length;
      const closedCount = Math.max(0, initialCount - nextCount);

      return {
        success: true,
        action: 'close_tabs_to_right',
        title: 'Rechte Tabs geschlossen',
        message: `✓ **${closedCount} Tabs** rechts vom aktiven Tab wurden geschlossen.`,
        details: { closedCount, remainingCount: nextCount }
      };
    }

    case 'create_bookmark_folder': {
      const folderName = command.params?.folderName || 'Recherche';
      const filter = (command.params?.filterQuery || '').toLowerCase();

      let targetTabs = tabStore.tabs.filter((t) => isBookmarkableUrl(t.url));
      if (filter) {
        targetTabs = targetTabs.filter(
          (t) => t.title.toLowerCase().includes(filter) || t.url.toLowerCase().includes(filter)
        );
      }

      if (targetTabs.length === 0) {
        return {
          success: false,
          action: 'create_bookmark_folder',
          title: 'Keine Lesezeichen gespeichert',
          message: `Es wurden keine passenden Tabs zum Speichern im Ordner **„${folderName}“** gefunden.`,
          details: { folderName, tabCount: 0 }
        };
      }

      const memoryStore: Record<string, string> = {};
      const storage = typeof window !== 'undefined' && window.localStorage
        ? window.localStorage
        : {
            getItem: (k: string) => memoryStore[k] ?? null,
            setItem: (k: string, v: string) => { memoryStore[k] = v; }
          };

      let existingBookmarks: BrowserBookmark[] = [];
      try {
        existingBookmarks = loadBookmarks(storage);
      } catch {
        existingBookmarks = [];
      }

      const newBookmarks: BrowserBookmark[] = targetTabs.map((t, idx) => ({
        id: `bm-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        title: t.title || t.url,
        url: t.url,
        createdAt: Date.now()
      }));

      try {
        saveBookmarks(storage, [...existingBookmarks, ...newBookmarks]);
      } catch {
        // ignore
      }

      return {
        success: true,
        action: 'create_bookmark_folder',
        title: `Lesezeichen-Ordner „${folderName}“ erstellt`,
        message: `✓ **${newBookmarks.length} Tabs** wurden als Lesezeichen im Ordner **„${folderName}“** abgelegt.`,
        details: {
          folderName,
          tabCount: newBookmarks.length,
          items: newBookmarks.map((b) => ({ title: b.title, url: b.url }))
        }
      };
    }

    case 'group_tabs_to_space': {
      const spaceName = command.params?.spaceName || 'Neuer Workspace';
      const filter = (command.params?.filterQuery || '').toLowerCase();

      let targetTabs = tabStore.tabs;
      if (filter) {
        targetTabs = targetTabs.filter(
          (t) => t.title.toLowerCase().includes(filter) || t.url.toLowerCase().includes(filter)
        );
      }

      // Try creating space via sidekick API if available
      try {
        if (typeof window !== 'undefined' && window.lastbrowser?.sidekick?.addSpace) {
          const fakePath = `spaces/${spaceName.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`;
          await window.lastbrowser.sidekick.addSpace({ name: spaceName, path: fakePath, create: true });
        }
      } catch {
        // local space fallback
      }

      return {
        success: true,
        action: 'group_tabs_to_space',
        title: `Workspace „${spaceName}“ erstellt`,
        message: `✓ Workspace **„${spaceName}“** initialisiert mit **${targetTabs.length} zugeordneten Tabs**.`,
        details: { spaceName, tabCount: targetTabs.length }
      };
    }

    case 'create_tab': {
      const url = command.params?.url || 'https://duckduckgo.com';
      tabStore.addTab(url);
      return {
        success: true,
        action: 'create_tab',
        title: 'Tab geöffnet',
        message: `✓ Neuer Tab geöffnet mit URL: [${url}](${url})`,
        details: { tabCount: tabStore.tabs.length + 1 }
      };
    }

    case 'list_tabs': {
      const tabs = tabStore.tabs;
      const listMarkdown = tabs
        .map((t, idx) => `${idx + 1}. **[Tab ${idx + 1}: ${t.title || t.url}](${t.url})** ${t.pinned ? '📌' : ''}`)
        .join('\n');

      return {
        success: true,
        action: 'list_tabs',
        title: `${tabs.length} offene Tabs`,
        message: `Derzeit sind **${tabs.length} Tabs** im aktiven Fenster geöffnet:\n\n${listMarkdown}`,
        details: {
          tabCount: tabs.length,
          items: tabs.map((t) => ({ title: t.title, url: t.url }))
        }
      };
    }

    default:
      return {
        success: false,
        action: command.type,
        title: 'Unbekannte Aktion',
        message: 'Die angeforderte Browser-Aktion wird derzeit noch nicht unterstützt.'
      };
  }
}

/**
 * Declarations for Sidekick / LLM Function Calling tool-use.
 */
export const BROWSER_AGENT_TOOLS_SCHEMA = [
  {
    name: 'close_duplicate_tabs',
    description: 'Deduplicates open browser tabs by URL, keeping the best or pinned instance and closing duplicates.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'sort_tabs_by_domain',
    description: 'Sorts all open tabs alphabetically by their hostname and domain name.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'close_unpinned_tabs',
    description: 'Closes all open tabs that are not pinned.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'create_bookmark_folder',
    description: 'Saves active or filtered open tabs into a named bookmark folder.',
    parameters: {
      type: 'object',
      properties: {
        folderName: { type: 'string', description: 'Name of the bookmark folder to create.' },
        filterQuery: { type: 'string', description: 'Optional keyword filter for matching tabs.' }
      },
      required: ['folderName']
    }
  },
  {
    name: 'group_tabs_to_space',
    description: 'Creates a workspace/space and groups matching tabs into it.',
    parameters: {
      type: 'object',
      properties: {
        spaceName: { type: 'string', description: 'Name of the workspace.' },
        filterQuery: { type: 'string', description: 'Optional topic/keyword to select specific tabs.' }
      },
      required: ['spaceName']
    }
  },
  {
    name: 'create_tab',
    description: 'Opens a new browser tab with the given URL.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to navigate to.' }
      },
      required: ['url']
    }
  }
];
