import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useTabStore } from '../src/renderer/stores/useTabStore.js';
import { createInitialTab } from '../src/renderer/tabs.js';

describe('Multi-Tab Splitscreen State & Mechanics', () => {
  beforeEach(() => {
    const tab1 = createInitialTab('https://example.com/1');
    const tab2 = createInitialTab('https://example.com/2');
    const tab3 = createInitialTab('https://example.com/3');
    const tab4 = createInitialTab('https://example.com/4');
    const tab5 = createInitialTab('https://example.com/5');

    useTabStore.setState({
      tabs: [tab1, tab2, tab3, tab4, tab5],
      activeTabId: tab1.id,
      closedTabs: [],
      splitTabIds: [],
      splitSlotIndexes: [],
      splitLayout: 'columns'
    });
  });

  it('initializes with empty splitTabIds and default columns layout', () => {
    const state = useTabStore.getState();
    expect(state.splitTabIds).toEqual([]);
    expect(state.splitLayout).toBe('columns');
  });

  it('addSplitTab creates a 2-way split between activeTab and target tab', () => {
    const { tabs, addSplitTab } = useTabStore.getState();
    addSplitTab(tabs[1].id);

    const nextState = useTabStore.getState();
    expect(nextState.splitTabIds).toHaveLength(2);
    expect(nextState.splitTabIds).toEqual([tabs[0].id, tabs[1].id]);
    expect(nextState.splitSlotIndexes).toEqual([0, 1]);
    expect(nextState.activeTabId).toBe(tabs[1].id);
    expect(nextState.splitLayout).toBe('columns');
  });

  it('supports up to 4 split tabs and automatically chooses grid layout for 4 tabs', () => {
    const { tabs, addSplitTab } = useTabStore.getState();
    addSplitTab(tabs[1].id);
    addSplitTab(tabs[2].id);
    expect(useTabStore.getState().splitTabIds).toHaveLength(3);

    addSplitTab(tabs[3].id);
    const state4 = useTabStore.getState();
    expect(state4.splitTabIds).toHaveLength(4);
    expect(state4.splitSlotIndexes).toEqual([0, 1, 2, 3]);
    expect(state4.splitLayout).toBe('grid');

    // Attempting to add a 5th tab should be ignored
    addSplitTab(tabs[4].id);
    expect(useTabStore.getState().splitTabIds).toHaveLength(4);
  });

  it('does not add duplicate tabs to split', () => {
    const { tabs, addSplitTab } = useTabStore.getState();
    addSplitTab(tabs[1].id);
    addSplitTab(tabs[1].id);
    expect(useTabStore.getState().splitTabIds).toHaveLength(2);
  });

  it('removeSplitTab removes a tab and dissolves split when <= 1 tab remains', () => {
    const { tabs, addSplitTab, removeSplitTab } = useTabStore.getState();
    addSplitTab(tabs[1].id);
    addSplitTab(tabs[2].id);
    expect(useTabStore.getState().splitTabIds).toHaveLength(3);

    removeSplitTab(tabs[2].id);
    expect(useTabStore.getState().splitTabIds).toEqual([tabs[0].id, tabs[1].id]);

    removeSplitTab(tabs[1].id);
    // When 1 remains, split mode dissolves
    expect(useTabStore.getState().splitTabIds).toEqual([]);
    expect(useTabStore.getState().activeTabId).toBe(tabs[0].id);
  });

  it('closeTab automatically purges tab from active split', () => {
    const { tabs, addSplitTab, closeTab } = useTabStore.getState();
    addSplitTab(tabs[1].id);
    addSplitTab(tabs[2].id);
    expect(useTabStore.getState().splitTabIds).toHaveLength(3);

    closeTab(tabs[1].id);
    expect(useTabStore.getState().splitTabIds).toEqual([tabs[0].id, tabs[2].id]);
  });

  it('detaches a split tab without keeping a closed-tab duplicate', () => {
    const { tabs, addSplitTab, detachTab } = useTabStore.getState();
    addSplitTab(tabs[1].id);
    addSplitTab(tabs[2].id);
    useTabStore.setState({ activeTabId: tabs[0].id });

    detachTab(tabs[1].id);

    const next = useTabStore.getState();
    expect(next.tabs.map((tab) => tab.id)).toEqual([tabs[0].id, tabs[2].id, tabs[3].id, tabs[4].id]);
    expect(next.splitTabIds).toEqual([tabs[0].id, tabs[2].id]);
    expect(next.splitSlotIndexes).toEqual([0, 2]);
    expect(next.closedTabs.some((item) => item.url === tabs[1].url)).toBe(false);
    expect(next.activeTabId).toBe(tabs[0].id);
  });

  it('clearSplitTabs resets split state cleanly', () => {
    const { tabs, addSplitTab, clearSplitTabs } = useTabStore.getState();
    addSplitTab(tabs[1].id);
    expect(useTabStore.getState().splitTabIds).toHaveLength(2);

    clearSplitTabs();
    expect(useTabStore.getState().splitTabIds).toEqual([]);
    expect(useTabStore.getState().splitSlotIndexes).toEqual([]);
  });

  it('assigns snap tabs to unique valid slots and filters duplicate tabs', () => {
    const { tabs, setSnapGroup } = useTabStore.getState();
    setSnapGroup('quad-grid', [tabs[0].id, tabs[1].id, tabs[1].id, tabs[2].id], [3, 1, 0, 1]);
    const state = useTabStore.getState();
    expect(state.splitTabIds).toEqual([tabs[0].id, tabs[1].id]);
    expect(state.splitSlotIndexes).toEqual([3, 1]);
    expect(state.activeTabId).toBe(tabs[0].id);
  });

  it('allows changing splitLayout directly', () => {
    const { setSplitLayout } = useTabStore.getState();
    setSplitLayout('rows');
    expect(useTabStore.getState().splitLayout).toBe('rows');
    setSplitLayout('grid');
    expect(useTabStore.getState().splitLayout).toBe('grid');
  });

  it('supports baseTabIdOverride to split dropped tab directly into target tab (tab-in-tab drag)', () => {
    const { tabs, addSplitTab } = useTabStore.getState();
    // Active tab is tabs[0], but user drags tabs[3] onto tabs[2]
    addSplitTab(tabs[3].id, tabs[2].id);

    const state = useTabStore.getState();
    expect(state.splitTabIds).toEqual([tabs[2].id, tabs[3].id]);
    expect(state.activeTabId).toBe(tabs[3].id);
    expect(state.splitLayout).toBe('columns');
  });

  it('defines styles for tab drag-over-split badge and multi-webview viewport preservation', () => {
    const cssPath = resolve(__dirname, '../src/renderer/styles.css');
    const css = readFileSync(cssPath, 'utf8');
    expect(css).toContain('.vertical-tab-item.drag-over-split');
    expect(css).toContain('.tab.drag-over-split');
    expect(css).toContain('.vtab-split-drop-badge');
    expect(css).toContain('.browser-tabs-viewport');
    expect(css).toContain('.browser-tab-pane.active-tab-pane');
    expect(css).toContain('.browser-tab-pane.inactive-tab-pane');
    expect(css).toContain('.browser-mode-overlay');
  });
});
