import { create } from 'zustand';
import {
  type LastbrowserPanelId,
  lastbrowserPanels,
  loadInitialPanel,
  saveActivePanel,
  loadBooleanPreference,
  saveBooleanPreference,
  loadNumericPreference,
  saveNumericPreference,
  loadInstalledSidebarApps,
  saveInstalledSidebarApps,
  leftSidebarCollapsedStorageKey,
  contextSidebarWidthStorageKey,
  workspacePanelWidthStorageKey,
  workspacePanelCollapsedStorageKey
} from '../shell-state.js';

const DEFAULT_CONTEXT_SIDEBAR_WIDTH = 280;
const MIN_CONTEXT_SIDEBAR_WIDTH = 220;
const MAX_CONTEXT_SIDEBAR_WIDTH = 420;

const DEFAULT_WORKSPACE_PANEL_WIDTH = 320;
const MIN_WORKSPACE_PANEL_WIDTH = 260;
const MAX_WORKSPACE_PANEL_WIDTH = 520;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type SidebarMode = 'slim' | 'expanded' | 'hidden';

export interface PanelState {
  activePanel: LastbrowserPanelId;
  leftSidebarCollapsed: boolean;
  sidebarMode: SidebarMode;
  copilotOpen: boolean;
  contextSidebarCollapsed: boolean;
  contextSidebarWidth: number;
  workspacePanelCollapsed: boolean;
  workspacePanelWidth: number;
  activeContextItem: string;
  installedSidebarApps: LastbrowserPanelId[];
  findOpen: boolean;
  findQuery: string;
  downloadsOpen: boolean;
  historyOpen: boolean;
  permissionsOpen: boolean;
  commandPaletteOpen: boolean;

  setActivePanel(panel: LastbrowserPanelId): void;
  setLeftSidebarCollapsed(collapsed: boolean | ((current: boolean) => boolean)): void;
  setSidebarMode(mode: SidebarMode | ((current: SidebarMode) => SidebarMode)): void;
  cycleSidebarMode(): void;
  setCopilotOpen(open: boolean | ((current: boolean) => boolean)): void;
  toggleCopilot(): void;
  setContextSidebarCollapsed(collapsed: boolean | ((current: boolean) => boolean)): void;
  setContextSidebarWidth(width: number | ((current: number) => number)): void;
  setWorkspacePanelCollapsed(collapsed: boolean | ((current: boolean) => boolean)): void;
  setWorkspacePanelWidth(width: number | ((current: number) => number)): void;
  setActiveContextItem(item: string | ((current: string) => string)): void;
  setInstalledSidebarApps(apps: LastbrowserPanelId[] | ((current: LastbrowserPanelId[]) => LastbrowserPanelId[])): void;
  toggleFindOpen(): void;
  setFindOpen(open: boolean): void;
  setFindQuery(q: string): void;
  setDownloadsOpen(open: boolean): void;
  setHistoryOpen(open: boolean): void;
  setPermissionsOpen(open: boolean): void;
  setCommandPaletteOpen(open: boolean | ((current: boolean) => boolean)): void;
  toggleCommandPalette(): void;
}

export const sidebarModeStorageKey = 'lastbrowser.sidebarMode.v1';
export const copilotOpenStorageKey = 'lastbrowser.copilotOpen.v1';

function loadSidebarMode(): SidebarMode {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(sidebarModeStorageKey);
      if (raw === 'slim' || raw === 'expanded' || raw === 'hidden') return raw;
    }
  } catch {
    // ignore
  }
  return 'slim';
}

function loadCopilotOpen(): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(copilotOpenStorageKey);
      if (raw !== null) return raw === 'true';
    }
  } catch {
    // ignore
  }
  return true;
}

