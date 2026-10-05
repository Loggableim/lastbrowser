/* Aggregate public artifact counts from the same-origin API. No click estimates or browser-side source fallback. */
(function () {
  'use strict';
  var labels = {
    de: { title: 'Öffentliche Windows-Downloads', loading: 'Downloadzahl wird geladen…', unavailable: 'Downloadzahl derzeit nicht verfügbar.', stale: 'Letzter bekannter Stand', observed: 'Stand', detail: 'Setup und Portable · alle öffentlichen Releases · keine Installationszahl', source: 'Quelle: öffentliche Release-Downloads', store: 'Microsoft-Store-Downloads sind nicht enthalten.' },
    en: { title: 'Public Windows downloads', loading: 'Loading download count…', unavailable: 'Download count is currently unavailable.', stale: 'Last known count', observed: 'As of', detail: 'Setup and portable · all public releases · not an installation count', source: 'Source: public release downloads', store: 'Microsoft Store downloads are not included.' },
    es: { title: 'Descargas públicas para Windows', loading: 'Cargando el número de descargas…', unavailable: 'El número de descargas no está disponible.', stale: 'Último dato conocido', observed: 'Actualizado', detail: 'Instalador y portable · todas las versiones públicas · no representa instalaciones', source: 'Fuente: descargas de versiones públicas', store: 'No incluye descargas de Microsoft Store.' },
    fr: { title: 'Téléchargements publics pour Windows', loading: 'Chargement du nombre de téléchargements…', unavailable: 'Le nombre de téléchargements est indisponible.', stale: 'Dernier nombre connu', observed: 'Mise à jour', detail: 'Installation et portable · toutes les versions publiques · ne compte pas les installations', source: 'Source : téléchargements des versions publiques', store: 'Les téléchargements du Microsoft Store ne sont pas inclus.' },
    it: { title: 'Download pubblici per Windows', loading: 'Caricamento del numero di download…', unavailable: 'Il numero di download non è disponibile.', stale: 'Ultimo dato noto', observed: 'Aggiornato', detail: 'Installer e portable · tutte le versioni pubbliche · non indica le installazioni', source: 'Fonte: download delle versioni pubbliche', store: 'I download dal Microsoft Store non sono inclusi.' },
    pt: { title: 'Downloads públicos para Windows', loading: 'A carregar o número de downloads…', unavailable: 'O número de downloads está indisponível.', stale: 'Último valor conhecido', observed: 'Atualizado', detail: 'Instalador e portátil · todas as versões públicas · não representa instalações', source: 'Fonte: downloads das versões públicas', store: 'Os downloads da Microsoft Store não estão incluídos.' },
    ja: { title: 'Windows 公開ダウンロード数', loading: 'ダウンロード数を読み込み中…', unavailable: '現在、ダウンロード数を取得できません。', stale: '最後に確認した数', observed: '確認日時', detail: 'インストーラーとポータブル版・すべての公開リリース・インストール数ではありません', source: '出典：公開リリースのダウンロード数', store: 'Microsoft Store のダウンロード数は含まれません。' }
  };

  var SOURCE_URL = 'https://github.com/Loggableim/lastbrowser/releases';
  // v1 could contain client-side click increments and is not an authoritative observation.
  var CACHE_KEY = 'lb_dl_count_cache_v2';
  var CACHE_MS = 4 * 60 * 1000;

  function valid(data) {
    return data && data.schemaVersion === 1 && ['ready', 'stale', 'unavailable'].indexOf(data.status) !== -1
      && data.source === SOURCE_URL
      && (data.status === 'unavailable' ? data.counts === null && data.observedAt === null
        : Number.isFinite(Date.parse(data.observedAt)) && data.counts
          && ['total', 'setup', 'portable', 'assetCount', 'releaseCount'].every(function (key) { return Number.isSafeInteger(data.counts[key]) && data.counts[key] >= 0; })
          && data.counts.total === data.counts.setup + data.counts.portable && data.counts.assetCount > 0);
  }

  function readLocalCache() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      var raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (valid(parsed) && parsed.status !== 'unavailable') return parsed;
    } catch (_) {}
    return null;
  }

  function getFreshLocalCache(data) {
    if (!data || data.status === 'unavailable') return null;
    var age = Date.now() - Date.parse(data.observedAt);
    return age >= 0 && age < CACHE_MS ? data : null;
  }

  function setLocalCache(data) {
    try {
      if (typeof window !== 'undefined' && window.localStorage && valid(data)) {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      }
    } catch (_) {}
  }

  function animateCount(element, start, end, locale, duration) {
    if (typeof window === 'undefined' || !window.requestAnimationFrame || start === end || !duration || duration <= 0) {
      element.textContent = new Intl.NumberFormat(locale).format(end);
      return;
    }
    var startTime = null;
    var range = end - start;
    function frame(ts) {
      if (!startTime) startTime = ts;
      var elapsed = Math.max(0, ts - startTime);
      var progress = duration > 0 ? Math.min(elapsed / duration, 1) : 1;
      var ease = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(start + range * ease);
      element.textContent = new Intl.NumberFormat(locale).format(current);
      if (progress < 1) {
        window.requestAnimationFrame(frame);
      } else {
        element.textContent = new Intl.NumberFormat(locale).format(end);
      }
    }
    window.requestAnimationFrame(frame);
  }

  function render(element, data) {
    var locale = element.getAttribute('data-locale') || (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang) || 'en';
    var text = labels[locale] || labels.en;
    element.replaceChildren();

    var title = document.createElement('span');
    title.className = 'download-counter-title';
    title.textContent = text.title;
    element.append(title);

    var value = document.createElement('strong');
    value.className = 'download-counter-value';

    var totalCount = data && data.status !== 'unavailable' && data.counts ? data.counts.total : null;
    if (totalCount !== null) {
      var prev = element._lbCurrentCount;
      element._lbCurrentCount = totalCount;
      if (typeof prev === 'number' && prev !== totalCount && typeof window !== 'undefined' && window.requestAnimationFrame) {
        animateCount(value, prev, totalCount, locale, 400);
        value.classList.add('tick-up');
        setTimeout(function () { value.classList.remove('tick-up'); }, 500);
      } else if (typeof prev === 'undefined' && typeof window !== 'undefined' && window.requestAnimationFrame) {
        animateCount(value, 0, totalCount, locale, 900);
      } else {
        value.textContent = new Intl.NumberFormat(locale).format(totalCount);
      }
    } else {
      value.textContent = data ? text.unavailable : text.loading;
    }
    element.append(value);

    if (data && data.status !== 'unavailable') {
      var observed = document.createElement('small');
      observed.className = 'download-counter-observed';
      observed.textContent = (data.status === 'stale' ? text.stale : text.observed) + ': ' + new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.observedAt));
      element.append(observed);
    }

    var detail = document.createElement('small');
    detail.className = 'download-counter-detail';
    detail.textContent = text.detail + '. ' + text.store;
    element.append(detail);

    var source = document.createElement('a');
    source.className = 'download-counter-link';
    source.href = SOURCE_URL;
    source.textContent = text.source;
    source.rel = 'noopener noreferrer';
    element.append(source);
  }

  function updateAllRenderedElements(data) {
    if (typeof document === 'undefined') return;
    var elements = Array.from(document.querySelectorAll('[data-download-counter]'));
    elements.forEach(function (element) { render(element, data); });
  }

  async function resolveData() {
    var cached = readLocalCache();
    var freshCache = getFreshLocalCache(cached);
    if (freshCache) return freshCache;

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 12000);
    var data = null;

    try {
      var response = await fetch('/api/download-count', { credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal });
      var contentType = response.headers && typeof response.headers.get === 'function' ? response.headers.get('content-type') : '';
      if (!contentType || contentType.indexOf('text/html') === -1) data = await response.json();
      if (!valid(data) || (!response.ok && data.status !== 'unavailable')) data = null;
    } catch (_) {
      data = null;
    } finally {
      clearTimeout(timer);
    }

    if (valid(data)) {
      if (data.status === 'ready') setLocalCache(data);
      if (data.status === 'unavailable' && cached) return Object.assign({}, cached, { status: 'stale' });
      return data;
    }

    return cached ? Object.assign({}, cached, { status: 'stale' })
      : { schemaVersion: 1, status: 'unavailable', source: SOURCE_URL, counts: null, observedAt: null };
  }

  var pollingActive = false;

  async function updateElements() {
    var data = await resolveData();
    updateAllRenderedElements(data);
  }

  async function start() {
    var elements = Array.from(document.querySelectorAll('[data-download-counter]'));
    if (!elements.length) return;
    elements.forEach(function (element) { render(element, null); });

    var data = await resolveData();
    elements.forEach(function (element) { render(element, data); });

    if (!pollingActive && typeof window !== 'undefined' && typeof document !== 'undefined' && window.location) {
      pollingActive = true;
      setInterval(function () {
        if (document.visibilityState === 'visible') updateElements();
      }, 4 * 60 * 1000);

      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') updateElements();
      });
      window.addEventListener('focus', function () {
        updateElements();
      });
    }
  }

  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    void start();
  }
})();
