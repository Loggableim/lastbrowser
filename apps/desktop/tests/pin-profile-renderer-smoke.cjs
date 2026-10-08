/* Actual installed Castlabs + production React components. No accounts/backend/provider/model IO. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..');
const evidence=path.join(root,'output','pin-profile-renderer-proof');
async function parent(){
  fs.mkdirSync(evidence,{recursive:true});
  const plugins=process.argv.includes('--baseline')?[{name:'exact-baseline-source',setup(build){build.onLoad({filter:/(?:HeaderComponents\.tsx|NovaDock\.tsx|SidekickSidebar\.tsx|styles\.css|pinned-tab-drop\.css)$/},args=>{
    const relative=path.relative(root,args.path).split(path.sep).join('/');
    return{contents:execFileSync('git',['show','b7ca38bd6db7b8a6e5fd814bd322b4916f561e73:'+relative],{cwd:root,encoding:'utf8'}),loader:args.path.endsWith('.css')?'css':'tsx',resolveDir:path.dirname(args.path)};
  });}}]:[];
  await require('esbuild').build({entryPoints:[path.join(__dirname,'pin-profile-renderer-entry.tsx')],outfile:path.join(evidence,'fixture.js'),bundle:true,platform:'browser',format:'iife',loader:{'.png':'dataurl','.svg':'dataurl','.woff2':'file'},define:{'process.env.NODE_ENV':'"test"'},plugins});
  fs.writeFileSync(path.join(evidence,'preload.cjs'),`require('electron').contextBridge.exposeInMainWorld('lastbrowser',{i18n:{setLocale:async()=>{}},window:{minimize:()=>{},maximize:()=>{},close:()=>{}}});`);
  fs.writeFileSync(path.join(evidence,'fixture.html'),`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';img-src 'self' data:"><link rel="stylesheet" href="fixture.css"><style>html,body,#root{height:100%;margin:0}.fixture-topbar{height:44px}.fixture-shell{display:flex;height:calc(100% - 44px)}.fixture-settings{flex:1;padding:24px;min-width:0;overflow:auto;display:flex;flex-direction:column;gap:12px}.fixture-settings .settings-card{flex:none;min-height:90px}.fixture-settings h2{margin:0;font-size:15px}.overlay-card{min-height:120px!important}.fixture-topbar .browser-titlebar{height:44px}.fixture-shell>.sidekick-sidebar{flex:none}button,input{-webkit-app-region:no-drag}</style></head><body><div id="root"></div><script src="fixture.js"></script></body></html>`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const electronExe=process.platform==='win32'?path.join(path.dirname(require.resolve('electron/package.json')),'dist','electron.exe'):require('electron');
  const child=spawn(electronExe,[__filename,'--child',evidence,...process.argv.filter(value=>value==='--baseline')],{cwd:root,env,windowsHide:true,stdio:'inherit'});
  const timer=setTimeout(()=>child.kill(),120000);
  const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code));});clearTimeout(timer);assert.equal(result,0);
}
async function child(){
  const {app,BrowserWindow}=require('electron');let win;const log=[];
  app.setPath('userData',path.join(evidence,'owned-userdata'));
  await app.whenReady();
  try{
    win=new BrowserWindow({width:1060,height:800,show:true,webPreferences:{preload:path.join(evidence,'preload.cjs'),contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
    win.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('file:')&&!details.url.startsWith('data:')}));
    win.webContents.on('console-message',(_event,...args)=>{if(args.some(value=>String(value).includes('Error')))process.stderr.write(args.join(' ')+'\n');});
    await win.loadFile(path.join(evidence,'fixture.html'));win.focus();
    const run=script=>win.webContents.executeJavaScript(script,true);
    const tick=()=>new Promise(resolve=>setTimeout(resolve,100));
    async function until(script,message){for(let index=0;index<40;index++){if(await run(script))return;await tick();}throw Error(message);}
    await until(`!!document.querySelector('.vertical-tab-item')`,'Sidebar did not mount');await run(`window.pinProfileFixture.reset()`);
    await win.webContents.debugger.attach('1.3');
    const cdp=(method,params={})=>win.webContents.debugger.sendCommand(method,params);
    async function rect(selector){await run(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'nearest'})`);let previous,stable=0;for(let index=0;index<30;index++){const point=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}})()`);stable=previous&&['x','y','width','height'].every(key=>Math.abs(previous[key]-point[key])<.2)?stable+1:0;if(stable>=2)return point;previous=point;await tick();}throw Error('Unstable input target '+selector);}
    async function click(selector){const point=await rect(selector);await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});await tick();}
    async function key(key,code=key){const windowsVirtualKeyCode={Enter:13,Escape:27,ArrowDown:40,ArrowUp:38,Home:36,End:35}[key];await cdp('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode,...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode});await tick();}
    async function drag(source,target){
      const from=await rect(source),to=await rect(target);let captured;log.push({phase:'pointer-drag-target',source,target,from,to,hit:await run(`document.elementFromPoint(${to.x},${to.y})?.outerHTML`)});
      const listener=(_event,method,params)=>{if(method==='Input.dragIntercepted')captured=params.data;};win.webContents.debugger.on('message',listener);
      await cdp('Input.setInterceptDrags',{enabled:true});
      try{
        await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:from.x,y:from.y});
        await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:from.x,y:from.y,button:'left',buttons:1,clickCount:1});
        for(let index=1;index<=8&&!captured;index++){await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:from.x+(to.x-from.x)*index/8,y:from.y+(to.y-from.y)*index/8,button:'left',buttons:1});await tick();}
        assert(captured,'Real pointer drag did not produce Chromium dragIntercepted');log.push({phase:'captured-native-drag',data:captured});
        for(const type of ['dragEnter','dragOver','drop']){await cdp('Input.dispatchDragEvent',{type,x:to.x,y:to.y,data:captured});await tick();}
        await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:to.x,y:to.y,button:'left',buttons:0,clickCount:1});await tick();
      }finally{win.webContents.debugger.removeListener('message',listener);await cdp('Input.setInterceptDrags',{enabled:false});}
    }
    const shot=async name=>fs.writeFileSync(path.join(evidence,name),(await win.webContents.capturePage()).toPNG());
    await click('.profile-switcher-trigger');
    await until(`!!document.querySelector('.profile-switcher-menu')`,'Profile menu did not open');
    const hit=await run(`(()=>{const e=document.querySelector('.profile-switcher-form button[type=submit]'),r=e.getBoundingClientRect();return{covered:!e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),at:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.className}})()`);
    log.push({phase:'profile-add-hit',...hit});await shot(process.argv.includes('--baseline')?'baseline-profile-overlay.png':'profile-menu-fixed.png');
    if(process.argv.includes('--baseline')){assert.equal(hit.covered,true,'Exact base did not reproduce covered Add');await key('Escape');await drag('.vertical-tab-item .vtab-title','.pinned-grid-cell');assert.equal(await run(`window.pinProfileFixture.apps().length`),1,'Exact base did not reproduce failed pin');assert(await run(`window.pinProfileFixture.events.some(e=>e.type==='dragstart'&&e.trusted)&&window.pinProfileFixture.events.some(e=>e.type==='dragover'&&e.trusted)&&!window.pinProfileFixture.events.some(e=>e.type==='drop')`),'Baseline native drag evidence incomplete');log.push({phase:'expanded-drag-baseline',apps:await run(`window.pinProfileFixture.apps()`),events:await run(`window.pinProfileFixture.events`)});}
    else{
      assert.equal(hit.covered,false,'Add pointer target is covered by a card');
      await click('.profile-switcher-form input');await cdp('Input.insertText',{text:'Pointer profile'});await click('.profile-switcher-form button[type=submit]');
      await until(`window.pinProfileFixture.created().includes('Pointer profile')`,'Add pointer click did not create profile');
      await click('.profile-switcher-trigger');await key('Escape');
      assert(await run(`document.activeElement===document.querySelector('.profile-switcher-trigger')`),'Escape did not return trigger focus');
      await key('ArrowDown');await until(`!!document.querySelector('.profile-switcher-menu')`,'Keyboard menu did not open');await key('Escape');
      await click('.profile-switcher-trigger');await click('.profile-switcher-form input');await cdp('Input.insertText',{text:'Keyboard profile'});await key('Enter');
      await until(`window.pinProfileFixture.created().includes('Keyboard profile')`,'Keyboard Enter did not create profile');
      await click('.profile-switcher-trigger');await key('Home');await key('Enter');
      assert.equal(await run(`window.pinProfileFixture.profile()`),'default','Keyboard selection did not select Default');
      await click('.profile-switcher-trigger');await click('.overlay-card button');
      assert(await run(`!document.querySelector('.profile-switcher-menu')`),'Outside pointer did not close menu');
      await click('.profile-switcher-trigger');
      await run(`document.querySelector('.fixture-settings').scrollTop=40`);await tick();
      assert(await run(`(()=>{const t=document.querySelector('.profile-switcher-trigger').getBoundingClientRect(),m=document.querySelector('.profile-switcher-menu').getBoundingClientRect();return Math.abs(m.top-t.bottom-6)<2})()`),'Menu did not follow scrolling trigger');
      win.setContentSize(320,640);await until(`innerWidth===320&&document.querySelector('.profile-switcher-menu').getBoundingClientRect().right<=320`,'Menu did not settle after resize');
      assert(await run(`(()=>{const m=document.querySelector('.profile-switcher-menu').getBoundingClientRect();return m.left>=0&&m.right<=innerWidth&&m.bottom<=innerHeight&&[...document.querySelectorAll('.profile-switcher-menu input,.profile-switcher-menu button')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})})()`),'Menu/forms clipped at 320px');
      await shot('profile-menu-320.png');await key('Escape');win.setContentSize(1060,760);await tick();await run(`document.querySelector('.fixture-settings').scrollTop=0`);
      log.push({phase:'profile-interactions',pointerAdd:true,keyboardAdd:true,keyboardSelection:true,escapeFocus:true,outsideClick:true,scrollPosition:true,resize320:true,providerCalls:0});
      await drag('.vertical-tab-item .vtab-title','.pinned-grid-cell');
      assert(await run(`window.pinProfileFixture.apps().some(app=>app.name==='Guest Root - Full Source Title Preserved After Reload')`),'Expanded drag did not pin');
      log.push({phase:'expanded-pointer-drag',events:await run(`window.pinProfileFixture.events`)});
      await shot('expanded-pin-fixed.png');
      const source=index=>`.vertical-tab-item:nth-child(${index}) .vtab-title`;
      for(const order of [[1,2],[2,1]]){
        await run(`window.pinProfileFixture.reset()`);await tick();
        await drag(source(order[0]),'.pinned-grid-cell');await drag(source(order[1]),'.pinned-grid-cell.add-cell');
        assert.equal(await run(`window.pinProfileFixture.apps().length`),3,'Root and subdomain pins conflated');
        await drag(source(3),'.pinned-grid-cell');assert.equal(await run(`window.pinProfileFixture.apps().length`),3,'www created duplicate canonical pin');
        assert.equal(await run(`document.querySelectorAll('.vertical-tab-item').length`),3,'Pin removed original tab');
        log.push({phase:'root-subdomain-order',order,apps:await run(`window.pinProfileFixture.apps()`)});
      }
      win.webContents.reload();await until(`!!document.querySelector('.vertical-tab-item')`,'Reload did not mount');
      assert.equal(await run(`window.pinProfileFixture.apps().length`),3,'Pins missing after actual renderer reload');
      assert(await run(`[...document.querySelectorAll('.pinned-grid-cell')].some(e=>e.getAttribute('title')?.includes('Guest Root - Full Source Title Preserved After Reload'))`),'Full pin title missing after reload');
      log.push({phase:'actual-renderer-reload',pinsPersisted:true,fullTitle:true});
      await run(`window.pinProfileFixture.reset();window.pinProfileFixture.mode('expanded',true)`);await tick();
      await drag(source(1),'.pinned-grid-cell.add-cell');assert.equal(await run(`window.pinProfileFixture.apps().length`),2,'Floating expanded Sidebar did not pin');
      log.push({phase:'floating-expanded',pinned:true});
      for(const position of ['left','right','top','bottom','floating']){
        await run(`window.pinProfileFixture.reset();window.pinProfileFixture.mode('slim',false);window.pinProfileFixture.dock(${JSON.stringify(position)})`);
        await until(`!!document.querySelector('.nova-dock-pinned-group')&&document.querySelector('.nova-dock').classList.contains('pos-${position}')`,'Dock did not change position');
        await drag('.tab .tab-title','.nova-dock-pinned-group .nova-dock-btn');
        assert.equal(await run(`window.pinProfileFixture.apps().length`),2,'Collapsed '+position+' dock did not pin');
        log.push({phase:'collapsed-dock',position,pinned:true});
      }
      await shot('collapsed-pin-fixed.png');
      assert(await run(`window.pinProfileFixture.events.some(e=>e.type==='drop')&&window.pinProfileFixture.events.filter(e=>e.type==='drop').every(e=>e.trusted)`),'Drop events were not real Chromium input');
      log.push({phase:'trusted-input',events:await run(`window.pinProfileFixture.events`)});
    }
    fs.writeFileSync(path.join(evidence,process.argv.includes('--baseline')?'baseline.json':'result.json'),JSON.stringify({electron:process.versions.electron,chrome:process.versions.chrome,log},null,2));
    process.stdout.write(JSON.stringify({passed:true,evidence,electron:process.versions.electron,chrome:process.versions.chrome,phases:log.map(row=>row.phase)})+'\n');win.destroy();app.quit();
  }catch(error){fs.writeFileSync(path.join(evidence,'failure.txt'),error.stack);fs.writeFileSync(path.join(evidence,'failure-log.json'),JSON.stringify(log,null,2));if(win&&!win.isDestroyed()){fs.writeFileSync(path.join(evidence,'failure.png'),(await win.webContents.capturePage()).toPNG());fs.writeFileSync(path.join(evidence,'failure-state.json'),JSON.stringify(await win.webContents.executeJavaScript(`({width:innerWidth,height:innerHeight,focus:document.activeElement?.outerHTML,events:window.pinProfileFixture.events,menu:[...document.querySelectorAll('.profile-switcher-menu,.profile-switcher-menu input,.profile-switcher-menu button')].map(e=>({html:e.outerHTML,rect:e.getBoundingClientRect().toJSON()}))})`),null,2));}process.stderr.write(error.stack+'\n');win?.destroy();app.exit(1);}
}
if(process.argv.includes('--child'))void child();else void parent().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
