import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { loadActiveSpaceConfiguration } from './active-space-config.js';
import { protectedSpaceLinkAck } from './protected-space-process.js';
import { extractUrlFromArgs } from './url-dispatch.js';
import { createWindowsProtectedSpaceBroker } from './windows-protected-space-broker.js';
import { resolveWindowsSpaceRuntime } from './windows-space-runtime.js';

const unlockChannel = 'lastbrowser:unlock-protected-space';

function unlockPage(german: boolean): string {
  const title = german ? 'Space entsperren' : 'Unlock Space';
  const label = german ? 'Passwort' : 'Password';
  const button = german ? 'Entsperren' : 'Unlock';
  const failure = german ? 'Der Space konnte nicht entsperrt werden.' : 'Could not unlock the Space.';
  return `<!doctype html><html lang="${german ? 'de' : 'en'}"><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">
    <title>LastBrowser</title><style>
    :root { color-scheme: light dark; font: 16px "Segoe UI", sans-serif; }
    body { margin: 24px; } h1 { margin-top: 0; font-size: 22px; } label { display: block; }
    input, button { font: inherit; padding: 8px; box-sizing: border-box; } input { width: 100%; margin: 6px 0 12px; }
    p { font-size: 14px; }
    </style><h1>${title}</h1><form autocomplete="off"><label for="password">${label}</label>
    <input id="password" type="password" maxlength="4096" required autofocus autocomplete="off" spellcheck="false">
    <button type="submit">${button}</button><p role="status" data-failure="${failure}"></p></form></html>`;
}

/** Own the unlock window and vault lifecycle without importing the ordinary browser. */
export async function startWindowsProtectedSpace(pair: string): Promise<void> {
  if (['remote-debugging-port', 'remote-debugging-pipe', 'remote-debugging-address', 'no-sandbox']
    .some(name => app.commandLine.hasSwitch(name))) throw new Error('Incompatible LastBrowser startup flags');
  const configuration = await loadActiveSpaceConfiguration(pair);
  const parent = path.dirname(configuration.root);
  const launcherProfile = path.join(parent, '.launcher');
  mkdirSync(launcherProfile, { recursive: true });
  if (!lstatSync(launcherProfile).isDirectory() || path.relative(launcherProfile, realpathSync(launcherProfile))) {
    throw new Error('The protected launcher directory is redirected');
  }
  app.setName('Lastbrowser');
  app.setPath('userData', launcherProfile);
  app.setPath('sessionData', launcherProfile);
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  // Keep OS activations in memory until a mounted browser can receive them.
  const pendingUrls: string[] = [];
  let browser: { input: Writable; awaitingAck: boolean } | undefined;
  let unlockWindow: BrowserWindow | undefined;
  function sendNextLink() {
    if (!browser?.input.writable || browser.awaitingAck || pendingUrls.length === 0) return;
    browser.awaitingAck = true;
    browser.input.write(JSON.stringify(pendingUrls[0]) + '\n');
  }
  const forwardLinks = (args: string[]) => {
    const url = extractUrlFromArgs(args);
    if (!url || !/^(?:https?|file):\/\//i.test(url)) return;
    if (pendingUrls.length < 32) pendingUrls.push(url);
    sendNextLink();
  };
  forwardLinks(process.argv);
  app.on('second-instance', (_event, args) => {
    forwardLinks(args);
    if (unlockWindow && !unlockWindow.isDestroyed() && unlockWindow.isVisible()) unlockWindow.focus();
  });

  const runtime = resolveWindowsSpaceRuntime(process.resourcesPath);

  void app.whenReady().then(() => showUnlockWindow({
    ...configuration, ...runtime,
    executable: process.execPath,
    browserArgs: app.isPackaged ? [] : [app.getAppPath()],
    onBrowserStarted(input, acknowledgements) {
      const connection = { input, awaitingAck: false };
      browser = connection;
      const reader = createInterface({ input: acknowledgements, crlfDelay: Infinity });
      reader.on('line', line => {
        if (browser !== connection || !connection.awaitingAck || line !== protectedSpaceLinkAck) return;
        pendingUrls.shift();
        connection.awaitingAck = false;
        sendNextLink();
      });
      reader.on('error', () => reader.close());
      reader.once('close', () => { if (browser === connection) browser = undefined; });
      sendNextLink();
    },
    async lockPrimary() {
      if (existsSync(runtime.drive)) throw new Error('A protected drive is still mounted');
    }
  }, window => { unlockWindow = window; }, () => pendingUrls.length > 0)).catch(() => {
    dialog.showErrorBox('LastBrowser', app.getLocale().startsWith('de')
      ? 'Der geschützte Space konnte nicht gestartet werden.'
      : 'The protected Space could not start.');
    app.exit(1);
  });
}

async function showUnlockWindow(
  options: Parameters<typeof createWindowsProtectedSpaceBroker>[0],
  onWindowCreated: (window: BrowserWindow) => void,
  hasPendingLinks: () => boolean
): Promise<void> {
  const window = new BrowserWindow({
    title: 'LastBrowser',
    width: 420,
    height: 275,
    resizable: false,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: fileURLToPath(new URL('./protected-space-unlock-preload.cjs', import.meta.url)),
      partition: 'lastbrowser-protected-unlock',
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: false,
      spellcheck: false
    }
  });
  onWindowCreated(window);
  window.removeMenu();
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  let password: Uint8Array | undefined;
  const unlock = createWindowsProtectedSpaceBroker({
    ...options,
    onMounted() {
      password?.fill(0);
      password = undefined;
      if (!window.isDestroyed()) window.hide();
    }
  });

  let busy = false;
  window.on('close', event => { if (busy) event.preventDefault(); });
  window.on('closed', () => {
    ipcMain.removeHandler(unlockChannel);
    app.quit();
  });
  ipcMain.handle(unlockChannel, async (event, supplied: unknown) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
      || busy || !(supplied instanceof Uint8Array) || !supplied.length || supplied.length > 4096) return false;
    busy = true;
    password = supplied;
    let okay = false;
    try {
      okay = await unlock(supplied);
      return okay;
    } catch {
      return false;
    } finally {
      supplied.fill(0);
      password = undefined;
      busy = false;
      if (okay && !hasPendingLinks()) app.quit();
      else if (!window.isDestroyed()) window.show();
    }
  });
  window.once('ready-to-show', () => window.show());
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(unlockPage(app.getLocale().startsWith('de')))}`);
}
