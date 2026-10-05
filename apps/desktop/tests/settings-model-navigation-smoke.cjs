#!/usr/bin/env node
// Controlled Electron mount of NativeSettingsMain for localized keyboard/model navigation.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const fixture = String.raw`
import React,{useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import './src/renderer/styles.css';
import {NativeSettingsMain} from './src/renderer/panels/SystemPanels';
import {DesktopI18nProvider,useDesktopI18n,desktopLocaleStorageKey,createDesktopI18n} from './src/renderer/i18n';

window.lastbrowser={
  i18n:{setLocale:async()=>{}},
  sidekick:{
    getSettings:async()=>({provider:'controlled',default_model:'model-a',fallback_model:'',send_key:'enter',chat_mode:'chat',composer_mode:'action'}),
    getFallbackModel:async()=>({fallback_model:{model:''}}),
    requestWebui:async({path})=>path==='/api/models'?{groups:[{provider:'Controlled Provider',provider_id:'controlled',models:[{id:'model-a',label:'Model A'},{id:'model-b',label:'Model B'}]}],default_model:'model-a',active_provider:'controlled'}:path==='/api/auth/status'?{auth_enabled:false,logged_in:false}:path==='/api/plugins'?{plugins:[]}: {},
    saveSettings:async()=>({}),setDefaultModel:async()=>({}),setFallbackModel:async()=>({})
  },
  updates:{status:async()=>({state:'idle',currentVersion:'0.1.43'}),check:async()=>({})},
  cdp:{getPreference:async()=>({enabled:false,active:false})},
  system:{isDefaultBrowser:async()=>false},
  independent:{request:async()=>({ok:false,error:{code:'controlled_fixture',message:'Controlled read-only fixture'}})}
};
localStorage.setItem(desktopLocaleStorageKey,'de');
function Harness(){const{locale,setLocale}=useDesktopI18n();useEffect(()=>{window.__settingsLocale=locale;window.__setSettingsLocale=setLocale;window.__settingsLabel=(key)=>createDesktopI18n(locale).t(key)},[locale,setLocale]);return <NativeSettingsMain serviceStatus={{sidekick:'ready',webuiHealth:'ready',webuiUrl:'http://127.0.0.1:9'}} activeContextItem="" onboardingStatus={null} onReopenSetup={()=>{}} searchEngineId="google" onSearchEngineChange={()=>{}} profiles={[]} activeProfileId="profile" activeSpacePath="C:/controlled" onSelectProfile={()=>{}} onCreateProfile={()=>{}} onRenameProfile={()=>{}} onDeleteProfile={()=>{}}/>}
const root=createRoot(document.getElementById('root'));root.render(<DesktopI18nProvider><Harness/></DesktopI18nProvider>);window.__unmount=()=>root.unmount();
`;

async function main() {
  const projectRoot = path.resolve(__dirname, '../../..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-settings-model-'));
  try {
    require('esbuild').buildSync({ stdin: { contents: fixture, loader: 'tsx', resolveDir: path.join(projectRoot, 'apps/desktop') }, bundle: true, platform: 'browser', format: 'iife', target: 'chrome130', loader: { '.woff2': 'dataurl' }, outfile: path.join(temp, 'fixture.js') });
    fs.writeFileSync(path.join(temp, 'index.html'), '<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:"><link rel="stylesheet" href="fixture.css"></head><body style="margin:0"><div id="root"></div><script src="fixture.js"></script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [__filename, '--child', temp], { cwd: projectRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (value) => stdout += value.toString());
    child.stderr.on('data', (value) => stderr += value.toString());
    const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
    assert.deepEqual(result, { code: 0, signal: null }, `Electron settings mount failed: ${stderr.slice(-4000)} ${stdout.slice(-1000)}`);
    process.stdout.write(stdout);
  } finally {
    const target = path.resolve(temp);
    assert(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('lastbrowser-settings-model-'));
    fs.rmSync(target, { recursive: true, force: true });
  }
}

async function child(temp) {
  const { app, BrowserWindow } = require('electron');
  app.setPath('userData', path.join(temp, 'user-data'));
  await app.whenReady();
  const win = new BrowserWindow({ show: true, width: 1034, height: 760, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  try {
    const rendererErrors = [];
    win.webContents.on('console-message', (event) => { if (event.level >= 2) rendererErrors.push(event.message); });
    await win.loadFile(path.join(temp, 'index.html'));
    const until = async (check, label) => {
      const end = Date.now() + 10000;
      while (Date.now() < end) { if (await win.webContents.executeJavaScript(check)) return; await new Promise((resolve) => setTimeout(resolve, 25)); }
      throw new Error(`Timeout: ${label}`);
    };
    const pressKey = async (keyCode) => {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
      if (keyCode === 'Enter') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
      await new Promise((resolve) => setTimeout(resolve, 35));
    };
    await until("window.__settingsLocale==='de'&&document.querySelector('.settings-section-nav .settings-section-button')", 'NativeSettingsMain mount');
    await until("document.querySelector('.settings-editor select option[value=\"model-b\"]')", 'controlled model catalog');
    const locales = ['en', 'de', 'it', 'es', 'fr', 'pt-BR', 'ru', 'ja'];
    const widths = [1034, 768];
    const results = [];
    for (const locale of locales) {
      await win.webContents.executeJavaScript(`window.__setSettingsLocale(${JSON.stringify(locale)})`);
      await until(`window.__settingsLocale===${JSON.stringify(locale)}`, `${locale} settings translations`);
      const providerLabel = await win.webContents.executeJavaScript("window.__settingsLabel('settings.sections.providers')");
      const conversationLabel = await win.webContents.executeJavaScript("window.__settingsLabel('settings.sections.conversation')");
      const defaultModelLabel = await win.webContents.executeJavaScript("window.__settingsLabel('settings.panels.conversation.defaultModel')");
      assert(providerLabel && !providerLabel.startsWith('settings.'), `${locale}: provider navigation label is translated`);
      for (const width of widths) {
        win.setContentSize(width, 760);
        await new Promise((resolve) => setTimeout(resolve, 80));
        await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('.settings-section-button')].find(x=>x.textContent.includes(${JSON.stringify(providerLabel)}));b?.focus()})()`);
        await until(`(()=>{const n=document.querySelector('.settings-section-nav'),b=[...n.querySelectorAll('.settings-section-button')].find(x=>x.textContent.includes(${JSON.stringify(providerLabel)}));if(!b)return false;const a=n.getBoundingClientRect(),r=b.getBoundingClientRect();return r.left>=a.left-1&&r.right<=a.right+1})()`, `${locale}/${width}: keyboard focus scrolls Providers into view`);
        await pressKey('Enter');
        await until(`document.querySelector('.settings-editor-head strong')?.textContent===${JSON.stringify(providerLabel)}`, `${locale}/${width}: keyboard opens Providers`);

        await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('.settings-section-button')].find(x=>x.textContent.includes(${JSON.stringify(conversationLabel)}));b?.focus()})()`);
        await pressKey('Enter');
        await until(`document.querySelector('.settings-editor-head strong')?.textContent===${JSON.stringify(conversationLabel)}`, `${locale}/${width}: keyboard returns to Conversation`);
        const modelRect = await win.webContents.executeJavaScript(`(()=>{const l=[...document.querySelectorAll('.settings-field')].find(x=>x.textContent.includes(${JSON.stringify(defaultModelLabel)})),s=l?.querySelector('select'),r=s?.getBoundingClientRect(),box=x=>{const q=x?.getBoundingClientRect();return q?{x:q.x,right:q.right,width:q.width}:null};return s&&r?{value:s.value,x:r.x,right:r.right,width:r.width,viewport:innerWidth,options:s.options.length,main:box(document.querySelector('.settings-main')),grid:box(document.querySelector('.settings-native-grid')),nav:box(document.querySelector('.settings-section-nav')),editor:box(document.querySelector('.settings-editor')),stack:box(document.querySelector('.settings-panel-stack')),field:box(l)}:null})()`);
        assert(modelRect && ['model-a', 'model-b'].includes(modelRect.value) && modelRect.options >= 2, `${locale}/${width}: default model selection is mounted: ${JSON.stringify(modelRect)}`);
        assert(modelRect.x >= 0 && modelRect.right <= width + 1, `${locale}/${width}: model selector fits the viewport: ${JSON.stringify(modelRect)}`);
        await win.webContents.executeJavaScript(`(()=>{const l=[...document.querySelectorAll('.settings-field')].find(x=>x.textContent.includes(${JSON.stringify(defaultModelLabel)}));l?.querySelector('select')?.focus()})()`);
        const expectedModel = modelRect.value === 'model-a' ? 'model-b' : 'model-a';
        await pressKey(modelRect.value === 'model-a' ? 'DOWN' : 'UP');
        await pressKey('Enter');
        const keyboardSelection = await win.webContents.executeJavaScript(`(()=>{const l=[...document.querySelectorAll('.settings-field')].find(x=>x.textContent.includes(${JSON.stringify(defaultModelLabel)})),s=l?.querySelector('select');return{value:s?.value,selectedIndex:s?.selectedIndex,activeElement:document.activeElement?.outerHTML?.slice(0,220),options:s?[...s.options].map(option=>({value:option.value,selected:option.selected})):[]}})()`);
        assert.equal(keyboardSelection.value, expectedModel, `${locale}/${width}: keyboard changes model selection: ${JSON.stringify(keyboardSelection)}`);
        results.push({ locale, width, providerLabel, modelRect, keyboardModel: keyboardSelection.value });
      }
    }
    process.stdout.write(JSON.stringify({ phase: 'settings-model-navigation-smoke:desktop-cases-passed', locales: locales.length, widths, cases: results.length, keyboardCatalogSelection: true }) + '\n');
    win.setContentSize(320, 760);
    await win.webContents.executeJavaScript("window.__setSettingsLocale('en')");
    await until("window.__settingsLocale==='en'", 'English 320px layout probe');
    await new Promise((resolve) => setTimeout(resolve, 100));
    const narrowLayout = await win.webContents.executeJavaScript(`(()=>{const l=[...document.querySelectorAll('.settings-field')].find(x=>x.textContent.includes(window.__settingsLabel('settings.panels.conversation.defaultModel'))),s=l?.querySelector('select'),rect=x=>{const r=x?.getBoundingClientRect();return r?{x:r.x,right:r.right,width:r.width}:null};return{viewport:innerWidth,grid:getComputedStyle(document.querySelector('.settings-native-grid')).gridTemplateColumns,nav:rect(document.querySelector('.settings-section-nav')),editor:rect(document.querySelector('.settings-editor')),stack:rect(document.querySelector('.settings-panel-stack')),model:rect(s)}})()`);
    process.stdout.write(JSON.stringify({ phase: 'settings-model-navigation-smoke:narrow-layout-probe', narrowLayout }) + '\n');
    assert(narrowLayout.editor?.width > 100 && narrowLayout.model?.x >= 0 && narrowLayout.model.right <= 321, `320px settings model UI must remain visible: ${JSON.stringify(narrowLayout)}`);
    await win.webContents.executeJavaScript('window.__unmount()');
    assert.deepEqual(rendererErrors, [], 'No renderer errors');
    process.stdout.write(JSON.stringify({ phase: 'settings-model-navigation-smoke:passed', locales, widths, cases: results.length, results, rendererErrors }) + '\n');
    await app.exit(0);
  } catch (error) { console.error(error); await app.exit(1); }
  finally { if (!win.isDestroyed()) win.destroy(); }
}

if (process.argv[2] === '--child') void child(process.argv[3]);
else void main().catch((error) => { console.error(error); process.exitCode = 1; });
