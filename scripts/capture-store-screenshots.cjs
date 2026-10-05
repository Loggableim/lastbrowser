#!/usr/bin/env node
/**
 * User-requested Store screenshot test: real Lastbrowser Main/renderer/backend,
 * isolated profile, offline in-tree build, no generated UI or model transcripts.
 * node scripts/capture-store-screenshots.cjs [--probe] [--no-build]
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const reportLine = data => console.log('[store-capture] ' + JSON.stringify(data));
const childMode = process.argv.includes('--electron-child');

function writeGallery(out,result) {
  const items=result.captures.map(c=>({...c,file:c.file.replace('assets/store/screenshots/','')}));
  const data=JSON.stringify(items).replaceAll('<','\\u003c');
  const html=`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lastbrowser – echte Screenshots</title>
<style>body{margin:0;background:#081421;color:#e8eef7;font:16px system-ui,sans-serif}header{padding:30px;position:sticky;top:0;background:#081421ee;backdrop-filter:blur(12px);z-index:1}h1{margin:0 0 8px;font-size:28px}p{color:#aabace;margin:8px 0}select{background:#172b3d;color:white;border:1px solid #357084;border-radius:8px;padding:10px;margin:12px 12px 0 0}main{padding:0 30px 30px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,550px),1fr));gap:20px}figure{margin:0;background:#122234;border:1px solid #284254;border-radius:10px;overflow:hidden}img{display:block;width:100%;height:auto}figcaption{padding:12px}a{color:inherit;text-decoration:none}small{color:#9bb4c9}</style>
<header><h1>Lastbrowser – echte App-Aufnahmen</h1><p>${result.captures.length} Screenshots · ${result.locales.length} Sprachen · 1920 × 1080 Pixel</p><p>Vorläufiger Entwicklungsstand. Offene Übersetzungen sind an „Multiagent Umsetzung“ gemeldet; die Bilder werden vor der Store-Freigabe erneut abgeglichen.</p><select id="language" aria-label="Sprache"></select><select id="area" aria-label="Bereich"><option value="">Alle Bereiche</option></select><small id="count"></small></header><main id="shots"></main>
<script>const data=${data}; const names={en:'Englisch',de:'Deutsch',it:'Italienisch',es:'Spanisch',fr:'Französisch','pt-BR':'Portugiesisch (Brasilien)',ru:'Russisch',ja:'Japanisch'};const labels={browser:'Browser und Startseite','extension-hub':'Erweiterungen','skill-hub':'Skill-Hub',downloads:'Downloads',history:'Verlauf',permissions:'Berechtigungen','command-palette':'Befehlspalette',chat:'Nova-Chat',tasks:'Geplante Aufgaben',kanban:'Kanban',skills:'Agenten-Skills',agents:'Agenten',memory:'Gedächtnis',workspaces:'Arbeitsbereiche',profiles:'Profile',todos:'Aufgaben und Plan',insights:'Nutzung und Einblicke',logs:'Live-Logs',gmail:'Gmail',discord:'Discord',settings:'Einstellungen','settings-01':'Einstellungen: Unterhaltung','settings-02':'Einstellungen: Darstellung','settings-03':'Einstellungen: Präferenzen','settings-04':'Einstellungen: Anbieter','settings-05':'Einstellungen: Zusammenarbeit','settings-06':'Einstellungen: Plugins','settings-07':'Einstellungen: System',terminal:'Terminal'};const language=document.querySelector('#language'),area=document.querySelector('#area');for(const locale of [...new Set(data.map(c=>c.locale))])language.add(new Option(names[locale]||locale,locale));language.value='de';for(const id of [...new Set(data.map(c=>c.area))])area.add(new Option(labels[id]||id,id));function render(){const shots=data.filter(c=>c.locale===language.value&&(!area.value||c.area===area.value));document.querySelector('#count').textContent=shots.length+' Ansichten';const main=document.querySelector('#shots');main.replaceChildren();for(const c of shots){const card=document.createElement('figure'),link=document.createElement('a'),img=document.createElement('img'),caption=document.createElement('figcaption');link.href=c.file;link.target='_blank';img.src=c.file;img.alt=(labels[c.area]||c.area)+' – '+names[c.locale];img.loading='lazy';caption.textContent=labels[c.area]||c.area;link.append(img);card.append(link,caption);main.append(card)}}language.onchange=area.onchange=render;render();</script></html>`;
  fs.writeFileSync(path.join(out,'index.html'),html);
}

async function command(exe, args, cwd, env) {
  return await new Promise((resolve, reject) => {
    const task = spawn(exe, args, { cwd, env, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    let output = '';
    for (const pipe of [task.stdout, task.stderr]) pipe.on('data', bytes => { output += bytes; });
    task.on('error', reject);
    task.on('exit', code => code === 0 ? resolve(output) : reject(Error('Build failed ('+code+'): '+output.slice(-5500))));
  });
}
async function parent() {
  if(process.argv.includes('--gallery-only')){
    const out=path.join(root,'assets','store','screenshots');
    const report=JSON.parse(fs.readFileSync(path.join(out,'capture-report.json'),'utf8').replace(/^\uFEFF/,''));
    writeGallery(out,report);
    reportLine({phase:'gallery-ready',file:path.join(out,'index.html')});
    return;
  }
  const desktop = path.join(root, 'apps','desktop');
  const buildRoot = path.join(root, 'out','store-capture','current');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-store-capture-'));
  fs.mkdirSync(buildRoot, {recursive:true});
  fs.writeFileSync(path.join(buildRoot,'package.json'), JSON.stringify({type:'module'}));
  try {
    if (!process.argv.includes('--no-build')) {
      reportLine({phase:'build-start'});
      await command(process.execPath,[path.join(root,'node_modules','typescript','bin','tsc'),'-p',path.join(desktop,'tsconfig.main.json'),'--outDir',path.join(buildRoot,'main')],root,process.env);
      await require('esbuild').build({
        entryPoints:[path.join(desktop,'src','main','preload.ts')],
        outfile:path.join(buildRoot,'main','preload.cjs'),bundle:true,platform:'node',format:'cjs',target:'node20',external:['electron']
      });
      await command(process.execPath,[path.join(root,'node_modules','vite','bin','vite.js'),'build','--config',path.join(desktop,'vite.config.ts'),'--outDir',path.join(buildRoot,'renderer')],desktop,process.env);
      const i18nSource=path.join(desktop,'src','renderer','i18n.ts');
      const panelSource=path.join(desktop,'src','renderer','shell-state.ts');
      const catalogSource='import {desktopLocaleIds,desktopLocaleCatalogs} from '+JSON.stringify(i18nSource)+'; import {panelLabelTranslationKey,lastbrowserPanels} from '+JSON.stringify(panelSource)+'; export const data={locales:desktopLocaleIds,panels:lastbrowserPanels.map(p=>({id:p.id,key:panelLabelTranslationKey(p.id)})),catalogs:desktopLocaleCatalogs};';
      await require('esbuild').build({stdin:{contents:catalogSource,resolveDir:desktop,loader:'ts'},outfile:path.join(buildRoot,'catalog.cjs'),bundle:true,platform:'node',format:'cjs',external:['react']});
      reportLine({phase:'build-passed',isolatedOutput:buildRoot});
    }
    const env={...process.env};
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.LASTBROWSER_RENDERER_URL;
    for (const key of Object.keys(env)) if (/(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)$/i.test(key)) delete env[key];
    // Prevent account discovery through the globally configured GitHub CLI.
    env.GH_CONFIG_DIR=path.join(profile,'empty-gh-config');
    fs.mkdirSync(env.GH_CONFIG_DIR,{recursive:true});
    env.LASTBROWSER_WEBUI_PYTHON=path.join(desktop,'runtime','python','python.exe');
    env.LASTBROWSER_DOWNLOADS_DIR=path.join(profile,'downloads');
    env.LASTBROWSER_ENABLE_CDP='0';
    delete env.LASTBROWSER_CDP_PORT; delete env.CDP_PORT;
    const args=[__filename,'--electron-child',buildRoot,profile,...(process.argv.includes('--probe')?['--probe']:[])];
    const child=spawn(require('electron'),args,{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let remainder='';
    child.stdout.on('data',bytes=>{
      const lines=(remainder+bytes).split(/\r?\n/);remainder=lines.pop();
      for(const line of lines)if(line.startsWith('[store-capture] '))process.stdout.write(line+'\n');
    });
    const log=fs.createWriteStream(path.join(buildRoot,'app-run.log'));
    child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill();},20*60*1000);
    const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
    clearTimeout(timer);log.end();
    if(exit.code!==0)throw Error('Screenshot app stopped: '+JSON.stringify({...exit,timedOut})+'; inspect out/store-capture/current/app-run.log');
  } finally {
    const absoluteProfile=path.resolve(profile);
    const temporaryRoot=path.resolve(os.tmpdir())+path.sep;
    if(!absoluteProfile.startsWith(temporaryRoot)||!path.basename(absoluteProfile).startsWith('lastbrowser-store-capture-'))throw Error('Refusing profile cleanup outside the owned test path');
    // Windows may keep a service/database handle briefly after app shutdown.
    for(let attempt=0;attempt<8;attempt++){
      try{fs.rmSync(absoluteProfile,{recursive:true,force:true});break;}
      catch(error){if(attempt===7)reportLine({phase:'profile-cleanup-pending',path:absoluteProfile});else await sleep(400);}
    }
  }
}
async function electronChild() {
  const { app, BrowserWindow }=require('electron');
  const position=process.argv.indexOf('--electron-child');
  const buildRoot=process.argv[position+1],profile=process.argv[position+2];
  const catalogs=require(path.join(buildRoot,'catalog.cjs')).data;
  const out=path.join(root,'assets','store','screenshots');
  const result={schemaVersion:1,generatedAt:new Date().toISOString(),source:'Real Lastbrowser source-build with isolated in-tree backend',buildRoot,dimensions:{width:1920,height:1080},locales:catalogs.locales,systemProtocolRegistrationDisabled:true,driverModelRequests:false,captures:[],failures:[]};
  app.setPath('userData',profile);
  app.setPath('sessionData',path.join(profile,'session'));
  // A screenshot test must not register itself as the user's default browser.
  app.isDefaultProtocolClient=()=>true;
  let window;
  let exitCode=0;
  const driverTimeout=setTimeout(()=>{reportLine({phase:'watchdog'});app.exit(72);},18*60*1000);
  const run=expression=>window.webContents.executeJavaScript(expression,true);
  const until=async(expression,message,ms=20000)=>{
    const end=Date.now()+ms;
    while(Date.now()<end){try{if(await run(expression))return;}catch{} await sleep(100);}
    throw Error(message);
  };
  const snapshot=()=>run("JSON.stringify({lang:document.documentElement.lang,classes:document.querySelector('.app-shell')?.className,headings:[...document.querySelectorAll('h1,h2,h3')].map(e=>e.innerText),buttons:[...document.querySelectorAll('button')].map(e=>({text:e.innerText.trim(),title:e.title,aria:e.getAttribute('aria-label'),className:e.className,image:e.querySelector('img')?.getAttribute('src')})),selects:[...document.querySelectorAll('select')].map(e=>({value:e.value,options:[...e.options].map(o=>({value:o.value,text:o.text}))}))})");
  const capture=async(locale,name)=>{
    await run("Promise.race([Promise.all([...document.images].filter(i=>!i.complete).map(i=>new Promise(r=>{i.onload=r;i.onerror=r}))),new Promise(r=>setTimeout(r,3000))])");
    await sleep(350);
    const target=process.argv.includes('--probe')?path.join(buildRoot,name+'.png'):path.join(out,locale,name+'.png');
    fs.mkdirSync(path.dirname(target),{recursive:true});
    const shot=await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
    const dimensions=shot.getSize();
    if(dimensions.width!==1920||dimensions.height!==1080)throw Error('Unexpected screenshot size '+JSON.stringify(dimensions));
    fs.writeFileSync(target,shot.toPNG());
    const state=JSON.parse(await snapshot());
    if(state.lang!==locale)throw Error('Visible UI locale does not match '+locale+': '+state.lang);
    const entry={locale,area:name,file:path.relative(root,target).replaceAll('\\','/'),lang:state.lang,shellClass:state.classes,headings:state.headings};
    result.captures.push(entry);
    reportLine({phase:'captured',locale,area:name,count:result.captures.length});
  };
  const clickButtonText=async(text,selector='button')=>{
    const clicked=await run("(()=>{const b=[...document.querySelectorAll("+JSON.stringify(selector)+")].find(e=>[e.innerText.trim(),e.title,e.getAttribute('aria-label'),e.querySelector('.drawer-card-title')?.innerText.trim()].includes("+JSON.stringify(text)+"));if(!b||b.disabled)return false;b.click();return true})()");
    if(!clicked)throw Error('UI button not available: '+text);
  };
  const openPanel=async(locale,panel)=>{
    const catalog=catalogs.catalogs[locale];
    const data=catalogs.panels.find(item=>item.id===panel);
    const name=catalog[data.key];
    const railClicked=await run("(()=>{const b=[...document.querySelectorAll('.shell-rail button,.nova-dock-btn,.footer-link-btn')].find(e=>[e.innerText.trim(),e.title,e.getAttribute('aria-label')].includes("+JSON.stringify(name)+"));if(!b)return false;b.click();return true})()");
    if(!railClicked){
      if(panel==='settings')await clickButtonText(name);
      else{
        const categories={chat:1,agents:1,skills:1,memory:1,profiles:1,kanban:2,tasks:2,workspaces:2,todos:2,insights:2,browser:3,terminal:3,gmail:3,discord:3,logs:3};
        const category=categories[panel];
        if(category===undefined)throw Error('Panel has no current sidebar entry: '+panel);
        const switched=await run("(()=>{const b=document.querySelectorAll('.drawer-tab-btn')["+category+"];if(!b)return false;b.click();return true})()");
        if(!switched)throw Error('Expanded sidebar category missing');
        await sleep(100);
        const title=catalog['sidebar.items.'+panel+'.title']||name;
        await clickButtonText(title,'.sidebar-drawer-card');
      }
    }
    await until("Boolean(document.querySelector('.app-shell.panel-"+panel+"'))",'Panel did not become active: '+panel);
    await sleep(300);
  };
  try{
    await import(pathToFileURL(path.join(buildRoot,'main','main.js')).href);
    await app.whenReady();
    const started=Date.now();
    while(Date.now()-started<30000){
      window=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.getURL().startsWith('app://'));
      if(window)break;
      await sleep(100);
    }
    if(!window)throw Error('Full Lastbrowser window did not start');
    window.setContentSize(1920,1080);
    window.showInactive();
    await until("Boolean(document.querySelector('.app-shell'))",'Renderer shell did not mount',30000);
    const initial=JSON.parse(await snapshot());
    fs.writeFileSync(path.join(buildRoot,'initial-ui.json'),JSON.stringify(initial,null,2));
    const hasFirstRun=await run("Boolean(document.querySelector('[role=\"dialog\"][aria-label=\"First-run setup\"]'))");
    if(hasFirstRun)await run("(()=>{const b=[...document.querySelectorAll('button')].find(e=>/erstmal ohne|ohne ki|browse without|skip|dismiss/i.test(e.innerText));if(!b)throw Error('First-run skip control unavailable');b.click()})()");
    await until("Boolean(document.querySelector('.addressbar-container input'))",'Browser chrome did not mount',30000);
    await until("window.lastbrowser.services.status().then(s=>s.sidekick==='ready'&&s.webuiHealth==='ready')",'Isolated backend did not become ready',60000);
    // Preference seeding is scoped to this fresh test profile; no app content is fabricated.
    await run("document.querySelector('.copilot-toggle-btn.active')?.click();localStorage.setItem('lastbrowser.sidebarMode.v1','expanded');localStorage.setItem('lastbrowser.activePanel','browser');localStorage.setItem('lastbrowser.locale','en');true");
    window.webContents.reload();
    await until("document.documentElement.lang==='en'&&Boolean(document.querySelector('.app-shell'))",'English shell preference did not apply',30000);
    if(process.argv.includes('--probe')){
      fs.writeFileSync(path.join(buildRoot,'probe-ui.json'),await snapshot());
      await capture('en','probe-browser');
      reportLine({phase:'probe-passed',inventory:path.join(buildRoot,'probe-ui.json')});
    }else{
      for(const locale of catalogs.locales){
        try{
          await run("localStorage.setItem('lastbrowser.locale',"+JSON.stringify(locale)+");localStorage.setItem('lastbrowser.activePanel','browser');true");
          window.webContents.reload();
          await until("document.documentElement.lang==="+JSON.stringify(locale)+"&&Boolean(document.querySelector('.app-shell'))",'Locale did not apply: '+locale,30000);
          await run("document.querySelectorAll('.drawer-tab-btn')[0].click();true");
          const inventory=JSON.parse(await snapshot());
          fs.writeFileSync(path.join(buildRoot,'ui-'+locale+'.json'),JSON.stringify(inventory,null,2));
          await capture(locale,'browser');
          // Appstore is retired from the sidebar; capture its actual replacement.
          await run("document.querySelector('.extensions-trigger').click();true");
          await until("Boolean(document.querySelector('.unified-hub-modal'))",'Extension hub did not open');
          await capture(locale,'extension-hub');
          await run("document.querySelectorAll('.hub-pillar-tab')[1].click();true");
          await capture(locale,'skill-hub');
          await run("document.querySelector('.hub-close-btn').click();true");
          // Browser utilities are overlays rather than separate main panels.
          await run("document.querySelectorAll('.drawer-tab-btn')[3].click();true");
          for(const utility of ['downloads','history','permissions']){
            await clickButtonText(catalogs.catalogs[locale]['sidebar.utilities.'+utility+'.title'],'.sidebar-drawer-card');
            await until("Boolean(document.querySelector('."+utility+"-panel'))",utility+' did not open');
            await capture(locale,utility);
            const closeSelector=utility==='downloads'?'.downloads-panel [data-download-action=close]':'.'+utility+'-panel header button:last-child';
            await run("document.querySelector("+JSON.stringify(closeSelector)+").click();true");
          }
          await run("document.querySelector('.startpage-palette-trigger').click();true");
          await until("Boolean(document.querySelector('[role=dialog]'))",'Command palette did not open');
          await capture(locale,'command-palette');
          window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
          window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
          await until("!document.querySelector('[role=dialog]')",'Command palette did not close');
          for(const panel of catalogs.panels.filter(p=>p.id!=='browser'&&p.id!=='appstore')){
            try{
              await openPanel(locale,panel.id);
              await capture(locale,panel.id);
              if(panel.id==='settings'){
                const sections=await run("[...document.querySelectorAll('.settings-section-button')].map(e=>e.innerText.trim())");
                for(let index=0;index<sections.length;index++){
                  await run("document.querySelectorAll('.settings-section-button')["+index+"].click();true");
                  await sleep(400);
                  await capture(locale,'settings-'+String(index+1).padStart(2,'0'));
                }
              }
            }catch(error){result.failures.push({locale,area:panel.id,error:error.message});reportLine({phase:'area-failed',locale,area:panel.id,error:error.message});}
          }
        }catch(error){result.failures.push({locale,error:error.message});reportLine({phase:'locale-failed',locale,error:error.message});}
      }
    }
  }catch(error){result.failures.push({error:error.message});reportLine({phase:'fatal',error:error.message});exitCode=1;}
  finally{
    clearTimeout(driverTimeout);
    fs.mkdirSync(out,{recursive:true});
    const reportPath=process.argv.includes('--probe')?path.join(buildRoot,'probe-report.json'):path.join(out,'capture-report.json');
    fs.writeFileSync(reportPath,JSON.stringify(result,null,2)+'\n');
    if(!process.argv.includes('--probe'))writeGallery(out,result);
    reportLine({phase:'finished',captures:result.captures.length,failures:result.failures.length,report:reportPath});
    if(result.failures.length)exitCode=1;
    try{if(window&&!window.isDestroyed())await run("window.lastbrowser.services.stop()");}catch{}
    for(const owned of BrowserWindow.getAllWindows())if(!owned.isDestroyed())owned.destroy();
    app.exit(exitCode);
  }
}
(childMode?electronChild():parent()).catch(error=>{reportLine({phase:'failed',error:error.message});process.exitCode=1;});

