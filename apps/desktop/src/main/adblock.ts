/**
 * Ad blocking for the browser.
 *
 * Uses @ghostery/adblocker-electron to block ads and trackers in every
 * browser session. The blocker is attached per Electron session, so each
 * browser profile gets its own blocking context.
 *
 * Failure policy: ad blocking must never break browsing. Any error while
 * loading the filter lists is captured in the status and the browser keeps
 * working without blocking.
 */
import { app, ipcMain, type Session } from 'electron';
import { ElectronBlocker } from '@ghostery/adblocker-electron';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Global IPC channels the Ghostery blocker registers. They may only exist once
 * per process, so they must be cleared before attaching another session.
 */
const COSMETIC_IPC_CHANNELS = [
  '@ghostery/adblocker/inject-cosmetic-filters',
  '@ghostery/adblocker/is-mutation-observer-enabled'
];

export type AdblockState = 'idle' | 'loading' | 'ready' | 'error';

export type AdblockStatus = {
  enabled: boolean;
  blockedCount: number;
  state: AdblockState;
  lastError: string | null;
};

export type AdblockController = {
  /** Attach blocking to a session. Idempotent per session. */
  attach(session: Session): Promise<void>;
  getStatus(): AdblockStatus;
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
};

export type AdblockOptions = {
  enabled?: boolean;
  /** Injectable for tests. Defaults to the real ElectronBlocker factory. */
  loadBlocker?: () => Promise<ElectronBlocker>;
};

const CACHE_FILE = 'adblocker-engine.bin';
const CACHE_METADATA_FILE = `${CACHE_FILE}.json`;
export const FILTER_ENGINE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type FilterEngineCacheOptions<T> = {
  cached: T | null;
  cachedAt: number | undefined;
  now: number;
  refresh(): Promise<T>;
  persist(engine: T): Promise<void>;
};

/** Refresh expired filter data without discarding the last usable offline snapshot. */
export async function loadFilterEngineCache<T>(options: FilterEngineCacheOptions<T>): Promise<T> {
  const { cached, cachedAt, now } = options;
  if (cached !== null
    && typeof cachedAt === 'number'
    && Number.isFinite(cachedAt)
    && cachedAt >= 0
    && cachedAt <= now
    && now - cachedAt <= FILTER_ENGINE_CACHE_MAX_AGE_MS) return cached;

  try {
    const refreshed = await options.refresh();
    try {
      await options.persist(refreshed);
    } catch {
      // Keep the refreshed engine active; a later startup can retry persistence.
    }
    return refreshed;
  } catch (error) {
    if (cached !== null) return cached;
    throw error;
  }
}

export const STREAMING_DOMAIN_SUFFIXES = [
  'netflix.com',
  'nflxvideo.net',
  'nflxext.com',
  'nflximg.net',
  'nflxso.net',
  'disneyplus.com',
  'dssott.com',
  'bamgrid.com',
  'disney-plus.net',
  'primevideo.com',
  'aiv-cdn.net',
  'aiv-delivery.net',
  'spotify.com',
  'scdn.co'
];

export function isStreamingUrl(rawUrl?: string): boolean {
  if (!rawUrl) return false;
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    return STREAMING_DOMAIN_SUFFIXES.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
    );
  } catch {
    return false;
  }
}

export function isStreamingRequest(details: { url?: string; initiator?: string; referrer?: string }): boolean {
  return isStreamingUrl(details.url) || isStreamingUrl(details.initiator) || isStreamingUrl(details.referrer);
}

export function patchBlockerForStreaming(instance: unknown): void {
  const blocker = instance as {
    onBeforeRequest?: (details: any, callback: (resp: any) => void) => void;
    onHeadersReceived?: (details: any, callback: (resp: any) => void) => void;
    onInjectCosmeticFilters?: (event: any, url: string, msg?: any) => Promise<void>;
  };

  if (typeof blocker.onBeforeRequest === 'function') {
    const origOnBeforeRequest = blocker.onBeforeRequest.bind(blocker);
    blocker.onBeforeRequest = (details, callback) => {
      if (isStreamingRequest(details)) {
        callback({});
        return;
      }
      origOnBeforeRequest(details, callback);
    };
  }

  if (typeof blocker.onHeadersReceived === 'function') {
    const origOnHeadersReceived = blocker.onHeadersReceived.bind(blocker);
    blocker.onHeadersReceived = (details, callback) => {
      if (isStreamingRequest(details)) {
        callback({});
        return;
      }
      origOnHeadersReceived(details, callback);
    };
  }

  if (typeof blocker.onInjectCosmeticFilters === 'function') {
    const origOnInject = blocker.onInjectCosmeticFilters.bind(blocker);
    blocker.onInjectCosmeticFilters = async (event, url, msg) => {
      if (isStreamingUrl(url)) {
        return;
      }
      return origOnInject(event, url, msg);
    };
  }
}

