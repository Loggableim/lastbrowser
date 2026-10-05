#!/usr/bin/env node
// Real Electron mount of ChatComposer at constrained widths and all shipped locales.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');

const fixture = String.raw`
import React, {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './src/renderer/styles.css';
import {ChatComposer} from './src/renderer/panels/ChatComponents';
import {DesktopI18nProvider,useDesktopI18n,desktopLocaleStorageKey} from './src/renderer/i18n';

const expected={en:'More',de:'Weitere',it:'Altri',es:'Más',fr:'Plus','pt-BR':'Mais',ru:'Ещё',ja:'さらに'};
const longModel='gpt-6-astra-2026-context-very-long-model-name-release-candidate-0123456789';
const options=[{provider:'Long Provider Display Name',providerId:'controlled:provider',configured:true,models:[
  {id:'literal-model-very-long-identifier-0123456789',label:'A Long Display Name for the Controlled Model with Extra Descriptive Text'},
  ...Array.from({length:11},(_,index)=>({id:'catalog-model-'+String(index+2).padStart(2,'0'),label:'Catalog Model '+String(index+2).padStart(2,'0')}))
]}, {provider:'Teamwork',providerId:'',configured:true,models:[{id:'teamwork',label:'Teamwork'}]}];
window.lastbrowser={i18n:{setLocale:async()=>{}}};
localStorage.setItem(desktopLocaleStorageKey,'de');
function Harness(){
  const {locale,setLocale}=useDesktopI18n();
  const [model,setModel]=useState(longModel);
  const [auto,setAuto]=useState(false);
  useEffect(()=>{window.__composerLocale=locale;window.__setComposerLocale=setLocale;window.__composerSelectedModel=model;},[locale,setLocale,model]);
  const selectModel=selection=>{if(selection==='__lastbrowser_auto_policy__'){setAuto(true);window.__autoActivated=(window.__autoActivated||0)+1;}else{setAuto(false);setModel(selection);}};
  return <div className="native-chat-main" style={{width:'100%',minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',padding:'24px 0'}}>
    <ChatComposer automaticPolicy={{active:auto,available:true}} busy={false} mode="action" model={model} modelProvider="controlled:provider"
      modelOptions={options} modelCatalogError onRetryModelCatalog={()=>{window.__retryCount=(window.__retryCount||0)+1;}}
      reasoningEffort="" reasoningEfforts={[]} reasoningCapabilityState="unknown" profile="A very long backend profile title for layout testing"
      ready runState="idle" text="" workspace="C:/workspace/very-long-workspace-name" onMode={()=>{}}
      onModelChange={selectModel} onReasoningEffort={()=>{}} onSend={()=>{}} onStop={()=>{}} onText={()=>{}} />
    <div className="chat-status-message" role="alert" data-detached-model-notice>Detached duplicate notice</div>
  </div>;
}
const root=createRoot(document.getElementById('root'));
root.render(<DesktopI18nProvider><Harness/></DesktopI18nProvider>);
`;

