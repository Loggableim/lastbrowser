/**
 * Serve the renderer over a custom `app://` protocol instead of `file://`.
 *
 * Why this matters: Chromium treats `file://` as an opaque origin, and
 * localStorage there is **not persisted to disk** — writes live in memory for
 * the lifetime of the process. Verified: the LevelDB file under
 * `%APPDATA%/<app>/Local Storage/leveldb/` stopped changing while the app kept
 * writing, and every setting (tabs, bookmarks, history, search engine) was lost
 * on restart while surviving a plain reload.
 *
 * A registered standard scheme with a real origin fixes that: localStorage,
 * IndexedDB and service workers all persist normally.
 */
import { protocol, net } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const appScheme = 'app';
export const appOrigin = `${appScheme}://bundle`;

/**
 * Must run BEFORE `app.whenReady()` — registering a scheme as privileged after
 * the app is ready has no effect on storage partitioning.
 */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: appScheme,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        // Persistent storage (localStorage/IndexedDB) requires a real origin.
        allowServiceWorkers: true,
        corsEnabled: true
      }
    }
  ]);
}

/**
 * Wire the handler. Call after `app.whenReady()`.
 * `rendererDir` is the directory that contains index.html.
 */
export function installAppProtocolHandler(rendererDir: string): void {
  protocol.handle(appScheme, (request) => {
    const url = new URL(request.url);
    // app://bundle/<path> -> <rendererDir>/<path>
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const target = relative ? path.join(rendererDir, relative) : path.join(rendererDir, 'index.html');
    // Refuse to escape the renderer directory.
    const normalizedRoot = path.resolve(rendererDir);
    const normalizedTarget = path.resolve(target);
    if (!normalizedTarget.startsWith(normalizedRoot)) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(normalizedTarget).toString());
  });
}

/** URL the main window should load. */
export function appRendererUrl(): string {
  return `${appOrigin}/index.html`;
}
