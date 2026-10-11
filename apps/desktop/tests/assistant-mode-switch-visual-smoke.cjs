#!/usr/bin/env node
// Mounted Electron consumer-path probe for Quickchat-only rendering and scope changes.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const fixture = String.raw`
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{ModernTitlebar}from'./src/renderer/components/HeaderComponents';
import{CopilotSplitView}from'./src/renderer/components/CopilotSplitView';
import{DesktopI18nProvider,useDesktopI18n}from'./src/renderer/i18n';
import{createQuickChatScopeKey,selectScopedQuickChatValue,toggleQuickChatFromToolbar}from'./src/renderer/quick-chat-view-state';
import'./src/renderer/styles.css';
window.lastbrowser={i18n:{setLocale:async()=>{}},downloads:{onChanged:()=>()=>{},list:async()=>[],clear:async()=>[],cancel:async()=>true},sidekick:{getMemory:async()=>({}),getSettings:async()=>({})}};
function Locale(){const{setLocale}=useDesktopI18n();window.__setLocale=setLocale;return null;}
function Harness(){
  const[copilotOpen,setCopilotOpen]=useState(true);const[quickChatMode,setQuickChatMode]=useState(false);
  const[spacePath,setSpacePath]=useState('C:/controlled/space-a');
  const[transcripts]=useState(()=>new Map([
    [createQuickChatScopeKey('profile-a','C:/controlled/space-a','backend-a'),[{role:'user',content:'Space A history'}]],
    [createQuickChatScopeKey('profile-a','C:/controlled/space-b','backend-a'),[{role:'user',content:'Space B history'}]]
  ]));
  const activeScopeKey=createQuickChatScopeKey('profile-a',spacePath,'backend-a');
  const messages=selectScopedQuickChatValue(transcripts.get(activeScopeKey),activeScopeKey,activeScopeKey,[]);
  const onToggle=()=>toggleQuickChatFromToolbar({copilotOpen,quickChatMode,setQuickChatMode,toggleCopilot:()=>setCopilotOpen(open=>!open)});
  return <DesktopI18nProvider><Locale/>
    <ModernTitlebar onGoBack={()=>{}} onGoForward={()=>{}} onReloadOrStop={()=>{}} sidebarMode="expanded" onToggleSidebar={()=>{}}
      onToggleFind={()=>{}} onToggleDownloads={()=>{}} onToggleExtensions={()=>{}} copilotOpen={copilotOpen} onToggleCopilot={onToggle}>
      <div className="controlled-browser-content">Controlled page</div>
    </ModernTitlebar>
    <main id="panel-root" style={{width:390,height:'70vh',display:'flex',overflow:'hidden'}}>
      {copilotOpen&&quickChatMode&&<CopilotSplitView isOpen onClose={()=>setCopilotOpen(false)} botName="Nova" modelName="Controlled model"
        browserProfileId="profile-a" workspacePath={spacePath} backendProfileName="backend-a" messages={messages} busy={false}
        allowWorkflows={false} onSendMessage={()=>{}} onStopChat={()=>{}} onNewChat={()=>{}} sessions={[]} onOpenSettings={()=>{}}/>}
    </main>
    <button id="change-space" style={{display:'none'}} onClick={()=>setSpacePath(current=>current.endsWith('space-a')?'C:/controlled/space-b':'C:/controlled/space-a')}/>
  </DesktopI18nProvider>
}
createRoot(document.getElementById('root')).render(<Harness/>);
`;

async function main(){
  const root=path.resolve(__dirname,'../../..');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lastbrowser-quickchat-only-'));
  try{
    require('esbuild').buildSync({stdin:{contents:fixture,loader:'tsx',resolveDir:path.join(root,'apps/desktop')},bundle:true,platform:'browser',format:'iife',target:'chrome130',loader:{'.woff2':'dataurl'},define:{'import.meta.env.VITE_ENABLE_AI_ORCHESTRATION':'false'},outfile:path.join(temp,'fixture.js')});
    fs.writeFileSync(path.join(temp,'index.html'),'<html><head><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"></head><body style="margin:0"><div id="root"></div><script src="fixture.js"></script></body></html>');
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const child=spawn(require('electron'),[__filename,'--child',temp],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let out='',err='';child.stdout.on('data',value=>out+=value);child.stderr.on('data',value=>err+=value);
    const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}))});
    assert.deepEqual(result,{code:0,signal:null},err+'\n'+out);process.stdout.write(out);
  }finally{
    const target=path.resolve(temp);
    assert(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('lastbrowser-quickchat-only-'));
    fs.rmSync(target,{recursive:true,force:true});
  }
}

async function child(temp){
  const{app,BrowserWindow}=require('electron');let win;
  try{
    app.setPath('userData',path.join(temp,'user-data'));await app.whenReady();
    win=new BrowserWindow({show:false,width:520,height:760,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
    win.webContents.on('console-message',event=>console.error(`renderer[${event.level}] ${event.sourceId}:${event.lineNumber} ${event.message}`));
    win.webContents.on('did-fail-load',(_event,code,description,url)=>console.error(`load[${code}] ${description} ${url}`));
    await win.loadFile(path.join(temp,'index.html'));
    const run=code=>win.webContents.executeJavaScript(code);
    const until=async(code,label)=>{const end=Date.now()+8000;while(Date.now()<end){if(await run(code))return;await new Promise(resolve=>setTimeout(resolve,30));}throw Error('timeout:'+label);};
    await until("typeof window.__setLocale==='function'&&document.querySelector('.copilot-toggle-btn')",'actual topbar Quickchat trigger');
    assert.equal(await run("document.querySelector('.copilot-split-panel')===null"),true);
    await run("document.querySelector('.copilot-toggle-btn').click()");
    await until("Boolean(document.querySelector('.copilot-split-panel'))",'first toolbar click opens Quickchat');
    assert.equal(await run("document.querySelector('.copilot-mode-switch')===null"),true);
    assert.equal(await run("document.querySelector('.copilot-split-panel').innerText.includes('Space Assistant')"),false);
    assert.equal(await run("document.querySelector('.copilot-messages-list').innerText.includes('Space A history')"),true);

    await run("window.__setLocale('de')");await until("document.documentElement.lang==='de'",'German Quickchat copy');
    assert.equal(await run("document.querySelector('.copilot-mode-switch')===null"),true);
    await run("window.__setLocale('ja')");await until("document.documentElement.lang==='ja'",'Japanese Quickchat copy');
    assert.equal(await run("document.querySelector('.copilot-mode-switch')===null"),true);

    await run("document.querySelector('.copilot-toggle-btn').click()");
    await until("document.querySelector('.copilot-split-panel')===null",'topbar closes Quickchat');
    await run("document.querySelector('.copilot-toggle-btn').click()");
    await until("Boolean(document.querySelector('.copilot-split-panel'))",'topbar reopens Quickchat');
    assert.equal(await run("document.querySelector('.copilot-messages-list').innerText.includes('Space A history')"),true);

    await run("document.querySelector('#change-space').click()");
    await until("document.querySelector('.copilot-split-panel').getAttribute('aria-label')==='Nova AI Workspace'",'space B Quickchat remains mounted');
    assert.equal(await run("document.querySelector('.copilot-messages-list').innerText.includes('Space B history')"),true);
    assert.equal(await run("document.querySelector('.copilot-messages-list').innerText.includes('Space A history')"),false);
    await run("document.querySelector('#change-space').click()");
    assert.equal(await run("document.querySelector('.copilot-messages-list').innerText.includes('Space A history')"),true);

    console.log(JSON.stringify({phase:'quickchat-only-visual-smoke:passed',consumer:'ModernTitlebar click -> App handler logic -> CopilotSplitView',
      noSpaceAssistantSwitch:true,legacyModeRecovered:true,topbarCloseReopenPreservedTranscript:true,spaceAAndSpaceBHistoriesIsolated:true,locales:['de','ja']}));
    await app.exit(0);
  }catch(error){console.error(error);await app.exit(1)}finally{if(win&&!win.isDestroyed())win.destroy();}
}

if(process.argv[2]==='--child')void child(process.argv[3]);else void main().catch(error=>{console.error(error);process.exitCode=1});
