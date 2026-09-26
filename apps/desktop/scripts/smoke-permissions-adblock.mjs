/** Live permission and adblock checks in a disposable local Electron profile. */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

const desktop = path.resolve(import.meta.dirname, '..');
const electron = path.resolve(desktop, '..', '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const entry = path.join(desktop, 'dist', 'main', 'main.js');
const profile = mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-permission-smoke-'));
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(`<!doctype html><title>Local permission fixture</title>
    <main>Local permission fixture</main><script>
      window.geoResult = new Promise(resolve => navigator.geolocation.getCurrentPosition(
        () => resolve({ ok: true }),
        error => resolve({ ok: false, code: error.code }),
        { timeout: 2500, maximumAge: 0 }
      ));
    </script>`);
});

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function unusedPort() {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      message.error ? pending.reject(new Error(JSON.stringify(message.error))) : pending.resolve(message.result);
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
        reject(new Error(`CDP timeout: ${method}`));
      }, 12000);
    });
  }

  async evaluate(expression) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const result = await this.send('Runtime.evaluate', {
          expression,
          returnByValue: true,
          awaitPromise: true
        });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Renderer evaluation failed');
        return result.result.value;
      } catch (error) {
        if (!String(error).includes('Cannot find default execution context') || attempt === 29) throw error;
        await pause(150);
      }
    }
  }

  close() { this.ws.close(); }
}

const results = [];
function check(name, ok, detail = '') {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

let child;
let shellCdp;
let webviewCdp;
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const fixtureUrl = `http://127.0.0.1:${server.address().port}/fixture.html`;
  const cdpPort = await unusedPort();
  child = spawn(electron, [
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${cdpPort}`,
    entry
  ], { cwd: desktop, stdio: 'ignore' });

  const listTargets = async () => (await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json());
  let shell;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { shell = (await listTargets()).find((target) => target.type === 'page' && target.url.includes('index.html')); }
    catch { /* Electron has not started its local CDP endpoint yet. */ }
    if (shell) break;
    await pause(400);
  }
  if (!shell) throw new Error('No shell renderer appeared on the isolated CDP endpoint');
  shellCdp = new Cdp(shell.webSocketDebuggerUrl);

  let hasAddressBar = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    hasAddressBar = await shellCdp.evaluate(`Boolean(document.querySelector('input[aria-label="Address or search"]'))`);
    if (hasAddressBar) break;
    await pause(250);
  }
  if (!hasAddressBar) throw new Error('The browser address bar did not initialize');
  check('isolated Lastbrowser shell starts', true);

  const initialOrigins = await shellCdp.evaluate('window.lastbrowser.permissions.trustedOrigins()');
  check('permission store starts clean in the temporary profile', Array.isArray(initialOrigins) && initialOrigins.length === 0, JSON.stringify(initialOrigins));
  const geolocation = await shellCdp.evaluate(`window.lastbrowser.permissions.decide({permission:'geolocation',origin:${JSON.stringify(fixtureUrl)}})`);
  check('main-process permission policy denies geolocation', geolocation === 'deny', String(geolocation));

  const added = await shellCdp.evaluate(`window.lastbrowser.permissions.trust(${JSON.stringify(fixtureUrl)})`);
  const mediaAllowed = await shellCdp.evaluate(`window.lastbrowser.permissions.decide({permission:'media',origin:${JSON.stringify(fixtureUrl)}})`);
  const removed = await shellCdp.evaluate(`window.lastbrowser.permissions.revoke(${JSON.stringify(fixtureUrl)})`);
  const mediaDenied = await shellCdp.evaluate(`window.lastbrowser.permissions.decide({permission:'media',origin:${JSON.stringify(fixtureUrl)}})`);
  check('media site exception grants and revokes cleanly', added.includes(new URL(fixtureUrl).origin) && mediaAllowed === 'allow' && removed.length === 0 && mediaDenied === 'deny', `grant=${mediaAllowed}, final=${mediaDenied}`);

  await shellCdp.evaluate(`(() => {
    const input = document.querySelector('input[aria-label="Address or search"]');
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setValue.call(input, ${JSON.stringify(fixtureUrl)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.closest('form').requestSubmit();
  })()`);
  let webview;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    webview = (await listTargets()).find((target) => target.type === 'webview' && target.url.includes('fixture.html'));
    if (webview) break;
    await pause(300);
  }
  check('local-only fixture renders in browser webview', Boolean(webview), webview?.url || 'not found');
  if (webview) {
    webviewCdp = new Cdp(webview.webSocketDebuggerUrl);
    let fixtureReady = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      fixtureReady = await webviewCdp.evaluate(`document.readyState === 'complete' && window.geoResult instanceof Promise`);
      if (fixtureReady) break;
      await pause(100);
    }
    check('permission fixture script is ready before geolocation assertion', fixtureReady);
    const actualGeoResult = await webviewCdp.evaluate('window.geoResult');
    check('Chromium geolocation request is actually denied', actualGeoResult?.ok === false && actualGeoResult?.code === 1, JSON.stringify(actualGeoResult));
  }

  let status;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    status = await shellCdp.evaluate('window.lastbrowser.adblock.status()');
    if (status.state === 'ready' || status.state === 'error') break;
    await pause(250);
  }
  check('adblock runtime reaches ready or reports an explicit load error', status?.state === 'ready' || status?.state === 'error', JSON.stringify(status));
  if (status) {
    const opened = await shellCdp.evaluate(`(() => { const button = document.querySelector('.adblock-shield-btn'); if (!button) return false; button.click(); return true; })()`);
    let popover = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      popover = await shellCdp.evaluate(`Boolean(document.querySelector('.adblock-popover[role="dialog"]'))`);
      if (popover) break;
      await pause(100);
    }
    check('adblock shield opens its status panel', opened && popover, `button=${opened}, panel=${popover}`);
    const disabledClick = await shellCdp.evaluate(`(() => { const button = document.querySelector('.adblock-toggle-btn'); if (!button || !/disable/i.test(button.innerText)) return false; button.click(); return true; })()`);
    let disabled;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      disabled = await shellCdp.evaluate('window.lastbrowser.adblock.status()');
      if (!disabled.enabled) break;
      await pause(100);
    }
    const enabledClick = await shellCdp.evaluate(`(() => { const button = document.querySelector('.adblock-toggle-btn'); if (!button || !/enable protection/i.test(button.innerText)) return false; button.click(); return true; })()`);
    let enabled;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      enabled = await shellCdp.evaluate('window.lastbrowser.adblock.status()');
      if (enabled.enabled) break;
      await pause(100);
    }
    check('adblock panel toggles protection off and back on', disabledClick && !disabled?.enabled && enabledClick && enabled?.enabled, `off=${disabled?.enabled}, on=${enabled?.enabled}`);
  }
} finally {
  webviewCdp?.close();
  shellCdp?.close();
  try { child?.kill(); } catch { /* Process may have exited after an earlier failure. */ }
  server.close();
  await pause(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Temp-profile cleanup is best effort. */ }
}

const passed = results.filter(Boolean).length;
console.log(`Result: ${passed}/${results.length} live checks passed`);
if (passed !== results.length) process.exitCode = 1;
