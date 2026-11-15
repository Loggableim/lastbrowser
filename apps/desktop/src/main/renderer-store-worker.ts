import { app, BrowserWindow, protocol, session } from 'electron';
import { createReadStream, lstatSync, realpathSync, write } from 'node:fs';
import path from 'node:path';
import { appOrigin, appScheme } from './app-protocol.js';
import { encodeRendererStoreSnapshot, readRendererStoreSnapshot } from './renderer-store-worker-client.js';

/** The worker uses the same storage origin but serves a blank document. */
export async function runRendererStoreWorker(mode: string): Promise<void> {
  if (mode !== 'read' && mode !== 'build') throw new Error('Invalid renderer store operation');
  if (['remote-debugging-port', 'remote-debugging-pipe', 'remote-debugging-address', 'no-sandbox']
    .some(name => app.commandLine.hasSwitch(name))) throw new Error('Invalid renderer store worker switches');
  const profile = app.commandLine.getSwitchValue('user-data-dir');
  if (!path.isAbsolute(profile) || !lstatSync(profile).isDirectory() || path.relative(profile, realpathSync(profile))) {
    throw new Error('Invalid renderer store profile');
  }
  const storage = path.join(profile, 'Local Storage');
  const database = path.join(storage, 'leveldb');
  for (const directory of [storage, database]) {
    const entry = lstatSync(directory, { throwIfNoEntry: false });
    if (entry && (!entry.isDirectory() || path.relative(directory, realpathSync(directory)))) {
      throw new Error('The renderer store path is redirected');
    }
  }
  if (mode === 'build' && lstatSync(database, { throwIfNoEntry: false })) {
    throw new Error('The new renderer store must be empty');
  }
  app.setPath('userData', profile);
  app.setPath('sessionData', profile);
  if (!app.requestSingleInstanceLock()) throw new Error('The renderer store profile is already in use');
  protocol.registerSchemesAsPrivileged([{ scheme: appScheme, privileges: { standard: true, secure: true } }]);
  const values = mode === 'build'
    ? await readRendererStoreSnapshot(createReadStream('', { fd: 0, autoClose: false }))
    : undefined;
  await app.whenReady();
  const document = `${appOrigin}/migration`;
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: details.url !== document && details.url !== 'about:blank' });
  });
  protocol.handle(appScheme, request => request.url === document
    ? new Response('<!doctype html><meta charset="utf-8">', { headers: {
      'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'none'", 'Cache-Control': 'no-store'
    } })
    : new Response('', { status: 404 }));
  const window = new BrowserWindow({ show: false, webPreferences: {
    sandbox: true, contextIsolation: true, nodeIntegration: false
  } });
  try {
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    await window.loadURL('about:blank');
    window.webContents.debugger.attach();
    await window.webContents.debugger.sendCommand('Network.setBypassServiceWorker', { bypass: true });
    await window.loadURL(document);
    if (values) {
      const entries = Object.entries(values);
      await window.webContents.executeJavaScript(`
        if (localStorage.length) throw new Error('The new renderer store must be empty');
        for (const [key, value] of ${JSON.stringify(entries)}) localStorage.setItem(key, value);
        if (localStorage.length === 0) {
          localStorage.setItem('lastbrowser.renderer-migration', '');
          localStorage.removeItem('lastbrowser.renderer-migration');
        }
      `);
      session.defaultSession.flushStorageData();
    } else {
      const snapshot = await window.webContents.executeJavaScript(
        'Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]))'
      );
      const response = encodeRendererStoreSnapshot(snapshot);
      try {
        let offset = 0;
        while (offset < response.length) {
          offset += await new Promise<number>((resolve, reject) =>
            write(1, response, offset, response.length - offset, null,
              (error, count) => error ? reject(error) : resolve(count)));
        }
      } finally {
        response.fill(0);
      }
    }
  } finally {
    window.destroy();
  }
  app.quit();
}
