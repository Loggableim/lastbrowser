const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const output = process.env.LASTBROWSER_NAV_PROOF_DIR;
app.setPath('userData', path.join(output, 'profile'));
const pause = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

const clickScript = `(async () => {
  const read = () => ({
    log: document.getElementById('nav-log').textContent,
    state: document.getElementById('nav-state').textContent
  });
  const click = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, selector, reason: 'missing' };
    const rect = el.getBoundingClientRect();
    let chosen = null;
    for (let y = rect.top + 2; y < rect.bottom - 1; y += 6) {
      for (let x = rect.left + 2; x < rect.right - 1; x += 6) {
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit))) {
          chosen = { x, y, hit: hit.className || hit.tagName };
          break;
        }
      }
      if (chosen) break;
    }
    const wrap = document.querySelector('.first-run-fullscreen-wrap');
    const wrapEvents = wrap ? getComputedStyle(wrap).pointerEvents : null;
    if (!chosen) {
      const mid = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { ok: false, selector, reason: 'covered', wrapEvents, hit: mid ? (mid.className || mid.tagName) : null, rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } };
    }
    const target = document.elementFromPoint(chosen.x, chosen.y);
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: chosen.x, clientY: chosen.y, view: window }));
    return { ok: true, selector, wrapEvents, hit: chosen.hit, rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } };
  };
  const clicks = {};
  const steps = [
    ['ai', '.sidebar-drawer-tabs button[role="tab"]:nth-of-type(2)'],
    ['slim', '.sidebar-collapse-icon-btn'],
    ['back', '.nav-back'],
    ['forward', '.nav-forward'],
    ['reload', '.nav-reload'],
    ['tab', '.tabbar .tab:nth-of-type(2)'],
    ['newTab', '.new-tab'],
    ['toggle', '.sidebar-toggle']
  ];
  for (const [name, selector] of steps) {
    clicks[name] = click(selector);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  const beforeKeys = read();
  const press = (key, extras) => {
    window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, extras)));
  };
  press('Tab', { ctrlKey: true });
  await new Promise((resolve) => setTimeout(resolve, 40));
  press('Tab', { ctrlKey: true, shiftKey: true });
  await new Promise((resolve) => setTimeout(resolve, 40));
  press('b', { ctrlKey: true });
  await new Promise((resolve) => setTimeout(resolve, 40));
  return { clicks, beforeKeys, afterKeys: read() };
})()`;

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 1600,
    height: 900,
    webPreferences: { contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false }
  });
  const contents = window.webContents;
  const logs = [];
  contents.on('console-message', (_event, _level, message) => logs.push(message));
  contents.on('did-fail-load', (_event, code, description, url) => logs.push(`fail-load ${code} ${description} ${url}`));
  try {
    await window.loadURL(process.env.LASTBROWSER_NAV_PROOF_URL);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await contents.executeJavaScript('window.navSmokeReady === true && !!document.querySelector(".sidebar-drawer-tabs button")')) break;
      await pause();
    }
    const ready = await contents.executeJavaScript('window.navSmokeReady === true && !!document.querySelector(".sidebar-drawer-tabs button")');
    if (!ready) {
      const html = await contents.executeJavaScript('document.body ? document.body.innerText.slice(0, 1500) : "no-body"').catch((error) => String(error));
      throw new Error(`navigation fixture did not render sidebar drawer tabs\n${html}\n${logs.join('\n')}`);
    }
    window.focus();
    contents.focus();
    const clicked = await contents.executeJavaScript(clickScript);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ ready: true, clicked }, null, 2));
    app.exit(0);
  } catch (error) {
    fs.writeFileSync(path.join(output, 'error.txt'), String(error && error.stack || error));
    app.exit(1);
  }
});
