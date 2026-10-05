#!/usr/bin/env node
// Controlled Electron DOM mount for Settings → Plugins. Uses a fresh temp userData directory and IPC fixtures.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const fixture = String.raw`
import React from 'react';
import { createRoot } from 'react-dom/client';
import { NativeSettingsMain } from './src/renderer/panels/SystemPanels';
import { DesktopI18nProvider } from './src/renderer/i18n';

let mode = 'null';
const validExtension = {id:'controlled-reader',name:'Controlled Reader',version:'1.0',enabled:false,allowInIncognito:false};
const validPreset = {id:'controlled-preset',name:'Controlled Preset',cwsId:'a'.repeat(32),author:'Fixture',category:'test',description:'Fixture',icon:'x'};
const result = (which) => mode === 'null' ? null : mode === 'valid'
  ? (which === 'list' ? [validExtension] : [validPreset])
  : ({unexpected:'shape'});
const pluginApi = {
  list: async () => result('list'), presets: async () => result('presets'),
  installCws: async () => validExtension, chooseDir: async () => null,
  installUnpacked: async () => validExtension, toggle: async () => ({}),
  toggleIncognito: async () => ({}), remove: async () => ({})
};
window.lastbrowser = {
  extensions: pluginApi,
  i18n: {setLocale: async () => {}},
  updates: {status: async () => ({state:'idle',currentVersion:'test'})},
  cdp: {getPreference: async () => ({enabled:false,active:false})},
  system: {isDefaultBrowser: async () => false},
  sidekick: {
    getSettings: async () => ({plugins:null,enabled_plugins:null,theme:'dark'}),
    getFallbackModel: async () => ({fallback_model:null}),
    saveSettings: async () => ({ok:true}),
    requestWebui: async ({path}) => {
      if (path === '/api/plugins') return mode === 'null' ? null : mode === 'valid'
        ? {plugins:[{id:'controlled-backend-plugin',name:'Controlled Backend Plugin',enabled:false,hooks:[]}]}
        : {plugins:null};
      if (path === '/api/models') return {groups:null,models:null};
      if (path === '/api/auth/status') return null;
      return {};
    }
  }
};

class Boundary extends React.Component {
  state = {error:null};
  static getDerivedStateFromError(error) { return {error}; }
  componentDidCatch(error, info) {
    window.__settingsProbe.boundary.push({message:String(error?.message||error),stack:error?.stack||'',componentStack:info?.componentStack||''});
  }
  render() { return this.state.error ? <pre data-boundary-error>{String(this.state.error?.message||this.state.error)}</pre> : this.props.children; }
}

