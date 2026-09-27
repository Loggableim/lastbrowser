import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

// Mock electron
vi.mock('electron', () => {
  return {
    app: {
      quit: vi.fn(),
      getVersion: vi.fn().mockReturnValue('0.1.29'),
      isPackaged: false,
      getPath: vi.fn().mockReturnValue('C:/temp/userdata')
    },
    Menu: {
      buildFromTemplate: vi.fn((template: any) => ({ template }))
    },
    Tray: vi.fn().mockImplementation(() => {
      const emitter = new EventEmitter() as any;
      emitter.setToolTip = vi.fn();
      emitter.setContextMenu = vi.fn();
      emitter.destroy = vi.fn();
      emitter.isDestroyed = vi.fn(() => false);
      return emitter;
    }),
    nativeImage: {
      createFromPath: vi.fn(() => ({})),
      createEmpty: vi.fn(() => ({}))
    }
  };
});

import { buildTrayContextMenu, createAppTray, setupMinimizeToTray, resolveTrayIconPath, revealBrowserWindows } from '../src/main/tray.js';

describe('system tray and background operation', () => {
  it('restores detached windows from the tray and focuses the main window', () => {
    const main = {
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => true),
      isVisible: vi.fn(() => false),
      restore: vi.fn(), show: vi.fn(), focus: vi.fn()
    };
    const detached = {
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => false),
      isVisible: vi.fn(() => false),
      restore: vi.fn(), show: vi.fn(), focus: vi.fn()
    };
    const closed = {
      isDestroyed: vi.fn(() => true),
      isMinimized: vi.fn(), isVisible: vi.fn(),
      restore: vi.fn(), show: vi.fn(), focus: vi.fn()
    };

    revealBrowserWindows([main, detached, closed], main);

    expect(main.restore).toHaveBeenCalledOnce();
    expect(main.show).toHaveBeenCalledOnce();
    expect(detached.restore).not.toHaveBeenCalled();
    expect(detached.show).toHaveBeenCalledOnce();
    expect(closed.show).not.toHaveBeenCalled();
    expect(main.focus).toHaveBeenCalledOnce();
    expect(detached.focus).not.toHaveBeenCalled();
  });

  it('wires the tray icon click to all app windows, including detached ones', () => {
    const main = {
      isDestroyed: () => false, isMinimized: () => false, isVisible: () => true,
      restore: vi.fn(), show: vi.fn(), focus: vi.fn()
    };
    const detached = {
      isDestroyed: () => false, isMinimized: () => false, isVisible: () => false,
      restore: vi.fn(), show: vi.fn(), focus: vi.fn()
    };
    const trayController = createAppTray({
      getMainWindow: () => main as any,
      getWindows: () => [main, detached] as any,
      getServices: () => null,
      resourcesDir: 'C:/missing'
    });

    (trayController.tray as any).emit('click');

    expect(detached.show).toHaveBeenCalledOnce();
    expect(main.focus).toHaveBeenCalledOnce();
    trayController.destroy();
  });

  it('builds context menu reflecting offline services and inactive gateway', () => {
    const actions = {
      showWindow: vi.fn(),
      toggleGateway: vi.fn(),
      restartGateway: vi.fn(),
      quit: vi.fn()
    };

    const options = {
      getMainWindow: () => null,
      getServices: () => null
    };

    const menu = buildTrayContextMenu(options, actions) as any;
    const items = menu.template;

    expect(items[0].label).toBe('Lastbrowser öffnen');
    expect(items[2].label).toBe('Sidekick Service: Offline');
    expect(items[3].label).toBe('Messaging Gateway: Inaktiv');
    expect(items[4].enabled).toBe(false); // Restart disabled when inactive
    expect(items[6].label).toBe('Lastbrowser beenden');

    // Clicking actions
    items[0].click();
    expect(actions.showWindow).toHaveBeenCalledTimes(1);

    items[3].click();
    expect(actions.toggleGateway).toHaveBeenCalledTimes(1);

    items[6].click();
    expect(actions.quit).toHaveBeenCalledTimes(1);
  });

  it('builds context menu reflecting active gateway with PID', () => {
    const actions = {
      showWindow: vi.fn(),
      toggleGateway: vi.fn(),
      restartGateway: vi.fn(),
      quit: vi.fn()
    };

    const fakeServices = {
      getStatus: () => ({ sidekick: 'ready' }),
      getGatewayStatus: () => ({ running: true, pid: 7890 })
    } as any;

    const options = {
      getMainWindow: () => null,
      getServices: () => fakeServices
    };

    const menu = buildTrayContextMenu(options, actions) as any;
    const items = menu.template;

    expect(items[2].label).toBe('Sidekick Service: Online');
    expect(items[3].label).toBe('Messaging Gateway: Aktiv (PID 7890)');
    expect(items[4].enabled).toBe(true); // Restart enabled when running

    items[4].click();
    expect(actions.restartGateway).toHaveBeenCalledTimes(1);
  });

  it('intercepts window close to minimize to tray when background operation is active', () => {
    const fakeWindow = new EventEmitter() as any;
    fakeWindow.hide = vi.fn();

    let shouldMinimize = true;
    const cleanup = setupMinimizeToTray(fakeWindow, () => shouldMinimize);

    const closeEvent = {
      preventDefault: vi.fn()
    } as any;

    // Trigger close with minimize active
    fakeWindow.emit('close', closeEvent);
    expect(closeEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(fakeWindow.hide).toHaveBeenCalledTimes(1);

    // If quitting is confirmed, do not prevent default
    shouldMinimize = false;
    const quitCloseEvent = {
      preventDefault: vi.fn()
    } as any;
    fakeWindow.emit('close', quitCloseEvent);
    expect(quitCloseEvent.preventDefault).not.toHaveBeenCalled();

    cleanup();
  });

  it('resolves tray icon path from candidate locations', () => {
    const iconPath = resolveTrayIconPath();
    expect(typeof iconPath).toBe('string');
    expect(iconPath.length).toBeGreaterThan(0);
  });
});
