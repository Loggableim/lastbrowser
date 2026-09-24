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
export type ZenExitDefaultMode = 'slim' | 'expanded';
export type SidebarDrawerTab = 'tabs' | 'ai' | 'workflows' | 'tools';
export type ActionBarDock =
  | 'topbar'
  | 'sidebar'
  | 'bottom'
  | 'bottom-center'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'free';
export type ThemeAccent = 'neon-cyan' | 'electric-violet' | 'emerald-flow' | 'solar-amber' | 'monochrome-slate';
export type GlassLevel = 'solid' | 'subtle' | 'modern' | 'deep';
export type UiDensity = 'compact' | 'standard' | 'comfortable';

export type NovaDockPosition = 'left' | 'right' | 'top' | 'bottom' | 'floating';
export type NovaDockOrientation = 'vertical' | 'horizontal';
export type NovaDockAnimation = 'slide' | 'fade' | 'instant';

export interface NovaDockCoordinates {
  x: number;
  y: number;
}

export interface NovaDockSettings {
  position: NovaDockPosition;
  orientation: NovaDockOrientation;
  floatingPos: NovaDockCoordinates;
  autoHide: boolean;
  animation: NovaDockAnimation;
  animationDuration: number;
  magnification: number;
  neighborScale: number;
}

export type NovaDockPreset = 'bottom-dock' | 'classic-left' | 'floating-widget' | 'minimalist-autohide';

export const NOVA_DOCK_PRESETS: Record<NovaDockPreset, NovaDockSettings> = {
  'bottom-dock': {
    position: 'bottom',
    orientation: 'horizontal',
    floatingPos: { x: 50, y: 50 },
    autoHide: false,
    animation: 'slide',
    animationDuration: 250,
    magnification: 1.4,
    neighborScale: 1.18,
  },
  'classic-left': {
    position: 'left',
    orientation: 'vertical',
    floatingPos: { x: 50, y: 50 },
    autoHide: false,
    animation: 'slide',
    animationDuration: 250,
    magnification: 1.25,
    neighborScale: 1.1,
  },
  'floating-widget': {
    position: 'floating',
    orientation: 'horizontal',
    floatingPos: { x: 100, y: 120 },
    autoHide: false,
    animation: 'fade',
    animationDuration: 200,
    magnification: 1.35,
    neighborScale: 1.15,
  },
  'minimalist-autohide': {
    position: 'bottom',
    orientation: 'horizontal',
    floatingPos: { x: 50, y: 50 },
    autoHide: true,
    animation: 'slide',
    animationDuration: 180,
    magnification: 1.4,
    neighborScale: 1.18,
  },
};

export const DEFAULT_NOVA_DOCK_SETTINGS: NovaDockSettings = NOVA_DOCK_PRESETS['classic-left'];
export const novaDockSettingsStorageKey = 'lastbrowser.novaDockSettings.v1';

export interface PanelState {
  activePanel: LastbrowserPanelId;
  leftSidebarCollapsed: boolean;
  sidebarMode: SidebarMode;
  zenExitDefaultMode: ZenExitDefaultMode;
  sidebarDrawerTab: SidebarDrawerTab;
  actionBarDock: ActionBarDock;
  dockSettings: NovaDockSettings;
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
  extensionHubOpen: boolean;
  extensionHubTab: 'webextensions' | 'skills';
  themeAccent: ThemeAccent;
  glassLevel: GlassLevel;
  uiDensity: UiDensity;
  a11yHighContrast: boolean;
  a11yDyslexicFont: boolean;
  a11yMinFontSize: number;
  a11yUiZoom: number;
  a11yFocusRings: boolean;

