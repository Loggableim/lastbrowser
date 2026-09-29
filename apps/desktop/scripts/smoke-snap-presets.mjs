/**
 * Focused live Snap Layout preset smoke for the local Lastbrowser source build.
 *
 * This test always starts this repository's Electron binary with a fresh,
 * isolated temporary profile and a private local HTTP fixture. It never
 * attaches to an existing CDP endpoint or the installed Lastbrowser app.
 *
 * Run after `npm --workspace apps/desktop run build`:
 *   node apps/desktop/scripts/smoke-snap-presets.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { createServer } from 'node:http';

const SCRIPT_DIR = import.meta.dirname;
const DESKTOP_DIR = path.resolve(SCRIPT_DIR, '..');
const REPO_DIR = path.resolve(DESKTOP_DIR, '..', '..');
const ELECTRON_EXE = path.join(REPO_DIR, 'node_modules', 'electron', 'dist', 'electron.exe');
const MAIN_ENTRY = path.join(DESKTOP_DIR, 'dist', 'main', 'main.js');
const PROFILE_PREFIX = 'lastbrowser-snap-presets-';
const PROFILE_DIR = mkdtempSync(path.join(os.tmpdir(), PROFILE_PREFIX));
const FIXTURE_PORT = 0;
const PRESETS = [
  { layout: 'dual-66-33', slot: 0, left: 0, width: 66.67 },
  { layout: 'dual-33-66', slot: 1, left: 33.33, width: 66.67 },
  { layout: 'dual-75-25', slot: 0, left: 0, width: 75 },
  { layout: 'dual-25-75', slot: 1, left: 25, width: 75 }
];

let child = null;
let cdp = null;
let fixture = null;
let fixtureOrigin = '';
let cdpPort = 0;
const results = [];
const rendererErrors = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`  ${passed ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('Could not allocate CDP port'));
      const { port } = address;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function startFixture() {
  fixture = createServer((request, response) => {
    const slug = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname.split('/').filter(Boolean).at(-1) || 'home');
    if (!/^tab-[123]$/.test(slug)) {
      response.writeHead(404).end('not found');
      return;
    }
    const title = `Snap preset fixture ${slug}`;
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    response.end(`<!doctype html><html><head><title>${title}</title></head><body><main>${title}</main></body></html>`);
  });
  await new Promise((resolve, reject) => {
    fixture.once('error', reject);
    fixture.listen(FIXTURE_PORT, '127.0.0.1', resolve);
  });
  const address = fixture.address();
  if (!address || typeof address === 'string') throw new Error('Local Snap fixture did not start');
  fixtureOrigin = `http://127.0.0.1:${address.port}`;
}

async function listTargets() {
  const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
  if (!response.ok) throw new Error(`CDP target request failed: ${response.status}`);
  return response.json();
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = () => reject(new Error('Could not connect to isolated Electron CDP target'));
    });
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        rendererErrors.push(details?.exception?.description || details?.text || 'renderer exception');
      }
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
        else pending.resolve(message.result);
      }
    };
  }

  async send(method, params = {}, timeoutMs = 12000) {
    await this.ready;
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Runtime.evaluate failed');
    }
    return response.result?.value;
  }

  close() {
    try { this.ws.close(); } catch { /* socket may already be closed */ }
  }
}

