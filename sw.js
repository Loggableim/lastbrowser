/* LastBrowser PWA Service Worker — offline cache */
const CACHE = 'lastbrowser-v1';
const PRECACHE = [
  '/',
  '/css/style.css',
  '/css/fonts.css',
  '/img/favicon.svg',
  '/img/icon.svg',
  '/download.html',
  '/docs/guide.html',
  '/docs/features.html'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok && e.request.method === 'GET') {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match('/offline.html')))
  );
});
