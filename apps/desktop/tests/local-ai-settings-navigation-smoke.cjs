const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');

const fixture=String.raw`
import React from 'react';
import {createRoot} from 'react-dom/client';
import './src/renderer/styles.css';
import {NativeSettingsMain} from './src/renderer/panels/SystemPanels';
import {DesktopI18nProvider} from './src/renderer/i18n';
const at='2026-10-05T00:00:00.000Z';
const scopes={A:{backendProfileId:'11111111-1111-4111-8111-111111111111',spaceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',browserProfileId:'default'},B:{backendProfileId:'11111111-1111-4111-8111-111111111111',spaceId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',browserProfileId:'default'}};
const calls=[];
const inventory={schemaVersion:1,hardware:{schemaVersion:1,scanId:'controlled-settings-inventory',observedAt:at,os:'win32',arch:'x64',cpuName:'Controlled Test CPU',physicalCores:null,logicalCores:8,cpuFeatures:[],cpuFeaturesVerified:false,ramTotalBytes:{value:null,status:'unknown',source:'controlled',observedAt:at},ramAvailableBytes:{value:null,status:'unknown',source:'controlled',observedAt:at},diskFreeBytes:{value:null,status:'unknown',source:'controlled',observedAt:at},adapters:[]},gpuFeatureStatus:{cuda:'unknown'},probeIssues:[]};
const bootstrap={schemaVersion:1,installKey:'router-lfm2.5-230m-qad-q4_0-v1',revision:0,state:'idle',jobId:null,attempt:0,downloadedBytes:0,verifiedBytes:0,totalBytes:149091630,artifactId:'LiquidAI/LFM2.5-230M-GGUF:LFM2.5-230M-QAD-Q4_0',artifactRevision:'b27f8147d98080b0d6f063ff41de6e381ea9a530',sha256:'e75f83268de11b2a1bcfab5f3b5c5c0c97569ddbbc0990aad88437e45b8ba292',licenseLabel:'LFM Open License v1.0',licenseUrl:'https://huggingface.co/LiquidAI/LFM2.5-230M-GGUF/blob/b27f8147d98080b0d6f063ff41de6e381ea9a530/LICENSE',commercialThresholdUsd:10000000,executionUnavailable:true,errorCode:null,updatedAt:at};
window.lastbrowser={independent:{request:async request=>{calls.push(request);if(request.operation==='resolveScope'){const key=request.payload.workspacePath?.endsWith('/B')?'B':'A';return{ok:true,value:{schemaVersion:1,scope:scopes[key],spaceName:'Space '+key,workspacePath:request.payload.workspacePath,bindingRevision:1,setupStatus:'confirmed'}};}if(request.operation==='localAiHardwareInventory')return{ok:true,value:inventory};if(request.operation==='localAiBootstrap')return{ok:true,value:bootstrap};if(request.operation==='localAi'){const key=request.scope.spaceId===scopes.B.spaceId?'B':'A',common={schemaVersion:1,scope:request.scope,skipAvailable:true,existingProviderAvailable:true},action=request.payload.action;if(action==='catalog')return{ok:true,value:{...common,catalog:{revision:'controlled-catalog',observedAt:at,artifacts:[]}}};const op=request.payload.request.operation;if(op==='get')return{ok:true,value:{...common,operation:op,preferences:{schemaVersion:1,scope:request.scope,revision:1,decision:'skip',preset:null,artifactIds:[],updatedAt:at}}};if(op==='status')return{ok:true,value:{...common,operation:op,jobs:[]}};}return{ok:false,error:{schemaVersion:1,code:'controlled_fixture',message:'Not part of this navigation probe',retryable:false}};}},
sidekick:{getSettings:async()=>({plugins:null,enabled_plugins:null,theme:'dark'}),getFallbackModel:async()=>({fallback_model:null}),saveSettings:async()=>({ok:true}),requestWebui:async({path})=>path==='/api/models'?{groups:[],models:[]}:path==='/api/auth/status'?{}:path==='/api/plugins'?{plugins:[]}:{}},
extensions:{list:async()=>[],presets:async()=>[],installCws:async()=>null,chooseDir:async()=>null,installUnpacked:async()=>null,toggle:async()=>({}),toggleIncognito:async()=>({}),remove:async()=>({})},
i18n:{setLocale:async()=>{}},updates:{status:async()=>({state:'idle',currentVersion:'controlled'})},cdp:{getPreference:async()=>({enabled:false,active:false})},system:{isDefaultBrowser:async()=>false}};
const base={serviceStatus:{sidekick:'ready',webuiHealth:'ready',webuiUrl:'http://controlled.invalid'},activeContextItem:'conversation',onboardingStatus:null,onReopenSetup:()=>{},searchEngineId:'google',onSearchEngineChange:()=>{},desktopSettings:{},profiles:[],activeProfileId:'default',activeSpacePath:'C:/controlled/A',onSelectProfile:()=>{},onCreateProfile:()=>{},onRenameProfile:()=>{},onDeleteProfile:()=>{}};
const root=createRoot(document.getElementById('root'));
window.__settingsNav={calls,space:'A',switchSpace(name){this.space=name;root.render(<DesktopI18nProvider><NativeSettingsMain {...base} activeContextItem="providers" activeSpacePath={'C:/controlled/'+name}/></DesktopI18nProvider>);}};
root.render(<DesktopI18nProvider><NativeSettingsMain {...base}/></DesktopI18nProvider>);
`;

