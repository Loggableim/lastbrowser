/**
 * Lastbrowser browser smoke test.
 *
 * Verifies the full browser path end-to-end against a running or freshly
 * launched Lastbrowser build:
 *   1. CDP endpoint reachable
 *   2. Shell renderer loads (sidebar + panels present)
 *   3. Address bar navigation spawns a <webview>
 *   4. The webview target actually renders a page (title + readyState)
 *
 * Usage:
 *   node scripts/smoke-browser.mjs [path-to-exe]
 *
 * Defaults to the local Electron binary plus the current dist/main/main.js.
 * Pass LASTBROWSER_SMOKE_ALLOW_INSTALLED=1 to explicitly test an installed EXE.
 * Exits 0 on success, 1 on failure. Screenshots land in ./smoke-output/.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { createServer as createHttpServer } from 'node:http';

const DEFAULT_EXE = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron'
);
const EXE = process.argv[2] || process.env.LASTBROWSER_EXE || DEFAULT_EXE;
const REQUESTED_CDP_PORT = process.env.LASTBROWSER_SMOKE_CDP_PORT
  ? Number(process.env.LASTBROWSER_SMOKE_CDP_PORT)
  : 0;
let CDP_PORT = REQUESTED_CDP_PORT;
let smokeChild = null;
let smokeDownloadServer = null;
let smokeDownloadRequestCount = 0;
let smokeLastDownloadRequest = null;
let smokeCdp = null;
let smokeShellTarget = null;
const rendererDiagnostics = [];
const addressEntryTrace = [];
const TEST_URL = process.env.LASTBROWSER_SMOKE_URL || 'example.com';
const INTERACTIVE_PAUSE_MS = Number(process.env.LASTBROWSER_SMOKE_INTERACTIVE_MS || 0);
const OUT_DIR = path.resolve(process.cwd(), 'smoke-output');
const SMOKE_PROFILE_DIR = mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-browser-smoke-'));
const SMOKE_EXTENSION_DIR = path.join(SMOKE_PROFILE_DIR, 'fixture-extension');
const SMOKE_DOWNLOAD_DIR = path.join(SMOKE_PROFILE_DIR, 'downloads');
const SMOKE_DOWNLOAD_NAME = 'lastbrowser-smoke-download.txt';
const SMOKE_DOWNLOAD_CONTENT = Buffer.from('Lastbrowser isolated download fixture\n', 'utf8');
const SMOKE_PAGE_TITLE = `Lastbrowser Smoke Page ${process.pid}`;
const LOCAL_MAIN_ENTRY = path.resolve(import.meta.dirname, '..', 'dist', 'main', 'main.js');
const OLLAMA_SMOKE_MODEL = 'deepseek-v4.1-flash';
const OLLAMA_SMOKE_MODEL_QUALIFIED = `@ollama-cloud:${OLLAMA_SMOKE_MODEL}`;
const QUAD_POINTER_TRACE_ONLY = process.env.LASTBROWSER_SMOKE_QUAD_POINTER_TRACE === '1';

function readOllamaSmokeCredential() {
  const fromEnvironment = process.env.OLLAMA_API_KEY || process.env.OLLAMA_CLOUD_API_KEY;
  if (fromEnvironment?.trim()) return fromEnvironment.trim();

  const envFile = process.env.LASTBROWSER_SMOKE_OLLAMA_ENV_FILE
    || path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Lastbrowser', 'runtime', '.env');
  try {
    const line = readFileSync(envFile, 'utf8').split(/\r?\n/)
      .find((entry) => /^\s*(?:export\s+)?OLLAMA_API_KEY\s*=/.test(entry));
    if (!line) return '';
    const value = line.slice(line.indexOf('=') + 1).trim();
    const unquoted = value.length >= 2 && ['"', "'"].includes(value[0]) && value.at(-1) === value[0]
      ? value.slice(1, -1)
      : value;
    return unquoted.trim();
  } catch {
    return '';
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function createSmokeAudioDataUrl() {
  const sampleRate = 8000;
  const sampleCount = sampleRate * 4;
  const dataSize = sampleCount * 2;
  const wave = Buffer.alloc(44 + dataSize);
  wave.write('RIFF', 0);
  wave.writeUInt32LE(36 + dataSize, 4);
  wave.write('WAVE', 8);
  wave.write('fmt ', 12);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24);
  wave.writeUInt32LE(sampleRate * 2, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write('data', 36);
  wave.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < sampleCount; index++) {
    const sample = Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 900;
    wave.writeInt16LE(sample, 44 + index * 2);
  }
  return `data:audio/wav;base64,${wave.toString('base64')}`;
}

async function cdpList() {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
  return res.json();
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a local CDP port'));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function assertPortUnused(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(`CDP port ${port} is already in use; refusing to attach or mutate another process`));
      } else reject(error);
    });
    server.listen(port, '127.0.0.1', () => server.close((error) => error ? reject(error) : resolve()));
  });
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    let rejectReady;
    this.opened = false;
    this.ready = new Promise((resolve, reject) => {
      rejectReady = reject;
      this.ws.onopen = () => {
        this.opened = true;
        resolve();
      };
    });
    const failPending = (error) => {
      for (const { reject } of this.pending.values()) reject(error);
      this.pending.clear();
    };
    this.ws.onerror = () => {
      const error = new Error('CDP websocket error');
      if (!this.opened) rejectReady(error);
      failPending(error);
    };
    this.ws.onclose = (event) => {
      const detail = `code=${event.code}${event.reason ? ` reason=${event.reason}` : ''}${event.wasClean ? ' clean' : ''}`;
      const error = new Error(`CDP websocket closed (${detail})`);
      if (!this.opened) rejectReady(error);
      failPending(error);
    };
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        const message = msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'unknown';
        rendererDiagnostics.push(String(message));
        console.error(`[renderer exception] ${message}`);
      } else if (msg.method === 'Runtime.consoleAPICalled'
        && ['error', 'warning'].includes(msg.params.type)) {
        const args = (msg.params.args || []).map((arg) => arg.value ?? arg.description ?? '').join(' ');
        rendererDiagnostics.push(String(args));
        console.error(`[renderer ${msg.params.type}] ${args}`);
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
  }
  async send(method, params = {}, timeoutMs = 15000) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Timeout: ${method}`));
        }
      }, timeoutMs);
    });
  }
  close() {
    try { this.ws.close(); } catch { /* ignore */ }
  }
}

async function startSmokeDownloadFixture() {
  const server = createHttpServer((request, response) => {
    if (request.url?.split('?')[0] === '/page') {
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      response.end(`<!doctype html><html><head><title>${SMOKE_PAGE_TITLE}</title></head><body><main>${SMOKE_PAGE_TITLE}</main></body></html>`);
      return;
    }
    const splitFixtureId = request.url?.split('?')[0]?.match(/^\/split-pane\/([abc])$/i)?.[1]?.toUpperCase();
    if (splitFixtureId) {
      const title = `Lastbrowser Split Smoke ${splitFixtureId} ${process.pid}`;
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      response.end(`<!doctype html><html><head><title>${title}</title></head><body><main data-smoke-pane="${splitFixtureId}">${title}</main></body></html>`);
      return;
    }
    if (request.url !== '/download' || request.method !== 'GET') {
      response.writeHead(404).end();
      return;
    }
    smokeDownloadRequestCount += 1;
    smokeLastDownloadRequest = { method: request.method, path: request.url };
    response.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${SMOKE_DOWNLOAD_NAME}"`,
      'Content-Length': String(SMOKE_DOWNLOAD_CONTENT.length),
      'Cache-Control': 'no-store'
    });
    response.end(SMOKE_DOWNLOAD_CONTENT);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  smokeDownloadServer = server;
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not start local download fixture server');
  return `http://127.0.0.1:${address.port}/download`;
}

async function enterAddressThroughKeyboard(cdp, url) {
  const rectResponse = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('.addressbar-container input');
      if (!input) return null;
      const rect = input.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`,
    returnByValue: true
  });
  const point = rectResponse.result.value;
  if (!point) {
    const inputs = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify([...document.querySelectorAll('input')].map((input) => ({ aria: input.getAttribute('aria-label'), value: input.value, rect: (() => { const r = input.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })() })))`,
      returnByValue: true
    });
    addressEntryTrace.push({ requested: url, error: 'address field not found', inputs: JSON.parse(inputs.result.value) });
    return false;
  }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  const focusState = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const input = document.querySelector('.addressbar-container input'); input?.focus(); input?.select(); return { focused: document.activeElement === input, value: input?.value || '', width: input?.getBoundingClientRect().width || 0 }; })()`,
    returnByValue: true
  });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 });
  await cdp.send('Input.insertText', { text: url });
  let typedState = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const typedStateResponse = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
      const input = document.querySelector('.addressbar-container input');
      const badge = document.querySelector('.omnibox-badge.url');
      const option = badge?.closest('.omnibox-item');
      const rect = option?.getBoundingClientRect();
      return { focused: document.activeElement === input, value: input?.value || '', optionText: option?.innerText || '', point: rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null };
    })()`,
      returnByValue: true
    });
    typedState = typedStateResponse.result.value;
    if (typedState?.value === url) break;
    await sleep(50);
  }
  addressEntryTrace.push({ requested: url, focused: typedState?.focused, focusBeforeTyping: focusState.result.value, typedValue: typedState?.value || '', selectedSuggestion: typedState?.optionText || '' });
  if (typedState?.value !== url) {
    return { submitted: false, typedValue: typedState?.value || '', selectedSuggestion: typedState?.optionText || '' };
  }
  // Submit the exact text through the real form path. Clicking the dropdown's
  // first URL row can race React's query update and select the previous page.
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  return { submitted: true, typedValue: typedState?.value || '', selectedSuggestion: typedState?.optionText || '' };
}

async function pressMouse(cdp, point) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1
  });
}

async function moveHeldMouse(cdp, from, to, steps = 12) {
  for (let index = 1; index <= steps; index++) {
    const progress = index / steps;
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
      button: 'left',
      buttons: 1
    });
    await sleep(16);
  }
  return to;
}

