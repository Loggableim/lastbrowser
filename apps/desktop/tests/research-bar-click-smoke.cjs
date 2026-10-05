const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

async function main() {
  const root = path.resolve(__dirname, '../../..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-researchbar-'));
  try {
    const bundle = path.join(temp, 'fixture.js');
    require('esbuild').buildSync({ entryPoints: [path.join(__dirname, 'research-bar-click-fixture.tsx')], bundle: true, platform: 'browser', format: 'iife', target: 'chrome130', outfile: bundle });
    fs.writeFileSync(path.join(temp, 'index.html'), '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="fixture.js"></script>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [__filename, '--child', temp], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
    const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
    assert.deepEqual(result, { code: 0, signal: null });
    process.stdout.write('Mounted Research Bar: trigger opened; summarize/explain/research DOM clicks dispatched exact action IDs.\n');
  } finally {
    const target = path.resolve(temp);
    assert(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('lastbrowser-researchbar-'));
    fs.rmSync(target, { recursive: true, force: true });
  }
}

async function child(temp) {
  const { app, BrowserWindow } = require('electron');
  let window;
  try {
    await app.whenReady();
    window = new BrowserWindow({ show: false, width: 1000, height: 400, webPreferences: { contextIsolation: false, nodeIntegration: false } });
    await window.loadFile(path.join(temp, 'index.html'));
    const run = script => window.webContents.executeJavaScript(script);
    const until = Date.now() + 5000;
    while (Date.now() < until && !(await run("!!document.querySelector('.titlebar-research-trigger-btn')"))) await new Promise(resolve => setTimeout(resolve, 20));
    assert(await run("!!document.querySelector('.titlebar-research-trigger-btn')"));
    await run("document.querySelector('.titlebar-research-trigger-btn').click()");
    for (const [label, action] of [['Summarize', 'summarize-page'], ['Explain', 'explain-selection'], ['Research', 'research-page']]) {
      await run(`(()=>{const button=[...document.querySelectorAll('.titlebar-research-flyout button')].find(item=>item.textContent.trim()===${JSON.stringify(label)});if(!button)throw Error('Missing ${label} flyout action');button.click()})()`);
      await new Promise(resolve => setTimeout(resolve, 0));
      const latest = await run('document.body.dataset.lastAction');
      if (latest !== action) throw new Error(`${label}: expected ${action}, got ${JSON.stringify(latest)}`);
      const prompt = await run('document.body.dataset.lastPrompt');
      if (!prompt.includes('https://controlled.invalid/page')) throw new Error(`${label}: active URL was not dispatched in prompt`);
      if (action === 'explain-selection') {
        if (!prompt.includes('selected controlled excerpt') || prompt.includes('controlled visible page text')) throw new Error('Explain did not preserve selection-only context');
      } else if (!prompt.includes('controlled visible page text')) throw new Error(`${label}: page text was not dispatched in prompt`);
    }
    await app.exit(0);
  } catch (error) {
    console.error(error);
    await app.exit(1);
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
  }
}

if (process.argv[2] === '--child') void child(process.argv[3]);
else void main().catch(error => { console.error(error); process.exitCode = 1; });
