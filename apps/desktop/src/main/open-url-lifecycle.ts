import { extractUrlFromArgs } from './url-dispatch.js';

export type OpenUrlWindow = {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  isVisible(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
  webContents: {
    isLoading(): boolean;
    send(channel: string, url: string): void;
  };
};

export type OpenUrlLifecycleOptions<TWindow extends OpenUrlWindow> = {
  getMainWindow(): TWindow | null;
  createMainWindow(): TWindow;
  isAppReady(): boolean;
};

/** Queue OS-opened URLs until the main renderer has mounted its open-tab listener. */
export function createOpenUrlLifecycle<TWindow extends OpenUrlWindow>(
  options: OpenUrlLifecycleOptions<TWindow>
) {
  const pendingUrls: string[] = [];
  const readyWindows = new WeakSet<object>();

  const isLive = (window: TWindow | null): window is TWindow =>
    Boolean(window && !window.isDestroyed());

  const reveal = (window: TWindow): void => {
    if (window.isMinimized()) window.restore();
    if (!window.isVisible()) window.show();
    window.focus();
  };

  function ensureMainWindow(): TWindow | null {
    let window = options.getMainWindow();
    if (!isLive(window)) {
      if (!options.isAppReady()) return null;
      window = options.createMainWindow();
    }
    if (isLive(window)) reveal(window);
    return window;
  }

  function flushPending(window: TWindow): void {
    if (!isLive(window) || options.getMainWindow() !== window
      || !readyWindows.has(window) || window.webContents.isLoading()) return;

    while (pendingUrls.length > 0) {
      const url = pendingUrls[0];
      try {
        window.webContents.send('lastbrowser:browser:openTab', url);
        pendingUrls.shift();
      } catch {
        // Preserve this URL and the remaining queue if the renderer is closing.
        return;
      }
    }
  }

  function dispatchOpenUrl(rawUrl: string): boolean {
    const url = extractUrlFromArgs([String(rawUrl || '').trim()]);
    if (!url) return false;

    const window = options.getMainWindow();
    if (!isLive(window)) {
      pendingUrls.push(url);
      ensureMainWindow();
      return true;
    }

    reveal(window);
    if (!readyWindows.has(window) || window.webContents.isLoading()) {
      pendingUrls.push(url);
      return true;
    }

    try {
      window.webContents.send('lastbrowser:browser:openTab', url);
      return true;
    } catch {
      pendingUrls.push(url);
      return true;
    }
  }

  return {
    dispatchOpenUrl,
    handleOpenUrl(event: { preventDefault(): void }, rawUrl: string): boolean {
      event.preventDefault();
      return dispatchOpenUrl(rawUrl);
    },
    handleSecondInstance(commandLine: string[]): string | null {
      const url = extractUrlFromArgs(commandLine);
      if (url) {
        dispatchOpenUrl(url);
      } else {
        ensureMainWindow();
      }
      return url;
    },
    onWindowLoading(window: TWindow): void {
      readyWindows.delete(window);
    },
    onWindowReady(window: TWindow): void {
      if (!isLive(window) || options.getMainWindow() !== window || window.webContents.isLoading()) return;
      readyWindows.add(window);
      flushPending(window);
    },
    pendingCount(): number {
      return pendingUrls.length;
    }
  };
}