async function main() {
  const projectRoot=path.resolve(__dirname,'../../..');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lastbrowser-chat-composer-'));
  const artifactDir=path.join(projectRoot,'output','chat-composer-visual-smoke');
  fs.mkdirSync(artifactDir,{recursive:true});
  try {
    require('esbuild').buildSync({stdin:{contents:fixture,loader:'tsx',resolveDir:path.join(projectRoot,'apps/desktop')},bundle:true,platform:'browser',format:'iife',target:'chrome130',loader:{'.woff2':'dataurl'},outfile:path.join(temp,'fixture.js')});
    fs.writeFileSync(path.join(temp,'index.html'),'<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:"><link rel="stylesheet" href="fixture.css"></head><body style="margin:0"><div id="root"></div><script src="fixture.js"></script></body></html>');
    const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
    const child=spawn(require('electron'),[__filename,'--child',temp],{cwd:projectRoot,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr=''; child.stdout.on('data',value=>stdout+=value.toString()); child.stderr.on('data',value=>stderr+=value.toString());
    const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
    assert.deepEqual(result,{code:0,signal:null},`Electron mount failed: ${stderr.slice(-4000)} ${stdout.slice(-1000)}`);
    process.stdout.write(stdout);
  } finally {
    const target=path.resolve(temp);
    assert(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('lastbrowser-chat-composer-'));
    fs.rmSync(target,{recursive:true,force:true});
  }
}

async function child(temp) {
  const {app,BrowserWindow}=require('electron'); let win;
  const artifactDir=path.join(path.resolve(__dirname,'../../..'),'output','chat-composer-visual-smoke');
  const runId=randomUUID();
  const consoleErrors=[];
  let lastEvaluation='';
  try {
    app.setPath('userData',path.join(temp,'user-data')); await app.whenReady();
    win=new BrowserWindow({show:true,width:1034,height:526,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
    win.webContents.on('console-message',event=>{if(event.level>=2)consoleErrors.push(event.message);});
    const executeJavaScript=win.webContents.executeJavaScript.bind(win.webContents);
    win.webContents.executeJavaScript=(code,...args)=>{lastEvaluation=String(code);return executeJavaScript(code,...args);};
    await win.loadFile(path.join(temp,'index.html'));
    const until=async(check,label)=>{const end=Date.now()+8000;while(Date.now()<end){if(await win.webContents.executeJavaScript(check))return;await new Promise(resolve=>setTimeout(resolve,30));}throw Error('Timeout: '+label);};
    await until("window.__composerLocale==='de'&&!!document.querySelector('.chat-composer .composer-model-trigger')",'initial composer mount');
    const defaultChips=await win.webContents.executeJavaScript("[...document.querySelector('.composer-chips').children].map(x=>x.textContent)");
    assert(!defaultChips.includes('Aktion')&&!defaultChips.includes('Plan')&&!defaultChips.some(value=>value.includes('gpt-6-astra')),'Mode and selected model are not duplicated as passive default chips');
    const preservedModes=await win.webContents.executeJavaScript("({options:[...document.querySelector('.composer-current-model select').options].map(option=>option.value),autoVisible:!![...document.querySelector('.composer-current-model select').options].find(option=>option.value==='__lastbrowser_auto_policy__'),autoChip:!!document.querySelector('.auto-policy-chip')})");
    assert(preservedModes.options.includes('teamwork')&&preservedModes.options.includes('__lastbrowser_auto_policy__')&&preservedModes.autoVisible&&!preservedModes.autoChip,'AUTO selection and Teamwork remain available without a duplicate policy chip');
    const locales=['en','de','it','es','fr','pt-BR','ru','ja'];
    const widths=[1034,768,390,320];
    const results=[]; const screenshots=[];
    for(const locale of locales){
      await win.webContents.executeJavaScript(`window.__setComposerLocale(${JSON.stringify(locale)})`);
      await until(`window.__composerLocale===${JSON.stringify(locale)}`,locale+' translation');
      const label=await win.webContents.executeJavaScript("({short:document.querySelector('.composer-model-trigger span')?.textContent,aria:document.querySelector('.composer-model-trigger')?.getAttribute('aria-label'),fullTitle:document.querySelector('.composer-model-trigger')?.title})");
      assert.equal(label.short,({en:'More',de:'Weitere',it:'Altri',es:'Más',fr:'Plus','pt-BR':'Mais',ru:'Ещё',ja:'さらに'})[locale],`short trigger translation: ${locale}`);
      assert(label.aria&&label.aria.length>label.short.length,'Full accessible model-picker label is retained');
      for(const width of widths){
        win.setContentSize(width,526); await new Promise(resolve=>setTimeout(resolve,120));
        const geometry=await win.webContents.executeJavaScript(`(()=>{const form=document.querySelector('.chat-composer'),toolbar=form.querySelector('.composer-toolbar'),groups=[...toolbar.querySelectorAll(':scope > .composer-toolbar-group')],trigger=form.querySelector('.composer-model-trigger'),model=form.querySelector('.composer-current-model select'),reasoningDisclosure=form.querySelector('.composer-reasoning-disclosure'),reasoning=reasoningDisclosure.querySelector('summary'),notice=form.querySelector('.composer-model-notice'),detached=document.querySelector('[data-detached-model-notice]');const rect=x=>{const r=x.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};return{viewport:{width:innerWidth,height:innerHeight},form:rect(form),toolbar:rect(toolbar),groups:groups.map(rect),trigger:rect(trigger),model:rect(model),reasoning:rect(reasoning),reasoningTitle:reasoning.title,reasoningOpen:reasoningDisclosure.open,reasoningSelectVisible:!!reasoningDisclosure.querySelector('select').getClientRects().length,notice:rect(notice),noticeDisplay:getComputedStyle(notice).display,detachedDisplay:getComputedStyle(detached).display,overflowX:form.scrollWidth-form.clientWidth,modelTitle:model.title,focusBefore:document.activeElement?.tagName}})()`);
        assert(geometry.form.x>=0&&geometry.form.right<=width+1,`${locale}/${width}: composer clipped horizontally ${JSON.stringify(geometry)}`);
        assert(geometry.form.y>=0&&geometry.form.bottom<=geometry.viewport.height+1,`${locale}/${width}: composer clipped vertically ${JSON.stringify(geometry)}`);
        assert(geometry.overflowX<=1,`${locale}/${width}: composer horizontal overflow ${JSON.stringify(geometry)}`);
        assert(geometry.trigger.height<=40,`${locale}/${width}: model picker label wrapped tall ${JSON.stringify(geometry.trigger)}`);
        assert(geometry.trigger.width<=220,`${locale}/${width}: manual model action should stay compact ${JSON.stringify(geometry.trigger)}`);
        assert(geometry.trigger.x>=geometry.form.x&&geometry.trigger.right<=geometry.form.right+1,`${locale}/${width}: model trigger escapes composer`);
        assert(geometry.model.x>=geometry.form.x&&geometry.model.right<=geometry.form.right+1,`${locale}/${width}: current model select escapes composer`);
        assert(geometry.reasoning.x>=geometry.form.x&&geometry.reasoning.right<=geometry.form.right+1,`${locale}/${width}: reasoning disclosure escapes composer`);
        assert(geometry.reasoningTitle.length>10,`${locale}/${width}: reasoning help remains available as a tooltip`);
        assert.equal(geometry.reasoningOpen,false,`${locale}/${width}: advanced reasoning control is collapsed by default`);
        assert.equal(geometry.reasoningSelectVisible,false,`${locale}/${width}: reasoning selector stays out of the default control row`);
        assert(geometry.notice&&geometry.notice.x>=geometry.form.x&&geometry.notice.right<=geometry.form.right+1,`${locale}/${width}: model notice not inline`);
        assert.notEqual(geometry.noticeDisplay,'none',`${locale}/${width}: inline model notice is hidden`);
        assert.equal(geometry.detachedDisplay,'none','Detached model notice should not remain visible');
        assert(geometry.modelTitle.includes('gpt-6-astra-2026-context-very-long-model-name'), 'Long selected model is available in title tooltip');
        const controls=[geometry.model,geometry.trigger,geometry.reasoning];
        for(let index=0;index<controls.length;index++)for(let next=index+1;next<controls.length;next++){
          const a=controls[index],b=controls[next];
          assert(!(a.y<b.bottom-1&&b.y<a.bottom-1&&a.x<b.right-1&&b.x<a.right-1),`${locale}/${width}: model controls overlap`);
        }
        for(let index=0;index<geometry.groups.length;index++)for(let next=index+1;next<geometry.groups.length;next++){
          const a=geometry.groups[index],b=geometry.groups[next];
          assert(!(a.y<b.bottom-2&&b.y<a.bottom-2&&a.x<b.right-2&&b.x<a.right-2),`${locale}/${width}: toolbar groups overlap`);
        }
        results.push({locale,width,geometry});
        if((locale==='de'&&widths.includes(width))||(locale==='ja'&&[1034,390,320].includes(width))){
          const file=path.join(artifactDir,`composer-${locale}-${width}-${runId.slice(0,8)}.png`);
          const image=await win.webContents.capturePage(); fs.writeFileSync(file,image.toPNG()); screenshots.push(file);
        }
      }
    }
    await win.webContents.executeJavaScript("document.querySelector('.composer-model-trigger').focus()");
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'char',keyCode:'\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
    await until("!!document.querySelector('#composer-manual-models input[type=search]')",'manual model picker opens');
    await until("document.activeElement===document.querySelector('#composer-manual-models input[type=search]')",'manual model picker search focus');
    const menu=await win.webContents.executeJavaScript("(()=>{const b=[...document.querySelectorAll('#composer-manual-models fieldset button')].find(x=>x.textContent.includes('A Long Display Name'));return b&&{viewport:innerWidth,title:b.title,name:b.querySelector('.composer-manual-model-name')?.textContent,small:b.querySelector('small')?.textContent,rect:(()=>{const r=b.getBoundingClientRect();return{x:r.x,right:r.right,width:r.width}})()}})()");
    const manualOptionCount=await win.webContents.executeJavaScript("document.querySelectorAll('#composer-manual-models fieldset button').length");
    assert.equal(manualOptionCount,12,'Complete controlled model catalog appears only after opening the manual picker');
    assert(menu&&menu.title.includes('literal-model-very-long-identifier'),'Long model has full title tooltip');
    assert(menu.rect.x>=0&&menu.rect.right<=menu.viewport+1,'Long manual model option fits viewport');
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
    await until("document.activeElement===document.querySelector('.composer-model-trigger')&&!document.querySelector('#composer-manual-models')",'Escape closes picker and restores focus');
    await win.webContents.executeJavaScript("document.querySelector('.composer-model-trigger').click()");
    await until("document.querySelectorAll('#composer-manual-models fieldset button').length===12",'manual model list opens with all 12 entries');
    await win.webContents.executeJavaScript("[...document.querySelectorAll('#composer-manual-models fieldset button')].find(button=>button.textContent.includes('A Long Display Name')).click()");
    await until("window.__composerSelectedModel==='@controlled:provider:literal-model-very-long-identifier-0123456789'&&!document.querySelector('#composer-manual-models')",'manual model choice applies and closes picker');
    await win.webContents.executeJavaScript("(()=>{const select=document.querySelector('.composer-current-model select');select.value='__lastbrowser_auto_policy__';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await until("window.__autoActivated===1&&document.querySelector('.composer-current-model select').value==='__lastbrowser_auto_policy__'",'AUTO choice activates in the compact model selector');
    await win.webContents.executeJavaScript("(()=>{const select=document.querySelector('.composer-current-model select');select.value='teamwork';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await until("window.__composerSelectedModel==='teamwork'",'Teamwork selection remains actionable');
    await win.webContents.executeJavaScript("document.querySelector('[data-testid=composer-reasoning-toggle]').click()");
    await until("document.querySelector('.composer-reasoning-disclosure').open",'reasoning disclosure opens on explicit activation');
    const reasoningState=await win.webContents.executeJavaScript("(()=>{const select=document.querySelector('.composer-reasoning-effort select');return{disabled:select.disabled,title:document.querySelector('[data-testid=composer-reasoning-toggle]').title}})()");
    assert.equal(reasoningState.disabled,true,'Unknown reasoning support stays disabled without fabricating capabilities');
    assert(reasoningState.title.length>10,'Unsupported reasoning has a calm explanatory tooltip');
    await win.webContents.executeJavaScript("document.querySelector('.composer-model-notice button').click()");
    await until('window.__retryCount===1','real model catalog retry callback is invoked');
    assert.deepEqual(consoleErrors,[],'No renderer errors');
    process.stdout.write(JSON.stringify({phase:'chat-composer-visual-smoke:passed',locales,widths,measurements:results,screenshots,manualModel:menu,manualOptionCount,reasoningState,retryCallbackInvoked:true,preservedModes,autoActivation:true,teamworkSelection:true,keyboardFocusRestored:true,rendererErrors:consoleErrors})+'\n');
    await app.exit(0);
  } catch(error) { console.error(error, JSON.stringify(consoleErrors), lastEvaluation); await app.exit(1); }
  finally { if(win&&!win.isDestroyed())win.destroy(); }
}

if(process.argv[2]==='--child') void child(process.argv[3]); else void main().catch(error=>{console.error(error);process.exitCode=1;});