async function releaseMouse(cdp, point) {
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1
  });
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
function skip(name, detail = '') {
  results.push({ name, ok: true, skipped: true, detail });
  console.log(`  SKIP  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const electronExecutableName = process.platform === 'win32' ? 'electron.exe' : 'electron';
  const isElectronBinary = path.basename(EXE).toLowerCase() === electronExecutableName;
  if (!isElectronBinary && process.env.LASTBROWSER_SMOKE_ALLOW_INSTALLED !== '1') {
    console.error('FAIL: installed EXE smoke is disabled because older builds may ignore the isolated downloads path. Set LASTBROWSER_SMOKE_ALLOW_INSTALLED=1 only for an intentional installed-build test.');
    process.exitCode = 1;
    return;
  }
  if (!CDP_PORT) CDP_PORT = await findFreePort();
  await assertPortUnused(CDP_PORT);
  console.log('Lastbrowser smoke test');
  console.log('  exe :', EXE);
  console.log('  cdp :', CDP_PORT);
  console.log('  url :', TEST_URL);
  console.log('');

  if (!existsSync(EXE)) {
    console.error(`FAIL: executable not found at ${EXE}`);
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(SMOKE_DOWNLOAD_DIR, { recursive: true });
  const downloadFixtureUrl = await startSmokeDownloadFixture();

  // 1. Launch
  const launchArgs = [
    `--user-data-dir=${SMOKE_PROFILE_DIR}`,
    `--remote-debugging-port=${CDP_PORT}`,
    ...(isElectronBinary && existsSync(LOCAL_MAIN_ENTRY) ? [LOCAL_MAIN_ENTRY] : [])
  ];
  mkdirSync(SMOKE_PROFILE_DIR, { recursive: true });
  mkdirSync(SMOKE_EXTENSION_DIR, { recursive: true });
  writeFileSync(path.join(SMOKE_EXTENSION_DIR, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: 'Lastbrowser Smoke Extension',
    version: '1.0.0',
    content_scripts: [{ matches: ['https://example.com/*'], js: ['smoke.js'], run_at: 'document_idle' }]
  }, null, 2));
  writeFileSync(path.join(SMOKE_EXTENSION_DIR, 'smoke.js'), `document.documentElement.dataset.lastbrowserSmokeExtension = 'loaded';`);
  const smokeEnv = { ...process.env, LASTBROWSER_DOWNLOADS_DIR: SMOKE_DOWNLOAD_DIR };
  if (process.env.LASTBROWSER_SMOKE_OLLAMA === '1') {
    // The smoke profile has its own Sidekick home. Pass only the Ollama
    // credential through the child environment so the isolated backend sees
    // it without copying secrets into the temporary profile or logging them.
    const ollamaCredential = readOllamaSmokeCredential();
    if (ollamaCredential) smokeEnv.OLLAMA_API_KEY = ollamaCredential;
    delete smokeEnv.OLLAMA_CLOUD_API_KEY;
    console.log(`  Ollama smoke credential: ${ollamaCredential ? 'available' : 'missing'}`);
  }
  const child = spawn(EXE, launchArgs, {
    detached: true,
    stdio: process.env.LASTBROWSER_SMOKE_DIAGNOSTICS === '1' ? ['ignore', 'pipe', 'pipe']
      : process.env.LASTBROWSER_SMOKE_LOG === '1' ? 'inherit' : 'ignore',
    env: smokeEnv
  });
  smokeChild = child;
  if (process.env.LASTBROWSER_SMOKE_DIAGNOSTICS === '1') {
    // Keep only traceback locations and exception classes. Backend request
    // logs can contain auth query parameters; never forward their raw text.
    for (const output of [child.stdout, child.stderr]) {
      let remainder = '';
      output?.on('data', (chunk) => {
        const lines = (remainder + chunk.toString()).split(/\r?\n/);
        remainder = lines.pop() || '';
        for (const line of lines) {
          const frame = line.match(/^\s*File "([^"\r\n]+)", line (\d+), in ([\w<>]+)/);
          const exception = line.match(/^([\w.]+(?:Error|Exception)):/);
          const transport = line.match(/^(?:\[sidekick\] )?\[CHAT-TRANSPORT\] (\{.*\})$/);
          if (transport) {
            try {
              const raw = JSON.parse(transport[1]);
              const safe = {};
              for (const [key, value] of Object.entries(raw)) {
                if (/^(trace|count|bytes|total_bytes|chunks|frames|status)$/.test(key) && Number.isFinite(value)) safe[key] = value;
                else if (/^(layer|stage|state|kind)$/.test(key) && typeof value === 'string' && /^[a-z_]+$/.test(value)) safe[key] = value;
              }
              console.log(`  TRACE transport ${JSON.stringify(safe)}`);
            } catch { /* Ignore malformed diagnostics rather than printing raw logs. */ }
          }
          else if (frame) console.log(`  TRACE backend ${path.basename(frame[1])}:${frame[2]} ${frame[3]}`);
          else if (exception) console.log(`  TRACE backend exception class: ${exception[1]}`);
        }
      });
    }
  }
  child.unref();
  console.log(`[1] launched (pid ${child.pid})`);
  if (Number.isFinite(INTERACTIVE_PAUSE_MS) && INTERACTIVE_PAUSE_MS > 0) {
    console.log(`[Computer Use] isolated test window is ready; waiting ${INTERACTIVE_PAUSE_MS} ms before smoke actions`);
    await sleep(INTERACTIVE_PAUSE_MS);
  }

  let targets = null;
  let shell = null;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await cdpList();
      shell = targets.find((t) => t.type === 'page'
        && (t.url.includes('index.html') || t.url.startsWith('http://127.0.0.1:5173/')));
      if (shell) break;
    } catch {
      // CDP can begin accepting connections before Electron publishes targets.
    }
    await sleep(500);
  }
  if (!targets || !shell) {
    check('cdp endpoint reachable', false, 'no renderer target after 30s');
    finish(child);
  }
  check('cdp endpoint reachable', true, `${targets.length} target(s)`);

  // 2. Shell renderer
  check('shell renderer present', Boolean(shell), shell ? shell.url.split('/').pop() : 'not found');
  if (!shell) finish(child);

  smokeShellTarget = { id: shell.id, url: shell.url };
  const cdp = new CDP(shell.webSocketDebuggerUrl);
  smokeCdp = cdp;
  await cdp.send('Runtime.enable');

  // Electron can expose the CDP target before React has mounted. Wait for
  // either browser chrome or the first-run wizard before interacting.
  let initialUi = null;
  for (let i = 0; i < 80; i++) {
    const probe = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        hasAddressBar: Boolean(document.querySelector('.addressbar-container input')),
        hasFirstRun: Boolean(document.querySelector('[role="dialog"][aria-label="First-run setup"]')),
        hasSidebar: Boolean(document.querySelector('.sidekick-sidebar, .shell-rail'))
      })`,
      returnByValue: true
    });
    initialUi = JSON.parse(probe.result.value);
    if (initialUi.hasAddressBar || initialUi.hasFirstRun) break;
    await sleep(250);
  }

  // If first-run wizard is open, dismiss it so browser chrome renders
  if (initialUi?.hasFirstRun) {
    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const btn = [...document.querySelectorAll('button')]
          .find(b => /erstmal ohne|ohne ki|dismiss|skip/i.test(b.innerText || ''));
        if (btn) btn.click();
      })()`,
      returnByValue: true
    });
  }

  let shellInfo = null;
  for (let i = 0; i < 80; i++) {
    const shellState = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const text = document.body ? document.body.innerText : '';
        return JSON.stringify({
          hasSidebar: (/chat/i.test(text) && /settings/i.test(text)) || Boolean(document.querySelector('.sidekick-sidebar, .shell-rail')),
          hasAddressBar: Boolean(document.querySelector('.addressbar-container input')),
          textLength: text.length
        });
      })()`,
      returnByValue: true
    });
    shellInfo = JSON.parse(shellState.result.value);
    if (shellInfo.hasSidebar && shellInfo.hasAddressBar) break;
    await sleep(250);
  }

  check('shell ui rendered', shellInfo.hasSidebar && shellInfo.hasAddressBar,
    `sidebar=${shellInfo.hasSidebar} addressbar=${shellInfo.hasAddressBar}`);

  const topbarProfileSelector = await cdp.send('Runtime.evaluate', {
    expression: `document.querySelectorAll('.modern-titlebar .profile-switcher, .browser-titlebar .profile-switcher').length`,
    returnByValue: true
  });
  check('browser profiles are absent from both titlebar layouts', topbarProfileSelector.result.value === 0,
    `topbar profile switchers=${topbarProfileSelector.result.value}`);

  const ollamaSmokeOnly = process.env.LASTBROWSER_SMOKE_OLLAMA_ONLY === '1';
  if (!ollamaSmokeOnly) {

  const cursorPosition = await cdp.send('Runtime.evaluate', {
    expression: 'window.lastbrowser?.system?.getCursorPosition?.()',
    awaitPromise: true,
    returnByValue: true
  });
  const cursorPoint = cursorPosition.result.value;
  check('cursor loupe system bridge reports renderer-local coordinates',
    Number.isFinite(cursorPoint?.x) && Number.isFinite(cursorPoint?.y) && typeof cursorPoint?.visible === 'boolean', JSON.stringify(cursorPoint));

  const dockObservation = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const sidebar = document.querySelector('.sidekick-sidebar');
      const dock = document.querySelector('.nova-dock');
      const item = dock?.querySelector('.nova-dock-item-wrapper');
      if (!sidebar || !dock || !item) return { available: false };
      const rect = item.getBoundingClientRect();
      return { available: true, slim: sidebar.classList.contains('slim'), overflow: getComputedStyle(sidebar).overflow, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`,
    returnByValue: true
  });
  const dockProbe = dockObservation.result.value;
  let dockVerified = false;
  let dockDetail = 'Nova Dock not mounted in initial sidebar mode';
  if (dockProbe?.available) {
    const triggerObservation = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const trigger = document.querySelector('.nova-dock-trigger-zone');
        if (!trigger) return null;
        const rect = trigger.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`,
      returnByValue: true
    });
    const trigger = triggerObservation.result.value;
    if (trigger) {
      // Auto-hide docks are translated offscreen until the pointer enters their
      // edge trigger. Reveal first, then hover a visible item for the fisheye.
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: trigger.x, y: trigger.y });
      await sleep(320);
    }
    // CSS transitions can be paused while the isolated Electron window is
    // occluded by another desktop window. Disable only transitions for this
    // deterministic final-state assertion; live Computer Use validates the
    // animation and label wave in the visible window.
    await cdp.send('Runtime.evaluate', {
      expression: `(() => { const style = document.createElement('style'); style.textContent = '.nova-dock-item-wrapper, .nova-dock-label-pill { transition: none !important; }'; document.head.appendChild(style); return true; })()`,
      returnByValue: true
    });
    const visibleItemObservation = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const item = document.querySelector('.nova-dock-item-wrapper');
        if (!item) return null;
        const rect = item.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`,
      returnByValue: true
    });
    const visibleItem = visibleItemObservation.result.value;
    if (visibleItem) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: visibleItem.x, y: visibleItem.y });
    }
    // The dock moves while revealing. Re-aim at the current item rectangle
    // until the actual hover state appears, rather than sampling stale bounds.
    let waveState = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const currentItem = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const item = document.querySelector('.nova-dock-item-wrapper'); if (!item) return null; const rect = item.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`,
        returnByValue: true
      });
      if (currentItem.result.value) {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...currentItem.result.value });
      }
      await sleep(250);
      const wave = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const items = [...document.querySelectorAll('.nova-dock-item-wrapper')];
          const labels = [...document.querySelectorAll('.nova-dock-label-pill')];
          const scale = (element) => Number((getComputedStyle(element).transform.match(/^matrix\\(([^,]+)/) || [])[1] || 1);
          return { hoveredScale: scale(items[0]), neighborScale: scale(items[1]), hoveredLabel: Number(labels[0] ? getComputedStyle(labels[0]).opacity : 0), neighborLabel: Number(labels[1] ? getComputedStyle(labels[1]).opacity : 0), dockClass: document.querySelector('.nova-dock')?.className };
        })()`,
        returnByValue: true
      });
      waveState = wave.result.value;
      if (waveState.hoveredScale > 1.05 && waveState.hoveredLabel > 0.9 && waveState.neighborLabel > 0) break;
    }
    dockVerified = dockProbe.slim && dockProbe.overflow === 'visible' && waveState.hoveredScale > 1.05 && waveState.hoveredLabel > 0.9 && waveState.neighborLabel > 0;
    dockDetail = `mode=${dockProbe.slim ? 'slim' : 'not-slim'}, overflow=${dockProbe.overflow}, wave=${JSON.stringify(waveState)}`;
  }
  check('minimized Nova Dock shows fisheye and title wave beyond sidebar', dockVerified, dockDetail);

  // Downloads panel lifecycle: exercise the real toolbar trigger and every
  // dock/minimize action in the Electron renderer (not just component tests).
  const downloadsOpen = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = [...document.querySelectorAll('.downloads-trigger')].find(el => el.getClientRects().length); if (!button) return 'TRIGGER_NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  const waitForDownloads = async (selector, expected) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const state = await cdp.send('Runtime.evaluate', {
        expression: `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
        returnByValue: true
      });
      if (state.result.value === expected) return true;
      await sleep(150);
    }
    return false;
  };
  const waitForUi = async (selector, expected) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const state = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0; })()`,
        returnByValue: true
      });
      if (state.result.value === expected) return true;
      await sleep(150);
    }
    return false;
  };
  // Modal entrance animations can remain on their first opacity frame while
  // an Electron window is occluded. For the Space setup smoke, visibility is
  // determined by layout and visibility styles; opacity is animation state,
  // not whether React mounted the interactive dialog.
  const waitForLaidOutUi = async (selector, expected) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const state = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0; })()`,
        returnByValue: true
      });
      if (state.result.value === expected) return true;
      await sleep(150);
    }
    return false;
  };
  const panelInitiallyOpened = await waitForDownloads('.downloads-panel', true);
  check('Downloads opens from the visible toolbar trigger', downloadsOpen.result.value === 'CLICKED' && panelInitiallyOpened,
    `${downloadsOpen.result.value}, panel=${panelInitiallyOpened}`);

  let dockChecksPassed = panelInitiallyOpened;
  const dockCases = [
    'floating',
    'dock-tabs',
    'dock-sidekick',
    'dock-topbar-left',
    'dock-topbar-right',
    'dropdown'
  ];
  for (const mode of dockCases) {
    const selected = await cdp.send('Runtime.evaluate', {
      expression: `(() => { const button = document.querySelector('.downloads-panel button[data-dock-mode="${mode}"]'); if (!button) return false; button.click(); return true; })()`,
      returnByValue: true
    });
    const modeApplied = await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('.downloads-panel')?.classList.contains('mode-${mode}') || false`,
      returnByValue: true
    });
    dockChecksPassed &&= selected.result.value && modeApplied.result.value;
  }
  check('Downloads switches through floating and all dock positions', dockChecksPassed,
    dockCases.join(', '));

  // Use floating mode to expose the minimize control, then verify the pill can
  // restore the panel and close it; reopening a closed panel must be expanded.
  const floatForMinimize = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.downloads-panel button[data-dock-mode="floating"]'); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true
  });
  const minimizeDownloads = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.downloads-panel button[data-download-action="minimize"]'); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true
  });
  const minimizedPillShown = await waitForDownloads('.downloads-minimized-pill', true);
  const restoreDownloads = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const pill = document.querySelector('.downloads-minimized-pill'); if (!pill) return false; pill.click(); return true; })()`,
    returnByValue: true
  });
  const restoredPanelShown = await waitForDownloads('.downloads-panel', true);
  const minimizedRestored = minimizedPillShown && restoreDownloads.result.value && restoredPanelShown;
  check('Downloads minimizes to a pill and restores on click', minimizedRestored,
    `minimizeClick=${minimizeDownloads.result.value}, pill=${minimizedPillShown}, restoreClick=${restoreDownloads.result.value}, panel=${restoredPanelShown}`);

  const minimizeForDrag = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.downloads-panel button[data-download-action="minimize"]'); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true
  });
  let pillBounds = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const bounds = await cdp.send('Runtime.evaluate', {
      expression: `(() => { const pill = document.querySelector('.downloads-minimized-pill'); if (!pill) return null; const rect = pill.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, left: rect.left, top: rect.top }; })()`,
      returnByValue: true
    });
    pillBounds = bounds.result.value;
    if (pillBounds) break;
    await sleep(100);
  }
  if (pillBounds) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pillBounds.x, y: pillBounds.y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pillBounds.x, y: pillBounds.y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pillBounds.x + 52, y: pillBounds.y + 28, button: 'left' });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pillBounds.x + 52, y: pillBounds.y + 28, button: 'left', clickCount: 1 });
  }
  await sleep(180);
  const draggedPill = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const pill = document.querySelector('.downloads-minimized-pill'); if (!pill) return null; const rect = pill.getBoundingClientRect(); return { left: rect.left, top: rect.top }; })()`,
    returnByValue: true
  });
  const draggedPillPosition = draggedPill.result.value;
  const pillDragOk = minimizeForDrag.result.value && pillBounds && draggedPillPosition
    && (Math.abs(draggedPillPosition.left - pillBounds.left) >= 4 || Math.abs(draggedPillPosition.top - pillBounds.top) >= 4);
  check('dragging the minimized Downloads pill moves it without reopening', Boolean(pillDragOk),
    `minimized=${Boolean(draggedPillPosition)}, before=${JSON.stringify(pillBounds)}, after=${JSON.stringify(draggedPillPosition)}`);

  if (draggedPillPosition) {
    const clickX = draggedPillPosition.left + 40;
    const clickY = draggedPillPosition.top + 18;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: clickX, y: clickY });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: clickX, y: clickY, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: clickX, y: clickY, button: 'left', clickCount: 1 });
  }
  const dragPillRestored = await waitForDownloads('.downloads-panel.mode-floating', true);
  check('clicking the moved Downloads pill restores the panel', Boolean(pillDragOk) && Boolean(draggedPillPosition) && dragPillRestored,
    `dragged=${Boolean(pillDragOk)}, restored=${dragPillRestored}`);

  const closeExpanded = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.downloads-panel button[data-download-action="close"]'); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true
  });
  const closedDownloads = await waitForDownloads('.downloads-panel, .downloads-minimized-pill', false);
  const reopenedDownloads = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = [...document.querySelectorAll('.downloads-trigger')].find(el => el.getClientRects().length); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true
  });
  const reopenedExpanded = await waitForDownloads('.downloads-panel.mode-floating', true);
  await sleep(100);
  const reopenedState = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({ minimized: Boolean(document.querySelector('.downloads-minimized-pill')), mode: [...(document.querySelector('.downloads-panel')?.classList || [])].find(value => value.startsWith('mode-')) || '' })`,
    returnByValue: true
  });
  const reopenedInfo = JSON.parse(reopenedState.result.value);
  const downloadsLifecycleOk = closeExpanded.result.value && closedDownloads && reopenedDownloads.result.value && reopenedExpanded && !reopenedInfo.minimized
    && reopenedInfo.mode === 'mode-floating';
  check('Downloads close and reopen expanded with saved dock mode', downloadsLifecycleOk,
    `closeClick=${closeExpanded.result.value}, closed=${closedDownloads}, reopenClick=${reopenedDownloads.result.value}, reopened=${reopenedInfo.mode}/${reopenedInfo.minimized ? 'minimized' : 'expanded'}`);
  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('.downloads-panel button[data-download-action="close"]')?.click()`,
    returnByValue: true
  });

  // Settings navigation is reachable from the persistent browser rail. Verify
  // leaving and returning to the web view without changing user preferences.
  const expandForSettings = await cdp.send('Runtime.evaluate', {
    expression: `(() => { if (document.querySelector('.expanded-workspace-pill')) return 'ALREADY_EXPANDED'; const button = document.querySelector('.nova-dock .toggle-expand-btn, .modern-titlebar .sidebar-toggle'); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  const settingsSidebarReady = await waitForUi('.expanded-workspace-pill', true);
  const openSettings = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.nova-dock-actions-group button:has(svg.lucide-settings), .expanded-bottom-footer button:has(svg.lucide-settings), .shell-rail button:has(svg.lucide-settings)'); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  const settingsVisible = await waitForUi('.app-shell.panel-settings', true);
  check('settings navigation opens the settings panel', settingsSidebarReady && openSettings.result.value === 'CLICKED' && settingsVisible,
    `expand=${expandForSettings.result.value}, ${openSettings.result.value}, visible=${settingsVisible}`);

  // Change the UI locale from the Preferences screen, assert both the live
  // translated text and persisted renderer preference, then restore the prior
  // locale so the remaining smoke assertions keep their expected labels.
  const openPreferences = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelectorAll('.settings-section-button')[2]; if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  const preferencesReady = await waitForUi('.settings-panel-scroll select', true);
  const localeChange = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const select = [...document.querySelectorAll('.settings-panel-scroll select')].find(item => [...item.options].some(option => option.value === 'ru'));
      if (!select) return { changed: false, reason: 'language selector not found' };
      const previous = select.value;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, 'ru');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return { changed: true, previous };
    })()`,
    returnByValue: true
  });
  let localeLive = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    const state = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({ lang: document.documentElement.lang, stored: localStorage.getItem('lastbrowser.locale'), preferencesHeading: document.querySelector('.settings-section-button.active .settings-section-button-text strong')?.textContent?.trim() || '' })`,
      returnByValue: true
    });
    localeLive = JSON.parse(state.result.value || '{}');
    if (localeLive.lang === 'ru' && localeLive.stored === 'ru') break;
    await sleep(100);
  }
  const localeTranslated = /предпочт|настройк/i.test(localeLive?.preferencesHeading || '');
  const localeApplied = openPreferences.result.value === 'CLICKED' && preferencesReady
    && localeChange.result.value?.changed === true && localeLive?.lang === 'ru'
    && localeLive?.stored === 'ru' && localeTranslated;
  const restoreLocale = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const select = [...document.querySelectorAll('.settings-panel-scroll select')].find(item => [...item.options].some(option => option.value === 'en'));
      if (!select) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, 'en');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
    returnByValue: true
  });
  let localeRestored = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const state = await cdp.send('Runtime.evaluate', {
      expression: `document.documentElement.lang === 'en' && localStorage.getItem('lastbrowser.locale') === 'en'`,
      returnByValue: true
    });
    if (state.result.value) { localeRestored = true; break; }
    await sleep(100);
  }
  check('Preferences changes locale live and persists it in the isolated profile', localeApplied && restoreLocale.result.value && localeRestored,
    `preferences=${openPreferences.result.value}/${preferencesReady}, change=${JSON.stringify(localeChange.result.value)}, live=${JSON.stringify(localeLive)}, restore=${restoreLocale.result.value}/${localeRestored}`);
  await sleep(400);

  // Exercise the Appearance controls through the running settings UI and
  // verify both the live DOM effect and the saved profile value. This profile
  // is isolated and removed at the end of the smoke run.
  const openAppearance = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = [...document.querySelectorAll('.settings-section-button')].find(el => /appearance|darstellung/i.test(el.innerText || '')); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  const appearanceReady = await waitForUi('.settings-theme-grid', true);
  const appearanceRuntimeProbe = await cdp.send('Runtime.evaluate', {
    expression: 'Promise.resolve(window.lastbrowser.services.status()).then(value => JSON.stringify(value))',
    awaitPromise: true,
    returnByValue: true
  });
  const appearancePreview = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      window.__appearanceSaveEvents = [];
      window.addEventListener('lastbrowser:settings-changed', event => {
        const detail = event.detail?.settings || event.detail || {};
        window.__appearanceSaveEvents.push({
          theme: detail.theme,
          skin: detail.skin,
          font_size: detail.font_size,
          message_layout: detail.message_layout,
          timestamp: Date.now()
        });
      });
      const theme = document.querySelector('.settings-theme-grid button:nth-of-type(2)');
      const skins = [...document.querySelectorAll('.settings-skin-btn')];
      const skin = skins.find(button => !button.classList.contains('active'));
      const size = document.querySelector('.settings-size-grid button:nth-of-type(3)');
      const layout = document.querySelector('.settings-layout-grid button:nth-of-type(2)');
      if (!theme || !skin || !size || !layout) return { ready: false };
      theme.click(); skin.click(); size.click(); layout.click();
      return { ready: true, expectedSkin: skin.querySelector('strong')?.textContent?.trim() || '' };
    })()`,
    returnByValue: true
  });
  await sleep(300);
  const previewState = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({ theme: document.documentElement.dataset.theme, skin: document.documentElement.dataset.skin, font: document.documentElement.dataset.fontSize, layout: document.documentElement.dataset.messageLayout, colorScheme: getComputedStyle(document.documentElement).colorScheme })`,
    returnByValue: true
  });
  const liveAppearance = JSON.parse(previewState.result.value || '{}');
  const appearanceSaved = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.settings-floating-action-bar .primary-action'); if (!button) return 'AUTO_SAVE'; if (button.disabled) return 'NOT_READY'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  const appearanceSaveWaitStarted = Date.now();
  let savedAppearance = null;
  for (let attempt = 0; attempt < 120; attempt++) {
    const status = await cdp.send('Runtime.evaluate', {
      expression: 'Promise.resolve(window.lastbrowser.services.status()).then(value => JSON.stringify(value))',
      awaitPromise: true,
      returnByValue: true
    });
    const runtimeStatus = JSON.parse(status.result.value || '{}');
    if (runtimeStatus.sidekick !== 'ready' || runtimeStatus.webuiHealth !== 'ready') {
      await sleep(500);
      continue;
    }
    const saved = await cdp.send('Runtime.evaluate', {
      expression: `(async () => { try { const response = await window.lastbrowser.sidekick.getSettings(); return JSON.stringify(response?.settings || response || {}); } catch { return '{}'; } })()`,
      awaitPromise: true,
      returnByValue: true
    });
    savedAppearance = JSON.parse(saved.result.value || '{}');
    if (savedAppearance.theme === 'light' && savedAppearance.font_size === 'large' && savedAppearance.message_layout === 'compact') break;
    await sleep(500);
  }
  const appearanceSaveWaitMs = Date.now() - appearanceSaveWaitStarted;
  const appearancePassed = openAppearance.result.value === 'CLICKED' && appearanceReady
    && appearancePreview.result.value?.ready && liveAppearance.theme === 'light'
    && liveAppearance.skin && liveAppearance.font === 'large' && liveAppearance.layout === 'compact'
    && liveAppearance.colorScheme === 'light' && ['CLICKED', 'AUTO_SAVE', 'NOT_READY'].includes(appearanceSaved.result.value)
    && savedAppearance.theme === 'light' && savedAppearance.font_size === 'large' && savedAppearance.message_layout === 'compact';
  const appearanceSaveEvents = await cdp.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__appearanceSaveEvents||[])',
    returnByValue: true
  });
  const appearanceSaveErrors = rendererDiagnostics.filter(message => /settings|save/i.test(message)).slice(-5);
  check('Appearance controls update the live theme, skin, font and message layout and persist', appearancePassed,
    `section=${openAppearance.result.value}/${appearanceReady}, runtime=${appearanceRuntimeProbe.result.value}, save=${appearanceSaved.result.value}, persistedAfterMs=${appearanceSaveWaitMs}, preview=${JSON.stringify(liveAppearance)}, saved=${JSON.stringify({ theme: savedAppearance.theme, skin: savedAppearance.skin, font_size: savedAppearance.font_size, message_layout: savedAppearance.message_layout })}, events=${appearanceSaveEvents.result.value}, saveErrors=${JSON.stringify(appearanceSaveErrors)}`);
  if (process.env.LASTBROWSER_SMOKE_APPEARANCE_ONLY === '1') {
    cdp.close();
    finish(child);
    return;
  }

  // Exercise bundled accessibility typography and one persisted accessibility
  // toggle through the real Settings controls. Reset the accessibility card
  // afterwards so later browser checks run with the default tab layout/font.
  const openAccessibilityPreferences = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelectorAll('.settings-section-button')[2]; if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  const accessibilityPreferencesReady = await cdp.send('Runtime.evaluate', {
    expression: `(() => [...document.querySelectorAll('select')].some(select => [...select.options].some(option => option.value === 'opendyslexic')))()`,
    returnByValue: true
  });
  const accessibilitySettings = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const master = [...document.querySelectorAll('.settings-toggle-card')]
        .find(label => /enable vision-impaired mode/i.test(label.innerText || ''))?.querySelector('input[type="checkbox"]');
      const font = [...document.querySelectorAll('select')]
        .find(select => [...select.options].some(option => option.value === 'opendyslexic'));
      if (!master || !font) return { ready: false, reason: 'vision-impaired controls not found', master: Boolean(master), font: Boolean(font) };
      if (!master.checked) master.click();
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(font, 'opendyslexic');
      font.dispatchEvent(new Event('change', { bubbles: true }));
      const toggle = [...document.querySelectorAll('.settings-toggle-card')]
        .find(label => /super-sized vertical tabs|super-siz/i.test(label.innerText || ''));
      const checkbox = toggle?.querySelector('input[type="checkbox"]');
      if (!checkbox) return { ready: false, reason: 'super tabs toggle not found' };
      if (!checkbox.checked) checkbox.click();
      return { ready: true, toggleFound: true };
    })()` ,
    returnByValue: true
  });
  await sleep(250);
  const accessibilityEnabled = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      await document.fonts.load('16px OpenDyslexic');
      const config = JSON.parse(localStorage.getItem('lastbrowser.a11y.visionImpaired.v2') || '{}');
      const root = document.documentElement;
      const tabs = document.querySelector('.lb-supertabs');
      return {
        enabled: config.enabled,
        enabledDom: root.dataset.a11yViEnabled,
        settingFont: config.fontFamily,
        domFont: root.dataset.a11yFont,
        computedFont: getComputedStyle(document.body).fontFamily,
        fontLoaded: document.fonts.check('16px OpenDyslexic'),
        superTabsSetting: config.superSizedVerticalTabs,
        superTabsDom: root.dataset.a11ySuperTabs,
        superTabsRendered: Boolean(tabs)
      };
    })()` ,
    awaitPromise: true,
    returnByValue: true
  });
  const a11yEnabled = accessibilityEnabled.result.value || {};
  const accessibilityReset = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const card = [...document.querySelectorAll('.settings-card')]
        .find(element => element.querySelector('.settings-toggle-card input[type="checkbox"]')
          && /super-sized vertical tabs|super-siz/i.test(element.innerText || ''));
      const reset = card?.querySelector('.settings-card-header .secondary-action');
      if (!reset) return false;
      reset.click();
      return true;
    })()` ,
    returnByValue: true
  });
  await sleep(150);
  const accessibilityResetState = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({ config: JSON.parse(localStorage.getItem('lastbrowser.a11y.visionImpaired.v2') || '{}'), font: document.documentElement.dataset.a11yFont, superTabs: document.documentElement.dataset.a11ySuperTabs, rendered: Boolean(document.querySelector('.lb-supertabs')) })`,
    returnByValue: true
  });
  const a11yReset = JSON.parse(accessibilityResetState.result.value || '{}');
  const accessibilityPassed = openAccessibilityPreferences.result.value === 'CLICKED'
    && accessibilityPreferencesReady.result.value === true && accessibilitySettings.result.value?.ready === true
    && a11yEnabled.enabled === true && a11yEnabled.enabledDom === 'true'
    && a11yEnabled.settingFont === 'opendyslexic' && a11yEnabled.domFont === 'opendyslexic'
    && /OpenDyslexic/i.test(a11yEnabled.computedFont) && a11yEnabled.fontLoaded === true
    && a11yEnabled.superTabsSetting === true && a11yEnabled.superTabsDom === 'true'
    && accessibilityReset.result.value === true
    && a11yReset.config?.fontFamily === 'system' && a11yReset.config?.superSizedVerticalTabs === false
    && a11yReset.font === 'system' && a11yReset.superTabs === 'false' && !a11yReset.rendered;
  check('Accessibility applies bundled OpenDyslexic and persisted Super Tabs, then resets both', accessibilityPassed,
    `preferences=${openAccessibilityPreferences.result.value}/${accessibilityPreferencesReady.result.value}, select=${JSON.stringify(accessibilitySettings.result.value)}, enabled=${JSON.stringify(a11yEnabled)}, reset=${accessibilityReset.result.value}/${JSON.stringify(a11yReset)}`);

  // Run the actual Doctor Dashboard from Settings. Compare the visual counters
  // against status markers in the raw `sidekick doctor` output so this catches
  // stale summaries and renderer/parser drift, not just a rendered heading.
  const openDoctorSettings = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = [...document.querySelectorAll('.settings-section-button')].find(el => /^system$/i.test(el.querySelector('strong')?.textContent?.trim() || '')); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  let doctorVisual = null;
  for (let attempt = 0; attempt < 300; attempt++) {
    const state = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const card = [...document.querySelectorAll('.settings-card')].find(item => (item.innerText || '').includes('System-Diagnose (sidekick doctor)'));
        if (!card) return null;
        const text = card.innerText || '';
        const passed = text.match(/✓\\s*\\d+\\s*Passed/)?.[0];
        const warnings = text.match(/⚠\\s*\\d+\\s*Warnings/)?.[0];
        const failures = text.match(/✗\\s*\\d+\\s*Errors/)?.[0];
        const rawButton = [...card.querySelectorAll('button')].find(button => /Raw Log/.test(button.innerText || ''));
        return { passed, warnings, failures, rawButton: Boolean(rawButton), hasCategory: /Python Environment/.test(text), cardText: text.slice(0, 500) };
      })()` ,
      returnByValue: true
    });
    doctorVisual = state.result.value;
    if (doctorVisual?.passed && doctorVisual?.warnings && doctorVisual?.failures && doctorVisual?.rawButton) break;
    await sleep(200);
  }
  const openDoctorRaw = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const card = [...document.querySelectorAll('.settings-card')].find(item => (item.innerText || '').includes('System-Diagnose (sidekick doctor)')); const button = [...(card?.querySelectorAll('button') || [])].find(item => /Raw Log/.test(item.innerText || '')); if (!button) return false; button.click(); return true; })()` ,
    returnByValue: true
  });
  let doctorRaw = '';
  for (let attempt = 0; attempt < 30; attempt++) {
    const raw = await cdp.send('Runtime.evaluate', {
      expression: `(() => [...document.querySelectorAll('.settings-card')].find(item => (item.innerText || '').includes('System-Diagnose (sidekick doctor)'))?.querySelector('pre')?.textContent || '')()` ,
      returnByValue: true
    });
    doctorRaw = raw.result.value || '';
    if (doctorRaw.includes('Sidekick Doctor')
      && (/All checks passed!/i.test(doctorRaw) || /Completed with \d+ warning\(s\); no blocking errors\./i.test(doctorRaw))) break;
    await sleep(200);
  }
  const cleanDoctorRaw = doctorRaw.replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\u001b\].*?\u0007/g, '');
  const doctorCliCounts = {
    passed: (cleanDoctorRaw.match(/[✓✔]\s+/g) || []).length,
    warnings: (cleanDoctorRaw.match(/⚠\s+/g) || []).length,
    failures: (cleanDoctorRaw.match(/[✗✘]\s+/g) || []).length
  };
  const doctorWarningLines = cleanDoctorRaw.split(/\r?\n/)
    .filter(line => /⚠\s+/.test(line))
    .map(line => line.trim()
      .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[redacted-key]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[redacted-email]'));
  const displayedDoctorCounts = {
    passed: Number(doctorVisual?.passed?.match(/\d+/)?.[0] ?? -1),
    warnings: Number(doctorVisual?.warnings?.match(/\d+/)?.[0] ?? -1),
    failures: Number(doctorVisual?.failures?.match(/\d+/)?.[0] ?? -1)
  };
  const doctorCountsMatch = Object.keys(doctorCliCounts).every(key => doctorCliCounts[key] === displayedDoctorCounts[key]);
  const doctorCliSucceeded = /All checks passed!/i.test(cleanDoctorRaw) && doctorCliCounts.warnings === 0;
  const doctorRawButton = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const card = [...document.querySelectorAll('.settings-card')].find(item => (item.innerText || '').includes('System-Diagnose (sidekick doctor)')); const button = [...(card?.querySelectorAll('button') || [])].find(item => /^Visual$/.test(item.innerText?.trim() || '')); if (!button) return false; button.click(); return true; })()` ,
    returnByValue: true
  });
  check('Doctor Dashboard renders visual and raw output with matching successful CLI counts',
    openDoctorSettings.result.value === 'CLICKED' && doctorVisual?.hasCategory === true
    && openDoctorRaw.result.value === true && doctorCliSucceeded
    && doctorCountsMatch && doctorCliCounts.warnings === 0 && doctorCliCounts.failures === 0 && doctorRawButton.result.value === true
    && doctorWarningLines.length === doctorCliCounts.warnings,
    `section=${openDoctorSettings.result.value}, visual=${JSON.stringify(displayedDoctorCounts)}, raw=${JSON.stringify(doctorCliCounts)}, categories=${doctorVisual?.hasCategory}, success=${doctorCliSucceeded}, warningLines=${JSON.stringify(doctorWarningLines)}, rawViewRestored=${doctorRawButton.result.value}`);

  const cdpSettingsSmoke = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const api = window.lastbrowser?.cdp;
      const card = [...document.querySelectorAll('.settings-card')].find(item => /browser automation/i.test(item.querySelector('.settings-card-header strong')?.textContent || ''));
      const toggle = [...(card?.querySelectorAll('.settings-toggle-card') || [])].find(label => /enable browser automation/i.test(label.innerText || ''))?.querySelector('input[type="checkbox"]');
      if (!api?.getPreference || !api?.savePreference || !card || !toggle) return { ok: false, reason: 'missing settings UI or API' };
      const original = await api.getPreference();
      const initialNotice = /restart lastbrowser/i.test(card.innerText || '');
      const nextEnabled = !original.enabled;
      toggle.click();
      let changed = null;
      for (let i = 0; i < 30; i++) { await new Promise(resolve => setTimeout(resolve, 50)); changed = await api.getPreference(); if (changed.enabled === nextEnabled) break; }
      const changedCheckbox = [...(card.querySelectorAll('.settings-toggle-card') || [])].find(label => /enable browser automation/i.test(label.innerText || ''))?.querySelector('input[type="checkbox"]');
      if (changedCheckbox && changedCheckbox.checked !== original.enabled) changedCheckbox.click();
      let restored = null;
      for (let i = 0; i < 30; i++) { await new Promise(resolve => setTimeout(resolve, 50)); restored = await api.getPreference(); if (restored.enabled === original.enabled) break; }
      const restartLater = [...(card.querySelectorAll('button') || [])].find(button => /^(later|später|più tardi|más tarde|plus tard|mais tarde|позже)$/i.test(button.innerText?.trim() || ''));
      const hadRestartNotice = original.enabled !== original.active || nextEnabled !== original.active;
      if (restartLater) restartLater.click();
      return { ok: changed?.enabled === nextEnabled && restored?.enabled === original.enabled && (!hadRestartNotice || Boolean(restartLater)), initialNotice, active: original.active, original: original.enabled, changed: changed?.enabled, restored: restored?.enabled, restartLater: Boolean(restartLater) };
    })()` ,
    awaitPromise: true,
    returnByValue: true
  });
  check('browser automation setting persists and offers restart-later when runtime must change',
    cdpSettingsSmoke.result.value?.ok === true,
    JSON.stringify(cdpSettingsSmoke.result.value));

  const returnToWeb = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.modern-back-to-web-btn'); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  const browserPanelRestored = await waitForUi('.browser-webview-frame', true);
  check('returning from settings restores the browser panel', returnToWeb.result.value === 'CLICKED' && browserPanelRestored,
    `${returnToWeb.result.value}, visible=${browserPanelRestored}`);

  const reopenSettingsForSuperTabs = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.nova-dock-actions-group button:has(svg.lucide-settings), .expanded-bottom-footer button:has(svg.lucide-settings), .shell-rail button:has(svg.lucide-settings)'); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  const settingsForSuperTabsReady = await waitForUi('.app-shell.panel-settings', true);
  const openPreferencesForSuperTabs = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelectorAll('.settings-section-button')[2]; if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  await waitForUi('.settings-panel-scroll', true);
  const enableSuperTabsInSettings = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const master = [...document.querySelectorAll('.settings-toggle-card')].find(label => /enable vision-impaired mode/i.test(label.innerText || ''))?.querySelector('input[type="checkbox"]');
      const tabs = [...document.querySelectorAll('.settings-toggle-card')].find(label => /super-sized vertical tabs|super-siz/i.test(label.innerText || ''))?.querySelector('input[type="checkbox"]');
      if (!master || !tabs) return { ok: false, master: Boolean(master), tabs: Boolean(tabs) };
      if (!master.checked) master.click();
      if (!tabs.checked) tabs.click();
      return { ok: true, checked: tabs.checked };
    })()`,
    returnByValue: true
  });
  const returnToBrowserForSuperTabs = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.modern-back-to-web-btn'); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  const superTabsRenderedLive = await waitForUi('.lb-supertabs .lb-supertab-activate', true);
  const superTabsLiveState = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({ strip: Boolean(document.querySelector('.lb-supertabs')), tiles: document.querySelectorAll('.lb-supertab-tile').length, actions: document.querySelectorAll('.lb-supertab-activate').length, active: document.querySelector('.lb-supertab-tile.active')?.getAttribute('aria-label') || '' })`,
    returnByValue: true
  });
  const superTabsData = JSON.parse(superTabsLiveState.result.value || '{}');
  check('Super Tabs are visibly rendered with interactive tab actions in Browser view',
    settingsForSuperTabsReady && openPreferencesForSuperTabs.result.value === 'CLICKED'
      && enableSuperTabsInSettings.result.value?.ok === true
      && returnToBrowserForSuperTabs.result.value === 'CLICKED' && superTabsRenderedLive
      && superTabsData.strip === true && superTabsData.tiles > 0 && superTabsData.actions > 0,
    `settings=${settingsForSuperTabsReady}/${openPreferencesForSuperTabs.result.value}, toggle=${JSON.stringify(enableSuperTabsInSettings.result.value)}, return=${returnToBrowserForSuperTabs.result.value}, rendered=${superTabsRenderedLive}, state=${JSON.stringify(superTabsData)}`);
  const reopenSettingsToResetSuperTabs = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.nova-dock-actions-group button:has(svg.lucide-settings), .expanded-bottom-footer button:has(svg.lucide-settings), .shell-rail button:has(svg.lucide-settings)'); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  await waitForUi('.app-shell.panel-settings', true);
  await cdp.send('Runtime.evaluate', { expression: `document.querySelectorAll('.settings-section-button')[2]?.click()`, returnByValue: true });
  const resetSuperTabsButton = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const card = [...document.querySelectorAll('.settings-card')].find(element => /super-sized vertical tabs|super-siz/i.test(element.innerText || '')); const reset = card?.querySelector('.settings-card-header .secondary-action'); if (!reset) return false; reset.click(); return true; })()`,
    returnByValue: true
  });
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.modern-back-to-web-btn')?.click()`, returnByValue: true });
  await waitForUi('.browser-webview-frame', true);
  check('Super Tabs smoke restores the user accessibility defaults', reopenSettingsToResetSuperTabs.result.value === 'CLICKED' && resetSuperTabsButton.result.value === true,
    `settings=${reopenSettingsToResetSuperTabs.result.value}, reset=${resetSuperTabsButton.result.value}`);

  const enterZen = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.nova-dock .toggle-expand-btn, .modern-titlebar .sidebar-toggle'); if (!button || document.querySelector('.app-shell.zen-mode')) return 'NOT_READY'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  let zenActive = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const state = await cdp.send('Runtime.evaluate', { expression: `Boolean(document.querySelector('.app-shell.zen-mode .zen-left-hover-sensor'))`, returnByValue: true });
    if (state.result.value) { zenActive = true; break; }
    await sleep(100);
  }
  const zenSensor = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const element = document.querySelector('.zen-left-hover-sensor'); if (!element) return null; const rect = element.getBoundingClientRect(); return { x: Math.max(1, rect.left + Math.min(rect.width / 2, 3)), y: rect.top + rect.height / 2, rect: { x: rect.x, width: rect.width, height: rect.height } }; })()`,
    returnByValue: true
  });
  if (zenSensor.result.value) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: zenSensor.result.value.x, y: zenSensor.result.value.y });
  }
  let zenRevealed = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const state = await cdp.send('Runtime.evaluate', { expression: `Boolean(document.querySelector('.zen-sidebar-overlay.zen-revealed'))`, returnByValue: true });
    if (state.result.value) { zenRevealed = true; break; }
    await sleep(100);
  }
  let zenHiddenAfterLeave = false;
  if (zenRevealed) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 500, y: 400 });
    // The overlay hides after a 350 ms leave timer. Poll instead of taking
    // one fixed snapshot so a busy renderer cannot turn the timer into a
    // false negative in this end-to-end smoke.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      zenHiddenAfterLeave = (await cdp.send('Runtime.evaluate', {
        expression: `!document.querySelector('.zen-sidebar-overlay')?.classList.contains('zen-revealed')`,
        returnByValue: true
      })).result.value;
      if (zenHiddenAfterLeave) break;
      await sleep(100);
    }
  }
  check('Zen sidebar reveals on left-edge hover and hides after leaving', enterZen.result.value === 'CLICKED' && zenActive && zenSensor.result.value && zenRevealed && zenHiddenAfterLeave,
    `enter=${enterZen.result.value}, active=${zenActive}, sensor=${JSON.stringify(zenSensor.result.value?.rect)}, revealed=${zenRevealed}, hiddenAfterLeave=${zenHiddenAfterLeave}`);
  const dockZenSidebar = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.zen-sidebar-overlay .sidebar-dock-pin-btn'); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true
  });
  const zenModeExited = dockZenSidebar.result.value && await waitForUi('.app-shell.zen-mode', false);
  check('Zen smoke returns to docked sidebar mode after hover testing', zenModeExited,
    `dock=${dockZenSidebar.result.value}, exited=${zenModeExited}`);

  // Exercise the full Space setup flow in the isolated profile. The audio
  // continuity check below needs a second real Space to switch to and back.
  const expandSidebar = await cdp.send('Runtime.evaluate', {
    expression: `(() => { if (document.querySelector('.expanded-workspace-pill')) return 'ALREADY_EXPANDED'; const button = document.querySelector('.nova-dock .toggle-expand-btn, .modern-titlebar .sidebar-toggle'); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  const workspacePickerReady = await waitForUi('.expanded-workspace-pill', true);
  const openWorkspacePicker = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.expanded-workspace-pill'); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  const workspaceFlyoutReady = await waitForUi('.workspace-picker-flyout', true);
  const openSpaceSetup = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.workspace-picker-flyout .workspace-create-btn'); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  const spaceSetupVisible = await waitForLaidOutUi('.space-setup-modal[role="dialog"]', true);
  check('Space setup opens from the workspace picker', workspacePickerReady && openWorkspacePicker.result.value === 'CLICKED' && workspaceFlyoutReady && openSpaceSetup.result.value === 'CLICKED' && spaceSetupVisible,
    `expand=${expandSidebar.result.value}, picker=${workspaceFlyoutReady}, button=${openSpaceSetup.result.value}, wizard=${spaceSetupVisible}`);
  const testSpaceName = `Smoke Audio ${process.pid}`;
  const setSpaceName = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const modal = document.querySelector('.space-setup-modal'); const input = modal?.querySelector('.space-setup-input'); if (!input) return 'NO_NAME_INPUT'; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, ${JSON.stringify(testSpaceName)}); input.dispatchEvent(new Event('input', { bubbles: true })); return input.value; })()`,
    returnByValue: true
  });
  const nextSpaceSetupStep = async () => {
    const result = await cdp.send('Runtime.evaluate', {
      expression: `(() => { const button = document.querySelector('.space-setup-modal .space-btn.primary:not(.finish)'); if (!button || button.disabled) return false; button.click(); return true; })()`,
      returnByValue: true
    });
    await sleep(100);
    return result.result.value;
  };
  const movedToModelStep = await nextSpaceSetupStep();
  const modelStepVisible = await waitForUi('.space-setup-modal .space-models-list', true);
  const movedToAppsStep = await nextSpaceSetupStep();
  const appsStepVisible = await waitForUi('.space-setup-modal .space-apps-selector-grid', true);
  const setSpaceStartPage = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const inputs = [...document.querySelectorAll('.space-setup-modal .space-setup-input')]; const input = inputs.at(-1); if (!input) return 'NO_START_PAGE_INPUT'; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, 'app://browser-home'); input.dispatchEvent(new Event('input', { bubbles: true })); return input.value; })()`,
    returnByValue: true
  });
  const createSpace = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.space-setup-modal .space-btn.primary.finish'); if (!button || button.disabled) return false; button.click(); return true; })()`,
    returnByValue: true
  });
  let createdSpaceIsActive = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    const current = await cdp.send('Runtime.evaluate', {
      expression: `localStorage.getItem('lastbrowser.activeSpacePath.v1') || ''`,
      returnByValue: true
    });
    const modalClosed = await waitForUi('.space-setup-modal[role="dialog"]', false);
    if (modalClosed && String(current.result.value).replace(/\\/g, '/').toLowerCase().endsWith(`/smoke-audio-${process.pid}`)) {
      createdSpaceIsActive = true;
      break;
    }
    await sleep(250);
  }
  const pickerHasSecondSpace = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.expanded-workspace-pill'); button?.click(); return Boolean(button); })()`,
    returnByValue: true
  });
  const secondSpaceAvailable = pickerHasSecondSpace.result.value && await waitForUi('.workspace-picker-item:not(.active)', true);
  const pinnedAppsForTestSpace = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const activePath = localStorage.getItem('lastbrowser.activeSpacePath.v1'); return JSON.stringify({ activePath, spaces: JSON.parse(localStorage.getItem('lastbrowser.spaces.v1') || '[]'), pinnedApps: JSON.parse(localStorage.getItem('lastbrowser.pinnedApps.v2') || '[]').filter(app => app.spacePath === activePath), pickerActiveName: document.querySelector('.workspace-picker-item.active .workspace-item-name')?.textContent?.trim() || '', modalOpen: Boolean(document.querySelector('.space-setup-modal[role="dialog"]')), createError: document.querySelector('.space-setup-modal [role="alert"]')?.textContent?.trim() || '' }); })()`,
    returnByValue: true
  });
  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('.expanded-workspace-pill')?.click()`,
    returnByValue: true
  });
  const spaceRuntimeState = JSON.parse(pinnedAppsForTestSpace.result.value || '{}');
  const pinnedAppsCreated = spaceRuntimeState.pinnedApps || [];
  createdSpaceIsActive = !spaceRuntimeState.modalOpen
    && String(spaceRuntimeState.activePath || '').replace(/\\/g, '/').toLowerCase().endsWith(`/smoke-audio-${process.pid}`)
    && spaceRuntimeState.pickerActiveName === testSpaceName;
  check('Space setup creates and selects a second Space with its pinned apps',
    setSpaceName.result.value === testSpaceName && movedToModelStep && modelStepVisible && movedToAppsStep && appsStepVisible
      && setSpaceStartPage.result.value === 'app://browser-home' && createSpace.result.value && createdSpaceIsActive && secondSpaceAvailable && pinnedAppsCreated.length > 0,
    `name=${setSpaceName.result.value}, createClicked=${createSpace.result.value}, modelStep=${modelStepVisible}, appsStep=${appsStepVisible}, startPage=${setSpaceStartPage.result.value}, active=${createdSpaceIsActive}, activePath=${spaceRuntimeState.activePath}, picker=${spaceRuntimeState.pickerActiveName}, modal=${spaceRuntimeState.modalOpen}, createError=${spaceRuntimeState.createError}, alternate=${secondSpaceAvailable}, pinnedApps=${pinnedAppsCreated.length}`);

  // 3. Navigate via address bar form submit
  const navSubmission = await enterAddressThroughKeyboard(cdp, TEST_URL);
  check('address bar navigation submitted', Boolean(navSubmission?.submitted),
    navSubmission ? `typed=${navSubmission.typedValue}, suggestion=${navSubmission.selectedSuggestion}` : 'address field not found');

  // 4. Webview spawns + renders
  await sleep(8000);
  const targets2 = await cdpList();
  const webview = targets2.find((t) => t.type === 'webview' && t.url !== 'lastbrowser://start');
  check('webview target spawned', Boolean(webview), webview ? webview.url : 'none');

  if (webview) {
    let wvCdp = new CDP(webview.webSocketDebuggerUrl);
    let webviewSmokePhase = 'reading rendered page state';
    try {
      const render = await wvCdp.send('Runtime.evaluate', {
        expression: `JSON.stringify({
          url: location.href,
          title: document.title,
          readyState: document.readyState,
          bodyLength: document.body ? document.body.innerText.length : 0
        })`,
        returnByValue: true
      });
      const info = JSON.parse(render.result.value);
      check('webview renders page', info.readyState === 'complete' && info.bodyLength > 0,
        `${info.title || 'no title'} (${info.readyState})`);

      const magnifierShortcut = await cdp.send('Runtime.evaluate', {
        expression: `(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', code: 'KeyM', altKey: true, bubbles: true })); return true; })()`,
        returnByValue: true
      });
      const magnifierVisible = await waitForUi('.lb-split-magnifier', true);
      await sleep(900);
      const magnifierState = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const region = document.querySelector('.lb-split-magnifier'); const body = region?.querySelector('.lb-split-magnifier-body'); const rect = region?.getBoundingClientRect(); return { label: region?.getAttribute('aria-label') || '', heading: region?.querySelector('.lb-split-magnifier-header')?.innerText || '', text: body?.innerText || '', height: rect?.height || 0, frameHeight: document.querySelector('.browser-webview-frame')?.getBoundingClientRect().height || 0 }; })()`,
        returnByValue: true
      });
      const magnifierData = magnifierState.result.value || {};
      await cdp.send('Runtime.evaluate', {
        expression: `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', code: 'KeyM', altKey: true, bubbles: true })); true`,
        returnByValue: true
      });
      const magnifierHidden = await waitForUi('.lb-split-magnifier', false);
      const openSettingsAfterMagnifier = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const button = document.querySelector('.nova-dock-actions-group button:has(svg.lucide-settings), .expanded-bottom-footer button:has(svg.lucide-settings), .shell-rail button:has(svg.lucide-settings)'); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
        returnByValue: true
      });
      await waitForUi('.app-shell.panel-settings', true);
      await cdp.send('Runtime.evaluate', { expression: `document.querySelectorAll('.settings-section-button')[2]?.click()`, returnByValue: true });
      const resetAfterMagnifier = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const card = [...document.querySelectorAll('.settings-card')].find(element => /vision-impaired mode/i.test(element.innerText || '')); const reset = card?.querySelector('.settings-card-header .secondary-action'); if (!reset) return false; reset.click(); return true; })()`,
        returnByValue: true
      });
      await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.modern-back-to-web-btn')?.click()`, returnByValue: true });
      const browserRestoredAfterMagnifier = await waitForUi('.browser-webview-frame', true);
      check('Alt+M shows the active page paragraph in the translated split magnifier and toggles it off',
        magnifierShortcut.result.value === true && magnifierVisible && magnifierData.label === 'Split-screen magnifier'
          && /2\.5×|2\.5x/.test(magnifierData.heading) && magnifierData.text.length > 0
          && magnifierData.height >= magnifierData.frameHeight * 0.34 && magnifierHidden
          && openSettingsAfterMagnifier.result.value === 'CLICKED' && resetAfterMagnifier.result.value === true && browserRestoredAfterMagnifier,
        `visible=${magnifierVisible}, label=${magnifierData.label}, heading=${magnifierData.heading}, textLength=${magnifierData.text.length}, pane=${magnifierData.height}/${magnifierData.frameHeight}, hidden=${magnifierHidden}, reset=${openSettingsAfterMagnifier.result.value}/${resetAfterMagnifier.result.value}/${browserRestoredAfterMagnifier}`);

      // Capture only after the guest page has rendered; an early capture can
      // legitimately be empty while Electron is still replacing the blank tab.
      webviewSmokePhase = 'bounded guest page capture';
      const webviewCapture = await cdp.send('Runtime.evaluate', {
        expression: `(async () => {
          const guest = document.querySelector('.browser-tab-pane.active-tab-pane webview');
          const capture = window.lastbrowser?.system?.captureGuestRect;
          if (!guest || typeof capture !== 'function') return { available: false };
          const bounds = guest.getBoundingClientRect();
          const rect = { x: Math.max(0, bounds.width / 2 - 32), y: Math.max(0, bounds.height / 2 - 32), width: 64, height: 64 };
          const dataUrl = await capture(guest.getWebContentsId(), rect);
          if (typeof dataUrl !== 'string') return { available: true, dataUrl: false, length: 0, size: null, centerPixel: null };
          const preview = new Image();
          preview.src = dataUrl;
          await preview.decode();
          const canvas = document.createElement('canvas');
          canvas.width = preview.naturalWidth;
          canvas.height = preview.naturalHeight;
          const context = canvas.getContext('2d');
          if (!context) return { available: true, size: { width: preview.naturalWidth, height: preview.naturalHeight }, dataUrl: dataUrl.startsWith('data:image/'), length: dataUrl.length, centerPixel: null };
          context.drawImage(preview, 0, 0);
          const centerPixel = [...context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data];
          return { available: true, size: { width: preview.naturalWidth, height: preview.naturalHeight }, dataUrl: dataUrl.startsWith('data:image/'), length: dataUrl.length, centerPixel };
        })()` ,
        awaitPromise: true,
        returnByValue: true
      });
      const captureInfo = webviewCapture.result.value;
      if (cursorPoint?.visible) {
        check('guest WebView capture returns pixels or a bounded fallback result',
          captureInfo?.available && (!captureInfo.dataUrl || (captureInfo.length > 100
            && captureInfo.size?.width > 0 && captureInfo.size?.height > 0
            && captureInfo.centerPixel?.[3] > 0)),
          JSON.stringify(captureInfo));
      } else {
        skip('cursor loupe page capture requires a visible window', `window visible=${cursorPoint?.visible}`);
      }

      // Download a tiny local fixture through the real webview/session path.
      // The smoke launch overrides the download directory to this isolated
      // profile so no file can land in the user's Downloads folder.
      webviewSmokePhase = 'local file download and UI completion';
      const downloadRequestCountBefore = smokeDownloadRequestCount;
      const downloadPartition = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const view=[...document.querySelectorAll('webview.browser-view')].find((entry)=>entry.getClientRects().length); return view?.getAttribute('partition') || ''; })()`,
        returnByValue: true
      });
      const downloadNavigation = await enterAddressThroughKeyboard(cdp, downloadFixtureUrl);
      let downloadRequestObserved = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        if (smokeDownloadRequestCount > downloadRequestCountBefore) { downloadRequestObserved = true; break; }
        await sleep(100);
      }
      let completedDownload = null;
      for (let attempt = 0; attempt < 50; attempt++) {
        const state = await cdp.send('Runtime.evaluate', {
          expression: `(async () => JSON.stringify(await window.lastbrowser.downloads.list()))()`,
          awaitPromise: true,
          returnByValue: true
        }, 2000);
        if (state.exceptionDetails) throw new Error(`Could not read downloads list: ${state.exceptionDetails.text || 'Runtime.evaluate failed'}`);
        const entries = JSON.parse(state.result.value || '[]');
        completedDownload = entries.find((entry) => entry.filename === SMOKE_DOWNLOAD_NAME && entry.state === 'completed') || null;
        if (completedDownload) break;
        await sleep(100);
      }
      const openDownloadsPanel = await cdp.send('Runtime.evaluate', {
        expression: `(() => { if (document.querySelector('.downloads-panel[role="dialog"]')) return 'ALREADY_OPEN'; const trigger = [...document.querySelectorAll('.downloads-trigger')].find(button => button.getClientRects().length); if (!trigger) return 'NOT_AVAILABLE'; trigger.click(); return 'CLICKED'; })()`,
        returnByValue: true
      });
      const downloadsPanelReady = await waitForUi('.downloads-panel[role="dialog"]', true);
      const downloadRow = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const row = [...document.querySelectorAll('.download-row.completed')].find(item => item.querySelector('strong')?.textContent?.trim() === ${JSON.stringify(SMOKE_DOWNLOAD_NAME)}); return row ? { name: row.querySelector('strong')?.textContent?.trim(), savedTo: row.querySelector('small')?.textContent?.trim() || '' } : null; })()`,
        returnByValue: true
      });
      const downloadUiRow = downloadRow.result.value;
      const downloadListAfterPanel = await cdp.send('Runtime.evaluate', {
        expression: `(async () => JSON.stringify(await window.lastbrowser.downloads.list()))()`,
        awaitPromise: true,
        returnByValue: true
      }, 2000);
      if (downloadListAfterPanel.exceptionDetails) throw new Error(`Could not read downloads list after opening panel: ${downloadListAfterPanel.exceptionDetails.text || 'Runtime.evaluate failed'}`);
      const downloadApiEntriesAfterPanel = JSON.parse(downloadListAfterPanel.result.value || '[]');
      const downloadApiEntryAfterPanel = downloadApiEntriesAfterPanel.find((entry) => entry.filename === SMOKE_DOWNLOAD_NAME) || null;
      if (!completedDownload && downloadApiEntryAfterPanel?.state === 'completed') completedDownload = downloadApiEntryAfterPanel;
      const uiPathMatch = String(downloadUiRow?.savedTo || '').match(/[A-Za-z]:\\.+$/);
      const savedPath = uiPathMatch ? path.resolve(uiPathMatch[0]) : '';
      const relativeSavedPath = savedPath ? path.relative(path.resolve(SMOKE_DOWNLOAD_DIR), savedPath) : '';
      const savedInsideSmokeProfile = Boolean(relativeSavedPath)
        && !relativeSavedPath.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relativeSavedPath);
      const savedContentMatches = savedInsideSmokeProfile && existsSync(savedPath)
        && readFileSync(savedPath).equals(SMOKE_DOWNLOAD_CONTENT);
      const clearDownload = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const row = [...document.querySelectorAll('.download-row.completed')].find(item => item.querySelector('strong')?.textContent?.trim() === ${JSON.stringify(SMOKE_DOWNLOAD_NAME)}); const clear = row?.querySelector('button[aria-label]'); if (!clear) return false; clear.click(); return true; })()`,
        returnByValue: true
      });
      let downloadCleared = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        const state = await cdp.send('Runtime.evaluate', {
          expression: `Boolean([...document.querySelectorAll('.download-row.completed')].some(item => item.querySelector('strong')?.textContent?.trim() === ${JSON.stringify(SMOKE_DOWNLOAD_NAME)}))`,
          returnByValue: true
        });
        if (!state.result.value) { downloadCleared = true; break; }
        await sleep(100);
      }
      console.log('  INFO download fixture:', JSON.stringify({
        partition: downloadPartition.result.value,
        request: smokeLastDownloadRequest,
        completed: Boolean(completedDownload),
        files: readdirSync(SMOKE_DOWNLOAD_DIR),
      }));
      check('local browser download completes, saves the expected file and clears from the panel',
        Boolean(downloadNavigation?.submitted) && downloadRequestObserved && downloadUiRow?.name === SMOKE_DOWNLOAD_NAME
          && completedDownload?.state === 'completed' && downloadApiEntryAfterPanel?.state === 'completed'
          && savedContentMatches
          && ['CLICKED', 'ALREADY_OPEN'].includes(openDownloadsPanel.result.value) && downloadsPanelReady
          && downloadUiRow.savedTo.includes(path.basename(savedPath))
          && clearDownload.result.value === true && downloadCleared,
        `navigation=${Boolean(downloadNavigation?.submitted)}, typed=${downloadNavigation?.typedValue || ''}, suggestion=${downloadNavigation?.selectedSuggestion || ''}, requestObserved=${downloadRequestObserved}, fixtureRequests=${smokeDownloadRequestCount}, entry=${JSON.stringify(completedDownload && { filename: completedDownload.filename, state: completedDownload.state, received: completedDownload.received, total: completedDownload.total })}, apiEntryAfterPanel=${JSON.stringify(downloadApiEntryAfterPanel && { filename: downloadApiEntryAfterPanel.filename, state: downloadApiEntryAfterPanel.state, received: downloadApiEntryAfterPanel.received, total: downloadApiEntryAfterPanel.total })}, isolatedPath=${savedInsideSmokeProfile}, content=${savedContentMatches}, panel=${openDownloadsPanel.result.value}/${downloadsPanelReady}, row=${JSON.stringify(downloadUiRow)}, cleared=${downloadCleared}, addressTrace=${JSON.stringify(addressEntryTrace.slice(-1))}`);

      webviewSmokePhase = 'bookmark interactions';
      const bookmarkFixtureUrl = downloadFixtureUrl.replace(/\/download$/, '/page');
      const openBookmarkFixture = await enterAddressThroughKeyboard(cdp, bookmarkFixtureUrl);
      let bookmarkFixtureLoaded = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        const state = await cdp.send('Runtime.evaluate', {
          expression: `(() => { const view = document.querySelector('.browser-tab-pane.active-tab-pane webview.browser-view'); return { url: view?.getURL?.() || '', title: view?.getTitle?.() || '', loading: view?.isLoading?.() || false }; })()`,
          returnByValue: true
        });
        if (state.result.value?.url === bookmarkFixtureUrl && state.result.value.title === SMOKE_PAGE_TITLE && !state.result.value.loading) { bookmarkFixtureLoaded = true; break; }
        await sleep(100);
      }
      const addBookmark = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const button = document.querySelector('button.bookmark-star[aria-pressed="false"]'); if (!button || !button.getClientRects().length || button.disabled) return 'NOT_AVAILABLE'; button.click(); return 'CLICKED'; })()`,
        returnByValue: true
      });
      const bookmarkAdded = await waitForUi('button.bookmark-star[aria-pressed="true"]', true);
      const storedBookmark = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify(JSON.parse(localStorage.getItem('lastbrowser.bookmarks.v1') || '[]').map(bookmark => bookmark.url))`,
        returnByValue: true
      });
      const bookmarkUrls = JSON.parse(storedBookmark.result.value);
      const bookmarkStored = bookmarkUrls.includes(bookmarkFixtureUrl);
      const bookmarkRow = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const link = [...document.querySelectorAll('.bookmark-open')].find(button => button.title === ${JSON.stringify(bookmarkFixtureUrl)}); return { row: link ? { title: link.querySelector('span')?.textContent?.trim() || '', url: link.title } : null, bar: Boolean(document.querySelector('.bookmark-bar')), rows: [...document.querySelectorAll('.bookmark-open')].map(button => ({ title: button.querySelector('span')?.textContent?.trim() || '', url: button.title })), stored: JSON.parse(localStorage.getItem('lastbrowser.bookmarks.v1') || '[]') }; })()`,
        returnByValue: true
      });
      check('bookmark toolbar adds and persists the active page', openBookmarkFixture?.submitted && bookmarkFixtureLoaded
        && addBookmark.result.value === 'CLICKED' && bookmarkAdded && bookmarkStored
        && bookmarkRow.result.value?.stored?.some(item => item.url === bookmarkFixtureUrl && item.title === SMOKE_PAGE_TITLE),
        `${addBookmark.result.value}, loaded=${bookmarkFixtureLoaded}, marked=${bookmarkAdded}, stored=${bookmarkStored}, view=${JSON.stringify(bookmarkRow.result.value)}`);
      const navigateAwayFromBookmark = await enterAddressThroughKeyboard(cdp, 'https://example.com/');
      let awayFromBookmark = false;
      for (let attempt = 0; attempt < 40 && navigateAwayFromBookmark?.submitted; attempt++) {
        const state = await cdp.send('Runtime.evaluate', {
          expression: `document.querySelector('.browser-tab-pane.active-tab-pane webview.browser-view')?.getURL?.() || ''`,
          returnByValue: true
        });
        if (state.result.value.includes('example.com')) { awayFromBookmark = true; break; }
        await sleep(100);
      }
      let clickBookmark = { result: { value: false } };
      let bookmarkSource = 'none';
      if (bookmarkRow.result.value?.row) {
        clickBookmark = await cdp.send('Runtime.evaluate', {
          expression: `(() => { const button = [...document.querySelectorAll('.bookmark-open')].find(item => item.title === ${JSON.stringify(bookmarkFixtureUrl)}); if (!button) return false; button.click(); return true; })()`,
          returnByValue: true
        });
        bookmarkSource = 'bookmark bar';
      } else {
        const queryBookmark = await cdp.send('Runtime.evaluate', {
          expression: `(() => { const input = [...document.querySelectorAll('.addressbar input[aria-label]')].find(item => item.getClientRects().length); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, ${JSON.stringify(SMOKE_PAGE_TITLE)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); return true; })()`,
          returnByValue: true
        });
        let bookmarkSuggestion = null;
        for (let attempt = 0; attempt < 25; attempt++) {
          const state = await cdp.send('Runtime.evaluate', {
            expression: `(() => { const option = [...document.querySelectorAll('.omnibox-item')].find(item => item.querySelector('.omnibox-badge.bookmark') && item.querySelector('.omnibox-item-url')?.textContent?.trim() === ${JSON.stringify(bookmarkFixtureUrl)}); if (!option) return null; const rect = option.getBoundingClientRect(); const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; const hit = document.elementFromPoint(point.x, point.y); return { point, url: option.querySelector('.omnibox-item-url')?.textContent?.trim() || '', title: option.querySelector('.omnibox-item-title')?.textContent?.trim() || '', hit: hit?.className || hit?.tagName || '' }; })()`,
            returnByValue: true
          });
          bookmarkSuggestion = state.result.value;
          if (bookmarkSuggestion) break;
          await sleep(100);
        }
        if (queryBookmark.result.value && bookmarkSuggestion?.point) {
          await pressMouse(cdp, bookmarkSuggestion.point);
          await releaseMouse(cdp, bookmarkSuggestion.point);
          clickBookmark = { result: { value: true } };
          bookmarkSource = `omnibox ${bookmarkSuggestion.title} (${bookmarkSuggestion.hit})`;
        } else {
          bookmarkSource = `omnibox unavailable: ${JSON.stringify({ query: queryBookmark.result.value, suggestion: bookmarkSuggestion })}`;
        }
      }
      let bookmarkOpened = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        const state = await cdp.send('Runtime.evaluate', {
          expression: `(() => { const view = document.querySelector('.browser-tab-pane.active-tab-pane webview.browser-view'); return { url: view?.getURL?.() || '', title: view?.getTitle?.() || '', loading: view?.isLoading?.() || false }; })()`,
          returnByValue: true
        });
        if (state.result.value?.url === bookmarkFixtureUrl && state.result.value.title === SMOKE_PAGE_TITLE && !state.result.value.loading) { bookmarkOpened = true; break; }
        await sleep(100);
      }
      check('clicking a saved bookmark navigates the active WebView to its saved page', awayFromBookmark
        && clickBookmark.result.value && bookmarkOpened,
        `away=${awayFromBookmark}, source=${bookmarkSource}, click=${clickBookmark.result.value}, opened=${bookmarkOpened}`);
      if (!bookmarkOpened) {
        await enterAddressThroughKeyboard(cdp, bookmarkFixtureUrl);
        for (let attempt = 0; attempt < 40; attempt++) {
          const state = await cdp.send('Runtime.evaluate', {
            expression: `document.querySelector('.browser-tab-pane.active-tab-pane webview.browser-view')?.getURL?.() || ''`,
            returnByValue: true
          });
          if (state.result.value === bookmarkFixtureUrl) break;
          await sleep(100);
        }
      }
      const removeBookmark = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const button = document.querySelector('button.bookmark-star[aria-pressed="true"]'); if (!button || button.disabled) return false; button.click(); return true; })()`,
        returnByValue: true
      });
      const bookmarkRemoved = await waitForUi('button.bookmark-star[aria-pressed="false"]', true);
      const storedAfterRemoval = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify(JSON.parse(localStorage.getItem('lastbrowser.bookmarks.v1') || '[]').map(bookmark => bookmark.url))`,
        returnByValue: true
      });
      const bookmarkAbsent = !JSON.parse(storedAfterRemoval.result.value).includes(bookmarkFixtureUrl);
      check('bookmark toolbar removes the active page cleanly', removeBookmark.result.value && bookmarkRemoved && bookmarkAbsent,
        `remove=${removeBookmark.result.value}, marked=${bookmarkRemoved}, absent=${bookmarkAbsent}`);

      const importedBookmarkTitle = `Smoke Imported Bookmark ${process.pid}`;
      const importedBookmarkUrl = `${bookmarkFixtureUrl}?imported=1`;
      const bookmarkImportControl = await cdp.send('Runtime.evaluate', {
        expression: `Boolean(document.querySelector('.bookmark-bar input[type="file"]'))`,
        returnByValue: true
      });
      if (!bookmarkImportControl.result.value) {
        skip('bookmark JSON import uses the file input and can be removed again', 'the modern shell does not render the legacy BookmarkBar import/export control; import/export parser roundtrip is unit-tested');
      } else {
      const importBookmarkFile = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const input = document.querySelector('.bookmark-bar input[type="file"]');
          if (!input || typeof DataTransfer !== 'function' || typeof File !== 'function') return { ready: false, hasInput: Boolean(input), hasDataTransfer: typeof DataTransfer === 'function', hasFile: typeof File === 'function' };
          const content = JSON.stringify([{ id: 'smoke-import-${process.pid}', title: ${JSON.stringify(importedBookmarkTitle)}, url: ${JSON.stringify(importedBookmarkUrl)}, createdAt: Date.now() }]);
          const file = new File([content], 'lastbrowser-smoke-bookmarks.json', { type: 'application/json' });
          const transfer = new DataTransfer();
          transfer.items.add(file);
          input.files = transfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return { ready: true, files: input.files?.length || 0 };
        })()`,
        returnByValue: true
      });
      let importedBookmark = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        const state = await cdp.send('Runtime.evaluate', {
          expression: `JSON.stringify({ row: [...document.querySelectorAll('.bookmark-open')].some(button => button.querySelector('span')?.textContent?.trim() === ${JSON.stringify(importedBookmarkTitle)} && button.title === ${JSON.stringify(importedBookmarkUrl)}), stored: JSON.parse(localStorage.getItem('lastbrowser.bookmarks.v1') || '[]').some(item => item.title === ${JSON.stringify(importedBookmarkTitle)} && item.url === ${JSON.stringify(importedBookmarkUrl)}) })`,
          returnByValue: true
        });
        const imported = JSON.parse(state.result.value || '{}');
        if (imported.row && imported.stored) { importedBookmark = true; break; }
        await sleep(100);
      }
      const removeImportedBookmark = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const button = document.querySelector('.bookmark-remove[aria-label="Remove ${importedBookmarkTitle}"]'); if (!button) return false; button.click(); return true; })()`,
        returnByValue: true
      });
      let importedBookmarkRemoved = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        const state = await cdp.send('Runtime.evaluate', {
          expression: `!JSON.parse(localStorage.getItem('lastbrowser.bookmarks.v1') || '[]').some(item => item.title === ${JSON.stringify(importedBookmarkTitle)})`,
          returnByValue: true
        });
        if (state.result.value) { importedBookmarkRemoved = true; break; }
        await sleep(100);
      }
      const importFileReady = importBookmarkFile.result.value?.ready === true;
      check('bookmark JSON import uses the file input and can be removed again', importFileReady
        && importedBookmark && removeImportedBookmark.result.value && importedBookmarkRemoved,
        `input=${JSON.stringify(importBookmarkFile.result.value)}, imported=${importedBookmark}, removed=${removeImportedBookmark.result.value}/${importedBookmarkRemoved}`);
      }

      // Keep the permission check on the local fixture origin even if a
      // bookmark row is unavailable in a particular shell mode.
      await enterAddressThroughKeyboard(cdp, bookmarkFixtureUrl);
      for (let attempt = 0; attempt < 40; attempt++) {
        const state = await cdp.send('Runtime.evaluate', {
          expression: `document.querySelector('.browser-tab-pane.active-tab-pane webview.browser-view')?.getURL?.() || ''`,
          returnByValue: true
        });
        if (state.result.value === bookmarkFixtureUrl) break;
        await sleep(100);
      }

      // Exercise the per-site permission UI and main-process policy against
      // the real https guest. The isolated profile keeps this trust entry out
      // of the user's browser data.
      webviewSmokePhase = 'site permission trust and revoke';
      const permissionOrigin = new URL(downloadFixtureUrl).origin;
      const trustSite = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const button = document.querySelector('.site-permission-trigger'); if (!button || !button.getClientRects().length) return 'NOT_AVAILABLE'; button.click(); return 'CLICKED'; })()`,
        returnByValue: true
      });
      let siteTrusted = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        const state = await cdp.send('Runtime.evaluate', {
          expression: `window.lastbrowser.permissions.trustedOrigins()`,
          awaitPromise: true,
          returnByValue: true
        });
        if (Array.isArray(state.result.value) && state.result.value.includes(permissionOrigin)) { siteTrusted = true; break; }
        await sleep(100);
      }
      const trustedMedia = await cdp.send('Runtime.evaluate', {
        expression: `window.lastbrowser.permissions.decide({ permission: 'media', origin: ${JSON.stringify(permissionOrigin)} })`,
        awaitPromise: true,
        returnByValue: true
      });
      const unrelatedPermission = await cdp.send('Runtime.evaluate', {
        expression: `window.lastbrowser.permissions.decide({ permission: 'geolocation', origin: ${JSON.stringify(permissionOrigin)} })`,
        awaitPromise: true,
        returnByValue: true
      });
      const openPermissions = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const button = document.querySelector('.permissions-trigger'); if (!button) return 'NOT_AVAILABLE'; button.click(); return 'CLICKED'; })()`,
        returnByValue: true
      });
      const permissionPanelReady = await waitForUi('.permissions-panel[role="dialog"]', true);
      let permissionRow = { result: { value: '' } };
      let permissionOriginRendered = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        permissionRow = await cdp.send('Runtime.evaluate', {
          expression: `document.querySelector('.permissions-panel .permission-origin')?.textContent?.trim() || ''`,
          returnByValue: true
        });
        if (permissionRow.result.value === permissionOrigin) { permissionOriginRendered = true; break; }
        await sleep(100);
      }
      const revokePermission = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const button = document.querySelector('.permissions-panel .permission-row button'); if (!button) return false; button.click(); return true; })()`,
        returnByValue: true
      });
      let siteRevoked = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        const state = await cdp.send('Runtime.evaluate', {
          expression: `window.lastbrowser.permissions.trustedOrigins()`,
          awaitPromise: true,
          returnByValue: true
        });
        if (Array.isArray(state.result.value) && !state.result.value.includes(permissionOrigin)) { siteRevoked = true; break; }
        await sleep(100);
      }
      const revokedMedia = await cdp.send('Runtime.evaluate', {
        expression: `window.lastbrowser.permissions.decide({ permission: 'media', origin: ${JSON.stringify(permissionOrigin)} })`,
        awaitPromise: true,
        returnByValue: true
      });
      const permissionPassed = trustSite.result.value === 'CLICKED' && siteTrusted
        && trustedMedia.result.value === 'allow' && unrelatedPermission.result.value === 'deny'
        && openPermissions.result.value === 'CLICKED' && permissionPanelReady
        && permissionOriginRendered && permissionRow.result.value === permissionOrigin && revokePermission.result.value
        && siteRevoked && revokedMedia.result.value === 'deny';
      check('site permissions grant and revoke camera access without granting geolocation', permissionPassed,
        `trust=${trustSite.result.value}/${siteTrusted}, media=${trustedMedia.result.value}->${revokedMedia.result.value}, geolocation=${unrelatedPermission.result.value}, panel=${permissionPanelReady}, row=${permissionRow.result.value}/${permissionOriginRendered}, revoked=${siteRevoked}`);
      const closePermissions = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const button = document.querySelector('.permissions-panel button[aria-label="Close site permissions"]'); if (!button) return false; button.click(); return true; })()`,
        returnByValue: true
      });
      const permissionsClosed = await waitForUi('.permissions-panel[role="dialog"]', false);
      check('site-permissions dialog closes before subsequent native drag checks', closePermissions.result.value && permissionsClosed,
        `closeClick=${closePermissions.result.value}, closed=${permissionsClosed}`);

      // Start real WebAudio from a trusted page click, pin the tab, switch
      // Spaces away and back, then verify the same Electron guest stays alive
      // and unmuted. The isolated smoke profile is removed after the run.
      webviewSmokePhase = 'pinned audio continuity across Spaces';
      const audioTargetSnapshot = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify([...document.querySelectorAll('webview.browser-view')].map(view => ({ tabId: view.getAttribute('data-tab-id'), guestId: view.getWebContentsId(), url: view.getURL(), loading: view.isLoading() })))`,
        returnByValue: true
      });
      const audioTargets = await cdpList();
      const shellAudioViews = JSON.parse(audioTargetSnapshot.result.value || '[]');
      const liveAudioTarget = audioTargets.find(target => target.type === 'webview'
        && target.url === shellAudioViews[0]?.url && target.webSocketDebuggerUrl);
      if (liveAudioTarget && (wvCdp.ws.readyState !== WebSocket.OPEN || liveAudioTarget.id !== webview.id)) {
        wvCdp.close();
        wvCdp = new CDP(liveAudioTarget.webSocketDebuggerUrl);
        await wvCdp.ready;
      }
      console.log(`  INFO  audio CDP target snapshot — shell=${audioTargetSnapshot.result.value}, target=${JSON.stringify(audioTargets.filter(target => target.type === 'webview').map(({ id, url, webSocketDebuggerUrl }) => ({ id, url, ws: Boolean(webSocketDebuggerUrl) })))}, originalTarget=${webview.id}/${webview.url}, selectedTarget=${liveAudioTarget?.id || 'none'}, socketState=${wvCdp.ws.readyState}`);
      const audioButton = await wvCdp.send('Runtime.evaluate', {
        expression: `(() => {
          const button = document.createElement('button');
          button.id = 'lastbrowser-smoke-audio-start';
          button.textContent = 'Start local audio';
          Object.assign(button.style, { position: 'fixed', zIndex: '2147483647', top: '12px', right: '12px', padding: '16px', background: '#fff', color: '#000' });
          button.onclick = async () => {
            const player = new Audio(${JSON.stringify(createSmokeAudioDataUrl())});
            player.loop = true;
            player.volume = 0.05;
            await player.play();
            window.__lastbrowserSmokeAudio = { player, startedAt: performance.now() };
          };
          document.body.appendChild(button);
          const rect = button.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        })()`,
        returnByValue: true
      });
      const audioButtonPoint = audioButton.result.value;
      if (audioButtonPoint) {
        await wvCdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...audioButtonPoint });
        await wvCdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...audioButtonPoint });
        await wvCdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...audioButtonPoint });
      }
      let audioPlaying = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        const playing = await wvCdp.send('Runtime.evaluate', {
          expression: `Boolean(window.__lastbrowserSmokeAudio?.player.paused === false && window.__lastbrowserSmokeAudio.player.currentTime > 0.2)`,
          returnByValue: true
        });
        if (playing.result.value) { audioPlaying = true; break; }
        await sleep(100);
      }
      const audioStateDetected = await waitForUi('.vertical-tab-item.active .vtab-audio-btn', true);
      const pinAudioTab = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const active = document.querySelector('.vertical-tab-item.active'); const pin = active?.querySelector('.vertical-tab-pin-btn'); const view = document.querySelector('webview.browser-view'); if (!active || !pin || !view) return null; const space = document.querySelector('.workspace-badge-name')?.textContent?.trim() || ''; const title = active.querySelector('.vtab-title')?.textContent?.trim() || ''; pin.click(); return { tabId: view.getAttribute('data-tab-id'), guestId: view.getWebContentsId(), title, space }; })()`,
        returnByValue: true
      });
      const pinnedState = await waitForUi('.vertical-tab-item.active.pinned', true);
      let switchedAway = false;
      let spaceSwitchDetail = 'audio tab was not ready for Space switching';
      if (pinAudioTab.result.value && audioPlaying && audioStateDetected && pinnedState) {
        const openPicker = await cdp.send('Runtime.evaluate', {
          expression: `(() => { const button = document.querySelector('.expanded-workspace-pill'); if (!button) return false; button.click(); return true; })()`,
          returnByValue: true
        });
        const pickerReady = openPicker.result.value && await waitForUi('.workspace-picker-flyout', true);
        if (pickerReady) {
          const selectOther = await cdp.send('Runtime.evaluate', {
            expression: `(() => { const other = document.querySelector('.workspace-picker-item:not(.active)'); if (!other) return { clicked: false, available: document.querySelectorAll('.workspace-picker-item').length }; const name = other.querySelector('.workspace-item-name')?.textContent?.trim() || other.textContent.trim(); other.click(); return { clicked: true, name }; })()`,
            returnByValue: true
          });
          const selectResult = selectOther.result.value || {};
          spaceSwitchDetail = `picker=${pickerReady}, ${JSON.stringify(selectResult)}`;
          for (let attempt = 0; attempt < 30; attempt++) {
            const currentSpace = await cdp.send('Runtime.evaluate', {
              expression: `document.querySelector('.expanded-workspace-pill .workspace-badge-name')?.textContent?.trim() || ''`,
              returnByValue: true
            });
            if (currentSpace.result.value && currentSpace.result.value !== pinAudioTab.result.value.space) {
              switchedAway = true;
              break;
            }
            await sleep(100);
          }
        } else {
          spaceSwitchDetail = 'space selector button/dropdown unavailable';
        }
      }
      if (switchedAway) await sleep(1250);
      if (!switchedAway) {
        await cdp.send('Runtime.evaluate', {
          expression: `(() => { if (document.querySelector('.workspace-picker-flyout')) document.querySelector('.expanded-workspace-pill')?.click(); })()`,
          returnByValue: true
        });
      }
      const awayState = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const view = [...document.querySelectorAll('webview.browser-view')].find(item => item.getAttribute('data-tab-id') === ${JSON.stringify(pinAudioTab.result.value?.tabId || '')}); if (!view) return null; return { guestId: view.getWebContentsId(), muted: view.isAudioMuted(), audioButton: Boolean(document.querySelector('.vtab-audio-btn')) }; })()`,
        returnByValue: true
      });
      const sameGuestAway = awayState.result.value?.guestId === pinAudioTab.result.value?.guestId;
      const audioContinuesAway = await wvCdp.send('Runtime.evaluate', {
        expression: `(() => { const player = window.__lastbrowserSmokeAudio?.player; return { playing: Boolean(player && !player.paused && player.currentTime > 1), paused: player?.paused ?? true, currentTime: player?.currentTime || 0 }; })()`,
        returnByValue: true
      });
      let switchedBack = false;
      if (switchedAway) {
        const openPicker = await cdp.send('Runtime.evaluate', {
          expression: `(() => { const button = document.querySelector('.expanded-workspace-pill'); if (!button) return false; button.click(); return true; })()`,
          returnByValue: true
        });
        const pickerReady = openPicker.result.value && await waitForUi('.workspace-picker-flyout', true);
        if (pickerReady) {
          const selectOriginal = await cdp.send('Runtime.evaluate', {
            expression: `(() => { const original = ${JSON.stringify(pinAudioTab.result.value.space)}; const item = [...document.querySelectorAll('.workspace-picker-item')].find(entry => entry.querySelector('.workspace-item-name')?.textContent?.trim() === original); if (!item) return false; item.click(); return true; })()`,
            returnByValue: true
          });
          const originalSelected = selectOriginal.result.value;
          if (originalSelected) {
            for (let attempt = 0; attempt < 30; attempt++) {
              const currentSpace = await cdp.send('Runtime.evaluate', {
                expression: `document.querySelector('.expanded-workspace-pill .workspace-badge-name')?.textContent?.trim() || ''`,
                returnByValue: true
              });
              if (currentSpace.result.value === pinAudioTab.result.value.space) {
                switchedBack = true;
                break;
              }
              await sleep(100);
            }
          }
        }
      }
      const backState = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const view = [...document.querySelectorAll('webview.browser-view')].find(item => item.getAttribute('data-tab-id') === ${JSON.stringify(pinAudioTab.result.value?.tabId || '')}); return view ? { guestId: view.getWebContentsId(), muted: view.isAudioMuted() } : null; })()`,
        returnByValue: true
      });
      const currentSpaceAfterReturn = await cdp.send('Runtime.evaluate', {
        expression: `document.querySelector('.expanded-workspace-pill .workspace-badge-name')?.textContent?.trim() || ''`,
        returnByValue: true
      });
      const audioContinuesAfterReturn = await wvCdp.send('Runtime.evaluate', {
        expression: `(() => { const player = window.__lastbrowserSmokeAudio?.player; return { playing: Boolean(player && !player.paused && player.currentTime > 1), paused: player?.paused ?? true, currentTime: player?.currentTime || 0 }; })()`,
        returnByValue: true
      });
      const audioContinuityOk = Boolean(audioPlaying && audioStateDetected && pinnedState && switchedAway && sameGuestAway && awayState.result.value?.muted === false && audioContinuesAway.result.value?.playing && switchedBack && currentSpaceAfterReturn.result.value === pinAudioTab.result.value?.space && backState.result.value?.guestId === pinAudioTab.result.value?.guestId && backState.result.value?.muted === false && audioContinuesAfterReturn.result.value?.playing);
      check('pinned audio keeps the same unmuted WebView guest across Space switches', audioContinuityOk,
        `playing=${audioPlaying}, sidebarDetected=${audioStateDetected}, pinned=${pinnedState}, away=${switchedAway}, ${spaceSwitchDetail}, sameGuest=${sameGuestAway}, mutedAway=${awayState.result.value?.muted}, stillPlaying=${JSON.stringify(audioContinuesAway.result.value)}, back=${switchedBack}, selectedSpace=${currentSpaceAfterReturn.result.value}, sameGuestBack=${backState.result.value?.guestId === pinAudioTab.result.value?.guestId}, mutedBack=${backState.result.value?.muted}, playingBack=${JSON.stringify(audioContinuesAfterReturn.result.value)}`);
      await wvCdp.send('Runtime.evaluate', {
        expression: `window.__lastbrowserSmokeAudio?.player?.pause()`,
        returnByValue: true
      });
      const unpinAudioTab = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const title = ${JSON.stringify(pinAudioTab.result.value?.title || '')}; const tab = [...document.querySelectorAll('.vertical-tab-item.pinned')].find(item => item.querySelector('.vtab-title')?.textContent?.trim() === title); const button = tab?.querySelector('.vertical-tab-pin-btn'); if (!button) return false; button.click(); return true; })()`,
        returnByValue: true
      });
      let audioTabUnpinned = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        const state = await cdp.send('Runtime.evaluate', {
          expression: `(() => { const title = ${JSON.stringify(pinAudioTab.result.value?.title || '')}; const tab = [...document.querySelectorAll('.vertical-tab-item')].find(item => item.querySelector('.vtab-title')?.textContent?.trim() === title); return Boolean(tab && !tab.classList.contains('pinned')); })()`,
          returnByValue: true
        });
        if (state.result.value) { audioTabUnpinned = true; break; }
        await sleep(100);
      }
      check('pinned audio tab can be unpinned after returning to its Space', Boolean(unpinAudioTab.result.value) && audioTabUnpinned,
        `click=${JSON.stringify(unpinAudioTab.result.value)}, unpinned=${audioTabUnpinned}`);

      // Install a throwaway local MV3 extension through the real Electron IPC,
      // verify its content script, exercise disable/re-enable, then remove it.
      // Its source and profile are both private to this smoke run.
      webviewSmokePhase = 'extension install, toggle and removal';
      const extensionFixtureNavigation = await enterAddressThroughKeyboard(cdp, 'https://example.com/');
      let extensionFixtureReady = false;
      for (let attempt = 0; attempt < 40 && extensionFixtureNavigation?.submitted; attempt++) {
        const state = await cdp.send('Runtime.evaluate', {
          expression: `(() => { const view = document.querySelector('.browser-tab-pane.active-tab-pane webview.browser-view'); return { url: view?.getURL?.() || '', loading: view?.isLoading?.() || false }; })()`,
          returnByValue: true
        });
        if (state.result.value?.url.includes('example.com') && !state.result.value.loading) { extensionFixtureReady = true; break; }
        await sleep(100);
      }
      const installExtension = await cdp.send('Runtime.evaluate', {
        expression: `(async () => { try { const record = await window.lastbrowser.extensions.installUnpacked(${JSON.stringify(SMOKE_EXTENSION_DIR)}); const list = await window.lastbrowser.extensions.list(); return { id: record?.id || '', installed: Array.isArray(list) && list.some(item => item.id === record?.id), enabled: record?.enabled === true, error: '' }; } catch (error) { return { id: '', installed: false, enabled: false, error: String(error) }; } })()`,
        awaitPromise: true,
        returnByValue: true
      });
      const extensionState = installExtension.result.value || {};
      const reloadExtensionPage = async () => {
        const before = await wvCdp.send('Runtime.evaluate', {
          expression: `performance.timeOrigin`,
          returnByValue: true
        });
        const reload = await cdp.send('Runtime.evaluate', {
          expression: `(() => { const button = document.querySelector('.modern-titlebar .nav-reload'); if (!button) return false; button.click(); return true; })()`,
          returnByValue: true
        });
        if (!reload.result.value) return false;

        let observer = null;
        let observerTargetId = '';
        try {
          for (let attempt = 0; attempt < 60; attempt++) {
            const target = (await cdpList()).find((item) => item.type === 'webview' && item.url.includes('example.com'));
            if (target && target.id !== observerTargetId) {
              observer?.close();
              observer = new CDP(target.webSocketDebuggerUrl);
              observerTargetId = target.id;
            }
            if (observer) {
              try {
                const state = await observer.send('Runtime.evaluate', {
                  expression: `JSON.stringify({ ready: document.readyState, timeOrigin: performance.timeOrigin, loaded: document.documentElement?.dataset?.lastbrowserSmokeExtension === 'loaded' })`,
                  returnByValue: true
                }, 1000);
                const pageState = JSON.parse(state.result.value || '{}');
                if (pageState.ready === 'complete' && pageState.timeOrigin !== before.result.value) {
                  return pageState.loaded;
                }
              } catch {
                // Electron may replace a guest target during a reload. Reattach below.
                observer.close();
                observer = null;
                observerTargetId = '';
              }
            }
            await sleep(150);
          }
          return false;
        } finally {
          observer?.close();
        }
      };
      const extensionScriptLoaded = extensionState.id ? await reloadExtensionPage() : false;
      let extensionDisabled = false;
      let extensionRemoved = false;
      let extensionReenabled = false;
      if (extensionState.id) {
        const disabled = await cdp.send('Runtime.evaluate', {
          expression: `window.lastbrowser.extensions.toggle({ id: ${JSON.stringify(extensionState.id)}, enabled: false })`,
          awaitPromise: true,
          returnByValue: true
        });
        extensionDisabled = disabled.result.value?.enabled === false && !(await reloadExtensionPage());
        const enabled = await cdp.send('Runtime.evaluate', {
          expression: `window.lastbrowser.extensions.toggle({ id: ${JSON.stringify(extensionState.id)}, enabled: true })`,
          awaitPromise: true,
          returnByValue: true
        });
        extensionReenabled = enabled.result.value?.enabled === true && await reloadExtensionPage();
        const removed = await cdp.send('Runtime.evaluate', {
          expression: `(async () => { const removed = await window.lastbrowser.extensions.remove(${JSON.stringify(extensionState.id)}); const list = await window.lastbrowser.extensions.list(); return removed === true && !list.some(item => item.id === ${JSON.stringify(extensionState.id)}); })()`,
          awaitPromise: true,
          returnByValue: true
        });
        extensionRemoved = removed.result.value === true;
      }
      check('local extension installs, injects, disables, re-enables and removes cleanly',
        extensionFixtureReady && extensionState.installed && extensionState.enabled && extensionScriptLoaded && extensionDisabled && extensionReenabled && extensionRemoved,
        `fixture=${extensionFixtureReady}, installed=${extensionState.installed}, script=${extensionScriptLoaded}, disabled=${extensionDisabled}, reenabled=${extensionReenabled}, removed=${extensionRemoved}${extensionState.error ? `, error=${extensionState.error}` : ''}`);

      webviewSmokePhase = 'browser history and back/forward interactions';
      const navigateTestPage = async (url, expectedHost) => {
        const submitted = await enterAddressThroughKeyboard(cdp, url);
        if (!submitted?.submitted) return false;
        for (let attempt = 0; attempt < 40; attempt++) {
          const currentTargets = await cdpList();
          const current = currentTargets.find((target) => (target.type === 'webview' || target.type === 'page') && target.url.includes(expectedHost));
          if (current) {
            const tab = new CDP(current.webSocketDebuggerUrl);
            try {
              const state = await tab.send('Runtime.evaluate', {
                expression: 'JSON.stringify({ host: location.hostname, readyState: document.readyState })',
                returnByValue: true
              });
              const page = JSON.parse(state.result.value || '{}');
              if (String(page.host || '').replace(/^www\./, '') === expectedHost.replace(/^www\./, '')
                && page.readyState === 'complete') return true;
            } finally { tab.close(); }
          }
          await sleep(250);
        }
        return false;
      };

      if (TEST_URL !== 'example.com') {
        check('history navigation fixture skipped', true, 'set LASTBROWSER_SMOKE_URL=example.com for the full history flow');
      } else {
        const previousHistorySeed = await navigateTestPage('https://example.com/', 'example.com');
        const navigated = previousHistorySeed && await navigateTestPage('https://iana.org/domains/reserved', 'iana.org');
        const afterSecondNavigation = await cdp.send('Runtime.evaluate', {
          expression: `JSON.stringify((() => {
            const address = document.querySelector('.addressbar-container input');
            const view = document.querySelector('.browser-tab-pane.active-tab-pane webview.browser-view');
            return { address: address?.value || '', guestUrl: view?.getURL?.() || '', canGoBack: view?.canGoBack?.() || false, isLoading: view?.isLoading?.() || false };
          })())`,
          returnByValue: true
        });
        const secondNavigationState = JSON.parse(afterSecondNavigation.result.value);
        check('second navigation creates history entry', navigated,
          `entry=${JSON.stringify(addressEntryTrace.at(-1))}, target=${secondNavigationState.guestUrl}, address=${secondNavigationState.address}, canGoBack=${secondNavigationState.canGoBack}, loading=${secondNavigationState.isLoading}`);
        const clickBack = await cdp.send('Runtime.evaluate', {
          expression: `(() => { const button = document.querySelector('.modern-titlebar .nav-back'); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
          returnByValue: true
        });
        let backState = null;
        for (let attempt = 0; attempt < 40; attempt++) {
          const afterBack = await cdp.send('Runtime.evaluate', {
            expression: `(() => { const view = document.querySelector('.browser-tab-pane.active-tab-pane webview.browser-view'); return { url: view?.getURL?.() || '', loading: view?.isLoading?.() || false }; })()`,
            returnByValue: true
          });
          backState = afterBack.result.value;
          if (backState?.url.includes('example.com') && !backState.loading) break;
          await sleep(250);
        }
        check('back button restores previous page', Boolean(backState?.url.includes('example.com') && !backState.loading),
          `${clickBack.result.value}, url=${backState?.url}, loading=${backState?.loading}`);

        const forward = await cdp.send('Runtime.evaluate', {
          expression: `(() => { const button = document.querySelector('.modern-titlebar .nav-forward'); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
          returnByValue: true
        });
        let forwardRestored = false;
        for (let attempt = 0; attempt < 40; attempt++) {
          const activeUrl = await cdp.send('Runtime.evaluate', {
            expression: `(() => { const view = document.querySelector('.browser-tab-pane.active-tab-pane webview.browser-view'); return { url: view?.getURL?.() || '', loading: view?.isLoading?.() || false }; })()`,
            returnByValue: true
          });
          if (String(activeUrl.result.value?.url || '').includes('iana.org') && !activeUrl.result.value?.loading) {
            forwardRestored = true;
            break;
          }
          await sleep(250);
        }
        const afterForward = await cdp.send('Runtime.evaluate', {
          expression: `JSON.stringify((() => {
            const address = document.querySelector('.addressbar-container input');
            const view = document.querySelector('.browser-tab-pane.active-tab-pane webview.browser-view');
            return { address: address?.value || '', guestUrl: view?.getURL?.() || '', canGoForward: view?.canGoForward?.() || false, isLoading: view?.isLoading?.() || false };
          })())`,
          returnByValue: true
        });
        const forwardState = JSON.parse(afterForward.result.value);
        check('forward button restores next page', forwardRestored,
          `${String(forward.result.value)}, address=${forwardState.address}, guest=${forwardState.guestUrl}, canGoForward=${forwardState.canGoForward}, loading=${forwardState.isLoading}`);

        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'h', code: 'KeyH', windowsVirtualKeyCode: 72, modifiers: 2 });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'h', code: 'KeyH', windowsVirtualKeyCode: 72, modifiers: 2 });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 });
        await sleep(300);
        const historyAfterShortcut = await cdp.send('Runtime.evaluate', {
          expression: `Boolean(document.querySelector('.history-panel[role="dialog"]'))`,
          returnByValue: true
        });
        let commandPaletteResult = 'NOT_USED';
        if (!historyAfterShortcut.result.value) {
          await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 });
          await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 });
          await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 });
          await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 });
          await sleep(200);
          const paletteQuery = await cdp.send('Runtime.evaluate', {
            expression: `(() => { const input = document.querySelector('.command-palette-input'); if (!input) return 'PALETTE_NOT_OPEN'; input.focus(); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, 'Verlauf anzeigen'); input.dispatchEvent(new Event('input', { bubbles: true })); return 'SEARCHED'; })()`,
            returnByValue: true
          });
          await sleep(200);
          const paletteClick = await cdp.send('Runtime.evaluate', {
            expression: `(() => { const item = [...document.querySelectorAll('.command-palette-item')].find(el => /Verlauf anzeigen|History/i.test(el.innerText || '')); if (!item) return 'ITEM_NOT_FOUND'; item.click(); return 'CLICKED'; })()`,
            returnByValue: true
          });
          commandPaletteResult = `${paletteQuery.result.value}/${paletteClick.result.value}`;
        }
        const openHistory = await cdp.send('Runtime.evaluate', {
          expression: `JSON.stringify({ triggerCount: document.querySelectorAll('.history-trigger').length, activePanel: document.querySelector('.app-shell')?.className || '', palette: Boolean(document.querySelector('.command-palette-dialog')), historyOpen: Boolean(document.querySelector('.history-panel[role="dialog"]')) })`,
          returnByValue: true
        });
        const historyVisible = await waitForUi('.history-panel[role="dialog"]', true);
        const searchHistory = await cdp.send('Runtime.evaluate', {
          expression: `(() => { const input = document.querySelector('input[aria-label="Search history"]'); if (!input) return 'NOT_FOUND'; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, 'example.com'); input.dispatchEvent(new Event('input', { bubbles: true })); return 'SEARCHED'; })()`,
          returnByValue: true
        });
        await sleep(150);
        const historyMatch = await cdp.send('Runtime.evaluate', {
          expression: `Boolean([...document.querySelectorAll('.history-open')].find(button => (button.title || '').includes('example.com')))`,
          returnByValue: true
        });
        const openHistoryResult = await cdp.send('Runtime.evaluate', {
          expression: `(() => { const button = [...document.querySelectorAll('.history-open')].find(el => (el.title || '').includes('example.com')); if (!button) return false; button.click(); return true; })()`,
          returnByValue: true
        });
        let historyTarget = null;
        for (let attempt = 0; attempt < 40; attempt++) {
          const afterHistoryOpen = await cdpList();
          historyTarget = afterHistoryOpen.find((target) => target.type === 'webview' && target.url.includes('example.com'));
          if (historyTarget) break;
          await sleep(250);
        }
        const historyTriggerInfo = JSON.parse(openHistory.result.value);
        const historyPassed = historyVisible && searchHistory.result.value === 'SEARCHED' && historyMatch.result.value && openHistoryResult.result.value && Boolean(historyTarget);
        check('history search opens a previous visit', historyPassed,
          `Ctrl+H=${JSON.stringify(historyTriggerInfo)}, palette=${commandPaletteResult}, panel=${historyVisible}, search=${searchHistory.result.value}, match=${historyMatch.result.value}, clicked=${openHistoryResult.result.value}, opened=${Boolean(historyTarget)}`);
      }

      try {
        await wvCdp.send('Page.enable', {}, 3000);
        const shot = await wvCdp.send('Page.captureScreenshot', { format: 'png' }, 5000);
        if (shot?.data) {
          const shotPath = path.join(OUT_DIR, 'webview.png');
          writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
          console.log(`\n  screenshot: ${shotPath}`);
        }
      } catch {
        // Guest webview screenshot is best-effort
      }
    } catch (e) {
      check(`WebView smoke phase: ${webviewSmokePhase}`, false, e.message);
    }
    wvCdp.close();
  }

  const beforeNewTab = await cdpList();
  const beforeWebviews = beforeNewTab.filter((target) => target.type === 'webview').length;
  await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.nova-dock .toggle-expand-btn, .modern-titlebar .sidebar-toggle'); if (button && !document.querySelector('.vertical-new-tab-btn')) button.click(); })()`,
    returnByValue: true
  });
  for (let attempt = 0; attempt < 20; attempt++) {
    const ready = await cdp.send('Runtime.evaluate', { expression: `Boolean(document.querySelector('.vertical-new-tab-btn'))`, returnByValue: true });
    if (ready.result.value) break;
    await sleep(100);
  }
  const newTab = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.vertical-new-tab-btn'); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  await sleep(1200);
  const afterNewTab = await cdpList();
  const afterWebviews = afterNewTab.filter((target) => target.type === 'webview').length;
  check('new tab action adds a browser view', afterWebviews > beforeWebviews,
    `${newTab.result.value}, views=${beforeWebviews}->${afterWebviews}`);

  const tabCountBeforeClose = await cdp.send('Runtime.evaluate', {
    expression: `document.querySelectorAll('.vertical-tab-item').length`,
    returnByValue: true
  });
  const createTemporaryTab = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.vertical-new-tab-btn'); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true
  });
  let temporaryTabAdded = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const current = await cdp.send('Runtime.evaluate', { expression: `document.querySelectorAll('.vertical-tab-item').length`, returnByValue: true });
    if (current.result.value > tabCountBeforeClose.result.value) { temporaryTabAdded = true; break; }
    await sleep(100);
  }
  const closeTemporaryTab = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const active = document.querySelector('.vertical-tab-item.active'); const button = active?.querySelector('.vtab-close-btn'); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true
  });
  let temporaryTabClosed = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const current = await cdp.send('Runtime.evaluate', { expression: `document.querySelectorAll('.vertical-tab-item').length`, returnByValue: true });
    if (current.result.value === tabCountBeforeClose.result.value) { temporaryTabClosed = true; break; }
    await sleep(100);
  }
  check('closing the active tab restores the prior tab count', createTemporaryTab.result.value && temporaryTabAdded && closeTemporaryTab.result.value && temporaryTabClosed,
    `created=${temporaryTabAdded}, closed=${temporaryTabClosed}, count=${tabCountBeforeClose.result.value}`);

  // Closed-tab recovery uses a local fixture with a unique title so it can be
  // verified without relying on public websites or restoring a blank start tab.
  const closedTabCount = tabCountBeforeClose.result.value;
  const closedTabFixtureUrl = downloadFixtureUrl.replace(/\/download$/, '/page');
  const createRecoverySeed = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.vertical-new-tab-btn'); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true
  });
  let recoverySeedAdded = false;
  for (let attempt = 0; attempt < 25; attempt++) {
    const count = await cdp.send('Runtime.evaluate', { expression: `document.querySelectorAll('.vertical-tab-item').length`, returnByValue: true });
    if (createRecoverySeed.result.value && count.result.value === closedTabCount + 1) { recoverySeedAdded = true; break; }
    await sleep(100);
  }
  const reopenSeedNavigation = recoverySeedAdded
    ? await enterAddressThroughKeyboard(cdp, closedTabFixtureUrl)
    : null;
  let closedTabSeedReady = false;
  for (let attempt = 0; attempt < 50 && reopenSeedNavigation?.submitted; attempt++) {
    const state = await cdp.send('Runtime.evaluate', {
      expression: `(() => { const view = document.querySelector('.browser-tab-pane.active-tab-pane webview.browser-view'); return { url: view?.getURL?.() || '', title: view?.getTitle?.() || '', loading: view?.isLoading?.() || false }; })()`,
      returnByValue: true
    });
    const value = state.result.value;
    if (value?.url === closedTabFixtureUrl && value.title === SMOKE_PAGE_TITLE && !value.loading) { closedTabSeedReady = true; break; }
    await sleep(100);
  }
  check('local tab recovery fixture loads with its unique title', recoverySeedAdded && closedTabSeedReady,
    `created=${recoverySeedAdded}, submitted=${Boolean(reopenSeedNavigation?.submitted)}, url=${closedTabFixtureUrl}`);
  const closeRecoverySeed = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const close = document.querySelector('.vertical-tab-item.active .vtab-close-btn'); if (!close) return false; close.click(); return true; })()`,
    returnByValue: true
  });
  let recoverySeedClosed = false;
  for (let attempt = 0; attempt < 25; attempt++) {
    const count = await cdp.send('Runtime.evaluate', { expression: `document.querySelectorAll('.vertical-tab-item').length`, returnByValue: true });
    if (closeRecoverySeed.result.value && count.result.value === closedTabCount) { recoverySeedClosed = true; break; }
    await sleep(100);
  }
  const triggerReopenClosed = await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2
  }).then(async () => {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 10 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'T', code: 'KeyT', windowsVirtualKeyCode: 84, modifiers: 10, text: 'T' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'T', code: 'KeyT', windowsVirtualKeyCode: 84, modifiers: 10 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 2 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 0 });
    return true;
  }).catch(() => false);
  let reopenedClosedTab = false;
  let restoredClosedTabState = null;
  for (let attempt = 0; attempt < 50; attempt++) {
    const state = await cdp.send('Runtime.evaluate', {
      expression: `(() => { const view = document.querySelector('.browser-tab-pane.active-tab-pane webview.browser-view'); return { count: document.querySelectorAll('.vertical-tab-item').length, url: view?.getURL?.() || '', title: view?.getTitle?.() || '', loading: view?.isLoading?.() || false }; })()`,
      returnByValue: true
    });
    restoredClosedTabState = state.result.value;
    if (restoredClosedTabState?.count === closedTabCount + 1
      && restoredClosedTabState.url === closedTabFixtureUrl
      && restoredClosedTabState.title === SMOKE_PAGE_TITLE
      && !restoredClosedTabState.loading) {
      reopenedClosedTab = true;
      break;
    }
    await sleep(100);
  }
  check('Ctrl+Shift+T restores the recently closed tab and its page', recoverySeedAdded && closedTabSeedReady && recoverySeedClosed
    && triggerReopenClosed && reopenedClosedTab,
  `seed=${closedTabSeedReady}, closed=${recoverySeedClosed}, shortcut=${triggerReopenClosed}, restored=${JSON.stringify(restoredClosedTabState)}`);
  const closeRestoredTab = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const close = document.querySelector('.vertical-tab-item.active .vtab-close-btn'); if (!close) return false; close.click(); return true; })()`,
    returnByValue: true
  });
  let restoredTabCleanup = false;
  for (let attempt = 0; attempt < 25; attempt++) {
    const count = await cdp.send('Runtime.evaluate', { expression: `document.querySelectorAll('.vertical-tab-item').length`, returnByValue: true });
    if (closeRestoredTab.result.value && count.result.value === closedTabCount) { restoredTabCleanup = true; break; }
    await sleep(100);
  }
  check('closed-tab recovery smoke restores its original tab count', restoredTabCleanup,
    `close=${closeRestoredTab.result.value}, cleaned=${restoredTabCleanup}`);

  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const traceKey = '__lastbrowserSmokeDragTrace';
      if (window[traceKey]) return;
      const trace = [];
      Object.defineProperty(window, traceKey, { value: trace, configurable: true });
      for (const type of ['dragstart', 'dragenter', 'dragover', 'drop', 'dragend']) {
        document.addEventListener(type, (event) => {
          const target = event.target instanceof Element ? event.target : null;
          trace.push({
            type,
            trusted: event.isTrusted,
            x: event.clientX,
            y: event.clientY,
            target: target?.tagName.toLowerCase() + (target?.className && typeof target.className === 'string' ? '.' + target.className.trim().replace(/\\s+/g, '.') : ''),
            transferTypes: [...(event.dataTransfer?.types || [])],
            dragSurface: Boolean(document.querySelector('.snap-drag-surface'))
          });
          if (trace.length > 40) trace.shift();
        }, true);
      }
    })()`,
    returnByValue: true
  });
  const reorderGeometryResult = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const tabs = [...document.querySelectorAll('.vertical-tab-item:not(.pinned)')];
      const hitPointFor = (tab) => {
        const rect = tab.getBoundingClientRect(), y = rect.top + rect.height / 2;
        for (const offset of [24, 8, Math.min(rect.width * 0.5, 110), Math.max(8, rect.width - 18)]) {
          const point = { x: rect.left + offset, y }, hit = document.elementFromPoint(point.x, point.y);
          if (hit && (hit === tab || tab.contains(hit))) return point;
        }
        return null;
      };
      if (tabs.length < 2) return { before: tabs.map(tab => tab.querySelector('.vtab-title')?.textContent?.trim() || ''), from: null, to: null };
      const source = tabs[0], target = tabs[1], sourcePoint = hitPointFor(source), targetRect = target.getBoundingClientRect();
      return {
        before: tabs.map(tab => tab.querySelector('.vtab-title')?.textContent?.trim() || ''),
        from: sourcePoint,
        to: { x: targetRect.left + targetRect.width * 0.5, y: targetRect.top + targetRect.height * 0.9 }
      };
    })()` ,
    returnByValue: true
  });
  const reorderGeometry = reorderGeometryResult.result.value;
  if (reorderGeometry?.from && reorderGeometry?.to) {
    await pressMouse(cdp, reorderGeometry.from);
    await moveHeldMouse(cdp, reorderGeometry.from, reorderGeometry.to);
    await sleep(100);
    await releaseMouse(cdp, reorderGeometry.to);
  }
  let reorderedTabs = null;
  for (let attempt = 0; attempt < 20 && reorderGeometry?.from; attempt++) {
    const state = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify([...document.querySelectorAll('.vertical-tab-item:not(.pinned) .vtab-title')].map(title => title.textContent?.trim() || ''))`,
      returnByValue: true
    });
    reorderedTabs = JSON.parse(state.result.value || '[]');
    if (reorderedTabs.length === reorderGeometry.before.length
      && reorderedTabs.join('\u0000') !== reorderGeometry.before.join('\u0000')) break;
    await sleep(100);
  }
  const nativeReorderObserved = await cdp.send('Runtime.evaluate', {
    expression: `Boolean((window.__lastbrowserSmokeDragTrace || []).some(event => event.type === 'drop' && event.trusted && event.target.includes('vertical-tab-item')))` ,
    returnByValue: true
  });
  check('native mouse drag reorders tabs while preserving every tab', Boolean(reorderGeometry?.from && reorderGeometry?.to)
    && nativeReorderObserved.result.value && reorderedTabs?.length === reorderGeometry.before.length
    && reorderedTabs.join('\u0000') !== reorderGeometry.before.join('\u0000')
    && [...reorderedTabs].sort().join('\u0000') === [...reorderGeometry.before].sort().join('\u0000'),
  `before=${JSON.stringify(reorderGeometry?.before)}, after=${JSON.stringify(reorderedTabs)}, trustedDrop=${nativeReorderObserved.result.value}`);

  const snapGeometryResult = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const tabs = [...document.querySelectorAll('.vertical-tab-item')];
      const hitPointFor = (tab) => {
        const rect = tab.getBoundingClientRect();
        const y = rect.top + rect.height / 2;
        for (const offset of [24, 8, Math.min(rect.width * 0.5, 110), Math.max(8, rect.width - 18)]) {
          const point = { x: rect.left + offset, y };
          const hit = document.elementFromPoint(point.x, point.y);
          if (hit && (hit === tab || tab.contains(hit))) return point;
        }
        return null;
      };
      const isVisibleAndHit = (tab) => {
        const rect = tab.getBoundingClientRect();
        const style = getComputedStyle(tab);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0
          || rect.width <= 0 || rect.height <= 0 || rect.right <= 0 || rect.left >= innerWidth || rect.bottom <= 0 || rect.top >= innerHeight) return false;
        return Boolean(hitPointFor(tab));
      };
      let source = tabs.find((tab) => !tab.classList.contains('active') && isVisibleAndHit(tab)) || tabs.find(isVisibleAndHit);
      if (!source) {
        for (const tab of tabs) {
          tab.scrollIntoView({ block: 'nearest' });
          if (isVisibleAndHit(tab)) { source = tab; break; }
        }
      }
      const frame = document.querySelector('.browser-webview-frame');
      if (!source || !frame) return { from: null, to: null, candidates: tabs.map((tab) => {
        const rect = tab.getBoundingClientRect(), y = rect.top + rect.height / 2;
        const hits = [24, 8, Math.min(rect.width * 0.5, 110), Math.max(8, rect.width - 18)].map((offset) => { const point = { x: rect.left + offset, y }, hit = document.elementFromPoint(point.x, point.y); return { point, hit: hit?.tagName.toLowerCase() + (hit?.className && typeof hit.className === 'string' ? '.' + hit.className.trim().replace(/\\s+/g, '.') : '') }; });
        return { className: tab.className, active: tab.classList.contains('active'), bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, hits };
      }) };
      const tab = source.getBoundingClientRect();
      const target = frame.getBoundingClientRect();
      const from = hitPointFor(source);
      const sourceHit = document.elementFromPoint(from.x, from.y);
      const to = { x: target.left + target.width * 0.05, y: target.top + target.height * 0.5 };
      const targetHit = document.elementFromPoint(to.x, to.y);
      return {
        from, to,
        source: { classes: source.className, draggable: source.draggable, bounds: { x: tab.x, y: tab.y, width: tab.width, height: tab.height }, hit: sourceHit?.tagName.toLowerCase() + (sourceHit?.className && typeof sourceHit.className === 'string' ? '.' + sourceHit.className.trim().replace(/\\s+/g, '.') : '') },
        target: { bounds: { x: target.x, y: target.y, width: target.width, height: target.height }, hit: targetHit?.tagName.toLowerCase() + (targetHit?.className && typeof targetHit.className === 'string' ? '.' + targetHit.className.trim().replace(/\\s+/g, '.') : '') }
      };
    })()`,
    returnByValue: true
  });
  const snapGeometry = snapGeometryResult.result.value;
  const hasSnapGeometry = Boolean(snapGeometry?.from && snapGeometry?.to);
  if (hasSnapGeometry) {
    await pressMouse(cdp, snapGeometry.from);
    await moveHeldMouse(cdp, snapGeometry.from, snapGeometry.to);
  }
  await sleep(150);
  const ghostStateResult = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({ visible: Boolean(document.querySelector('.snap-ghost-overlay')), label: document.querySelector('.snap-ghost-label')?.textContent || '', sourceDragging: [...document.querySelectorAll('.vertical-tab-item')].some(tab => tab.classList.contains('dragging')), surface: Boolean(document.querySelector('.snap-drag-surface')), events: window.__lastbrowserSmokeDragTrace || [] })`,
    returnByValue: true
  });
  const ghostState = JSON.parse(ghostStateResult.result.value);
  if (!ghostState.visible || !ghostState.events.some((event) => event.type === 'dragstart')) {
    console.log(`  snap trace: ${JSON.stringify({ geometry: snapGeometry, state: ghostState })}`);
  }
  if (hasSnapGeometry) await releaseMouse(cdp, snapGeometry.to);
  await sleep(500);
  const snapResult = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({ layout: document.querySelector('.multiview-grid-container')?.className || '', panes: [...document.querySelectorAll('.multiview-pane-chrome')].map(p => p.classList.contains('occupied')), tabIds: [...document.querySelectorAll('.multiview-pane-title')].map(p => p.textContent) })`,
    returnByValue: true
  });
  const snapState = JSON.parse(snapResult.result.value);
  check('real mouse drag and drop creates dual multiview without duplicate panes',
    hasSnapGeometry
      && snapState.layout.includes('layout-dual-25-75')
      && snapState.panes.filter(Boolean).length === 2
      && new Set(snapState.tabIds).size === 2,
    `${hasSnapGeometry ? 'native mouse drag' : 'missing hittable source/target'}, ${snapState.layout}, occupied=${snapState.panes.filter(Boolean).length}; geometry=${JSON.stringify(snapGeometry)}, drag=${JSON.stringify({ started: ghostState.sourceDragging, surface: ghostState.surface, events: ghostState.events })}`);
  check('snap drag displays a target ghost before drop', ghostState.visible && /25%|75%|Dual/i.test(ghostState.label), ghostState.label || 'ghost not visible');

  const flyoutGeometryResult = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const candidates = [...document.querySelectorAll('.vertical-tab-item')];
      const hitPointFor = (tab) => {
        const rect = tab.getBoundingClientRect(), y = rect.top + rect.height / 2;
        for (const offset of [24, 8, Math.min(rect.width * 0.5, 110), Math.max(8, rect.width - 18)]) {
          const point = { x: rect.left + offset, y }, hit = document.elementFromPoint(point.x, point.y);
          if (hit && (hit === tab || tab.contains(hit))) return point;
        }
        return null;
      };
      const source = candidates.find((tab) => {
        if (tab.classList.contains('active')) return false;
        const rect = tab.getBoundingClientRect(), style = getComputedStyle(tab);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || rect.width <= 0 || rect.height <= 0 || rect.right <= 0 || rect.left >= innerWidth || rect.bottom <= 0 || rect.top >= innerHeight) return false;
        return Boolean(hitPointFor(tab));
      }) || candidates.find((tab) => {
        const rect = tab.getBoundingClientRect(), style = getComputedStyle(tab);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || rect.width <= 0 || rect.height <= 0 || rect.right <= 0 || rect.left >= innerWidth || rect.bottom <= 0 || rect.top >= innerHeight) return false;
        return Boolean(hitPointFor(tab));
      });
      const frame = document.querySelector('.browser-webview-frame');
      if (!source || !frame) return { from: null, to: null };
      const tab = source.getBoundingClientRect();
      const target = frame.getBoundingClientRect();
      return {
        from: hitPointFor(source),
        to: { x: target.left + target.width * 0.5, y: target.top + target.height * 0.05 }
      };
    })()`,
    returnByValue: true
  });
  const flyoutGeometry = flyoutGeometryResult.result.value;
  const hasFlyoutGeometry = Boolean(flyoutGeometry?.from && flyoutGeometry?.to);
  if (hasFlyoutGeometry) {
    await pressMouse(cdp, flyoutGeometry.from);
    await moveHeldMouse(cdp, flyoutGeometry.from, flyoutGeometry.to);
  }
  let flyoutState = { visible: false, cards: 0, quadSlot: false };
  const flyoutDeadline = Date.now() + 2_000;
  do {
    const flyoutStateResult = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({ visible: Boolean(document.querySelector('.snap-bar-flyout.is-visible')), cards: document.querySelectorAll('.snap-bar-card').length, quadSlot: Boolean(document.querySelector('.snap-bar-flyout .snap-card-preview.layout-quad-grid button.snap-card-slot')) })`,
      returnByValue: true
    });
    flyoutState = JSON.parse(flyoutStateResult.result.value);
    if (flyoutState.visible && flyoutState.cards >= 8 && flyoutState.quadSlot) break;
    await sleep(50);
  } while (Date.now() < flyoutDeadline);
  check('real mouse drag opens the snap flyout with selectable layouts', hasFlyoutGeometry && flyoutState.visible && flyoutState.cards >= 8 && flyoutState.quadSlot, `visible=${flyoutState.visible}, cards=${flyoutState.cards}`);
  const quadSlotGeometry = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const slot = document.querySelector('.snap-bar-flyout .snap-card-preview.layout-quad-grid button.snap-card-slot');
      if (!slot) return null;
      const rect = slot.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`,
    returnByValue: true
  });
  const quadSlotPoint = quadSlotGeometry.result.value;
  let slotDragOverObserved = false;
  if (hasFlyoutGeometry && quadSlotPoint) {
    await moveHeldMouse(cdp, flyoutGeometry.to, quadSlotPoint, 6);
    // Chromium throttles trusted dragover events while a drag is stationary.
    // Keep the pointer on the card until the actual slot receives one.
    for (let attempt = 0; attempt < 15; attempt++) {
      const observed = await cdp.send('Runtime.evaluate', {
        expression: `Boolean((window.__lastbrowserSmokeDragTrace || []).some(event => event.type === 'dragover' && event.target.includes('snap-card-slot')))` ,
        returnByValue: true
      });
      slotDragOverObserved = Boolean(observed.result.value);
      if (slotDragOverObserved) break;
      await sleep(100);
    }
    await releaseMouse(cdp, quadSlotPoint);
  } else if (hasFlyoutGeometry) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await releaseMouse(cdp, flyoutGeometry.to);
  }
  await sleep(300);
  const quadResult = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({ layout: document.querySelector('.multiview-grid-container')?.className || '', panes: [...document.querySelectorAll('.multiview-pane-chrome')].map(p => p.classList.contains('occupied')), uniqueTitles: new Set([...document.querySelectorAll('.multiview-pane-title')].map(p => p.textContent)).size })`,
    returnByValue: true
  });
  const quadState = JSON.parse(quadResult.result.value);
  if (!quadState.layout.includes('layout-quad-grid')) {
    const quadTrace = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({ events: (window.__lastbrowserSmokeDragTrace || []).slice(-24), flyout: Boolean(document.querySelector('.snap-bar-flyout.is-visible')), slot: (() => { const element = document.querySelector('.snap-bar-flyout .snap-card-preview.layout-quad-grid button.snap-card-slot'); if (!element) return null; const rect = element.getBoundingClientRect(); const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; const hit = document.elementFromPoint(point.x, point.y); return { point, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, hit: hit?.tagName.toLowerCase() + (hit?.className && typeof hit.className === 'string' ? '.' + hit.className.trim().replace(/\\s+/g, '.') : '') }; })() })`,
      returnByValue: true
    });
    console.log(`  snap flyout trace: ${quadTrace.result.value}`);
  }
  check('native drop on the snap flyout selects quad and keeps unique tabs', Boolean(hasFlyoutGeometry && quadSlotPoint) && quadState.layout.includes('layout-quad-grid') && quadState.panes.length === 4 && quadState.panes.filter(Boolean).length === 2 && quadState.uniqueTitles === 2,
    `${hasFlyoutGeometry && quadSlotPoint ? 'native mouse drop' : 'missing flyout slot'}, slotDragOver=${slotDragOverObserved}, ${quadState.layout}, occupied=${quadState.panes.filter(Boolean).length}`);

  const resizeXGeometryResult = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const divider = document.querySelector('.multiview-divider-vertical');
      const container = document.querySelector('.multiview-grid-container');
      if (!divider || !container) return null;
      const handle = divider.getBoundingClientRect();
      const rect = container.getBoundingClientRect();
      // Keep the vertical drag away from the horizontal handle crossing. The
      // horizontal separator is rendered later and wins hit testing exactly
      // at the 50% × 50% intersection in quad layouts.
      const y = rect.top + rect.height * 0.25;
      const from = { x: handle.left + handle.width / 2, y };
      const to = { x: rect.left + rect.width * 0.65, y };
      return {
        from,
        to,
        fromHit: document.elementFromPoint(from.x, from.y)?.className || '',
        toHit: document.elementFromPoint(to.x, to.y)?.className || ''
      };
    })()`,
    returnByValue: true
  });
  const resizeXGeometry = resizeXGeometryResult.result.value;
  if (QUAD_POINTER_TRACE_ONLY) {
    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const grid = document.querySelector('.multiview-grid-container');
        const ratio = () => document.querySelector('.multiview-pane-chrome')?.style.width || '';
        const trace = [];
        const captureOwner = (pointerId) => {
          for (const divider of document.querySelectorAll('.multiview-divider-vertical, .multiview-divider-horizontal')) {
            try { if (divider.hasPointerCapture(pointerId)) return divider.className; } catch {}
          }
          return '';
        };
        const onPointer = (event) => {
          if (trace.length >= 96) return;
          const target = event.target instanceof Element ? event.target : null;
          const entry = {
            type: event.type,
            pointerId: event.pointerId,
            pointerType: event.pointerType || '',
            isPrimary: Boolean(event.isPrimary),
            button: Number.isFinite(event.button) ? event.button : -1,
            buttons: Number.isFinite(event.buttons) ? event.buttons : 0,
            x: Math.round(event.clientX * 100) / 100,
            y: Math.round(event.clientY * 100) / 100,
            targetClass: typeof target?.className === 'string' ? target.className.trim().replace(/\\s+/g, ' ').slice(0, 96) : '',
            captureOwner: captureOwner(event.pointerId),
            hasCapture: Boolean(target && typeof target.hasPointerCapture === 'function' && target.hasPointerCapture(event.pointerId)),
            xRatio: ratio()
          };
          trace.push(entry);
          requestAnimationFrame(() => {
            entry.xRatioAfterFrame = ratio();
            entry.captureOwnerAfterFrame = captureOwner(event.pointerId);
          });
        };
        for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture']) {
          window.addEventListener(type, onPointer, true);
        }
        window.__lastbrowserQuadPointerDebug = { beforeRatio: ratio(), beforeDividerLeft: grid?.querySelector('.multiview-divider-vertical')?.style.left || '', trace };
        return true;
      })()`,
      returnByValue: true
    });
  }
  if (resizeXGeometry) {
    const resizeAttempts = QUAD_POINTER_TRACE_ONLY ? 1 : 3;
    for (let attempt = 0; attempt < resizeAttempts; attempt++) {
      const current = attempt === 0 ? resizeXGeometry : (await cdp.send('Runtime.evaluate', {
        expression: `(() => { const divider = document.querySelector('.multiview-divider-vertical'); const container = document.querySelector('.multiview-grid-container'); if (!divider || !container) return null; const handle = divider.getBoundingClientRect(), rect = container.getBoundingClientRect(), y = rect.top + rect.height * 0.25; return { from: { x: handle.left + handle.width / 2, y }, to: { x: rect.left + rect.width * 0.65, y } }; })()`,
        returnByValue: true
      })).result.value;
      if (!current) break;
      await pressMouse(cdp, current.from);
      await moveHeldMouse(cdp, current.from, current.to);
      await releaseMouse(cdp, current.to);
      await sleep(150);
      const split = await cdp.send('Runtime.evaluate', {
        expression: `document.querySelector('.multiview-divider-vertical')?.style.left || ''`,
        returnByValue: true
      });
      if (String(split.result.value).includes('66.67%')) break;
    }
  }
  if (QUAD_POINTER_TRACE_ONLY) {
    await sleep(150);
    const pointerTraceResult = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const state = window.__lastbrowserQuadPointerDebug || { beforeRatio: '', trace: [] };
        return {
          beforeRatio: state.beforeRatio,
          afterRatio: document.querySelector('.multiview-pane-chrome')?.style.width || '',
          beforeDividerLeft: state.beforeDividerLeft,
          afterDividerLeft: document.querySelector('.multiview-divider-vertical')?.style.left || '',
          dividerTargetClass: ${JSON.stringify(resizeXGeometry?.fromHit || '')},
          geometry: ${JSON.stringify(resizeXGeometry || null)},
          trace: state.trace
        };
      })()`,
      returnByValue: true
    });
    const trace = pointerTraceResult.result.value;
    console.log(`[QUAD-POINTER-TRACE] ${JSON.stringify(trace)}`);
    const types = new Set((trace?.trace || []).map((entry) => entry.type));
    check('focused quad X repro captured pointerdown, move and up',
      Boolean(resizeXGeometry && types.has('pointerdown') && types.has('pointermove') && types.has('pointerup')),
      `events=${[...types].join(',')}, before=${trace?.beforeRatio || ''}, after=${trace?.afterRatio || ''}`);
    cdp.close();
    finish(child);
  }
  await sleep(150);
  const resizeYGeometryResult = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const divider = document.querySelector('.multiview-divider-horizontal');
      const container = document.querySelector('.multiview-grid-container');
      if (!divider || !container) return null;
      const handle = divider.getBoundingClientRect();
      const rect = container.getBoundingClientRect();
      // Keep the horizontal drag away from the vertical handle crossing too.
      const vertical = document.querySelector('.multiview-divider-vertical')?.getBoundingClientRect();
      const x = vertical ? (rect.left + vertical.left) / 2 : rect.left + rect.width * 0.25;
      const from = { x, y: handle.top + handle.height / 2 };
      const to = { x, y: rect.top + rect.height * 0.65 };
      return {
        from,
        to,
        fromHit: document.elementFromPoint(from.x, from.y)?.closest('.multiview-divider-horizontal')?.className || document.elementFromPoint(from.x, from.y)?.className || '',
        toHit: document.elementFromPoint(to.x, to.y)?.closest('.multiview-divider-horizontal')?.className || document.elementFromPoint(to.x, to.y)?.className || ''
      };
    })()`,
    returnByValue: true
  });
  const resizeYGeometry = resizeYGeometryResult.result.value;
  if (resizeYGeometry) {
    await pressMouse(cdp, resizeYGeometry.from);
    await moveHeldMouse(cdp, resizeYGeometry.from, resizeYGeometry.to);
    await releaseMouse(cdp, resizeYGeometry.to);
  }
  let resizedState = null;
  let previousResizeSnapshot = '';
  let stableResizeSnapshots = 0;
  for (let attempt = 0; attempt < 20; attempt++) {
    const resized = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({
      layout: document.querySelector('.multiview-grid-container')?.className || '',
      panes: [...document.querySelectorAll('.multiview-pane-chrome')].map(pane => ({
        top: pane.style.top, left: pane.style.left, width: pane.style.width, height: pane.style.height,
        occupied: pane.classList.contains('occupied')
      })),
      browserViews: [...document.querySelectorAll('.browser-tab-pane')].map(pane => ({
        top: pane.style.top, left: pane.style.left, width: pane.style.width, height: pane.style.height
      }))
    })`,
      returnByValue: true
    });
    const snapshot = resized.result.value || '{}';
    resizedState = JSON.parse(snapshot);
    const targetReached = resizedState.panes?.[0]?.height === '66.67%'
      && resizedState.panes?.[1]?.height === '50%'
      && resizedState.panes?.[3]?.height === '50%';
    stableResizeSnapshots = targetReached && snapshot === previousResizeSnapshot ? stableResizeSnapshots + 1 : 0;
    previousResizeSnapshot = snapshot;
    if (stableResizeSnapshots >= 2) break;
    await sleep(50);
  }
  const quadSlotBounds = resizedState.panes;
  const leftTopResized = quadSlotBounds[0]?.left === '0%' && quadSlotBounds[0]?.top === '0%'
    && quadSlotBounds[0]?.width === '66.67%' && quadSlotBounds[0]?.height === '66.67%';
  const rightStackRemainsHalf = quadSlotBounds[1]?.left === '66.67%' && quadSlotBounds[1]?.top === '0%'
    && quadSlotBounds[1]?.width === '33.33%' && quadSlotBounds[1]?.height === '50%'
    && quadSlotBounds[3]?.left === '66.67%' && quadSlotBounds[3]?.top === '50%'
    && quadSlotBounds[3]?.width === '33.33%' && quadSlotBounds[3]?.height === '50%';
  check('real mouse resizing snaps the left quad stack and preserves the right stack', Boolean(resizeXGeometry && resizeYGeometry)
    && resizeXGeometry.fromHit.includes('multiview-divider-vertical') && resizeYGeometry.fromHit.includes('multiview-divider-horizontal')
    && resizedState.layout.includes('layout-quad-grid') && leftTopResized && rightStackRemainsHalf,
    `slots=${JSON.stringify(quadSlotBounds)}, browserViews=${JSON.stringify(resizedState.browserViews)}, leftTopResized=${leftTopResized}, rightStackRemainsHalf=${rightStackRemainsHalf}, x=${JSON.stringify(resizeXGeometry)}, y=${JSON.stringify(resizeYGeometry)}`);

  const independentRows = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify((() => { const panes = [...document.querySelectorAll('.multiview-pane-chrome')]; const dividers = [...document.querySelectorAll('.multiview-divider-horizontal')]; return { leftTop: panes[0]?.style.height, leftBottom: panes[2]?.style.top, rightTop: panes[1]?.style.height, rightBottom: panes[3]?.style.top, dividerCount: dividers.length, dividerLeft: dividers.map(d => d.style.left), dividerWidth: dividers.map(d => d.style.width) }; })())`,
    returnByValue: true
  });
  const independentRowState = JSON.parse(independentRows.result.value);
  check('resizing the left quad stack leaves the right stack unchanged',
    /66\.67%/.test(independentRowState.leftTop || '') && independentRowState.leftBottom === independentRowState.leftTop
      && independentRowState.rightTop === '50%' && independentRowState.rightBottom === '50%'
      && independentRowState.dividerCount === 2
      && independentRowState.dividerLeft[0] === '0%' && independentRowState.dividerLeft[1] === independentRowState.dividerWidth[0],
    JSON.stringify(independentRowState));

  const activated = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const pane = document.querySelectorAll('.multiview-pane-chrome.occupied')[1]; if (!pane) return false; pane.click(); return true; })()`,
    returnByValue: true
  });
  await sleep(100);
  const activeCount = await cdp.send('Runtime.evaluate', {
    expression: `document.querySelectorAll('.multiview-pane-chrome.active-pane').length`,
    returnByValue: true
  });
  check('multiview pane activation selects exactly one active tab', activated.result.value && activeCount.result.value === 1, `active panes=${activeCount.result.value}`);

  const maximized = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.multiview-pane-chrome.active-pane .multiview-pane-controls .multiview-pane-btn:nth-child(2)'); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true
  });
  await sleep(250);
  const maximizedState = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({ multiview: Boolean(document.querySelector('.multiview-grid-container')), tabs: document.querySelectorAll('.vertical-tab-item').length })`,
    returnByValue: true
  });
  const maximizedInfo = JSON.parse(maximizedState.result.value);
  check('multiview maximize restores single-pane view without closing tabs', maximized.result.value && !maximizedInfo.multiview && maximizedInfo.tabs === 2, `multiview=${maximizedInfo.multiview}, tabs=${maximizedInfo.tabs}`);

  const closeGeometryResult = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const hitPointFor = (tab) => {
        const rect = tab.getBoundingClientRect(), y = rect.top + rect.height / 2;
        for (const offset of [24, 8, Math.min(rect.width * 0.5, 110), Math.max(8, rect.width - 18)]) {
          const point = { x: rect.left + offset, y }, hit = document.elementFromPoint(point.x, point.y);
          if (hit && (hit === tab || tab.contains(hit))) return point;
        }
        return null;
      };
      const source = [...document.querySelectorAll('.vertical-tab-item')].find(tab => !tab.classList.contains('active') && hitPointFor(tab));
      const frame = document.querySelector('.browser-webview-frame');
      if (!source || !frame) return null;
      const target = frame.getBoundingClientRect();
      const from = hitPointFor(source);
      const hit = document.elementFromPoint(from.x, from.y);
      return {
        from,
        to: { x: target.left + target.width * 0.10, y: target.top + target.height * 0.5 },
        sourceHit: hit?.tagName.toLowerCase() + (hit?.className && typeof hit.className === 'string' ? '.' + hit.className.trim().replace(/\\s+/g, '.') : '')
      };
    })()`,
    returnByValue: true
  });
  const closeGeometry = closeGeometryResult.result.value;
  if (closeGeometry) {
    await pressMouse(cdp, closeGeometry.from);
    await moveHeldMouse(cdp, closeGeometry.from, closeGeometry.to);
    await releaseMouse(cdp, closeGeometry.to);
  }
  const closeDragStart = { result: { value: Boolean(closeGeometry?.sourceHit?.includes('vertical-tab-item')) } };
  const closeDragDrop = { result: { value: Boolean(closeGeometry) && await waitForUi('.multiview-grid-container', true) } };
  const closeBeforeResult = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({ multiview: Boolean(document.querySelector('.multiview-grid-container')), occupied: document.querySelectorAll('.multiview-pane-chrome.occupied').length })`,
    returnByValue: true
  });
  const closeBeforeState = JSON.parse(closeBeforeResult.result.value);
  const closePane = closeBeforeState.multiview && closeBeforeState.occupied >= 2 ? await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.multiview-pane-chrome.occupied .multiview-pane-btn.close-pane'); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true
  }) : { result: { value: false } };
  await sleep(200);
  const closeState = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({ multiview: Boolean(document.querySelector('.multiview-grid-container')), tabs: document.querySelectorAll('.vertical-tab-item').length })`,
    returnByValue: true
  });
  const closedInfo = JSON.parse(closeState.result.value);
  check('removing a pane created by a real mouse drag returns to single view and preserves its tab', closeDragStart.result.value && closeDragDrop.result.value && closeBeforeState.occupied >= 2 && closePane.result.value && !closedInfo.multiview && closedInfo.tabs === 2, `dragSource=${closeGeometry?.sourceHit || 'none'}, splitCreated=${closeDragDrop.result.value}, occupiedBefore=${closeBeforeState.occupied}, multiview=${closedInfo.multiview}, tabs=${closedInfo.tabs}`);

  // Exercise a second layout through trusted mouse input. Starting with two
  // tabs, dropping onto Trio column 3 should keep those two unique tabs in
  // slots 1 and 3 and leave slot 2 visibly empty; a third available tab is
  // created first so this also verifies that unassigned tabs stay unassigned.
  const trioTabCount = await cdp.send('Runtime.evaluate', {
    expression: `document.querySelectorAll('.vertical-tab-item').length`,
    returnByValue: true
  });
  const trioCreateTab = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.vertical-new-tab-btn'); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true
  });
  let trioThirdTabAvailable = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const current = await cdp.send('Runtime.evaluate', {
      expression: `document.querySelectorAll('.vertical-tab-item').length`,
      returnByValue: true
    });
    if (current.result.value > trioTabCount.result.value) { trioThirdTabAvailable = true; break; }
    await sleep(100);
  }
  const trioGeometryResult = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const tabs = [...document.querySelectorAll('.vertical-tab-item')];
      const hitPointFor = (tab) => {
        const rect = tab.getBoundingClientRect(), y = rect.top + rect.height / 2;
        for (const offset of [24, 8, Math.min(rect.width * 0.5, 110), Math.max(8, rect.width - 18)]) {
          const point = { x: rect.left + offset, y }, hit = document.elementFromPoint(point.x, point.y);
          if (hit && (hit === tab || tab.contains(hit))) return point;
        }
        return null;
      };
      const source = tabs.find(tab => !tab.classList.contains('active') && !tab.classList.contains('pinned') && hitPointFor(tab));
      const frame = document.querySelector('.browser-webview-frame');
      if (!source || !frame) return null;
      const target = frame.getBoundingClientRect(), from = hitPointFor(source);
      return { from, to: { x: target.left + target.width * 0.5, y: target.top + target.height * 0.05 }, title: source.querySelector('.vtab-title')?.textContent?.trim() || '' };
    })()` ,
    returnByValue: true
  });
  const trioGeometry = trioGeometryResult.result.value;
  const trioDragReady = trioThirdTabAvailable && Boolean(trioCreateTab.result.value && trioGeometry?.from && trioGeometry?.to);
  if (trioDragReady) {
    await pressMouse(cdp, trioGeometry.from);
    await moveHeldMouse(cdp, trioGeometry.from, trioGeometry.to);
  }
  let trioFlyoutReady = false;
  for (let attempt = 0; attempt < 20 && trioDragReady; attempt++) {
    const state = await cdp.send('Runtime.evaluate', {
      expression: `Boolean(document.querySelector('.snap-bar-flyout.is-visible .snap-card-preview.layout-trio-columns .snap-card-slot.slot-2'))`,
      returnByValue: true
    });
    if (state.result.value) { trioFlyoutReady = true; break; }
    await sleep(100);
  }
  const trioSlotGeometry = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const slot = document.querySelector('.snap-bar-flyout.is-visible .snap-card-preview.layout-trio-columns .snap-card-slot.slot-2'); if (!slot) return null; const rect = slot.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`,
    returnByValue: true
  });
  const trioSlotPoint = trioSlotGeometry.result.value;
  let trioDragOverObserved = false;
  if (trioDragReady && trioFlyoutReady && trioSlotPoint) {
    await moveHeldMouse(cdp, trioGeometry.to, trioSlotPoint, 6);
    for (let attempt = 0; attempt < 15; attempt++) {
      const observed = await cdp.send('Runtime.evaluate', {
        expression: `Boolean((window.__lastbrowserSmokeDragTrace || []).some(event => event.type === 'dragover' && event.target.includes('snap-card-slot')))` ,
        returnByValue: true
      });
      trioDragOverObserved = Boolean(observed.result.value);
      if (trioDragOverObserved) break;
      await sleep(100);
    }
    await releaseMouse(cdp, trioSlotPoint);
  } else if (trioDragReady) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await releaseMouse(cdp, trioGeometry.to);
  }
  let trioState = null;
  for (let attempt = 0; attempt < 25; attempt++) {
    const state = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify((() => { const grid = document.querySelector('.multiview-grid-container'); const panes = [...document.querySelectorAll('.multiview-pane-chrome')]; return { layout: grid?.className || '', paneCount: panes.length, occupied: panes.filter(pane => pane.classList.contains('occupied')).length, empty: panes.filter(pane => pane.classList.contains('empty')).map(pane => ({ left: pane.style.left, label: pane.querySelector('.multiview-empty-label')?.textContent?.trim() || '' })), titles: [...document.querySelectorAll('.multiview-pane-title')].map(title => title.textContent?.trim() || ''), tabCount: document.querySelectorAll('.vertical-tab-item').length }; })())`,
      returnByValue: true
    });
    trioState = JSON.parse(state.result.value || '{}');
    if (trioState.layout.includes('layout-trio-columns')) break;
    await sleep(100);
  }
  const trioEmptySlotExpected = trioState?.empty?.length === 1
    && trioState.empty[0].left === '33.33%'
    && Boolean(trioState.empty[0].label);
  check('native mouse drop selects Trio columns and preserves the explicitly empty middle slot', trioDragReady && trioFlyoutReady && Boolean(trioSlotPoint)
    && trioState?.layout.includes('layout-trio-columns')
    && trioState.paneCount === 3 && trioState.occupied === 2 && trioEmptySlotExpected
    && trioState.titles.length === 2 && trioState.tabCount >= 3,
  `tabs=${trioState?.tabCount}, source=${trioGeometry?.title || 'none'}, flyout=${trioFlyoutReady}, slotDragOver=${trioDragOverObserved}, layout=${trioState?.layout}, occupied=${trioState?.occupied}, empty=${JSON.stringify(trioState?.empty)}, unique=${new Set(trioState?.titles || []).size}`);
  // Leave the later history/detach fixtures in the regular single-view state.
  const maximizeTrio = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.multiview-pane-chrome.active-pane .multiview-pane-controls .multiview-pane-btn:nth-child(2)'); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true
  });
  let trioCleanup = false;
  if (maximizeTrio.result.value && await waitForUi('.multiview-grid-container', false)) {
    const closeExtraTab = await cdp.send('Runtime.evaluate', {
      expression: `(() => { if (document.querySelectorAll('.vertical-tab-item').length <= ${trioTabCount.result.value}) return true; const close = document.querySelector('.vertical-tab-item.active .vtab-close-btn'); if (!close) return false; close.click(); return true; })()`,
      returnByValue: true
    });
    for (let attempt = 0; attempt < 25; attempt++) {
      const count = await cdp.send('Runtime.evaluate', {
        expression: `document.querySelectorAll('.vertical-tab-item').length`,
        returnByValue: true
      });
      if (closeExtraTab.result.value && count.result.value === trioTabCount.result.value) { trioCleanup = true; break; }
      await sleep(100);
    }
  }
  check('Trio smoke cleanup restores the original tab count for following checks', trioCleanup,
    `maximize=${maximizeTrio.result.value}, tabs=${trioState?.tabCount}->${trioTabCount.result.value}, cleaned=${trioCleanup}`);

  // Regress the separate user path: add a third tab to an already populated
  // dual split through the sidebar's real split action. The explicit empty
  // slot snap check above exercises setSnapGroup; this one exercises
  // addSplitTab plus the mounted BrowserMain/multiview render path.
  const addThirdSplitBaseline = await cdp.send('Runtime.evaluate', {
    expression: `document.querySelectorAll('.vertical-tab-item').length`,
    returnByValue: true
  });
  const addThirdSplitUrls = ['A', 'B', 'C'].map((id) => downloadFixtureUrl.replace(/\/download$/, `/split-pane/${id}`));
  const addThirdSplitSeeds = [];
  for (let index = 0; index < addThirdSplitUrls.length; index++) {
    const create = await cdp.send('Runtime.evaluate', {
      expression: `(() => { const button = document.querySelector('.vertical-new-tab-btn'); if (!button) return false; button.click(); return true; })()`,
      returnByValue: true
    });
    let created = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const count = await cdp.send('Runtime.evaluate', {
        expression: `document.querySelectorAll('.vertical-tab-item').length`,
        returnByValue: true
      });
      if (create.result.value && count.result.value === addThirdSplitBaseline.result.value + index + 1) { created = true; break; }
      await sleep(100);
    }
    const navigation = created ? await enterAddressThroughKeyboard(cdp, addThirdSplitUrls[index]) : null;
    let loaded = false;
    for (let attempt = 0; attempt < 60 && navigation?.submitted; attempt++) {
      const state = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const view = document.querySelector('.browser-tab-pane.active-tab-pane webview.browser-view'); return { url: view?.getURL?.() || '', title: view?.getTitle?.() || '', loading: view?.isLoading?.() || false }; })()`,
        returnByValue: true
      });
      if (state.result.value?.url === addThirdSplitUrls[index]
        && state.result.value.title === `Lastbrowser Split Smoke ${String.fromCharCode(65 + index)} ${process.pid}`
        && !state.result.value.loading) {
        loaded = true;
        break;
      }
      await sleep(100);
    }
    addThirdSplitSeeds.push({ created, submitted: Boolean(navigation?.submitted), loaded });
  }

  const activateSplitSeed = async (id, action) => cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const row = [...document.querySelectorAll('.vertical-tab-item')].find((item) => item.querySelector('.vtab-title')?.textContent?.trim() === 'Lastbrowser Split Smoke ${id} ${process.pid}');
      if (!row) return false;
      if (${JSON.stringify(action)} === 'activate') { row.click(); return true; }
      const button = row.querySelector('.vtab-split-btn');
      if (!button) return false;
      button.click();
      return true;
    })()`,
    returnByValue: true
  });
  const activateFirstSplitSeed = await activateSplitSeed('A', 'activate');
  const addSecondSplitSeed = await activateSplitSeed('B', 'split');
  let dualSplitReady = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const state = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({ layout: document.querySelector('.multiview-grid-container')?.className || '', occupied: document.querySelectorAll('.multiview-pane-chrome.occupied').length, titles: [...document.querySelectorAll('.multiview-pane-title')].map((item) => item.textContent?.trim() || '') })`,
      returnByValue: true
    });
    const value = JSON.parse(state.result.value || '{}');
    if (value.layout && value.occupied === 2 && value.titles.includes(`Lastbrowser Split Smoke A ${process.pid}`) && value.titles.includes(`Lastbrowser Split Smoke B ${process.pid}`)) {
      dualSplitReady = true;
      break;
    }
    await sleep(100);
  }
  const addThirdSplitSeed = dualSplitReady ? await activateSplitSeed('C', 'split') : { result: { value: false } };
  let addThirdSplitState = { layout: '', occupied: 0, empty: 0, paneTitles: [], views: [] };
  let thirdSplitReady = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    const state = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify((() => {
        const panes = [...document.querySelectorAll('.multiview-pane-chrome')];
        const views = [...document.querySelectorAll('.browser-tab-pane')].map((pane) => {
          const view = pane.querySelector('webview.browser-view');
          return { tabId: view?.getAttribute('data-tab-id') || '', url: view?.getURL?.() || '', title: view?.getTitle?.() || '', visible: pane.style.visibility === 'visible' };
        }).filter((view) => view.tabId && view.url.includes('/split-pane/'));
        return {
          layout: document.querySelector('.multiview-grid-container')?.className || '',
          occupied: panes.filter((pane) => pane.classList.contains('occupied')).length,
          empty: panes.filter((pane) => pane.classList.contains('empty')).length,
          paneTitles: [...document.querySelectorAll('.multiview-pane-title')].map((item) => item.textContent?.trim() || ''),
          views
        };
      })())`,
      returnByValue: true
    });
    addThirdSplitState = JSON.parse(state.result.value || '{}');
    const expectedTitles = ['A', 'B', 'C'].map((id) => `Lastbrowser Split Smoke ${id} ${process.pid}`);
    const expectedUrlsPresent = addThirdSplitUrls.every((url) => addThirdSplitState.views.some((view) => view.url === url && view.visible));
    if (addThirdSplitSeed.result.value && addThirdSplitState.layout.includes('layout-trio-columns')
      && addThirdSplitState.occupied === 3 && addThirdSplitState.empty === 0
      && expectedTitles.every((title) => addThirdSplitState.paneTitles.includes(title))
      && new Set(addThirdSplitState.views.map((view) => view.tabId)).size === 3 && expectedUrlsPresent) {
      thirdSplitReady = true;
      break;
    }
    await sleep(100);
  }
  check('adding a third tab through the sidebar to an existing dual fills all three Trio panes',
    addThirdSplitSeeds.length === 3 && addThirdSplitSeeds.every((seed) => seed.created && seed.submitted && seed.loaded)
      && activateFirstSplitSeed.result.value && addSecondSplitSeed.result.value && dualSplitReady && thirdSplitReady,
    `seeds=${JSON.stringify(addThirdSplitSeeds)}, dual=${dualSplitReady}, addThird=${addThirdSplitSeed.result.value}, state=${JSON.stringify(addThirdSplitState)}`);

  // Restore the baseline tab count even when the assertion fails.
  const maximizeAddedThird = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.multiview-pane-chrome.active-pane .multiview-pane-controls .multiview-pane-btn:nth-child(2)'); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true
  });
  let addThirdCleanup = false;
  if (maximizeAddedThird.result.value && await waitForUi('.multiview-grid-container', false)) {
    for (let index = 0; index < 3; index++) {
      const close = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const row = [...document.querySelectorAll('.vertical-tab-item')].find((item) => item.querySelector('.vtab-title')?.textContent?.trim().startsWith('Lastbrowser Split Smoke ')); const button = row?.querySelector('.vtab-close-btn'); if (!button) return false; button.click(); return true; })()`,
        returnByValue: true
      });
      if (!close.result.value) break;
      await sleep(150);
    }
    for (let attempt = 0; attempt < 30; attempt++) {
      const count = await cdp.send('Runtime.evaluate', {
        expression: `document.querySelectorAll('.vertical-tab-item').length`,
        returnByValue: true
      });
      if (count.result.value === addThirdSplitBaseline.result.value) { addThirdCleanup = true; break; }
      await sleep(100);
    }
  }
  check('third-pane smoke cleanup restores the original tab count', addThirdCleanup,
    `maximize=${maximizeAddedThird.result.value}, tabs=${addThirdSplitState.views.length}->${addThirdSplitBaseline.result.value}, cleaned=${addThirdCleanup}`);

  const waitForActiveGuestUrl = async (host) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const current = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const view = document.querySelector('.browser-tab-pane.active-tab-pane webview.browser-view'); return { url: view?.getURL?.() || '', loading: view?.isLoading?.() || false }; })()`,
        returnByValue: true
      });
      const state = current.result.value;
      if (state?.url.includes(host) && !state.loading) return true;
      await sleep(250);
    }
    return false;
  };
  const openedExample = await enterAddressThroughKeyboard(cdp, 'https://example.com/');
  const exampleLoaded = Boolean(openedExample) && await waitForActiveGuestUrl('example.com');
  const openedIana = exampleLoaded && await enterAddressThroughKeyboard(cdp, 'https://www.iana.org/domains/reserved');
  const ianaLoaded = Boolean(openedIana) && await waitForActiveGuestUrl('iana.org');
  const detachHistorySeed = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const view = document.querySelector('.browser-tab-pane.active-tab-pane webview.browser-view');
      const other = [...document.querySelectorAll('.vertical-tab-item')].find(item => !item.classList.contains('active'));
      if (!view || !other) return { ready: false, reason: 'active or alternate guest unavailable' };
      const title = view.getTitle();
      other.click();
      await new Promise(resolve => setTimeout(resolve, 150));
      const row = [...document.querySelectorAll('.vertical-tab-item')].find(item => item.querySelector('.vtab-title')?.textContent?.trim() === title);
      const pane = [...document.querySelectorAll('.browser-tab-pane')].find(item => item.querySelector('webview.browser-view') === view);
      return { ready: ${exampleLoaded && ianaLoaded} && view.canGoBack() && view.getURL().includes('iana.org') && Boolean(row && !row.classList.contains('active')) && Boolean(pane && !pane.classList.contains('active-tab-pane')), url: view.getURL(), canGoBack: view.canGoBack(), title, tabId: view.getAttribute('data-tab-id'), inactive: Boolean(row && !row.classList.contains('active')), reason: ${JSON.stringify(`exampleLoaded=${exampleLoaded}, ianaLoaded=${ianaLoaded}`)} };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  const detachHistorySeedState = detachHistorySeed.result.value;
  check('split detach fixtures have real back-history entries', detachHistorySeedState?.ready,
    `url=${detachHistorySeedState?.url}, canGoBack=${detachHistorySeedState?.canGoBack}, inactive=${detachHistorySeedState?.inactive}, reason=${detachHistorySeedState?.reason || ''}`);

  const detachGeometryResult = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const title = ${JSON.stringify(detachHistorySeedState?.title || '')};
      const hitPointFor = (tab) => {
        const rect = tab.getBoundingClientRect(), y = rect.top + rect.height / 2;
        for (const offset of [24, 8, Math.min(rect.width * 0.5, 110), Math.max(8, rect.width - 18)]) {
          const point = { x: rect.left + offset, y }, hit = document.elementFromPoint(point.x, point.y);
          if (hit && (hit === tab || tab.contains(hit))) return point;
        }
        return null;
      };
      const source = [...document.querySelectorAll('.vertical-tab-item')].find(tab => !tab.classList.contains('active') && tab.querySelector('.vtab-title')?.textContent?.trim() === title && hitPointFor(tab));
      const frame = document.querySelector('.browser-webview-frame');
      if (!source || !frame) return null;
      const target = frame.getBoundingClientRect();
      const from = hitPointFor(source);
      const hit = document.elementFromPoint(from.x, from.y);
      return {
        from,
        to: { x: target.left + target.width * 0.10, y: target.top + target.height * 0.5 },
        sourceHit: hit?.tagName.toLowerCase() + (hit?.className && typeof hit.className === 'string' ? '.' + hit.className.trim().replace(/\\s+/g, '.') : '')
      };
    })()`,
    returnByValue: true
  });
  const detachGeometry = detachGeometryResult.result.value;
  if (detachGeometry) {
    await pressMouse(cdp, detachGeometry.from);
    await moveHeldMouse(cdp, detachGeometry.from, detachGeometry.to);
    await releaseMouse(cdp, detachGeometry.to);
  }
  const detachDragStart = { result: { value: Boolean(detachGeometry?.sourceHit?.includes('vertical-tab-item')) && await waitForUi('.multiview-grid-container', true) } };
  const detachPaneStateResult = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({ multiview: Boolean(document.querySelector('.multiview-grid-container')), occupied: document.querySelectorAll('.multiview-pane-chrome.occupied').length })`,
    returnByValue: true
  });
  const detachPaneState = JSON.parse(detachPaneStateResult.result.value);
  const detachButton = detachDragStart.result.value && detachPaneState.occupied >= 2 ? await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.multiview-pane-chrome.occupied .multiview-pane-controls .multiview-pane-btn:first-child'); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true
  }) : { result: { value: false } };
  let detachedShell = null;
  for (let i = 0; i < 50; i++) {
    const currentTargets = await cdpList();
    detachedShell = currentTargets.find((target) => target.type === 'page' && target.url.includes('index.html') && target.id !== shell.id) || null;
    if (detachedShell) break;
    await sleep(200);
  }
  let detachedInfo = { tabs: 0, ready: 'missing', webviews: [], transferPending: null };
  let detachedCdp = null;
  if (detachedShell?.webSocketDebuggerUrl) {
    detachedCdp = new CDP(detachedShell.webSocketDebuggerUrl);
  }
  let sourceInfo = { multiview: true, tabs: 0 };
  // A detached renderer can take several seconds to attach its guest WebView.
  // Poll both windows through the main-process ACK timeout rather than taking
  // a one-time snapshot of the destination shell before React has mounted it.
  for (let i = 0; i < 110; i++) {
    if (detachedCdp) {
      try {
        const state = await detachedCdp.send('Runtime.evaluate', {
          expression: `(async () => {
            const allWebviews = [...document.querySelectorAll('webview')].map((view) => {
              let guestId = null;
              try { guestId = view.getWebContentsId(); } catch {}
              const rect = view.getBoundingClientRect();
              return {
                tabId: view.getAttribute('data-tab-id'),
                guestId,
                src: view.getAttribute('src'),
                url: typeof view.getURL === 'function' ? view.getURL() : '',
                canGoBack: typeof view.canGoBack === 'function' ? view.canGoBack() : false,
                canGoForward: typeof view.canGoForward === 'function' ? view.canGoForward() : false,
                className: view.className,
                attributes: view.getAttributeNames(),
                width: rect.width,
                height: rect.height
              };
            });
            let startup = null;
            try { startup = await window.lastbrowser?.window?.getStartupState?.(); } catch {}
            const frame = document.querySelector('.browser-webview-frame');
            const frameRect = frame?.getBoundingClientRect();
            return JSON.stringify({
              ready: document.readyState,
              tabs: document.querySelectorAll('.vertical-tab-item').length,
              webviews: allWebviews.filter((view) => view.tabId),
              allWebviews,
              transferPending: Boolean(startup?.transfer),
              shellClass: document.querySelector('.app-shell')?.className || '',
              frame: frame ? { display: getComputedStyle(frame).display, visibility: getComputedStyle(frame).visibility, width: frameRect?.width, height: frameRect?.height } : null
            });
          })()`,
          awaitPromise: true,
          returnByValue: true
        }, 1000);
        detachedInfo = JSON.parse(state.result.value);
      } catch {
        const currentTargets = await cdpList();
        if (!currentTargets.some((target) => target.id === detachedShell?.id)) break;
        // The secondary renderer can still be initializing; retry while its
        // BrowserWindow remains alive, with a bounded CDP call timeout.
      }
    }
    const sourceAfterDetach = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({ multiview: Boolean(document.querySelector('.multiview-grid-container')), tabs: document.querySelectorAll('.vertical-tab-item').length })`,
      returnByValue: true
    }, 1000);
    sourceInfo = JSON.parse(sourceAfterDetach.result.value);
    const attachedGuest = detachedInfo.webviews?.some((view) => Number.isInteger(view.guestId) && view.guestId > 0);
    if (detachedInfo.tabs === 1 && attachedGuest && !detachedInfo.transferPending && sourceInfo.tabs === 1 && !sourceInfo.multiview) break;
    await sleep(200);
  }
  const detachedGuest = detachedInfo.webviews?.find((view) => Number.isInteger(view.guestId) && view.guestId > 0);
  const detachedGuestVisible = Boolean(detachedGuest && detachedGuest.width > 0 && detachedGuest.height > 0);
  check('detaching a split pane opens a second window and preserves its page', detachDragStart.result.value && detachButton.result.value && Boolean(detachedShell) && detachedInfo.tabs === 1 && detachedInfo.webviews?.length === 1 && detachedGuestVisible && detachedGuest.url && detachedGuest.url !== 'about:blank' && !detachedInfo.transferPending && sourceInfo.tabs === 1 && !sourceInfo.multiview, `newWindow=${Boolean(detachedShell)}, detachedTabs=${detachedInfo.tabs}, detached=${JSON.stringify(detachedInfo)}, sourceTabs=${sourceInfo.tabs}, sourceMultiview=${sourceInfo.multiview}`);
  check('detached tab restores its active URL and back history', detachHistorySeedState?.ready
    && detachedGuest?.url?.includes('iana.org')
    && detachedGuest?.canGoBack
    && !detachedInfo.transferPending,
  `expected=${detachHistorySeedState?.url}, actual=${detachedGuest?.url}, canGoBack=${detachedGuest?.canGoBack}`);
  let detachedHistoryRoundTrip = { backUrl: '', forwardUrl: '', canGoBack: false };
  if (detachedCdp && detachedGuestVisible) {
    try {
      const roundTrip = await detachedCdp.send('Runtime.evaluate', {
        expression: `(async () => {
          const view = document.querySelector('.browser-tab-pane.active-tab-pane webview.browser-view');
          if (!view || !view.canGoBack()) return { backUrl: view?.getURL?.() || '', forwardUrl: '', canGoBack: Boolean(view?.canGoBack?.()) };
          view.goBack();
          let backUrl = view.getURL();
          for (let attempt = 0; attempt < 60 && !backUrl.includes('example.com'); attempt++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            backUrl = view.getURL();
          }
          const canGoForward = view.canGoForward();
          if (canGoForward) view.goForward();
          let forwardUrl = view.getURL();
          for (let attempt = 0; attempt < 60 && !forwardUrl.includes('iana.org'); attempt++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            forwardUrl = view.getURL();
          }
          return { backUrl, forwardUrl, canGoBack: view.canGoBack(), canGoForward: view.canGoForward() };
        })()`,
        awaitPromise: true,
        returnByValue: true
      }, 10_000);
      detachedHistoryRoundTrip = roundTrip.result.value || detachedHistoryRoundTrip;
    } catch (error) {
      detachedHistoryRoundTrip = { ...detachedHistoryRoundTrip, error: String(error) };
    }
  }
  check('detached tab back and forward return to the original pages',
    detachedHistoryRoundTrip.backUrl.includes('example.com') && detachedHistoryRoundTrip.forwardUrl.includes('iana.org'),
    JSON.stringify(detachedHistoryRoundTrip));
  detachedCdp?.close();
  // Detaching activates the new window. Resume the remaining user actions in
  // the original shell rather than a background renderer with paused frames.
  await cdp.send('Page.bringToFront');

  const hookOrderErrors = rendererDiagnostics.filter((message) =>
    /Rendered fewer hooks than expected|Minified React error #300|Rendered more hooks than during the previous render/i.test(message)
  );
  check('panel navigation does not trigger a React hook-order error', hookOrderErrors.length === 0,
    hookOrderErrors[0] || 'no React hook-order diagnostics');

  // Activate through the real titlebar control. Mutating localStorage and
  // reloading here can send an idle smoke profile to the session-lock screen,
  // which unmounts CursorLoupeHUD and produces a false capture failure.
  const enableLoupe = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const button = document.querySelector('.modern-titlebar .loupe-toggle-btn');
      if (!button) return { clicked: false, reason: 'loupe toggle not rendered' };
      button.click();
      return { clicked: true, pressed: button.getAttribute('aria-pressed') };
    })()`,
    returnByValue: true
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x: 600, y: 450, button: 'none'
  });
  let loupeRuntime = null;
  for (let i = 0; i < 40; i++) {
    await sleep(200);
    try {
      const loupeState = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const loupe = document.querySelector('.lb-cursor-loupe');
          const image = loupe?.querySelector('img');
          return JSON.stringify({
            setting: JSON.parse(localStorage.getItem('lastbrowser.a11y.visionImpaired.v2') || '{}'),
            enabled: document.documentElement.dataset.a11yViEnabled,
            loupe: Boolean(loupe), image: image?.getAttribute('src') || '',
            imageWidth: image?.naturalWidth || 0, imageHeight: image?.naturalHeight || 0
          });
        })()`,
        returnByValue: true
      }, 1000);
      loupeRuntime = JSON.parse(loupeState.result.value);
      if (loupeRuntime.enabled === 'true' && loupeRuntime.setting?.enabled === true
        && loupeRuntime.setting?.cursorLoupeEnabled === true && loupeRuntime.loupe
        && loupeRuntime.image.startsWith('data:image/') && loupeRuntime.imageWidth > 0) break;
    } catch {
      // Wait for the shell renderer to finish reloading, bounded by the loop.
    }
  }
  const loupePointer = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const point = await window.lastbrowser.system.getCursorPosition();
      return { inside: point.x >= 0 && point.y >= 0 && point.x < innerWidth && point.y < innerHeight };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  // CDP pointer events do not move the OS cursor polled by CursorLoupeHUD.
  // An outside cursor cannot yield a visible window crop; retain that boundary
  // explicitly instead of treating a synthetic move as a native capture test.
  if (loupePointer.result.value?.inside === false) {
    skip('cursor loupe capture requires the OS pointer inside the test window', 'OS cursor outside window; CDP mouse movement does not change it');
  } else {
  check('enabled cursor loupe renders a captured image in the running app',
    enableLoupe.result.value?.clicked === true
    && loupeRuntime?.setting?.enabled === true
    && loupeRuntime?.setting?.cursorLoupeEnabled === true && loupeRuntime?.enabled === 'true'
      && loupeRuntime?.loupe === true && loupeRuntime?.image.startsWith('data:image/')
      && loupeRuntime?.imageWidth > 0 && loupeRuntime?.imageHeight > 0,
    JSON.stringify(loupeRuntime && {
      enabled: loupeRuntime.enabled,
      loupe: loupeRuntime.loupe,
      imageCaptured: loupeRuntime.image.startsWith('data:image/'),
      imageWidth: loupeRuntime.imageWidth,
      imageHeight: loupeRuntime.imageHeight
    }));
  }
  }

  if (process.env.LASTBROWSER_SMOKE_OLLAMA === '1') {
    let activeSpacePath = '';
    let activeSpaceProbeError = '';
    const activeSpaceDeadline = Date.now() + 15_000;
    // This read is idempotent. The preceding loupe test requests an OS/guest
    // screenshot and can briefly load the renderer; tolerate a short CDP
    // evaluation timeout instead of aborting the entire live-provider smoke.
    while (!activeSpacePath && Date.now() < activeSpaceDeadline) {
      try {
        const activeSpaceProbe = await cdp.send('Runtime.evaluate', {
          expression: "localStorage.getItem('lastbrowser.activeSpacePath.v1') || ''",
          returnByValue: true
        }, 2_000);
        activeSpacePath = activeSpaceProbe.result.value || '';
      } catch (error) {
        activeSpaceProbeError = error instanceof Error ? error.message : String(error);
      }
      if (!activeSpacePath) await sleep(200);
    }
    if (!activeSpacePath) {
      throw new Error(`Could not read active Space after the cursor-loupe check${activeSpaceProbeError ? ` (${activeSpaceProbeError})` : ''}`);
    }
    console.log('  INFO Ollama smoke: active Space read');
    console.log('  INFO Ollama smoke: applying isolated Space model selection');
    const switchToNativeChatLayout = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const activeSpacePath = ${JSON.stringify(activeSpacePath)};
        if (!activeSpacePath) return { ok: false, reason: 'active Space did not settle' };
        const selections = JSON.parse(localStorage.getItem('lastbrowser.spaceModels.v1') || '{}');
        selections[activeSpacePath] = { model: ${JSON.stringify(OLLAMA_SMOKE_MODEL_QUALIFIED)}, provider: 'ollama-cloud' };
        localStorage.setItem('lastbrowser.spaceModels.v1', JSON.stringify(selections));
        return { ok: true, spacePathAvailable: true };
      })()`,
      returnByValue: true
    }, 2_000);
    console.log('  INFO Ollama smoke: Space model selection applied');
    console.log('  INFO Ollama smoke: opening chat panel');
    const openChat = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const dockSelector = '[data-testid="nova-dock-chat"], .nova-dock-btn[aria-label$=" Chat"]';
        const dockButton = document.querySelector(dockSelector);
        if (dockButton) {
          dockButton.click();
          return { clicked: true, source: 'nova-dock', label: dockButton.getAttribute('aria-label') };
        }
        // In expanded mode the dock does not exist. Open the AI drawer by its
        // stable tab position (Tabs, AI, Flows, Tools), then click its first
        // explicit AI panel card (aiDrawerItems starts with Chat).
        const aiTab = document.querySelectorAll('.sidebar-drawer-tabs > button.drawer-tab-btn[role="tab"]')[1];
        if (!aiTab) return { clicked: false, source: 'sidebar', reason: 'AI drawer tab is absent', candidates: [...document.querySelectorAll('button,[role="button"],a')]
          .map((entry) => (entry.getAttribute('aria-label') || entry.innerText || '').trim()).filter(Boolean).slice(0, 30) };
        aiTab.click();
        return { clicked: true, source: 'sidebar-ai-drawer', label: (aiTab.innerText || '').trim() };
      })()`,
      returnByValue: true
    }, 2_000);
    console.log('  INFO Ollama smoke: chat panel open request completed');
    if (!openChat.result.value?.clicked) {
      throw new Error(`Could not find a Chat panel control: ${JSON.stringify(openChat.result.value)}`);
    }
    if (openChat.result.value.source === 'sidebar-ai-drawer') {
      let sidebarChatOpened = false;
      let sidebarChatDetails = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        const sidebarChat = await cdp.send('Runtime.evaluate', {
          expression: `(() => {
            const card = document.querySelector('.sidebar-drawer-content[role="region"] .drawer-cards-list > button.sidebar-drawer-card');
            if (!card) return null;
            const title = card.querySelector('.drawer-card-title')?.textContent?.trim() || '';
            card.click();
            return { clicked: true, title };
          })()`,
          returnByValue: true
        }, 2_000);
        sidebarChatDetails = sidebarChat.result.value;
        if (sidebarChatDetails?.clicked) {
          sidebarChatOpened = true;
          break;
        }
        await sleep(100);
      }
      if (!sidebarChatOpened) {
        throw new Error(`Could not open the Chat panel from the AI drawer: ${JSON.stringify(sidebarChatDetails)}`);
      }
      console.log(`  INFO Ollama smoke: sidebar Chat card selected (${sidebarChatDetails.title || 'first AI panel card'})`);
    }
    let chatReady = false;
    let createChatRequested = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (!chatReady && attempt === 0) console.log('  INFO Ollama smoke: waiting for chat composer');
      const chatState = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const main = document.querySelector('.native-chat-main');
          const composer = main?.querySelector('.composer-input-row textarea');
          return Boolean(main && composer);
        })()`,
        returnByValue: true
      }, 2_000);
      chatReady = chatState.result.value === true;
      if (chatReady) break;
      if (!createChatRequested) {
        console.log('  INFO Ollama smoke: requesting a new Chat session');
        const createChat = await cdp.send('Runtime.evaluate', {
          expression: `(() => {
            const main = document.querySelector('.native-chat-main');
            const create = document.querySelector('.native-chat-main .new-chat-btn, .native-chat-main .chat-empty-state button');
            if (!create) return false;
            create.click();
            return true;
          })()`,
          returnByValue: true
        });
        createChatRequested = createChat.result.value === true;
        console.log(`  INFO Ollama smoke: new Chat request completed (clicked=${createChatRequested})`);
      }
      await sleep(250);
    }
    console.log(`  INFO Ollama smoke: composer readiness completed (ready=${chatReady}, createChatRequested=${createChatRequested})`);
    if (!chatReady) throw new Error('Chat composer did not become ready within the bounded UI wait');
    console.log('  INFO Ollama smoke: installing stream observers');
    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        localStorage.setItem('__lastbrowser_chat_stream_debug', '1');
        window.__lastbrowserChatStreamDebug = [];
        window.__ollamaSmokeStreamEvents = [];
        window.__ollamaSmokeDomMutations = [];
        window.__ollamaSmokeStreamEndAt = null;
        window.__ollamaSmokeUnsubscribe?.();
        window.__ollamaSmokeUnsubscribe = window.lastbrowser.sidekick.onChatStreamEvent((payload) => {
          const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
          const text = typeof data.text === 'string' ? data.text : typeof data.content === 'string' ? data.content : '';
          const event = String(payload?.event || '');
          const at = performance.now();
          if (event === 'stream_end') window.__ollamaSmokeStreamEndAt = at;
          window.__ollamaSmokeStreamEvents.push({
            streamId: payload?.streamId || '', event, at,
            answerTextLength: event === 'token' || event === 'delta' ? text.length : 0,
            reasoningTextLength: event === 'reasoning' ? text.length : 0
          });
        });
        window.__ollamaSmokeObserver?.disconnect();
        const chat = document.querySelector('.native-chat-main');
        window.__ollamaSmokeReadAnswer = (assistant) => {
          const body = assistant?.querySelector('.message-body');
          return [...(body?.children || [])]
            .filter((child) => child.matches('.rich-text-renderer, .bionic-text'))
            .map((child) => child.innerText || '').join('\\n').trim();
        };
        let previousAnswer = '';
        window.__ollamaSmokeObserver = new MutationObserver(() => {
          const assistant = [...document.querySelectorAll('.native-chat-main .chat-message.assistant')].at(-1);
          const answer = window.__ollamaSmokeReadAnswer(assistant);
          const pending = assistant?.classList.contains('pending') || false;
          if (!answer.trim() || pending || answer === previousAnswer) return;
          previousAnswer = answer;
          window.__ollamaSmokeDomMutations.push({
            at: performance.now(), answerLength: answer.length,
            running: Boolean(document.querySelector('.native-chat-main .composer-send.stop')),
            pending
          });
        });
        if (chat) window.__ollamaSmokeObserver.observe(chat, { subtree: true, childList: true, characterData: true });
        return true;
      })()`,
      returnByValue: true
    });
    console.log('  INFO Ollama smoke: stream observers installed');
    console.log('  INFO Ollama smoke: checking selected Ollama model option');
    const probeModelChoice = () => cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const select = document.querySelector('.native-chat-main .composer-model select');
        const options = [...(select?.options || [])];
        const normalized = (value) => String(value || '').replace(/^@?ollama-cloud:/i, '');
        const candidates = options.filter((entry) => normalized(entry.value) === ${JSON.stringify(OLLAMA_SMOKE_MODEL)});
        const option = candidates.find((entry) => /ollama/i.test(entry.parentElement?.label || ''))
          || candidates.find((entry) => entry.parentElement?.tagName === 'OPTGROUP')
          || candidates[0];
        if (!select || !option) return { available: false, selected: select?.value || '', optionCount: options.length, ollamaOptionCount: 0 };
        return { available: true, selected: select.value, option: option.value, optionCount: options.length, group: option.parentElement?.label || '' };
      })()`,
      returnByValue: true
    });
    console.log('  INFO Ollama smoke: requesting /api/models catalog; Sidekick IPC request deadline is 30 seconds');
    const liveCatalogStartedAt = Date.now();
    let liveCatalog;
    try {
      liveCatalog = await cdp.send('Runtime.evaluate', {
      expression: `(async () => {
        try {
          const data = await window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/models' });
          const groups = Array.isArray(data?.groups) ? data.groups : [];
          return JSON.stringify({ groups: groups.map((group) => ({
            provider: String(group?.provider || ''),
            providerId: String(group?.provider_id || ''),
            modelCount: Array.isArray(group?.models) ? group.models.length : 0,
            sampleIds: Array.isArray(group?.models) ? group.models.slice(0, 2).map((model) => String(model?.id || '')) : []
          })) });
        } catch (error) {
          return JSON.stringify({ error: String(error) });
        }
      })()` ,
      awaitPromise: true,
      returnByValue: true
      }, 32_000);
    } catch (error) {
      console.error(`  INFO Ollama smoke: catalog evaluation failed after ${Date.now() - liveCatalogStartedAt}ms`);
      throw error;
    }
    console.log(`  INFO Ollama smoke: /api/models catalog returned in ${Date.now() - liveCatalogStartedAt}ms`);
    // Composer readiness and asynchronous provider-catalog readiness are
    // separate requirements. A saved model can be usable before its group is
    // loaded; still require the actual Ollama group before the live send.
    let modelChoice;
    const modelChoiceDeadline = Date.now() + 12_000;
    do {
      modelChoice = await probeModelChoice();
      if (/ollama/i.test(modelChoice.result.value?.group || '')) break;
      await sleep(250);
    } while (Date.now() < modelChoiceDeadline);
    console.log(`  INFO Ollama smoke: model option check completed (available=${Boolean(modelChoice.result.value?.available)}, group=${modelChoice.result.value?.group || 'missing'})`);
    if (!modelChoice.result.value?.available || !/ollama/i.test(modelChoice.result.value?.group || '')) {
      throw new Error(`Ollama model group did not load: ${JSON.stringify({ choice: modelChoice.result.value, catalog: liveCatalog.result.value })}`);
    }
    const selectedOllamaModelId = modelChoice.result.value?.selected || '';
    let persistedModel = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const persisted = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
        const activeSpacePath = localStorage.getItem('lastbrowser.activeSpacePath.v1') || '';
        const selections = JSON.parse(localStorage.getItem('lastbrowser.spaceModels.v1') || '{}');
        const selection = selections[activeSpacePath];
        const select = document.querySelector('.native-chat-main .composer-model select');
        return Boolean(activeSpacePath && ${JSON.stringify(selectedOllamaModelId)})
          && selection?.model === ${JSON.stringify(OLLAMA_SMOKE_MODEL_QUALIFIED)}
          && selection?.provider === 'ollama-cloud'
          && select?.value === ${JSON.stringify(selectedOllamaModelId)};
        })()`,
        returnByValue: true
      }, 2_000);
      persistedModel = persisted.result.value === true;
      if (persistedModel) break;
      await sleep(250);
    }
    const preparedPrompt = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const textarea = document.querySelector('.native-chat-main .composer-input-row textarea');
        const form = textarea?.closest('form');
        const select = document.querySelector('.native-chat-main .composer-model select');
        if (!${JSON.stringify(persistedModel)} || !select || select.value !== ${JSON.stringify(selectedOllamaModelId)}
          || !textarea || !form || textarea.disabled) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        const prompt = 'Tell a brief 80-word story about a small robot finding a blue flower. Begin the story immediately with no preamble.';
        setter?.call(textarea, prompt);
        textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
        return true;
      })()`,
      returnByValue: true
    });
    // Let React commit the controlled input before submitting. Submitting in
    // the input event's task can still read the previous (empty) composer state.
    await cdp.send('Runtime.evaluate', {
      expression: `new Promise((resolve) => setTimeout(resolve, 0))`,
      awaitPromise: true,
      returnByValue: true
    });
    const sendPrompt = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const textarea = document.querySelector('.native-chat-main .composer-input-row textarea');
        const form = textarea?.closest('form');
        const button = form?.querySelector('.composer-send');
        if (!${JSON.stringify(preparedPrompt.result.value)} || !textarea?.value.trim()
          || !form || !button || button.disabled || textarea.disabled) return false;
        form.requestSubmit();
        return true;
      })()`,
      returnByValue: true
    });
    let ollamaAnswer = '';
    let ollamaError = '';
    let streamedWhileRequestActive = false;
    let streamedAssistantText = '';
    let reasoningVisibleWhileRunning = false;
    let ollamaCompleted = false;
    const answerDeadline = Date.now() + 120_000;
    while (Date.now() < answerDeadline) {
      const response = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const assistant = [...document.querySelectorAll('.native-chat-main .chat-message.assistant')]
            .at(-1);
          const reasoning = assistant?.querySelector('.chat-reasoning-details');
          if (reasoning && !reasoning.open) reasoning.querySelector('summary')?.click();
          const reasoningContent = reasoning?.querySelector('.chat-reasoning-content');
          const visible = (element) => {
            if (!element) return false;
            const bounds = element.getBoundingClientRect(), style = getComputedStyle(element);
            return bounds.width > 0 && bounds.height > 0 && style.display !== 'none'
              && style.visibility !== 'hidden' && Number(style.opacity) > 0;
          };
          const answer = window.__ollamaSmokeReadAnswer(assistant);
          return JSON.stringify({
            answer,
            visibleReasoningCharacters: reasoning?.open && visible(reasoningContent)
              && visible(document.querySelector('.native-chat-main')) ? (reasoningContent.innerText || '').trim().length : 0,
            pending: assistant?.classList.contains('pending') || false,
            running: Boolean(document.querySelector('.native-chat-main .composer-send.stop')),
            streamEventCount: window.__ollamaSmokeStreamEvents?.length || 0,
            streamEventTypes: [...new Set((window.__ollamaSmokeStreamEvents || []).map((event) => event.event))],
            answerDeltaCharacters: (window.__ollamaSmokeStreamEvents || []).reduce((sum, event) => sum + event.answerTextLength, 0),
            reasoningCharacters: (window.__ollamaSmokeStreamEvents || []).reduce((sum, event) => sum + event.reasoningTextLength, 0),
            firstAnswerDeltaAt: window.__ollamaSmokeStreamEvents?.find((event) => event.answerTextLength > 0)?.at ?? null,
            streamEndAt: window.__ollamaSmokeStreamEndAt,
            domMutations: window.__ollamaSmokeDomMutations || [],
            error: document.querySelector('.native-chat-main .chat-error')?.innerText || ''
          });
        })()`,
        returnByValue: true
      }, 2_000);
      if (response.exceptionDetails || typeof response.result?.value !== 'string') {
        throw new Error('Ollama answer DOM probe failed');
      }
      const state = JSON.parse(response.result.value || '{}');
      ollamaAnswer = state.answer || '';
      ollamaError = state.error || '';
      reasoningVisibleWhileRunning ||= Boolean(state.running && state.visibleReasoningCharacters > 0);
      const visibleDuringStream = (state.domMutations || []).find((entry) => entry.running && !entry.pending && entry.answerLength > 0
        && (state.streamEndAt === null || entry.at < state.streamEndAt));
      if (visibleDuringStream) {
        streamedWhileRequestActive = true;
        streamedAssistantText = `${visibleDuringStream.answerLength} chars in DOM`;
      }
      ollamaCompleted = state.streamEndAt != null && !state.running && !state.pending;
      if (ollamaCompleted || ollamaError) break;
      await sleep(250);
    }
    const streamDiagnostics = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        events: (window.__ollamaSmokeStreamEvents || []).reduce((counts, event) => { counts[event.event] = (counts[event.event] || 0) + 1; return counts; }, {}),
        answerDeltaCharacters: (window.__ollamaSmokeStreamEvents || []).reduce((sum, event) => sum + event.answerTextLength, 0),
        reasoningCharacters: (window.__ollamaSmokeStreamEvents || []).reduce((sum, event) => sum + event.reasoningTextLength, 0),
        firstAnswerDeltaAt: window.__ollamaSmokeStreamEvents?.find((event) => event.answerTextLength > 0)?.at ?? null,
        streamEndAt: window.__ollamaSmokeStreamEndAt,
        firstDomAnswer: (window.__ollamaSmokeDomMutations || []).find((event) => event.answerLength > 0 && !event.pending) || null,
        firstDomAnswerWhileRunning: (window.__ollamaSmokeDomMutations || []).find((event) => event.running && !event.pending && event.answerLength > 0) || null,
        rendererTrace: (() => {
          const trace = window.__lastbrowserChatStreamDebug || [];
          const events = trace.filter((event) => event.phase === 'event');
          const counts = {};
          for (const event of events) {
            const key = event.event || 'unknown';
            const count = counts[key] || (counts[key] = { total: 0, matching: 0, owned: 0, errors: {} });
            count.total += 1;
            if (event.streamMatches) count.matching += 1;
            if (event.ownsContext) count.owned += 1;
            if (event.errorKind) count.errors[event.errorKind] = (count.errors[event.errorKind] || 0) + 1;
          }
          return {
            started: trace.find((event) => event.phase === 'chat-started') || null,
            lifecycle: trace.filter((event) => event.phase !== 'event' && event.phase !== 'state-update').slice(-24),
            eventCounts: counts,
            firstStateUpdate: trace.find((event) => event.phase === 'state-update') || null,
            lastStateUpdate: trace.filter((event) => event.phase === 'state-update').at(-1) || null
          };
        })()
      })`,
      returnByValue: true
    }, 2_000);
    const parsedStreamDiagnostics = JSON.parse(streamDiagnostics.result.value || '{}');
    if (!ollamaCompleted) {
      // Retain transport evidence for a timed-out combined workflow. Report
      // only activity/counts, never session IDs, credentials or message text.
      const transport = await cdp.send('Runtime.evaluate', {
        expression: `(async () => {
          const streamId = window.__ollamaSmokeStreamEvents?.at(-1)?.streamId;
          const outcome = await Promise.race([
            streamId ? window.lastbrowser.sidekick.getStreamStatus(streamId)
              .then((status) => ({ reachable: true, active: status?.active,
                statusKeys: Object.keys(status || {}).filter((key) => !/id|token|key/i.test(key)) }))
              .catch(() => ({ reachable: false })) : Promise.resolve({ missingStream: true }),
            new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 2500))
          ]);
          return outcome;
        })()`, awaitPromise: true, returnByValue: true
      }, 3_500);
      console.log('  INFO Ollama transport status:', JSON.stringify(transport.result?.value || { probeFailed: true }));
      const runtime = await cdp.send('Runtime.evaluate', {
        expression: 'window.lastbrowser.services.status()', awaitPromise: true, returnByValue: true
      }, 3_000);
      if (runtime.result?.value?.webuiUrl) {
        try {
          const health = await fetch(new URL('/health', runtime.result.value.webuiUrl), { signal: AbortSignal.timeout(2_000) });
          console.log('  INFO Ollama direct health status:', health.status);
        } catch { console.log('  INFO Ollama direct health status: unreachable'); }
      }
    }
    streamedWhileRequestActive = Boolean(parsedStreamDiagnostics.firstDomAnswerWhileRunning
      && (parsedStreamDiagnostics.streamEndAt === null || parsedStreamDiagnostics.firstDomAnswerWhileRunning.at < parsedStreamDiagnostics.streamEndAt));
    streamedAssistantText = parsedStreamDiagnostics.firstDomAnswerWhileRunning
      ? `${parsedStreamDiagnostics.firstDomAnswerWhileRunning.answerLength} chars visible at ${Math.round(parsedStreamDiagnostics.firstDomAnswerWhileRunning.at - (parsedStreamDiagnostics.firstAnswerDeltaAt || 0))}ms after first answer delta`
      : '';
    check('Ollama Cloud model and provider selection persist in app preferences',
      switchToNativeChatLayout.result.value?.ok === true && (openChat.result.value === true || openChat.result.value?.clicked === true) && chatReady && modelChoice.result.value?.available === true && modelChoice.result.value?.group?.toLowerCase().includes('ollama') && persistedModel,
      JSON.stringify({ ollamaSpaceSelectionSeeded: switchToNativeChatLayout.result.value?.ok === true, chatOpened: openChat.result.value, chatReady, modelChoice: modelChoice.result.value, liveCatalog: JSON.parse(liveCatalog.result.value || '{}'), persistedModel }));
    check('real Ollama Cloud response completes and is rendered through the Lastbrowser chat UI',
      sendPrompt.result.value === true && ollamaCompleted && ollamaAnswer.length >= 160 && !ollamaError,
      JSON.stringify({ submitted: sendPrompt.result.value, completed: ollamaCompleted, answer: ollamaAnswer.slice(0, 120), error: ollamaError.slice(0, 160) }));
    check('Ollama Cloud answer becomes visible while the chat request is still streaming',
      sendPrompt.result.value === true && streamedWhileRequestActive,
      JSON.stringify({ submitted: sendPrompt.result.value, visibleWhileRunning: streamedWhileRequestActive, stream: parsedStreamDiagnostics, answer: streamedAssistantText }));
    check('Ollama Cloud thinking text is visible while the chat request is still streaming',
      sendPrompt.result.value === true && reasoningVisibleWhileRunning,
      JSON.stringify({ visibleWhileRunning: reasoningVisibleWhileRunning, reasoningCharacters: parsedStreamDiagnostics.reasoningCharacters }));
    if (!ollamaSmokeOnly) {
      const rendererTargets = (await cdpList()).filter((target) => target.type === 'page' && /index\.html/.test(target.url));
      const completions = [];
      for (const target of rendererTargets) {
        const observer = new CDP(target.webSocketDebuggerUrl);
        try {
          const result = await observer.send('Runtime.evaluate', {
            expression: `(() => {
              const trace = window.__lastbrowserChatStreamDebug || [];
              return { completedByEvent: trace.some(item => item.phase === 'completion-return' && item.path === 'stream-event' && item.ownsContext),
                ownedTerminal: trace.some(item => item.phase === 'event' && item.event === 'stream_end' && item.streamMatches && item.ownsContext) };
            })()`, returnByValue: true
          }, 2_000);
          completions.push(result.result?.value || {});
        } finally { observer.close(); }
      }
      check('concurrent browser windows receive chat completion without replacing the original subscription',
        rendererTargets.length >= 2 && completions.every(item => item.completedByEvent && item.ownedTerminal),
        JSON.stringify({ windows: rendererTargets.length, completions }));
    }
  }

  // A detached browser window may own the foreground compositor. Bring the
  // original shell forward before requesting its screenshot.
  await cdp.send('Page.bringToFront');
  await sleep(150);
  const shellShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const shellShotPath = path.join(OUT_DIR, 'shell.png');
  writeFileSync(shellShotPath, Buffer.from(shellShot.data, 'base64'));
  console.log(`  screenshot: ${shellShotPath}`);

  cdp.close();
  finish(child);
}