export const usePanelStore = create<PanelState>((set) => ({
  activePanel: loadInitialPanel(),
  leftSidebarCollapsed: loadBooleanPreference(undefined, leftSidebarCollapsedStorageKey, false),
  sidebarMode: loadSidebarMode(),
  copilotOpen: loadCopilotOpen(),
  contextSidebarCollapsed: false,
  contextSidebarWidth: loadNumericPreference(
    undefined,
    contextSidebarWidthStorageKey,
    DEFAULT_CONTEXT_SIDEBAR_WIDTH,
    MIN_CONTEXT_SIDEBAR_WIDTH,
    MAX_CONTEXT_SIDEBAR_WIDTH
  ),
  workspacePanelCollapsed: loadBooleanPreference(
    undefined,
    workspacePanelCollapsedStorageKey,
    false
  ),
  workspacePanelWidth: loadNumericPreference(
    undefined,
    workspacePanelWidthStorageKey,
    DEFAULT_WORKSPACE_PANEL_WIDTH,
    MIN_WORKSPACE_PANEL_WIDTH,
    MAX_WORKSPACE_PANEL_WIDTH
  ),
  activeContextItem: '',
  installedSidebarApps: loadInstalledSidebarApps(),
  findOpen: false,
  findQuery: '',
  downloadsOpen: false,
  historyOpen: false,
  permissionsOpen: false,
  commandPaletteOpen: false,

  setActivePanel: (activePanel) => {
    saveActivePanel(undefined, activePanel);
    set({ activePanel });
  },

  setLeftSidebarCollapsed: (input) => {
    set((state) => {
      const leftSidebarCollapsed = typeof input === 'function' ? input(state.leftSidebarCollapsed) : input;
      saveBooleanPreference(undefined, leftSidebarCollapsedStorageKey, leftSidebarCollapsed);
      return {
        leftSidebarCollapsed,
        sidebarMode: leftSidebarCollapsed ? (state.sidebarMode === 'hidden' ? 'hidden' : 'slim') : 'expanded'
      };
    });
  },

  setSidebarMode: (input) => {
    set((state) => {
      const mode = typeof input === 'function' ? input(state.sidebarMode) : input;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(sidebarModeStorageKey, mode);
        }
      } catch {
        // ignore
      }
      return { sidebarMode: mode, leftSidebarCollapsed: mode !== 'expanded' };
    });
  },

  cycleSidebarMode: () => {
    set((state) => {
      const nextMode: SidebarMode =
        state.sidebarMode === 'slim'
          ? 'expanded'
          : state.sidebarMode === 'expanded'
            ? 'hidden'
            : 'slim';
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(sidebarModeStorageKey, nextMode);
        }
      } catch {
        // ignore
      }
      return { sidebarMode: nextMode, leftSidebarCollapsed: nextMode !== 'expanded' };
    });
  },

  setCopilotOpen: (input) => {
    set((state) => {
      const copilotOpen = typeof input === 'function' ? input(state.copilotOpen) : input;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(copilotOpenStorageKey, String(copilotOpen));
        }
      } catch {
        // ignore
      }
      return { copilotOpen };
    });
  },

  toggleCopilot: () => {
    set((state) => {
      const copilotOpen = !state.copilotOpen;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(copilotOpenStorageKey, String(copilotOpen));
        }
      } catch {
        // ignore
      }
      return { copilotOpen };
    });
  },

  setContextSidebarCollapsed: (input) => {
    set((state) => ({
      contextSidebarCollapsed: typeof input === 'function' ? input(state.contextSidebarCollapsed) : input
    }));
  },

  setContextSidebarWidth: (input) => {
    set((state) => {
      const raw = typeof input === 'function' ? input(state.contextSidebarWidth) : input;
      const contextSidebarWidth = clamp(raw, MIN_CONTEXT_SIDEBAR_WIDTH, MAX_CONTEXT_SIDEBAR_WIDTH);
      saveNumericPreference(undefined, contextSidebarWidthStorageKey, contextSidebarWidth);
      return { contextSidebarWidth };
    });
  },

  setWorkspacePanelCollapsed: (input) => {
    set((state) => {
      const workspacePanelCollapsed = typeof input === 'function' ? input(state.workspacePanelCollapsed) : input;
      saveBooleanPreference(undefined, workspacePanelCollapsedStorageKey, workspacePanelCollapsed);
      return { workspacePanelCollapsed };
    });
  },

  setWorkspacePanelWidth: (input) => {
    set((state) => {
      const raw = typeof input === 'function' ? input(state.workspacePanelWidth) : input;
      const workspacePanelWidth = clamp(raw, MIN_WORKSPACE_PANEL_WIDTH, MAX_WORKSPACE_PANEL_WIDTH);
      saveNumericPreference(undefined, workspacePanelWidthStorageKey, workspacePanelWidth);
      return { workspacePanelWidth };
    });
  },

  setActiveContextItem: (input) => {
    set((state) => ({
      activeContextItem: typeof input === 'function' ? input(state.activeContextItem) : input
    }));
  },

  setInstalledSidebarApps: (input) => {
    set((state) => {
      const installedSidebarApps = typeof input === 'function' ? input(state.installedSidebarApps) : input;
      saveInstalledSidebarApps(undefined, installedSidebarApps);
      return { installedSidebarApps };
    });
  },

  toggleFindOpen: () => set((state) => ({ findOpen: !state.findOpen })),
  setFindOpen: (findOpen) => set({ findOpen }),
  setFindQuery: (findQuery) => set({ findQuery }),
  setDownloadsOpen: (downloadsOpen) => set({ downloadsOpen }),
  setHistoryOpen: (historyOpen) => set({ historyOpen }),
  setPermissionsOpen: (permissionsOpen) => set({ permissionsOpen }),
  setCommandPaletteOpen: (input) => {
    set((state) => ({
      commandPaletteOpen: typeof input === 'function' ? input(state.commandPaletteOpen) : input
    }));
  },
  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen }))
}));
