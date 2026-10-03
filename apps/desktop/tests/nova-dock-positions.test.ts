import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rendererDir = resolve(__dirname, '../src/renderer');
const app = readFileSync(resolve(rendererDir, 'App.tsx'), 'utf8');
const sidebar = readFileSync(resolve(rendererDir, 'components/SidekickSidebar.tsx'), 'utf8');
const css = readFileSync(resolve(rendererDir, 'styles.css'), 'utf8').replace(/\r\n/g, '\n');

describe('Nova Dock shell-level decoupling (goal.md Paket 5)', () => {
  it('App.tsx renders NovaDock at shell level for non-left positions', () => {
    expect(app).toContain("import { NovaDock } from './components/NovaDock.js'");
    // The shell-level dock renders outside the sidebar <aside> — the gate must
    // check the dock position and the slim sidebar mode.
    expect(app).toContain("dockSettings.position !== 'left' && sidebarMode === 'slim'");
  });

  it('SidekickSidebar renders the inline dock only when it hosts it (left or zen overlay)', () => {
    expect(sidebar).toContain('const sidebarHostsDock = isFloatingOverlay || dockSettings.position');
    expect(sidebar).toContain('sidebarHostsDock ? (');
  });

  it('keeps the zen floating overlay dock forced to the left edge', () => {
    expect(sidebar).toContain("forcedPosition={isFloatingOverlay ? 'left' : undefined}");
  });
});

describe('Nova Dock anti-clipping (goal.md Paket 5)', () => {
  it('never crops fisheye-magnified icons on the dock containers', () => {
    const dockBlockStart = css.indexOf('.nova-dock {');
    const dockBlockEnd = css.indexOf('}', dockBlockStart);
    const dockBlock = css.slice(dockBlockStart, dockBlockEnd);
    expect(dockBlock).toContain('overflow: visible');
  });

  it('positions the right dock at the right screen edge without clipping', () => {
    const rightBlockStart = css.indexOf('.nova-dock.pos-right {');
    const rightBlockEnd = css.indexOf('}', rightBlockStart);
    const rightBlock = css.slice(rightBlockStart, rightBlockEnd);
    expect(rightBlock).toContain('position: fixed');
    expect(rightBlock).toContain('right: 8px');
  });

  it('supports all five dock positions in CSS', () => {
    for (const pos of ['pos-left', 'pos-right', 'pos-top', 'pos-bottom', 'pos-floating']) {
      expect(css).toContain(`.nova-dock.${pos}`);
    }
  });

  it('preserves center anchoring for right and horizontal docks across slide and fade animations', () => {
    expect(css).toContain('.nova-dock.anim-slide.pos-right.is-hidden {\n  transform: translateX(calc(100% + 20px)) translateY(-50%);');
    expect(css).toContain('.nova-dock.anim-fade.pos-bottom.is-hidden,');
    expect(css).toContain('transform: translateX(-50%) scale(var(--dock-fade-scale, 1));');
    expect(css).toContain('.nova-dock.anim-fade.pos-right.is-hidden,');
    expect(css).toContain('transform: translateY(-50%) scale(var(--dock-fade-scale, 1));');
  });

  it('provides auto-hide trigger zones for every edge', () => {
    for (const edge of ['trigger-bottom', 'trigger-top', 'trigger-left', 'trigger-right']) {
      expect(css).toContain(`.nova-dock-trigger-zone.${edge}`);
    }
  });

  it('persists floating drag coordinates in the dock settings', () => {
    const novaDock = readFileSync(resolve(rendererDir, 'components/NovaDock.tsx'), 'utf8');
    expect(novaDock).toContain('floatingPos: { x: Math.round(nextX), y: Math.round(nextY) }');
    expect(novaDock).toContain('dockSettings.floatingPos.x');
  });

  it('does not auto-hide the floating dock when no reveal trigger exists', () => {
    const novaDock = readFileSync(resolve(rendererDir, 'components/NovaDock.tsx'), 'utf8');
    expect(novaDock).toContain("dockSettings.autoHide && effectivePosition !== 'floating'");
    expect(novaDock).toContain('dockSettings.autoHide && effectivePosition !== \'floating\' && (');
  });
});
