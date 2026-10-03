import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { usePanelStore } from '../src/renderer/stores/usePanelStore.js';
import { DEFAULT_PINNED_APPS } from '../src/renderer/components/PinnedAppGrid.js';

function readRendererFile(fileName: string): string {
  return readFileSync(path.resolve(process.cwd(), 'src/renderer', fileName), 'utf8');
}

describe('Phase 9: Modern UI Redesign (Sidekick + Zen Browser Synthese)', () => {
  it('defines 3 sidebar modes and persistence in usePanelStore', () => {
    const store = usePanelStore.getState();
    expect(store.sidebarMode).toBeDefined();
    expect(['slim', 'expanded', 'hidden']).toContain(store.sidebarMode);
    expect(typeof store.copilotOpen).toBe('boolean');

    // Test cycling: slim -> expanded -> hidden -> slim
    store.setSidebarMode('slim');
    expect(usePanelStore.getState().sidebarMode).toBe('slim');

    store.cycleSidebarMode();
    expect(usePanelStore.getState().sidebarMode).toBe('expanded');

    store.cycleSidebarMode();
    expect(usePanelStore.getState().sidebarMode).toBe('hidden');

    store.cycleSidebarMode();
    expect(usePanelStore.getState().sidebarMode).toBe('slim');

    // Test copilot toggle
    const initialCopilot = usePanelStore.getState().copilotOpen;
    store.toggleCopilot();
    expect(usePanelStore.getState().copilotOpen).toBe(!initialCopilot);
    store.toggleCopilot();
    expect(usePanelStore.getState().copilotOpen).toBe(initialCopilot);
  });

  it('provides default pinned apps matching the Sidekick/Zen dock specification', () => {
    expect(DEFAULT_PINNED_APPS.length).toBeGreaterThanOrEqual(8);
    const names = DEFAULT_PINNED_APPS.map((a) => a.name);
    expect(names).toContain('Notion');
    expect(names).toContain('Figma');
    expect(names).toContain('Trello');
    expect(names).toContain('Terminal');
    expect(names).toContain('Slack');
    expect(names).toContain('Netflix');
    expect(names).toContain('Jira');
    expect(names).toContain('Miro');
  });

  it('renders modern titlebar and sidekick components in App.tsx', () => {
    const source = readRendererFile('App.tsx');

    expect(source).toContain('<ModernTitlebar');
    expect(source).toContain('<SidekickSidebar');
    expect(source).toContain('<CopilotSplitView');
    expect(source).toContain('browser-zen-workspace');
    expect(source).toContain('with-copilot-split');
    expect(source).toContain('browser-canvas-pane');
    expect(source).toContain('layoutMode');
    expect(source).toContain('isModernBrowser');
    expect(source).toContain('cycleSidebarMode');
    expect(source).toContain('toggleCopilot');
  });

  it('keeps browser profiles out of the titlebar so Spaces remain the only top-level selector', () => {
    const header = readRendererFile('components/HeaderComponents.tsx');
    const titlebar = header.slice(header.indexOf('export type ModernTitlebarProps'));

    expect(titlebar).not.toContain('profiles?: BrowserProfile[]');
    expect(titlebar).not.toContain('<ProfileSwitcher');
    expect(readRendererFile('App.tsx')).not.toContain('<ProfileSwitcher');
    expect(readRendererFile('panels/SystemPanels.tsx')).toContain('<ProfileSwitcher');
  });

  it('uses live adblock status in the titlebar and opens the real shield controls', () => {
    const app = readRendererFile('App.tsx');
    const header = readRendererFile('components/HeaderComponents.tsx');
    const shield = readRendererFile('components/AdblockShield.tsx');

    expect(app).toContain('blockedAdsCount={blockedAdsCount}');
    expect(app).not.toContain('blockedAdsCount={3420}');
    expect(header).toContain('<AdblockShield open={shieldPopoverOpen}');
    expect(shield).toContain("window.lastbrowser.adblock?.status()");
    expect(shield).toContain('window.lastbrowser.adblock.setEnabled');
  });

  it('has comprehensive CSS definitions for the unified titlebar, 3 sidebar modes, and 70/30 split view', () => {
    const css = readRendererFile('styles.css');

    // Modern titlebar
    expect(css).toContain('.modern-titlebar');
    expect(css).toContain('height: 42px');
    expect(css).toContain('.adblock-stats-pill');
    expect(css).toContain('.copilot-toggle-btn');

    // Zen workspace and Sidekick sidebar
    expect(css).toContain('.browser-zen-workspace');
    expect(css).toContain('.sidekick-sidebar');
    expect(css).toContain('.sidekick-sidebar.slim');
    expect(css).toContain('width: 48px');
    expect(css).toContain('.sidekick-sidebar.expanded');
    expect(css).toContain('width: 240px');
    expect(css).toContain('.sidekick-sidebar-revealer');

    // Pinned app dock and Zen grid
    expect(css).toContain('.pinned-dock-list');
    expect(css).toContain('.pinned-zen-grid');
    expect(css).toContain('.pinned-grid-cells');

    // Vertical tabs
    expect(css).toContain('.vertical-tab-list');
    expect(css).toContain('.vertical-tab-item');
    expect(css).toContain('.vtab-audio-btn');
    expect(css).toContain('.vertical-new-tab-btn');

    // 70/30 Copilot split view
    expect(css).toContain('.browser-content-area');
    expect(css).toContain('.browser-content-area.with-copilot-split .browser-canvas-pane');
    expect(css).toContain('width: 70%');
    expect(css).toContain('.copilot-split-panel');
    expect(css).toContain('width: 30%');
    expect(css).toContain('.copilot-code-block');
    expect(css).toContain('.copilot-input-container');
  });

  it('reserves usable width for the modern titlebar address field', () => {
    const css = readRendererFile('styles.css');
    const centerRule = css.match(/\.modern-titlebar-center\s*\{([^}]+)\}/s)?.[1] || '';
    const addressRule = css.match(/\.modern-titlebar-center\s+\.addressbar-container\s*\{([^}]+)\}/s)?.[1] || '';
    const compactRule = css.match(/@media\s*\(max-width:\s*1440px\)\s*\{([^}]+)\}/s)?.[1] || '';

    expect(centerRule).toContain('max-width: 1120px');
    expect(addressRule).toContain('flex: 1 1 300px');
    expect(addressRule).toContain('min-width: 300px');
    expect(addressRule).toContain('max-width: 720px');
    expect(css).not.toContain('.modern-titlebar-center .address-bar-container');
    expect(compactRule).toContain('.modern-titlebar-center .adblock-stats-pill .stats-text');
    expect(compactRule).toContain('display: none');
  });

  it('implements SidekickSidebar supporting slim, expanded, and hidden modes', () => {
    const sidebarSource = readRendererFile('components/SidekickSidebar.tsx');

    expect(sidebarSource).toContain('mode === \'hidden\'');
    expect(sidebarSource).toContain('sidekick-sidebar-revealer');
    expect(sidebarSource).toContain('mode === \'slim\'');
    expect(sidebarSource).toContain('dock-top-brand');
    expect(sidebarSource).toContain('PinnedAppGrid');
    expect(sidebarSource).toContain('dock-bottom-actions');
    expect(sidebarSource).toContain('expanded-top-bar');
    expect(sidebarSource).toContain('expanded-workspace-pill');
    expect(sidebarSource).toContain('expanded-tabs-section');
    expect(sidebarSource).toContain('vertical-tab-list');
  });

  it('shows a floating animated label when a shell-rail item is hovered in collapsed mode', () => {
    const rail = readRendererFile('components/ShellRail.tsx');
    const css = readRendererFile('styles.css');

    expect(rail).toContain('createPortal');
    expect(rail).toContain('getShellRailLabels(t, panel.id)');
    expect(rail).toContain('showHoverLabel(event, labels.hoverLabel)');
    expect(rail).toContain('className="rail-floating-hover-label"');
    expect(css).toContain('.rail-floating-hover-label');
    expect(css).toContain('@keyframes rail-label-float-in');
    expect(css).toContain('prefers-reduced-motion: reduce');
  });

  it('keeps the minimized Nova Dock fisheye and title wave visible outside the narrow sidebar', () => {
    const dock = readRendererFile('components/NovaDock.tsx');
    const css = readRendererFile('styles.css');

    expect(dock).toContain("closest<HTMLElement>('.nova-dock-item-wrapper')");
    expect(dock).toContain("querySelectorAll<HTMLElement>('.nova-dock-item-wrapper')");
    expect(dock).toContain("'--label-opacity': opacity");
    expect(dock).toContain('transform: `scale(${scale})`');
    expect(dock).toContain('const getLabelStyle = useCallback');
    expect(dock).toContain("'--label-scale': scale");
    expect(css).toContain('.sidekick-sidebar.slim .sidekick-dock-inner');
    expect(css).toContain('.sidekick-sidebar.slim .nova-dock');
    expect(css).toMatch(/\.sidekick-sidebar\.slim\s*\{[^}]*overflow:\s*visible/s);
    expect(css).toContain('opacity: var(--label-opacity, 0)');
    expect(css).toContain('transition: opacity 0.18s cubic-bezier');
    const labelStyles = css.match(/\.nova-dock-label-pill\s*\{([^}]+)\}/s)?.[1] || '';
    expect(labelStyles).not.toContain('visibility: hidden;');
  });

  it('does not show a fabricated task count in the navigation rail', () => {
    const rail = readRendererFile('components/ShellRail.tsx');
    expect(rail).not.toContain("panel.id === 'tasks' && <em>9+</em>");
  });

  it('reveals the Zen sidebar and titlebar on edge hover, then hides them after pointer leave', () => {
    const app = readRendererFile('App.tsx');
    const header = readRendererFile('components/HeaderComponents.tsx');
    const css = readRendererFile('styles.css');

    expect(app).toContain('className="zen-left-hover-sensor"');
    expect(app).toContain('onMouseEnter={handleZenSidebarEnter}');
    expect(app).toContain('onMouseLeave={handleZenSidebarLeave}');
    expect(app).toContain('setZenSidebarRevealed(false)');
    expect(header).toContain('className="zen-top-hover-sensor"');
    expect(header).toContain('onMouseEnter={handleMouseEnter}');
    expect(css).toContain('.zen-sidebar-overlay.zen-revealed');
    expect(css).toContain('pointer-events: auto');
    expect(css).toContain('.modern-titlebar.zen-autohide.zen-revealed');
  });

  it('keeps the Zen sidebar frei schwebend (floating overlay) without docking or collapsing canvas', () => {
    const app = readRendererFile('App.tsx');
    const sidebar = readRendererFile('components/SidekickSidebar.tsx');
    const dock = readRendererFile('components/NovaDock.tsx');
    const css = readRendererFile('styles.css');

    expect(app).toContain('isFloatingOverlay={true}');
    expect(app).toContain('zenFloatingMode');
    expect(app).toContain('onRevealZen={handleZenSidebarEnter}');
    expect(sidebar).toContain('onRevealZen?: () => void');
    expect(sidebar).toContain('isFloatingOverlay');
    expect(sidebar).toContain('sidebar-dock-pin-btn');
    expect(dock).toContain('forcedPosition?: NovaDockPosition');
    expect(css).toContain('.zen-sidebar-overlay .sidekick-sidebar .sidebar-dock-pin-btn');
    expect(css).toContain('.zen-sidebar-overlay .sidekick-sidebar.expanded');
  });

  it('shows recent chat activity from actual messages rather than a fixed placeholder', () => {
    const contextSidebar = readRendererFile('components/ContextSidebar.tsx');
    expect(contextSidebar).toContain('const recentMessages = messages.slice(-3)');
    expect(contextSidebar).toContain('{recentMessages.map((message)');
    expect(contextSidebar).toContain('{message.content}');
  });

  it('implements CopilotSplitView with formatting, code copy, and page-aware chat input', () => {
    const copilotSource = readRendererFile('components/CopilotSplitView.tsx');

    expect(copilotSource).toContain("{botName} · {t('copilot.quickChat')}");
    expect(copilotSource).toContain('copilot-split-panel');
    expect(copilotSource).toContain('copilot-code-block');
    expect(copilotSource).toContain('copilot-code-copy-btn');
    expect(copilotSource).toContain('copilot-model-pill');
    expect(copilotSource).toContain('copilot-input-field');
    expect(copilotSource).toContain('Ask about this page...');
    expect(copilotSource).toContain('onSendMessage');
  });
});
