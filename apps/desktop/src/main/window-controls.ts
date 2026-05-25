export type WindowControlTarget = {
  minimize(): void;
  isMaximized(): boolean;
  maximize(): void;
  unmaximize(): void;
  close(): void;
};

export type WindowControlHandlers = {
  minimize(): void;
  toggleMaximize(): boolean;
  close(): void;
};

export type IpcHandleApi = {
  handle(channel: string, listener: () => unknown): void;
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
    }
  };
}

export function registerWindowControlIpc(ipcMain: IpcHandleApi, getWindow: () => WindowControlTarget | null): void {
  const handlers = createWindowControlHandlers(getWindow);
  ipcMain.handle('lastbrowser:window:minimize', () => handlers.minimize());
  ipcMain.handle('lastbrowser:window:toggleMaximize', () => handlers.toggleMaximize());
  ipcMain.handle('lastbrowser:window:close', () => handlers.close());
}
