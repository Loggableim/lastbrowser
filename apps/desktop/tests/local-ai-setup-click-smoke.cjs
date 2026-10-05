const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');

async function main(){
  const root=path.resolve(__dirname,'../../..');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lastbrowser-localai-click-'));
  try{
    const bundle=path.join(temp,'fixture.js');
    require('esbuild').buildSync({entryPoints:[path.join(__dirname,'local-ai-setup-click-fixture.tsx')],bundle:true,platform:'browser',format:'iife',target:'chrome130',outfile:bundle});
    fs.writeFileSync(path.join(temp,'index.html'),'<meta charset="utf-8"><div id="root"></div><script src="fixture.js"></script>');
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const child=spawn(require('electron'),[__filename,'--child',temp],{cwd:root,env,windowsHide:true,stdio:'inherit'});
    const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
    assert.deepEqual(result,{code:0,signal:null});
    process.stdout.write('Local AI: independent hardware inventory loaded while service readiness is false; DOM retry dispatched and rendered its decoded response.\n');
  }finally{
    const target=path.resolve(temp);
    assert(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('lastbrowser-localai-click-'));
    fs.rmSync(target,{recursive:true,force:true});
  }
}
async function child(temp){
  const {app,BrowserWindow}=require('electron');let window;
  try{
    await app.whenReady();window=new BrowserWindow({show:false,width:900,height:900,webPreferences:{contextIsolation:false,nodeIntegration:false}});
    await window.loadFile(path.join(temp,'index.html'));const run=script=>window.webContents.executeJavaScript(script);
    const until=Date.now()+5000;while(Date.now()<until&&!(await run("document.querySelector('.local-ai-step')?.textContent.includes('Controlled Test CPU')")))await new Promise(resolve=>setTimeout(resolve,20));
    assert(await run("document.querySelector('.local-ai-step')?.textContent.includes('Controlled Test CPU')"));
    assert(await run("document.querySelector('.local-ai-step')?.textContent.includes('12 GiB')&&document.querySelector('.local-ai-step')?.textContent.includes('100 GiB')"));
    assert(await run("document.querySelector('.local-ai-step')?.textContent.includes('Unknown')&&document.querySelector('.local-ai-step')?.textContent.includes('Controlled GPU')"));
    assert(await run("[...document.querySelectorAll('.local-ai-step')].find(step=>step.getAttribute('aria-labelledby')==='local-ai-step-setup')?.textContent.includes('Downloaded files alone do not make inference available')"));
    assert(await run("document.querySelector('.local-ai-bootstrap[data-global-router-status=true]')?.textContent.includes('App-wide optional router download')"));
    assert.equal(await run("localStorage.getItem('lastbrowser.localAiBootstrap.dismissed.v1')"),'1');
    assert.equal(await run("[...document.querySelectorAll('.local-ai-bootstrap[data-global-router-status=true] button')].some(button=>button.textContent==='Hide this setup')"),false);
    assert.equal(await run("window.__localAiSmoke.calls.filter(c=>c.operation==='localAiHardwareInventory').length"),1);
    assert.equal(await run("window.__localAiSmoke.calls[0].scope===undefined"),true);
    assert.equal(await run("!![...document.querySelectorAll('.local-ai-step button')].find(b=>b.textContent==='Scan hardware'&&!b.disabled)"),true);
    await run('window.__localAiSmoke.failNext()');
    await run("[...document.querySelectorAll('.local-ai-step button')].find(b=>b.textContent==='Scan hardware').click()");
    const retryUntil=Date.now()+3000;while(Date.now()<retryUntil&&!(await run("document.querySelector('.local-ai-step [role=alert]')?.textContent.includes('Controlled probe failure')")))await new Promise(resolve=>setTimeout(resolve,20));
    assert(await run("document.querySelector('.local-ai-step [role=alert]')?.textContent.includes('Controlled probe failure')"));
    assert(await run("[...document.querySelectorAll('.local-ai-step button')].some(b=>b.textContent==='Try hardware check again'&&!b.disabled)"));
    await run("[...document.querySelectorAll('.local-ai-step button')].find(b=>b.textContent==='Try hardware check again').click()");
    const completeUntil=Date.now()+3000;while(Date.now()<completeUntil&&!(await run("window.__localAiSmoke.calls.filter(c=>c.operation==='localAiHardwareInventory').length===3&&document.querySelector('.local-ai-step[aria-labelledby=local-ai-step-check] [role=alert]')===null")))await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(await run("window.__localAiSmoke.calls.filter(c=>c.operation==='localAiHardwareInventory').length"),3);
    assert.equal(await run("document.querySelector('.local-ai-step[aria-labelledby=local-ai-step-check] [role=alert]')===null"),true);
    await app.exit(0);
  }catch(error){console.error(error);await app.exit(1);}finally{if(window&&!window.isDestroyed())window.destroy();}
}
if(process.argv[2]==='--child')void child(process.argv[3]);else void main().catch(error=>{console.error(error);process.exitCode=1;});
