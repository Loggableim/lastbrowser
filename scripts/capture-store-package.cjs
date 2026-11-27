#!/usr/bin/env node
// Capture genuine Store images from the packaged Windows app in a fresh profile.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const storeLocales = ['en', 'de', 'it', 'es', 'fr', 'pt-BR', 'ru', 'ja'];
const dimensions = { width: 1920, height: 1080 };
const browserReady = "document.querySelector('.addressbar-container input') && !document.querySelector('.first-run-fullscreen-wrap,.startup-animation-layer') && document.querySelector('.app-shell.panel-browser')";

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function digest(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function renderer(socket) {
  let sequence = 0;
  const calls = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const call = calls.get(message.id);
    if (!call) return;
    calls.delete(message.id);
    clearTimeout(call.timeout);
    if (message.error) call.reject(Error(message.error.message));
    else call.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const call of calls.values()) {
      clearTimeout(call.timeout);
      call.reject(Error('Renderer disconnected'));
    }
    calls.clear();
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => {
      calls.delete(id);
      reject(Error('Timed out: ' + method));
    }, 15000);
    calls.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const until = async (expression, label, timeout = 30000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        if (await evaluate(expression)) return;
      } catch (error) {
        if (socket.readyState !== WebSocket.OPEN) throw error;
      }
      await delay(200);
    }
    throw Error('Timed out waiting for ' + label);
  };
  const click = async selector => {
    const didClick = await evaluate('(()=>{const button=[...document.querySelectorAll(' + JSON.stringify(selector) + ')].find(node=>node.getClientRects().length>0&&!node.disabled);if(!button)return false;button.click();return true})()');
    if (!didClick) throw Error('Visible button unavailable: ' + selector);
  };
  return { send, evaluate, click, until };
}

async function openSocket(url) {
  const socket = new WebSocket(url);
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Renderer connection timed out')), 5000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(Error('Renderer connection failed')); }, { once: true });
    });
    return socket;
  } catch (error) {
    socket.close();
    throw error;
  }
}

async function findAttachedRenderer(port) {
  const host = `127.0.0.1:${port}`;
  const endpoint = `http://${host}/json/list`;
  const deadline = Date.now() + 15000;
  do {
    const response = await fetch(endpoint, { redirect: 'error', signal: AbortSignal.timeout(5000) });
    assert(response.ok, 'The attached renderer discovery endpoint must respond');
    const pages = await response.json();
    assert(Array.isArray(pages), 'Invalid renderer discovery response');
    const targets = pages.filter(page => page?.type === 'page' && page.url === 'app://bundle/index.html');
    assert(targets.length <= 1, 'Expected a single LastBrowser renderer');
    if (targets.length === 1) {
      const url = new URL(targets[0].webSocketDebuggerUrl);
      assert(url.origin === `ws://${host}` && /^\/devtools\/page\/[a-f0-9-]+$/i.test(url.pathname) &&
        !url.username && !url.password && !url.search && !url.hash, 'Unexpected attached renderer debugging address');
      return url;
    }
    await delay(200);
  } while (Date.now() < deadline);
  throw Error('Expected a single app://bundle/index.html renderer on the attached port');
}

