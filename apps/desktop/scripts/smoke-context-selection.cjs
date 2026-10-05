const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const report = path.join(__dirname, '../smoke-output/context-selection.json');
fs.mkdirSync(path.dirname(report), { recursive: true });
fs.writeFileSync(report, JSON.stringify({ status: 'started' }));

app.whenReady().then(async () => {
  const { preserveContextSelectionScript } = await import(pathToFileURL(path.join(__dirname, '../dist/main/selection-context-menu.js')));
  const win = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { sandbox: true, contextIsolation: true } });
  await win.loadURL('data:text/html,<p id="text">Selected search phrase</p><input id="input" value="editable phrase">');
  await win.webContents.executeJavaScript(preserveContextSelectionScript);
  const point = await win.webContents.executeJavaScript(`(() => {
    const text = document.getElementById('text'); const range = document.createRange();
    range.selectNodeContents(text); window.getSelection().addRange(range);
    const rect = range.getBoundingClientRect(); return {x:Math.round(rect.left+10),y:Math.round(rect.top+5)};
  })()`);
  const menu = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Context menu did not fire')), 5000);
    win.webContents.once('context-menu', (_event, params) => { clearTimeout(timer); resolve(params); });
  });
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'right', ...point, clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'right', ...point, clickCount: 1 });
  const params = await menu;
  assert.equal(params.selectionText, 'Selected search phrase');
  assert.equal(await win.webContents.executeJavaScript('window.getSelection().toString()'), 'Selected search phrase');
  console.log('PASS: real Chromium right click preserves selection and supplies search text');
  fs.writeFileSync(report, JSON.stringify({ status: 'passed', selectionText: params.selectionText }));
  win.destroy(); app.exit(0);
}).catch(error => { fs.writeFileSync(report, JSON.stringify({ status: 'failed', error: error.message })); console.error(error.message); app.exit(1); });
