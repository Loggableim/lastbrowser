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
  currentActiveAgentCount,
  liveSpaceAgentCount
} from '../src/renderer/panels/NativeBrowserStartPage.js';
import { browserStartSpaceCopy,browserStartHistoryCopy } from '../src/renderer/i18n/browser-start-space-copy.js';
import { desktopLocaleIds } from '../src/renderer/i18n/keys.js';
import type { GlobalActivitySpace } from '../src/renderer/independent-contracts.js';
import { START_PAGE_WALLPAPERS, parseStartPageWallpaperPreference, startPageWallpaperStorageKey } from '../src/renderer/panels/startpage-wallpaper.js';

describe('startpage atmospheric dashboard helpers', () => {
  it('ships six offline wallpapers and keeps preferences separate by browser, backend and Space', () => {
    expect(START_PAGE_WALLPAPERS).toHaveLength(6);
    for (const wallpaper of START_PAGE_WALLPAPERS) {
      expect(wallpaper.path).toMatch(/^\.\/(?:wallpapers\/)?[\w-]+\.jpg$/);
      expect(fs.existsSync(path.resolve(__dirname, '../../../brand/assets', wallpaper.path))).toBe(true);
    }
    const key = startPageWallpaperStorageKey('profile-a', 'backend-a', 'space-a');
    expect(key).not.toBe(startPageWallpaperStorageKey('profile-b', 'backend-a', 'space-a'));
    expect(key).not.toBe(startPageWallpaperStorageKey('profile-a', 'backend-b', 'space-a'));
    expect(key).not.toBe(startPageWallpaperStorageKey('profile-a', 'backend-a', 'space-b'));
    expect(parseStartPageWallpaperPreference(JSON.stringify({ wallpaperId: 'nordic-arch', dim: 99, blur: -5 })))
      .toEqual({ wallpaperId: 'nordic-arch', dim: 80, blur: 0 });
    expect(parseStartPageWallpaperPreference('{broken').wallpaperId).toBe('liquid-obsidian');
  });
  it('shows only fresh validated agent counts and never derives them from tabs', () => {
    const now = 100_000;
    expect(currentActiveAgentCount(undefined, now)).toBeNull();
    expect(currentActiveAgentCount({ count: 2, observedAt: now - 14_999 }, now)).toBe(2);
    expect(currentActiveAgentCount({ count: 0, observedAt: now }, now)).toBe(0);
    expect(currentActiveAgentCount({ count: 2, observedAt: now - 15_000 }, now)).toBeNull();
    expect(currentActiveAgentCount({ count: -1, observedAt: now }, now)).toBeNull();
    const source = fs.readFileSync(path.resolve(__dirname, '../src/renderer/panels/NativeBrowserStartPage.tsx'), 'utf8');
    expect(source).not.toContain('getStartPageSpaceTabCount');
    expect(source).not.toContain('startpage-space-tabs-count');
  });
  it('counts current real runs without counting their chat stream twice', () => {
    const now = Date.now();
    const space = { activity: { sourceState: 'live', observedAt: new Date(now).toISOString(),
      nativeChatObservation: { sourceState: 'live' },
      runs: [{ state: 'running', targetSessionId: 'session-a' }, { state: 'completed', targetSessionId: 'session-b' }],
      activeChats: [{ sessionId: 'session-a' }, { sessionId: 'session-c' }] } } as unknown as GlobalActivitySpace;
    expect(liveSpaceAgentCount(space, now)).toBe(2);
    expect(liveSpaceAgentCount({ ...space, activity: { ...space.activity, sourceState: 'stale' } }, now)).toBeNull();
    expect(liveSpaceAgentCount({ ...space, activity: { ...space.activity, observedAt: new Date(now - 15_000).toISOString() } }, now)).toBeNull();
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
