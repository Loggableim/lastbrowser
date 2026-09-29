/**
 * Isolated Electron smoke test for browser-profile storage separation.
 *
 * Starts the source build with a disposable user-data directory and a local
 * fixture origin. It creates a second browser profile, verifies that cookies
 * and localStorage do not cross profiles, and checks both stores survive
 * switching back and forth. It never attaches to an existing Lastbrowser.
 *
 * Usage: node scripts/smoke-profile-isolation.mjs [path-to-electron.exe]
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { createServer } from 'node:http';

const electronExe = process.argv[2] || path.resolve('node_modules/electron/dist/electron.exe');
const mainEntry = path.resolve('apps/desktop/dist/main/main.js');
const tempRoot = path.resolve(os.tmpdir());
const profileDir = mkdtempSync(path.join(tempRoot, 'lastbrowser-profile-isolation-'));
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
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!port) throw new Error('Could not allocate isolated CDP port');
  return port;
}

async function assertPortUnused(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', (error) => reject(new Error(`Refusing to attach to an existing process on CDP port ${port}: ${error.message}`)));
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
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) {
      const exception = response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Browser evaluation failed';
      throw new Error(exception);
    }
    return response.result?.value;
  }

  close() { try { this.socket.close(); } catch { /* already closed */ } }
}

async function cdpTargets() {
  const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
  if (!response.ok) throw new Error(`CDP target list returned HTTP ${response.status}`);
  return response.json();
}

async function waitForTarget(predicate, timeoutMs = 15000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const target = (await cdpTargets()).find(predicate);
      if (target) return target;
    } catch { /* Electron may not have opened CDP yet */ }
    await sleep(150);
  }
  return null;
}

async function waitForExpression(cdp, expression, predicate, timeoutMs = 10000) {
  const until = Date.now() + timeoutMs;
  let value;
  while (Date.now() < until) {
    try {
      value = await cdp.evaluate(expression);
      if (predicate(value)) return value;
    } catch { /* renderer can be between webview/document navigations */ }
    await sleep(150);
  }
  return value;
}

async function shellTarget() {
  const target = await waitForTarget((item) => item.type === 'page' && item.url.includes('index.html'));
  if (!target) throw new Error('Could not find the isolated Lastbrowser shell target');
  return new CDP(target.webSocketDebuggerUrl);
}

async function navigate(shell, url, fixtureOrigin) {
  const result = await shell.evaluate(`(() => {
    const input = document.querySelector('.addressbar input');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, ${JSON.stringify(url)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.closest('form')?.requestSubmit();
    return true;
  })()`);
  if (!result) return null;
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    let candidates = [];
    try {
      candidates = (await cdpTargets()).filter((item) => item.type === 'webview' && item.url.startsWith(fixtureOrigin));
    } catch { /* CDP may briefly restart during navigation */ }
    for (const candidate of candidates) {
      const probe = new CDP(candidate.webSocketDebuggerUrl);
      try {
        await probe.send('Runtime.enable');
        const state = await probe.evaluate(`JSON.stringify({ origin: location.origin, ready: document.readyState })`);
        const parsed = JSON.parse(state || '{}');
        if (parsed.origin === fixtureOrigin && parsed.ready === 'complete') return candidate;
      } catch { /* candidate may still be a provisional about:blank target */ }
      finally { probe.close(); }
    }
    await sleep(150);
  }
  return null;
}

async function fixtureState(target) {
  const cdp = new CDP(target.webSocketDebuggerUrl);
  try {
    return await waitForExpression(cdp,
      `JSON.stringify({ ready: document.readyState, value: localStorage.getItem('lastbrowser-isolation-fixture'), cookie: document.cookie })`,
      (raw) => {
        const parsed = JSON.parse(raw || '{}');
        return parsed.ready === 'complete';
      });
  } finally { cdp.close(); }
}

