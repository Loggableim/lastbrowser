import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const serverSource = readFileSync(new URL('../functions/api/download-count.js', import.meta.url), 'utf8');
const { aggregateDownloads, collectDownloads, createDownloadCountHandler } = await import(
  'data:text/javascript;base64,' + Buffer.from(serverSource).toString('base64'));
const browserSource = readFileSync(new URL('../assets/js/download-counter.js', import.meta.url), 'utf8');
const stamp = Date.parse('2026-10-04T09:00:00Z');
const asset = (id, type, count) => ({ id, name: `Lastbrowser-0.1.${id}-x64-${type}.exe`, state: 'uploaded', download_count: count });
const release = (id, assets, extra = {}) => ({ id, draft: false, prerelease: false, published_at: '2026-10-03T12:00:00Z', assets, ...extra });
const rows = [release(1, [asset(1, 'setup', 4), asset(2, 'portable', 3)]), release(2, [asset(3, 'setup', 8)], { prerelease: true })];
const result = { total: 15, setup: 12, portable: 3, assetCount: 3, releaseCount: 2 };
const reply = (body, headers = {}, status = 200) => new Response(JSON.stringify(body), { status, headers });
const context = { request: new Request('https://counter.test/api/download-count?visitor=never-forward', {
  headers: { cookie: 'not-forwarded', 'x-forwarded-for': 'not-forwarded' } }) };

function memoryCache() {
  const values = new Map();
  return { async match(request) { return values.get(request.url)?.clone(); },
    async put(request, response) { values.set(request.url, response.clone()); } };
}

test('all public release setup/portable counts, including published beta; metadata and drafts excluded', () => {
  const input = [...rows, release(3, [asset(4, 'setup', 999)], { draft: true }),
    release(4, [{ id: 5, name: 'source.zip', download_count: 999 }])];
  assert.deepEqual(aggregateDownloads(input), result);
});

test('unknown, malformed and duplicated counts never become a plausible total; real zero is valid', () => {
  assert.throws(() => aggregateDownloads([]));
  assert.throws(() => aggregateDownloads([release(1, [asset(1, 'setup', -1)])]));
  assert.throws(() => aggregateDownloads([release(1, [asset(1, 'setup', null)])]));
  assert.throws(() => aggregateDownloads([rows[0], rows[0]]));
  assert.equal(aggregateDownloads([release(1, [asset(1, 'setup', 0)])]).total, 0);
});

test('pagination is complete and upstream receives only anonymous fixed headers', async () => {
  const urls = [];
  const counts = await collectDownloads(async (url, options) => {
    urls.push(url);
    assert.deepEqual(Object.keys(options.headers).sort(), ['accept', 'user-agent', 'x-github-api-version']);
    assert.equal(options.headers.authorization, undefined);
    return urls.length === 1 ? reply([rows[0]], { link: '<https://api.github.com/example?page=2>; rel="next"' }) : reply([rows[1]]);
  });
  assert.deepEqual(counts, result);
  assert.equal(urls.length, 2);
  assert.match(urls[1], /per_page=100&page=2$/);
});

test('later page error rejects partial totals; pagination cap rejects incomplete history', async () => {
  let calls = 0;
  await assert.rejects(collectDownloads(async () => ++calls === 1 ? reply([rows[0]], { link: '<next>; rel="next"' }) : reply({}, {}, 503)));
  calls = 0;
  await assert.rejects(collectDownloads(async () => { calls++; return reply([], { link: '<next>; rel="next"' }); }));
  assert.equal(calls, 10);
});

test('shared fresh cache and concurrent request coalescing avoid per-visitor GitHub requests', async () => {
  const cache = memoryCache(); let calls = 0;
  const handler = createDownloadCountHandler({ now: () => stamp, getCache: () => cache,
    fetcher: async () => { calls++; await new Promise(resolve => setImmediate(resolve)); return reply(rows); } });
  const [a, b] = await Promise.all([handler(context), handler(context)]);
  assert.equal(calls, 1);
  assert.deepEqual((await a.json()).counts, result);
  assert.deepEqual((await b.json()).counts, result);
  await handler({ request: new Request('https://counter.test/api/download-count?different=query') });
  assert.equal(calls, 1);
});

test('source failure retains dated stale count and observes rate-limit reset without retries', async () => {
  const cache = memoryCache(); let time = stamp, fail = false, calls = 0;
  const handler = createDownloadCountHandler({ now: () => time, getCache: () => cache,
    fetcher: async () => { calls++; return fail ? reply({}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String((stamp + 3600000) / 1000) }, 403) : reply(rows); } });
  const initial = await (await handler(context)).json();
  time += 6 * 60000; fail = true;
  const stale = await (await handler(context)).json();
  assert.equal(stale.status, 'stale'); assert.equal(stale.observedAt, initial.observedAt);
  assert.deepEqual(stale.counts, result);
  assert.equal(Date.parse(stale.retryAt), stamp + 3600000);
  await handler(context); assert.equal(calls, 2);
});

