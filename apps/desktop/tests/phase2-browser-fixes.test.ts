import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeSpacePartition } from '../src/renderer/App.js';
import { createInitialTab } from '../src/renderer/tabs.js';

function readRendererFile(fileName: string): string {
  return readFileSync(path.resolve(process.cwd(), 'src/renderer', fileName), 'utf8');
}

describe('Phase 2 Browser Fixes: Sidebar, Spaces, Multiscreen & Summarize Bar', () => {
  describe('1. Workspace Picker Flyout & Space Partition Isolation', () => {
    it('implements space picker dropdown and create space button in SidekickSidebar.tsx', () => {
      const source = readRendererFile('components/SidekickSidebar.tsx');

      // Space picker state and click outside handler
      expect(source).toContain('const [spacePickerOpen, setSpacePickerOpen] = useState(false);');
      expect(source).toContain('const spacePickerRef = useRef<HTMLDivElement | null>(null);');
      expect(source).toContain('document.addEventListener(\'mousedown\', handleClickOutside);');

      // Click handler on expanded-workspace-pill
      expect(source).toContain('expanded-workspace-pill ${spacePickerOpen ? \'is-open\' : \'\'}');
      expect(source).toContain('onClick={() => setSpacePickerOpen((prev) => !prev)}');

      // Workspace picker flyout with spaces list and "+ Neuer Space"
      expect(source).toContain('className="workspace-picker-flyout"');
      expect(source).toContain('className="workspace-create-btn"');
      expect(source).toContain('onCreateSpace?.()');
      expect(source).toContain('onSelectSpace?.(s.path)');
    });

    it('passes onSelectSpace and onCreateSpace from App.tsx to SidekickSidebar', () => {
      const appSource = readRendererFile('App.tsx');
      expect(appSource).toMatch(/onSelectSpace=\{.*(handleSpaceSelect|setActiveSpacePath).*\}/);
      expect(appSource).toMatch(/onCreateSpace=\{.*(setSpaceSetupModalOpen|setActivePanel).*?\}/);
    });

    it('computes isolated space partitions correctly', () => {
      expect(computeSpacePartition('prof-default', 'home')).toBe('persist:space_home_prof-default');
      expect(computeSpacePartition('prof-default', 'firma')).toBe('persist:space_firma_prof-default');
      expect(computeSpacePartition('prof-default', 'My Space 123')).toBe('persist:space_my_space_123_prof-default');
      expect(computeSpacePartition('prof-default', 'home', true)).toBe('in-memory-incognito');
      expect(computeSpacePartition('prof-2', null)).toBe('persist:space_home_prof-2');
    });

    it('uses computeSpacePartition on webviews in App.tsx', () => {
      const appSource = readRendererFile('App.tsx');
      const partitionUsages = appSource.match(/computeSpacePartition\(activeProfile\.id,\s*activeSpacePath,\s*tab\.incognito\)/g);
      expect(partitionUsages).not.toBeNull();
      // Every tab is rendered once in the shared viewport; split panes reuse
      // those same guests instead of mounting a second set of webviews.
      expect(partitionUsages!.length).toBe(1);
      expect(appSource).toContain('partition={computeSpacePartition(activeProfile.id, activeSpacePath, tab.incognito)}');
    });
  });

  describe('2. Pinned Apps vs. Tab List Deduplication', () => {
    it('sets pinned: true on newly opened tabs in App.tsx onOpenApp', () => {
      const appSource = readRendererFile('App.tsx');
      expect(appSource).toContain('addTab(app.url, { pinned: true });');
    });

    it('filters out pinned tabs in SidekickSidebar vertical tab list', () => {
      const source = readRendererFile('components/SidekickSidebar.tsx');
      expect(source).toContain('tabs.filter((t) => !t.pinned).map((tab) =>');
      expect(source).toContain('tabs.filter((t) => !t.pinned).length');
    });

    it('createInitialTab preserves pinned flag when passed in options', () => {
      const normalTab = createInitialTab('https://example.com');
      expect(normalTab.pinned).toBe(false);

      const pinnedTab = createInitialTab('https://slack.com', { pinned: true });
      expect(pinnedTab.pinned).toBe(true);
    });
  });

  describe('3. Multiscreen Tab-Switching Lock', () => {
    it('keeps one mounted webview per tab while split and normal panes change visibility', () => {
      const appSource = readRendererFile('App.tsx');
      expect(appSource).toContain('className="browser-tabs-viewport"');
      expect(appSource).toContain('(tabs && tabs.length > 0 ? tabs : [activeTab]).map((tab) => {');
      expect(appSource).toContain('visibility: (isCurrent || isInActiveSplit) ? \'visible\' : \'hidden\'');
      expect(appSource).toContain('{webviewReady && webviewStartupReady && (');
      expect(appSource).toContain('className={`browser-tab-pane ${isCurrent ?');
    });
  });

  describe('4. Multiscreen Pane Resizing', () => {
    it('uses the Multiview grid ratio state, dividers, and snap points', () => {
      const appSource = readRendererFile('App.tsx');
      const gridSource = readRendererFile('components/MultiviewGridContainer.tsx');
      const layoutTests = readFileSync(path.resolve(process.cwd(), 'tests/snap-layouts.test.ts'), 'utf8');
      expect(appSource).toContain('const [snapRatios, setSnapRatios] = useState');
      expect(appSource).toContain('snapRatios={snapRatios}');
      expect(appSource).toContain('onSetSnapRatio={handleSetSnapRatio}');
      expect(appSource).toContain('onSetRatio={onSetSnapRatio}');
      expect(gridSource).toContain('const SNAP_POINTS = [25, 33.33, 50, 66.67, 75]');
      expect(gridSource).toContain('className="multiview-divider-vertical"');
      expect(gridSource).toContain('className="multiview-divider-horizontal"');
      expect(layoutTests).toContain('keeps dynamic slot geometry aligned with resized dividers');
    });
  });

  describe('4a. Per-Space Snap group restoration', () => {
    it('saves and restores valid snap groups for the active profile and Space', () => {
      const appSource = readRendererFile('App.tsx');
      const sessions = readRendererFile('tab-sessions.ts');
      expect(appSource).toContain('savePersistedSnapGroup(activeProfileId, activeSpacePath');
      expect(appSource).toContain('loadPersistedSnapGroup(activeProfileId, newSpacePath, nextTabs)');
      expect(appSource).toContain('loadPersistedSnapGroup(activeProfileId, activeSpacePath, restoredTabs)');
      expect(sessions).toContain("export const snapGroupsStorageKey = 'lastbrowser.snapGroups.v1'");
      expect(sessions).toContain('Object.hasOwn(SNAP_LAYOUT_DEFINITIONS, layout)');
    });
  });

  describe('5. Summarize Bar Drag-Lag & ModernTitlebar Docking', () => {
    it('renders transparent capture overlay and uses requestAnimationFrame in InPageActionBar.tsx', () => {
      const source = readRendererFile('components/InPageActionBar.tsx');
      expect(source).toContain('action-bar-drag-capture-overlay');
      expect(source).toContain('cursor: \'grabbing\'');
      expect(source).toContain('requestAnimationFrame');
      expect(source).toContain('pendingCoordsRef');
    });

    it('provides Summarize button in ModernTitlebar', () => {
      const source = readRendererFile('components/HeaderComponents.tsx');
      expect(source).toContain('titlebar-summarize-btn');
      expect(source).toContain('title="Seite mit KI zusammenfassen"');
      expect(source).toContain('onTriggerSummarize');

      const appSource = readRendererFile('App.tsx');
      expect(appSource).toContain('onTriggerSummarize={() => void runSidekickAction(\'summarize-page\')}');
    });
  });
});
