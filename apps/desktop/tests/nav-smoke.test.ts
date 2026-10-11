import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchBrowserShortcut } from '../src/main/shortcuts.js';

const renderer = resolve(process.cwd(), 'src/renderer');
const read = (file: string) => readFileSync(resolve(renderer, file), 'utf8');

function cssRule(css: string, selector: string, nextSelector: string): string {
  const start = css.indexOf(selector);
  const end = css.indexOf(nextSelector, start + selector.length);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  expect(end, nextSelector).toBeGreaterThan(start);
  return css.slice(start, end);
}

describe('A-007 navigation smoke', () => {
  it('keeps the first-run backdrop from swallowing sidebar and top-navigation clicks', () => {
    const css = read('styles.css');
    const wrap = cssRule(css, '.first-run-fullscreen-wrap {', '.first-run-fullscreen {');
    const panel = cssRule(css, '.first-run-fullscreen {', '.first-run-ai-choice-screen {');
    // Gegenprobe: pointer-events: auto on the wrap makes this assertion fail.
    expect(wrap).toContain('pointer-events: none;');
    expect(wrap).not.toMatch(/pointer-events:\s*auto/);
    expect(panel).toContain('pointer-events: auto;');
  });

  it('keeps top navigation and the tab strip wired to actions', () => {
    const header = read('components/HeaderComponents.tsx');
    expect(header).toContain('className="titlebar-tool-btn sidebar-toggle"');
    expect(header).toContain('onClick={onToggleSidebar}');
    expect(header).toContain('className="titlebar-tool-btn nav-back"');
    expect(header).toContain('onClick={onGoBack}');
    expect(header).toContain('className="titlebar-tool-btn nav-forward"');
    expect(header).toContain('onClick={onGoForward}');
    expect(header).toContain('className="titlebar-tool-btn nav-reload"');
    expect(header).toContain('onClick={onReloadOrStop}');
    expect(header).toContain("aria-label={t('browser.chrome.tabs')}");
    expect(header).toContain('onClick={() => onActivateTab(tab.id)}');
    expect(header).toContain('className="new-tab" onClick={onNewTab}');
  });

  it('keeps sidebar drawer entries clickable', () => {
    const sidebar = read('components/SidekickSidebar.tsx');
    expect(sidebar).toContain("onClick={() => handleDrawerTabChange('tabs')}");
    expect(sidebar).toContain("onClick={() => handleDrawerTabChange('ai')}");
    expect(sidebar).toContain("onClick={() => onSetMode('slim')}");
  });

  it('switches tabs and the sidebar from the keyboard shortcuts', () => {
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'Tab', control: true })).toEqual({ action: 'next-tab' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'Tab', control: true, shift: true })).toEqual({ action: 'prev-tab' });
    expect(matchBrowserShortcut({ type: 'keyDown', key: 'b', control: true })).toEqual({ action: 'toggle-sidebar' });
    const app = read('App.tsx');
    expect(app).toContain("case 'next-tab':");
    expect(app).toContain("case 'prev-tab':");
    expect(app).toContain("case 'toggle-sidebar':");
    expect(app).toContain('setActiveTabId(allTabs[nextIdx].id)');
    expect(app).toContain('setActiveTabId(allTabs[prevIdx].id)');
    expect(app).toContain('cycleSidebarMode();');
  });
});
