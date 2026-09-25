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
      expect(appSource).toContain('onCreateSpace={() => setActivePanel(\'workspaces\')}');
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
      // Used for both split webviews and single viewport webview
      expect(partitionUsages!.length).toBeGreaterThanOrEqual(2);
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
    it('ensures split screen and normal viewport are toggled by CSS display, not conditional unmounting', () => {
      const appSource = readRendererFile('App.tsx');
      // Both branches are always in the DOM; visibility is controlled via display:none.
      // This prevents WebView remounting when switching between split and non-split tabs.
      expect(appSource).toContain("splitTabIds.includes(activeTab.id) ? 'flex' : 'none'");
      expect(appSource).toContain("splitTabIds.includes(activeTab.id)) ? 'none' : 'block'");
      // Split container is still conditional on having ≥2 tabs in split
      expect(appSource).toContain('splitTabIds && splitTabIds.length > 1');
    });
  });

  describe('4. Multiscreen Pane Resizing', () => {
    it('implements splitRatios state, divider dragging, and overlay in App.tsx', () => {
      const appSource = readRendererFile('App.tsx');
      expect(appSource).toContain('const [splitRatios, setSplitRatios] = useState<number[]>(');
      expect(appSource).toContain('handleSplitResizeStart(index - 1, e)');
      expect(appSource).toContain('split-resize-divider');
      expect(appSource).toContain('split-resize-overlay');
      expect(appSource).toContain('flex: `${splitRatios[index] ??');
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
