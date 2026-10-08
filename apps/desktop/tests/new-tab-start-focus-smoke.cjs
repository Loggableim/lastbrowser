#!/usr/bin/env node
// Electron UI flow for the expanded-sidebar New tab action and start-page search focus.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const fixture = String.raw`
import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './src/renderer/styles.css';
import {SidekickSidebar} from './src/renderer/components/SidekickSidebar';
import {NativeBrowserStartPage} from './src/renderer/panels/NativeBrowserStartPage';
import {DesktopI18nProvider,desktopLocaleStorageKey} from './src/renderer/i18n';

window.lastbrowser={i18n:{setLocale:async()=>{}},browser:{onShortcut:callback=>{window.__lastbrowserShortcut=callback;return()=>{}}}};
localStorage.setItem(desktopLocaleStorageKey,'en');
const start='lastbrowser://start';
function Harness(){
  const[tabs,setTabs]=useState([{id:'existing',title:'Existing home',url:start}]);
  const[activeId,setActiveId]=useState('existing');
  const[focusTabId,setFocusTabId]=useState(null);
  const[navigation,setNavigation]=useState('');
  const[mode,setMode]=useState('expanded');
  const active=tabs.find(tab=>tab.id===activeId);
  function createTab(){const id='new-'+(tabs.length+1);setTabs(rows=>[...rows,{id,title:'New tab',url:start}]);setActiveId(id);setFocusTabId(id);}
  useEffect(()=>{window.__lastbrowserShortcut=action=>{if(action?.action==='new-tab')createTab();};},[tabs]);
  return <div style={{display:'flex',height:'100vh',background:'#07111e',color:'#fff'}}>
    <SidekickSidebar mode={mode} tabs={tabs} activeTabId={activeId} onActivateTab={id=>{setActiveId(id);setFocusTabId(null)}}
      onCloseTab={()=>{}} onNewTab={createTab} onCycleMode={()=>setMode(current=>current==='expanded'?'slim':'expanded')}
      onSetMode={setMode} activeSpacePath="" spaces={[]} onSelectSpace={()=>{}} onOpenSettings={()=>{}} onOpenApp={()=>{}}
      drawerTab="tabs" onSelectDrawerTab={()=>{}} />
    <main style={{flex:1,minWidth:0}}>
      {active?.url===start&&<NativeBrowserStartPage key={activeId} bookmarks={[]} visits={[]} onNavigate={url=>{setNavigation(url);setTabs(rows=>rows.map(tab=>tab.id===activeId?{...tab,url}:tab))}}
        focusSearchOnMount={focusTabId===activeId} onSearchFocusConsumed={()=>setFocusTabId(current=>current===activeId?null:current)} />}
      <output id="active-tab">{activeId}</output><output id="navigation">{navigation}</output>
      <button id="switch-existing" onClick={()=>{setActiveId('existing');setFocusTabId(null)}}>Switch existing</button>
      <button id="toggle-slim" onClick={()=>setMode(current=>current==='expanded'?'slim':'expanded')}>Toggle slim</button>
    </main>
  </div>;
}
createRoot(document.getElementById('root')).render(<DesktopI18nProvider><Harness/></DesktopI18nProvider>);
`;

async function main() {
  const projectRoot = path.resolve(__dirname, '../../..');
  const appSource = fs.readFileSync(path.join(projectRoot, 'apps/desktop/src/renderer/App.tsx'), 'utf8');
  assert.match(appSource, /case 'new-tab':\s+addTabAndFocusStartSearch\(\);/,
    'The native Ctrl+T shortcut route must use the same create-and-focus action.');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-new-tab-focus-'));
  try {
    require('esbuild').buildSync({
      stdin: { contents: fixture, loader: 'tsx', resolveDir: path.join(projectRoot, 'apps/desktop') },
      bundle: true, platform: 'browser', format: 'iife', target: 'chrome130',
      loader: { '.woff2': 'dataurl' }, outfile: path.join(temp, 'fixture.js')
    });
    fs.writeFileSync(path.join(temp, 'index.html'), '<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:"></head><body style="margin:0"><div id="root"></div><script src="fixture.js"></script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const electronBinary = process.env.LASTBROWSER_ELECTRON_BINARY || require('electron');
    const child = spawn(electronBinary, [__filename, '--child', temp], { cwd: projectRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', value => stdout += value.toString());
    child.stderr.on('data', value => stderr += value.toString());
    const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
    assert.deepEqual(result, { code: 0, signal: null }, `New tab focus UI flow failed: ${stderr.slice(-4000)} ${stdout.slice(-1000)}`);
    process.stdout.write(stdout);
  } finally {
    const target = path.resolve(temp);
    assert(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('lastbrowser-new-tab-focus-'));
    fs.rmSync(target, { recursive: true, force: true });
  }
}

async function child(temp) {
  const { app, BrowserWindow } = require('electron');
  app.setPath('userData', path.join(temp, 'user-data'));
  await app.whenReady();
  const win = new BrowserWindow({ show: true, width: 1180, height: 760, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  try {
    const rendererErrors = [];
    win.webContents.on('console-message', event => { if (event.level >= 2) rendererErrors.push(event.message); });
    await win.loadFile(path.join(temp, 'index.html'));
    const until = async (check, label) => {
      const end = Date.now() + 10000;
      while (Date.now() < end) {
        if (await win.webContents.executeJavaScript(check)) return;
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      throw new Error(`Timeout: ${label}`);
    };
    await until("document.querySelector('[data-testid=\\\"dashboard-search-input\\\"]') && document.querySelector('.vertical-new-tab-btn-prominent')", 'start page and prominent New tab action mount');
    const before = await win.webContents.executeJavaScript(`(()=>{const button=document.querySelector('.vertical-new-tab-btn-prominent').getBoundingClientRect(),pinned=document.querySelector('.expanded-pinned-raster').getBoundingClientRect();return{buttonTop:button.top,pinnedTop:pinned.top,buttonLabel:document.querySelector('.vertical-new-tab-btn-prominent').innerText}})()`);
    assert(before.buttonTop < before.pinnedTop, `New tab action must appear above pinned apps: ${JSON.stringify(before)}`);

    await win.webContents.executeJavaScript("document.querySelector('.vertical-new-tab-btn-prominent').click()");
    await until("document.querySelector('#active-tab').textContent==='new-2' && document.activeElement?.dataset.testid==='dashboard-search-input'", 'create and activate new tab, render its start page, and focus search input');
    await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('[data-testid="dashboard-search-input"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'https://example.com/');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await until("document.querySelector('[data-testid=\\\"dashboard-search-input\\\"]')?.value==='https://example.com/'", 'typing goes directly into the focused start-page input');
    await win.webContents.executeJavaScript("document.querySelector('.browser-start-search').requestSubmit()");
    await until("document.querySelector('#navigation').textContent==='https://example.com/'", 'submitting the entered URL navigates the new tab');
    await win.webContents.executeJavaScript("document.querySelector('#switch-existing').click()");
    await until("document.querySelector('#active-tab').textContent==='existing'", 'switch back to an existing start page');
    await new Promise(resolve => setTimeout(resolve, 100));
    const existingFocus = await win.webContents.executeJavaScript("document.activeElement?.dataset.testid==='dashboard-search-input'");
    assert.equal(existingFocus, false, 'switching to an existing tab must not trigger global start-page autofocus');
    await win.webContents.executeJavaScript("document.querySelector('#toggle-slim').click()");
    await until("document.querySelector('.sidekick-sidebar.slim')", 'collapsed sidebar remains available');
    await win.webContents.executeJavaScript("window.__lastbrowserShortcut({action:'new-tab'})");
    await until("document.querySelector('#active-tab').textContent==='new-3' && document.activeElement?.dataset.testid==='dashboard-search-input'",
      'Ctrl+T shortcut route creates and focuses a tab while the sidebar is slim');
    assert.deepEqual(rendererErrors, [], 'No renderer errors');
    process.stdout.write(JSON.stringify({phase:'new-tab-start-focus-smoke:passed',newTabAbovePinnedApps:true,createdAndActivated:true,startPageRendered:true,searchFocused:true,urlTypedAndSubmitted:true,existingTabNotAutofocused:true,slimSidebarPreserved:true,shortcutRouteCreatesAndFocuses:true,rendererErrors})+'\n');
    await app.exit(0);
  } catch (error) {
    console.error(error);
    await app.exit(1);
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

if (process.argv[2] === '--child') void child(process.argv[3]);
else void main().catch(error => { console.error(error); process.exitCode = 1; });
