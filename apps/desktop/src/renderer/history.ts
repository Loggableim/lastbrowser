export type BrowserVisit = {
  url: string;
  title: string;
  count: number;
  lastVisited: number;
  /** Profile provenance for new visits; legacy entries remain unbound. */
  profileId?: string;
};

export const visitedSitesStorageKey = 'lastbrowser.visitedSites.v1';
/** LocalStorage is only a bounded startup cache; native storage owns full history. */
const startupCacheLimit = 1000;
/** How many entries the start page surfaces. */
export const startPageVisitLimit = 24;

type VisitStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type VisitCacheResult = { cachePersisted: boolean; cached: number; total: number; cacheError?: string };
export type FullHistoryMergeResult = { persisted: true; added: number; updated: number; invalid: number; total: number };
type HistoryBridge = {
  load: (request: { profileId: string }) => Promise<BrowserVisit[]>;
  merge: (request: { profileId: string; entries: BrowserVisit[] }) => Promise<FullHistoryMergeResult>;
  replace: (request: { profileId: string; entries: BrowserVisit[] }) => Promise<{ persisted: true; total: number }>;
};

function nativeHistory(profileId: string): HistoryBridge {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(profileId)) throw new Error('A concrete browser profile is required for history.');
  const bridge = (window.lastbrowser as unknown as { history?: HistoryBridge }).history;
  if (!bridge?.load || !bridge.merge || !bridge.replace) throw new Error('Full browser history storage is unavailable. The import was not saved.');
  return bridge;
}

/** Full native history, never inferred from another profile's cache. */
export async function loadFullVisitedSites(profileId: string): Promise<BrowserVisit[]> {
  const entries = await nativeHistory(profileId).load({ profileId });
  const visits = entries.map(normalizeVisit);
  if (visits.some((entry) => !entry || entry.profileId !== profileId)) throw new Error('Full history contains invalid profile data.');
  return (visits as BrowserVisit[]).sort(compareVisits);
}

/** Native persistence is required before reporting a successful import. */
export async function saveImportedVisitedSites(profileId: string, visits: BrowserVisit[]): Promise<FullHistoryMergeResult & Pick<VisitCacheResult, 'cachePersisted' | 'cacheError'>> {
  const result = await nativeHistory(profileId).merge({ profileId, entries: visits });
  if (result.persisted !== true) throw new Error('Full browser history import was not persisted.');
  const full = await loadFullVisitedSites(profileId);
  let cache: VisitCacheResult;
  try {
    const otherProfiles = loadVisitedSites().filter((entry) => entry.profileId !== profileId);
    cache = saveVisitedSites(window.localStorage, [...full, ...otherProfiles]);
  } catch (error) {
    cache = { cachePersisted: false, cached: 0, total: full.length,
      cacheError: error instanceof Error ? error.message : 'The startup cache is unavailable; full native history was saved.' };
  }
  window.dispatchEvent(new CustomEvent('lastbrowser:history-imported', { detail: { profileId, visits: full } }));
  return { ...result, cachePersisted: cache.cachePersisted, ...(cache.cacheError ? { cacheError: cache.cacheError } : {}) };
}

/** Intentional full-snapshot save, including deletion or clearing a profile. */
export async function saveFullVisitedSites(profileId: string, visits: BrowserVisit[]): Promise<{ persisted: true; total: number }> {
  const result = await nativeHistory(profileId).replace({ profileId, entries: visits });
  if (result.persisted !== true) throw new Error('Full browser history was not persisted.');
  return result;
}

