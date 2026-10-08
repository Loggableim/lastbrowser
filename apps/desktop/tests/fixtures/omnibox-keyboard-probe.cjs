const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const output = process.env.LASTBROWSER_OMNIBOX_PROOF_DIR;
app.setPath('userData', path.join(output, 'profile'));
const pause = () => new Promise(resolve => setTimeout(resolve, 70));
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 900, height: 620, webPreferences: { contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false } });
  const contents = window.webContents;
  try {
    await window.loadURL(process.env.LASTBROWSER_OMNIBOX_PROOF_URL);
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await contents.executeJavaScript('typeof window.setupOmniboxProof === "function"')) break;
      await pause();
    }
    const evaluate = code => contents.executeJavaScript(code);
    const key = async (keyCode, modifiers = []) => {
      const nativeCode = ({ ArrowDown: 'Down', ArrowUp: 'Up', Enter: 'Return' })[keyCode] || keyCode;
      contents.sendInputEvent({ type: 'keyDown', keyCode: nativeCode, modifiers });
      if (keyCode === 'Enter') contents.sendInputEvent({ type: 'char', keyCode: '\r', modifiers });
      contents.sendInputEvent({ type: 'keyUp', keyCode: nativeCode, modifiers });
      await pause();
    };
    const read = () => evaluate(`({ value: document.querySelector('input').value, selected: document.querySelector('[role="option"][aria-selected="true"]')?.textContent || '', submitted: document.getElementById('submitted').textContent, open: document.querySelector('input').getAttribute('aria-expanded') === 'true', focusedInput: document.activeElement === document.querySelector('input') })`);
    const start = async (name, text) => { await evaluate(`window.setupOmniboxProof(${JSON.stringify(name)})`); await pause(); await evaluate("document.querySelector('input').focus()"); await contents.insertText(text); await pause(); };
    const results = {};
    await start('history', 'go'); results.googleBeforeEnter = await read();
    contents.invalidate(); await pause(); fs.writeFileSync(path.join(output, 'google-completion.png'), (await contents.capturePage()).toPNG());
    await key('Enter'); results.google = await read();
    await start('empty', 'go'); await key('Enter'); results.empty = await read();
    await start('other-selected', 'go'); await key('ArrowDown'); await key('Enter'); results.other = await read();
    await start('tab-selected', 'go'); await key('Tab'); await key('Enter'); results.tab = await read();
    await start('escape', 'go'); await key('Escape'); results.escapeBeforeEnter = await read(); await key('Enter'); results.escape = await read();
    await start('escape-focus', 'go'); await key('Escape'); await key('Tab'); results.escapeTabFocus = await read();
    await start('empty-focus', ''); await key('Tab'); results.emptyTabFocus = await read();
    await start('arrow-up', 'go'); await key('ArrowUp'); await key('Enter'); results.up = await read();
    await start('search-override', 'go'); await key('ArrowDown'); await key('ArrowDown'); await key('Enter'); results.searchOverride = await read();
    await start('explicit-url', 'https://example.org/path'); await key('Enter'); results.url = await read();
    await start('query', 'gard'); results.queryBeforeEnter = await read(); await key('Enter'); results.query = await read();
    await start('delete-retype', 'go'); await key('ArrowDown'); await key('a', ['control']); await key('Backspace'); await contents.insertText('go'); await pause(); await key('Enter'); results.retype = await read();
    await start('private', 'go'); await key('Enter'); results.private = await read();
    await start('other-profile', 'go'); await key('Enter'); results.otherProfile = await read();
    await start('legacy-multi', 'go'); await key('Enter'); results.legacyMulti = await read();
    await start('legacy-single', 'go'); await key('Enter'); results.legacySingle = await read();
    await start('loose-title', 'og'); await key('Enter'); results.loose = await read();
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(results, null, 2));
    app.exit(0);
  } catch (error) { fs.writeFileSync(path.join(output, 'error.txt'), String(error.stack || error)); app.exit(1); }
});
