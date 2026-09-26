import { describe, expect, it, vi } from 'vitest';
import { createWindowControlHandlers, registerWindowControlIpc } from '../src/main/window-controls.js';

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

  it('checks isMaximized state', () => {
    const win = {
      minimize: vi.fn(),
      isMaximized: vi.fn().mockReturnValue(true),
      maximize: vi.fn(),
      unmaximize: vi.fn(),
      close: vi.fn()
    };
    const handlers = createWindowControlHandlers(() => win);
    expect(handlers.isMaximized()).toBe(true);

    const nullHandlers = createWindowControlHandlers(() => null);
    expect(nullHandlers.isMaximized()).toBe(false);
  });

  it('unmaximizes the window', () => {
    const win = {
      minimize: vi.fn(),
      isMaximized: vi.fn(),
      maximize: vi.fn(),
      unmaximize: vi.fn(),
      close: vi.fn()
    };
    const handlers = createWindowControlHandlers(() => win);
    handlers.unmaximize();
    expect(win.unmaximize).toHaveBeenCalledTimes(1);
  });

  it('sets window position and retrieves bounds', () => {
    const win = {
      minimize: vi.fn(),
      isMaximized: vi.fn(),
      maximize: vi.fn(),
      unmaximize: vi.fn(),
      close: vi.fn(),
      setPosition: vi.fn(),
      getBounds: vi.fn().mockReturnValue({ x: 100, y: 200, width: 1400, height: 900 })
    };
    const handlers = createWindowControlHandlers(() => win);
    handlers.setPosition(150, 250);
    expect(win.setPosition).toHaveBeenCalledWith(150, 250);
    expect(handlers.getBounds()).toEqual({ x: 100, y: 200, width: 1400, height: 900 });

    const nullHandlers = createWindowControlHandlers(() => null);
    expect(nullHandlers.getBounds()).toEqual({ x: 0, y: 0, width: 1440, height: 920 });
  });

  it('manages fullscreen state', () => {
    const win = {
      minimize: vi.fn(),
      isMaximized: vi.fn(),
      maximize: vi.fn(),
      unmaximize: vi.fn(),
      close: vi.fn(),
      isFullScreen: vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true),
      setFullScreen: vi.fn()
    };
    const handlers = createWindowControlHandlers(() => win);

    expect(handlers.isFullScreen()).toBe(false);
    expect(handlers.isFullScreen()).toBe(true);

    handlers.setFullScreen(true);
    expect(win.setFullScreen).toHaveBeenCalledWith(true);

    const toggleWin = {
      ...win,
      isFullScreen: vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    };
    const toggleHandlers = createWindowControlHandlers(() => toggleWin);
    expect(toggleHandlers.toggleFullScreen()).toBe(true);
    expect(toggleWin.setFullScreen).toHaveBeenCalledWith(true);
  });
});

describe('registerWindowControlIpc per-window routing', () => {
  type CapturedHandler = (...args: any[]) => unknown;
  function captureIpcMain() {
    const handlers = new Map<string, CapturedHandler>();
    const ipcMain = {
      handle(channel: string, listener: CapturedHandler) {
        handlers.set(channel, listener);
      }
    };
    return { ipcMain, handlers };
  }
  function makeWindow() {
    return {
      minimize: vi.fn(),
      isMaximized: vi.fn().mockReturnValue(false),
      maximize: vi.fn(),
      unmaximize: vi.fn(),
      close: vi.fn()
    };
  }

  it('routes close to the window resolved from event.sender, not the fallback', () => {
    const { ipcMain, handlers } = captureIpcMain();
    const fallback = makeWindow();
    const detached = makeWindow();
    registerWindowControlIpc(ipcMain as any, () => fallback as any, (sender) =>
      sender === 'detached-sender' ? (detached as any) : null
    );

    handlers.get('lastbrowser:window:close')!({ sender: 'detached-sender' });

    expect(detached.close).toHaveBeenCalledTimes(1);
    expect(fallback.close).not.toHaveBeenCalled();
  });

  it('falls back to getWindow() when the sender resolver returns null', () => {
    const { ipcMain, handlers } = captureIpcMain();
    const fallback = makeWindow();
    registerWindowControlIpc(ipcMain as any, () => fallback as any, () => null);

    handlers.get('lastbrowser:window:close')!({ sender: {} });

    expect(fallback.close).toHaveBeenCalledTimes(1);
  });

  it('routes minimize and toggleMaximize per sender window', () => {
    const { ipcMain, handlers } = captureIpcMain();
    const fallback = makeWindow();
    const detached = makeWindow();
    registerWindowControlIpc(ipcMain as any, () => fallback as any, (sender) =>
      sender === 'detached-sender' ? (detached as any) : null
    );

    handlers.get('lastbrowser:window:minimize')!({ sender: 'detached-sender' });
    expect(detached.minimize).toHaveBeenCalledTimes(1);
    expect(fallback.minimize).not.toHaveBeenCalled();

    detached.isMaximized = vi.fn().mockReturnValue(true);
    const result = handlers.get('lastbrowser:window:toggleMaximize')!({ sender: 'detached-sender' });
    expect(result).toBe(false);
    expect(detached.unmaximize).toHaveBeenCalledTimes(1);
    expect(fallback.maximize).not.toHaveBeenCalled();
  });

  it('keeps legacy behavior when no sender resolver is provided', () => {
    const { ipcMain, handlers } = captureIpcMain();
    const fallback = makeWindow();
    registerWindowControlIpc(ipcMain as any, () => fallback as any);

    handlers.get('lastbrowser:window:close')!({ sender: {} });

    expect(fallback.close).toHaveBeenCalledTimes(1);
  });
});