async function main(){
 const root=path.resolve(__dirname,'../../..');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lastbrowser-localai-settings-nav-'));
 try{
  require('esbuild').buildSync({stdin:{contents:fixture,loader:'tsx',resolveDir:path.join(root,'apps/desktop')},bundle:true,platform:'browser',format:'iife',target:'chrome130',loader:{'.woff2':'dataurl'},outfile:path.join(temp,'fixture.js')});
  fs.writeFileSync(path.join(temp,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>');
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(require('electron'),[__filename,'--child',temp],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);
  const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
  assert.deepEqual(result,{code:0,signal:null},`Electron Settings mount failed: ${err.slice(-4000)} ${out.slice(-1000)}`);process.stdout.write(out);
 }finally{const target=path.resolve(temp);assert(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('lastbrowser-localai-settings-nav-'));fs.rmSync(target,{recursive:true,force:true});}
}
async function child(temp){
 const {app,BrowserWindow}=require('electron');let win;
 try{
  app.setPath('userData',path.join(temp,'user-data'));await app.whenReady();win=new BrowserWindow({show:false,width:1380,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}});const consoleErrors=[];win.webContents.on('console-message',event=>{if(event.level>=2)consoleErrors.push(event.message);});await win.loadFile(path.join(temp,'index.html'));
  const run=script=>win.webContents.executeJavaScript(script),until=async(script,label)=>{const end=Date.now()+8000;while(Date.now()<end){if(await run(script))return;await new Promise(r=>setTimeout(r,25));}throw Error('Timeout: '+label+'; '+JSON.stringify(await run("({head:document.querySelector('.settings-editor-head')?.innerText,alerts:[...document.querySelectorAll('[role=alert]')].map(x=>x.innerText),boundary:document.querySelector('[data-boundary-error]')?.innerText,body:document.body.innerText.slice(0,500)})"))+'; '+consoleErrors.join(' | '));};
  await run("localStorage.setItem('lastbrowser.localAiBootstrap.dismissed.v1','1')");
  await until("!!document.querySelector('.settings-editor-head')",'Settings initial section');
  await run("[...document.querySelectorAll('.settings-section-nav button')].find(button=>button.innerText.includes('KI & lokale Modelle')).click()");
  await until("!!document.querySelector('.local-ai-setup')&&!!document.querySelector('.local-ai-bootstrap[data-global-router-status=true]')",'Providers navigation mounts scoped setup and app-wide router status');
  assert.equal(await run("document.querySelector('.settings-editor-head strong')?.textContent"),'KI & lokale Modelle');
  assert.equal(await run("localStorage.getItem('lastbrowser.localAiBootstrap.dismissed.v1')"),'1');
  assert.equal(await run("[...document.querySelectorAll('.local-ai-bootstrap[data-global-router-status=true] button')].some(button=>button.textContent==='Hide this setup'||button.textContent==='Einrichtung ausblenden')"),false);
  await until("window.__settingsNav.calls.some(call=>call.operation==='resolveScope'&&call.payload.workspacePath==='C:/controlled/A')",'Space A scope resolved');
  await run("window.__settingsNav.switchSpace('B')");
  await until("window.__settingsNav.calls.some(call=>call.operation==='resolveScope'&&call.payload.workspacePath==='C:/controlled/B')",'Space B scope resolved after Settings remains open');
  assert.equal(await run("window.__settingsNav.calls.filter(call=>call.operation==='resolveScope').every(call=>call.payload.browserProfileId==='default')"),true);
  await run("window.__settingsNav.switchSpace('A')");
  await until("window.__settingsNav.calls.filter(call=>call.operation==='resolveScope'&&call.payload.workspacePath==='C:/controlled/A').length>=2",'Returning to A resolves its own Space scope again');
  win.setContentSize(320,900);await until('innerWidth===320','320px Settings viewport');
  const mobile=await run("(()=>{const nav=document.querySelector('.settings-section-nav'),last=nav?.lastElementChild,style=nav&&getComputedStyle(nav);if(nav)nav.scrollLeft=nav.scrollWidth;const rect=last?.getBoundingClientRect();return{display:style?.display,overflowX:style?.overflowX,clientWidth:nav?.clientWidth,scrollWidth:nav?.scrollWidth,navHeight:nav?.getBoundingClientRect().height,editorHeight:document.querySelector('.settings-editor')?.getBoundingClientRect().height,lastButtonRect:rect?{left:rect.left,right:rect.right}:null}})()");
  assert.equal(mobile.display,'flex',`Settings navigation should be horizontal at 320px: ${JSON.stringify(mobile)}`);
  assert(['auto','scroll'].includes(mobile.overflowX)&&mobile.scrollWidth>mobile.clientWidth,`All Settings sections should be reachable by horizontal scrolling: ${JSON.stringify(mobile)}`);
  assert(mobile.lastButtonRect?.left>=0&&mobile.lastButtonRect?.right<=320,`Last Settings section should be scrollable into view: ${JSON.stringify(mobile)}`);
  await run("document.querySelector('.settings-section-nav').lastElementChild.click()");
  await until("document.querySelector('.settings-editor-head strong')?.textContent==='System'",'Last Settings section remains reachable and selectable at 320px');
  process.stdout.write(JSON.stringify({phase:'local-ai-settings-navigation:passed',actualSettingsNavClick:true,globalRouterVisibleDespiteFirstRunDismissal:true,hiddenActionAbsent:true,scopeSwitches:['A','B','A'],mobileNavigation:mobile,mobileLastSectionClickable:true,sourceMountedElectronDOM:true,controlledTransportOnly:true})+'\n');
  await app.exit(0);
 }catch(error){console.error(error);await app.exit(1);}finally{if(win&&!win.isDestroyed())win.destroy();}
}
if(process.argv[2]==='--child')void child(process.argv[3]);else void main().catch(error=>{console.error(error);process.exitCode=1;});
