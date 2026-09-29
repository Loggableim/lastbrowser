/**
 * Isolated runtime smoke for the production browser-data cleanup IPC.
 * Uses only a disposable Electron profile and a local HTTP fixture.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { createServer } from 'node:http';

const electronExe = process.argv[2] || path.resolve('node_modules/electron/dist/electron.exe');
const mainEntry = path.resolve('apps/desktop/dist/main/main.js');
const tempRoot = path.resolve(os.tmpdir());
const profileDir = mkdtempSync(path.join(tempRoot, 'lastbrowser-data-cleanup-'));
const checks = [];
let appProcess;
let fixtureServer;
let cdpPort;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!port) throw new Error('Could not allocate isolated CDP port');
  return port;
}

async function assertPortUnused(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', (error) => reject(new Error(`Refusing to attach to existing process on CDP port ${port}: ${error.message}`)));
    server.listen(port, '127.0.0.1', () => server.close((error) => error ? reject(error) : resolve()));
  });
}

class CDP {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.onopen = resolve;
      this.socket.onerror = () => reject(new Error('CDP WebSocket connection failed'));
    });
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    };
  }
  async send(method, params = {}, timeoutMs = 10000) {
    await this.ready;
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timed out waiting for CDP ${method}`)); }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Evaluation failed');
    return response.result?.value;
  }
  close() { try { this.socket.close(); } catch { /* already closed */ } }
}

async function targets() {
  const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
  if (!response.ok) throw new Error(`CDP target list returned HTTP ${response.status}`);
  return response.json();
}

async function waitForTarget(predicate, timeoutMs = 20000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { const target = (await targets()).find(predicate); if (target) return target; } catch { /* Electron starting */ }
    await sleep(150);
  }
  return null;
}

async function waitForValue(cdp, expression, predicate, timeoutMs = 15000) {
  const until = Date.now() + timeoutMs;
  let value;
  while (Date.now() < until) {
    try { value = await cdp.evaluate(expression); if (predicate(value)) return value; } catch { /* renderer mounting */ }
    await sleep(150);
  }
  return value;
}

async function navigate(shell, url, origin) {
  const submitted = await shell.evaluate(`(() => {
    const input = document.querySelector('.addressbar input');
    if (!input) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, ${JSON.stringify(url)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.closest('form')?.requestSubmit(); return true;
  })()`);
  if (!submitted) return null;
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    const candidate = (await targets().catch(() => [])).find((item) => item.type === 'webview' && item.url.startsWith(origin));
    if (candidate) {
      const guest = new CDP(candidate.webSocketDebuggerUrl);
      try {
        await guest.send('Runtime.enable');
        if (await guest.evaluate(`location.origin === ${JSON.stringify(origin)} && document.readyState === 'complete'`)) return candidate;
      } catch { /* target provisional */ } finally { guest.close(); }
    }
    await sleep(150);
  }
  return null;
}

function launch() {
  appProcess = spawn(electronExe, [`--user-data-dir=${profileDir}`, `--remote-debugging-port=${cdpPort}`, mainEntry], {
    detached: true, stdio: 'ignore', windowsHide: true
  });
  appProcess.unref();
}

