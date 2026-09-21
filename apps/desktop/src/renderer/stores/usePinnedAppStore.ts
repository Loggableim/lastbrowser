import { create } from 'zustand';
import type { LastbrowserPanelId } from '../shell-state.js';

export interface PinnedApp {
  id: string;
  name: string;
  url?: string;
  panel?: LastbrowserPanelId;
  color: string;
  bg: string;
  letter?: string;
  iconName?: string;
  faviconUrl?: string;
  domain?: string;
}

export const PRESET_PINNED_APPS: PinnedApp[] = [
  {
    id: 'notion',
    name: 'Notion',
    url: 'https://www.notion.so',
    color: '#ffffff',
    bg: '#000000',
    letter: 'N',
    iconName: 'notion',
    domain: 'notion.so'
  },
  {
    id: 'figma',
    name: 'Figma',
    url: 'https://www.figma.com',
    color: '#00d9ff',
    bg: 'rgba(0, 217, 255, 0.15)',
    iconName: 'figma',
    domain: 'figma.com'
  },
  {
    id: 'slack',
    name: 'Slack',
    url: 'https://slack.com',
    color: '#e01e5a',
    bg: 'rgba(224, 30, 90, 0.15)',
    iconName: 'slack',
    domain: 'slack.com'
  },
  {
    id: 'github',
    name: 'GitHub',
    url: 'https://github.com',
    color: '#f0f6fc',
    bg: 'rgba(240, 246, 252, 0.12)',
    iconName: 'github',
    domain: 'github.com'
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chatgpt.com',
    color: '#10a37f',
    bg: 'rgba(16, 163, 127, 0.15)',
    iconName: 'chatgpt',
    domain: 'chatgpt.com'
  },
  {
    id: 'youtube',
    name: 'YouTube',
    url: 'https://www.youtube.com',
    color: '#ff0000',
    bg: 'rgba(255, 0, 0, 0.15)',
    iconName: 'youtube',
    domain: 'youtube.com'
  },
  {
    id: 'gmail',
    name: 'Gmail',
    url: 'https://mail.google.com',
    color: '#ea4335',
    bg: 'rgba(234, 67, 53, 0.15)',
    iconName: 'gmail',
    domain: 'mail.google.com'
  },
  {
    id: 'linear',
    name: 'Linear',
    url: 'https://linear.app',
    color: '#5e6ad2',
    bg: 'rgba(94, 106, 210, 0.15)',
    iconName: 'linear',
    domain: 'linear.app'
  },
  {
    id: 'discord',
    name: 'Discord',
    url: 'https://discord.com/app',
    color: '#5865f2',
    bg: 'rgba(88, 101, 242, 0.15)',
    iconName: 'discord',
    domain: 'discord.com'
  },
  {
    id: 'spotify',
    name: 'Spotify',
    url: 'https://open.spotify.com',
    color: '#1db954',
    bg: 'rgba(29, 185, 84, 0.15)',
    iconName: 'spotify',
    domain: 'spotify.com'
  },
  {
    id: 'twitter',
    name: 'X (Twitter)',
    url: 'https://x.com',
    color: '#ffffff',
    bg: 'rgba(255, 255, 255, 0.1)',
    iconName: 'twitter',
    domain: 'x.com'
  },
  {
    id: 'calendar',
    name: 'Calendar',
    url: 'https://calendar.google.com',
    color: '#4285f4',
    bg: 'rgba(66, 133, 244, 0.15)',
    iconName: 'calendar',
    domain: 'calendar.google.com'
  },
  {
    id: 'terminal',
    name: 'Terminal',
    panel: 'terminal',
    color: '#a8ff3e',
    bg: 'rgba(168, 255, 62, 0.12)',
    iconName: 'terminal'
  },
  {
    id: 'trello',
    name: 'Trello',
    url: 'https://trello.com',
    color: '#0079bf',
    bg: 'rgba(0, 121, 191, 0.15)',
    iconName: 'trello',
    domain: 'trello.com'
  },
  {
    id: 'jira',
    name: 'Jira',
    url: 'https://www.atlassian.com/software/jira',
    color: '#0052cc',
    bg: 'rgba(0, 82, 204, 0.15)',
    iconName: 'jira',
    domain: 'atlassian.com'
  },
  {
    id: 'miro',
    name: 'Miro',
    url: 'https://miro.com',
    color: '#ffd02f',
    bg: 'rgba(255, 208, 47, 0.15)',
    letter: 'M',
    iconName: 'miro',
    domain: 'miro.com'
  }
];

export const DEFAULT_PINNED_APPS: PinnedApp[] = [
  PRESET_PINNED_APPS[0], // Notion
  PRESET_PINNED_APPS[1], // Figma
  PRESET_PINNED_APPS[13], // Trello
  PRESET_PINNED_APPS[12], // Terminal
  PRESET_PINNED_APPS[2], // Slack
  {
    id: 'netflix',
    name: 'Netflix',
    url: 'https://www.netflix.com',
    color: '#e50914',
    bg: 'rgba(229, 9, 20, 0.15)',
    letter: 'N',
    iconName: 'netflix',
    domain: 'netflix.com'
  },
  PRESET_PINNED_APPS[14], // Jira
  PRESET_PINNED_APPS[15]  // Miro
];

export const PINNED_APPS_STORAGE_KEY_V2 = 'lastbrowser.pinnedApps.v2';
export const PINNED_APPS_STORAGE_KEY_V1 = 'lastbrowser.pinnedApps.v1';

