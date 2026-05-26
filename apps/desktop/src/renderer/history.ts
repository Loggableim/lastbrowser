export type BrowserVisit = {
  url: string;
  title: string;
  count: number;
  lastVisited: number;
};

export const visitedSitesStorageKey = 'lastbrowser.visitedSites.v1';
const visitLimit = 24;

type VisitStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function loadVisitedSites(storage: VisitStorage = window.localStorage): BrowserVisit[] {
  try {
    const raw = storage.getItem(visitedSitesStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeVisit(entry))
      .filter((entry): entry is BrowserVisit => Boolean(entry))
      .sort(compareVisits)
      .slice(0, visitLimit);
  } catch {
    return [];
  }
}

export function saveVisitedSites(storage: VisitStorage = window.localStorage, visits: BrowserVisit[]): void {
  try {
    storage.setItem(visitedSitesStorageKey, JSON.stringify(visits.slice(0, visitLimit)));
  } catch {
    // Ignore storage failures in restricted renderer contexts.
  }
}

export function recordVisit(
  visits: BrowserVisit[],
  url: string,
  title = '',
  options: { increment?: boolean } = {}
): BrowserVisit[] {
  if (!isTrackableVisitUrl(url)) return visits;
  const normalized = normalizeVisitUrl(url);
  if (!normalized) return visits;
  const nextTitle = readableVisitTitle(title, normalized);
  const existingIndex = visits.findIndex((entry) => normalizeVisitUrl(entry.url) === normalized);
  const nextVisit: BrowserVisit = {
    url: normalized,
    title: nextTitle,
    count: existingIndex >= 0
      ? (options.increment === false ? visits[existingIndex].count : visits[existingIndex].count + 1)
      : 1,
    lastVisited: Date.now()
  };

  if (existingIndex < 0) {
    return [nextVisit, ...visits].sort(compareVisits).slice(0, visitLimit);
  }

  const next = [...visits];
  next[existingIndex] = {
    ...nextVisit,
    count: Math.max(1, nextVisit.count),
    title: betterVisitTitle(nextVisit.title, visits[existingIndex].title)
  };
  return next.sort(compareVisits).slice(0, visitLimit);
}

export function trackableVisitLabel(url: string): string {
  return readableVisitTitle('', url);
}

function normalizeVisit(entry: unknown): BrowserVisit | null {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as Partial<BrowserVisit>;
  if (typeof candidate.url !== 'string' || !isTrackableVisitUrl(candidate.url)) return null;
  return {
    url: normalizeVisitUrl(candidate.url),
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
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeVisitUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
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