function finish(child) {
  stopSmokeApp(child);
  const failed = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.skipped).length;
  const passed = results.length - failed.length - skipped;
  console.log('');
  console.log(`Result: ${passed}/${results.length - skipped} checks passed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

function stopSmokeApp(child) {
  if (smokeDownloadServer) {
    try { smokeDownloadServer.close(); } catch { /* already closed */ }
    smokeDownloadServer = null;
  }
  if (child?.pid) {
    if (process.platform === 'win32') {
      // Electron runs renderer/GPU/utility processes beside its main process;
      // kill the whole isolated smoke tree to avoid leaving orphan windows.
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      });
    } else {
      try { process.kill(child.pid, 'SIGTERM'); } catch { /* already exited */ }
    }
  }
  const tempRoot = path.resolve(os.tmpdir());
  const profile = path.resolve(SMOKE_PROFILE_DIR);
  if (path.dirname(profile) === tempRoot
    && path.basename(profile).startsWith('lastbrowser-browser-smoke-')) {
    // Windows can release Electron profile handles shortly after taskkill
    // returns. Retry a bounded number of times so a completed smoke run does
    // not leave stale state that can collide with a later process ID.
    const delay = new Int32Array(new SharedArrayBuffer(4));
    for (let attempt = 0; attempt < 20 && existsSync(profile); attempt++) {
      try { rmSync(profile, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 }); } catch { /* retry below */ }
      if (existsSync(profile)) Atomics.wait(delay, 0, 0, 100);
    }
  }
}

async function captureFailureDiagnostics(error) {
  console.error('FATAL:', error);
  if (smokeCdp) {
    try {
      const state = await smokeCdp.send('Runtime.evaluate', {
        expression: `JSON.stringify((() => {
          const visible = (element) => Boolean(element && element.getClientRects().length);
          const composer = [...document.querySelectorAll('.native-chat-main textarea, .native-chat-main input, .native-chat-main [contenteditable="true"]')];
          return {
            page: { url: location.href, title: document.title, readyState: document.readyState, visibility: document.visibilityState },
            shell: { tabs: document.querySelectorAll('.vertical-tab-item').length, webviews: document.querySelectorAll('webview.browser-view').length, multiview: Boolean(document.querySelector('.multiview-grid-container')) },
            panels: [...document.querySelectorAll('.sidebar-drawer-tabs > button.drawer-tab-btn[role="tab"]')].map((tab) => ({ selected: tab.getAttribute('aria-selected'), active: tab.classList.contains('active') })),
            chat: {
              roots: document.querySelectorAll('.native-chat-main').length,
              visibleRoots: [...document.querySelectorAll('.native-chat-main')].filter(visible).length,
              composers: composer.map((element) => ({ tag: element.tagName.toLowerCase(), visible: visible(element), disabled: Boolean(element.disabled), hasValue: Boolean(element.value || element.textContent), aria: Boolean(element.getAttribute('aria-label')), placeholder: Boolean(element.getAttribute('placeholder')) })),
              sendButtons: [...document.querySelectorAll('.native-chat-main button')].filter((button) => /send|senden/i.test(button.getAttribute('aria-label') || button.title || '')).map((button) => ({ visible: visible(button), disabled: button.disabled })),
              errorNodes: document.querySelectorAll('.native-chat-main .chat-error').length
            }
          };
        })())`,
        returnByValue: true
      }, 2_000);
      console.error('FAILURE UI SNAPSHOT:', JSON.stringify({ target: smokeShellTarget, state: state.result?.value || '[empty]' }));
      const status = await smokeCdp.send('Runtime.evaluate', {
        expression: 'window.lastbrowser.services.status()',
        awaitPromise: true,
        returnByValue: true
      }, 2_000);
      const runtime = status.result?.value || {};
      console.error('FAILURE SERVICE STATUS:', JSON.stringify({ sidekick: runtime.sidekick, webuiHealth: runtime.webuiHealth, port: runtime.port, hasError: Boolean(runtime.lastError) }));
      if (runtime.webuiUrl) {
        const health = await fetch(new URL('/health', runtime.webuiUrl), { signal: AbortSignal.timeout(2_000) });
        console.error('FAILURE DIRECT HEALTH:', health.status);
      }
    } catch (diagnosticError) {
      console.error('FAILURE UI SNAPSHOT unavailable:', diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError));
    }
  }
  if (rendererDiagnostics.length) {
    const sanitizedDiagnostics = rendererDiagnostics.slice(-10).map((message) => String(message).slice(0, 300)
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/(api[_-]?key|token)(["'=:\s]+)[^\s,}"]+/gi, '$1$2[redacted]'));
    console.error('RECENT RENDERER DIAGNOSTICS:', JSON.stringify(sanitizedDiagnostics));
  }
  try {
    const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`, { signal: AbortSignal.timeout(2_000) }).then((response) => response.json());
    console.error('CDP TARGETS:', JSON.stringify(targets.map((target) => ({ id: target.id, type: target.type, title: target.title, url: target.url }))));
  } catch (diagnosticError) {
    console.error('CDP TARGET LIST unavailable:', diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError));
  }
}

main().catch(async (e) => {
  await captureFailureDiagnostics(e);
  stopSmokeApp(smokeChild);
  process.exit(1);
});