test('cold rate-limit/source failure is unavailable with null count, cached backoff and no guessed zero', async () => {
  const cache = memoryCache(); let calls = 0;
  const handler = createDownloadCountHandler({ now: () => stamp, getCache: () => cache,
    fetcher: async () => { calls++; return reply({}, { 'retry-after': '900' }, 429); } });
  const response = await handler(context), data = await response.json();
  assert.equal(response.status, 503); assert.equal(data.status, 'unavailable');
  assert.equal(data.counts, null); assert.equal(data.observedAt, null);
  assert.equal(Date.parse(data.retryAt), stamp + 900000);
  await handler(context); assert.equal(calls, 1);
});

class Element {
  constructor(locale) { this.locale = locale; this.children = []; this.textContent = ''; }
  getAttribute() { return this.locale; }
  replaceChildren() { this.children = []; }
  append(...elements) { this.children.push(...elements); }
}
async function renderBrowser(data, status = 200, locales = ['de', 'en', 'es', 'fr', 'it', 'pt', 'ja'], options = {}) {
  const elements = locales.map(locale => new Element(locale)); const calls = []; const listeners = {};
  const storageValues = options.storage || new Map();
  const localStorage = { getItem: key => storageValues.get(key) ?? null, setItem: (key, value) => storageValues.set(key, value) };
  const document = { readyState: 'complete', documentElement: { lang: 'en' },
    querySelectorAll: () => elements, createElement: () => new Element(),
    addEventListener: (name, handler) => { listeners[name] = handler; } };
  const fetcher = options.fetcher
    ? async (url, fetchOptions) => { calls.push(url); return options.fetcher(url, fetchOptions); }
    : async (url, fetchOptions) => {
    calls.push(url); assert.equal(url, '/api/download-count');
    assert.equal(fetchOptions.credentials, 'omit'); assert.equal(fetchOptions.referrerPolicy, 'no-referrer');
    return reply(data, {}, status);
  };
  vm.runInNewContext(browserSource, { document,
    window: { localStorage, location: { origin: 'https://counter.test' }, addEventListener: (name, handler) => { listeners[`window:${name}`] = handler; } },
    fetch: fetcher, Intl, Date, AbortController, setTimeout, clearTimeout, setInterval: () => 1 });
  for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve));
  return { elements, calls, listeners, storage: storageValues };
}
function text(element) { return element.children.map(child => child.textContent).join(' '); }

test('every locale renders formatted actual count, source/date and exclusion; only one fetch for all widgets', async () => {
  const { elements, calls } = await renderBrowser({ schemaVersion: 1, status: 'ready', counts: result,
    source: 'https://github.com/Loggableim/lastbrowser/releases', observedAt: new Date(stamp).toISOString() });
  assert.equal(calls.length, 1);
  for (const element of elements) {
    assert.equal(element.children[1].textContent, new Intl.NumberFormat(element.locale).format(15));
    assert.match(text(element), /Microsoft/);
    assert.equal(element.children.at(-1).href, 'https://github.com/Loggableim/lastbrowser/releases');
    assert.ok(element.children[2].textContent.length > 10);
  }
});

test('HTML fallback/malformed data cannot show count; every locale has an unavailable state', async () => {
  const { elements } = await renderBrowser({ counts: { total: 0 } });
  for (const element of elements) assert.notEqual(element.children[1].textContent, '0');
  const cold = await renderBrowser({ schemaVersion: 1, status: 'unavailable', counts: null, observedAt: null,
    source: 'https://github.com/Loggableim/lastbrowser/releases' }, 503);
  assert.deepEqual(cold.elements.map(text), elements.map(text));
});

test('stale count exposes last-known status in each locale without changing the observation date', async () => {
  const snapshot = { schemaVersion: 1, counts: result, source: 'https://github.com/Loggableim/lastbrowser/releases', observedAt: new Date(stamp).toISOString() };
  const ready = await renderBrowser({ ...snapshot, status: 'ready' });
  const stale = await renderBrowser({ ...snapshot, status: 'stale' });
  stale.elements.forEach((element, index) => {
    assert.notEqual(element.children[2].textContent, ready.elements[index].children[2].textContent);
    assert.equal(element.children[1].textContent, ready.elements[index].children[1].textContent);
  });
});