const props = {
  serviceStatus:{sidekick:'ready',webuiHealth:'ready',webuiUrl:'http://controlled.invalid'},
  activeContextItem:'plugins', onboardingStatus:null, onReopenSetup:()=>{}, searchEngineId:'google',
  onSearchEngineChange:()=>{}, desktopSettings:{}, profiles:[], activeProfileId:'default',
  onSelectProfile:()=>{}, onCreateProfile:()=>{}, onRenameProfile:()=>{}, onDeleteProfile:()=>{}
};
const root = createRoot(document.getElementById('root'));
window.__settingsProbe = {boundary:[],mode:'null',remount(next) {
  mode = next; this.mode = next; this.boundary = [];
  root.render(<Boundary key={next}><DesktopI18nProvider><NativeSettingsMain key={next} {...props}/></DesktopI18nProvider></Boundary>);
}};
window.__settingsProbe.remount('null');
`;

async function main() {
  const root = path.resolve(__dirname, '../../..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-settings-plugins-'));
  try {
    require('esbuild').buildSync({ stdin:{contents:fixture,loader:'tsx',resolveDir:path.join(root,'apps/desktop')}, bundle:true, platform:'browser', format:'iife', target:'chrome130', loader:{'.woff2':'dataurl'}, outfile:path.join(temp,'fixture.js') });
    fs.writeFileSync(path.join(temp,'index.html'), '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:"><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
    const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
    const child=spawn(require('electron'),[__filename,'--child',temp],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr=''; child.stdout.on('data',v=>stdout+=v.toString()); child.stderr.on('data',v=>stderr+=v.toString());
    const timer=setTimeout(()=>child.kill(),45000);
    const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));}); clearTimeout(timer);
    assert.deepEqual(result,{code:0,signal:null},`Electron mount failed: ${stderr.slice(-5000)} ${stdout.slice(-1000)}`);
    process.stdout.write(stdout);
  } finally {
    const target=path.resolve(temp);
    assert(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('lastbrowser-settings-plugins-'));
    fs.rmSync(target,{recursive:true,force:true});
  }
}

async function child(temp) {
  const {app,BrowserWindow}=require('electron'); let win;
  try {
    app.setPath('userData',path.join(temp,'user-data')); await app.whenReady();
    win=new BrowserWindow({show:false,width:1380,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}});
    const consoleErrors=[];
    win.webContents.on('console-message',event=>{if(event.level>=2)consoleErrors.push(event.message);});
    await win.loadFile(path.join(temp,'index.html'));
    const run=script=>win.webContents.executeJavaScript(script);
    const until=async(script,label)=>{const end=Date.now()+8000;while(Date.now()<end){if(await run(script))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timeout: '+label+'; '+JSON.stringify(await run("({heading:document.querySelector('.settings-editor-head')?.innerText, boundary:document.querySelector('[data-boundary-error]')?.textContent, alerts:[...document.querySelectorAll('[role=alert]')].map(x=>x.innerText), panels:[...document.querySelectorAll('.settings-section-nav button')].map(x=>({text:x.innerText,active:x.className}))})")));};
    await until("!!document.querySelector('.settings-editor-head')?.innerText.includes('Extensions') || !!document.querySelector('.settings-editor-head')?.innerText.includes('Plugins')",'Settings Plugins section selected');
    for(const [mode,expectation] of [['null','empty'],['valid','valid'],['invalid','error']]){
      if(mode!=='null'){
        await run(`window.__settingsProbe.remount(${JSON.stringify(mode)})`);
        await until(`window.__settingsProbe.mode===${JSON.stringify(mode)}`,mode+' renderer mount');
      }
      if(expectation==='empty') await until("document.querySelector('.extension-empty-list')?.textContent.includes('No extensions installed yet.')",'null IPC fixture renders empty list');
      if(expectation==='valid') await until("document.querySelector('.extension-installed-card')?.textContent.includes('Controlled Reader')",'valid IPC fixture renders extension');
      if(expectation==='error') await until("document.querySelector('[role=alert]')?.textContent.includes('Invalid extensions response')",'invalid IPC fixture displays local error');
      const boundary=await run('window.__settingsProbe.boundary');
      assert.equal(boundary.length,0,`${mode} caused ErrorBoundary: ${JSON.stringify(boundary)}`);
    }
    const finalState=await run("({heading:document.querySelector('.settings-editor-head')?.innerText, boundary:window.__settingsProbe.boundary, enabledCard:document.querySelector('.extension-installed-card')?.className||null, alert:document.querySelector('[role=alert]')?.innerText||null})");
    assert(!consoleErrors.some(line=>/Cannot convert undefined or null to object/.test(line)),`Observed target TypeError: ${consoleErrors.join('\n')}`);
    process.stdout.write(JSON.stringify({phase:'settings-plugins-mounted-fixtures:passed',cases:['null','valid','invalid'],boundaryErrors:finalState.boundary,targetTypeErrorObserved:false,finalState})+'\n');
    await app.exit(0);
  } catch(error) { console.error(error); await app.exit(1); }
  finally { if(win&&!win.isDestroyed())win.destroy(); }
}

if(process.argv[2]==='--child') void child(process.argv[3]); else void main().catch(error=>{console.error(error);process.exitCode=1;});
