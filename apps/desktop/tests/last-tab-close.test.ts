import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { useTabStore } from '../src/renderer/stores/useTabStore.js';
import { browserStartUrl } from '../src/renderer/tabs.js';

// Execute the actual App wrapper against the real store so reintroducing a
// UI-only last-tab guard fails even if the store action still works correctly.
const source = ts.createSourceFile('App.tsx', readFileSync(path.resolve('src/renderer/App.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let closeDeclaration = '';
const inspect = (node: ts.Node): void => {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'closeTab') closeDeclaration = node.getText(source);
  ts.forEachChild(node, inspect);
};
inspect(source);
const code = ts.transpileModule(closeDeclaration, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const activeRef = { current: 'last-tab' };
const closeFromApp = new Function('useTabStore', 'activeTabIdRef', `${code}\nreturn closeTab;`)(useTabStore, activeRef) as (id: string) => void;

beforeEach(() => {
  activeRef.current = 'last-tab';
  useTabStore.setState({ tabs: [{ id: 'last-tab', url: 'https://example.com/last', title: 'Last Site' }], activeTabId: 'last-tab', closedTabs: [], splitTabIds: [], splitSlotIndexes: [], addressValue: 'https://example.com/last', browserMode: 'web' });
});
describe('closing the final tab through App and the existing store action', () => {
  it('removes the last website and installs a fresh start tab with a new ID', () => {
    closeFromApp('last-tab');
    const state = useTabStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]).toMatchObject({ url: browserStartUrl });
    expect(state.tabs[0].id).not.toBe('last-tab');
    expect(state.activeTabId).toBe(state.tabs[0].id);
    expect(activeRef.current).toBe(state.activeTabId);
    expect(state.closedTabs[0]).toMatchObject({ url: 'https://example.com/last', title: 'Last Site' });
    useTabStore.getState().reopenClosedTab();
    expect(useTabStore.getState().tabs.some(tab => tab.url === 'https://example.com/last')).toBe(true);
  });
  it('does not retain a closed private URL in reopen history', () => {
    useTabStore.setState({ tabs: [{ id: 'last-tab', url: 'https://private.example/secret', title: 'Private', incognito: true }] });
    closeFromApp('last-tab');
    expect(useTabStore.getState().closedTabs).toEqual([]);
    expect(useTabStore.getState().tabs[0].url).toBe(browserStartUrl);
  });
  it('removes closed-tab split references and synchronizes fallback selection', () => {
    useTabStore.setState({ splitTabIds: ['last-tab'], splitSlotIndexes: [0] });
    closeFromApp('last-tab');
    expect(useTabStore.getState().splitTabIds).toEqual([]);
    expect(useTabStore.getState().splitSlotIndexes).toEqual([]);
    expect(useTabStore.getState().tabs.some(tab => tab.id === activeRef.current)).toBe(true);
  });
  it('ignores a stale close request and retains the active tab when another tab closes', () => {
    closeFromApp('missing');
    expect(useTabStore.getState().tabs[0].id).toBe('last-tab');
    useTabStore.setState({ tabs: [...useTabStore.getState().tabs, { id: 'other', url: 'https://other.example', title: 'Other' }] });
    closeFromApp('other');
    expect(activeRef.current).toBe('last-tab');
    expect(useTabStore.getState().tabs).toHaveLength(1);
  });
});
