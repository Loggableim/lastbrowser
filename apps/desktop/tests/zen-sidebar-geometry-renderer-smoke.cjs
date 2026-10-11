#!/usr/bin/env node
// Measure the real stylesheet in Electron across density and enlarged-topbar settings.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

async function main() {
  const root = path.resolve(__dirname, '../../..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-zen-geometry-'));
  try {
    fs.copyFileSync(path.join(root, 'apps/desktop/src/renderer/styles.css'), path.join(temp, 'styles.css'));
    fs.writeFileSync(path.join(temp, 'index.html'), `<!doctype html><html data-ui-density="compact"><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}.app-shell{position:relative;height:900px;width:1200px;display:block}.modern-titlebar{position:relative;flex:none}.zen-left-hover-sensor,.zen-sidebar-overlay{position:absolute}</style></head><body><div class="app-shell zen-mode"><header class="modern-titlebar"></header><div class="zen-left-hover-sensor"></div><aside class="zen-sidebar-overlay"></aside></div></body></html>`);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const electronPackage = require.resolve('electron/package.json');
    const executable = process.platform === 'win32'
      ? path.join(path.dirname(electronPackage), 'dist', 'electron.exe')
      : require('electron');
    const child = spawn(executable, [__filename, '--child', temp], {
      cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', value => stdout += value.toString());
    child.stderr.on('data', value => stderr += value.toString());
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error(`Zen geometry render exceeded 45s: ${stderr}`)); }, 45000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
    });
    assert.deepEqual(result, { code: 0, signal: null }, `Electron geometry probe failed: ${stderr}\n${stdout}`);
    assert.match(stdout, /zen-sidebar-titlebar-geometry:passed/);
    process.stdout.write(stdout);
  } finally {
    const target = path.resolve(temp);
    assert(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('lastbrowser-zen-geometry-'));
    fs.rmSync(target, { recursive: true, force: true });
  }
}

async function child(temp) {
  const { app, BrowserWindow } = require('electron');
  let win;
  try {
    app.setPath('userData', path.join(temp, 'user-data'));
    await app.whenReady();
    win = new BrowserWindow({ show: false, width: 1200, height: 900, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } });
    await win.loadFile(path.join(temp, 'index.html'));
    const result = await win.webContents.executeJavaScript(`(() => {
      const cases = [];
      for (const density of ['compact', 'standard', 'comfortable']) {
        for (const a11y of [null, '54', '62']) {
          document.documentElement.dataset.uiDensity = density;
          if (a11y === null) {
            delete document.documentElement.dataset.a11yEnlargedTopbar;
            delete document.documentElement.dataset.a11yMinTarget;
          } else {
            document.documentElement.dataset.a11yEnlargedTopbar = 'true';
            if (a11y === '62') document.documentElement.dataset.a11yMinTarget = '64';
            else delete document.documentElement.dataset.a11yMinTarget;
          }
          const titlebar = document.querySelector('.modern-titlebar').getBoundingClientRect();
          const sensor = document.querySelector('.zen-left-hover-sensor').getBoundingClientRect();
          const overlay = document.querySelector('.zen-sidebar-overlay').getBoundingClientRect();
          const expectedTop = Math.max(density === 'compact' ? 36 : density === 'comfortable' ? 48 : 42, a11y === null ? 0 : Number(a11y));
          cases.push({density,a11y,titlebarHeight:titlebar.height,sensorTop:sensor.top,overlayTop:overlay.top,expectedTop});
        }
      }
      return cases;
    })()`);
    for (const item of result) {
      assert(item.titlebarHeight >= item.expectedTop - 0.5, `Titlebar too short: ${JSON.stringify(item)}`);
      assert(Math.abs(item.sensorTop - item.titlebarHeight) < 0.5, `Hover sensor overlaps titlebar: ${JSON.stringify(item)}`);
      assert(Math.abs(item.overlayTop - item.titlebarHeight) < 0.5, `Sidebar overlay overlaps titlebar: ${JSON.stringify(item)}`);
    }
    process.stdout.write(`zen-sidebar-titlebar-geometry:passed ${JSON.stringify(result)}\n`);
    await app.exit(0);
  } catch (error) { console.error(error); await app.exit(1); }
  finally { if (win && !win.isDestroyed()) win.destroy(); }
}

if (process.argv[2] === '--child') void child(process.argv[3]);
else void main().catch(error => { console.error(error); process.exitCode = 1; });
