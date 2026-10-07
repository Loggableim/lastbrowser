import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { usePanelStore } from '../src/renderer/stores/usePanelStore.js';
import { AVAILABLE_MODELS } from '../src/renderer/components/CopilotSplitView.js';
import { brandAssets } from '../src/renderer/brand.js';
import { normalizeSettingsSectionId, SETTINGS_SECTIONS } from '../src/renderer/panels/SystemPanels.js';
import { isModelCatalogResponseCurrent } from '../src/renderer/model-picker-options.js';

function readRendererFile(fileName: string): string {
  return readFileSync(path.resolve(process.cwd(), 'src/renderer', fileName), 'utf8');
}

describe('Phase 13: UI-Synthese (Variante B), Popart Icons & Power-Tools', () => {
  it('keeps one plugin settings destination and redirects the legacy Extensions section', () => {
    expect(Object.keys(SETTINGS_SECTIONS)).toContain('plugins');
    expect(Object.keys(SETTINGS_SECTIONS)).not.toContain('extensions');
    expect(normalizeSettingsSectionId('extensions')).toBe('plugins');
  });

  it('makes local AI discoverable in Settings and keeps setup Space-scoped', () => {
    expect(SETTINGS_SECTIONS.providers.title).toBe('AI & local models');
    expect(readRendererFile('i18n/locales/de.ts')).toContain("'settings.sections.providers': 'KI & lokale Modelle'");
    const settings = readRendererFile('panels/SystemPanels.tsx');
    expect(settings).toContain("{section === 'providers' && (");
    expect(settings).toContain('<LocalAiSetupPane key={JSON.stringify([activeProfileId,activeSpacePath,activeBackendProfileName||\'\'])}');
    expect(settings).toContain('keepGlobalRouterStatusVisible');
    expect(settings).toContain('browserProfileId={activeProfileId} workspacePath={activeSpacePath}');
    expect(settings).toContain('backendProfileName={activeBackendProfileName} ready={ready}');
    const setup = readRendererFile('components/LocalAiSetupPane.tsx');
    expect(setup).toContain("import { LocalAiBootstrapPane } from './LocalAiBootstrapPane.js'");
    expect(setup).toContain('<LocalAiBootstrapPane compact keepVisible={keepGlobalRouterStatusVisible}/>');
  });

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
    it('offers no static provider models before live discovery', () => {
      expect(AVAILABLE_MODELS).toHaveLength(4);
      const modelIds = AVAILABLE_MODELS.map((m) => m.id);
      expect(modelIds).toEqual(['teamwork', 'smart-track-low', 'smart-track-medium', 'smart-track-high']);
      expect(AVAILABLE_MODELS.every((m) => m.category === 'teamwork')).toBe(true);

      const source = readRendererFile('components/CopilotSplitView.tsx');
      expect(source).toContain('const [modelList, setModelList] = useState<AvailableModelItem[]>(AVAILABLE_MODELS)');
      expect(source).toContain('isModelCatalogResponseCurrent(orchestrationScopeKey, orchestrationScopeKeyRef.current)');
      const selectedScope = 'profile-a::space-a::backend-a';
      const nextScope = 'profile-b::space-b::backend-b';
      expect(isModelCatalogResponseCurrent(selectedScope, selectedScope)).toBe(true);
      expect(isModelCatalogResponseCurrent(selectedScope, nextScope)).toBe(false);
      expect(source).not.toContain('...prev.filter((item) => item.category !== \'gemini\'');
    });

    it('selects snap slots with native click and keyboard button activation', () => {
      const source = readRendererFile('components/SnapBarFlyout.tsx');
      expect(source).toContain('type="button"');
      expect(source).toContain('onClick={() => onSelectSlot?.(layoutKey, idx)}');
      expect(source).toContain('onFocus={handleMouseEnter}');
      expect(source).not.toContain('onMouseUp={handleMouseUp}');
    });

    it('uses native buttons for Teamwork strategy choices and Smart Track process accordions', () => {
      const teamwork = readRendererFile('panels/TeamworkSettingsPanel.tsx');
      expect((teamwork.match(/aria-pressed=\{config\.strategy ===/g) || []).length).toBe(3);
      expect((teamwork.match(/type="button"/g) || []).length).toBeGreaterThanOrEqual(5);

      const smartTrackCard = readRendererFile('components/SmartTrackProcessCard.tsx');
      expect(smartTrackCard).toContain('aria-expanded={expanded}');
      expect(smartTrackCard).toContain('aria-expanded={preplanOpen}');
      expect(smartTrackCard).toContain('aria-controls={`${detailsId}-details`}');
      expect(smartTrackCard).toContain('aria-controls={`${detailsId}-preplan`}');
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
    it('shows Sidekick as updated with Lastbrowser without separate update controls', () => {
      const source = readRendererFile('panels/SystemPanels.tsx');
      expect(source).toContain("t('settings.panels.system.updatedWithLastbrowser')");
      expect(source).not.toContain('checkSidekickUpdate');
      expect(source).not.toContain('applySidekickUpdate');
      expect(source).not.toContain('sidekickUpdate.status');
    });

    it('provides Zen exit default mode and Action Bar dock settings in SystemPanels.tsx', () => {
      const source = readRendererFile('panels/SystemPanels.tsx');

      expect(source).toContain('settings.panels.appearance.cardModern');
      expect(source).toContain('settings.panels.appearance.zenTitle');
      expect(source).toContain('settings.panels.appearance.compactDock');
      expect(source).toContain('settings.panels.appearance.fullSidebar');
      expect(source).toContain('settings.panels.appearance.actionBarTitle');
      expect(source).toContain('settings-dock-btn');
      expect(source).toContain("setSidebarMode('slim')");
      expect(source).toContain("setSidebarMode('expanded')");
    });

    it('uses the configured Nova Dock animation duration for entering and leaving states', () => {
      const css = readRendererFile('styles.css');
      const dock = readRendererFile('components/NovaDock.tsx');
      expect(dock).toContain("'--dock-anim-duration': `${dockSettings.animationDuration}ms`");
      expect(css).toContain('.nova-dock.anim-slide {');
      expect(css).toContain('.nova-dock.anim-fade {');
      expect(css).toContain('transition: transform var(--dock-anim-duration');
    });

    it('provides Theme Accents, Glassmorphism, and UI Density settings in SystemPanels.tsx', () => {
      const source = readRendererFile('panels/SystemPanels.tsx');

      expect(source).toContain('settings.panels.appearance.accentGlassTitle');
      expect(source).toContain('settings.panels.appearance.accentNeon');
      expect(source).toContain('settings.panels.appearance.accentViolet');
      expect(source).toContain('settings.panels.appearance.accentEmerald');
      expect(source).toContain('settings.panels.appearance.accentAmber');
      expect(source).toContain('settings.panels.appearance.accentSlate');
      expect(source).toContain('settings.panels.appearance.glassSolid');
      expect(source).toContain('settings.panels.appearance.glassSubtle');
      expect(source).toContain('settings.panels.appearance.glassModern');
      expect(source).toContain('settings.panels.appearance.glassDeep');
      expect(source).toContain("id: 'neon-cyan'");
      expect(source).toContain("id: 'electric-violet'");
      expect(source).toContain("id: 'emerald-flow'");
      expect(source).toContain("id: 'solar-amber'");
      expect(source).toContain("id: 'monochrome-slate'");
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

    it('subscribes accessibility controls to live store updates', () => {
      const source = readRendererFile('panels/SystemPanels.tsx');
      for (const state of ['a11yHighContrast', 'a11yDyslexicFont', 'a11yMinFontSize', 'a11yUiZoom', 'a11yFocusRings']) {
        expect(source).toContain(`const ${state} = usePanelStore((s) => s.${state});`);
      }
      expect(source).not.toContain('checked={usePanelStore.getState().a11y');
      expect(source).not.toContain('value={String(usePanelStore.getState().a11y');
      expect(source).not.toContain('value={usePanelStore.getState().a11yUiZoom}');
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
      expect(startPage).toContain("t('browser.startPage.askNovaTitle')");
      expect(startPage).toContain("t('browser.startPage.askNova', { botName: effectiveBotName })");
      expect(startPage).toContain("t('browser.startPage.searchPlaceholder', { botName: effectiveBotName })");
      expect(startPage).toContain("t('browser.startPage.quickActions')");
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
