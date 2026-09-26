export type WindowControlTarget = {
  minimize(): void;
  isMaximized(): boolean;
  maximize(): void;
  unmaximize(): void;
  close(): void;
  getPosition?(): number[];
  setPosition?(x: number, y: number): void;
  getBounds?(): { x: number; y: number; width: number; height: number };
  isFullScreen?(): boolean;
  setFullScreen?(flag: boolean): void;
};

export type WindowControlHandlers = {
  minimize(): void;
  toggleMaximize(): boolean;
  close(): void;
  isMaximized(): boolean;
  unmaximize(): void;
  setPosition(x: number, y: number): void;
  getBounds(): { x: number; y: number; width: number; height: number };
  isFullScreen(): boolean;
  setFullScreen(flag: boolean): void;
  toggleFullScreen(): boolean;
};

export type IpcHandleApi = {
  handle(channel: string, listener: (...args: any[]) => unknown): void;
};

export function createWindowControlHandlers(getWindow: () => WindowControlTarget | null): WindowControlHandlers {
  return {
    minimize() {
      getWindow()?.minimize();
    },
    toggleMaximize() {
      const window = getWindow();
      if (!window) return false;
      if (window.isMaximized()) {
        window.unmaximize();
        return false;
      }
      window.maximize();
      return true;
    },
    close() {
      getWindow()?.close();
    },
    isMaximized() {
      return getWindow()?.isMaximized() ?? false;
    },
    unmaximize() {
      getWindow()?.unmaximize();
    },
    setPosition(x: number, y: number) {
      getWindow()?.setPosition?.(x, y);
    },
    getBounds() {
      return getWindow()?.getBounds?.() ?? { x: 0, y: 0, width: 1440, height: 920 };
    },
    isFullScreen() {
      return getWindow()?.isFullScreen?.() ?? false;
    },
    setFullScreen(flag: boolean) {
      getWindow()?.setFullScreen?.(flag);
    },
    toggleFullScreen() {
      const window = getWindow();
      if (!window || typeof window.setFullScreen !== 'function') return false;
      const next = !(window.isFullScreen?.() ?? false);
      window.setFullScreen(next);
      return next;
    }
  };
}

export function registerWindowControlIpc(
  ipcMain: IpcHandleApi,
  getWindow: () => WindowControlTarget | null,
  resolveFromEventSender?: (sender: unknown) => WindowControlTarget | null
): void {
  const handlers = createWindowControlHandlers(getWindow);
  ipcMain.handle('lastbrowser:window:minimize', (event) => {
    const target = resolveFromEventSender?.(event.sender) ?? getWindow();
    target?.minimize();
  });
  ipcMain.handle('lastbrowser:window:toggleMaximize', (event) => {
    const target = resolveFromEventSender?.(event.sender) ?? getWindow();
    if (!target) return false;
    if (target.isMaximized()) {
      target.unmaximize();
      return false;
    }
    target.maximize();
    return true;
  });
  ipcMain.handle('lastbrowser:window:close', (event) => {
    const target = resolveFromEventSender?.(event.sender) ?? getWindow();
    target?.close();
  });
  ipcMain.handle('lastbrowser:window:isMaximized', (event) => {
    const target = resolveFromEventSender?.(event.sender) ?? getWindow();
    return target?.isMaximized() ?? false;
  });
  ipcMain.handle('lastbrowser:window:unmaximize', (event) => {
    const target = resolveFromEventSender?.(event.sender) ?? getWindow();
    target?.unmaximize();
  });
  ipcMain.handle('lastbrowser:window:setPosition', (event, coords) => {
    const target = resolveFromEventSender?.(event.sender) ?? getWindow();
    const { x, y } = (coords || {}) as { x?: number; y?: number };
    if (typeof x === 'number' && typeof y === 'number') {
      target?.setPosition?.(Math.round(x), Math.round(y));
    }
  });
  ipcMain.handle('lastbrowser:window:getBounds', (event) => {
    const target = resolveFromEventSender?.(event.sender) ?? getWindow();
    return target?.getBounds?.() ?? { x: 0, y: 0, width: 1440, height: 920 };
  });
  ipcMain.handle('lastbrowser:window:isFullScreen', (event) => {
    const target = resolveFromEventSender?.(event.sender) ?? getWindow();
    return target?.isFullScreen?.() ?? false;
  });
  ipcMain.handle('lastbrowser:window:setFullScreen', (event, flag) => {
    const target = resolveFromEventSender?.(event.sender) ?? getWindow();
    target?.setFullScreen?.(Boolean(flag));
  });
  ipcMain.handle('lastbrowser:window:toggleFullScreen', (event) => {
    const target = resolveFromEventSender?.(event.sender) ?? getWindow();
    if (!target) return false;
    const next = !(target.isFullScreen?.() ?? false);
    target.setFullScreen?.(next);
    return next;
  });
}