async function waitFor(label, probe, timeoutMs = 12000, intervalMs = 120) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await probe();
    if (lastValue) return lastValue;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}; last value=${JSON.stringify(lastValue)}`);
}

async function moveMouse(point) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
}

async function pressMouse(point) {
  await moveMouse(point);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1
  });
}

async function moveHeldMouse(from, to, steps = 14) {
  for (let step = 1; step <= steps; step++) {
    const fraction = step / steps;
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: from.x + (to.x - from.x) * fraction,
      y: from.y + (to.y - from.y) * fraction,
      button: 'left',
      buttons: 1
    });
    await sleep(20);
  }
}

async function releaseMouse(point) {
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1
  });
}

async function evaluateJson(expression) {
  const value = await cdp.evaluate(`JSON.stringify(${expression})`);
  return JSON.parse(value || 'null');
}

async function ensureBrowserChrome() {
  await waitFor('first-run or browser chrome', async () => cdp.evaluate(`JSON.stringify({
    firstRun: Boolean(document.querySelector('[role="dialog"][aria-label="First-run setup"]')),
    address: Boolean(document.querySelector('.addressbar input')),
    tabs: document.querySelectorAll('.vertical-tab-item').length
  })`).then((value) => {
    const state = JSON.parse(value || '{}');
    return state.firstRun || (state.address && state.tabs > 0) ? state : null;
  }), 25000);

  const firstRun = await cdp.evaluate(`Boolean(document.querySelector('[role="dialog"][aria-label="First-run setup"]'))`);
  if (firstRun) {
    await cdp.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((item) => /erstmal ohne|ohne ki|dismiss|skip/i.test(item.innerText || ''));
      button?.click();
      return Boolean(button);
    })()`);
  }

  await waitFor('address bar after first-run', () => cdp.evaluate(`Boolean(document.querySelector('.addressbar-container input'))`), 25000);

  let chrome = await evaluateJson(`({
    tabCount: document.querySelectorAll('.vertical-tab-item').length,
    newTab: Boolean(document.querySelector('.vertical-new-tab-btn'))
  })`);
  if (!chrome.newTab) {
    await cdp.evaluate(`document.querySelector('.nova-dock .toggle-expand-btn, .modern-titlebar .sidebar-toggle')?.click()`);
    chrome = await waitFor('expanded sidebar tabs', () => evaluateJson(`({
      tabCount: document.querySelectorAll('.vertical-tab-item').length,
      newTab: Boolean(document.querySelector('.vertical-new-tab-btn'))
    })`).then((state) => state.newTab ? state : null));
  }

  chrome = await waitFor('visible sidebar tab list', () => evaluateJson(`({
    tabCount: document.querySelectorAll('.vertical-tab-item').length,
    newTab: Boolean(document.querySelector('.vertical-new-tab-btn'))
  })`).then((state) => state.tabCount > 0 ? state : null), 10000);

  while (chrome.tabCount < 3) {
    const previousCount = chrome.tabCount;
    await cdp.evaluate(`document.querySelector('.vertical-new-tab-btn')?.click()`);
    chrome = await waitFor('new tab', () => evaluateJson(`({ tabCount: document.querySelectorAll('.vertical-tab-item').length })`)
      .then((state) => state.tabCount > previousCount ? state : null), 8000);
  }
}

async function navigateTab(index, slug) {
  const clicked = await cdp.evaluate(`(() => {
    const tab = document.querySelectorAll('.vertical-tab-item')[${index}];
    if (!tab) return false;
    tab.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Could not activate fixture tab ${index}`);
  const url = `${fixtureOrigin}/${slug}`;
  const submitted = await cdp.evaluate(`(() => {
    const input = document.querySelector('.addressbar-container input');
    const form = input?.closest('form');
    if (!input || !form) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, ${JSON.stringify(url)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    form.requestSubmit();
    return true;
  })()`);
  if (!submitted) throw new Error(`Could not navigate fixture tab ${slug}`);
  await waitFor(`fixture page ${slug}`, () => evaluateJson(`(() => {
    const webview = document.querySelector('.browser-tabs-viewport .active-tab-pane webview.browser-view');
    if (!webview) return null;
    let current = '';
    try { current = webview.getURL(); } catch { return null; }
    return current.includes(${JSON.stringify(`/${slug}`)}) ? { url: current, guestId: webview.getWebContentsId?.() || 0 } : null;
  })()`).then((value) => value?.guestId > 0 ? value : null), 18000);
}

