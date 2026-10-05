// Public aggregate only. No credentials, visitor identity or download tracking.
export const RELEASES_API = 'https://api.github.com/repos/Loggableim/lastbrowser/releases';
const SOURCE = 'https://github.com/Loggableim/lastbrowser/releases';
const ARTIFACT = /^Lastbrowser-\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?-x64-(setup|portable)\.exe$/;
const FRESH_MS = 5 * 60 * 1000;

export function aggregateDownloads(releases) {
  if (!Array.isArray(releases)) throw new Error('Invalid releases');
  const assets = new Set(), published = new Set();
  let setup = 0, portable = 0;
  for (const release of releases) {
    if (!release || typeof release.draft !== 'boolean') throw new Error('Invalid release');
    if (release.draft) continue;
    if (!Number.isSafeInteger(release.id) || !release.published_at || !Array.isArray(release.assets)) throw new Error('Invalid published release');
    for (const asset of release.assets) {
      const type = typeof asset?.name === 'string' && asset.name.match(ARTIFACT)?.[1];
      if (!type) continue; // Exclude source archives, metadata and unrelated executables.
      if (!Number.isSafeInteger(asset.id) || asset.state !== 'uploaded' || !Number.isSafeInteger(asset.download_count) || asset.download_count < 0) throw new Error('Invalid artifact count');
      if (assets.has(asset.id)) throw new Error('Duplicate artifact across release pages');
      assets.add(asset.id); published.add(release.id);
      if (type === 'setup') setup += asset.download_count; else portable += asset.download_count;
      if (!Number.isSafeInteger(setup + portable)) throw new Error('Count overflow');
    }
  }
  if (!assets.size) throw new Error('No public advertised artifacts');
  return { total: setup + portable, setup, portable, releaseCount: published.size, assetCount: assets.size };
}

function retryTime(response, now) {
  const retry = Number(response.headers.get('retry-after'));
  const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
  return Math.max(now + FRESH_MS, Number.isFinite(retry) ? now + retry * 1000 : 0,
    response.headers.get('x-ratelimit-remaining') === '0' && Number.isFinite(reset) ? reset : 0);
}

export async function collectDownloads(fetcher = fetch, now = Date.now()) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const releases = [];
  try {
    for (let page = 1; page <= 10; page++) {
      const response = await fetcher(`${RELEASES_API}?per_page=100&page=${page}`, {
        headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28',
          'user-agent': 'Lastbrowser-Public-Download-Count' }, signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error('Public count unavailable');
        error.retryAt = retryTime(response, now);
        throw error;
      }
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length > 100) throw new Error('Invalid release page');
      releases.push(...rows);
      const hasNext = /;\s*rel="next"/.test(response.headers.get('link') || '');
      if (!hasNext) return aggregateDownloads(releases);
      if (page === 10) throw new Error('Complete release history exceeds safe request bound');
    }
  } finally { clearTimeout(timer); }
}

export function isCountSnapshot(value) {
  return value?.schemaVersion === 1 && ['ready', 'stale', 'unavailable'].includes(value.status)
    && value.source === SOURCE && Number.isFinite(Date.parse(value.retryAt))
    && (value.status === 'unavailable' ? value.counts === null && value.observedAt === null
      : Number.isFinite(Date.parse(value.observedAt)) && value.counts
        && ['total', 'setup', 'portable', 'releaseCount', 'assetCount'].every(key => Number.isSafeInteger(value.counts[key]) && value.counts[key] >= 0)
        && value.counts.total === value.counts.setup + value.counts.portable && value.counts.assetCount > 0);
}

function responseFor(value, cache = false) {
  return new Response(JSON.stringify(value), { status: cache || value.status !== 'unavailable' ? 200 : 503,
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex', 'cache-control': cache ? 'public, max-age=86400' : 'public, max-age=60' } });
}

export function createDownloadCountHandler({ fetcher = fetch, now = Date.now, getCache = () => globalThis.caches?.default } = {}) {
  const pending = new Map();
  return async context => {
    // Ignore client query/header values; never forward IP, cookies or referrer.
    const key = new Request(new URL('/api/download-count?cache=v1', context.request.url));
    const cache = getCache();
    let previous = null;
    try {
      const response = await cache?.match(key);
      const data = response && await response.json();
      if (isCountSnapshot(data)) previous = data;
    } catch { /* Cache failure still permits a bounded public query. */ }
    const time = now();
    if (previous && (Date.parse(previous.retryAt) > time ||
      previous.status === 'ready' && time - Date.parse(previous.observedAt) < FRESH_MS)) return responseFor(previous);
    if (!pending.has(key.url)) {
      pending.set(key.url, (async () => {
        let value;
        try {
          const counts = await collectDownloads(fetcher, time);
          value = { schemaVersion: 1, status: 'ready', source: SOURCE, counts,
            observedAt: new Date(now()).toISOString(), retryAt: new Date(now() + FRESH_MS).toISOString() };
        } catch (error) {
          value = { schemaVersion: 1, status: previous?.counts ? 'stale' : 'unavailable', source: SOURCE,
            counts: previous?.counts || null, observedAt: previous?.observedAt || null,
            retryAt: new Date(Math.max(time + FRESH_MS, error?.retryAt || 0)).toISOString() };
        }
        try { await cache?.put(key, responseFor(value, true)); } catch { /* No telemetry/logging. */ }
        return value;
      })());
    }
    try { return responseFor(await pending.get(key.url)); }
    finally { pending.delete(key.url); }
  };
}

const handler = createDownloadCountHandler();
export const onRequestGet = context => handler(context);
