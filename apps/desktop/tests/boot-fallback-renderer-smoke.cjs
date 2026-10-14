const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../../..');

async function child(profile, documentPath) {
  const { app, BrowserWindow } = require('electron');
  // This offscreen fixture proves DOM/paint behavior, not the host GPU driver.
  app.disableHardwareAcceleration();
  let window;
  try {
    app.setPath('userData', profile);
    await app.whenReady();
    window = new BrowserWindow({ show: false, width: 800, height: 500, webPreferences: { offscreen: true } });
    window.webContents.on('render-process-gone', (_event, details) => console.error('boot-renderer-gone', JSON.stringify(details)));
    let committed = 0;
    window.webContents.on('console-message', event => {
      if (event.message === '[lastbrowser react-root-committed]') committed++;
    });
    await window.loadFile(documentPath);
    const state = await window.webContents.executeJavaScript(`(() => {
      const fallback = document.getElementById('boot-fallback');
      const box = fallback?.getBoundingClientRect();
      return {
        text: fallback?.textContent,
        role: fallback?.getAttribute('role'),
        rootChildren: document.getElementById('root')?.childElementCount,
        background: fallback && getComputedStyle(fallback).backgroundColor,
        width: box?.width,
        height: box?.height
      };
    })()`);
    assert.match(state.text, /Lastbrowser startet/);
    assert.equal(state.role, 'status');
    assert.equal(state.rootChildren, 0);
    assert.equal(state.background, 'rgb(7, 17, 31)');
    assert.equal(state.width, 800);
    assert.equal(state.height, 500);
    // Offscreen software rendering exposes its real bitmap through `paint`.
    // capturePage copies a Viz surface that a hidden CPU window need not own.
    const image = await new Promise((resolve, reject) => {
      let lastPixels = 0, lastBackgroundPixels = 0;
      const cleanup = () => { clearTimeout(timer); clearInterval(invalidate); window.webContents.removeListener('paint', onPaint); };
      const onPaint = (_event, _dirty, image) => {
        const bitmap = image.toBitmap();
        lastPixels = 0; lastBackgroundPixels = 0;
        for (let i = 0; i < bitmap.length; i += 4) {
          if (bitmap[i] > 150 && bitmap[i + 1] > 150 && bitmap[i + 2] > 150) lastPixels++;
          if (Math.abs(bitmap[i] - 31) <= 3 && Math.abs(bitmap[i + 1] - 17) <= 3 && Math.abs(bitmap[i + 2] - 7) <= 3) lastBackgroundPixels++;
        }
        // The first offscreen frame can be the initial blank surface. Wait for
        // the same actual text-pixel condition asserted below, with a deadline.
        if (lastPixels > 100 && lastBackgroundPixels > bitmap.length / 4 * .8) { cleanup(); resolve(image); }
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error(`Fallback did not paint text on navy within 5s: ${lastPixels} light pixels, ${lastBackgroundPixels} navy pixels`)); }, 5000);
      const invalidate = setInterval(() => window.webContents.invalidate(), 50);
      window.webContents.on('paint', onPaint);
      window.webContents.invalidate();
    });
    const bitmap = image.toBitmap();
    let textPixels = 0, backgroundPixels = 0;
    for (let i = 0; i < bitmap.length; i += 4) {
      if (bitmap[i] > 150 && bitmap[i + 1] > 150 && bitmap[i + 2] > 150) textPixels++;
      if (Math.abs(bitmap[i] - 31) <= 3 && Math.abs(bitmap[i + 1] - 17) <= 3 && Math.abs(bitmap[i + 2] - 7) <= 3) backgroundPixels++;
    }
    assert(textPixels > 100, `Fallback text did not paint: ${textPixels} light pixels`);
    assert(backgroundPixels > bitmap.length / 4 * .8, `Fallback navy background did not paint: ${backgroundPixels} pixels`);
    fs.mkdirSync(path.join(root, 'output'), { recursive: true });
    fs.writeFileSync(path.join(root, 'output', 'boot-fallback-proof.png'), image.toPNG());
    await window.loadFile(path.join(profile, 'committed.html'));
    let mounted = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      mounted = await window.webContents.executeJavaScript("!document.getElementById('boot-fallback') && !!document.getElementById('live')");
      if (mounted) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(mounted, 'Fallback stayed over a committed React root');
    assert.equal(committed, 1, 'React commit marker was not emitted exactly once');
    console.log('boot-fallback-visible:passed');
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
  }
}

function parent() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-boot-fallback-'));
  const documentPath = path.join(profile, 'index.html');
  try {
    // A missing entry module must still leave visible startup content.
    const source = fs.readFileSync(path.join(root, 'apps/desktop/index.html'), 'utf8');
    fs.writeFileSync(documentPath, source);
    const fixture = "import React from 'react'; import { createRoot } from 'react-dom/client'; import { BootCommitted } from './src/renderer/boot-fallback.tsx'; createRoot(document.getElementById('root')).render(React.createElement(React.Fragment, null, React.createElement('div', {id:'live'}, 'Ready'), React.createElement(BootCommitted)));";
    require('esbuild').buildSync({
      stdin: { contents: fixture, loader: 'tsx', resolveDir: path.join(root, 'apps/desktop') },
      bundle: true, platform: 'browser', format: 'iife', target: 'chrome130',
      outfile: path.join(profile, 'fixture.js')
    });
    fs.writeFileSync(path.join(profile, 'committed.html'), source.replace(
      '<script type="module" src="/src/renderer/main.tsx"></script>',
      '<script src="fixture.js"></script>'
    ));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const electronPackage = require.resolve('electron/package.json');
    const executable = process.platform === 'win32'
      ? path.join(path.dirname(electronPackage), 'dist', 'electron.exe')
      : require('electron');
    const result = spawnSync(executable, [__filename, '--child', profile, documentPath], {
      cwd: root, env, encoding: 'utf8', timeout: 30000, windowsHide: true
    });
    assert.equal(result.status, 0, `${result.error || ''}\n${result.stderr}\n${result.stdout}`);
    assert.match(result.stdout, /boot-fallback-visible:passed/);
    process.stdout.write(result.stdout);
  } finally {
    const target = path.resolve(profile);
    assert(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('lastbrowser-boot-fallback-'));
    fs.rmSync(target, { recursive: true, force: true });
  }
}

if (process.argv[2] === '--child') void child(process.argv[3], process.argv[4]);
else parent();
