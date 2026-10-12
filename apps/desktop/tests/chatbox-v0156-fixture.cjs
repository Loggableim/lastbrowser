#!/usr/bin/env node
// Isolated Electron UI fixture. It does not start the Lastbrowser app or Sidekick.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../../..');
const fixture = String.raw`
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './src/renderer/styles.css';
import {ChatComposer} from './src/renderer/panels/ChatComponents';
import {DesktopI18nProvider} from './src/renderer/i18n';
window.lastbrowser={i18n:{setLocale:async()=>{}}};
function Harness(){
  const [zen,setZen]=useState(false);
  const [text,setText]=useState('A draft kept through Zen');
  const [mode,setMode]=useState('plan');
  const [model,setModel]=useState('model-a');
  const [effort,setEffort]=useState('high');
  useEffect(()=>{window.__toggleZen=()=>setZen(value=>!value);window.__fixtureState={zen,text,mode,model,effort};},[zen,text,mode,model,effort]);
  return <main className={'app-shell '+(zen?'zen-mode':'')} style={{minHeight:'100vh',display:'flex',alignItems:'end',justifyContent:'center',padding:'20px 0'}}>
    <ChatComposer busy={false} mode={mode} model={model} modelProvider="controlled:provider"
      modelOptions={[{provider:'Provider',providerId:'controlled:provider',configured:true,models:[{id:'model-a',label:'Model A',reasoningEfforts:['low','high']},{id:'model-b',label:'Model B',reasoningEfforts:['low','high']}]}]}
      reasoningEffort={effort} reasoningEfforts={['low','high']} reasoningCapabilityState="ready"
      profile="fixture-profile" ready runState="idle" text={text} workspace="fixture-space"
      onMode={setMode} onModelChange={setModel} onReasoningEffort={setEffort}
      onSend={()=>{}} onStop={()=>{}} onText={setText} />
  </main>;
}
createRoot(document.getElementById('root')).render(<DesktopI18nProvider><Harness/></DesktopI18nProvider>);
`;