  setActivePanel(panel: LastbrowserPanelId): void;
  setLeftSidebarCollapsed(collapsed: boolean | ((current: boolean) => boolean)): void;
  setSidebarMode(mode: SidebarMode | ((current: SidebarMode) => SidebarMode)): void;
  setZenExitDefaultMode(mode: ZenExitDefaultMode): void;
  setSidebarDrawerTab(tab: SidebarDrawerTab): void;
  setActionBarDock(dock: ActionBarDock): void;
  setDockSettings(settings: Partial<NovaDockSettings> | ((current: NovaDockSettings) => NovaDockSettings)): void;
  applyDockPreset(preset: NovaDockPreset): void;
  resetFloatingDockPos(): void;
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
  setExtensionHubOpen(open: boolean | ((current: boolean) => boolean)): void;
  toggleExtensionHub(): void;
  setExtensionHubTab(tab: 'webextensions' | 'skills'): void;
  setThemeAccent(accent: ThemeAccent): void;
  setGlassLevel(level: GlassLevel): void;
  setUiDensity(density: UiDensity): void;
  setA11yHighContrast(val: boolean): void;
  setA11yDyslexicFont(val: boolean): void;
  setA11yMinFontSize(val: number): void;
  setA11yUiZoom(val: number): void;
  setA11yFocusRings(val: boolean): void;
}

export const sidebarModeStorageKey = 'lastbrowser.sidebarMode.v1';
export const copilotOpenStorageKey = 'lastbrowser.copilotOpen.v1';
export const zenExitDefaultModeStorageKey = 'lastbrowser.zenExitDefaultMode.v1';
export const sidebarDrawerTabStorageKey = 'lastbrowser.sidebarDrawerTab.v1';
export const actionBarDockStorageKey = 'lastbrowser.actionBarDock.v1';
export const themeAccentStorageKey = 'lastbrowser.themeAccent.v1';
export const glassLevelStorageKey = 'lastbrowser.glassLevel.v1';
export const uiDensityStorageKey = 'lastbrowser.uiDensity.v1';
export const a11yHighContrastStorageKey = 'lastbrowser.a11yHighContrast.v1';
export const a11yDyslexicFontStorageKey = 'lastbrowser.a11yDyslexicFont.v1';
export const a11yMinFontSizeStorageKey = 'lastbrowser.a11yMinFontSize.v1';
export const a11yUiZoomStorageKey = 'lastbrowser.a11yUiZoom.v1';
export const a11yFocusRingsStorageKey = 'lastbrowser.a11yFocusRings.v1';

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

function loadZenExitDefaultMode(): ZenExitDefaultMode {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(zenExitDefaultModeStorageKey);
      if (raw === 'slim' || raw === 'expanded') return raw;
    }
  } catch {
    // ignore
  }
  return 'slim';
}

function loadSidebarDrawerTab(): SidebarDrawerTab {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(sidebarDrawerTabStorageKey);
      if (raw === 'tabs' || raw === 'ai' || raw === 'workflows' || raw === 'tools') return raw;
    }
  } catch {
    // ignore
  }
  return 'tabs';
}

function loadActionBarDock(): ActionBarDock {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(actionBarDockStorageKey) as ActionBarDock;
      if (
        raw === 'topbar' ||
        raw === 'sidebar' ||
        raw === 'bottom' ||
        raw === 'bottom-center' ||
        raw === 'top-left' ||
        raw === 'top-center' ||
        raw === 'top-right' ||
        raw === 'free'
      ) return raw;
    }
  } catch {
    // ignore
  }
  return 'topbar';
}

function loadThemeAccent(): ThemeAccent {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(themeAccentStorageKey);
      if (raw === 'neon-cyan' || raw === 'electric-violet' || raw === 'emerald-flow' || raw === 'solar-amber' || raw === 'monochrome-slate') return raw;
    }
  } catch {
    // ignore
  }
  return 'neon-cyan';
}

function loadGlassLevel(): GlassLevel {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(glassLevelStorageKey);
      if (raw === 'solid' || raw === 'subtle' || raw === 'modern' || raw === 'deep') return raw;
    }
  } catch {
    // ignore
  }
  return 'modern';
}

function loadUiDensity(): UiDensity {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(uiDensityStorageKey);
      if (raw === 'compact' || raw === 'standard' || raw === 'comfortable') return raw;
    }
  } catch {
    // ignore
  }
  return 'standard';
}

function loadNovaDockSettings(): NovaDockSettings {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(novaDockSettingsStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<NovaDockSettings>;
        return {
          ...DEFAULT_NOVA_DOCK_SETTINGS,
          ...parsed,
          floatingPos: {
            x: typeof parsed.floatingPos?.x === 'number' ? parsed.floatingPos.x : DEFAULT_NOVA_DOCK_SETTINGS.floatingPos.x,
            y: typeof parsed.floatingPos?.y === 'number' ? parsed.floatingPos.y : DEFAULT_NOVA_DOCK_SETTINGS.floatingPos.y
          }
        };
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_NOVA_DOCK_SETTINGS;
}

function saveNovaDockSettings(settings: NovaDockSettings): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(novaDockSettingsStorageKey, JSON.stringify(settings));
    }
  } catch {
    // ignore
  }
}

