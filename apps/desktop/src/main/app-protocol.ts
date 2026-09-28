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

/** Resolve an app asset without allowing encoded paths to escape the renderer root. */
export function resolveAppAssetPath(rendererDir: string, pathname: string): string | null {
  let relativePath: string;
  try {
    relativePath = decodeURIComponent(pathname).replace(/^[/\\]+/, '');
  } catch {
    return null;
  }

  const root = path.resolve(rendererDir);
  const target = path.resolve(root, relativePath || 'index.html');
  const fromRoot = path.relative(root, target);
  if (fromRoot === '..' || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
    return null;
  }
  return target;
}

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
  protocol.handle(appScheme, async (request) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return new Response('Not found', { status: 404 });
    }
    if (url.protocol !== `${appScheme}:` || url.hostname !== 'bundle') {
      return new Response('Not found', { status: 404 });
    }
    const target = resolveAppAssetPath(rendererDir, url.pathname);
    if (!target) return new Response('Not found', { status: 404 });
    const response = await net.fetch(pathToFileURL(target).toString());

    // The document URL stays constant across app updates while the hashed
    // renderer entrypoint changes. Do not let Chromium reuse an older index
    // that still points at bundles removed by a new installation.
    if (path.basename(target).toLowerCase() !== 'index.html') return response;
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    headers.set('Pragma', 'no-cache');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  });
}

/** URL the main window should load. */
export function appRendererUrl(): string {
  return `${appOrigin}/index.html`;
}
