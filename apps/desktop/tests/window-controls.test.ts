import { describe, expect, it, vi } from 'vitest';
import { createWindowControlHandlers } from '../src/main/window-controls.js';

describe('window controls', () => {
  it('minimizes the current main window', () => {
    const win = {
      minimize: vi.fn(),
      isMaximized: vi.fn(),
      maximize: vi.fn(),
      unmaximize: vi.fn(),
      close: vi.fn()
    };
    const handlers = createWindowControlHandlers(() => win);

    handlers.minimize();

    expect(win.minimize).toHaveBeenCalledTimes(1);
  });

  it('toggles maximized state', () => {
    const win = {
      minimize: vi.fn(),
      isMaximized: vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true),
      maximize: vi.fn(),
      unmaximize: vi.fn(),
      close: vi.fn()
    };
    const handlers = createWindowControlHandlers(() => win);

    expect(handlers.toggleMaximize()).toBe(true);
    expect(handlers.toggleMaximize()).toBe(false);

    expect(win.maximize).toHaveBeenCalledTimes(1);
    expect(win.unmaximize).toHaveBeenCalledTimes(1);
  });

  it('closes the current main window', () => {
    const win = {
      minimize: vi.fn(),
      isMaximized: vi.fn(),
      maximize: vi.fn(),
      unmaximize: vi.fn(),
      close: vi.fn()
    };
    const handlers = createWindowControlHandlers(() => win);

    handlers.close();

    expect(win.close).toHaveBeenCalledTimes(1);
  });
});
