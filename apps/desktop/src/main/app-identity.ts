/**
 * Windows groups taskbar buttons by AppUserModelID. The packaged installer
 * creates shortcuts with the electron-builder appId, so the runtime process
 * must advertise the same id before `app.whenReady()`; otherwise Windows falls
 * back to the generic Electron icon and taskbar grouping.
 */
export const LASTBROWSER_APP_USER_MODEL_ID = 'com.lastbrowser.desktop';

export type AppUserModelApi = {
  setAppUserModelId?(id: string): void;
};

export function applyAppUserModelId(api: AppUserModelApi): void {
  api.setAppUserModelId?.(LASTBROWSER_APP_USER_MODEL_ID);
}
