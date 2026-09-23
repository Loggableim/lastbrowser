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

  it('implements CopilotSplitView with formatting, code copy, and page-aware chat input', () => {
    const copilotSource = readRendererFile('components/CopilotSplitView.tsx');

    expect(copilotSource).toMatch(/(?:Sidekick|Nova|\{botName\})\s+AI/);
    expect(copilotSource).toContain('copilot-split-panel');
    expect(copilotSource).toContain('copilot-code-block');
    expect(copilotSource).toContain('copilot-code-copy-btn');
    expect(copilotSource).toContain('copilot-model-pill');
    expect(copilotSource).toContain('copilot-input-field');
    expect(copilotSource).toContain('Ask about this page...');
    expect(copilotSource).toContain('onSendMessage');
  });
});