async function openIncognitoTab(shell) {
  await shell.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))`);
  const inputReady = await waitForExpression(shell,
    `Boolean(document.querySelector('.command-palette-input'))`, Boolean);
  if (!inputReady) {
    const state = await shell.evaluate(`JSON.stringify({
      palette: Boolean(document.querySelector('.command-palette-backdrop')),
      buttons: [...document.querySelectorAll('button')].map((button) => ({ text: button.innerText?.trim(), title: button.title, aria: button.getAttribute('aria-label') })).filter((button) => /command|palette|inkognito|private|incognito/i.test([button.text, button.title, button.aria].join(' '))).slice(0, 20)
    })`);
    console.log(`Incognito command palette did not open: ${state}`);
    return '';
  }
  await shell.evaluate(`document.querySelector('.command-palette-input')?.focus()`);
  await shell.send('Input.insertText', { text: 'Neuer Inkognito-Tab' });
  const commandReady = await waitForExpression(shell,
    `Boolean([...document.querySelectorAll('.command-palette-item-title')].find((item) => /inkognito/i.test(item.textContent || '')))`, Boolean);
  if (!commandReady) return '';
  await shell.evaluate(`(() => [...document.querySelectorAll('.command-palette-item')]
    .find((item) => /inkognito/i.test(item.querySelector('.command-palette-item-title')?.textContent || ''))?.click())()`);
  const partition = await waitForExpression(shell,
    `[...document.querySelectorAll('webview.browser-view')].find((view) => view.getAttribute('partition') === 'in-memory-incognito')?.getAttribute('partition') || ''`,
    (value) => value === 'in-memory-incognito');
  if (partition !== 'in-memory-incognito') {
    const state = await shell.evaluate(`JSON.stringify({
      tabs: [...document.querySelectorAll('.vertical-tab-item, .tab')].map((tab) => ({ text: tab.textContent?.trim(), className: tab.className })).slice(-5),
      webviews: [...document.querySelectorAll('webview.browser-view')].map((view) => ({ partition: view.getAttribute('partition'), tabId: view.getAttribute('data-tab-id') })),
      palette: document.querySelector('.command-palette-dialog')?.innerText?.slice(0, 300) || ''
    })`);
    console.log(`Incognito command did not mount expected partition: ${state}`);
  }
  return partition;
}

async function inspectPartitionFixture(shell, partition, url, seedValue = '') {
  return shell.evaluate(`(async () => {
    const view = [...document.querySelectorAll('webview.browser-view')]
      .find((element) => element.getAttribute('partition') === ${JSON.stringify(partition)});
    if (!view) return JSON.stringify({ error: 'requested webview partition missing' });
    const loaded = new Promise((resolve) => view.addEventListener('dom-ready', resolve, { once: true }));
    if (!view.getURL?.().startsWith(${JSON.stringify(new URL(url).origin)})) {
      view.src = ${JSON.stringify(url)};
      await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, 10000))]);
    }
    if (typeof view.executeJavaScript !== 'function') return JSON.stringify({ error: 'webview executeJavaScript unavailable' });
    const source = ${JSON.stringify(`(() => {
      if (${JSON.stringify(seedValue)}) {
        localStorage.setItem('lastbrowser-isolation-fixture', ${JSON.stringify(seedValue)});
        document.cookie = 'lastbrowser-isolation-fixture=${String(seedValue).replace(/[^a-zA-Z0-9_-]/g, '-')}; Path=/; SameSite=Lax';
      }
      return JSON.stringify({ origin: location.origin, value: localStorage.getItem('lastbrowser-isolation-fixture'), cookie: document.cookie });
    })()`)};
    return view.executeJavaScript(source, true);
  })()`);
}

async function openProfileSettings(shell) {
  if (!(await shell.evaluate(`document.querySelector('.expanded-workspace-pill') !== null`))) {
    await shell.evaluate(`(() => {
      const button = document.querySelector('.nova-dock .toggle-expand-btn, .modern-titlebar .sidebar-toggle');
      button?.click();
      return Boolean(button);
    })()`);
    await waitForExpression(shell, `Boolean(document.querySelector('.expanded-workspace-pill'))`, Boolean);
  }
  if (!(await shell.evaluate(`document.querySelector('.app-shell.panel-settings') !== null`))) {
    await shell.evaluate(`(() => {
      const button = document.querySelector('.expanded-bottom-footer button:has(svg.lucide-settings), .nova-dock-actions-group button:has(svg.lucide-settings), .shell-rail button:has(svg.lucide-settings)');
      button?.click();
      return Boolean(button);
    })()`);
  }
  const settingsOpen = await waitForExpression(shell, `Boolean(document.querySelector('.app-shell.panel-settings'))`, Boolean);
  if (!settingsOpen) return false;
  await shell.evaluate(`(() => {
    const button = [...document.querySelectorAll('.settings-section-button')]
      .find((element) => /preferences|präferenzen|preferencias|préférences|preferenze|preferências|предпочтения/i.test(element.innerText || ''));
    button?.click();
    return Boolean(button);
  })()`);
  return Boolean(await waitForExpression(shell, `Boolean(document.querySelector('.settings-card .profile-switcher-trigger'))`, Boolean));
}

async function openBrowserPanel(shell) {
  const browserReady = await shell.evaluate(`document.querySelector('.app-shell.panel-browser') !== null`);
  if (browserReady) return true;
  const modernBack = await shell.evaluate(`document.querySelector('.modern-back-to-web-btn') !== null`);
  if (modernBack) {
    await shell.evaluate(`document.querySelector('.modern-back-to-web-btn')?.click()`);
    return Boolean(await waitForExpression(shell, `Boolean(document.querySelector('.app-shell.panel-browser'))`, Boolean));
  }
  const hasDrawerTabs = await shell.evaluate(`document.querySelector('.drawer-tab-btn') !== null`);
  if (!hasDrawerTabs) {
    await shell.evaluate(`(() => {
      const button = document.querySelector('.nova-dock .toggle-expand-btn, .modern-titlebar .sidebar-toggle');
      button?.click();
      return Boolean(button);
    })()`);
    await waitForExpression(shell, `Boolean(document.querySelector('.drawer-tab-btn'))`, Boolean);
  }
  await shell.evaluate(`(() => document.querySelectorAll('.drawer-tab-btn')[3]?.click())()`);
  await waitForExpression(shell, `Boolean(document.querySelector('.sidebar-drawer-content[aria-label]'))`, Boolean);
  const clicked = await shell.evaluate(`(() => {
    const cards = [...document.querySelectorAll('.sidebar-drawer-card')];
    const card = cards.find((element) => /browser|navegador|navigateur|браузер/i.test(element.querySelector('.drawer-card-title')?.textContent || ''));
    card?.click();
    return Boolean(card);
  })()`);
  return Boolean(clicked && await waitForExpression(shell, `Boolean(document.querySelector('.app-shell.panel-browser'))`, Boolean));
}

async function switchProfile(shell, profileName) {
  if (!(await openProfileSettings(shell))) return false;
  const triggerClicked = await shell.evaluate(`(() => {
    const trigger = [...document.querySelectorAll('.settings-card .profile-switcher-trigger')]
      .find((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; });
    trigger?.click();
    return Boolean(trigger);
  })()`);
  const menuOpen = await waitForExpression(shell,
    `Boolean([...document.querySelectorAll('.profile-switcher-menu')].find((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; }))`, Boolean);
  if (!menuOpen) {
    const diagnostic = await shell.evaluate(`JSON.stringify([...document.querySelectorAll('.settings-card .profile-switcher-trigger')].map((element) => ({ text: element.textContent?.trim(), expanded: element.getAttribute('aria-expanded'), rect: (() => { const r=element.getBoundingClientRect(); return [r.x,r.y,r.width,r.height]; })() })))`);
    console.log(`Profile switcher did not open; clicked=${triggerClicked}, triggers=${diagnostic}`);
    return false;
  }

  const existingProfile = await shell.evaluate(`Boolean([...document.querySelectorAll('.profile-switcher-item')]
    .find((item) => item.querySelector('.profile-switcher-item-name')?.textContent?.trim().endsWith(${JSON.stringify(profileName)})))`);
  if (existingProfile) {
    const clicked = await shell.evaluate(`(() => {
      const item = [...document.querySelectorAll('.profile-switcher-item')]
        .find((entry) => entry.querySelector('.profile-switcher-item-name')?.textContent?.trim().endsWith(${JSON.stringify(profileName)}));
      item?.click(); return Boolean(item);
    })()`);
    return Boolean(clicked && await openBrowserPanel(shell));
  }

  const inputReady = await shell.evaluate(`(() => {
    // The placeholder is localized; target the stable component class instead.
    const input = document.querySelector('.profile-switcher-input');
    if (!input) return false;
    input.focus();
    return true;
  })()`);
  if (!inputReady) return false;
  await shell.send('Input.insertText', { text: profileName });
  await shell.evaluate(`document.querySelector('.profile-switcher-form .profile-switcher-action')?.click()`);
  await sleep(200);
  // Creation closes the menu; reopen it, activate the new partition, and return
  // to the browser before navigating the fixture URL.
  return switchProfile(shell, profileName);
}

function stopSmoke() {
  if (fixtureServer) {
    try { fixtureServer.close(); } catch { /* already closed */ }
    fixtureServer = null;
  }
  if (appProcess?.pid) {
    spawnSync('taskkill.exe', ['/PID', String(appProcess.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    appProcess = null;
  }
  const resolvedProfile = path.resolve(profileDir);
  if (path.dirname(resolvedProfile) === tempRoot
    && path.basename(resolvedProfile).startsWith('lastbrowser-profile-isolation-')) {
    for (let attempt = 0; attempt < 20 && existsSync(resolvedProfile); attempt += 1) {
      try { rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 }); } catch { /* retry */ }
      if (existsSync(resolvedProfile)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
}

function launchElectron() {
  appProcess = spawn(electronExe, [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${cdpPort}`,
    mainEntry
  ], { detached: true, stdio: 'ignore', windowsHide: true });
  appProcess.unref();
}

