import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  getDashboardGreeting,
  formatDashboardTime,
  formatDashboardDate,
  DASHBOARD_QUICK_ACTIONS,
  DEFAULT_SPEED_DIAL_ITEMS
} from '../src/renderer/panels/NativeBrowserStartPage.js';
import { DEFAULT_WALLPAPER_PREFERENCE, START_PAGE_WALLPAPERS, parseStartPageWallpaperPreference, startPageWallpaperStorageKey } from '../src/renderer/panels/startpage-wallpaper.js';

describe('startpage atmospheric dashboard helpers', () => {
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

  it('keeps wallpaper preferences separate by browser profile and Space', () => {
    expect(startPageWallpaperStorageKey('profile-a', '', 'workspaces/one'))
      .not.toBe(startPageWallpaperStorageKey('profile-a', '', 'workspaces/two'));
    expect(startPageWallpaperStorageKey('profile-a', '', 'workspaces/one'))
      .not.toBe(startPageWallpaperStorageKey('profile-b', '', 'workspaces/one'));
  });

  it('validates wallpaper preferences and bounds dim and blur settings', () => {
    expect(parseStartPageWallpaperPreference(null)).toEqual(DEFAULT_WALLPAPER_PREFERENCE);
    expect(parseStartPageWallpaperPreference(JSON.stringify({ wallpaperId: 'missing', dim: 100, blur: -4 })))
      .toEqual({ wallpaperId: DEFAULT_WALLPAPER_PREFERENCE.wallpaperId, dim: 80, blur: 0 });
    expect(START_PAGE_WALLPAPERS).toHaveLength(6);
  });

  it('renders an accessible wallpaper picker over a locally bundled launchpad background', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../src/renderer/panels/NativeBrowserStartPage.tsx'), 'utf8');
    const styles = fs.readFileSync(path.resolve(__dirname, '../src/renderer/panels/startpage-luminous.css'), 'utf8');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('aria-pressed={wallpaperPreference.wallpaperId === wallpaper.id}');
    expect(source).toContain('onClick={() => stepWallpaper(1)}');
    expect(styles).toContain('var(--launchpad-wallpaper)');
    expect(fs.existsSync(path.resolve(__dirname, '../../../brand/assets/launchpad-wallpaper.jpg'))).toBe(true);
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