async function dragGeometry(selector, targetRatioX, targetRatioY) {
  return evaluateJson(`(() => {
    const rows = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0
        && rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight;
    };
    let source = rows.find(visible);
    if (!source) return null;
    source.scrollIntoView({ block: 'nearest' });
    const tabRect = source.getBoundingClientRect();
    const frame = document.querySelector('.browser-webview-frame');
    if (!frame) return null;
    const rect = frame.getBoundingClientRect();
    const from = { x: tabRect.left + Math.min(24, Math.max(8, tabRect.width * 0.4)), y: tabRect.top + tabRect.height / 2 };
    const to = { x: rect.left + rect.width * ${targetRatioX}, y: rect.top + rect.height * ${targetRatioY} };
    const hit = document.elementFromPoint(from.x, from.y);
    if (!hit || !(hit === source || source.contains(hit))) return null;
    return { from, to, title: source.querySelector('.vtab-title')?.textContent?.trim() || '', hit: hit.className || hit.tagName };
  })()`);
}

async function nativeDrag(selector, targetRatioX, targetRatioY) {
  const geometry = await dragGeometry(selector, targetRatioX, targetRatioY);
  if (!geometry) throw new Error(`Could not get hittable drag geometry for ${selector}`);
  await pressMouse(geometry.from);
  await moveHeldMouse(geometry.from, geometry.to);
  return geometry;
}

async function currentLayoutState() {
  return evaluateJson(`(() => {
    const grid = document.querySelector('.multiview-grid-container');
    const chromePanes = [...document.querySelectorAll('.multiview-pane-chrome')].map((pane) => ({
      occupied: pane.classList.contains('occupied'),
      bounds: { top: pane.style.top, left: pane.style.left, width: pane.style.width, height: pane.style.height },
      title: pane.querySelector('.multiview-pane-title')?.textContent?.trim() || ''
    }));
    const browserPanes = [...document.querySelectorAll('.browser-tabs-viewport .browser-tab-pane')].map((pane) => {
      const webview = pane.querySelector('webview.browser-view[data-tab-id]');
      if (!webview) return null;
      let url = '';
      let guestId = 0;
      try { url = webview.getURL(); guestId = webview.getWebContentsId(); } catch { return null; }
      return {
        tabId: webview.getAttribute('data-tab-id'),
        url,
        guestId,
        bounds: { top: pane.style.top, left: pane.style.left, width: pane.style.width, height: pane.style.height }
      };
    }).filter(Boolean);
    return {
      layout: grid?.className || '',
      panes: chromePanes,
      tabs: [...document.querySelectorAll('.vertical-tab-item')].map((row) => ({
        title: row.querySelector('.vtab-title')?.textContent?.trim() || '',
        inGroup: row.classList.contains('is-in-snap-group'),
        active: row.classList.contains('active')
      })),
      browserPanes
    };
  })()`);
}

async function openFlyoutFor(selector) {
  const geometry = await nativeDrag(selector, 0.5, 0.05);
  await waitFor('Snap layout flyout', () => cdp.evaluate(`Boolean(document.querySelector('.snap-bar-flyout.is-visible'))`));
  return geometry;
}

