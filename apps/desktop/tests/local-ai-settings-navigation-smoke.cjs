const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');

const fixture=String.raw`
import React from 'react';
import {createRoot} from 'react-dom/client';
import './src/renderer/styles.css';
import {NativeSettingsMain} from './src/renderer/panels/SystemPanels';
import {DesktopI18nProvider} from './src/renderer/i18n';
const scopes={A:{backendProfileId:'11111111-1111-4111-8111-111111111111',spaceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',browserProfileId:'default'},B:{backendProfileId:'11111111-1111-4111-8111-111111111111',spaceId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',browserProfileId:'default'}};
const calls=[];
const store={catalogRevision:'controlled-catalog',models:[],hardware:null,jobs:[],history:[],
  entitlement:{largeModelsAllowed:false,status:'fixture',threshold:0},
  suite:{version:'fixture',sha256:'b'.repeat(64),cases:16,quickCases:6,standardRepeats:3}};
window.lastbrowser={independent:{request:async request=>{
  calls.push(request);
  if(request.operation==='resolveScope'){
    const key=request.payload.workspacePath?.endsWith('/B')?'B':'A';
    return {ok:true,value:{schemaVersion:1,scope:scopes[key],spaceName:'Space '+key,
      workspacePath:request.payload.workspacePath,bindingRevision:1,setupStatus:'confirmed',backendProfileName:'default'}};
  }
  if(request.operation==='localAi'&&request.payload.action==='store'){
    return {ok:true,value:{schemaVersion:1,scope:request.scope,kind:'model_store',
      operation:request.payload.request.operation,store,storeResult:null}};
  }
  return {ok:false,error:{schemaVersion:1,code:'controlled_fixture',message:'Not part of this navigation probe',retryable:false}};
}},
sidekick:{getSettings:async()=>({plugins:null,enabled_plugins:null,theme:'dark'}),getFallbackModel:async()=>({fallback_model:null}),saveSettings:async()=>({ok:true}),requestWebui:async({path})=>path==='/api/models'?{groups:[],models:[]}:path==='/api/auth/status'?{}:path==='/api/plugins'?{plugins:[]}:{}},
extensions:{list:async()=>[],presets:async()=>[],installCws:async()=>null,chooseDir:async()=>null,installUnpacked:async()=>null,toggle:async()=>({}),toggleIncognito:async()=>({}),remove:async()=>({})},
i18n:{setLocale:async()=>{}},updates:{status:async()=>({state:'idle',currentVersion:'controlled'}),onStatus:()=>()=>{}},cdp:{getPreference:async()=>({enabled:false,active:false})},system:{isDefaultBrowser:async()=>false}};
const base={serviceStatus:{sidekick:'ready',webuiHealth:'ready',webuiUrl:'http://controlled.invalid'},activeContextItem:'conversation',onboardingStatus:null,automaticProviderDiscovery:false,onReopenSetup:()=>{},searchEngineId:'google',onSearchEngineChange:()=>{},desktopSettings:{},profiles:[],activeProfileId:'default',activeBackendProfileName:'default',activeSpacePath:'C:/controlled/A',onSelectProfile:()=>{},onCreateProfile:()=>{},onRenameProfile:()=>{},onDeleteProfile:()=>{}};
const root=createRoot(document.getElementById('root'));
window.__settingsNav={calls,
  viewRequests(name){return calls.filter(call=>call.operation==='localAi'&&
    call.payload.action==='store'&&call.payload.request.operation==='view'&&call.scope.spaceId===scopes[name].spaceId).length;},
  switchSpace(name){root.render(<DesktopI18nProvider><NativeSettingsMain {...base} activeContextItem="providers" activeSpacePath={'C:/controlled/'+name}/></DesktopI18nProvider>);}};
root.render(<DesktopI18nProvider><NativeSettingsMain {...base}/></DesktopI18nProvider>);
`;