function syncAppearanceToDom(accent: ThemeAccent, glass: GlassLevel, density: UiDensity): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.themeAccent = accent;
    document.documentElement.dataset.glassLevel = glass;
    document.documentElement.dataset.uiDensity = density;
  }
}

function loadA11yHighContrast(): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(a11yHighContrastStorageKey);
      if (raw !== null) return raw === 'true';
    }
  } catch {
    // ignore
  }
  return false;
}

function loadA11yDyslexicFont(): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(a11yDyslexicFontStorageKey);
      if (raw !== null) return raw === 'true';
    }
  } catch {
    // ignore
  }
  return false;
}

function loadA11yMinFontSize(): number {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(a11yMinFontSizeStorageKey);
      if (raw !== null) {
        const val = Number(raw);
        if (!isNaN(val) && val >= 0) return val;
      }
    }
  } catch {
    // ignore
  }
  return 0;
}

function loadA11yUiZoom(): number {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(a11yUiZoomStorageKey);
      if (raw !== null) {
        const val = Number(raw);
        if (!isNaN(val) && val >= 80 && val <= 150) return val;
      }
    }
  } catch {
    // ignore
  }
  return 100;
}

function loadA11yFocusRings(): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(a11yFocusRingsStorageKey);
      if (raw !== null) return raw === 'true';
    }
  } catch {
    // ignore
  }
  return false;
}

function applyA11yHighContrastToDom(val: boolean): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.a11yHighContrast = String(val);
  }
}

function applyA11yDyslexicFontToDom(val: boolean): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.a11yDyslexia = String(val);
  }
}

function applyA11yMinFontSizeToDom(val: number): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    if (val > 0) {
      document.documentElement.style.setProperty('--min-font-size', `${val}px`);
    } else {
      document.documentElement.style.removeProperty('--min-font-size');
    }
  }
}

function applyA11yUiZoomToDom(val: number): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.style.zoom = `${val / 100}`;
  }
}

function applyA11yFocusRingsToDom(val: boolean): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.a11yFocusRings = String(val);
  }
}

function syncA11yToDom(
  highContrast: boolean,
  dyslexicFont: boolean,
  minFontSize: number,
  uiZoom: number,
  focusRings: boolean
): void {
  applyA11yHighContrastToDom(highContrast);
  applyA11yDyslexicFontToDom(dyslexicFont);
  applyA11yMinFontSizeToDom(minFontSize);
  applyA11yUiZoomToDom(uiZoom);
  applyA11yFocusRingsToDom(focusRings);
}

const initialThemeAccent = loadThemeAccent();
const initialGlassLevel = loadGlassLevel();
const initialUiDensity = loadUiDensity();
syncAppearanceToDom(initialThemeAccent, initialGlassLevel, initialUiDensity);

const initialA11yHighContrast = loadA11yHighContrast();
const initialA11yDyslexicFont = loadA11yDyslexicFont();
const initialA11yMinFontSize = loadA11yMinFontSize();
const initialA11yUiZoom = loadA11yUiZoom();
const initialA11yFocusRings = loadA11yFocusRings();
syncA11yToDom(
  initialA11yHighContrast,
  initialA11yDyslexicFont,
  initialA11yMinFontSize,
  initialA11yUiZoom,
  initialA11yFocusRings
);