function stopSmoke() {
  if (fixtureServer) { try { fixtureServer.close(); } catch { /* already closed */ } fixtureServer = null; }
  if (appProcess?.pid) {
    spawnSync('taskkill.exe', ['/PID', String(appProcess.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    appProcess = null;
  }
  const target = path.resolve(profileDir);
  if (path.dirname(target) === tempRoot && path.basename(target).startsWith('lastbrowser-data-cleanup-')) {
    for (let attempt = 0; attempt < 20 && existsSync(target); attempt += 1) {
      try { rmSync(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 }); } catch { /* retry */ }
      if (existsSync(target)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
}

async function main() {
  if (process.platform !== 'win32') throw new Error('This smoke currently requires Windows process cleanup');
  if (!existsSync(electronExe)) throw new Error(`Electron binary not found: ${electronExe}`);
  if (!existsSync(mainEntry)) throw new Error(`Build the desktop app first; missing ${mainEntry}`);
  cdpPort = await freePort();
  await assertPortUnused(cdpPort);
  fixtureServer = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end('<!doctype html><title>Cleanup Fixture</title><main>Local cleanup fixture</main>');
  });
  await new Promise((resolve, reject) => { fixtureServer.once('error', reject); fixtureServer.listen(0, '127.0.0.1', resolve); });
  const address = fixtureServer.address();
  if (!address || typeof address === 'string') throw new Error('Could not bind local fixture');
  const origin = `http://127.0.0.1:${address.port}`;
  const fixtureUrl = `${origin}/cleanup`;
  launch();
  const shellTarget = await waitForTarget((item) => item.type === 'page' && item.url.includes('index.html'));
  if (!shellTarget) throw new Error('Could not find isolated Lastbrowser shell');
  const shell = new CDP(shellTarget.webSocketDebuggerUrl);
  try {
    await shell.send('Runtime.enable');
    await waitForValue(shell, `Boolean(document.querySelector('.profile-switcher-trigger'))`, Boolean, 25000);
    const target = await navigate(shell, fixtureUrl, origin);
    if (!target) throw new Error('Could not navigate to local fixture');
    const guest = new CDP(target.webSocketDebuggerUrl);
    await guest.send('Runtime.enable');
    await guest.evaluate(`(() => {
      localStorage.setItem('cleanup-fixture', 'preserve-local-storage');
      document.cookie = 'cleanup-fixture=preserve-cookie; Path=/; SameSite=Lax';
      return true;
    })()`);
    guest.close();
    const dataBefore = async () => {
      const current = await waitForTarget((item) => item.type === 'webview' && item.url.startsWith(origin));
      if (!current) throw new Error('Fixture webview disappeared');
      const probe = new CDP(current.webSocketDebuggerUrl);
      try { await probe.send('Runtime.enable'); return await probe.evaluate(`JSON.stringify({ local: localStorage.getItem('cleanup-fixture'), cookie: document.cookie })`); }
      finally { probe.close(); }
    };
    const invoke = async (options) => shell.evaluate(`window.lastbrowser.browser.clearData(${JSON.stringify(options)})`);
    let result = await invoke({ cache: false, cookies: true, storage: false });
    let state = JSON.parse(await dataBefore());
    check('cookies-only selection clears cookie and preserves localStorage', result?.ok === true && !state.cookie.includes('cleanup-fixture=') && state.local === 'preserve-local-storage', JSON.stringify({ result, state }));

    await shell.evaluate(`(() => { const view = [...document.querySelectorAll('webview.browser-view')].find((item) => item.src?.startsWith(${JSON.stringify(origin)})); return view?.executeJavaScript("document.cookie='cleanup-fixture=preserve-cookie; Path=/; SameSite=Lax'", true); })()`);
    result = await invoke({ cache: false, cookies: false, storage: true });
    state = JSON.parse(await dataBefore());
    check('website-storage selection clears localStorage while preserving cookie', result?.ok === true && state.local === null && state.cookie.includes('cleanup-fixture=preserve-cookie'), JSON.stringify({ result, state }));

    await shell.evaluate(`(() => { const view = [...document.querySelectorAll('webview.browser-view')].find((item) => item.src?.startsWith(${JSON.stringify(origin)})); return view?.executeJavaScript("localStorage.setItem('cleanup-fixture','preserve-local-storage')", true); })()`);
    result = await invoke({ cache: true, cookies: false, storage: false });
    state = JSON.parse(await dataBefore());
    check('cache-only selection succeeds without clearing cookie or website storage', result?.ok === true && state.local === 'preserve-local-storage' && state.cookie.includes('cleanup-fixture=preserve-cookie'), JSON.stringify({ result, state }));

    result = await invoke({ cache: false, cookies: false, storage: false });
    check('no-category selection performs no cleanup and returns success', result?.ok === true && result.clearedSessions === 0, JSON.stringify(result));
  } finally { shell.close(); }
  const failures = checks.filter((item) => !item.ok);
  console.log(`\nResult: ${checks.length - failures.length}/${checks.length} passed`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => { console.error('FATAL:', error); process.exitCode = 1; }).finally(stopSmoke);