export function extractAppDomain(url?: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function getFaviconUrl(url?: string): string {
  const domain = extractAppDomain(url);
  if (!domain) return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function loadInitialPinnedApps(): PinnedApp[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      // Check v2 first
      const rawV2 = window.localStorage.getItem(PINNED_APPS_STORAGE_KEY_V2);
      if (rawV2) {
        const parsed = JSON.parse(rawV2);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      // Check v1 migration
      const rawV1 = window.localStorage.getItem(PINNED_APPS_STORAGE_KEY_V1);
      if (rawV1) {
        const parsed = JSON.parse(rawV1);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const migrated: PinnedApp[] = parsed.map((app: any) => ({
            ...app,
            domain: app.domain || extractAppDomain(app.url),
            faviconUrl: app.faviconUrl || (app.url ? getFaviconUrl(app.url) : undefined)
          }));
          window.localStorage.setItem(PINNED_APPS_STORAGE_KEY_V2, JSON.stringify(migrated));
          return migrated;
        }
      }
    }
  } catch {
    // Ignore and return defaults
  }
  return DEFAULT_PINNED_APPS;
}

function savePinnedAppsToStorage(apps: PinnedApp[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(PINNED_APPS_STORAGE_KEY_V2, JSON.stringify(apps));
    }
  } catch {
    // Ignore storage write errors
  }
}

export interface PinnedAppState {
  apps: PinnedApp[];
  activeAppId: string | null;

  // Actions
  setApps: (apps: PinnedApp[]) => void;
  setActiveAppId: (id: string | null) => void;
  addApp: (app: Omit<PinnedApp, 'id'> & { id?: string }) => PinnedApp;
  updateApp: (id: string, updates: Partial<PinnedApp>) => void;
  removeApp: (id: string) => void;
  reorderApps: (fromIndex: number, toIndex: number) => void;
  pinTabAsApp: (tab: { title: string; url: string; favicon?: string }) => PinnedApp;
  resetToDefaults: () => void;
  findMatchingApp: (url: string) => PinnedApp | undefined;
  isAppRunning: (app: PinnedApp, openUrls: string[]) => boolean;
}

export const usePinnedAppStore = create<PinnedAppState>((set, get) => ({
  apps: loadInitialPinnedApps(),
  activeAppId: null,

  setApps: (apps) => {
    savePinnedAppsToStorage(apps);
    set({ apps });
  },

  setActiveAppId: (activeAppId) => set({ activeAppId }),

  addApp: (appData) => {
    const domain = appData.domain || extractAppDomain(appData.url);
    const id = appData.id || `app-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newApp: PinnedApp = {
      id,
      name: appData.name.trim() || domain || 'Web App',
      url: appData.url,
      panel: appData.panel,
      color: appData.color || '#38bdf8',
      bg: appData.bg || 'rgba(56, 189, 248, 0.15)',
      letter: appData.letter || (appData.name ? appData.name.charAt(0).toUpperCase() : undefined),
      iconName: appData.iconName || 'generic',
      faviconUrl: appData.faviconUrl || (appData.url ? getFaviconUrl(appData.url) : undefined),
      domain
    };

    const updated = [...get().apps, newApp];
    savePinnedAppsToStorage(updated);
    set({ apps: updated });
    return newApp;
  },

  updateApp: (id, updates) => {
    const updated = get().apps.map((app) => {
      if (app.id !== id) return app;
      const merged = { ...app, ...updates };
      if (updates.url && !updates.domain) {
        merged.domain = extractAppDomain(updates.url);
      }
      if (updates.url && !updates.faviconUrl) {
        merged.faviconUrl = getFaviconUrl(updates.url);
      }
      return merged;
    });
    savePinnedAppsToStorage(updated);
    set({ apps: updated });
  },

  removeApp: (id) => {
    const updated = get().apps.filter((app) => app.id !== id);
    savePinnedAppsToStorage(updated);
    set({
      apps: updated,
      activeAppId: get().activeAppId === id ? null : get().activeAppId
    });
  },

  reorderApps: (fromIndex, toIndex) => {
    const current = [...get().apps];
    if (fromIndex < 0 || fromIndex >= current.length || toIndex < 0 || toIndex >= current.length) {
      return;
    }
    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);
    savePinnedAppsToStorage(current);
    set({ apps: current });
  },

  pinTabAsApp: (tab) => {
    const domain = extractAppDomain(tab.url);
    const existing = get().findMatchingApp(tab.url);
    if (existing) {
      return existing;
    }

    const title = tab.title.split(/[-|•—]/)[0]?.trim() || domain || 'Web App';
    return get().addApp({
      name: title.length > 20 ? title.substring(0, 20) : title,
      url: tab.url,
      color: '#38bdf8',
      bg: 'rgba(56, 189, 248, 0.15)',
      domain,
      faviconUrl: tab.favicon || getFaviconUrl(tab.url),
      letter: title.charAt(0).toUpperCase()
    });
  },

  resetToDefaults: () => {
    savePinnedAppsToStorage(DEFAULT_PINNED_APPS);
    set({ apps: DEFAULT_PINNED_APPS, activeAppId: null });
  },

  findMatchingApp: (url) => {
    if (!url) return undefined;
    const cleanUrl = url.toLowerCase();
    const urlDomain = extractAppDomain(url).toLowerCase();

    return get().apps.find((app) => {
      if (app.url && cleanUrl.startsWith(app.url.toLowerCase())) return true;
      if (app.domain && urlDomain && (urlDomain === app.domain || urlDomain.endsWith(`.${app.domain}`))) {
        return true;
      }
      return false;
    });
  },

  isAppRunning: (app, openUrls) => {
    if (!app.url && !app.domain) return false;
    const targetDomain = (app.domain || extractAppDomain(app.url)).toLowerCase();
    if (!targetDomain) return false;

    return openUrls.some((url) => {
      if (!url) return false;
      const d = extractAppDomain(url).toLowerCase();
      return d === targetDomain || d.endsWith(`.${targetDomain}`);
    });
  }
}));
