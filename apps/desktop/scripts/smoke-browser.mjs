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
 * Defaults to the installed build at %LOCALAPPDATA%\Programs\Lastbrowser.
 * Exits 0 on success, 1 on failure. Screenshots land in ./smoke-output/.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DEFAULT_EXE = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'Programs',
  'Lastbrowser',
  'Lastbrowser.exe'
);
const EXE = process.argv[2] || process.env.LASTBROWSER_EXE || DEFAULT_EXE;
const CDP_PORT = Number(process.env.LASTBROWSER_SMOKE_CDP_PORT || 9333);
const TEST_URL = process.env.LASTBROWSER_SMOKE_URL || 'example.com';
const OUT_DIR = path.resolve(process.cwd(), 'smoke-output');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpList() {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
  return res.json();
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('CDP websocket error'));
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
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

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
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

  // 1. Launch
  const child = spawn(EXE, [`--remote-debugging-port=${CDP_PORT}`], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  console.log(`[1] launched (pid ${child.pid})`);

  let targets = null;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await cdpList();
      break;
    } catch {
      await sleep(1000);
    }
  }
  if (!targets) {
    check('cdp endpoint reachable', false, 'no response after 60s');
    finish(child);
  }
  check('cdp endpoint reachable', true, `${targets.length} target(s)`);

  // 2. Shell renderer
  const shell = targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
  check('shell renderer present', Boolean(shell), shell ? shell.url.split('/').pop() : 'not found');
  if (!shell) finish(child);

  const cdp = new CDP(shell.webSocketDebuggerUrl);

  // If first-run wizard is open, dismiss it so browser chrome renders
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const btn = [...document.querySelectorAll('button')]
        .find(b => /erstmal ohne|ohne ki|dismiss|skip/i.test(b.innerText || ''));
      if (btn) btn.click();
    })()`,
    returnByValue: true
  });
  await sleep(1000);

  const shellState = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const text = document.body ? document.body.innerText : '';
      return JSON.stringify({
        hasSidebar: (/chat/i.test(text) && /settings/i.test(text)) || Boolean(document.querySelector('.sidekick-sidebar, .shell-rail')),
        hasAddressBar: [...document.querySelectorAll('input')]
          .some(el => el.getBoundingClientRect().y < 90 && el.getBoundingClientRect().width > 200),
        textLength: text.length
      });
    })()`,
    returnByValue: true
  });
  const shellInfo = JSON.parse(shellState.result.value);
  check('shell ui rendered', shellInfo.hasSidebar && shellInfo.hasAddressBar,
    `sidebar=${shellInfo.hasSidebar} addressbar=${shellInfo.hasAddressBar}`);

  // 3. Navigate via address bar form submit
  const nav = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const addr = [...document.querySelectorAll('input')]
        .find(el => el.getBoundingClientRect().y < 90 && el.getBoundingClientRect().width > 200);
      if (!addr) return 'NO_ADDRESS_BAR';
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(addr, ${JSON.stringify(TEST_URL)});
      addr.dispatchEvent(new Event('input', { bubbles: true }));
      const form = addr.closest('form');
      if (!form) return 'NO_FORM';
      form.requestSubmit();
      return 'SUBMITTED';
    })()`,
    returnByValue: true
  });
  check('address bar navigation submitted', nav.result.value === 'SUBMITTED', nav.result.value);

  // 4. Webview spawns + renders
  await sleep(8000);
  const targets2 = await cdpList();
  const webview = targets2.find((t) => t.type === 'webview');
  check('webview target spawned', Boolean(webview), webview ? webview.url : 'none');

  if (webview) {
    const wvCdp = new CDP(webview.webSocketDebuggerUrl);
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
      check('webview renders page', false, e.message);
    }
    wvCdp.close();
  }

  const shellShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const shellShotPath = path.join(OUT_DIR, 'shell.png');
  writeFileSync(shellShotPath, Buffer.from(shellShot.data, 'base64'));
  console.log(`  screenshot: ${shellShotPath}`);

  cdp.close();
  finish(child);
}

function finish(child) {
  try { process.kill(child.pid); } catch { /* ignore */ }
  const failed = results.filter((r) => !r.ok);
  console.log('');
  console.log(`Result: ${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