export const usePanelStore = create<PanelState>((set) => ({
  activePanel: loadInitialPanel(),
  leftSidebarCollapsed: loadBooleanPreference(undefined, leftSidebarCollapsedStorageKey, false),
  sidebarMode: loadSidebarMode(),
  zenExitDefaultMode: loadZenExitDefaultMode(),
  sidebarDrawerTab: loadSidebarDrawerTab(),
  actionBarDock: loadActionBarDock(),
  dockSettings: loadNovaDockSettings(),
  copilotOpen: loadCopilotOpen(),
  themeAccent: initialThemeAccent,
  glassLevel: initialGlassLevel,
  uiDensity: initialUiDensity,
  a11yHighContrast: initialA11yHighContrast,
  a11yDyslexicFont: initialA11yDyslexicFont,
  a11yMinFontSize: initialA11yMinFontSize,
  a11yUiZoom: initialA11yUiZoom,
  a11yFocusRings: initialA11yFocusRings,
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
  extensionHubOpen: false,
  extensionHubTab: 'webextensions',

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

  setZenExitDefaultMode: (mode) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(zenExitDefaultModeStorageKey, mode);
      }
    } catch {
      // ignore
    }
    set({ zenExitDefaultMode: mode });
  },

  setSidebarDrawerTab: (tab) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(sidebarDrawerTabStorageKey, tab);
      }
    } catch {
      // ignore
    }
    set({ sidebarDrawerTab: tab });
  },

  setActionBarDock: (dock) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(actionBarDockStorageKey, dock);
      }
    } catch {
      // ignore
    }
    set({ actionBarDock: dock });
  },

  setDockSettings: (input) => {
    set((state) => {
      const next = typeof input === 'function' ? input(state.dockSettings) : { ...state.dockSettings, ...input };
      saveNovaDockSettings(next);
      return { dockSettings: next };
    });
  },

  applyDockPreset: (preset) => {
    const presetConfig = NOVA_DOCK_PRESETS[preset];
    if (presetConfig) {
      saveNovaDockSettings(presetConfig);
      set({ dockSettings: presetConfig });
    }
  },

  resetFloatingDockPos: () => {
    set((state) => {
      const defaultPos = { x: 50, y: 50 };
      const next: NovaDockSettings = {
        ...state.dockSettings,
        floatingPos: defaultPos
      };
      saveNovaDockSettings(next);
      return { dockSettings: next };
    });
  },

  cycleSidebarMode: () => {
    set((state) => {
      const nextMode: SidebarMode =
        state.sidebarMode === 'slim'
          ? 'expanded'
          : state.sidebarMode === 'expanded'
            ? 'hidden'
            : state.zenExitDefaultMode;
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
  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
  setExtensionHubOpen: (input) => {
    set((state) => ({
      extensionHubOpen: typeof input === 'function' ? input(state.extensionHubOpen) : input
    }));
  },
  toggleExtensionHub: () => set((state) => ({ extensionHubOpen: !state.extensionHubOpen })),
  setExtensionHubTab: (extensionHubTab) => set({ extensionHubTab }),

  setThemeAccent: (accent) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(themeAccentStorageKey, accent);
      }
    } catch {
      // ignore
    }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dataset.themeAccent = accent;
    }
    set({ themeAccent: accent });
  },

  setGlassLevel: (glassLevel) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(glassLevelStorageKey, glassLevel);
      }
    } catch {
      // ignore
    }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dataset.glassLevel = glassLevel;
    }
    set({ glassLevel });
  },

  setUiDensity: (uiDensity) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(uiDensityStorageKey, uiDensity);
      }
    } catch {
      // ignore
    }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dataset.uiDensity = uiDensity;
    }
    set({ uiDensity });
  },

  setA11yHighContrast: (val) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(a11yHighContrastStorageKey, String(val));
      }
    } catch {
      // ignore
    }
    applyA11yHighContrastToDom(val);
    set({ a11yHighContrast: val });
  },

  setA11yDyslexicFont: (val) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(a11yDyslexicFontStorageKey, String(val));
      }
    } catch {
      // ignore
    }
    applyA11yDyslexicFontToDom(val);
    set({ a11yDyslexicFont: val });
  },

  setA11yMinFontSize: (val) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(a11yMinFontSizeStorageKey, String(val));
      }
    } catch {
      // ignore
    }
    applyA11yMinFontSizeToDom(val);
    set({ a11yMinFontSize: val });
  },

  setA11yUiZoom: (val) => {
    const clamped = clamp(val, 80, 150);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(a11yUiZoomStorageKey, String(clamped));
      }
    } catch {
      // ignore
    }
    applyA11yUiZoomToDom(clamped);
    set({ a11yUiZoom: clamped });
  },

  setA11yFocusRings: (val) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(a11yFocusRingsStorageKey, String(val));
      }
    } catch {
      // ignore
    }
    applyA11yFocusRingsToDom(val);
    set({ a11yFocusRings: val });
  }
}));
