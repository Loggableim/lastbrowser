import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  getDashboardGreeting,
  formatDashboardTime,
  formatDashboardDate,
  DASHBOARD_QUICK_ACTIONS,
  DEFAULT_SPEED_DIAL_ITEMS,
  startPageSpaceWorkspacePath,
  getStartPageSpaceTabCount
} from '../src/renderer/panels/NativeBrowserStartPage.js';
import { browserStartSpaceCopy,browserStartHistoryCopy } from '../src/renderer/i18n/browser-start-space-copy.js';
import { desktopLocaleIds } from '../src/renderer/i18n/keys.js';
import { saveSpaceTabs } from '../src/renderer/tab-sessions.js';

describe('startpage atmospheric dashboard helpers', () => {
  it('counts the live tabs for the active Space and persisted tabs for other Spaces', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    } as unknown as Storage;
    saveSpaceTabs('profile', 'workspaces/saved', {
      tabs: [
        { id: 'saved-1', url: 'https://example.com', title: 'Saved one', pinned: false },
        { id: 'saved-2', url: 'https://example.org', title: 'Saved two', pinned: false }
      ],
      activeTabId: 'saved-1'
    }, storage);
    const liveTabs = [
      { id: 'live-1', url: 'https://one.example', title: 'One', pinned: false },
      { id: 'live-2', url: 'https://two.example', title: 'Two', pinned: false },
      { id: 'private', url: 'https://private.example', title: 'Private', pinned: false, incognito: true }
    ];

    expect(getStartPageSpaceTabCount('', '', liveTabs, 'profile', storage)).toBe(2);
    expect(getStartPageSpaceTabCount('workspaces/saved', '', liveTabs, 'profile', storage)).toBe(2);
  });

  it('keeps different Japanese Space names distinct and excludes traversal separators',()=>{
    expect(startPageSpaceWorkspacePath('調査')).toBe('workspaces/調査');
    expect(startPageSpaceWorkspacePath('仕事')).toBe('workspaces/仕事');
    expect(startPageSpaceWorkspacePath('My Research')).toBe('workspaces/my-research');
    expect(startPageSpaceWorkspacePath('../調査\\秘密')).toBe('workspaces/調査-秘密');
    expect(startPageSpaceWorkspacePath('🔎')).not.toBe(startPageSpaceWorkspacePath('🔎'));
  });
  it('has real translated Space and history states in every website language',()=>{
    for(const locale of desktopLocaleIds){
      const space=browserStartSpaceCopy[locale],history=browserStartHistoryCopy[locale];
      expect(space.home.trim()).toBeTruthy();expect(space.noTabs.trim()).toBeTruthy();expect(space.session.trim()).toBeTruthy();expect(space.tabCount(2)).toContain('2');
      expect(history.favorites.trim()).toBeTruthy();expect(history.mostVisited.trim()).toBeTruthy();expect(history.recentSites.trim()).toBeTruthy();expect(history.empty.trim()).toBeTruthy();expect(history.visits(2)).toContain('2');
    }
    expect(browserStartSpaceCopy.en.noTabs).toBe('No tabs');expect(browserStartSpaceCopy.ja.session).toBe('個別のセッション');
    const source=fs.readFileSync(path.resolve(__dirname,'../src/renderer/panels/NativeBrowserStartPage.tsx'),'utf8');
    for(const literal of ['>Aktiv<','>Wechseln<','>Eigene Session<','>Neuer Space<','>Name des Space<'])expect(source).not.toContain(literal);
  });
  it('returns morning greeting between 5:00 and 11:59', () => {
    const d = new Date(2026, 8, 21, 8, 30);
    const res = getDashboardGreeting(d);
    expect(res.greetingKey).toBe('browser.startPage.greeting.morning');
    expect(res.sublineKey).toBe('browser.startPage.greeting.morningSubline');
  });

  it('returns afternoon greeting between 12:00 and 17:59', () => {
    const d = new Date(2026, 8, 21, 14, 15);
    const res = getDashboardGreeting(d);
    expect(res.greetingKey).toBe('browser.startPage.greeting.afternoon');
    expect(res.sublineKey).toBe('browser.startPage.greeting.afternoonSubline');
  });

  it('returns evening greeting between 18:00 and 22:59', () => {
    const d = new Date(2026, 8, 21, 20, 0);
    const res = getDashboardGreeting(d);
    expect(res.greetingKey).toBe('browser.startPage.greeting.evening');
    expect(res.sublineKey).toBe('browser.startPage.greeting.eveningSubline');
  });

  it('returns night greeting between 23:00 and 4:59', () => {
    const d = new Date(2026, 8, 21, 2, 0);
    const res = getDashboardGreeting(d);
    expect(res.greetingKey).toBe('browser.startPage.greeting.night');
    expect(res.sublineKey).toBe('browser.startPage.greeting.nightSubline');
  });

  it('formats time with leading zeroes', () => {
    const d1 = new Date(2026, 8, 21, 9, 5);
    expect(formatDashboardTime(d1)).toBe('09:05');

    const d2 = new Date(2026, 8, 21, 16, 45);
    expect(formatDashboardTime(d2)).toBe('16:45');
  });

  it('formats date using localized format', () => {
    const d = new Date(2026, 8, 21, 12, 0);
    const formatted = formatDashboardDate(d, 'de-DE');
    expect(formatted).toMatch(/21/);
    expect(formatted).toMatch(/September/i);
    expect(formatted).toMatch(/2026/);
  });

  it('provides rich quick actions for research, tab summarization, and diagnostics', () => {
    expect(DASHBOARD_QUICK_ACTIONS.length).toBeGreaterThanOrEqual(4);

    const ids = DASHBOARD_QUICK_ACTIONS.map((a) => a.id);
    expect(ids).toContain('research');
    expect(ids).toContain('tabs-summary');
    expect(ids).toContain('sort-tabs');
    expect(ids).toContain('doctor');
    expect(ids).toContain('palette');

    const tabsSummary = DASHBOARD_QUICK_ACTIONS.find((a) => a.id === 'tabs-summary');
    expect(tabsSummary?.prompt).toContain('@tabs');
    expect(tabsSummary?.labelKey).toBe('browser.startPage.actions.tabsSummary');
  });

  it('maintains compatibility with default speed dial items', () => {
    expect(DEFAULT_SPEED_DIAL_ITEMS.length).toBe(8);
  });

  it('does not reference undefined setupState in BrowserMain', () => {
    const appTsx = fs.readFileSync(path.resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');
    const browserMainSection = appTsx.slice(appTsx.indexOf('function BrowserMain('));
    expect(browserMainSection).not.toContain('setupState.');
  });

  it('stacks the add-Space card title and description instead of letting text run together', () => {
    const styles = fs.readFileSync(path.resolve(__dirname, '../src/renderer/styles.css'), 'utf8');
    const cardTextRule = styles.match(/\.startpage-add-card-text\s*\{([^}]*)\}/)?.[1] || '';
    expect(cardTextRule).toContain('display: flex');
    expect(cardTextRule).toContain('flex-direction: column');
    expect(cardTextRule).toContain('gap: 3px');
  });
});