export function loadVisitedSites(storage: VisitStorage = window.localStorage): BrowserVisit[] {
  try {
    const raw = storage.getItem(visitedSitesStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    const entries = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && 'visits' in parsed && Array.isArray(parsed.visits) ? parsed.visits : [];
    return entries
      .map((entry) => normalizeVisit(entry))
      .filter((entry): entry is BrowserVisit => Boolean(entry))
      .sort(compareVisits);
  } catch {
    return [];
  }
}

export function saveVisitedSites(storage: VisitStorage = window.localStorage, visits: BrowserVisit[]): VisitCacheResult {
  const cached = [...visits].sort(compareVisits).slice(0, startupCacheLimit);
  try {
    storage.setItem(visitedSitesStorageKey, JSON.stringify({ schemaVersion: 2, fullHistory: false, total: visits.length, visits: cached }));
    return { cachePersisted: true, cached: cached.length, total: visits.length };
  } catch (error) {
    return { cachePersisted: false, cached: 0, total: visits.length,
      cacheError: error instanceof Error ? error.message : 'The startup history cache could not be saved. Full native history is separate.' };
  }
}

export function recordVisit(
  visits: BrowserVisit[],
  url: string,
  title = '',
  options: { increment?: boolean; profileId?: string } = {}
): BrowserVisit[] {
  if (!isTrackableVisitUrl(url)) return visits;
  const normalized = normalizeVisitUrl(url);
  if (!normalized) return visits;
  const nextTitle = readableVisitTitle(title, normalized);
  const existingIndex = visits.findIndex((entry) => normalizeVisitUrl(entry.url) === normalized && entry.profileId === options.profileId);
  const nextVisit: BrowserVisit = {
    url: normalized,
    ...(options.profileId ? { profileId: options.profileId } : {}),
    title: nextTitle,
    count: existingIndex >= 0
      ? (options.increment === false ? visits[existingIndex].count : visits[existingIndex].count + 1)
      : 1,
    lastVisited: Date.now()
  };

  if (existingIndex < 0) {
    return [nextVisit, ...visits].sort(compareVisits);
  }

  const next = [...visits];
  next[existingIndex] = {
    ...nextVisit,
    count: Math.max(1, nextVisit.count),
    title: betterVisitTitle(nextVisit.title, visits[existingIndex].title)
  };
  return next.sort(compareVisits);
}

export function trackableVisitLabel(url: string): string {
  return readableVisitTitle('', url);
}

/**
 * Filter history by a free-text query, matching title and URL.
 * An empty query returns everything (already sorted by recency).
 */
export function searchVisits(visits: BrowserVisit[], query: string): BrowserVisit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return visits;
  return visits.filter(
    (visit) =>
      visit.title.toLowerCase().includes(needle) || visit.url.toLowerCase().includes(needle)
  );
}

/** Remove a single entry by URL. */
export function removeVisit(visits: BrowserVisit[], url: string, profileId?: string): BrowserVisit[] {
  const target = normalizeVisitUrl(url);
  return visits.filter((visit) => normalizeVisitUrl(visit.url) !== target || profileId !== undefined && visit.profileId !== profileId);
}

/** Group visits by calendar day, newest day first. */
export function groupVisitsByDay(
  visits: BrowserVisit[]
): Array<{ label: string; visits: BrowserVisit[] }> {
  const groups = new Map<string, BrowserVisit[]>();
  const today = new Date();
  const todayKey = dayKey(today);
  const yesterdayKey = dayKey(new Date(today.getTime() - 86_400_000));

  for (const visit of visits) {
    const key = dayKey(new Date(visit.lastVisited));
    const entries = groups.get(key);
    if (entries) entries.push(visit);
    else groups.set(key, [visit]);
  }

  return Array.from(groups.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, entries]) => ({
      label:
        key === todayKey
          ? 'Today'
          : key === yesterdayKey
            ? 'Yesterday'
            : new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long'
              }),
      visits: entries.sort((a, b) => b.lastVisited - a.lastVisited)
    }));
}

function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeVisit(entry: unknown): BrowserVisit | null {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as Partial<BrowserVisit>;
  if (typeof candidate.url !== 'string' || !isTrackableVisitUrl(candidate.url)) return null;
  return {
    url: normalizeVisitUrl(candidate.url),
    ...(typeof candidate.profileId === 'string' && candidate.profileId ? { profileId: candidate.profileId } : {}),
    title: readableVisitTitle(String(candidate.title || ''), candidate.url),
    count: typeof candidate.count === 'number' && Number.isFinite(candidate.count) ? Math.max(1, Math.floor(candidate.count)) : 1,
    lastVisited: typeof candidate.lastVisited === 'number' && Number.isFinite(candidate.lastVisited) ? candidate.lastVisited : Date.now()
  };
}

function isTrackableVisitUrl(url: string): boolean {
  const value = url.trim();
  if (!value || value.startsWith('about:') || value.startsWith('lastbrowser://')) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function normalizeVisitUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.trim().replace(/\/$/, '');
  }
}

function readableVisitTitle(title: string, url: string): string {
  const cleanTitle = title.trim();
  if (cleanTitle && cleanTitle.toLowerCase() !== 'new tab') return cleanTitle;
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
}

function betterVisitTitle(nextTitle: string, currentTitle: string): string {
  if (!currentTitle || currentTitle.toLowerCase() === 'new tab') return nextTitle;
  return currentTitle;
}

function compareVisits(left: BrowserVisit, right: BrowserVisit): number {
  if (left.count !== right.count) return right.count - left.count;
  return right.lastVisited - left.lastVisited;
}
