#!/usr/bin/env node
// Isolated Electron interaction probe for sidebar pinned-app add and tab close.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const fixture = String.raw`
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import './src/renderer/styles.css';
import {PinnedAppGrid} from './src/renderer/components/PinnedAppGrid';
import {SuperSizedTabStrip} from './src/renderer/components/SuperSizedTabStrip';
import {DesktopI18nProvider,desktopLocaleStorageKey} from './src/renderer/i18n';
localStorage.setItem(desktopLocaleStorageKey,'de');
const app={id:'probe-app',name:'Probe App',url:'https://example.test',color:'#ffffff',bg:'#222222',letter:'P'};
function Harness(){
  const [tabs,setTabs]=useState([{id:'probe-tab',title:'Probe Tab',url:'https://example.test/path'}]);
  const [added,setAdded]=useState(0);
  return <div style={{display:'flex',gap:24,padding:24,background:'#111',color:'#fff',minHeight:500}}>
    <PinnedAppGrid layout="dock" apps={[app]} onOpenApp={()=>{}} onAddApp={()=>setAdded((n)=>n+1)} />
    <span id="add-count" aria-live="polite">{added}</span>
    <SuperSizedTabStrip tabs={tabs} activeTabId="probe-tab" onActivateTab={()=>{}} onCloseTab={(id)=>setTabs((current)=>current.filter((tab)=>tab.id!==id))} />
  </div>
}
createRoot(document.getElementById('root')).render(<DesktopI18nProvider><Harness/></DesktopI18nProvider>);
`;

async function main() {
  const projectRoot = path.resolve(__dirname, '../../..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-sidebar-ui-'));
  try {
    require('esbuild').buildSync({
      stdin: { contents: fixture, loader: 'tsx', resolveDir: path.join(projectRoot, 'apps/desktop') },
      bundle: true, platform: 'browser', format: 'iife', target: 'chrome130',
      loader: { '.woff2': 'dataurl' }, outfile: path.join(temp, 'fixture.js')
    });
    fs.writeFileSync(path.join(temp, 'index.html'), '<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:"></head><body style="margin:0"><div id="root"></div><script src="fixture.js"></script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [__filename, '--child', temp], { cwd: projectRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (value) => stdout += value.toString());
    child.stderr.on('data', (value) => stderr += value.toString());
    const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
    assert.deepEqual(result, { code: 0, signal: null }, `Electron UI probe failed: ${stderr.slice(-4000)} ${stdout.slice(-1000)}`);
    process.stdout.write(stdout);
  } finally {
    const target = path.resolve(temp);
    assert(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('lastbrowser-sidebar-ui-'));
    fs.rmSync(target, { recursive: true, force: true });
  }
}

async function child(temp) {
  const { app, BrowserWindow } = require('electron');
  app.setPath('userData', path.join(temp, 'user-data'));
  await app.whenReady();
  const win = new BrowserWindow({ show: true, width: 640, height: 520, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  try {
    const rendererErrors = [];
    win.webContents.on('console-message', (event) => { if (event.level >= 2) rendererErrors.push(event.message); });
    await win.loadFile(path.join(temp, 'index.html'));
    const until = async (check, label) => {
      const end = Date.now() + 8000;
      while (Date.now() < end) {
        if (await win.webContents.executeJavaScript(check)) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`Timeout: ${label}`);
    };
    await until("document.querySelector('[aria-label=\"App anheften\"]') && document.querySelector('[aria-label=\"Close Probe Tab\"]')", 'pinned-app add and tab-close buttons mount');

    await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"App anheften\"]').click()");
    await until("document.querySelector('#add-count').textContent==='1'", 'pinned-app plus dispatches one add callback');

    await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"Close Probe Tab\"]').click()");
    await until("!document.querySelector('[aria-label=\"Close Probe Tab\"]')", 'closing the temporary tab removes only its fixture row');

    assert.deepEqual(rendererErrors, [], 'No renderer errors');
    process.stdout.write(JSON.stringify({ phase: 'sidebar-tab-pinned-ui-smoke:passed', pinnedAddCallbackCount: 1, fixtureTabRemoved: true, rendererErrors }) + '\n');
    await app.exit(0);
  } catch (error) {
    console.error(error);
    await app.exit(1);
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

if (process.argv[2] === '--child') void child(process.argv[3]);
else void main().catch((error) => { console.error(error); process.exitCode = 1; });