async function captureScreenshots(driver, out, evidence, requireStoreManagedUpdates) {
  const { send, evaluate, click, until } = driver;
  await send('Emulation.setDeviceMetricsOverride', { ...dimensions, deviceScaleFactor: 1, mobile: false });
  const wizard = 'document.querySelector(".first-run-wizard")';
  const next = '.setup-action-footer .primary-btn';
  const aiOff = '.first-run-ai-choice-actions button:last-child';
  await until("Boolean(document.querySelector('.app-shell'))", 'Shell booted');
  if (requireStoreManagedUpdates) {
    await until('window.lastbrowser?.updates?.status().then(state => state?.managedByStore === true)', 'Store-managed updates');
  }
  for (let step = 0; step < 8; step++) {
    if (!await evaluate('Boolean(' + wizard + ')')) break;
    if (await evaluate('Boolean(document.querySelector(' + JSON.stringify(aiOff) + '))')) await click(aiOff);
    await until('!(' + wizard + ') || document.querySelector(' + JSON.stringify(next) + ')?.disabled === false', 'First-run next is enabled');
    if (!await evaluate('Boolean(' + wizard + ')')) break;
    await click(next);
    await delay(300);
  }
  await until('!(' + wizard + ')', 'First run completed');

  const capture = async (locale, view) => {
    await evaluate('Promise.race([document.fonts.ready.then(()=>true),new Promise(r=>setTimeout(r,2000))])');
    await delay(300);
    assert.equal(await evaluate('document.documentElement.lang'), locale);
    const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true, clip: { x: 0, y: 0, ...dimensions, scale: 1 } });
    const png = Buffer.from(data, 'base64');
    assert.equal(png.readUInt32BE(16), dimensions.width);
    assert.equal(png.readUInt32BE(20), dimensions.height);
    const file = locale + '/' + view + '.png';
    fs.mkdirSync(path.join(out, locale), { recursive: true });
    fs.writeFileSync(path.join(out, file), png, { flag: 'wx' });
    evidence.captures.push({ locale, view, file, ...dimensions, sha256: crypto.createHash('sha256').update(png).digest('hex') });
    console.log(locale, view);
  };
  const openSection = async icon => {
    await click(`.settings-section-button:has(.lucide-${icon})`);
    await until(`Boolean(document.querySelector('.settings-section-button[aria-current="page"] .lucide-${icon}')) &&
      document.querySelector('.settings-section-button[aria-current="page"] strong')?.textContent ===
      document.querySelector('.settings-editor-head strong')?.textContent`, `Settings section ${icon}`);
  };
  for (const locale of evidence.locales) {
    await evaluate('localStorage.setItem("lastbrowser.locale",' + JSON.stringify(locale) + ');localStorage.setItem("lastbrowser.activePanel","browser");localStorage.setItem("lastbrowser.sidebarMode.v1","expanded"); true');
    await send('Page.reload');
    await until('document.documentElement.lang===' + JSON.stringify(locale) + ' && Boolean(' + browserReady + ')', 'Browser locale ' + locale);
    await evaluate('document.querySelector(".copilot-toggle-btn.active")?.click(); true');
    await capture(locale, 'browser');
    await click('.downloads-trigger');
    await until("Boolean(document.querySelector('#native-downloads-panel'))", 'Downloads panel');
    await capture(locale, 'downloads');
    await click('[data-download-action=close]');
    await click('.expanded-bottom-footer button:has(.lucide-settings),.shell-rail .rail-bottom .rail-button,.nova-dock-btn:has(.lucide-settings)');
    await until("Boolean(document.querySelector('.app-shell.panel-settings .settings-section-button'))", 'Settings panel');
    await openSection('sparkles');
    await capture(locale, 'appearance');
    await openSection('gauge');
    await capture(locale, 'preferences');
  }
}