test('repeated setup and portable link clicks never change authoritative totals or create a local estimate', async () => {
  const snapshot = { schemaVersion: 1, status: 'ready', counts: result,
    source: 'https://github.com/Loggableim/lastbrowser/releases', observedAt: new Date().toISOString() };
  const rendered = await renderBrowser(snapshot, 200, ['en']);
  const before = text(rendered.elements[0]);
  const storedBefore = rendered.storage.get('lb_dl_count_cache_v2');
  const setup = { tagName: 'A', href: 'https://github.com/Loggableim/lastbrowser/releases/download/v/setup.exe' };
  const portable = { tagName: 'A', href: 'https://github.com/Loggableim/lastbrowser/releases/download/v/portable.exe' };
  for (let i = 0; i < 2; i++) {
    rendered.listeners.click?.({ target: setup });
    rendered.listeners.click?.({ target: portable });
  }
  assert.equal(text(rendered.elements[0]), before);
  assert.equal(rendered.storage.get('lb_dl_count_cache_v2'), storedBefore);
  assert.equal(rendered.storage.has('lb_user_downloads_v1'), false);
  assert.deepEqual(rendered.calls, ['/api/download-count']);
  assert.equal(rendered.listeners.click, undefined);
});

test('fresh browser cache avoids requests; failed same-origin refresh shows dated stale cache without a GitHub fallback', async () => {
  const snapshot = { schemaVersion: 1, status: 'ready', counts: result,
    source: 'https://github.com/Loggableim/lastbrowser/releases', observedAt: new Date().toISOString() };
  const freshStorage = new Map([['lb_dl_count_cache_v2', JSON.stringify(snapshot)]]);
  const fresh = await renderBrowser(null, 200, ['en'], { storage: freshStorage,
    fetcher: async url => { throw new Error(`Unexpected request: ${url}`); } });
  assert.equal(fresh.calls.length, 0);
  assert.equal(fresh.elements[0].children[1].textContent, '15');

  const oldSnapshot = { ...snapshot, observedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() };
  const staleStorage = new Map([['lb_dl_count_cache_v2', JSON.stringify(oldSnapshot)]]);
  const urls = [];
  const stale = await renderBrowser(null, 200, ['en'], { storage: staleStorage, fetcher: async url => {
    urls.push(url); throw new Error('offline');
  } });
  assert.deepEqual(urls, ['/api/download-count']);
  assert.equal(stale.elements[0].children[1].textContent, '15');
  assert.match(text(stale.elements[0]), /Last known count/);
  const observed = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(oldSnapshot.observedAt));
  assert.ok(stale.elements[0].children[2].textContent.includes(observed));
});

test('legacy v1 cache with a plausible click-inflated total is discarded', async () => {
  const inflated = { schemaVersion: 1, status: 'ready',
    counts: { total: 18, setup: 15, portable: 3, assetCount: 3, releaseCount: 2 },
    source: 'https://github.com/Loggableim/lastbrowser/releases', observedAt: new Date().toISOString() };
  const storage = new Map([['lb_dl_count_cache_v1', JSON.stringify(inflated)]]);
  const rendered = await renderBrowser(null, 200, ['en'], { storage,
    fetcher: async url => { throw new Error(`Same-origin endpoint unavailable: ${url}`); } });
  assert.match(text(rendered.elements[0]), /currently unavailable/);
  assert.doesNotMatch(text(rendered.elements[0]), /18/);
  assert.equal(rendered.storage.has('lb_dl_count_cache_v2'), false);
  assert.deepEqual(rendered.calls, ['/api/download-count']);
});

test('same-origin unavailable or network failure without cache remains unavailable and never contacts GitHub', async () => {
  const urls = [];
  const unavailable = await renderBrowser({ schemaVersion: 1, status: 'unavailable', counts: null, observedAt: null,
    source: 'https://github.com/Loggableim/lastbrowser/releases' }, 503, ['en'], { fetcher: async url => {
    urls.push(url); return reply({ schemaVersion: 1, status: 'unavailable', counts: null, observedAt: null,
      source: 'https://github.com/Loggableim/lastbrowser/releases' }, {}, 503);
  } });
  assert.match(text(unavailable.elements[0]), /currently unavailable/);
  const offline = await renderBrowser(null, 200, ['en'], { fetcher: async url => { urls.push(url); throw new Error('offline'); } });
  assert.match(text(offline.elements[0]), /currently unavailable/);
  assert.deepEqual(urls, ['/api/download-count', '/api/download-count']);
});

test('all fourteen landing/download pages mount localized counter and same-origin assets', () => {
  for (const locale of ['de', 'en', 'es', 'fr', 'it', 'pt', 'ja']) for (const page of ['index.html', 'download/index.html']) {
    const file = new URL(`../${locale === 'de' ? '' : locale + '/'}${page}`, import.meta.url);
    const html = readFileSync(file, 'utf8');
    assert.equal((html.match(/data-download-counter/g) || []).length, 1);
    assert.ok(html.includes(`data-locale="${locale}"`));
    assert.ok(html.includes('/assets/js/download-counter.js'));
    assert.ok(html.includes('/assets/css/download-counter.css'));
  }
});
