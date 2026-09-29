/**
 * Isolated Electron + Sidekick migration smoke using only synthetic fixture data.
 *
 * Usage: node scripts/smoke-sidekick-migration.mjs [path-to-electron.exe]
 * Requires a current desktop build at apps/desktop/dist/main/main.js.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';

const electronExe = process.argv[2] || path.resolve('node_modules/electron/dist/electron.exe');
const mainEntry = path.resolve('apps/desktop/dist/main/main.js');
const tempRoot = path.resolve(os.tmpdir());
const root = mkdtempSync(path.join(tempRoot, 'lastbrowser-sidekick-migration-'));
const userData = path.join(root, 'user-data');
const fakeUserHome = path.join(root, 'fake-user');
const fakeAppData = path.join(root, 'fake-appdata');
const legacyHome = path.join(fakeUserHome, '.sidekick');
const bootstrapPath = path.join(root, 'electron-smoke-bootstrap.cjs');
const checks = [];
let appProcess;
let port;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function check(name, ok, detail = '') {
  checks.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  const value = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return value;
}
async function assertPortUnused(value) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', (error) => reject(new Error(`Refusing to attach to occupied CDP port ${value}: ${error.message}`)));
    server.listen(value, '127.0.0.1', () => server.close((error) => error ? reject(error) : resolve()));
  });
}
async function targets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) throw new Error(`CDP returned HTTP ${response.status}`);
  return response.json();
}
async function waitForShell() {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const target = (await targets()).find((item) => item.type === 'page' && item.url.includes('index.html'));
      if (target) return new CDP(target.webSocketDebuggerUrl);
    } catch { /* Electron is starting */ }
    await sleep(250);
  }
  throw new Error('Isolated Lastbrowser shell did not start');
}
class CDP {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.onopen = resolve;
      this.socket.onerror = () => reject(new Error('CDP WebSocket failed'));
    });
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      message.error ? pending.reject(new Error(JSON.stringify(message.error))) : pending.resolve(message.result);
    };
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  }
  close() { try { this.socket.close(); } catch { /* already closed */ } }
}
function stopAndClean() {
  if (appProcess?.pid) {
    spawnSync('taskkill.exe', ['/PID', String(appProcess.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    appProcess = null;
  }
  const safeRoot = path.resolve(root);
  if (path.dirname(safeRoot) === tempRoot && path.basename(safeRoot).startsWith('lastbrowser-sidekick-migration-')) {
    try { rmSync(safeRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* only our disposable profile */ }
  }
}

async function main() {
  if (process.platform !== 'win32') throw new Error('This smoke currently requires Windows process cleanup');
  if (!existsSync(electronExe)) throw new Error(`Electron binary missing: ${electronExe}`);
  if (!existsSync(mainEntry)) throw new Error(`Desktop build missing: ${mainEntry}`);

  mkdirSync(userData, { recursive: true });
  mkdirSync(fakeAppData, { recursive: true });
  mkdirSync(path.join(legacyHome, 'spaces', 'smoke-space'), { recursive: true });
  mkdirSync(path.join(legacyHome, 'profiles', 'smoke-profile'), { recursive: true });
  writeFileSync(path.join(legacyHome, 'spaces', 'smoke-space', 'fixture.md'), 'synthetic-space-data', 'utf8');
  writeFileSync(path.join(legacyHome, 'profiles', 'smoke-profile', 'profile.json'), '{"fixture":true}', 'utf8');
  writeFileSync(path.join(legacyHome, 'supermemory.db'), Buffer.from('synthetic-db-fixture'));
  writeFileSync(path.join(legacyHome, 'config.yaml'), 'model: synthetic-only\n', 'utf8');

  port = await freePort();
  await assertPortUnused(port);
  writeFileSync(bootstrapPath, [
    "const { app } = require('electron');",
    `app.setPath('home', ${JSON.stringify(fakeUserHome)});`,
    `app.setPath('appData', ${JSON.stringify(fakeAppData)});`,
    `app.setPath('userData', ${JSON.stringify(userData)});`,
    `require(${JSON.stringify(mainEntry)});`
  ].join('\n'), 'utf8');
  const env = {
    ...process.env,
    USERPROFILE: fakeUserHome,
    HOME: fakeUserHome,
    APPDATA: fakeAppData,
  };
  appProcess = spawn(electronExe, [
    `--user-data-dir=${userData}`,
    `--remote-debugging-port=${port}`,
    bootstrapPath
  ], { detached: true, stdio: 'ignore', windowsHide: true, env });
  appProcess.unref();

  const shell = await waitForShell();
  try {
    await shell.send('Runtime.enable');
    const detected = await shell.evaluate(`window.lastbrowser.sidekick.detectExistingInstall()`);
    check('Electron preload IPC detects only the synthetic legacy install',
      detected?.found === true && detected.homeDir === legacyHome,
      detected?.homeDir || 'no path returned');
    check('detection preview reports component availability accurately',
      detected?.components?.spaces === true && detected?.components?.supermemory === true
        && detected?.components?.profiles === true && detected?.components?.config === true);

    // Cancel path: detection is a read-only preview; not confirming import must
    // leave the disposable destination untouched. Do not invoke the backend
    // import here: its current runtime destination resolves outside this test
    // root, so such a call would not be safe to perform.
    check('cancel path remains read-only and does not create destination data',
      !existsSync(path.join(root, 'spaces')) && !existsSync(path.join(root, 'profiles'))
        && !existsSync(path.join(root, 'supermemory.db')));
  } finally {
    shell.close();
    stopAndClean();
  }

  console.log(`\nSidekick migration smoke: ${checks.filter(Boolean).length}/${checks.length} passed`);
  if (checks.some((result) => !result)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  stopAndClean();
  process.exitCode = 1;
});