async function choosePreset(layout, slotIndex) {
  const selector = `.snap-card-preview.layout-${layout} .snap-card-slot.slot-${slotIndex}`;
  const geometry = await cdp.evaluate(`(() => {
    const slot = document.querySelector(${JSON.stringify(selector)});
    if (!slot || !slot.getClientRects().length) return null;
    const rect = slot.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!geometry) throw new Error(`Preset slot not visible: ${layout} slot ${slotIndex}`);
  await moveHeldMouse({ x: 0, y: 0 }, geometry, 1);
  await sleep(150);
  const target = await cdp.evaluate(`(() => {
    const ghost = document.querySelector('.snap-ghost-overlay');
    const slot = document.querySelector(${JSON.stringify(selector)});
    return { ghost: Boolean(ghost), hovered: Boolean(slot?.classList.contains('hovered')) };
  })()`);
  await releaseMouse(geometry);
  const state = await waitFor(`layout ${layout}`, async () => {
    const current = await currentLayoutState();
    return current.layout.includes(`layout-${layout}`) ? current : null;
  });
  return { state, target };
}

function numberPercent(value) {
  return Number.parseFloat(String(value || '').replace('%', ''));
}

function paneGeometryMatches(state, expected) {
  const occupied = state.panes.filter((pane) => pane.occupied);
  const actual = occupied.map(({ bounds }) => ({
    left: numberPercent(bounds.left),
    top: numberPercent(bounds.top),
    width: numberPercent(bounds.width),
    height: numberPercent(bounds.height)
  })).sort((a, b) => a.left - b.left || a.top - b.top);
  const sortedExpected = [...expected].sort((a, b) => a.left - b.left || a.top - b.top);
  return actual.length === sortedExpected.length && actual.every((pane, index) =>
    Math.abs(pane.left - sortedExpected[index].left) < 0.02
      && Math.abs(pane.top - sortedExpected[index].top) < 0.02
      && Math.abs(pane.width - sortedExpected[index].width) < 0.02
      && Math.abs(pane.height - sortedExpected[index].height) < 0.02);
}

async function findShellTarget() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const targets = await listTargets();
      const shell = targets.find((target) => target.type === 'page'
        && (target.url.includes('index.html') || target.url.startsWith('http://127.0.0.1:5173/')));
      if (shell) return shell;
    } catch { /* Electron publishes its debugging endpoint before its first page. */ }
    await sleep(300);
  }
  throw new Error('Local Electron did not publish a Lastbrowser renderer target within 30 seconds');
}

async function stopOwnedElectron() {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    // Only taskkill the tree if this exact PID still belongs to our local
    // Electron binary and carries our freshly generated profile path.
    const escapedExe = ELECTRON_EXE.replaceAll("'", "''");
    const escapedProfile = PROFILE_DIR.replaceAll("'", "''");
    const query = `$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${child.pid}'; if ($p -and $p.ExecutablePath -eq '${escapedExe}' -and $p.CommandLine.Contains('${escapedProfile}')) { exit 0 } else { exit 1 }`;
    const owned = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', query], { windowsHide: true, stdio: 'ignore' });
    if (owned.status === 0) {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    }
  } else {
    try { process.kill(child.pid, 'SIGTERM'); } catch { /* already exited */ }
  }
}