export function createAdblockController(options: AdblockOptions = {}): AdblockController {
  let enabled = options.enabled !== false;
  let state: AdblockState = 'idle';
  let lastError: string | null = null;
  let blockedCount = 0;
  let blocker: ElectronBlocker | null = null;
  let loadPromise: Promise<ElectronBlocker | null> | null = null;
  const attached = new Set<Session>();

  function status(): AdblockStatus {
    return { enabled, blockedCount, state, lastError };
  }

  function cachePath(): string {
    try {
      return path.join(app.getPath('userData'), CACHE_FILE);
    } catch {
      return '';
    }
  }

  async function loadBlocker(): Promise<ElectronBlocker | null> {
    if (blocker) return blocker;
    if (loadPromise) return loadPromise;

    state = 'loading';
    lastError = null;

    loadPromise = (async () => {
      try {
        const load = options.loadBlocker || defaultLoadBlocker;
        const instance = await load();
        instance.on('request-blocked', () => {
          blockedCount += 1;
        });
        patchBlockerForStreaming(instance);
        blocker = instance;
        state = 'ready';
        return instance;
      } catch (error) {
        state = 'error';
        lastError = error instanceof Error ? error.message : String(error);
        return null;
      } finally {
        loadPromise = null;
      }
    })();

    return loadPromise;
  }

  async function defaultLoadBlocker(): Promise<ElectronBlocker> {
    const file = cachePath();
    let cached: ElectronBlocker | null = null;
    let cachedAt: number | undefined;
    if (file && existsSync(file)) {
      try {
        const serialized = new Uint8Array(await fs.readFile(file));
        cached = ElectronBlocker.deserialize(serialized);
      } catch {
        // Corrupt cache — fall through to a fresh download.
      }
    }

    if (file && cached) {
      try {
        const metadata = JSON.parse(await fs.readFile(path.join(path.dirname(file), CACHE_METADATA_FILE), 'utf8')) as { updatedAt?: unknown };
        if (typeof metadata.updatedAt === 'number') cachedAt = metadata.updatedAt;
      } catch {
        // Cache files written before metadata was introduced are treated as stale.
      }
    }

    return loadFilterEngineCache({
      cached,
      cachedAt,
      now: Date.now(),
      refresh: () => ElectronBlocker.fromPrebuiltAdsAndTracking(fetch),
      persist: async (engine) => {
        if (!file) return;
        await fs.writeFile(file, Buffer.from(engine.serialize()));
        await fs.writeFile(path.join(path.dirname(file), CACHE_METADATA_FILE), JSON.stringify({ updatedAt: Date.now() }));
      }
    });
  }

  async function attach(session: Session): Promise<void> {
    if (attached.has(session)) return;
    attached.add(session);

    const instance = await loadBlocker();
    if (!instance) return;

    try {
      if (enabled) enableBlocking(instance, session);
    } catch (error) {
      state = 'error';
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * The Ghostery blocker registers GLOBAL ipcMain handlers
   * (`@ghostery/adblocker/inject-cosmetic-filters` and
   * `@ghostery/adblocker/is-mutation-observer-enabled`), which may only exist
   * once per process. With multiple browser profiles we attach to several
   * sessions, so we must remove any existing handler before enabling the next
   * session — otherwise Electron throws "Attempted to register a second
   * handler" and blocking dies for every profile.
   */
  function enableBlocking(instance: ElectronBlocker, session: Session): void {
    if (ipcMain) {
      for (const channel of COSMETIC_IPC_CHANNELS) {
        try {
          ipcMain.removeHandler(channel);
        } catch {
          // No handler registered yet — fine.
        }
      }
    }
    instance.enableBlockingInSession(session);
  }

  function setEnabled(next: boolean): void {
    if (next === enabled) return;
    enabled = next;
    if (!blocker) return;
    for (const session of attached) {
      try {
        if (next) enableBlocking(blocker, session);
        else blocker.disableBlockingInSession(session);
      } catch {
        // A session may already be destroyed — ignore.
      }
    }
  }

  return {
    attach,
    getStatus: status,
    setEnabled,
    isEnabled: () => enabled
  };
}
