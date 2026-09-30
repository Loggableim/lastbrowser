/** Isolated CursorLoupeHUD runtime smoke using a disposable Electron profile. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const electron = process.argv[2] || path.resolve('node_modules/electron/dist/electron.exe');
const entry = path.resolve('apps/desktop/dist/main/main.js');
const profile = mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-cursor-loupe-smoke-'));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let child;
let cdp;
class AccessLockBlocked extends Error {
  constructor() {
    super('Access password is required before the cursor-loupe runtime can be tested.');
    this.code = 'ACCESS_LOCK_BLOCKED';
  }
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(Error('Could not allocate CDP port'));
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = () => reject(Error('CDP WebSocket connection failed'));
    });
    this.ws.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result);
    };
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(Error(`CDP timeout: ${method}`));
      }, 12000);
    });
  }
  close() { this.ws.close(); }
}

async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
  return result.result.value;
}

try {
  if (!existsSync(electron) || !existsSync(entry)) throw Error('Electron build or dist/main/main.js is missing');
  const port = await freePort();
  child = spawn(electron, [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, entry], {
    detached: true, stdio: 'ignore', windowsHide: true
  });
  let target;
  for (let i = 0; i < 80; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = targets.find((item) => item.type === 'page' && /index\.html/.test(item.url));
      if (target) break;
    } catch { /* Electron has not exposed CDP yet. */ }
    await wait(250);
  }
  if (!target) throw Error('Electron renderer target did not start');
  cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  let state = null;
  for (let i = 0; i < 80; i++) {
    state = JSON.parse(await evaluate(`JSON.stringify({
      shell: Boolean(document.querySelector('.app-shell')),
      checkingSession: Boolean(document.querySelector('.access-lock-screen:not(:has(#access-lock-password))')),
      accessPasswordRequired: Boolean(document.querySelector('#access-lock-password')),
      toggle: Boolean(document.querySelector('.modern-titlebar .loupe-toggle-btn')),
      loupe: Boolean(document.querySelector('.lb-cursor-loupe'))
    })`));
    if (state.toggle || state.accessPasswordRequired) break;
    await wait(250);
  }
  if (state?.accessPasswordRequired) throw new AccessLockBlocked();
  if (!state?.toggle) throw Error(`Cursor-loupe titlebar control did not render: ${JSON.stringify(state)}`);

  const activated = JSON.parse(await evaluate(`(() => {
    const button = document.querySelector('.modern-titlebar .loupe-toggle-btn');
    button.click();
    return JSON.stringify({pressed: button.getAttribute('aria-pressed'), stored: localStorage.getItem('lastbrowser.a11y.visionImpaired.v2')});
  })()`));
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 450, button: 'none' });

  let capture = null;
  for (let i = 0; i < 50; i++) {
    await wait(200);
    capture = JSON.parse(await evaluate(`(() => {
      const loupe = document.querySelector('.lb-cursor-loupe');
      const image = loupe?.querySelector('img');
      return JSON.stringify({
        loupe: Boolean(loupe),
        visible: Boolean(loupe && getComputedStyle(loupe).display !== 'none'),
        position: loupe?.style.transform || '',
        image: Boolean(image?.getAttribute('src')?.startsWith('data:image/')),
        width: image?.naturalWidth || 0,
        height: image?.naturalHeight || 0,
        textFallback: loupe?.querySelector('.lb-loupe-content')?.textContent || ''
      });
    })()`));
    if (capture.image && capture.width > 0 && capture.height > 0) break;
  }
  console.log(JSON.stringify({ activated, capture }, null, 2));
  if (activated.pressed !== 'true' || !capture?.loupe || !capture.visible) process.exitCode = 1;
  else if (!capture.image || !capture.width || !capture.height) process.exitCode = 2;
} catch (error) {
  if (error?.code === 'ACCESS_LOCK_BLOCKED') {
    console.error(`BLOCKED: ${error.message} No credentials were read or supplied.`);
    process.exitCode = 3;
  } else {
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
} finally {
  cdp?.close();
  if (child?.pid) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  if (path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir())
    && path.basename(profile).startsWith('lastbrowser-cursor-loupe-smoke-')) {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* process shutdown may still release profile handles */ }
  }
}
