import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { usePanelStore } from '../src/renderer/stores/usePanelStore.js';
import { AVAILABLE_MODELS } from '../src/renderer/components/CopilotSplitView.js';
import { brandAssets } from '../src/renderer/brand.js';

function readRendererFile(fileName: string): string {
  return readFileSync(path.resolve(process.cwd(), 'src/renderer', fileName), 'utf8');
}

describe('Phase 13: UI-Synthese (Variante B), Popart Icons & Power-Tools', () => {
  describe('Panel Store & Zen Exit Default Mode', () => {
    it('manages zenExitDefaultMode, sidebarDrawerTab, and actionBarDock in usePanelStore', () => {
      const store = usePanelStore.getState();

      expect(store.zenExitDefaultMode).toBeDefined();
      expect(['slim', 'expanded']).toContain(store.zenExitDefaultMode);

      expect(store.sidebarDrawerTab).toBeDefined();
      expect(['tabs', 'ai', 'workflows', 'tools']).toContain(store.sidebarDrawerTab);

      expect(store.actionBarDock).toBeDefined();
      expect(['topbar', 'sidebar', 'bottom', 'bottom-center', 'top-left', 'top-center', 'top-right', 'free']).toContain(store.actionBarDock);

      // Change zen exit mode to expanded
      store.setZenExitDefaultMode('expanded');
      expect(usePanelStore.getState().zenExitDefaultMode).toBe('expanded');

      // Test cycleSidebarMode transitions to zenExitDefaultMode when exiting hidden
      store.setSidebarMode('hidden');
      expect(usePanelStore.getState().sidebarMode).toBe('hidden');
      store.cycleSidebarMode();
      expect(usePanelStore.getState().sidebarMode).toBe('expanded');

      // Change back to slim
      store.setZenExitDefaultMode('slim');
      store.setSidebarMode('hidden');
      store.cycleSidebarMode();
      expect(usePanelStore.getState().sidebarMode).toBe('slim');

      // Test drawer tabs
      store.setSidebarDrawerTab('ai');
      expect(usePanelStore.getState().sidebarDrawerTab).toBe('ai');
      store.setSidebarDrawerTab('workflows');
      expect(usePanelStore.getState().sidebarDrawerTab).toBe('workflows');

      // Test action bar dock
      store.setActionBarDock('topbar');
      expect(usePanelStore.getState().actionBarDock).toBe('topbar');
      store.setActionBarDock('top-center');
      expect(usePanelStore.getState().actionBarDock).toBe('top-center');
    });
  });

  describe('Variante B Multi-Tier Sidebar with Popart Icons', () => {
    it('implements Variante B drawer tabs and popart icons in SidekickSidebar.tsx', () => {
      const source = readRendererFile('components/SidekickSidebar.tsx');

      // Drawer tab switcher
      expect(source).toContain('sidebar-drawer-tabs');
      expect(source).toContain('currentDrawerTab === \'tabs\'');
      expect(source).toContain('currentDrawerTab === \'ai\'');
      expect(source).toContain('currentDrawerTab === \'workflows\'');
      expect(source).toContain('currentDrawerTab === \'tools\'');

      // Popart Icons usage
      expect(source).toContain('brandAssets.sidebarIcons.chat');
      expect(source).toContain('brandAssets.sidebarIcons.kanban');
      expect(source).toContain('brandAssets.sidebarIcons.agents');
      expect(source).toContain('brandAssets.sidebarIcons.skills');
      expect(source).toContain('brandAssets.sidebarIcons.memory');
      expect(source).toContain('brandAssets.sidebarIcons.profiles');
      expect(source).toContain('brandAssets.sidebarIcons.tasks');
      expect(source).toContain('brandAssets.sidebarIcons.todos');
      expect(source).toContain('brandAssets.sidebarIcons.insights');
      expect(source).toContain('brandAssets.sidebarIcons.browser');
      expect(source).toContain('brandAssets.sidebarIcons.spark');
      expect(source).toContain('brandAssets.sidebarIcons.gmail');
      expect(source).toContain('brandAssets.sidebarIcons.discord');
      expect(source).toContain('brandAssets.sidebarIcons.appstore');
      expect(source).toContain('brandAssets.sidebarIcons.logs');
      expect(source).toContain('brandAssets.sidebarIcons.settings');

      // Popart avatar and mini shortcuts in slim dock
      expect(source).toContain('dock-popart-avatar');
      expect(source).toContain('dock-quick-shortcuts');
      expect(source).toContain('dock-shortcut-btn');

      // Selection callback
      expect(source).toContain('onSelectPanel');
    });

    it('verifies that all popart icons are defined in brandAssets', () => {
      expect(brandAssets.sidebarIcons.chat).toContain('01-chat-modern-popart.png');
      expect(brandAssets.sidebarIcons.tasks).toContain('02-tasks-modern-popart.png');
      expect(brandAssets.sidebarIcons.kanban).toContain('03-kanban-modern-popart.png');
      expect(brandAssets.sidebarIcons.skills).toContain('04-skills-modern-popart.png');
      expect(brandAssets.sidebarIcons.agents).toContain('05-agents-modern-popart.png');
      expect(brandAssets.sidebarIcons.memory).toContain('06-memory-modern-popart.png');
      expect(brandAssets.sidebarIcons.workspaces).toContain('07-spaces-modern-popart.png');
      expect(brandAssets.sidebarIcons.profiles).toContain('08-agent-profiles-modern-popart.png');
      expect(brandAssets.sidebarIcons.todos).toContain('09-todos-modern-popart.png');
      expect(brandAssets.sidebarIcons.insights).toContain('10-insights-modern-popart.png');
      expect(brandAssets.sidebarIcons.logs).toContain('11-logs-modern-popart.png');
      expect(brandAssets.sidebarIcons.gmail).toContain('12-mail-modern-popart.png');
      expect(brandAssets.sidebarIcons.browser).toContain('13-browser-modern-popart.png');
      expect(brandAssets.sidebarIcons.discord).toContain('14-discord-modern-popart.png');
      expect(brandAssets.sidebarIcons.appstore).toContain('15-appstore-modern-popart.png');
      expect(brandAssets.sidebarIcons.settings).toContain('16-settings-modern-popart.png');
    });
  });

  describe('Draggable & Dockable InPageActionBar', () => {
    it('implements InPageActionBar component with drag handle and docking positions', () => {
      const source = readRendererFile('components/InPageActionBar.tsx');

      expect(source).toContain('action-strip-drag-handle');
      expect(source).toContain('summarize-page');
      expect(source).toContain('explain-selection');
      expect(source).toContain('research-page');
      expect(source).toContain('onResetZoom');
      expect(source).toContain('onFindOpen');
      expect(source).toContain('onToggleDownloads');
      expect(source).toContain('onToggleHistory');
      expect(source).toContain('onToggleMute');
      expect(source).toContain('action-strip-dock-anchor');
      expect(source).toContain('action-strip-dock-dropdown');
      expect(source).toContain('topbar');
      expect(source).toContain('sidebar');
      expect(source).toContain('bottom');
      expect(source).toContain('top-left');
      expect(source).toContain('top-center');
      expect(source).toContain('top-right');
      expect(source).toContain('bottom-center');
      expect(source).toContain('free');
      expect(source).toContain('titlebar-research-flyout');
      expect(source).toContain('titlebar-research-trigger-btn');
    });

    it('integrates InPageActionBar in App.tsx inside BrowserMain and ModernTitlebar', () => {
      const source = readRendererFile('App.tsx');
      expect(source).toContain('<InPageActionBar');
      expect(source).toContain('variant="topbar"');
      expect(source).toContain('onAction={onAction}');
      expect(source).toContain('dockMode={usePanelStore.getState().actionBarDock}');
    });
  });

  describe('CopilotSplitView Dynamic Model Picker & Categorized Workflows', () => {
    it('offers Gemini 2.5 Flash as default and multiple provider models in AVAILABLE_MODELS', () => {
      expect(AVAILABLE_MODELS.length).toBeGreaterThanOrEqual(6);
      const modelIds = AVAILABLE_MODELS.map((m) => m.id);
      expect(modelIds).toContain('gemini-2.5-flash');
      expect(modelIds).toContain('gemini-2.5-pro');
      expect(modelIds).toContain('claude-sonnet-4.6');
      expect(modelIds).toContain('gpt-5.5');
      expect(modelIds).toContain('deepseek-reasoner');
      expect(modelIds).toContain('llama3.3');

      const geminiModel = AVAILABLE_MODELS.find((m) => m.id === 'gemini-2.5-flash');
      expect(geminiModel?.badge).toContain('Standard');
      expect(geminiModel?.provider).toBe('Google');
    });

    it('implements interactive model dropdown and workflow search & categories in CopilotSplitView.tsx', () => {
      const source = readRendererFile('components/CopilotSplitView.tsx');

      // Model picker
      expect(source).toContain('copilot-model-dropdown');
      expect(source).toContain('model-dropdown-list');
      expect(source).toContain('model-option-item');
      expect(source).toContain('onSelectModel');

      // Re-branding
      expect(source).toContain('{botName} AI');

      // Workflows category tabs and search
      expect(source).toContain('workflow-search-box');
      expect(source).toContain('workflow-search-input');
      expect(source).toContain('workflow-category-tabs');
      expect(source).toContain('workflow-tab-chip');
    });
  });

  describe('Appearance Settings Modernization', () => {
    it('provides Zen exit default mode and Action Bar dock settings in SystemPanels.tsx', () => {
      const source = readRendererFile('panels/SystemPanels.tsx');

      expect(source).toContain('Modern Zen & Sidekick Layout (Variante B)');
      expect(source).toContain('Zen-Modus Aufwach-Standard (Ctrl+B)');
      expect(source).toContain('Kompaktes Dock (48px)');
      expect(source).toContain('Volle Leiste (240px)');
      expect(source).toContain('In-Page AI Action Bar Andockung');
      expect(source).toContain('settings-dock-btn');
    });

    it('provides Theme Accents, Glassmorphism, and UI Density settings in SystemPanels.tsx', () => {
      const source = readRendererFile('panels/SystemPanels.tsx');

      expect(source).toContain('Akzentfarben & Glassmorphism (Phase 13.8)');
      expect(source).toContain('Neon Cyan');
      expect(source).toContain('Electric Violet');
      expect(source).toContain('Emerald Flow');
      expect(source).toContain('Solar Amber');
      expect(source).toContain('Monochrome Slate');
      expect(source).toContain('Solid (Opak)');
      expect(source).toContain('Subtil (8px)');
      expect(source).toContain('Modern (16px)');
      expect(source).toContain('Deep Glass (24px)');
      expect(source).toContain('settings-accent-btn');
      expect(source).toContain('setThemeAccent');
      expect(source).toContain('setGlassLevel');
      expect(source).toContain('setUiDensity');
    });

    it('manages themeAccent, glassLevel, and uiDensity state and persistence in usePanelStore', () => {
      const store = usePanelStore.getState();

      expect(store.themeAccent).toBeDefined();
      expect(['neon-cyan', 'electric-violet', 'emerald-flow', 'solar-amber', 'monochrome-slate']).toContain(store.themeAccent);
      expect(store.glassLevel).toBeDefined();
      expect(['solid', 'subtle', 'modern', 'deep']).toContain(store.glassLevel);
      expect(store.uiDensity).toBeDefined();
      expect(['compact', 'standard', 'comfortable']).toContain(store.uiDensity);

      store.setThemeAccent('electric-violet');
      expect(usePanelStore.getState().themeAccent).toBe('electric-violet');

      store.setGlassLevel('deep');
      expect(usePanelStore.getState().glassLevel).toBe('deep');

      store.setUiDensity('compact');
      expect(usePanelStore.getState().uiDensity).toBe('compact');
    });
  });

  describe('Panel Synthesis & Zen Workspace Standard (Ansatz B)', () => {
    it('integrates all 17 panels and browser utilities into SidekickSidebar.tsx', () => {
      const source = readRendererFile('components/SidekickSidebar.tsx');

      // AI items (chat, agents, skills, memory, profiles)
      expect(source).toContain('AI_DRAWER_ITEMS');
      expect(source).toContain("'chat'");
      expect(source).toContain("'agents'");
      expect(source).toContain("'skills'");
      expect(source).toContain("'memory'");
      expect(source).toContain("'profiles'");

      // Workflow items (kanban, tasks, workspaces, todos, insights)
      expect(source).toContain('WORKFLOW_DRAWER_ITEMS');
      expect(source).toContain("'kanban'");
      expect(source).toContain("'tasks'");
      expect(source).toContain("'workspaces'");
      expect(source).toContain("'todos'");
      expect(source).toContain("'insights'");

      // Tools items (browser, terminal, gmail, discord, appstore, logs, settings)
      expect(source).toContain('TOOLS_DRAWER_ITEMS');
      expect(source).toContain("'browser'");
      expect(source).toContain("'terminal'");
      expect(source).toContain("'gmail'");
      expect(source).toContain("'discord'");
      expect(source).toContain("'appstore'");
      expect(source).toContain("'logs'");
      expect(source).toContain("'settings'");

      // Browser utilities
      expect(source).toContain('BROWSER UTILITIES');
      expect(source).toContain('onOpenDownloads');
      expect(source).toContain('onOpenHistory');
      expect(source).toContain('onOpenExtensions');
      expect(source).toContain('onOpenPermissions');
    });

    it('renders modern titlebar tool banner in App.tsx when non-browser panel is active', () => {
      const source = readRendererFile('App.tsx');
      expect(source).toContain('modern-titlebar-tool-banner');
      expect(source).toContain('modern-back-to-web-btn');
      expect(source).toContain('modern-tool-active-badge');
      expect(source).toContain('Zurück zum Web');
      expect(source).toContain("const isModernBrowser = layoutMode === 'modern';");
    });
  });

  describe('Nova AI Clean Re-branding', () => {
    it('uses Nova AI branding across CommandPalette, CopilotSplitView, and Startpage', () => {
      const cmdPalette = readRendererFile('components/CommandPalette.tsx');
      expect(cmdPalette).toContain("category: 'Nova AI'");
      expect(cmdPalette).toContain('Nova: Neuer Chat');
      expect(cmdPalette).not.toContain("category: 'Sidekick AI'");

      const copilot = readRendererFile('components/CopilotSplitView.tsx');
      expect(copilot).not.toContain('(Sidekick AI Copilot)');

      const startPage = readRendererFile('panels/NativeBrowserStartPage.tsx');
      expect(startPage).toContain('effectiveBotName');
      expect(startPage).toContain('Frag Nova');
      expect(startPage).toContain('Nova Schnellaktionen');
      expect(startPage).not.toContain('Nova AI Copilot');
      expect(startPage).not.toContain('Sidekick AI Copilot');
    });
  });

  describe('CSS Variables for Modern Appearance', () => {
    it('defines CSS variables for theme accents, glass levels, and UI density in styles.css', () => {
      const css = readRendererFile('styles.css');

      expect(css).toContain('[data-theme-accent="neon-cyan"]');
      expect(css).toContain('[data-theme-accent="electric-violet"]');
      expect(css).toContain('[data-theme-accent="emerald-flow"]');
      expect(css).toContain('[data-glass-level="solid"]');
      expect(css).toContain('[data-glass-level="deep"]');
      expect(css).toContain('[data-ui-density="compact"]');
      expect(css).toContain('.modern-titlebar-tool-banner');
      expect(css).toContain('.settings-accent-palette');
      expect(css).toContain('.settings-accent-btn');
    });
  });
});
