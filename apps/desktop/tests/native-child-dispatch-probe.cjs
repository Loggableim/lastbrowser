#!/usr/bin/env node
// FIX3 E5: isolated real Electron/Main/backend child-dispatch probe.
// This intentionally uses its own filename and does not modify FIX4's full-app probe.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..', '..', '..');
const desktop = path.join(root, 'apps', 'desktop');
const id = randomUUID();
const owned = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-child-dispatch-'));
const build = path.join(root, 'out', 'child-dispatch-' + id);
const requestedOutput = process.env.LASTBROWSER_E5_OUTPUT;
const output = requestedOutput ? path.resolve(requestedOutput) : path.join(root, 'output', 'native-child-dispatch-' + id + '.json');
if (!output.startsWith(path.join(root, 'output') + path.sep)) throw Error('e5_report_must_remain_under_root_output');
const nap = ms => new Promise(resolve => setTimeout(resolve, ms));
const runCommand = (exe, args, cwd) => new Promise((resolve, reject) => {
  const child = spawn(exe, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { out += data.toString(); });
  child.once('error', reject);
  child.once('close', code => code === 0 ? resolve(out) : reject(Error(`build_failed:${code}:${out.slice(-3000)}`)));
});

async function main() {
  fs.mkdirSync(build, { recursive: true });
  fs.writeFileSync(path.join(build, 'package.json'), '{"type":"module"}');
  let electron;
  const report = { probe: 'native-child-dispatch', id, branch: '', childRuns: [], providerToolCalls: 0, providerRequests: [], outputReport: output };
  let backend;
  const replies = new Set();
  let released = false;
  let providerRequestOrdinal = 0;
  const fixture = require('node:http').createServer((req, res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'child-probe-model', context_length: 64000 }] })); return;
    }
    if (req.url === '/v1/chat/completions') {
      let raw = ''; req.on('data', b => raw += b); req.on('end', () => {
        const body = JSON.parse(raw);
        const messages = body.messages || [];
        const safeText = messages.map(row => String(row.content || '')).join('\n');
        const requestOrdinal = ++providerRequestOrdinal;
        report.providerRequests.push({ path: req.url, method: req.method, stream: body.stream === true,
          model: typeof body.model === 'string' ? body.model.slice(0, 120) : null,
          roles: messages.map(row => String(row.role || '').slice(0, 24)),
          toolNames: (body.tools || []).map(row => String(row.function?.name || '').slice(0, 100)),
          markers: ['E5_CHILD_DISPATCH','E5_CHILD_ALPHA','E5_CHILD_BETA'].filter(marker => safeText.includes(marker)) });
        if (!body.stream) {
          res.writeHead(400); res.end('{"error":{"message":"stream_required"}}'); return;
        }
        const providerHeaders = { 'content-type': 'text/event-stream', connection: 'close',
          'x-ratelimit-limit-requests': '6', 'x-ratelimit-remaining-requests': '6',
          'x-ratelimit-reset-requests': '1m', 'x-ratelimit-limit-tokens': '1000000',
          'x-ratelimit-remaining-tokens': '1000000', 'x-ratelimit-reset-tokens': '1m',
          'x-request-id': `e5-controlled-${requestOrdinal}` };
        const hasToolResult = messages.some(row => row.role === 'tool');
        const userText = messages.filter(row => row.role === 'user').map(row => String(row.content)).join('\n');
        if (!hasToolResult && userText.includes('E5_CHILD_DISPATCH')) {
          report.providerToolCalls++;
          res.writeHead(200, providerHeaders);
          const chunk = (delta, finish_reason = null) => res.write('data: ' + JSON.stringify({
            id: 'controlled-parent-toolcall', object: 'chat.completion.chunk', created: 1, model: body.model,
            choices: [{ index: 0, delta, finish_reason }]
          }) + '\n\n');
          chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'e5-child-call', type: 'function',
            function: { name: 'delegate_task', arguments: JSON.stringify({ tasks: [
              { goal: 'E5_CHILD_ALPHA' }, { goal: 'E5_CHILD_BETA' }
            ] }) } }] });
          chunk({}, 'tool_calls'); res.end('data: [DONE]\n\n'); return;
        }
        const taskText = messages.map(row => String(row.content || '')).join('\n');
        if (!taskText.includes('E5_CHILD_ALPHA') && !taskText.includes('E5_CHILD_BETA')) {
          res.writeHead(200, providerHeaders);
          res.end('data: ' + JSON.stringify({ id: 'controlled-warmup-answer', object: 'chat.completion.chunk', created: 1,
            model: body.model, choices: [{ index: 0, delta: { role: 'assistant', content: 'E5_WARMUP_OK' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n'); return;
        }
        const answer = taskText.includes('E5_CHILD_ALPHA') ? 'CHILD_ALPHA_STREAM_ONE' : 'CHILD_BETA_STREAM_ONE';
        res.writeHead(200, providerHeaders);
        const chunk = (delta, finish_reason = null) => res.write('data: ' + JSON.stringify({
          id: 'controlled-child-answer', object: 'chat.completion.chunk', created: 1, model: body.model,
          choices: [{ index: 0, delta, finish_reason }]
        }) + '\n\n');
        chunk({ role: 'assistant', content: answer });
        const finish = () => { if (res.destroyed) return; chunk({ content: '_TWO' }); chunk({}, 'stop'); res.end('data: [DONE]\n\n'); };
        if (released) finish(); else replies.add(finish);
        res.once('close', () => replies.delete(finish));
      }); return;
    }
    if (req.url === '/fixture/release' && req.method === 'POST') {
      released = true; for (const finish of replies) finish(); replies.clear(); res.writeHead(200); res.end('{}'); return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${fixture.address().port}`;
  try {
    report.branch = (await runCommand('git', ['branch', '--show-current'], root)).trim();
    await runCommand(process.execPath, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', path.join(desktop, 'tsconfig.main.json'), '--outDir', path.join(build, 'main')], root);
    await require('esbuild').build({ entryPoints: [path.join(desktop, 'src', 'main', 'preload.ts')], outfile: path.join(build, 'main', 'preload.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node20', external: ['electron'] });
    await runCommand(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', path.join(desktop, 'vite.config.ts'), '--outDir', path.join(build, 'renderer')], desktop);
    const userData = path.join(owned, 'user-data');
    const runtime = path.join(userData, 'runtime');
    const workspace = path.join(owned, 'workspace');
    const downloads = path.join(owned, 'downloads');
    fs.mkdirSync(path.join(runtime, 'webui'), { recursive: true }); fs.mkdirSync(workspace, { recursive: true });
    fs.mkdirSync(downloads, { recursive: true });
    fs.writeFileSync(path.join(runtime, 'config.yaml'), JSON.stringify({ workspace, model: { provider: 'custom:e5', default: 'child-probe-model', base_url: origin + '/v1', api_key: 'local-fixture' }, custom_providers: [{ name: 'e5', base_url: origin + '/v1', api_key: 'local-fixture', models: { 'child-probe-model': { context_length: 64000 } } }] }));
    fs.writeFileSync(path.join(runtime, '.env'), `NO_PROXY=localhost,127.0.0.1\n`);
    fs.writeFileSync(path.join(runtime, 'webui', 'workspaces.json'), JSON.stringify([{ name: 'E5 isolated workspace', path: workspace }]));
    const bootstrap = { buildRoot: build, userData, runtime, workspace, origin };
    fs.writeFileSync(path.join(owned, 'bootstrap.json'), JSON.stringify(bootstrap));
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)$/i.test(key) || /^(?:SIDEKICK|HERMES|LASTBROWSER)_/.test(key) || ['PYTHONPATH','PYTHONHOME','ELECTRON_RUN_AS_NODE'].includes(key)) delete env[key];
    Object.assign(env, { LASTBROWSER_CHILD_PROBE_ROOT: owned, LASTBROWSER_DOWNLOADS_DIR: downloads, SIDEKICK_BASE_HOME: runtime, LASTBROWSER_WEBUI_PYTHON: path.join(desktop, 'runtime', 'python', 'python.exe'),
      LASTBROWSER_ENABLE_CDP: '0', PYTHONDONTWRITEBYTECODE: '1', PYTHONNOUSERSITE: '1', PYTHONUNBUFFERED: '1',
      USERPROFILE: path.join(owned, 'home'), APPDATA: path.join(owned, 'app-data'), LOCALAPPDATA: path.join(owned, 'local-app-data'),
      TEMP: path.join(owned, 'tmp'), TMP: path.join(owned, 'tmp'), NO_PROXY: 'localhost,127.0.0.1' });
    for (const key of ['USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP']) fs.mkdirSync(env[key], { recursive: true });
    electron = spawn(require('electron'), [__filename, '--electron-child', owned, output], { cwd: root, env, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    let stdout = '', stderr = ''; electron.stdout.on('data', b => stdout += b); electron.stderr.on('data', b => stderr += b);
    const exit = await new Promise((resolve, reject) => { const timer = setTimeout(() => { report.parentWatchdog = 'timeout'; fs.writeFileSync(output, JSON.stringify(report, null, 2)); electron.kill();
      const grace = setTimeout(() => { if (electron.exitCode === null && electron.signalCode === null) electron.kill('SIGKILL'); }, 45000); grace.unref();
      electron.once('close', (code, signal) => { clearTimeout(grace); resolve({ code, signal, watchdog: true }); });
    }, 240000); electron.once('error', reject); electron.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); }); });
    report.childExit = exit; report.childStdout = stdout.slice(-12000); report.childStderr = stderr.slice(-4000);
    const resultFile = path.join(owned, 'result.json'); if (fs.existsSync(resultFile)) Object.assign(report, JSON.parse(fs.readFileSync(resultFile, 'utf8')));
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    if (exit.code !== 0 || !report.passed) throw Error('e5_probe_failed:' + JSON.stringify({ output, exit, error: report.error, phase: report.phase }));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    released = true; for (const finish of replies) finish(); replies.clear();
    await new Promise(resolve => fixture.close(resolve));
    const safe = path.resolve(build).startsWith(path.resolve(root, 'out') + path.sep) && path.basename(build).startsWith('child-dispatch-');
    if (safe && fs.existsSync(build)) fs.rmSync(build, { recursive: true, force: true });
    if (fs.existsSync(owned)) fs.rmSync(owned, { recursive: true, force: true });
  }
}

async function electronChild(directory) {
  const { app, BrowserWindow, webContents } = require('electron');
  const info = JSON.parse(fs.readFileSync(path.join(directory, 'bootstrap.json'), 'utf8'));
  const reportPath = process.argv[process.argv.indexOf('--electron-child') + 2];
  const state = { passed: false, phase: 'startup', childEvents: [], streamEvents: [], childReports: [] };
  const persist = () => { fs.writeFileSync(reportPath, JSON.stringify(state, null, 2)); fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(state, null, 2)); };
  let window; let run; const processes = []; const originalSpawn = require('node:child_process').spawn;
  require('node:child_process').spawn = (...args) => { const p = originalSpawn(...args); processes.push(p); return p; };
  app.setPath('userData', info.userData); app.setPath('sessionData', path.join(info.userData, 'session'));
  app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost');
  try {
    await import(require('node:url').pathToFileURL(path.join(info.buildRoot, 'main', 'main.js')).href);
    await app.whenReady();
    const until = async (check, what, ms=25000) => { const end = Date.now()+ms; while(Date.now()<end){try{if(await check())return;}catch{} await nap(100);} throw Error('timeout:'+what); };
    await until(() => BrowserWindow.getAllWindows().some(w => !w.isDestroyed()&&w.webContents.getURL().startsWith('app://')), 'app:// BrowserWindow target');
    const electronTargets=webContents.getAllWebContents().map(contents=>({webContentsId:contents.id,type:contents.getType(),url:contents.getURL(),title:contents.getTitle()}));
    const cdpTargets=[];const cdpErrors=[];
    for(const candidate of BrowserWindow.getAllWindows().filter(w=>!w.isDestroyed())) {
      const debuggerApi=candidate.webContents.debugger;let attachedHere=false;
      try {
        if(!debuggerApi.isAttached()){debuggerApi.attach('1.3');attachedHere=true;}
        const targetList=await debuggerApi.sendCommand('Target.getTargets');
        for(const target of targetList.targetInfos||[])cdpTargets.push({targetId:target.targetId,type:target.type,url:target.url,title:target.title});
      } catch(error) { cdpErrors.push({webContentsId:candidate.webContents.id,message:String(error?.message||error)}); }
      finally { if(attachedHere&&debuggerApi.isAttached())try{debuggerApi.detach();}catch{} }
    }
    const shellWindows=BrowserWindow.getAllWindows().filter(w=>!w.isDestroyed()&&w.webContents.getURL().startsWith('app://'));
    await until(async()=>{for(const candidate of shellWindows)try{if(await candidate.webContents.executeJavaScript("Boolean(document.querySelector('.app-shell'))",true))return true;}catch{}return false;},'app-shell DOM root mounted');
    const shellReadiness=[];
    for(const candidate of shellWindows) {
      let dom=null;try{dom=await candidate.webContents.executeJavaScript("({url:document.URL,appShell:Boolean(document.querySelector('.app-shell'))})",true);}catch(error){dom={error:String(error?.message||error)};}
      shellReadiness.push({webContentsId:candidate.webContents.id,url:candidate.webContents.getURL(),title:candidate.webContents.getTitle(),type:candidate.webContents.getType(),dom});
    }
    state.targets={electronTargets,cdpTargets,cdpErrors,shellReadiness};
    window=shellWindows.find(candidate=>shellReadiness.some(row=>row.webContentsId===candidate.webContents.id&&row.dom?.appShell===true));
    if(!window)throw Error('no_actual_app_shell_target:'+JSON.stringify(state.targets));
    state.selectedTarget={webContentsId:window.webContents.id,url:window.webContents.getURL(),title:window.webContents.getTitle(),type:window.webContents.getType(),cdp:cdpTargets.find(target=>target.url===window.webContents.getURL()&&target.type==='page')||null};persist();
    await until(() => window.webContents.executeJavaScript("Boolean(document.querySelector('.app-shell'))", true), 'renderer');
    await until(() => window.webContents.executeJavaScript("window.lastbrowser.services.status().then(s=>s.sidekick==='ready'&&s.webuiHealth==='ready')", true), 'backend', 60000);
    run = async expr => {
      const script = `(async()=>{try{return {__e5ok:true,value:await (${expr})}}catch(error){return {__e5ok:false,error:{name:String(error?.name||'Error'),message:String(error?.message||error),stack:String(error?.stack||'')}}}})()`;
      let result;
      try { result = await window.webContents.executeJavaScript(script, true); }
      catch (error) { throw new Error('renderer_evaluate_transport:'+String(error?.stack||error)); }
      if (!result?.__e5ok) {
        const error = new Error('renderer_script_exception:'+JSON.stringify(result?.error||{}));
        error.name = 'RendererScriptError'; error.rendererError = result?.error||null; throw error;
      }
      return result.value;
    };
    const phase = name => { state.phase=name; persist(); };
    const domInventory=async()=>run(`(()=>{const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0};
      const safeText=(el,limit=160)=>String(el.innerText||el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,limit);
      const selectors=['.app-shell','main','[role="main"]','.first-run-fullscreen-wrap','.local-ai-setup','.space-setup-modal','.sidekick-sidebar','.sidekick-sidebar-revealer','.zen-sidebar-overlay','.sidebar-drawer-tabs','.native-chat-main'];
      const containers=selectors.flatMap(selector=>[...document.querySelectorAll(selector)].slice(0,4).map(el=>({selector,tag:el.tagName,className:String(el.className||'').slice(0,120),visible:visible(el),text:safeText(el,200)})));
      const buttons=[...document.querySelectorAll('button')].filter(visible).slice(0,80).map(el=>({className:String(el.className||'').slice(0,80),ariaLabel:String(el.getAttribute('aria-label')||'').slice(0,100),title:String(el.getAttribute('title')||'').slice(0,120),text:safeText(el,120)}));
      const setups=['.first-run-fullscreen-wrap','.local-ai-setup','.space-setup-modal'].map(selector=>({selector,visible:[...document.querySelectorAll(selector)].some(visible)}));
      return {url:document.URL,bodyClassName:document.body?.className||'',bodyTextPrefix:String(document.body?.innerText||'').slice(0,1500),containers,buttons,setups};})()`);
    phase('capture first app-shell DOM and setup inventory');
    state.domInventory=await domInventory();persist();
    if(state.domInventory.setups.some(item=>item.selector==='.first-run-fullscreen-wrap'&&item.visible)) {
      phase('dismiss visible FirstRunSetup using existing skip button');
      const skip=await run("(()=>{const button=document.querySelector('.first-run-skip-btn');if(!button)return false;button.click();return true})()");
      if(!skip)throw Error('first_run_skip_button_missing');
      await until(async()=>!(await domInventory()).setups.some(item=>item.selector==='.first-run-fullscreen-wrap'&&item.visible),'FirstRunSetup dismissed');
    }
    const setupAfterFirstRun=await domInventory();state.domInventoryAfterFirstRun=setupAfterFirstRun;persist();
    if(setupAfterFirstRun.setups.some(item=>item.selector==='.space-setup-modal'&&item.visible)) {
      phase('close visible SpaceSetup using existing close control');
      const closed=await run("(()=>{const modal=document.querySelector('.space-setup-modal');const button=modal?.querySelector('.space-setup-close-btn');if(!button||button.disabled)return false;button.click();return true})()");
      if(!closed)throw Error('space_setup_close_control_missing');
      await until(async()=>!(await domInventory()).setups.some(item=>item.selector==='.space-setup-modal'&&item.visible),'SpaceSetup closed');
    }
    state.domInventoryAfterSetup=await domInventory();persist();
    const scopeReply = await run(`window.lastbrowser.independent.request(${JSON.stringify({schemaVersion:1,operation:'resolveScope',payload:{browserProfileId:'default',workspacePath:info.workspace}})})`);
    if (!scopeReply.ok) throw Error('resolve_scope:'+JSON.stringify(scopeReply));
    const scope=scopeReply.value.scope;
    const capabilities=await run(`window.lastbrowser.independent.request(${JSON.stringify({schemaVersion:1,operation:'capabilities',scope,payload:{refresh:true}})})`);
    if(!capabilities.ok)throw Error('provider_capability_catalog_failed:'+JSON.stringify(capabilities));
    const providerEntry=capabilities.value.entries?.find(entry=>entry.capabilityId==='assistant.conversation');
    const providerConnection=providerEntry?.connections?.find(connection=>connection.connectionId==='provider:custom:e5'&&connection.status==='configured');
    if(!providerConnection)throw Error('controlled_provider_not_authoritatively_configured:'+JSON.stringify({capabilityId:providerEntry?.capabilityId,connections:providerEntry?.connections}));
    const binding=await run(`window.lastbrowser.independent.request(${JSON.stringify({schemaVersion:1,operation:'bindings',scope,
      payload:{action:'bind',capabilityId:'assistant.conversation',connectionId:'provider:custom:e5',permittedUse:['conversation','agent_reasoning'],
        expectedRevision:0,clientRequestId:randomUUID()}})})`);
    if(!binding.ok||!binding.value.connectionBindings?.some(row=>row.connectionId==='provider:custom:e5'&&row.status==='active'
      &&row.permittedUse?.includes('conversation')&&row.permittedUse?.includes('agent_reasoning')))
      throw Error('controlled_provider_public_binding_failed:'+JSON.stringify(binding));
    state.providerBinding=binding.value.connectionBindings.find(row=>row.connectionId==='provider:custom:e5');
    const warmupSession = await run(`window.lastbrowser.sidekick.createSession(${JSON.stringify({profile:'default',workspace:info.workspace,model:'child-probe-model',modelProvider:'custom:e5'})})`);
    const warmupId = warmupSession.session?.session_id;
    if (!warmupId) throw Error('warmup_session_create_failed:'+JSON.stringify(warmupSession));
    const policyDraft={mode:'auto',allowedModels:[{provider:'custom:e5',model:'child-probe-model'}],orchestrator:null,
      cloudPolicy:'deny',allowedCloudDataClasses:[],budget:{requestsPerMinute:6,tokensPerMinute:1000000,maxConcurrent:2,maxCostMicrousdPerMinute:null,maxOutputTokens:2048}};
    const warmupPolicy=await run(`window.lastbrowser.sidekick.modelPolicy(${JSON.stringify({action:'set',sessionId:warmupId,profile:'default',browserProfileId:'default',workspacePath:info.workspace,draft:policyDraft,expectedRevision:0,clientRequestId:randomUUID()})})`);
    if(warmupPolicy?.policy?.mode!=='auto'||warmupPolicy.policy.budget?.maxConcurrent<2)throw Error('warmup_auto_policy_not_bound:'+JSON.stringify(warmupPolicy));
    const warmupStart=await run(`window.lastbrowser.sidekick.startChat(${JSON.stringify({message:'E5_WARMUP_REQUEST',sessionId:warmupId,profile:'default',workspace:info.workspace,model:'child-probe-model',modelProvider:'custom:e5'})})`);
    await run(`window.lastbrowser.sidekick.subscribeChatStream(${JSON.stringify({streamId:warmupStart.streamId})})`);
    await until(async()=>{const current=await run(`window.lastbrowser.sidekick.getSession(${JSON.stringify({sessionId:warmupId,profile:'default',workspacePath:info.workspace})}).then(x=>x.session)`);
      return current?.messages?.some(m=>m.role==='assistant'&&String(m.content||'').includes('E5_WARMUP_OK')&&!m.pending&&!m.streaming);},'completed real provider warmup',45000);
    let verifiedWarmupPolicy=await run(`window.lastbrowser.sidekick.modelPolicy(${JSON.stringify({action:'get',sessionId:warmupId,profile:'default',browserProfileId:'default',workspacePath:info.workspace})})`);
    const limitSnapshot=verifiedWarmupPolicy?.status?.flatMap(row=>row.snapshots||[]).find(snapshot=>snapshot.source==='response_headers'&&!snapshot.stale
      &&snapshot.buckets?.some(bucket=>bucket.resource==='requests'&&bucket.remaining>=3)
      &&snapshot.buckets?.some(bucket=>bucket.resource==='tokens'&&bucket.remaining>=128000));
    if(verifiedWarmupPolicy?.policy?.mode!=='auto'||verifiedWarmupPolicy.policy.budget?.maxConcurrent<2||!limitSnapshot)
      throw Error('warmup_policy_or_authoritative_quota_missing:'+JSON.stringify(verifiedWarmupPolicy));
    state.phase='verified AUTO policy and response-header quota';state.warmup={sessionId:warmupId,streamId:warmupStart.streamId,
      policy:verifiedWarmupPolicy.policy,status:verifiedWarmupPolicy.status,executionAvailability:verifiedWarmupPolicy.executionAvailability};persist();
    const parentCreation = await run(`window.lastbrowser.sidekick.createSession(${JSON.stringify({profile:'default',workspace:info.workspace,model:'child-probe-model',modelProvider:'custom:e5'})})`);
    const parentSessionId=parentCreation.session?.session_id;
    if(!parentSessionId)throw Error('parent_session_create_failed:'+JSON.stringify(parentCreation));
    const parentPolicy=await run(`window.lastbrowser.sidekick.modelPolicy(${JSON.stringify({action:'set',sessionId:parentSessionId,profile:'default',browserProfileId:'default',workspacePath:info.workspace,draft:policyDraft,expectedRevision:0,clientRequestId:randomUUID()})})`);
    if(parentPolicy?.policy?.mode!=='auto'||parentPolicy.policy.budget?.maxConcurrent<2)throw Error('parent_auto_policy_not_bound:'+JSON.stringify(parentPolicy));
    state.parentPolicy=parentPolicy.policy; state.phase='parent policy verified before start';
    await run(`window.lastbrowser.sidekick.renameSession(${JSON.stringify({sessionId:parentSessionId,title:'E5 child dispatch '+id,profile:'default',workspacePath:info.workspace})})`);
    phase('before native parent session readback');
    const renamedParent=await run(`window.lastbrowser.sidekick.getSession(${JSON.stringify({sessionId:parentSessionId,profile:'default',workspacePath:info.workspace})}).then(x=>x.session)`);
    if(renamedParent?.session_id!==parentSessionId||renamedParent?.title!=='E5 child dispatch '+id)throw Error('parent_session_readback_mismatch:'+JSON.stringify(renamedParent));
    phase('before parent sidebar inventory');
    let sidebarState=await run(`(()=>({tabs:[...document.querySelectorAll('.sidebar-drawer-tabs [role="tab"]')].map(el=>({label:el.innerText.trim().slice(0,80),title:String(el.getAttribute('title')||'').slice(0,120),selected:el.getAttribute('aria-selected')})),revealer:Boolean(document.querySelector('.sidekick-sidebar-revealer')),sidebarMode:document.querySelector('.browser-zen-workspace')?.className||''}))()`);
    state.parentSidebarBefore=sidebarState;persist();
    if(sidebarState.tabs.length<2&&sidebarState.sidebarMode.includes('mode-slim')) {
      phase('expand slim sidebar using existing NovaDock control');
      const expanded=await run("(()=>{const button=document.querySelector('.toggle-expand-btn');if(!button)return false;button.click();return true})()");
      if(!expanded)throw Error('sidebar_expand_control_missing');
      await until(()=>run(`document.querySelectorAll('.sidebar-drawer-tabs [role="tab"]').length>=2`),'expanded sidebar drawer tabs');
      sidebarState=await run(`(()=>({tabs:[...document.querySelectorAll('.sidebar-drawer-tabs [role="tab"]')].map(el=>({label:el.innerText.trim().slice(0,80),title:String(el.getAttribute('title')||'').slice(0,120),selected:el.getAttribute('aria-selected')})),revealer:Boolean(document.querySelector('.sidekick-sidebar-revealer')),sidebarMode:document.querySelector('.browser-zen-workspace')?.className||''}))()`);
      state.parentSidebarAfterExpand=sidebarState;persist();
    }
    if(sidebarState.tabs.length<2&&sidebarState.revealer) {
      phase('reveal sidebar through existing revealer control');
      await run("(()=>{const revealer=document.querySelector('.sidekick-sidebar-revealer');if(!revealer)return false;revealer.click();return true})()");
      await until(()=>run(`document.querySelectorAll('.sidebar-drawer-tabs [role="tab"]').length>=2`),'revealed parent sidebar tabs');
      sidebarState=await run(`(()=>({tabs:[...document.querySelectorAll('.sidebar-drawer-tabs [role="tab"]')].map(el=>({label:el.innerText.trim().slice(0,80),title:String(el.getAttribute('title')||'').slice(0,120),selected:el.getAttribute('aria-selected')})),revealer:Boolean(document.querySelector('.sidekick-sidebar-revealer')),sidebarMode:document.querySelector('.browser-zen-workspace')?.className||''}))()`);
      state.parentSidebarAfterReveal=sidebarState;persist();
    }
    if(sidebarState.tabs.length<2)throw Error('parent_sidebar_tab_inventory_invalid:'+JSON.stringify(sidebarState));
    phase('select source-verified second sidebar tab (AI)');
    await run(`(()=>{const tabs=[...document.querySelectorAll('.sidebar-drawer-tabs [role="tab"]')];if(tabs.length<2)throw Error('drawer_tab_index_missing');tabs[1].click();return true})()`);
    await until(()=>run(`document.querySelectorAll('.sidebar-drawer-tabs [role="tab"]')[1]?.getAttribute('aria-selected')==='true'`),'AI drawer selected');
    await until(()=>run(`[...document.querySelectorAll('.sidebar-session-item')].some(el=>el.innerText.includes(${JSON.stringify('E5 child dispatch '+id)}))`),'parent session appears in sidebar');
    await run(`(()=>{const el=[...document.querySelectorAll('.sidebar-session-item')].find(el=>el.innerText.includes(${JSON.stringify('E5 child dispatch '+id)}));if(!el)throw Error('parent sidebar entry missing');el.click();return true})()`);
    await until(()=>run(`[...document.querySelectorAll('.sidebar-session-item')].some(el=>el.innerText.includes(${JSON.stringify('E5 child dispatch '+id)})&&el.classList.contains('is-active'))`),'parent session active in sidebar');
    await until(()=>run(`(()=>{const el=document.querySelector('.native-chat-main');if(!el)return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'})()`),'native chat main visible before parent turn');
    state.parentUiInventory=await domInventory();phase('parent session selected and native-chat-main visible; safe to start turn');
    await run('(()=>{window.__e5Events=[];window.__e5Unsub=window.lastbrowser.sidekick.onChatStreamEvent(e=>window.__e5Events.push(e));return true})()');
    const session = await run(`window.lastbrowser.sidekick.startChat(${JSON.stringify({message:'E5_CHILD_DISPATCH',sessionId:parentSessionId,profile:'default',workspace:info.workspace,model:'child-probe-model',modelProvider:'custom:e5'})})`);
    state.parentSessionId=session.sessionId; state.parentStreamId=session.streamId; state.scope=scope; state.phase='native parent accepted';
    await run(`window.lastbrowser.sidekick.subscribeChatStream(${JSON.stringify({streamId:session.streamId})})`);
    const historyRequest={sessionId:session.sessionId,workspacePath:info.workspace,browserProfileId:'default'};
    let history;
    const captureParentDiagnostics=async()=>run(`(async()=>{
      const request=${JSON.stringify(historyRequest)};
      const [sessionReply,history,streamStatus,policy]=await Promise.all([
        window.lastbrowser.sidekick.getSession(request),
        window.lastbrowser.sidekick.childHistory(request),
        window.lastbrowser.sidekick.getStreamStatus(${JSON.stringify(session.streamId)}).catch(error=>({error:String(error?.message||error)})),
        window.lastbrowser.sidekick.modelPolicy({action:'get',sessionId:${JSON.stringify(session.sessionId)},profile:'default',browserProfileId:'default',workspacePath:${JSON.stringify(info.workspace)}}).catch(error=>({error:String(error?.message||error)}))
      ]);
      return {session:sessionReply?.session?{session_id:sessionReply.session.session_id,status:sessionReply.session.status,updated_at:sessionReply.session.updated_at,
        native_controls:sessionReply.session.native_controls||null,messages:(sessionReply.session.messages||[]).map(m=>({role:m.role,pending:m.pending,streaming:m.streaming,
          tool_calls:m.tool_calls||null,content:String(m.content||'').slice(0,500)}))}:sessionReply,
        history:history||null,streamStatus:streamStatus||null,policy:policy||null,
        events:(window.__e5Events||[]).map(e=>({event:e.event,streamId:e.streamId,nativeContext:e.nativeContext||null,
          data:e.event==='worker_fault'?e.data:e.event==='subagent_event'?e.data:null})),
        ui:{phase:document.querySelector('.native-chat-main')?.innerText?.slice(0,1200)||null,
          bubbles:[...document.querySelectorAll('.child-run-bubble')].map(x=>({open:x.open,text:String(x.textContent||'').slice(0,500)}))}};
    })()`);
    state.parentDiagnosticSamples=[];let lastDiagnosticAt=0;
    await until(async()=>{history=await run(`window.lastbrowser.sidekick.childHistory(${JSON.stringify(historyRequest)})`);
      if(Date.now()-lastDiagnosticAt>=5000){lastDiagnosticAt=Date.now();try{state.parentDiagnosticSamples.push({at:new Date().toISOString(),...await captureParentDiagnostics()});persist();}catch(error){state.parentDiagnosticSamples.push({at:new Date().toISOString(),error:String(error?.message||error)});persist();}}
      return history?.runs?.length===2 && history.runs.every(r=>r.status==='running');},'two actual running backend children',45000);
    state.phase='two children running'; state.children=history.runs.map(r=>({id:r.subagentId,status:r.status,parentTurnId:r.parentTurnId,session:r.childSessionId}));
    state.initialChildHistory=history; persist();
    const bubbles=async()=>run(`(()=>{const el=document.querySelector('.native-chat-main');return el?{text:el.innerText,bubbles:[...el.querySelectorAll('.child-run-bubble')].map(x=>({open:x.open,text:x.textContent,messages:[...x.querySelectorAll('.child-run-message')].map(m=>m.textContent),summary:x.querySelector('summary')?.textContent}))}:null})()`);
    await until(async()=>{const ui=await bubbles(); return ui?.bubbles?.length===2;},'two real child history bubbles');
    const before=await bubbles(); if(!before.bubbles.every(b=>!b.open)) throw Error('child_bubbles_not_collapsed_by_default');
    await run("(()=>{const summaries=document.querySelectorAll('.native-chat-main .child-run-bubble summary');summaries[0].click();summaries[1].click();return true})()");
    await until(async()=>{const ui=await bubbles();return ui?.bubbles?.every(b=>b.open);},'open both child bubbles');
    await until(async()=>{const ui=await bubbles();return ui?.bubbles?.every(b=>b.messages.some(m=>m.includes('CHILD_')&&m.includes('_ONE')));},'simultaneous actual child delta text',30000);
    let streaming=await bubbles();
    state.streamingChildHistory=await run(`window.lastbrowser.sidekick.childHistory(${JSON.stringify(historyRequest)})`);
    state.streamingEvents=await run("window.__e5Events.filter(e=>e.event==='subagent_event').map(e=>e.data?.childEvent).filter(Boolean)");
    state.childReports.push({phase:'simultaneous_open_stream',bubbles:streaming,history:state.streamingChildHistory,events:state.streamingEvents}); persist();
    await run("(()=>{const summary=document.querySelector('.native-chat-main .child-run-bubble summary');if(!summary)return false;summary.click();return true})()");
    await until(async()=>{const ui=await bubbles();return ui?.bubbles?.[0]?.open===false&&ui.bubbles[1].open===true;},'collapse child A while B remains open');
    const collapsedBefore=await bubbles();
    await fetch(info.origin+'/fixture/release',{method:'POST'});
    await until(async()=>{const current=await bubbles();return current?.bubbles?.length===2&&current.bubbles[0].open===false&&current.bubbles[1].open===true&&current.bubbles[0].messages.some(m=>m.includes('_TWO'))&&current.bubbles[1].messages.some(m=>m.includes('_TWO'));},'both children receive final actual delta with A collapsed',30000);
    await until(async()=>{history=await run(`window.lastbrowser.sidekick.childHistory(${JSON.stringify(historyRequest)})`);
      return history?.runs?.length===2&&history.runs.every(r=>r.status==='completed'&&r.sourceActuality==='persisted');},
      'both child histories completed and persisted',30000);
    if(history.runs.some(r=>r.parentSessionId!==session.sessionId||!r.scope
      ||r.scope.backendProfileId!==scope.backendProfileId||r.scope.spaceId!==scope.spaceId
      ||r.scope.browserProfileId!==scope.browserProfileId))throw Error('child_scope_or_parent_mismatch');
    state.finalChildHistory=history;persist();
    const events=await run('window.__e5Events');
    state.streamEvents=events.filter(e=>e.event==='subagent_event').map(e=>e.data?.childEvent).filter(Boolean).map(e=>({id:e.subagentId,kind:e.kind,payload:e.payload}));
    if(!state.streamEvents.some(e=>e.kind==='answer_delta'))throw Error('no_forwarded_child_delta');
    const after=await bubbles();
    state.bubbleEvidence={initial:before.bubbles,streaming:streaming.bubbles,collapsedBefore:collapsedBefore.bubbles,afterCompletion:after.bubbles};
    state.parentTranscript=await run(`window.lastbrowser.sidekick.getSession(${JSON.stringify({sessionId:session.sessionId,profile:'default',workspacePath:info.workspace})}).then(x=>x.session)`);
    state.parentStayedDistinct=!state.parentTranscript.messages.some(m=>String(m.content||'').includes('CHILD_ALPHA_STREAM'));
    if(!state.parentStayedDistinct)throw Error('child_answer_leaked_into_parent');
    state.phase='validated'; state.passed=true; persist();
  } catch(error) { state.error=JSON.stringify({name:error?.name||'Error',message:String(error?.message||error),stack:String(error?.stack||''),rendererError:error?.rendererError||null});
    try {state.failureUi=await run("({phase:document.querySelector('.native-chat-main')?.innerText,bubbles:[...document.querySelectorAll('.child-run-bubble')].map(x=>({open:x.open,text:x.textContent,messages:[...x.querySelectorAll('.child-run-message')].map(m=>m.textContent)})),events:window.__e5Events?.filter(e=>e.event==='subagent_event')})");
      if(state.parentSessionId){state.failureDiagnostics=await captureParentDiagnostics();state.failureHistory=state.failureDiagnostics?.history||null;}
    }catch(failure){state.failureInspectionError=JSON.stringify({name:failure?.name||'Error',message:String(failure?.message||failure),stack:String(failure?.stack||'')});}
    persist(); }
  finally {
    for(const p of processes) if(p.exitCode===null&&p.signalCode===null) try{p.kill();}catch{}
    persist(); app.quit();
    setTimeout(()=>app.exit(state.passed?0:1),30000).unref();
  }
}

if(process.argv.includes('--electron-child')) void electronChild(process.argv[process.argv.indexOf('--electron-child')+1]);
else void main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