async function main(){
 const root=path.resolve(__dirname,'../../..');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lastbrowser-localai-settings-nav-'));
 try{
  const bundle=path.join(temp,'fixture.js');
  require('esbuild').buildSync({
   stdin:{contents:fixture,loader:'tsx',resolveDir:path.join(root,'apps/desktop')},
   bundle:true,platform:'browser',format:'iife',target:'chrome130',
   define:{'import.meta.url':JSON.stringify(pathToFileURL(bundle).href),'import.meta.env.VITE_ENABLE_AI_ORCHESTRATION':'false'},
   loader:{'.woff2':'dataurl','.woff':'dataurl','.ttf':'dataurl'},
   outfile:bundle
  });
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
  app.setPath('userData',path.join(temp,'user-data'));await app.whenReady();win=new BrowserWindow({show:false,width:1380,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}});const consoleErrors=[];
  win.webContents.on('console-message',event=>{
   if(event.level==='error'||event.level>=2)consoleErrors.push(event.message);
  });
  await win.loadFile(path.join(temp,'index.html'));
  const run=script=>win.webContents.executeJavaScript(script),until=async(script,label)=>{const end=Date.now()+8000;while(Date.now()<end){if(await run(script))return;await new Promise(r=>setTimeout(r,25));}throw Error('Timeout: '+label+'; '+JSON.stringify(await run("({head:document.querySelector('.settings-editor-head')?.innerText,alerts:[...document.querySelectorAll('[role=alert]')].map(x=>x.innerText),boundary:document.querySelector('[data-boundary-error]')?.innerText,body:document.body.innerText.slice(0,500)})"))+'; '+consoleErrors.join(' | '));};
  await until("!!document.querySelector('.settings-editor-head')",'Settings initial section');
  await run("[...document.querySelectorAll('.settings-section-nav button')].find(button=>button.innerText.includes('KI & lokale Modelle')).click()");
  await until("[...document.querySelectorAll('.provider-workspace-categories button')].some(button=>button.textContent==='Lokale KI')",'Local AI category becomes available');
  await run("[...document.querySelectorAll('.provider-workspace-categories button')].find(button=>button.textContent==='Lokale KI').click()");
  await until("!!document.querySelector('.local-ai-setup[data-local-ai-status=catalog] .local-model-catalog')",'Local AI navigation mounts the scoped model catalog');
  assert.equal(await run("document.querySelector('.settings-editor-head strong')?.textContent"),'KI & lokale Modelle');
  await until("window.__settingsNav.viewRequests('A')>=1",'Space A catalog requested');
  await run("window.__settingsNav.switchSpace('B')");
  await until("window.__settingsNav.viewRequests('B')>=1",'Space B catalog requested while Settings remains open');
  assert.equal(await run("window.__settingsNav.calls.filter(call=>call.operation==='resolveScope').every(call=>call.payload.browserProfileId==='default')"),true);
  await run("window.__settingsNav.switchSpace('A')");
  await until("window.__settingsNav.viewRequests('A')>=2",'Returning to A requests its own catalog again');
  win.setContentSize(320,900);await until('innerWidth===320','320px Settings viewport');
  const mobile=await run("(()=>{const nav=document.querySelector('.settings-section-nav'),last=nav?.lastElementChild,style=nav&&getComputedStyle(nav);if(nav)nav.scrollLeft=nav.scrollWidth;const rect=last?.getBoundingClientRect();return{display:style?.display,overflowX:style?.overflowX,clientWidth:nav?.clientWidth,scrollWidth:nav?.scrollWidth,navHeight:nav?.getBoundingClientRect().height,editorHeight:document.querySelector('.settings-editor')?.getBoundingClientRect().height,lastButtonRect:rect?{left:rect.left,right:rect.right}:null}})()");
  assert.equal(mobile.display,'flex',`Settings navigation should be horizontal at 320px: ${JSON.stringify(mobile)}`);
  assert(['auto','scroll'].includes(mobile.overflowX)&&mobile.scrollWidth>mobile.clientWidth,`All Settings sections should be reachable by horizontal scrolling: ${JSON.stringify(mobile)}`);
  assert(mobile.lastButtonRect?.left>=0&&mobile.lastButtonRect?.right<=320,`Last Settings section should be scrollable into view: ${JSON.stringify(mobile)}`);
  await run("document.querySelector('.settings-section-nav').lastElementChild.click()");
  await until("document.querySelector('.settings-editor-head strong')?.textContent==='System'",'Last Settings section remains reachable and selectable at 320px');
  process.stdout.write(JSON.stringify({phase:'local-ai-settings-navigation:passed',actualSettingsNavClick:true,scopedCatalogMounted:true,scopeSwitches:['A','B','A'],mobileNavigation:mobile,mobileLastSectionClickable:true,sourceMountedElectronDOM:true,controlledTransportOnly:true})+'\n');
  await app.exit(0);
 }catch(error){console.error(error);await app.exit(1);}finally{if(win&&!win.isDestroyed())win.destroy();}
}
if(process.argv[2]==='--child')void child(process.argv[3]);else void main().catch(error=>{console.error(error);process.exitCode=1;});
