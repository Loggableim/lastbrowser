import { describe, expect, it } from 'vitest';
import { defaultWorkplaceLayout, moveWorkplaceWidget, parseWorkplaceLayout, WORKPLACE_WIDGETS } from '../src/renderer/panels/workplace-layout.js';
import { readFileSync } from 'node:fs';

describe('persisted workplace dock layout', () => {
  it('starts with every actual widget exactly once and docks search and Spaces at the top', () => {
    const layout = defaultWorkplaceLayout();
    expect(layout.order).toEqual(WORKPLACE_WIDGETS);
    expect(layout.tiles.search).toEqual({ dock: 'top', size: 'wide' });
    expect(layout.tiles.spaces).toEqual({ dock: 'top', size: 'wide' });
  });
  it('migrates missing old layout without changing widget contents', () => {
    expect(parseWorkplaceLayout(undefined)).toEqual(defaultWorkplaceLayout());
    expect(parseWorkplaceLayout(null)).toEqual(defaultWorkplaceLayout());
  });
  it('deduplicates and excludes unrecognized stored widget IDs', () => {
    const layout = parseWorkplaceLayout({ order: ['notes', 'notes', 'evil-widget', 'spaces'] });
    expect(layout.order.slice(0, 2)).toEqual(['notes', 'spaces']);
    expect(new Set(layout.order).size).toBe(WORKPLACE_WIDGETS.length);
    expect(layout.order).not.toContain('evil-widget');
  });
  it('preserves valid chosen size/dock and rejects malformed stored values', () => {
    const layout = parseWorkplaceLayout({ tiles: { notes: { dock: 'bottom', size: 'medium' }, search: { dock: 'unknown', size: 'giant' } } });
    expect(layout.tiles.notes).toEqual({ dock: 'bottom', size: 'medium' });
    expect(layout.tiles.search).toEqual(defaultWorkplaceLayout().tiles.search);
  });
  it('moves a widget ahead of its drop target and adopts that dock without mutating input', () => {
    const original = defaultWorkplaceLayout();
    const moved = moveWorkplaceWidget(original, 'notes', 'spaces', 'top');
    expect(moved.order.indexOf('notes') + 1).toBe(moved.order.indexOf('spaces'));
    expect(moved.tiles.notes.dock).toBe('top');
    expect(original.tiles.notes.dock).toBe('main');
    expect(original.order).toEqual(WORKPLACE_WIDGETS);
  });
  it('drops in an empty zone and ignores dropping a widget onto itself', () => {
    const original = defaultWorkplaceLayout();
    const moved = moveWorkplaceWidget(original, 'search', null, 'bottom');
    expect(moved.order.at(-1)).toBe('search');
    expect(moved.tiles.search.dock).toBe('bottom');
    expect(moveWorkplaceWidget(original, 'notes', 'notes', 'main')).toBe(original);
  });
  it('round trips serialized layout, including explicit visual order', () => {
    const moved = moveWorkplaceWidget(defaultWorkplaceLayout(), 'focus', 'search', 'top');
    moved.tiles.focus.size = 'medium';
    expect(parseWorkplaceLayout(JSON.parse(JSON.stringify(moved)))).toEqual(moved);
  });
  it('keeps local tasks off by default and requires the persisted Hub policy', () => {
    const widgets = readFileSync(new URL('../src/renderer/panels/workplace-widgets.tsx', import.meta.url), 'utf8');
    const home = readFileSync(new URL('../src/renderer/panels/NativeBrowserStartPage.tsx', import.meta.url), 'utf8');
    expect(widgets).toContain('tasks: false');
    expect(home).toContain('optionalFeatures.loaded && optionalFeatures.policy.tasks_enabled');
    expect(home).toContain('tasksEnabled && workplace.enabled.tasks');
    expect(home).toContain('Gespeicherte Aufgaben ansehen');
  });
});
