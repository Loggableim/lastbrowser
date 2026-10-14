const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const output=path.resolve(__dirname,'../../../output/workplace-onboarding-dom');
async function parent(){
  fs.mkdirSync(output,{recursive:true});
  require('esbuild').buildSync({entryPoints:[path.join(__dirname,'workplace-onboarding-fixture.tsx')],bundle:true,platform:'browser',format:'esm',target:'chrome130',loader:{'.woff2':'file','.woff':'file','.ttf':'file','.png':'file','.svg':'file'},outfile:path.join(output,'fixture.js')});
  fs.writeFileSync(path.join(output,'index.html'),'<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><style>html,body,#root{height:100%;margin:0}body{background:#09111f;color:#edf2ff}#root>.workplace-page{height:100%;box-sizing:border-box}</style></head><body><div id="root"></div><script type="module" src="fixture.js"></script></body></html>');
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const executable=process.platform==='win32'?path.join(path.dirname(require.resolve('electron')),'dist','electron.exe'):require('electron');
  const child=spawn(executable,[__filename,'--child'],{env,windowsHide:true,stdio:'inherit'});
  const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('Controlled DOM probe exceeded75seconds'));},75000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',value=>{clearTimeout(timer);resolve(value);});});assert.equal(code,0);
}
async function child(){
  const {app,BrowserWindow}=require('electron');let window;const checks=[];
  try{
    app.setPath('userData',path.join(output,'profile-'+Date.now()));await app.whenReady();
    window=new BrowserWindow({show:false,width:1280,height:720,webPreferences:{nodeIntegration:false,contextIsolation:false}});
    const run=script=>window.webContents.executeJavaScript(script);
    const wait=async script=>{const deadline=Date.now()+10000;while(Date.now()<deadline){if(await run('Boolean('+script+')'))return;await new Promise(resolve=>setTimeout(resolve,30));}throw new Error('DOM timeout: '+script);};
    const key=async keyCode=>{window.show();window.focus();window.webContents.focus();window.webContents.sendInputEvent({type:'keyDown',keyCode});if(keyCode==='Enter')window.webContents.sendInputEvent({type:'char',keyCode:'\r'});window.webContents.sendInputEvent({type:'keyUp',keyCode});await new Promise(resolve=>setTimeout(resolve,60));window.hide();};
    const click=label=>run(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(label)})?.click()`);
    const capture=async name=>{await new Promise(resolve=>setTimeout(resolve,80));fs.writeFileSync(path.join(output,name+'.png'),(await window.webContents.capturePage()).toPNG());};
    const input=(selector,value)=>run(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await window.loadFile(path.join(output,'index.html'));await wait("document.querySelector('[data-widget=notes]')");
    assert.equal(await run("document.querySelector('[data-widget=tasks]')===null"),true);
    await capture('home-initial-1280x720');
    await run("window.__dragData=new DataTransfer();document.querySelector('[data-widget=recent] .workplace-drag-handle').dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:window.__dragData}))");await wait("document.querySelector('.workplace-dock-layout.is-dragging')");
    await run("document.querySelector('[data-widget=speedDial]').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:window.__dragData}))");await wait("!document.querySelector('.workplace-dock-layout.is-dragging')");
    assert.equal(await run("[...document.querySelectorAll('[data-dock=main] [data-widget]')].findIndex(node=>node.dataset.widget==='recent') < [...document.querySelectorAll('[data-dock=main] [data-widget]')].findIndex(node=>node.dataset.widget==='speedDial')"),true);checks.push('actual DOM DataTransfer drop changes order');
    await run("document.querySelector('[data-widget=speedDial] summary').focus()");await key('Enter');await wait("document.querySelector('[data-widget=speedDial] details').open");
    await run("document.querySelector('[data-widget=speedDial] .workplace-move-buttons button').focus()");await key('Enter');await wait("[...document.querySelectorAll('[data-dock=main] [data-widget]')].findIndex(node=>node.dataset.widget==='speedDial') < [...document.querySelectorAll('[data-dock=main] [data-widget]')].findIndex(node=>node.dataset.widget==='recent')");checks.push('native keyboard opens tile controls and moves widget');
    await run("(()=>{const area=document.querySelector('[data-widget=notes] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(area,'Kept note');area.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await run("document.querySelector('[data-widget=notes] summary').focus()");await key('Enter');await wait("document.querySelector('[data-widget=notes] details').open");
    await run("document.querySelector('[data-widget=notes] select').focus()");await key('Down');
    await wait("document.querySelector('[data-widget=notes]').dataset.size==='medium'");
    await run("document.querySelectorAll('[data-widget=notes] select')[1].focus()");await key('End');
    await wait("document.querySelector('[data-dock=bottom] [data-widget=notes]')");
    assert.equal(await run("document.querySelector('[data-widget=notes] textarea').value"),'Kept note');
    assert.equal(await run("document.activeElement===document.querySelector('[data-widget=notes] summary')"),true);
    checks.push('resize/dock persisted; contents and keyboard focus retained');
    await run("window.__workplaceProbe.setScope('fixture','space-b')");await wait("document.querySelector('[data-widget=notes]').dataset.size==='compact'");assert.equal(await run("document.querySelector('[data-widget=notes] textarea').value"),'');
    await run("window.__workplaceProbe.setScope('fixture','space-a')");await wait("document.querySelector('[data-widget=notes]').dataset.size==='medium'");assert.equal(await run("document.querySelector('[data-widget=notes] textarea').value"),'Kept note');checks.push('Space isolation and persisted return');
    await run("window.__workplaceProbe.setScope('another-profile','space-a')");await wait("document.querySelector('[data-widget=notes]').dataset.size==='compact'");assert.equal(await run("document.querySelector('[data-widget=notes] textarea').value"),'');await run("window.__workplaceProbe.setScope('fixture','space-a')");await wait("document.querySelector('[data-widget=notes]').dataset.size==='medium'");checks.push('browser profile isolation');
    for(const width of [1280,900,640,360]){window.setContentSize(width,720);await new Promise(resolve=>setTimeout(resolve,100));assert.equal(await run('document.documentElement.scrollWidth<=window.innerWidth'),true);await capture('home-'+width);}
    checks.push('no horizontal overflow at1280/900/640/360');window.setContentSize(1280,720);
    await run("document.getElementById('root').style.width='600px'");await new Promise(resolve=>setTimeout(resolve,100));assert.equal(await run("document.querySelector('.workplace-page').scrollWidth<=600"),true);await capture('home-quickchat-width-600');await run("document.getElementById('root').style.width='100%'");checks.push('600px available content beside sidebar/Quickchat');
    await run("window.__workplaceProbe.show('wizard',false)");await wait("document.querySelector('.search-engine-setup')");await wait("![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Weiter').disabled");
    window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await new Promise(resolve=>setTimeout(resolve,100));assert.equal(await run('window.__workplaceProbe.state.completed.length'),0);assert.equal(await run("document.querySelector('.search-engine-setup')!==null"),true);
    await click('Weiter');await wait("document.querySelector('.setup-browser-import-section')");await click('Weiter');await wait("document.querySelector('.setup-pinned-grid')");await click('Weiter');await wait("document.querySelector('.first-run-ai-page')");
    await click('Nein, ohne KI fortfahren');await click('Weiter');await wait("document.querySelector('#first-run-space-name')");assert.equal(await run("document.querySelector('.personality-cards-grid')===null"),true);
    await input('#first-run-space-name','My Space');await click('Zurück');await wait("document.querySelector('.first-run-ai-page')");await click('Weiter');assert.equal(await run("document.querySelector('#first-run-space-name').value"),'My Space');
    await capture('onboarding-space-browser-only');await click('Einrichtung abschließen');await wait('window.__workplaceProbe.state.completed.length===1');assert.equal(await run('window.__workplaceProbe.state.completed[0]'),'My Space');checks.push('browser-only completion after all pages; preserved name; Escape cannot finish');
    await run("window.__workplaceProbe.show('wizard',true)");await wait("document.querySelector('.search-engine-setup')");await wait("![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Weiter').disabled");await click('Weiter');await wait("document.querySelector('.standalone-migration-card')");checks.push('migration page only when install detected');
    await click('Weiter');await wait("document.querySelector('.setup-browser-import-section')");await click('Weiter');await wait("document.querySelector('.setup-pinned-grid')");await click('Weiter');await wait("document.querySelector('.first-run-ai-page')");
    await click('Ja, KI einrichten');await click('Weiter');await wait("document.querySelector('.model-selection-area')");await wait("![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Weiter').disabled");
    assert.equal(await run('window.__workplaceProbe.state.submitted.length'),0);await click('Weiter');await wait("document.querySelectorAll('.personality-card').length===5");
    await input('#first-run-space-name','AI Space');await run("document.querySelectorAll('.personality-card')[3].click()");await capture('onboarding-space-personality');await click('Einrichtung abschließen');await wait('window.__workplaceProbe.state.submitted.length===1');
    assert.equal(await run('window.__workplaceProbe.state.submitted[0].firstSpaceName'),'AI Space');assert.equal(await run('window.__workplaceProbe.state.submitted[0].personality'),'creative');checks.push('AI provider before Space/personality; final scoped form only');
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,boundary:'Actual Electron DOM with synthetic bridge; no real imports/provider/signing/package acceptance',checks},null,2));console.log('PASS workplace/onboarding Electron DOM: '+checks.length+' groups');app.exit(0);
  }catch(error){fs.writeFileSync(path.join(output,'error.txt'),String(error.stack||error));console.error(error);app.exit(1);}
}
if(process.argv.includes('--child'))child();else parent().catch(error=>{console.error(error);process.exitCode=1;});
