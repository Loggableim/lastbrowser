import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Execute the production IPC branch with controlled state and effects. This
// catches the original bug even when the DOM shortcut path remains correct.
const app = readFileSync(resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
const branch = app.match(/case 'toggle-sidebar':([\s\S]*?)\n\s*case 'toggle-command-palette':/)?.[1];
if (!branch) throw new Error('Missing production toggle-sidebar IPC branch');
const dispatch = new Function('usePanelStore', 'setZenSidebarRevealed', 'cycleSidebarMode',
  'setContextSidebarCollapsed', `switch ('toggle-sidebar') { case 'toggle-sidebar': ${branch} }`);

describe('A-008a Zen IPC sidebar shortcut', () => {
  it.each([false, true])('toggles only the overlay in Zen (revealed=%s)', (initial) => {
    let revealed = initial;
    const cycle = vi.fn();
    const context = vi.fn();
    dispatch({ getState: () => ({ sidebarMode: 'hidden' }) },
      (update: (value: boolean) => boolean) => { revealed = update(revealed); }, cycle, context);
    expect(revealed).toBe(!initial);
    expect(cycle).not.toHaveBeenCalled();
    expect(context).not.toHaveBeenCalled();
  });

  it.each(['slim', 'expanded'])('preserves normal sidebar behavior in %s mode', (sidebarMode) => {
    const overlay = vi.fn();
    const cycle = vi.fn();
    let collapsed = false;
    dispatch({ getState: () => ({ sidebarMode }) }, overlay, cycle,
      (update: (value: boolean) => boolean) => { collapsed = update(collapsed); });
    expect(cycle).toHaveBeenCalledOnce();
    expect(collapsed).toBe(true);
    expect(overlay).not.toHaveBeenCalled();
  });
});