async function main() {
  if (process.platform !== 'win32') throw new Error('This focused smoke currently targets the Windows Electron build');
  if (!existsSync(ELECTRON_EXE)) throw new Error(`Local Electron binary missing: ${ELECTRON_EXE}`);
  if (!existsSync(MAIN_ENTRY)) throw new Error(`Build Lastbrowser first; main entry is missing: ${MAIN_ENTRY}`);

  cdpPort = await findFreePort();
  await startFixture();
  mkdirSync(PROFILE_DIR, { recursive: true });
  console.log('Isolated Lastbrowser Snap preset smoke');
  console.log(`  Electron: ${ELECTRON_EXE}`);
  console.log(`  profile:  ${PROFILE_DIR}`);
  console.log(`  CDP:      127.0.0.1:${cdpPort}`);

  child = spawn(ELECTRON_EXE, [
    `--user-data-dir=${PROFILE_DIR}`,
    `--remote-debugging-port=${cdpPort}`,
    MAIN_ENTRY
  ], { detached: false, stdio: 'ignore', windowsHide: false });
  child.once('error', (error) => { rendererErrors.push(`Electron spawn failed: ${error.message}`); });

  const shell = await findShellTarget();
  cdp = new CDP(shell.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await ensureBrowserChrome();
  check('isolated source Electron renders browser chrome and three fixture tabs are available', true, 'temporary profile and private local HTTP fixture');

  for (let index = 0; index < 3; index++) await navigateTab(index, `tab-${index + 1}`);
  const guestsReady = await evaluateJson(`(() => [...document.querySelectorAll('webview.browser-view[data-tab-id]')]
    .map((view) => ({ id: view.getAttribute('data-tab-id'), url: (() => { try { return view.getURL(); } catch { return ''; } })(), guestId: (() => { try { return view.getWebContentsId(); } catch { return 0; } })() }))
  )()`);
  check('three distinct local WebView guests are loaded before snapping', guestsReady.length >= 3
    && new Set(guestsReady.map((guest) => guest.id)).size >= 3
    && new Set(guestsReady.map((guest) => guest.guestId)).size >= 3
    && guestsReady.filter((guest) => guest.url.includes('/tab-')).length >= 3,
  JSON.stringify(guestsReady.map(({ id, url, guestId }) => ({ id, path: new URL(url).pathname, guestId }))));

  // Keep tab 3 active, then place inactive tab 1 into the left 25% edge zone.
  await cdp.evaluate(`document.querySelectorAll('.vertical-tab-item')[2]?.click()`);
  const initialGeometry = await nativeDrag('.vertical-tab-item:not(.active)', 0.06, 0.5);
  await releaseMouse(initialGeometry.to);
  const initialState = await waitFor('initial dual snap', async () => {
    const state = await currentLayoutState();
    return state.layout.includes('layout-dual-25-75') ? state : null;
  });
  check('real tab drag establishes a two-pane group before preset switching', initialState.panes.length === 2
    && initialState.panes.filter((pane) => pane.occupied).length === 2
    && initialState.browserPanes.filter((pane) => pane.url.includes('/tab-')).length === 3,
  `${initialState.layout}; panes=${initialState.panes.filter((pane) => pane.occupied).length}; guest-tabs=${initialState.browserPanes.length}`);

  for (const preset of PRESETS) {
    const drag = await openFlyoutFor('.vertical-tab-item.is-in-snap-group');
    const { state, target } = await choosePreset(preset.layout, preset.slot);
    const occupied = state.panes.filter((pane) => pane.occupied);
    const contentPanes = state.browserPanes.filter((pane) => pane.url.includes('/tab-')
      && occupied.some((chrome) => {
        const style = pane.bounds;
        return style.width === chrome.bounds.width && style.height === chrome.bounds.height
          && style.left === chrome.bounds.left && style.top === chrome.bounds.top;
      }));
    const leftSlotWidth = preset.slot === 0 ? preset.width : 100 - preset.width;
    const expected = [
      { left: 0, top: 0, width: leftSlotWidth, height: 100 },
      { left: leftSlotWidth, top: 0, width: 100 - leftSlotWidth, height: 100 }
    ];
    const geometryOk = paneGeometryMatches(state, expected);
    const guestsUnique = new Set(contentPanes.map((pane) => pane.tabId)).size === 2
      && new Set(contentPanes.map((pane) => pane.guestId)).size === 2;
    check(`switches to ${preset.layout} through the visible Snap flyout`, state.layout.includes(`layout-${preset.layout}`)
      && occupied.length === 2 && target.hovered && geometryOk && guestsUnique,
    `slot=${preset.slot}; geometry=${geometryOk}; occupied=${JSON.stringify(occupied.map((pane) => pane.bounds))}; expected=${JSON.stringify(expected)}; unique WebView guests=${guestsUnique}; selected slot hovered=${target.hovered}; from=${drag.title}`);
  }

  // Keep an existing snapped tab active while dragging the third, ungrouped tab
  // into the wide slot of Trio main-right. This must fill all three slots once.
  await cdp.evaluate(`(() => {
    const member = document.querySelector('.vertical-tab-item.is-in-snap-group');
    member?.click();
  })()`);
  const trioDrag = await openFlyoutFor('.vertical-tab-item:not(.is-in-snap-group)');
  const trioResult = await choosePreset('trio-main-right', 2);
  const trioState = trioResult.state;
  const trioExpected = [
    { left: 0, top: 0, width: 33.33, height: 50 },
    { left: 0, top: 50, width: 33.33, height: 50 },
    { left: 33.33, top: 0, width: 66.67, height: 100 }
  ];
  const trioContentPanes = trioState.browserPanes.filter((pane) => pane.url.includes('/tab-')
    && trioState.panes.some((chrome) => chrome.occupied
      && pane.bounds.width === chrome.bounds.width && pane.bounds.height === chrome.bounds.height
      && pane.bounds.left === chrome.bounds.left && pane.bounds.top === chrome.bounds.top));
  const trioUnique = new Set(trioContentPanes.map((pane) => pane.tabId)).size === 3
    && new Set(trioContentPanes.map((pane) => pane.guestId)).size === 3
    && new Set(trioContentPanes.map((pane) => new URL(pane.url).pathname)).size === 3;
  const trioGeometryOk = paneGeometryMatches(trioState, trioExpected);
  check('fills Trio main-right by dropping the third real tab into its wide slot', trioState.layout.includes('layout-trio-main-right')
    && trioState.panes.length === 3 && trioState.panes.every((pane) => pane.occupied)
    && trioGeometryOk && trioUnique && trioResult.target.hovered,
  `geometry=${trioGeometryOk}; all three WebView guests unique=${trioUnique}; slot hover=${trioResult.target.hovered}; dragged=${trioDrag.title}`);

  // Switch back from a full three-tab trio to a two-pane asymmetric layout to
  // catch stale/duplicate slot membership when reducing layout capacity.
  const returnDrag = await openFlyoutFor('.vertical-tab-item.is-in-snap-group');
  const returnResult = await choosePreset('dual-66-33', 0);
  const returnState = returnResult.state;
  const returnGeometryOk = paneGeometryMatches(returnState, [
    { left: 0, top: 0, width: 66.67, height: 100 },
    { left: 66.67, top: 0, width: 33.33, height: 100 }
  ]);
  const returnContentPanes = returnState.browserPanes.filter((pane) => pane.url.includes('/tab-')
    && returnState.panes.some((chrome) => chrome.occupied
      && pane.bounds.width === chrome.bounds.width && pane.bounds.height === chrome.bounds.height
      && pane.bounds.left === chrome.bounds.left && pane.bounds.top === chrome.bounds.top));
  check('switches from full Trio back to dual without duplicate or stale pane assignments', returnState.layout.includes('layout-dual-66-33')
    && returnState.panes.filter((pane) => pane.occupied).length === 2
    && returnGeometryOk && new Set(returnContentPanes.map((pane) => pane.tabId)).size === 2
    && new Set(returnContentPanes.map((pane) => pane.guestId)).size === 2,
  `geometry=${returnGeometryOk}; visible unique guests=${new Set(returnContentPanes.map((pane) => pane.guestId)).size}; dragged=${returnDrag.title}`);

  await cdp.send('Runtime.evaluate', { expression: 'window.close()' }).catch(() => undefined);
  if (rendererErrors.length) check('renderer had no uncaught errors during preset changes', false, rendererErrors.join(' | '));
  else check('renderer had no uncaught errors during preset changes', true);
}

async function cleanup() {
  cdp?.close();
  if (fixture) {
    await new Promise((resolve) => fixture.close(() => resolve()));
    fixture = null;
  }
  await stopOwnedElectron();
  const tempRoot = path.resolve(os.tmpdir());
  const profile = path.resolve(PROFILE_DIR);
  if (path.dirname(profile) === tempRoot && path.basename(profile).startsWith(PROFILE_PREFIX)) {
    for (let attempt = 0; attempt < 30 && existsSync(profile); attempt++) {
      try { rmSync(profile, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 }); } catch { /* retry while Chromium releases its profile lock */ }
      if (existsSync(profile)) await sleep(100);
    }
  }
}

main().catch((error) => {
  console.error(`FATAL: ${error.stack || error.message}`);
  check('smoke completed without setup/runtime exception', false, error.message);
}).finally(async () => {
  await cleanup();
  const failed = results.filter((result) => !result.passed);
  const passed = results.length - failed.length;
  console.log(`\nResult: ${passed}/${results.length} checks passed`);
  if (existsSync(PROFILE_DIR)) console.error(`WARNING: isolated profile could not be removed: ${PROFILE_DIR}`);
  process.exitCode = failed.length || existsSync(PROFILE_DIR) ? 1 : 0;
});
