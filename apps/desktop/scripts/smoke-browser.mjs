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
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';

const DEFAULT_EXE = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'Programs',
  'Lastbrowser',
  'Lastbrowser.exe'
);
const EXE = process.argv[2] || process.env.LASTBROWSER_EXE || DEFAULT_EXE;
const REQUESTED_CDP_PORT = process.env.LASTBROWSER_SMOKE_CDP_PORT
  ? Number(process.env.LASTBROWSER_SMOKE_CDP_PORT)
  : 0;
let CDP_PORT = REQUESTED_CDP_PORT;
let smokeChild = null;
const TEST_URL = process.env.LASTBROWSER_SMOKE_URL || 'example.com';
const OUT_DIR = path.resolve(process.cwd(), 'smoke-output');
const SMOKE_PROFILE_DIR = path.join(os.tmpdir(), `lastbrowser-browser-smoke-${process.pid}`);
const LOCAL_MAIN_ENTRY = path.resolve(import.meta.dirname, '..', 'dist', 'main', 'main.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  // 1. Launch
  const isElectronBinary = path.basename(EXE).toLowerCase() === 'electron.exe';
  const launchArgs = [
    `--user-data-dir=${SMOKE_PROFILE_DIR}`,
    `--remote-debugging-port=${CDP_PORT}`,
    ...(isElectronBinary && existsSync(LOCAL_MAIN_ENTRY) ? [LOCAL_MAIN_ENTRY] : [])
  ];
  mkdirSync(SMOKE_PROFILE_DIR, { recursive: true });
  const child = spawn(EXE, launchArgs, {
    detached: true,
    stdio: 'ignore'
  });
  smokeChild = child;
  child.unref();
  console.log(`[1] launched (pid ${child.pid})`);

  let targets = null;
  let shell = null;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await cdpList();
      shell = targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
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

  const cdp = new CDP(shell.webSocketDebuggerUrl);

  // Electron can expose the CDP target before React has mounted. Wait for
  // either browser chrome or the first-run wizard before interacting.
  let initialUi = null;
  for (let i = 0; i < 80; i++) {
    const probe = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        hasAddressBar: Boolean(document.querySelector('input[aria-label="Address or search"]')),
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
          hasAddressBar: [...document.querySelectorAll('input')]
            .some(el => el.getBoundingClientRect().y < 90 && el.getBoundingClientRect().width > 200),
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
    // Allow Chromium's transform/opacity transitions to finish before
    // asserting the animated styles in an isolated, potentially occluded window.
    await sleep(450);
    const wave = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const items = [...document.querySelectorAll('.nova-dock-item-wrapper')];
        const labels = [...document.querySelectorAll('.nova-dock-label-pill')];
        const scale = (element) => Number((getComputedStyle(element).transform.match(/^matrix\\(([^,]+)/) || [])[1] || 1);
        return { hoveredScale: scale(items[0]), neighborScale: scale(items[1]), hoveredLabel: Number(labels[0] ? getComputedStyle(labels[0]).opacity : 0), neighborLabel: Number(labels[1] ? getComputedStyle(labels[1]).opacity : 0), dockClass: document.querySelector('.nova-dock')?.className };
      })()`,
      returnByValue: true
    });
    const waveState = wave.result.value;
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
  const panelInitiallyOpened = await waitForDownloads('.downloads-panel', true);
  check('Downloads opens from the visible toolbar trigger', downloadsOpen.result.value === 'CLICKED' && panelInitiallyOpened,
    `${downloadsOpen.result.value}, panel=${panelInitiallyOpened}`);

  let dockChecksPassed = panelInitiallyOpened;
  const dockCases = [
    ['floating', 'In frei verschiebbares Fenster ausdocken'],
    ['dock-tabs', 'Unter Tab-Leiste docken'],
    ['dock-sidekick', 'Neben Sidekick docken'],
    ['dock-topbar-left', 'Links in der oberen Leiste andocken'],
    ['dock-topbar-right', 'Rechts in der oberen Leiste andocken'],
    ['dropdown', 'Wieder als Menüleisten-Dropdown andocken']
  ];
  for (const [mode, title] of dockCases) {
    const selected = await cdp.send('Runtime.evaluate', {
      expression: `(() => { const button = [...document.querySelectorAll('.downloads-panel button')].find(el => el.title === ${JSON.stringify(title)}); if (!button) return false; button.click(); return true; })()`,
      returnByValue: true
    });
    const modeApplied = await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('.downloads-panel')?.classList.contains('mode-${mode}') || false`,
      returnByValue: true
    });
    dockChecksPassed &&= selected.result.value && modeApplied.result.value;
  }
  check('Downloads switches through floating and all dock positions', dockChecksPassed,
    dockCases.map(([mode]) => mode).join(', '));

  // Use floating mode to expose the minimize control, then verify the pill can
  // restore the panel and close it; reopening a closed panel must be expanded.
  const floatForMinimize = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = [...document.querySelectorAll('.downloads-panel button')].find(el => ['Frei schwebend (Floating)', 'In frei verschiebbares Fenster ausdocken'].includes(el.title)); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true
  });
  const minimizeDownloads = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.downloads-panel button[aria-label="Downloads minimieren"]'); if (!button) return false; button.click(); return true; })()`,
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

  const closeExpanded = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.downloads-panel button[aria-label="Schließen"]'); if (!button) return false; button.click(); return true; })()`,
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
    expression: `document.querySelector('.downloads-panel button[aria-label="Schließen"]')?.click()`,
    returnByValue: true
  });

  // Settings navigation is reachable from the persistent browser rail. Verify
  // leaving and returning to the web view without changing user preferences.
  const expandForSettings = await cdp.send('Runtime.evaluate', {
    expression: `(() => { if (document.querySelector('.expanded-workspace-pill')) return 'ALREADY_EXPANDED'; const button = document.querySelector('button[aria-label="Toggle Sidebar"]'); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  const settingsSidebarReady = await waitForUi('.expanded-workspace-pill', true);
  const openSettings = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.shell-rail .rail-bottom button.rail-button') || [...document.querySelectorAll('.expanded-bottom-footer .footer-link-btn')].find(el => /settings|einstellungen/i.test((el.textContent || '') + ' ' + (el.title || ''))); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  const settingsVisible = await waitForUi('.app-shell.panel-settings', true);
  check('settings navigation opens the settings panel', settingsSidebarReady && openSettings.result.value === 'CLICKED' && settingsVisible,
    `expand=${expandForSettings.result.value}, ${openSettings.result.value}, visible=${settingsVisible}`);
  const returnToWeb = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.modern-back-to-web-btn'); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
    returnByValue: true
  });
  const browserPanelRestored = await waitForUi('.browser-webview-frame', true);
  check('returning from settings restores the browser panel', returnToWeb.result.value === 'CLICKED' && browserPanelRestored,
    `${returnToWeb.result.value}, visible=${browserPanelRestored}`);

  // Open the Space setup wizard from the workspace picker, then close it
  // without creating a directory or changing the isolated profile.
  const expandSidebar = await cdp.send('Runtime.evaluate', {
    expression: `(() => { if (document.querySelector('.expanded-workspace-pill')) return 'ALREADY_EXPANDED'; const button = document.querySelector('button[aria-label="Toggle Sidebar"]'); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
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
  const spaceSetupVisible = await waitForUi('.space-setup-modal[role="dialog"]', true);
  check('Space setup opens from the workspace picker', workspacePickerReady && openWorkspacePicker.result.value === 'CLICKED' && workspaceFlyoutReady && openSpaceSetup.result.value === 'CLICKED' && spaceSetupVisible,
    `expand=${expandSidebar.result.value}, picker=${workspaceFlyoutReady}, wizard=${spaceSetupVisible}`);
  const closeSpaceSetup = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.space-setup-close-btn'); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true
  });
  const spaceSetupClosed = await waitForUi('.space-setup-modal[role="dialog"]', false);
  check('Space setup closes without creating a Space', closeSpaceSetup.result.value && spaceSetupClosed,
    `close=${closeSpaceSetup.result.value}, closed=${spaceSetupClosed}`);

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
  const webview = targets2.find((t) => t.type === 'webview' && t.url !== 'lastbrowser://start');
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

      const addBookmark = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const button = document.querySelector('button[aria-label="Add bookmark"]'); if (!button || !button.getClientRects().length) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
        returnByValue: true
      });
      const bookmarkAdded = await waitForUi('button[aria-label="Remove bookmark"][aria-pressed="true"]', true);
      const storedBookmark = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify(JSON.parse(localStorage.getItem('lastbrowser.bookmarks.v1') || '[]').map(bookmark => bookmark.url))`,
        returnByValue: true
      });
      const bookmarkUrls = JSON.parse(storedBookmark.result.value);
      const bookmarkStored = bookmarkUrls.some((url) => String(url).includes(new URL(info.url).hostname));
      check('bookmark toolbar adds and persists the active page', addBookmark.result.value === 'CLICKED' && bookmarkAdded && bookmarkStored,
        `${addBookmark.result.value}, marked=${bookmarkAdded}, stored=${bookmarkStored}`);
      const removeBookmark = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const button = document.querySelector('button[aria-label="Remove bookmark"]'); if (!button) return false; button.click(); return true; })()`,
        returnByValue: true
      });
      const bookmarkRemoved = await waitForUi('button[aria-label="Add bookmark"][aria-pressed="false"]', true);
      const storedAfterRemoval = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify(JSON.parse(localStorage.getItem('lastbrowser.bookmarks.v1') || '[]').map(bookmark => bookmark.url))`,
        returnByValue: true
      });
      const bookmarkAbsent = !JSON.parse(storedAfterRemoval.result.value).some((url) => String(url).includes(new URL(info.url).hostname));
      check('bookmark toolbar removes the active page cleanly', removeBookmark.result.value && bookmarkRemoved && bookmarkAbsent,
        `remove=${removeBookmark.result.value}, marked=${bookmarkRemoved}, absent=${bookmarkAbsent}`);

      const setAddress = async (url) => cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const addr = [...document.querySelectorAll('input')]
            .find(el => el.getBoundingClientRect().y < 90 && el.getBoundingClientRect().width > 200);
          if (!addr) return false;
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(addr, ${JSON.stringify(url)});
          addr.dispatchEvent(new Event('input', { bubbles: true }));
          addr.closest('form')?.requestSubmit();
          return true;
        })()`
      });
      const navigateTestPage = async (url, expectedHost) => {
        const submitted = await setAddress(url);
        if (!submitted.result.value) return false;
        for (let attempt = 0; attempt < 40; attempt++) {
          const currentTargets = await cdpList();
          const current = currentTargets.find((target) => (target.type === 'webview' || target.type === 'page') && target.url.includes(expectedHost));
          if (current) {
            const tab = new CDP(current.webSocketDebuggerUrl);
            try {
              const state = await tab.send('Runtime.evaluate', { expression: 'location.hostname', returnByValue: true });
              if (String(state.result.value || '').replace(/^www\./, '') === expectedHost.replace(/^www\./, '')) return true;
            } finally { tab.close(); }
          }
          await sleep(250);
        }
        return false;
      };

      if (TEST_URL !== 'example.com') {
        check('history navigation fixture skipped', true, 'set LASTBROWSER_SMOKE_URL=example.com for the full history flow');
      } else {
        const navigated = await navigateTestPage('https://iana.org/domains/reserved', 'iana.org');
        check('second navigation creates history entry', navigated, 'iana.org');
        const clickBack = await cdp.send('Runtime.evaluate', {
          expression: `(() => { const button = document.querySelector('button[aria-label="Back"]'); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
          returnByValue: true
        });
        let backTarget = null;
        for (let attempt = 0; attempt < 40; attempt++) {
          const afterBack = await cdpList();
          backTarget = afterBack.find((target) => target.type === 'webview' && target.url.includes('example.com'));
          if (backTarget) break;
          await sleep(250);
        }
        check('back button restores previous page', Boolean(backTarget), clickBack.result.value);

        const forward = await cdp.send('Runtime.evaluate', {
          expression: `(() => { const button = document.querySelector('button[aria-label="Forward"]'); if (!button) return 'NOT_FOUND'; button.click(); return 'CLICKED'; })()`,
          returnByValue: true
        });
        let forwardRestored = false;
        for (let attempt = 0; attempt < 40; attempt++) {
          const activeUrl = await cdp.send('Runtime.evaluate', {
            expression: `(() => { const input = [...document.querySelectorAll('input')].find(el => el.getBoundingClientRect().y < 90 && el.getBoundingClientRect().width > 200); return input?.value || ''; })()`,
            returnByValue: true
          });
          if (String(activeUrl.result.value || '').includes('iana.org')) {
            forwardRestored = true;
            break;
          }
          await sleep(250);
        }
        check('forward button restores next page', forwardRestored, `${String(forward.result.value)}, active=${forwardRestored}`);

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
      check('webview renders page', false, e.message);
    }
    wvCdp.close();
  }

  const beforeNewTab = await cdpList();
  const beforeWebviews = beforeNewTab.filter((target) => target.type === 'webview').length;
  await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('button[aria-label="Toggle Sidebar"]'); if (button && !document.querySelector('.vertical-new-tab-btn')) button.click(); })()`,
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

  const snapDrag = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const tabs = [...document.querySelectorAll('.vertical-tab-item')];
      const source = tabs.at(-1);
      if (!source) return 'MISSING_SOURCE';
      const dataTransfer = new DataTransfer();
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
      return 'DRAG_STARTED';
    })()`,
    returnByValue: true
  });
  await sleep(150);
  const snapHover = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const surface = document.querySelector('.snap-drag-surface');
      const frame = document.querySelector('.browser-webview-frame');
      if (!surface || !frame) return 'MISSING_SURFACE_OR_FRAME';
      const rect = frame.getBoundingClientRect();
      const dataTransfer = new DataTransfer();
      const x = rect.left + rect.width * 0.10;
      const y = rect.top + rect.height * 0.5;
      surface.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer, clientX: x, clientY: y }));
      return 'DRAGOVER_DISPATCHED';
    })()`,
    returnByValue: true
  });
  await sleep(150);
  const ghostStateResult = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({ visible: Boolean(document.querySelector('.snap-ghost-overlay')), label: document.querySelector('.snap-ghost-label')?.textContent || '' })`,
    returnByValue: true
  });
  const ghostState = JSON.parse(ghostStateResult.result.value);
  const snapDrop = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const surface = document.querySelector('.snap-drag-surface');
      const frame = document.querySelector('.browser-webview-frame');
      if (!surface || !frame) return 'MISSING_SURFACE_OR_FRAME';
      const rect = frame.getBoundingClientRect();
      const dataTransfer = new DataTransfer();
      surface.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientX: rect.left + rect.width * 0.10, clientY: rect.top + rect.height * 0.5 }));
      return 'DROP_DISPATCHED';
    })()`,
    returnByValue: true
  });
  await sleep(500);
  const snapResult = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({ layout: document.querySelector('.multiview-grid-container')?.className || '', panes: [...document.querySelectorAll('.multiview-pane-chrome')].map(p => p.classList.contains('occupied')), tabIds: [...document.querySelectorAll('.multiview-pane-title')].map(p => p.textContent) })`,
    returnByValue: true
  });
  const snapState = JSON.parse(snapResult.result.value);
  check('drag and drop creates dual multiview without duplicate panes',
    snapDrag.result.value === 'DRAG_STARTED' && snapHover.result.value === 'DRAGOVER_DISPATCHED' && snapDrop.result.value === 'DROP_DISPATCHED'
      && snapState.layout.includes('layout-dual-25-75')
      && snapState.panes.filter(Boolean).length === 2
      && new Set(snapState.tabIds).size === 2,
    `${snapDrag.result.value}/${snapHover.result.value}/${snapDrop.result.value}, ${snapState.layout}, occupied=${snapState.panes.filter(Boolean).length}`);
  check('snap drag displays a target ghost before drop', ghostState.visible && /25%|75%|Dual/i.test(ghostState.label), ghostState.label || 'ghost not visible');

  const flyoutProbe = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const source = document.querySelector('.vertical-tab-item');
      const surface = document.querySelector('.snap-drag-surface');
      const frame = document.querySelector('.browser-webview-frame');
      if (!source || !surface || !frame) return 'MISSING_SOURCE_SURFACE_OR_FRAME';
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
      const rect = frame.getBoundingClientRect();
      surface.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientX: rect.left + rect.width * 0.5, clientY: rect.top + rect.height * 0.05 }));
      return 'FLYOUT_DRAGOVER_DISPATCHED';
    })()`,
    returnByValue: true
  });
  await sleep(150);
  const flyoutStateResult = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({ visible: Boolean(document.querySelector('.snap-bar-flyout.is-visible')), cards: document.querySelectorAll('.snap-bar-card').length, quadSlot: Boolean(document.querySelector('.snap-bar-flyout button[aria-label^="Quad 2x2 Grid"]')) })`,
    returnByValue: true
  });
  const flyoutState = JSON.parse(flyoutStateResult.result.value);
  check('snap flyout presents selectable layouts', flyoutProbe.result.value === 'FLYOUT_DRAGOVER_DISPATCHED' && flyoutState.visible && flyoutState.cards >= 8 && flyoutState.quadSlot, `visible=${flyoutState.visible}, cards=${flyoutState.cards}`);
  const quadSelect = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const slot = document.querySelector('.snap-bar-flyout button[aria-label^="Quad 2x2 Grid"]');
      if (!slot) return 'QUAD_SLOT_NOT_FOUND';
      slot.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
      return 'QUAD_SLOT_HOVERED';
    })()`,
    returnByValue: true
  });
  await sleep(100);
  const quadDrop = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const slot = document.querySelector('.snap-bar-flyout button[aria-label^="Quad 2x2 Grid"]');
      if (!slot) return 'QUAD_SLOT_NOT_FOUND';
      slot.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
      return 'QUAD_DROP_DISPATCHED';
    })()`,
    returnByValue: true
  });
  await sleep(300);
  const quadResult = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({ layout: document.querySelector('.multiview-grid-container')?.className || '', panes: [...document.querySelectorAll('.multiview-pane-chrome')].map(p => p.classList.contains('occupied')), uniqueTitles: new Set([...document.querySelectorAll('.multiview-pane-title')].map(p => p.textContent)).size })`,
    returnByValue: true
  });
  const quadState = JSON.parse(quadResult.result.value);
  check('snap flyout drop changes layout to quad and keeps unique tabs', quadSelect.result.value === 'QUAD_SLOT_HOVERED' && quadDrop.result.value === 'QUAD_DROP_DISPATCHED' && quadState.layout.includes('layout-quad-grid') && quadState.panes.length === 4 && quadState.panes.filter(Boolean).length === 2 && quadState.uniqueTitles === 2,
    `${quadSelect.result.value}/${quadDrop.result.value}, ${quadState.layout}, occupied=${quadState.panes.filter(Boolean).length}`);

  const resizeX = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const divider = document.querySelector('.multiview-divider-vertical');
      const frame = document.querySelector('.browser-webview-frame');
      if (!divider || !frame) return false;
      const rect = frame.getBoundingClientRect();
      divider.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: rect.left + rect.width * 0.5, clientY: rect.top + rect.height * 0.5 }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: rect.left + rect.width * 0.65, clientY: rect.top + rect.height * 0.5 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return true;
    })()`,
    returnByValue: true
  });
  const resizeY = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const divider = document.querySelector('.multiview-divider-horizontal');
      const frame = document.querySelector('.browser-webview-frame');
      if (!divider || !frame) return false;
      const rect = frame.getBoundingClientRect();
      divider.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: rect.left + rect.width * 0.5, clientY: rect.top + rect.height * 0.5 }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: rect.left + rect.width * 0.5, clientY: rect.top + rect.height * 0.65 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return true;
    })()`,
    returnByValue: true
  });
  const resized = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({ x: document.querySelector('.browser-tab-pane')?.style.width, y: document.querySelector('.browser-tab-pane')?.style.height, layout: document.querySelector('.multiview-grid-container')?.className || '' })`,
    returnByValue: true
  });
  const resizedState = JSON.parse(resized.result.value);
  check('multiview resizing snaps at supported ratios', resizeX.result.value && resizeY.result.value && resizedState.layout.includes('layout-quad-grid') && /66\.67%/.test(resizedState.x || '') && /66\.67%/.test(resizedState.y || ''), `pane=${resizedState.x}×${resizedState.y}`);

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
    expression: `(() => { const button = document.querySelector('.multiview-pane-chrome.active-pane .multiview-pane-btn[title="Diesen Tab maximieren"]'); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true
  });
  await sleep(250);
  const maximizedState = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({ multiview: Boolean(document.querySelector('.multiview-grid-container')), tabs: document.querySelectorAll('.vertical-tab-item').length })`,
    returnByValue: true
  });
  const maximizedInfo = JSON.parse(maximizedState.result.value);
  check('multiview maximize restores single-pane view without closing tabs', maximized.result.value && !maximizedInfo.multiview && maximizedInfo.tabs === 2, `multiview=${maximizedInfo.multiview}, tabs=${maximizedInfo.tabs}`);

  const closeDragStart = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const source = [...document.querySelectorAll('.vertical-tab-item')].find(tab => !tab.classList.contains('active')); if (!source) return false; source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() })); return true; })()`,
    returnByValue: true
  });
  await sleep(100);
  const closeDragDrop = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const surface = document.querySelector('.snap-drag-surface'); const frame = document.querySelector('.browser-webview-frame'); if (!surface || !frame) return false; const rect = frame.getBoundingClientRect(); surface.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientX: rect.left + rect.width * 0.1, clientY: rect.top + rect.height * 0.5 })); return true; })()`,
    returnByValue: true
  });
  await sleep(100);
  await cdp.send('Runtime.evaluate', { expression: `(() => { const surface = document.querySelector('.snap-drag-surface'); const frame = document.querySelector('.browser-webview-frame'); if (!surface || !frame) return; const rect = frame.getBoundingClientRect(); surface.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientX: rect.left + rect.width * 0.1, clientY: rect.top + rect.height * 0.5 })); })()`, returnByValue: true });
  await sleep(200);
  const closePane = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.multiview-pane-chrome.occupied .multiview-pane-btn.close-pane'); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true
  });
  await sleep(200);
  const closeState = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({ multiview: Boolean(document.querySelector('.multiview-grid-container')), tabs: document.querySelectorAll('.vertical-tab-item').length })`,
    returnByValue: true
  });
  const closedInfo = JSON.parse(closeState.result.value);
  check('removing a snapped pane returns to single view and preserves its tab', closeDragStart.result.value && closeDragDrop.result.value && closePane.result.value && !closedInfo.multiview && closedInfo.tabs === 2, `multiview=${closedInfo.multiview}, tabs=${closedInfo.tabs}`);

  const detachDragStart = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const source = [...document.querySelectorAll('.vertical-tab-item')].find(tab => !tab.classList.contains('active')); if (!source) return false; source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() })); return true; })()`,
    returnByValue: true
  });
  await sleep(100);
  await cdp.send('Runtime.evaluate', {
    expression: `(() => { const surface = document.querySelector('.snap-drag-surface'); const frame = document.querySelector('.browser-webview-frame'); if (!surface || !frame) return; const rect = frame.getBoundingClientRect(); surface.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientX: rect.left + rect.width * 0.1, clientY: rect.top + rect.height * 0.5 })); surface.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientX: rect.left + rect.width * 0.1, clientY: rect.top + rect.height * 0.5 })); })()`,
    returnByValue: true
  });
  await sleep(250);
  const detachButton = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.multiview-pane-chrome.occupied .multiview-pane-btn[title="In eigenem Fenster öffnen"]'); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true
  });
  let detachedShell = null;
  for (let i = 0; i < 50; i++) {
    const currentTargets = await cdpList();
    detachedShell = currentTargets.find((target) => target.type === 'page' && target.url.includes('index.html') && target.id !== shell.id) || null;
    if (detachedShell) break;
    await sleep(200);
  }
  let detachedInfo = { tabs: 0, ready: 'missing' };
  let detachedCdp = null;
  if (detachedShell?.webSocketDebuggerUrl) {
    detachedCdp = new CDP(detachedShell.webSocketDebuggerUrl);
    for (let i = 0; i < 50; i++) {
      try {
        const state = await detachedCdp.send('Runtime.evaluate', {
          expression: `JSON.stringify({ ready: document.readyState, tabs: document.querySelectorAll('.vertical-tab-item').length })`,
          returnByValue: true
        });
        detachedInfo = JSON.parse(state.result.value);
        if (detachedInfo.ready === 'complete' && detachedInfo.tabs === 1) break;
      } catch { /* wait for the secondary renderer to initialize */ }
      await sleep(200);
    }
  }
  let sourceInfo = { multiview: true, tabs: 0 };
  for (let i = 0; i < 50; i++) {
    const sourceAfterDetach = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({ multiview: Boolean(document.querySelector('.multiview-grid-container')), tabs: document.querySelectorAll('.vertical-tab-item').length })`,
      returnByValue: true
    });
    sourceInfo = JSON.parse(sourceAfterDetach.result.value);
    if (sourceInfo.tabs === 1 && !sourceInfo.multiview) break;
    await sleep(200);
  }
  check('detaching a split pane opens a second window and transfers exactly one tab', detachDragStart.result.value && detachButton.result.value && Boolean(detachedShell) && detachedInfo.tabs === 1 && sourceInfo.tabs === 1 && !sourceInfo.multiview, `newWindow=${Boolean(detachedShell)}, detachedTabs=${detachedInfo.tabs}, sourceTabs=${sourceInfo.tabs}, sourceMultiview=${sourceInfo.multiview}`);
  detachedCdp?.close();

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
  console.log('');
  console.log(`Result: ${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

function stopSmokeApp(child) {
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
  const expectedProfile = path.resolve(os.tmpdir(), `lastbrowser-browser-smoke-${process.pid}`);
  if (path.resolve(SMOKE_PROFILE_DIR) === expectedProfile
    && path.basename(expectedProfile).startsWith('lastbrowser-browser-smoke-')) {
    try { rmSync(expectedProfile, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  stopSmokeApp(smokeChild);
  process.exit(1);
});