async function parent() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-v0156-chatbox-'));
  const output = path.join(root, 'output', 'chatbox-v0156-fixture');
  fs.mkdirSync(output, { recursive: true });
  try {
    require('esbuild').buildSync({ stdin: { contents: fixture, loader: 'tsx', resolveDir: path.join(root, 'apps/desktop') }, bundle: true, platform: 'browser', format: 'iife', target: 'chrome130', define: { 'import.meta.env.VITE_ENABLE_AI_ORCHESTRATION': '"false"' }, loader: { '.woff2': 'dataurl' }, outfile: path.join(temp, 'fixture.js') });
    fs.copyFileSync(path.join(root, 'brand/assets/sidekick-avatar.png'), path.join(temp, 'sidekick-avatar.png'));
    fs.writeFileSync(path.join(temp, 'index.html'), '<html><head><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"></head><body style="margin:0"><div id="root"></div><script src="fixture.js"></script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const electronBinary = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
    assert(fs.existsSync(electronBinary), 'Local Windows Electron runtime is unavailable');
    const child = spawn(electronBinary, [__filename, '--child', temp, output], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => stdout += data);
    child.stderr.on('data', data => stderr += data);
    const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
    assert.deepEqual(result, { code: 0, signal: null }, stderr.slice(-4000));
    process.stdout.write(stdout);
  } finally {
    assert(temp.startsWith(os.tmpdir() + path.sep));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

async function child(temp, output) {
  const { app, BrowserWindow } = require('electron');
  let win;
  try {
    app.setPath('userData', path.join(temp, 'profile'));
    await app.whenReady();
    win = new BrowserWindow({ show: true, width: 900, height: 700, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    await win.loadFile(path.join(temp, 'index.html'));
    const wait = async expression => { const until = Date.now() + 8000; while (Date.now() < until) { if (await win.webContents.executeJavaScript(expression)) return; await new Promise(resolve => setTimeout(resolve, 30)); } throw Error('Fixture timeout: ' + expression); };
    await wait('Boolean(window.__fixtureState)');
    const inspect = () => win.webContents.executeJavaScript(`(()=>{const form=document.querySelector('.chat-composer'),r=form.getBoundingClientRect(),more=form.querySelector('.composer-more'),m=more.getBoundingClientRect(),input=form.querySelector('textarea').getBoundingClientRect();return{state:window.__fixtureState,form:{x:r.x,right:r.right,bottom:r.bottom,scrollWidth:form.scrollWidth,clientWidth:form.clientWidth},inputY:input.y,moreY:m.y,accent:getComputedStyle(form.querySelector('.composer-send')).backgroundColor,moreOpen:more.open}})()`);
    for (const width of [900, 390]) {
      win.setContentSize(width, 700);
      await new Promise(resolve => setTimeout(resolve, 100));
      for (const zen of [false, true]) {
        if (zen) { await win.webContents.executeJavaScript('window.__toggleZen()'); await wait('window.__fixtureState.zen'); }
        else if (await win.webContents.executeJavaScript('window.__fixtureState.zen')) { await win.webContents.executeJavaScript('window.__toggleZen()'); await wait('!window.__fixtureState.zen'); }
        const state = await inspect();
        assert.equal(state.state.text, 'A draft kept through Zen');
        assert.equal(state.state.mode, 'plan');
        assert.equal(state.state.model, 'model-a');
        assert.equal(state.state.effort, 'high');
        assert(state.form.x >= 0 && state.form.right <= width + 1 && state.form.scrollWidth <= state.form.clientWidth + 1, `${width}/${zen}: horizontal overflow ${JSON.stringify(state)}`);
        assert(state.form.bottom <= 701, `${width}/${zen}: clipped vertically`);
        assert(state.inputY < state.moreY, `${width}/${zen}: lower action row must follow the input ${JSON.stringify(state)}`);
        const file = path.join(output, `chatbox-${zen ? 'zen' : 'normal'}-${width}.png`);
        await new Promise(resolve => setTimeout(resolve, 180));
        let png = Buffer.alloc(0);
        for (let attempt = 0; attempt < 4 && png.length <= 1000; attempt++) {
          png = (await win.webContents.capturePage()).toPNG();
          if (png.length <= 1000) await new Promise(resolve => setTimeout(resolve, 120));
        }
        assert(png.length > 1000, `${width}/${zen}: screenshot capture is empty`);
        fs.writeFileSync(file, png);
        if (width === 900 && !zen) {
          win.focus();
          await win.webContents.executeJavaScript("document.querySelector('.composer-more summary').focus()");
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
          win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
          await wait('document.querySelector(".composer-more").open');
          assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll(".composer-reasoning-effort select").length'), 1);
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
          await wait('!document.querySelector(".composer-more").open');
        }
        process.stdout.write(JSON.stringify({ width, zen, state, screenshot: file }) + '\n');
      }
    }
    win.focus();
    await win.webContents.executeJavaScript("document.querySelector('.composer-input-row textarea').focus()");
    for (const expected of ['composer-tab-btn', 'composer-more', 'composer-send']) {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
      await wait(`document.activeElement?.classList.contains('${expected}') || document.activeElement?.parentElement?.classList.contains('${expected}')`);
    }
    const inheritedAccent = await win.webContents.executeJavaScript("(()=>{document.documentElement.style.setProperty('--accent-primary','#6b8e45');return getComputedStyle(document.querySelector('.composer-send')).backgroundColor})()");
    assert.equal(inheritedAccent, 'rgb(107, 142, 69)', 'Send button must inherit the configured accent');
    process.stdout.write(JSON.stringify({ inheritedAccent, keyboardMoreOpened: true, keyboardBottomOrder: ['tabs','more','send'] }) + '\n');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
  finally { if (win && !win.isDestroyed()) win.destroy(); }
}

if (process.argv[2] === '--child') void child(process.argv[3], process.argv[4]);
else void parent().catch(error => { console.error(error); process.exitCode = 1; });
