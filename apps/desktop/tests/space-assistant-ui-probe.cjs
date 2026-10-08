// Source UI probe: real Electron/CSS, synthetic assistant data, disposable profile.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const out = path.join(root, 'output', 'space-assistant-ui-probe');
fs.mkdirSync(out, { recursive: true });
const renderer = path.join(root, 'apps/desktop/src/renderer').replaceAll('\\', '/');
require('esbuild').buildSync({ stdin: { contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import '${renderer}/styles.css';
import {DesktopI18nProvider} from '${renderer}/i18n.ts';
import {SpaceAssistantPanel} from '${renderer}/components/SpaceAssistantPanel.tsx';
import {useSpaceAssistantStore} from '${renderer}/stores/useSpaceAssistantStore.ts';
const scope={backendProfileId:'ui-probe',spaceId:'ui-space',browserProfileId:'ui-profile'};
const activity={schemaVersion:1,scope,observedAt:'2026-10-08T12:00:00Z',watermark:0,sourceState:'live',lastSuccessfulAt:null,runs:[],dispatches:[],activeChats:[],schedules:[],approvals:[]};
useSpaceAssistantStore.getState().acceptSnapshot(scope,{schemaVersion:1,scope,conversationId:'ui-conversation',revision:1,messages:[],interview:null,confirmedProfile:null,providerReady:true,provider:'fixture',model:'fixture',activity});
window.probeCalls=[];
const entries=Array.from({length:20},(_,i)=>({capabilityId:'provider:'+i,title:'Provider '+i,connectionKind:'provider',supportedTasks:['conversation'],status:i===0?'connected':i===1?'reauth_required':i===2?'configured':'not_configured',evidenceKind:'configuration',connections:[{connectionId:'connection:'+i,title:'Local fixture '+i,status:i===0?'connected':i===1?'reauth_required':i===2?'configured':'not_configured',revision:1,configurationStatus:i<3?'configured':'not_configured',authStatus:'unknown',healthStatus:'not_checked',installed:true,adapterAvailable:true,setupActions:[]}]}));
const controller={load:async()=>{},observe:()=>()=>{},permissions:async()=>({schemaVersion:1,scope,revision:1,allowedOrigins:[],allowWrite:false}),request:async request=>{window.probeCalls.push(request.operation);return {ok:true,value:request.operation==='capabilities'?{schemaVersion:1,scope,observedAt:activity.observedAt,entries,sourceState:'live'}:{schemaVersion:1,scope,revision:1,connectionBindings:[]}}},send:async()=>window.probeCalls.push('send')};
createRoot(document.getElementById('root')).render(<DesktopI18nProvider><SpaceAssistantPanel selection={{schemaVersion:1,scope,spaceName:'Research workspace',workspacePath:'E:/synthetic',bindingRevision:1,setupStatus:'legacy'}} controller={controller} onClose={()=>{}} onOpenWorkChat={()=>{}} onOpenGlobalOverview={()=>{}} onEnterSpace={()=>{}} onOpenProviderSettings={()=>{}} onSwitchToQuickChat={()=>{}} onSelectPageContext={async()=>[]}/></DesktopI18nProvider>);
`, loader:'tsx', resolveDir:root }, outfile:path.join(out,'ui.js'), bundle:true, platform:'browser', loader:{'.woff2':'file','.woff':'file','.ttf':'file','.svg':'file','.png':'file'}, define:{'process.env.NODE_ENV':'"production"'} });
fs.writeFileSync(path.join(out,'index.html'), '<!doctype html><link rel="stylesheet" href="ui.css"><style>body{margin:0}#root{height:100vh;display:flex;justify-content:flex-end;background:var(--lb-bg)}</style><div id="root"></div><script src="ui.js"></script>');
fs.writeFileSync(path.join(out,'main.cjs'), `
const {app,BrowserWindow}=require('electron');const fs=require('node:fs');const path=require('node:path');
app.setPath('userData',path.join(__dirname,'profile'));app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:720,height:850,webPreferences:{backgroundThrottling:false}});await w.loadFile(path.join(__dirname,'index.html'));w.webContents.setZoomFactor(1);await new Promise(r=>setTimeout(r,700));const result=await w.webContents.executeJavaScript('(()=>{const p=document.querySelector(".space-assistant"),s=getComputedStyle(p);return {background:s.backgroundColor,color:s.color,accent:s.getPropertyValue("--accent"),shellAccent:s.getPropertyValue("--lb-accent"),width:p.getBoundingClientRect().width,calls:window.probeCalls,bodyOverflow:document.body.scrollWidth>innerWidth}})()');fs.writeFileSync(path.join(__dirname,process.env.PROBE_STAGE+'.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(__dirname,process.env.PROBE_STAGE+'.png'),(await w.webContents.capturePage()).toPNG());
const checks=[];const check=(name,value)=>{if(!value)throw Error(name);checks.push(name)};const js=code=>w.webContents.executeJavaScript(code);const wait=()=>new Promise(r=>setTimeout(r,180));
if(process.env.PROBE_STAGE==='current'){
check('actual shell token binding',result.accent===result.shellAccent&&result.background!=='rgba(0, 0, 0, 0)');check('no request or task on initial display',result.calls.length===0);
await js('document.querySelector("#space-assistant-composer").focus();document.querySelector(".space-assistant-connections > summary").click()');await wait();
check('read-only capability and binding requests on explicit discovery',await js('window.probeCalls.length===2&&window.probeCalls.includes("capabilities")&&window.probeCalls.includes("bindings")'));
check('connected provider appears first',await js('document.querySelector(".space-assistant-connection-summary strong").textContent==="Provider 0"'));
check('not configured providers require deliberate chooser selection',await js('document.querySelectorAll(".space-assistant-provider-picker option").length===18'));
check('setup remains collapsed and composer retains focus',await js('!document.querySelector(".space-assistant-setup").open&&document.activeElement.id==="space-assistant-composer"'));
fs.writeFileSync(path.join(__dirname,'connections.png'),(await w.webContents.capturePage()).toPNG());
await js('document.querySelector(".space-assistant-connections > summary").click()');await wait();check('problem count remains visible when disclosure closes',await js('!document.querySelector(".space-assistant-connections").open&&document.querySelector(".space-assistant-connection-warning").textContent==="1"'));
for(const width of [320,390]){w.setContentSize(width,850);await wait();check(width+'px without horizontal overflow',await js('document.body.scrollWidth<=innerWidth'));check(width+'px stable composer',await js('document.querySelector(".space-assistant-composer").getBoundingClientRect().bottom<=innerHeight'));fs.writeFileSync(path.join(__dirname,width+'px.png'),(await w.webContents.capturePage()).toPNG());}
w.setContentSize(780,1100);w.webContents.setZoomFactor(2);await wait();check('actual 200% zoom',w.webContents.getZoomFactor()===2);check('200% reflow without horizontal overflow',await js('document.body.scrollWidth<=innerWidth'));fs.writeFileSync(path.join(__dirname,'200pct.png'),(await w.webContents.capturePage()).toPNG());
w.showInactive();w.focus();await wait();await js('document.querySelector(".space-assistant-connections > summary").focus()');w.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});w.webContents.sendInputEvent({type:'char',keyCode:String.fromCharCode(13)});w.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await wait();check('disclosure opens with native keyboard',await js('document.querySelector(".space-assistant-connections").open'));
fs.writeFileSync(path.join(__dirname,'acceptance.json'),JSON.stringify({status:'PASS',scope:'actual Electron DOM/CSS with synthetic data; not package/Guest/provider use',checks},null,2));}
w.destroy();app.exit(0)}).catch(e=>{fs.writeFileSync(path.join(__dirname,'error.txt'),String(e));console.error(e);app.exit(1)});
`);
const executable = path.join(path.dirname(require.resolve('electron')), 'dist', 'electron.exe');
const electronEnv = { ...process.env, PROBE_STAGE: process.argv[2] || 'current' }; delete electronEnv.ELECTRON_RUN_AS_NODE;
const result = spawnSync(executable, [path.join(out,'main.cjs'),'--user-data-dir='+path.join(out,'profile'),'--disk-cache-dir='+path.join(out,'cache'),'--disable-crash-reporter'],{env:electronEnv,encoding:'utf8',timeout:30000});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.status!==0)process.exit(result.status||1);