async function main() {
  if (process.platform !== 'win32') throw new Error('This smoke script currently requires Windows Electron process cleanup');
  if (!existsSync(electronExe)) throw new Error(`Electron binary not found: ${electronExe}`);
  if (!existsSync(mainEntry)) throw new Error(`Build the desktop app first; missing ${mainEntry}`);

  cdpPort = await freePort();
  await assertPortUnused(cdpPort);
  const fixture = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end('<!doctype html><html><head><title>Profile Isolation Fixture</title></head><body>Profile isolation fixture</body></html>');
  });
  await new Promise((resolve, reject) => {
    fixture.once('error', reject);
    fixture.listen(0, '127.0.0.1', resolve);
  });
  fixtureServer = fixture;
  const fixtureAddress = fixture.address();
  if (!fixtureAddress || typeof fixtureAddress === 'string') throw new Error('Failed to bind the local fixture origin');
  const fixtureOrigin = `http://127.0.0.1:${fixtureAddress.port}`;
  const fixtureUrl = `${fixtureOrigin}/profile-isolation`;

  mkdirSync(profileDir, { recursive: true });
  launchElectron();

  let shell = await shellTarget();
  try {
    await shell.send('Runtime.enable');
    const firstRun = await waitForExpression(shell,
      `Boolean(document.querySelector('[role="dialog"][aria-label="First-run setup"]'))`,
      (value) => typeof value === 'boolean');
    if (firstRun) {
      await shell.evaluate(`(() => [...document.querySelectorAll('button')].find((button) => /erstmal ohne|ohne ki|dismiss|skip/i.test(button.innerText || ''))?.click())()`);
    }
    await waitForExpression(shell, `Boolean(document.querySelector('.app-shell.panel-browser'))`, Boolean, 20000);
    if (!(await shell.evaluate(`document.querySelector('.expanded-workspace-pill') !== null`))) {
      await shell.evaluate(`document.querySelector('.nova-dock .toggle-expand-btn, .modern-titlebar .sidebar-toggle')?.click()`);
      await waitForExpression(shell, `Boolean(document.querySelector('.expanded-workspace-pill'))`, Boolean);
    }
    const browserChromeState = await shell.evaluate(`JSON.stringify({
      profileControls: document.querySelectorAll('.modern-titlebar .profile-switcher-trigger, .topbar .profile-switcher-trigger').length,
      spaces: document.querySelectorAll('.expanded-workspace-pill, .titlebar-space').length
    })`);
    const parsedChromeState = JSON.parse(browserChromeState || '{}');
    check('browser chrome keeps Spaces and has no duplicate profile selector',
      parsedChromeState.profileControls === 0 && parsedChromeState.spaces > 0,
      browserChromeState);
    const profileSettingsReady = await openProfileSettings(shell);
    check('profile switching is available in Settings Preferences', profileSettingsReady,
      `settings=${await shell.evaluate(`Boolean(document.querySelector('.app-shell.panel-settings'))`)}`);
    check('profile selector is absent from browser chrome but present in settings',
      (await shell.evaluate(`document.querySelectorAll('.modern-titlebar .profile-switcher-trigger, .topbar .profile-switcher-trigger').length === 0 && document.querySelector('.settings-card .profile-switcher-trigger') !== null`)) === true);
    const returnedToBrowser = await openBrowserPanel(shell);
    if (!returnedToBrowser) throw new Error('Could not return to the browser after opening profile settings');

    let target = await navigate(shell, fixtureUrl, fixtureOrigin);
    if (!target) throw new Error('Could not navigate the default profile to the local fixture page');
    const defaultGuest = new CDP(target.webSocketDebuggerUrl);
    await defaultGuest.send('Runtime.enable');
    const seedDefault = await defaultGuest.evaluate(`(() => {
      localStorage.setItem('lastbrowser-isolation-fixture', 'default-profile-value');
      document.cookie = 'lastbrowser-isolation-fixture=default-profile-cookie; Path=/; SameSite=Lax';
      return JSON.stringify({ value: localStorage.getItem('lastbrowser-isolation-fixture'), cookie: document.cookie });
    })()`);
    defaultGuest.close();
    check('default profile stores its local fixture cookie and localStorage value',
      JSON.parse(seedDefault).value === 'default-profile-value' && JSON.parse(seedDefault).cookie.includes('default-profile-cookie'));

    const createdAndSwitched = await switchProfile(shell, `Smoke Profile ${process.pid}`);
    const profileUiState = createdAndSwitched ? null : await shell.evaluate(`JSON.stringify({
      active: document.querySelector('.profile-switcher-trigger')?.textContent?.trim() || '',
      menu: document.querySelector('.profile-switcher-menu')?.innerText || '',
      inputs: [...document.querySelectorAll('.profile-switcher-input')].map((input) => ({ placeholder: input.placeholder, value: input.value })),
      actions: [...document.querySelectorAll('.profile-switcher-action')].map((button) => ({ text: button.innerText, disabled: button.disabled }))
    })`);
    check('profile switcher creates and activates a second profile', createdAndSwitched, profileUiState || '');
    target = await navigate(shell, fixtureUrl, fixtureOrigin);
    if (!target) throw new Error('Could not navigate the second profile to the local fixture page');
    let state = JSON.parse(await fixtureState(target));
    const newProfilePartition = await shell.evaluate(`document.querySelector('.active-tab-pane webview.browser-view')?.getAttribute('partition') || ''`);
    check('new profile cannot read cookies or localStorage from the default profile',
      state.value === null && state.cookie === '' && newProfilePartition.startsWith('persist:space_'),
      `localStorage=${state.value}, cookiePresent=${Boolean(state.cookie)}, partition=${newProfilePartition}`);

    const secondGuest = new CDP(target.webSocketDebuggerUrl);
    await secondGuest.send('Runtime.enable');
    const seedSecond = await secondGuest.evaluate(`(() => {
      localStorage.setItem('lastbrowser-isolation-fixture', 'second-profile-value');
      document.cookie = 'lastbrowser-isolation-fixture=second-profile-cookie; Path=/; SameSite=Lax';
      return true;
    })()`);
    secondGuest.close();
    check('second profile can store its own isolated data', seedSecond === true);

    const returnedToDefault = await switchProfile(shell, 'Default');
    target = returnedToDefault ? await waitForTarget((item) => item.type === 'webview' && item.url.startsWith(fixtureOrigin)) : null;
    if (!target) target = await navigate(shell, fixtureUrl, fixtureOrigin);
    state = target ? JSON.parse(await fixtureState(target)) : {};
    check('switching back preserves the default profile data',
      state.value === 'default-profile-value' && state.cookie.includes('default-profile-cookie'),
      `localStorage=${state.value}, cookiePresent=${String(state.cookie || '').includes('default-profile-cookie')}`);

    const returnedToSecond = await switchProfile(shell, `Smoke Profile ${process.pid}`);
    target = returnedToSecond ? await waitForTarget((item) => item.type === 'webview' && item.url.startsWith(fixtureOrigin)) : null;
    if (!target) target = await navigate(shell, fixtureUrl, fixtureOrigin);
    state = target ? JSON.parse(await fixtureState(target)) : {};
    check('switching to the second profile preserves only its own data',
      state.value === 'second-profile-value' && state.cookie.includes('second-profile-cookie'),
      `localStorage=${state.value}, cookiePresent=${String(state.cookie || '').includes('second-profile-cookie')}`);

    const incognitoPartition = await openIncognitoTab(shell);
    check('incognito tabs mount with the non-persistent in-memory partition',
      incognitoPartition === 'in-memory-incognito', `partition=${incognitoPartition || 'not mounted'}`);
    const incognitoRawState = await inspectPartitionFixture(shell, 'in-memory-incognito', fixtureUrl, 'incognito-only-value');
    state = JSON.parse(incognitoRawState || '{}');
    check('incognito keeps its own cookie and localStorage in the in-memory partition',
      state.origin === fixtureOrigin && state.value === 'incognito-only-value' && state.cookie.includes('incognito-only-value'),
      `localStorage=${state.value}, cookiePresent=${String(state.cookie || '').includes('incognito-only-value')}`);
    const backToDefault = await switchProfile(shell, 'Default');
    const defaultPartition = await shell.evaluate(`(() => [...document.querySelectorAll('webview.browser-view')]
      .find((view) => view.getAttribute('partition')?.endsWith('_default'))?.getAttribute('partition') || '')()`);
    const defaultAfterIncognito = defaultPartition
      ? JSON.parse(await inspectPartitionFixture(shell, defaultPartition, fixtureUrl))
      : {};
    check('incognito writes do not leak into the default profile when switching away',
      backToDefault && defaultAfterIncognito.value === 'default-profile-value'
        && defaultAfterIncognito.cookie.includes('default-profile-cookie'),
      `partition=${defaultPartition}, localStorage=${defaultAfterIncognito.value}, cookiePresent=${String(defaultAfterIncognito.cookie || '').includes('default-profile-cookie')}`);
  } finally {
    shell.close();
  }

  const failed = checks.filter((item) => !item.ok);
  console.log(`\nResult: ${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error('FATAL:', error);
  process.exitCode = 1;
}).finally(stopSmoke);
