export type BrowserDataCleanupOptions = {
  cache?: boolean;
  cookies?: boolean;
  storage?: boolean;
};

export type BrowserDataSession = {
  clearCache?: () => Promise<void>;
  clearStorageData?: (options?: { storages?: BrowserStorageType[] }) => Promise<void>;
};

type BrowserStorageType = 'cookies' | 'localstorage' | 'cachestorage' | 'indexdb' | 'websql' | 'serviceworkers';

export type BrowserDataCleanupResult = {
  ok: boolean;
  clearedSessions: number;
  failedSessions: number;
  error?: string;
};

type IpcHandleApi = {
  handle(channel: string, listener: (event: unknown, options?: unknown) => unknown): void;
};

const CHANNEL = 'lastbrowser:browser:clearData';

/** Try every selected cleanup operation for every session and report partial failures. */
export async function clearBrowserData(
  sessions: Iterable<BrowserDataSession>,
  rawOptions?: unknown
): Promise<BrowserDataCleanupResult> {
  const source = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions)
    ? rawOptions as BrowserDataCleanupOptions
    : {};
  const options = {
    cache: source.cache !== false,
    cookies: source.cookies !== false,
    storage: source.storage !== false
  };
  const storages: BrowserStorageType[] = [];
  if (options.cookies) storages.push('cookies');
  if (options.storage) storages.push('localstorage', 'cachestorage', 'indexdb', 'websql', 'serviceworkers');
  if (!options.cache && storages.length === 0) {
    return { ok: true, clearedSessions: 0, failedSessions: 0 };
  }

  let clearedSessions = 0;
  let failedSessions = 0;
  for (const session of sessions) {
    let failed = false;
    if (options.cache) {
      if (typeof session.clearCache !== 'function') failed = true;
      else {
        try { await session.clearCache(); } catch { failed = true; }
      }
    }
    if (storages.length > 0) {
      if (typeof session.clearStorageData !== 'function') failed = true;
      else {
        try { await session.clearStorageData({ storages }); } catch { failed = true; }
      }
    }
    if (failed) failedSessions += 1;
    else clearedSessions += 1;
  }

  return failedSessions === 0
    ? { ok: true, clearedSessions, failedSessions }
    : {
        ok: false,
        clearedSessions,
        failedSessions,
        error: `Could not clear browser data in ${failedSessions} of ${clearedSessions + failedSessions} browser session(s).`
      };
}

/** Register the production IPC path separately so its result contract stays regression-tested. */
export function registerBrowserDataCleanupIpc(
  ipcMain: IpcHandleApi,
  getSessions: () => Iterable<BrowserDataSession>
): void {
  ipcMain.handle(CHANNEL, (_event, options) => clearBrowserData(getSessions(), options));
}
