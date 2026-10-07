import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canDragFloatingDock, createDockAutoHideController, resolveDockOrientationForPanel } from '../src/renderer/dock-auto-hide.js';
import { afterEach, vi } from 'vitest';

const rendererDir = resolve(__dirname, '../src/renderer');
const css = readFileSync(resolve(rendererDir, 'styles.css'), 'utf8').replace(/\r\n/g, '\n');
const dock = readFileSync(resolve(rendererDir, 'components/NovaDock.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('settings appearance and Nova Dock usability regressions', () => {
  it('gives accent choices readable light-theme labels and active states', () => {
    expect(css).toMatch(/html\.theme-light \.settings-accent-btn\s*\{[^}]*color:\s*var\(--lb-text\)/s);
    expect(css).toMatch(/html\.theme-light \.settings-accent-btn\.active\s*\{[^}]*color:\s*#075985/s);
  });

  it('lets translated font-size labels wrap without clipping', () => {
    expect(css).toContain('grid-template-columns: repeat(auto-fit, minmax(min(100%, 120px), 1fr));');
    expect(css).toMatch(/\.settings-size-btn strong\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/s);
  });

  it('starts and resynchronizes auto-hide, and restores the dock when disabled', () => {
    vi.useFakeTimers();
    const visibility: boolean[] = [];
    const controller = createDockAutoHideController((revealed) => visibility.push(revealed));

    controller.sync(true, 'right', false, false);
    expect(visibility).toEqual([]);
    vi.advanceTimersByTime(350);
    expect(visibility).toEqual([false]);

    controller.sync(false, 'right', false, false);
    expect(visibility).toEqual([false, true]);
    controller.sync(true, 'right', false, false);
    controller.sync(false, 'right', false, false);
    vi.advanceTimersByTime(350);
    expect(visibility).toEqual([false, true, true]);
    controller.dispose();
  });

  it('keeps the floating dock reachable beside Settings and restores its saved position', () => {
    expect(dock).toContain("const floatingInSettings = activePanel === 'settings' && effectivePosition === 'floating'");
    expect(dock).toContain("right: '8px'");
    expect(dock).toContain('dockSettings.floatingPos.x');
    expect(dock).toContain("floatingInSettings ? 'settings-safe-position' : ''");
    expect(css).toContain('body:has(.nova-dock.pos-floating.settings-safe-position) .settings-main');
    expect(resolveDockOrientationForPanel('settings', 'floating', 'horizontal')).toBe('vertical');
    expect(resolveDockOrientationForPanel('browser', 'floating', 'horizontal')).toBe('horizontal');
    expect(resolveDockOrientationForPanel('settings', 'right', 'horizontal')).toBe('horizontal');
    expect(canDragFloatingDock('floating', 'settings')).toBe(false);
    expect(canDragFloatingDock('floating', 'browser')).toBe(true);
    expect(dock).toContain('if (!isDragging || floatingInSettings) return;');
    expect(dock).toContain('if (!canDragFloatingDock(effectivePosition, activePanel))');
  });

  it('preserves pointer reveal, app-restart startup and the floating-position exception', () => {
    vi.useFakeTimers();
    const visibility: boolean[] = [];
    const controller = createDockAutoHideController((revealed) => visibility.push(revealed));
    controller.sync(true, 'right', false, false);
    controller.pointerEnter();
    vi.advanceTimersByTime(350);
    expect(visibility).toEqual([true]);

    controller.sync(true, 'right', false, false);
    controller.sync(true, 'floating', false, false);
    vi.advanceTimersByTime(350);
    expect(visibility).toEqual([true, true]);
    controller.dispose();
  });

  it('does not auto-hide keyboard-focused docks, including focus moves between dock items', () => {
    vi.useFakeTimers();
    const visibility: boolean[] = [];
    const controller = createDockAutoHideController((revealed) => visibility.push(revealed));

    controller.sync(true, 'right', false, true);
    vi.advanceTimersByTime(350);
    expect(visibility).toEqual([true]);

    controller.focusEnter();
    controller.focusLeave(true, 'right', true);
    vi.advanceTimersByTime(350);
    expect(visibility).toEqual([true, true, true]);

    controller.focusLeave(true, 'right', false);
    vi.advanceTimersByTime(349);
    expect(visibility).toEqual([true, true, true]);
    vi.advanceTimersByTime(1);
    expect(visibility).toEqual([true, true, true, false]);
    controller.dispose();
  });
});

afterEach(() => vi.useRealTimers());
