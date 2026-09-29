/** Isolated real-renderer appearance smoke. Uses only localhost and a disposable profile. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const electron = process.argv[2] || path.resolve('node_modules/electron/dist/electron.exe');
const entry = path.resolve('apps/desktop/dist/main/main.js');
const profile = mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-appearance-smoke-'));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
let child;
let cdp;
function check(name, ok, detail = '') { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); }
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}
class Cdp {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.waiting = new Map(); this.ready = new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; }); this.ws.onmessage = ({ data }) => { const m = JSON.parse(data); if (m.id && this.waiting.has(m.id)) { const { resolve, reject } = this.waiting.get(m.id); this.waiting.delete(m.id); m.error ? reject(Error(JSON.stringify(m.error))) : resolve(m.result); } }; }
  async send(method, params = {}) { await this.ready; const id = ++this.id; return new Promise((resolve, reject) => { this.waiting.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (this.waiting.has(id)) { this.waiting.delete(id); reject(Error(`CDP timeout ${method}`)); } }, 12000); }); }
  close() { this.ws.close(); }
}
async function evaluate(expression, awaitPromise = false) { const out = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }); return out.result.value; }
async function waitFor(expression, expected = true) { for (let i = 0; i < 60; i++) { try { if ((await evaluate(expression)) === expected) return true; } catch {} await wait(200); } return false; }

try {
  if (!existsSync(electron) || !existsSync(entry)) throw Error('Build Electron or dist/main/main.js missing; build the desktop first.');
  const port = await freePort();
  const launchArgs = [
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    ...(path.basename(electron).toLowerCase() === 'electron.exe' ? [entry] : [])
  ];
  child = spawn(electron, launchArgs, {
    detached: true,
    stdio: process.env.LASTBROWSER_SMOKE_LOG === '1' ? 'inherit' : 'ignore',
    windowsHide: true
  });
  let target;
  for (let i = 0; i < 100; i++) { try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); target = list.find((t) => t.type === 'page' && /index\.html/.test(t.url)); if (target) break; } catch {} await wait(250); }
  if (!target) throw Error('No local Electron renderer target became ready.');
  cdp = new Cdp(target.webSocketDebuggerUrl); await cdp.send('Runtime.enable');
  const shell = await waitFor(`Boolean(document.querySelector('.shell-rail, .sidekick-sidebar'))`);
  check('renderer shell mounts', shell);
  let runtimeStatus;
  for (let attempt = 0; attempt < 60; attempt++) {
    runtimeStatus = await evaluate('window.lastbrowser.services.status()', true);
    if (runtimeStatus?.sidekick === 'ready' && runtimeStatus?.webuiHealth === 'ready' && runtimeStatus?.webuiUrl) break;
    await wait(250);
  }
  const sidekickApiReady = runtimeStatus?.sidekick === 'ready' && runtimeStatus?.webuiHealth === 'ready' && Boolean(runtimeStatus?.webuiUrl);
  check('Sidekick API is ready for backend persistence checks', sidekickApiReady, JSON.stringify({ sidekick: runtimeStatus?.sidekick, webuiHealth: runtimeStatus?.webuiHealth, hasWebuiUrl: Boolean(runtimeStatus?.webuiUrl) }));
  if (!sidekickApiReady) throw Error('Sidekick API is not ready; appearance persistence cannot be verified against backend settings.');
  // Dismiss first-run modal if present; it is scoped to this disposable profile.
  await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/erstmal ohne|ohne ki|dismiss|skip/i.test(x.innerText||'')); b?.click(); return !!b; })()`);
  await evaluate(`(() => { const toggle=document.querySelector('button[aria-label="Toggle Sidebar"]'); if (toggle && !document.querySelector('.expanded-workspace-pill')) toggle.click(); return true; })()`);
  await wait(300);
  const settingsProbe = await evaluate(`(() => { const re=/^(settings|einstellungen|configuraci[oó]n|param[eè]tres|impostazioni|configura[cç][aã]o|настройки)$/i; const b=[...document.querySelectorAll('.nova-dock-btn,.footer-link-btn')].find(x=>re.test((x.getAttribute('aria-label')||x.innerText||'').trim())); b?.click(); return JSON.stringify({clicked:!!b, shell:document.querySelector('.app-shell')?.className, target:b?.outerHTML.slice(0,350)||'', sidebar:document.querySelector('.sidekick-sidebar')?.className, buttons:[...document.querySelectorAll('.sidekick-sidebar button')].map(x=>[x.className,x.getAttribute('aria-label'),x.title,x.innerText]).slice(-8)}); })()`);
  const settings = JSON.parse(settingsProbe || '{}').clicked;
  const settingsReady = settings && await waitFor(`Boolean(document.querySelector('.app-shell.panel-settings'))`);
  check('Settings opens through browser UI', settingsReady, settingsProbe);
  const appearance = await evaluate(`(() => { const b=document.querySelectorAll('.settings-section-button')[1]; b?.click(); return !!b; })()`);
  const ready = appearance && await waitFor(`Boolean(document.querySelector('.settings-theme-grid'))`);
  check('Appearance panel renders', ready);
  if (!ready) throw Error('Appearance controls did not render.');

  // Exercise actual UI clicks and assert resulting live root styles/data.
  for (const [id, expectedBlur] of [['solid','0px'], ['subtle','8px'], ['modern','16px'], ['deep','36px']]) {
    const index = ['solid','subtle','modern','deep'].indexOf(id);
    const clicked = await evaluate(`(() => { const group=[...document.querySelectorAll('.settings-segmented-group')].find(x=>x.querySelectorAll('.settings-seg-btn').length===4); const b=group?.querySelectorAll('.settings-seg-btn')[${index}]; if (!b) return false; b.click(); return true; })()`);
    const actual = await evaluate(`JSON.stringify({level:document.documentElement.dataset.glassLevel, blur:getComputedStyle(document.documentElement).getPropertyValue('--glass-blur').trim(), saved:localStorage.getItem('lastbrowser.glassLevel.v1')})`);
    const val = JSON.parse(actual || '{}');
    check(`Glass ${id} updates and persists`, clicked && val.level === id && val.blur === expectedBlur && val.saved === id, JSON.stringify(val));
  }
  const accent = await evaluate(`(() => { const b=document.querySelector('.settings-accent-btn[title="Violet"]') || [...document.querySelectorAll('.settings-accent-btn')].find(x=>/violet/i.test(x.title)); if (!b) return false; b.click(); return true; })()`);
  const accentState = JSON.parse(await evaluate(`JSON.stringify({id:document.documentElement.dataset.themeAccent, saved:localStorage.getItem('lastbrowser.themeAccent.v1'), primary:getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()})`));
  check('Accent palette changes live color and persists', accent && accentState.id === 'electric-violet' && accentState.saved === 'electric-violet' && accentState.primary.toLowerCase() === '#a855f7', JSON.stringify(accentState));

  // Draft-backed appearance fields auto-save a complete settings snapshot.
  // Wait for each backend readback before setting the next field so the test
  // observes the final queued snapshot rather than a transient write.
  const themeClick = await evaluate(`(() => { const b=[...document.querySelectorAll('.settings-theme-grid .settings-theme-btn')].find(x=>/oled/i.test(x.innerText||'')); if (!b) return false; b.click(); return b.classList.contains('active'); })()`);
  await wait(1200);
  const oledEvent = await evaluate(`JSON.stringify({events:window.__appearanceSettingsEvents||[],theme:localStorage.getItem('lastbrowser.theme')})`);
  const fontClick = await evaluate(`(() => { const f=document.querySelectorAll('.settings-size-grid .settings-size-btn')[3]; if (!f) return false; f.click(); return f.classList.contains('active'); })()`);
  const fontSavedBackend = await wait(350);
  const zoomFocus = await evaluate(`(() => { const r=document.querySelector('.settings-panel-scroll input[type="range"][min="80"]'); r?.focus(); return JSON.stringify({zoom:!!r,value:r?.value}); })()`);
  for (let index = 0; index < 5; index++) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  }
  await wait(250);
  const oledLive = JSON.parse(await evaluate(`JSON.stringify({mode:document.documentElement.dataset.themeMode, theme:document.documentElement.dataset.theme, oled:document.documentElement.classList.contains('theme-oled'), font:document.documentElement.dataset.fontSize, zoomInput:[...document.querySelectorAll('input[type="range"]')].find(x=>x.min==='80')?.value})`));
  check('OLED, font size, and default zoom controls update preview', themeClick && fontClick && oledLive.mode === 'oled' && oledLive.theme === 'oled' && oledLive.oled && oledLive.font === 'xlarge' && oledLive.zoomInput === '125', `savedEvents=${oledEvent}; ${zoomFocus}; ${JSON.stringify(oledLive)}`);
  // Theme, font size, and zoom use the debounced auto-save path. Waiting for
  // the action bar here used to click a button that does not exist because
  // these controls never mark the draft dirty.
  await wait(1800);
  const savedBackend = await evaluate(`JSON.stringify({theme:localStorage.getItem('lastbrowser.theme'),font:localStorage.getItem('lastbrowser.font_size'),zoom:document.querySelector('.settings-panel-scroll input[type="range"][min="80"]')?.value,events:window.__appearanceSettingsEvents||[]})`);
  const saved = JSON.parse(await evaluate(`JSON.stringify({theme:localStorage.getItem('lastbrowser.theme'),font:localStorage.getItem('lastbrowser.font_size'),zoom:document.querySelector('.settings-panel-scroll input[type="range"][min="80"]')?.value})`));
  const savedLocal = await evaluate(`JSON.stringify({theme:localStorage.getItem('lastbrowser.theme'),font:localStorage.getItem('lastbrowser.font_size')})`);
  check('OLED, font size, and zoom save in settings', saved.theme === 'oled' && Number(saved.zoom) === 125 && JSON.parse(savedLocal).theme === 'oled' && JSON.parse(savedLocal).font === 'xlarge', `settingsPanel=${savedBackend}; UI=${JSON.stringify(saved)}; local=${savedLocal}`);

  // System mode is auto-saved. Its App-level watcher is attached once the
  // persisted settings reach the shell; capture the save/hydration race too.
  const choseSystemProbe = await evaluate(`(() => {
    window.__appearanceSettingsEvents=[];
    window.addEventListener('lastbrowser:settings-changed',event=>window.__appearanceSettingsEvents.push(event.detail?.theme||event.detail?.settings?.theme||'unknown'));
    const b=[...document.querySelectorAll('.settings-theme-grid .settings-theme-btn')].find(x=>/system/i.test(x.innerText||'')); b?.click();
    return JSON.stringify({clicked:!!b,active:b?.classList.contains('active'),dirty:document.querySelector('.settings-floating-action-bar')!==null,saveEnabled:!document.querySelector('.settings-floating-action-bar .primary-action')?.disabled});
  })()`);
  const choseSystem = JSON.parse(choseSystemProbe || '{}').clicked;
  const systemSelected = await waitFor(`Boolean([...document.querySelectorAll('.settings-theme-grid .settings-theme-btn')].find(x=>/system/i.test(x.innerText||''))?.classList.contains('active'))`);
  await wait(700);
  // System theme also auto-saves; wait for persisted readback instead of
  // clicking the manual-save bar used by non-auto-save fields.
  const saveSystem = true;
  // Wait for the backend readback before changing the emulated OS preference.
  // This avoids testing the interval in which the local live preview has
  // changed but the App-level System watcher is still subscribed to old settings.
  const systemBackendBeforeFlip = await waitFor(`JSON.parse(localStorage.getItem('lastbrowser.theme')||'null')==='system'`, true);
  await wait(300);
  await evaluate(`(() => { window.__appearanceMediaEvents=[]; matchMedia('(prefers-color-scheme: light)').addEventListener('change',e=>window.__appearanceMediaEvents.push(e.matches)); return true; })()`);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await wait(250);
  const afterLight = await evaluate(`JSON.stringify({matches:matchMedia('(prefers-color-scheme: light)').matches,mode:document.documentElement.dataset.themeMode,theme:document.documentElement.dataset.theme})`);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await wait(250);
  const afterDark = await evaluate(`JSON.stringify({matches:matchMedia('(prefers-color-scheme: dark)').matches,mode:document.documentElement.dataset.themeMode,theme:document.documentElement.dataset.theme})`);
  const systemLocal = await evaluate(`localStorage.getItem('lastbrowser.theme')`);
  const systemDiagnostics = await evaluate(`JSON.stringify({settingsChangedEvents:window.__appearanceSettingsEvents||[]})`);
  const mediaEvents = await evaluate(`JSON.stringify(window.__appearanceMediaEvents||[])`);
  const mediaEventList = JSON.parse(mediaEvents || '[]');
  const lightState = JSON.parse(afterLight || '{}');
  const darkState = JSON.parse(afterDark || '{}');
  check('System preference is stored before CDP media emulation', choseSystem && systemSelected && systemLocal === 'system' && systemBackendBeforeFlip, `clicked=${choseSystemProbe}, selected=${systemSelected}, saveClicked=${saveSystem}, local=${systemLocal}, persisted=${systemBackendBeforeFlip}, diagnostics=${systemDiagnostics}`);
  // Chromium's Emulation.setEmulatedMedia changes matchMedia.matches but does
  // not dispatch MediaQueryList change events. Treat this as an emulation
  // limitation instead of asserting that the app ignored an actual OS event.
  check('CDP media emulation updates matchMedia', lightState.matches && darkState.matches, `light=${afterLight}; dark=${afterDark}; CDP-emulated events=${mediaEvents}`);

  // Verify true persisted store values after a renderer reload without closing the app.
  await cdp.send('Page.reload', { ignoreCache: true });
  const reloaded = await waitFor(`Boolean(document.querySelector('.shell-rail, .sidekick-sidebar'))`);
  await waitFor(`document.documentElement.dataset.themeMode==='system'`);
  const persisted = await evaluate(`JSON.stringify({mode:document.documentElement.dataset.themeMode,theme:document.documentElement.dataset.theme,accent:localStorage.getItem('lastbrowser.themeAccent.v1'),glass:localStorage.getItem('lastbrowser.glassLevel.v1')})`);
  check('Theme/accent/glass survive renderer reload', reloaded && JSON.parse(persisted).mode === 'system' && JSON.parse(persisted).accent === 'electric-violet' && JSON.parse(persisted).glass === 'deep', persisted);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await cdp.send('Page.reload', { ignoreCache: true });
  const hydratedDark = await waitFor(`document.documentElement.dataset.themeMode==='system' && document.documentElement.dataset.theme==='dark'`);
  check('Hydrated System theme resolves from the current emulated preference on reload', hydratedDark, `dark=${hydratedDark}`);
  cdp.close();
} catch (error) {
  console.error('FATAL', error?.stack || error);
} finally {
  if (child?.pid) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  const root = path.resolve(os.tmpdir());
  if (path.dirname(path.resolve(profile)) === root && path.basename(profile).startsWith('lastbrowser-appearance-smoke-')) {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  }
}
const passed = results.filter((x) => x.ok).length;
console.log(`Result: ${passed}/${results.length} checks passed`);
process.exitCode = passed === results.length && results.length > 0 ? 0 : 1;
