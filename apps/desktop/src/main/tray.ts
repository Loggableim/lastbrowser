import { app, BrowserWindow, Menu, MenuItemConstructorOptions, nativeImage, Tray } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { SidecarServices } from './services.js';

export type TrayController = {
  tray: Tray | null;
  updateMenu: () => void;
  destroy: () => void;
};

export type TrayOptions = {
  getMainWindow: () => BrowserWindow | null;
  getWindows?: () => BrowserWindow[];
  getServices: () => SidecarServices | null;
  resourcesDir?: string;
  onQuit?: () => void;
};

export type TrayWindowTarget = {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  isVisible(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
};

/** Restore hidden/minimized windows as a group so detached windows stay reachable from the tray. */
export function revealBrowserWindows(windows: TrayWindowTarget[], preferred?: TrayWindowTarget | null): void {
  for (const win of windows) {
    if (win.isDestroyed()) continue;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
  }
  const target = preferred && !preferred.isDestroyed()
    ? preferred
    : windows.find((win) => !win.isDestroyed());
  target?.focus();
}

export function resolveTrayIconPath(resourcesDir?: string): string {
  const candidates: string[] = [];
  if (resourcesDir) {
    candidates.push(path.join(resourcesDir, 'icon.ico'));
    candidates.push(path.join(resourcesDir, 'apps', 'desktop', 'build', 'icon.ico'));
    candidates.push(path.join(resourcesDir, 'dist', 'renderer', 'app-icon-16.png'));
  }
  candidates.push(path.join(process.cwd(), 'apps', 'desktop', 'build', 'icon.ico'));
  candidates.push(path.join(process.cwd(), 'build', 'icon.ico'));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0] || '';
}

export function buildTrayContextMenu(
  options: TrayOptions,
  actions: {
    showWindow: () => void;
    toggleGateway: () => void;
    restartGateway: () => void;
    quit: () => void;
  }
): Menu {
  const services = options.getServices();
  const serviceStatus = services?.getStatus();
  const gatewayStatus = services?.getGatewayStatus();

  const sidekickOnline = serviceStatus?.sidekick === 'ready';
  const gatewayRunning = gatewayStatus?.running ?? false;

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Lastbrowser öffnen',
      click: () => actions.showWindow()
    },
    { type: 'separator' },
    {
      label: `Sidekick Service: ${sidekickOnline ? 'Online' : 'Offline'}`,
      enabled: false
    },
    {
      label: gatewayRunning
        ? `Messaging Gateway: Aktiv (PID ${gatewayStatus?.pid ?? '?'})`
        : 'Messaging Gateway: Inaktiv',
      sublabel: gatewayRunning ? 'Klicken zum Stoppen' : 'Klicken zum Starten',
      click: () => actions.toggleGateway()
    },
    {
      label: 'Gateway neu starten',
      enabled: gatewayRunning,
      click: () => actions.restartGateway()
    },
    { type: 'separator' },
    {
      label: 'Lastbrowser beenden',
      click: () => actions.quit()
    }
  ];

  return Menu.buildFromTemplate(template);
}

export function createAppTray(options: TrayOptions): TrayController {
  const iconPath = resolveTrayIconPath(options.resourcesDir);
  let tray: Tray | null = null;

  try {
    const icon = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
    tray = new Tray(icon);
    tray.setToolTip('Lastbrowser — AI Browser & Messaging Gateway');
  } catch (err) {
    console.warn('[tray] Failed to initialize system tray:', err);
    return {
      tray: null,
      updateMenu: () => {},
      destroy: () => {}
    };
  }

  const showWindow = () => {
    const main = options.getMainWindow();
    const windows = options.getWindows?.() ?? (main ? [main] : []);
    revealBrowserWindows(windows, main);
  };

  const toggleGateway = async () => {
    const services = options.getServices();
    if (!services) return;
    const status = services.getGatewayStatus();
    if (status.running) {
      await services.stopGateway();
    } else {
      await services.startGateway();
    }
    updateMenu();
  };

  const restartGateway = async () => {
    const services = options.getServices();
    if (!services) return;
    await services.restartGateway();
    updateMenu();
  };

  const quit = () => {
    if (options.onQuit) {
      options.onQuit();
    } else {
      app.quit();
    }
  };

  const updateMenu = () => {
    if (!tray || tray.isDestroyed()) return;
    const menu = buildTrayContextMenu(options, {
      showWindow,
      toggleGateway,
      restartGateway,
      quit
    });
    tray.setContextMenu(menu);
  };

  tray.on('click', showWindow);
  tray.on('double-click', showWindow);

  updateMenu();

  return {
    tray,
    updateMenu,
    destroy: () => {
      if (tray && !tray.isDestroyed()) {
        tray.destroy();
        tray = null;
      }
    }
  };
}

/**
 * Configure window close interception to minimize to tray when background operation is active.
 */
export function setupMinimizeToTray(
  window: BrowserWindow,
  shouldMinimizeToTray: () => boolean
): () => void {
  const closeListener = (event: Electron.Event) => {
    if (shouldMinimizeToTray()) {
      event.preventDefault();
      window.hide();
    }
  };

  window.on('close', closeListener);
  return () => {
    window.removeListener('close', closeListener);
  };
}