function writeReceipt(out, evidence) {
  fs.writeFileSync(path.join(out, 'capture-report.json'), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
}

async function captureAttached(port, out, evidence) {
  let socket;
  evidence.captureComplete = false;
  try {
    socket = await openSocket(await findAttachedRenderer(port));
    await captureScreenshots(renderer(socket), out, evidence, true);
    evidence.captureComplete = true;
  } finally {
    socket?.close();
    writeReceipt(out, evidence);
  }
}

async function captureStandalone(exe, out, evidence) {
  const requestedHosts = new Set();
  const proxy = http.createServer((request, response) => {
    try { requestedHosts.add(new URL(request.url).hostname); } catch {}
    response.writeHead(503).end();
  });
  proxy.on('connect', (request, socket) => {
    requestedHosts.add(request.url);
    socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
  });
  const owned = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-store-exact-'));
  const env = {};
  for (const key of ['SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATH', 'PATHEXT', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMDATA']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  for (const [key, name] of Object.entries({ USERPROFILE: 'home', APPDATA: 'appdata', LOCALAPPDATA: 'local', TEMP: 'temp', TMP: 'temp', LASTBROWSER_DOWNLOADS_DIR: 'downloads' })) {
    env[key] = path.join(owned, name);
    fs.mkdirSync(env[key], { recursive: true });
  }
  const portLease = net.createServer();
  const port = await listen(portLease);
  await new Promise(resolve => portLease.close(resolve));
  const proxyUrl = 'http://127.0.0.1:' + await listen(proxy);
  Object.assign(env, { HTTP_PROXY: proxyUrl, HTTPS_PROXY: proxyUrl, NO_PROXY: '127.0.0.1,localhost,::1' });
  let app, socket, driver;
  try {
    app = spawn(exe, [
      '--user-data-dir=' + path.join(owned, 'profile'), '--remote-debugging-port=' + port,
      '--remote-debugging-address=127.0.0.1', '--proxy-server=' + proxyUrl, '--disable-component-update'
    ], { cwd: path.dirname(exe), env, windowsHide: true, stdio: 'ignore' });
    const endpoint = 'http://127.0.0.1:' + port + '/json/list';
    let target;
    for (let attempt = 0; !target && attempt < 240; attempt++) {
      try {
        const pages = await (await fetch(endpoint, { signal: AbortSignal.timeout(1000) })).json();
        target = pages.find(page => page.type === 'page' && page.url.startsWith('app://'));
      } catch {}
      if (app.exitCode !== null) throw Error('Standalone app quit before screenshot capture: ' + app.exitCode);
      if (!target) await delay(250);
    }
    assert(target, 'Packaged app renderer opened');
    socket = await openSocket(target.webSocketDebuggerUrl);
    driver = renderer(socket);
    await captureScreenshots(driver, out, evidence, false);
    evidence.complete = true;
  } finally {
    if (driver && app.exitCode === null) {
      const closing = driver.send('Browser.close').catch(() => undefined);
      for (let attempt = 0; app.exitCode === null && attempt < 200; attempt++) await delay(100);
      socket?.close();
      await closing;
    }
    if (app && app.exitCode === null && app.signalCode === null) app.kill();
    socket?.close();
    proxy.close();
    evidence.exitCode = app?.exitCode;
    evidence.proxyBlocked = [...requestedHosts].sort();
    evidence.finishedAtUtc = new Date().toISOString();
    writeReceipt(out, evidence);
    if (app?.exitCode === 0) {
      const base = path.resolve(os.tmpdir()) + path.sep;
      if (owned.startsWith(base) && path.basename(owned).startsWith('lastbrowser-store-exact-')) {
        fs.rmSync(owned, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
      }
    }
  }
}

async function main() {
  const [input, output, mode, portValue, ...extra] = process.argv.slice(2);
  const attached = mode === '--attached-port';
  assert(input && output && extra.length === 0 && (mode === undefined || (attached && /^[0-9]+$/.test(portValue ?? ''))),
    'Usage: node scripts/capture-store-package.cjs <Lastbrowser.exe> <new output directory> [--attached-port <port>]');
  const port = attached ? Number(portValue) : null;
  if (attached) assert(Number.isInteger(port) && port >= 1024 && port <= 65535, 'Invalid attached renderer port');
  const exe = path.resolve(input);
  const out = path.resolve(output);
  assert.equal(path.basename(exe).toLowerCase(), 'lastbrowser.exe', 'Supply the unpacked app executable');
  const asar = path.join(path.dirname(exe), 'resources', 'app.asar');
  const locales = !attached && process.env.LASTBROWSER_STORE_CAPTURE_PROBE === '1' ? ['en'] : storeLocales;
  const evidence = {
    schemaVersion: 1, startedAtUtc: new Date().toISOString(),
    executableSha256: await digest(exe), asarSha256: await digest(asar), locales, captures: [], complete: false
  };
  fs.mkdirSync(out);
  if (attached) await captureAttached(port, out, evidence);
  else await captureStandalone(exe, out, evidence);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
