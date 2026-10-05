#!/usr/bin/env node
// Actual source Electron/Main/preload/App + bundled Python Teamwork worker probe.
// All profile, build, fixture, and cleanup targets are unique and owned by this run.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../../..');
const desktop = path.join(root, 'apps', 'desktop');
const runId = randomUUID();
const buildRoot = path.join(root, 'out', `root-teamwork-live-${runId}`);
const output = path.join(root, 'output', `root-teamwork-live-${runId}.json`);
const owned = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-root-teamwork-live-'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function cleanupOwned(target, parent, prefix) {
  const absolute = path.resolve(target), base = path.resolve(parent) + path.sep;
  if (!absolute.startsWith(base) || !path.basename(absolute).startsWith(prefix)) throw Error('unsafe_probe_cleanup');
  fs.rmSync(absolute, { recursive: true, force: true });
}
function findOwnedSpaceManifest(base) {
  const pending = [{ directory: path.resolve(base), depth: 0 }];
  while (pending.length) {
    const { directory, depth } = pending.pop();
    if (depth > 6) continue;
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isFile() && entry.name === 'space.yaml') return target;
      if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push({ directory: target, depth: depth + 1 });
    }
  }
  return null;
}
async function command(exe, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    for (const pipe of [child.stdout, child.stderr]) pipe.on('data', bytes => output += bytes.toString());
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(output) : reject(Error(`command_failed:${code}:${output.slice(-5000)}`)));
  });
}
const models = [
  { provider: 'gpt-fixture', id: 'root-gpt-fixture', display: 'GPT fixture' },
  { provider: 'gemini-fixture', id: 'root-gemini-fixture', display: 'Gemini fixture' },
  { provider: 'ollama-cloud-fixture', id: 'root-ollama-fixture', display: 'Ollama Cloud fixture' },
];
const modelIds = new Set(models.map(item => item.id));
const state = { requests: [], heldWorkers: new Map(), releasedProviders: new Set(), released: false, turnPrompt: false };
let fixture;
const providerFixtures = [];
const providerOrigins = {};
const runStartedAt = Date.now();
let electron;
let appOwned = false;

async function main() {
  const report = { schemaVersion: 1, probe: 'root-teamwork-live-app', runId, output, phases: [],
    providerFixture: models.map(({ provider, id, display }) => ({ provider, model: id, display })),
    actualMain: false, actualPreload: false, actualRenderer: false, actualBundledPython: false,
    workerStarts: [], workerDeltas: [], collapsedDuringDeltas: null, expandedRoster: null, passed: false };
  fs.mkdirSync(buildRoot, { recursive: true });
  fs.writeFileSync(path.join(buildRoot, 'package.json'), JSON.stringify({ type: 'module' }));
  fixture = http.createServer((req, res) => {
    if (req.url === '/state') {
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({
        requests: state.requests, heldWorkers: state.heldWorkers.size, heldProviders: [...state.heldWorkers.keys()],
        releasedProviders: [...state.releasedProviders], released: state.released, turnPrompt: state.turnPrompt })); return;
    }
    if (req.url.startsWith('/release') && req.method === 'POST') {
      const provider = new URL(req.url, 'http://127.0.0.1').searchParams.get('provider');
      const providers = provider ? [provider] : models.map(row => row.provider);
      for (const key of providers) {
        state.releasedProviders.add(key);
        const finish = state.heldWorkers.get(key);
        if (finish) { state.heldWorkers.delete(key); finish(); }
      }
      state.released = models.every(row => state.releasedProviders.has(row.provider));
      res.writeHead(200); res.end('{}'); return;
    }
    res.writeHead(404); res.end();
  });
  const createProviderFixture = endpoint => http.createServer((req, res) => {
    if (req.url.endsWith('/models')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: endpoint.id, context_length: 64000 }] })); return;
    }
    if (!req.url.includes('/chat/completions') || req.method !== 'POST') { res.writeHead(404); res.end(); return; }
    let raw = ''; req.on('data', chunk => raw += chunk); req.on('end', () => {
      let input;
      try { input = JSON.parse(raw); } catch { res.writeHead(400); res.end('{}'); return; }
      const sentinelPresent = (input.messages || []).filter(item => item.role === 'user')
        .some(item => String(item.content || '').includes('ROOT_TEAMWORK_LIVE_SENTINEL'));
      const request = { provider: endpoint.provider, model: input.model, stream: input.stream === true,
        sentinelPresent, elapsedMs: Date.now() - runStartedAt };
      state.requests.push(request);
      if (sentinelPresent) state.turnPrompt = true;
      if (!input.stream) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: 'root-teamwork-fixture', object: 'chat.completion', created: 1, model: input.model,
          choices: [{ index: 0, message: { role: 'assistant', content: 'Controlled fixture planning and review.' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 9, total_tokens: 19 } })); return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', connection: 'close' });
      const send = (delta, finish = null) => res.write('data: ' + JSON.stringify({ id: 'root-teamwork-fixture', object: 'chat.completion.chunk',
        created: 1, model: input.model, choices: [{ index: 0, delta, finish_reason: finish }] }) + '\n\n');
      const deltaText = `LIVE_${endpoint.provider}_${input.model}`;
      send({ role: 'assistant', content: deltaText.slice(0, Math.ceil(deltaText.length / 2)) });
      send({ content: deltaText.slice(Math.ceil(deltaText.length / 2)) });
      const finish = () => { if (res.destroyed) return; send({}, 'stop'); res.end('data: [DONE]\n\n'); };
      if (!state.released && !state.releasedProviders.has(endpoint.provider) && modelIds.has(input.model)) {
        state.heldWorkers.set(endpoint.provider, finish);
        res.once('close', () => { if (state.heldWorkers.get(endpoint.provider) === finish) state.heldWorkers.delete(endpoint.provider); });
      } else finish();
    }); return;
  });

  let writtenReport = false;
  try {
    await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${fixture.address().port}`;
    for (const model of models) {
      const server = createProviderFixture(model);
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      providerFixtures.push(server);
      providerOrigins[model.provider] = `http://127.0.0.1:${server.address().port}`;
    }
    assert.equal(new Set(Object.values(providerOrigins)).size, models.length,
      'each fixture provider has its own origin so host-based admission stays provider-specific');
    const runtime = path.join(owned, 'user-data', 'runtime');
    const userData = path.join(owned, 'user-data');
    const workspace = path.join(owned, 'workspace');
    const guard = path.join(owned, 'guard');
    for (const dir of [runtime, workspace, guard, path.join(runtime, 'webui'), path.join(owned, 'user-home'),
      path.join(owned, 'app-data'), path.join(owned, 'local-app-data'), path.join(owned, 'tmp'), path.join(owned, 'downloads'),
      path.join(owned, 'empty-gh')]) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(root, 'scripts', 'probe-full-app-network-guard.py'), path.join(guard, 'sitecustomize.py'));
    const config = { workspace, model: { provider: 'custom:gpt-fixture', default: models[0].id,
      base_url: `${providerOrigins['gpt-fixture']}/v1`, api_key: 'local-fixture', context_length: 64000 },
      custom_providers: models.map(({ provider, id }) => ({ name: provider, base_url: `${providerOrigins[provider]}/v1`, api_key: 'local-fixture',
        models: { [id]: { context_length: 64000 } } })) };
    fs.writeFileSync(path.join(runtime, 'config.yaml'), JSON.stringify(config));
    fs.writeFileSync(path.join(runtime, 'teamwork.json'), JSON.stringify({ enabled: true, strategy: 'balanced', auto_scale: false,
      max_subagents: 4, shared_grounding: false, roles: { planner: 'auto', worker_pool: models.map(item => item.id), critic: 'auto', synthesizer: 'auto' },
      hot_swap: { enabled: false, fallback_quorum_min: 1 } }, null, 2));
    fs.writeFileSync(path.join(runtime, 'webui', 'workspaces.json'), JSON.stringify([{ name: 'Root Teamwork controlled workspace', path: workspace }]));
    fs.writeFileSync(path.join(runtime, '.env'), `HTTP_PROXY=${origin}\nHTTPS_PROXY=${origin}\nALL_PROXY=${origin}\nNO_PROXY=localhost,127.0.0.1\n`);
    fs.writeFileSync(path.join(owned, 'bootstrap.json'), JSON.stringify({ buildRoot, owned, runtime, userData, workspace, origin, providerOrigins }));

    report.phases.push('isolated_source_build');
    await command(process.execPath, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', path.join(desktop, 'tsconfig.main.json'), '--outDir', path.join(buildRoot, 'main')], root);
    await require('esbuild').build({ entryPoints: [path.join(desktop, 'src', 'main', 'preload.ts')], outfile: path.join(buildRoot, 'main', 'preload.cjs'),
      bundle: true, platform: 'node', format: 'cjs', target: 'node20', external: ['electron'] });
    await command(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config',
      path.join(desktop, 'vite.config.ts'), '--outDir', path.join(buildRoot, 'renderer')], desktop);

    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)$/i.test(key)
      || /^(?:SIDEKICK|HERMES|LASTBROWSER)_/.test(key) || ['ELECTRON_RUN_AS_NODE', 'PYTHONPATH', 'PYTHONHOME'].includes(key)) delete env[key];
    Object.assign(env, { LASTBROWSER_FULL_APP_PROBE_ROOT: owned,
      LASTBROWSER_WEBUI_PYTHON: path.join(desktop, 'runtime', 'python', 'python.exe'), LASTBROWSER_ENABLE_CDP: '0',
      LASTBROWSER_DOWNLOADS_DIR: path.join(owned, 'downloads'), PYTHONPATH: guard, PYTHONDONTWRITEBYTECODE: '1',
      PYTHONNOUSERSITE: '1', PYTHONUNBUFFERED: '1', SIDEKICK_BASE_HOME: runtime, SIDEKICK_WEBUI_DEFAULT_WORKSPACE: workspace,
      USERPROFILE: path.join(owned, 'user-home'), HOME: path.join(owned, 'user-home'), APPDATA: path.join(owned, 'app-data'),
      LOCALAPPDATA: path.join(owned, 'local-app-data'), TEMP: path.join(owned, 'tmp'), TMP: path.join(owned, 'tmp'),
      GH_CONFIG_DIR: path.join(owned, 'empty-gh'), HTTP_PROXY: origin, HTTPS_PROXY: origin, ALL_PROXY: origin,
      NO_PROXY: 'localhost,127.0.0.1' });
    electron = spawn(require('electron'), [__filename, '--electron-child', owned], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let childLog = '';
    electron.stdout.on('data', chunk => childLog += chunk.toString()); electron.stderr.on('data', chunk => childLog += chunk.toString());
    const exit = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { if (electron.exitCode === null) electron.kill(); }, 240000);
      electron.once('error', reject); electron.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
    });
    report.childExit = exit;
    report.childLog = childLog.slice(-10000);
    const childPath = path.join(owned, 'child-report.json');
    if (fs.existsSync(childPath)) {
      const childReport = JSON.parse(fs.readFileSync(childPath, 'utf8'));
      Object.assign(report, childReport);
      if (childReport.error) report.childFailure = childReport.error;
    }
    const auditPath = path.join(owned, 'python-audit.jsonl');
    if (fs.existsSync(auditPath)) report.pythonAudit = fs.readFileSync(auditPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    assert.equal(exit.code, 0, 'actual Electron/Main/Preload/App process exits successfully');
    assert.equal(report.passed, true, report.error || 'Teamwork UI assertions passed');
    report.finishedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2)); writtenReport = true;
    appOwned = true;
    console.log(JSON.stringify({ output, passed: report.passed, workerStarts: report.workerStarts,
      workerDeltas: report.workerDeltas, collapsedDuringDeltas: report.collapsedDuringDeltas,
      expandedRoster: report.expandedRoster, python: report.python }, null, 2));
  } catch (error) {
    report.error = String(error?.stack || error); report.passed = false; report.finishedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2)); writtenReport = true;
    throw error;
  } finally {
    if (electron && electron.exitCode === null && electron.signalCode === null) electron.kill();
    state.released = true;
    for (const model of models) state.releasedProviders.add(model.provider);
    for (const finish of state.heldWorkers.values()) finish();
    state.heldWorkers.clear();
    for (const server of [fixture, ...providerFixtures]) {
      if (server?.listening) await new Promise(resolve => server.close(resolve));
    }
    cleanupOwned(buildRoot, path.join(root, 'out'), 'root-teamwork-live-');
    if (writtenReport) cleanupOwned(owned, os.tmpdir(), 'lastbrowser-root-teamwork-live-');
  }
}

async function electronChild() {
  const { app, BrowserWindow, ipcMain } = require('electron');
  const ownedArg = path.resolve(process.argv[process.argv.indexOf('--electron-child') + 1]);
  assert.equal(ownedArg, process.env.LASTBROWSER_FULL_APP_PROBE_ROOT);
  const info = JSON.parse(fs.readFileSync(path.join(ownedArg, 'bootstrap.json'), 'utf8'));
  const report = { actualMain: true, actualPreload: false, actualRenderer: false, actualBundledPython: false,
    workerStarts: [], workerDeltas: [], passed: false };
  app.setPath('userData', info.userData); app.setPath('sessionData', path.join(info.userData, 'session'));
  app.setPath('home', path.join(ownedArg, 'user-home')); app.setPath('appData', path.join(ownedArg, 'app-data'));
  app.isDefaultProtocolClient = () => true; app.setAsDefaultProtocolClient = () => { throw Error('probe_os_registration_denied'); };
  app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost');
  let window;
  const run = expression => window.webContents.executeJavaScript(expression, true);
  const until = async (check, label, timeoutMs = 45000) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) { try { if (await check()) return; } catch {} await sleep(120); }
    throw Error('timeout:' + label);
  };
  const fixtureState = async () => (await fetch(info.origin + '/state')).json();
  const reportPath = path.join(ownedArg, 'child-report.json');
  const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const safeEvents = events => events.slice(-100).map(event => {
    const source = event && event.data && typeof event.data === 'object' ? event.data : {};
    const data = {};
    for (const key of ['stage', 'errorCode', 'errorType', 'provider', 'provider_id', 'providerId', 'model', 'model_id',
      'modelId', 'worker_id', 'worker_index', 'attempt', 'role', 'status', 'failure_code', 'mode', 'provider_count']) {
      const value = source[key];
      if (typeof value === 'string' && value.length <= 160 || typeof value === 'number' && Number.isFinite(value)) data[key] = value;
    }
    if (Array.isArray(source.candidate_rejections)) data.candidate_rejections = source.candidate_rejections.slice(0, 64).map(row => {
      const safe = {};
      for (const key of ['provider', 'model', 'code']) {
        if (typeof row?.[key] === 'string' && row[key].length <= 160) safe[key] = row[key];
      }
      return safe;
    });
    const context = event?.nativeContext;
    const nativeContext = context && typeof context === 'object' ? {
      schemaVersion: context.schemaVersion, sessionId: context.sessionId, streamId: context.streamId,
      writerGeneration: context.writerGeneration,
      scope: context.scope && typeof context.scope === 'object' ? { browserProfileId: context.scope.browserProfileId } : undefined,
    } : null;
    return { event: event?.event, observedAtMs: Number.isFinite(event?.probeObservedAtMs) ? event.probeObservedAtMs : null,
      data, nativeContext };
  });
  const spaceSnapshot = () => {
    const manifest = findOwnedSpaceManifest(ownedArg);
    if (!manifest) return { manifestFound: false, enrolled: null, yolo: null, sha256: null };
    const bytes = fs.readFileSync(manifest);
    const contents = bytes.toString('utf8');
    return { manifestFound: true, path: manifest.slice(ownedArg.length + 1),
      enrolled: /(?:^|\n)\s*enrolled\s*:\s*true\s*(?:#.*)?(?:\n|$)/i.test(contents),
      yolo: /(?:^|\n)\s*yolo\s*:\s*true\s*(?:#.*)?(?:\n|$)/i.test(contents),
      sha256: createHash('sha256').update(bytes).digest('hex') };
  };
  process.on('uncaughtException', error => { report.error = String(error?.stack || error); report.passed = false; save(); });
  process.on('unhandledRejection', error => { report.error = String(error?.stack || error); report.passed = false; save(); });
  app.once('will-quit', save);
  report.phase = 'electron_child_started'; save();
  const originalHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, handler) => originalHandle(channel, async (event, ...args) => {
    const value = await handler(event, ...args);
    if (channel === 'lastbrowser:sidekick:startChat') report.actualMainStartChatCalls = (report.actualMainStartChatCalls || 0) + 1;
    return value;
  });
  try {
    await import(require('node:url').pathToFileURL(path.join(info.buildRoot, 'main', 'main.js')).href);
    report.phase = 'source_main_imported'; save();
    await app.whenReady();
    await until(() => { window = BrowserWindow.getAllWindows().find(item => !item.isDestroyed() && item.webContents.getURL().startsWith('app://')); return Boolean(window); }, 'actual Main BrowserWindow');
    await until(() => run('Boolean(window.lastbrowser&&window.lastbrowser.sidekick&&window.lastbrowser.independent&&document.querySelector(".app-shell"))'), 'actual source App and preload');
    report.actualPreload = true; report.actualRenderer = true;
    report.phase = 'source_app_and_preload_ready'; save();
    window.minimize();
    await until(() => run("window.lastbrowser.services.status().then(s=>s.sidekick==='ready'&&s.webuiHealth==='ready')"), 'real bundled Python backend', 70000);
    report.python = await run('window.lastbrowser.services.status()');
    assert.equal(report.python.runtimeDir, info.runtime);
    report.spaceEnrollmentBefore = spaceSnapshot();
    report.actualBundledPython = true;
    report.phase = 'bundled_python_ready'; save();
    await run(`localStorage.setItem('lastbrowser.activePanel','chat');localStorage.setItem('lastbrowser.layoutMode.v1','classic');localStorage.setItem('lastbrowser.activeSpacePath.v1',${JSON.stringify(info.workspace)});window.location.reload();true`);
    await until(() => run("Boolean(document.querySelector('.app-shell.panel-chat:not(.modern-mode)'))"), 'actual native chat panel', 45000);
    const skip = await run("(()=>{const b=[...document.querySelectorAll('button')].find(e=>/browse without|skip without|ohne ki|without ai/i.test(e.innerText+' '+e.getAttribute('aria-label')));if(b){b.click();return true}return false})()");
    if (skip) await until(() => run("!document.querySelector('[role=dialog][aria-label=\"First-run setup\"]')"), 'first-run skip');
    await until(() => run("Boolean(document.querySelector('.native-chat-main .new-chat-btn'))"), 'native chat composer route');
    await run("document.querySelector('.native-chat-main .new-chat-btn').click();true");
    await until(() => run("Boolean(document.querySelector('.native-chat-main form.chat-composer textarea'))"), 'actual chat session and composer');
    report.phase = 'native_composer_ready'; save();
    const modelPickerOpened = await run("(()=>{if([...document.querySelectorAll('.native-chat-main select')].some(s=>[...s.options].some(o=>o.value==='teamwork')))return 'select';const trigger=document.querySelector('.native-chat-main .composer-model-trigger');if(!trigger)return false;trigger.click();return 'manual-picker'})()");
    assert.ok(modelPickerOpened, 'the active composer exposes a model picker');
    await until(() => run("Boolean([...document.querySelectorAll('.native-chat-main select')].some(s=>[...s.options].some(o=>o.value==='teamwork'))||[...document.querySelectorAll('#composer-manual-models button')].some(b=>/teamwork/i.test(b.innerText+' '+b.title)))"), 'Teamwork virtual model in scoped composer catalog', 75000);
    report.phase = 'teamwork_option_ready'; save();
    const modelSelectResult = await run("(()=>{const s=[...document.querySelectorAll('.native-chat-main select')].find(x=>[...x.options].some(o=>o.value==='teamwork'));if(s){s.value='teamwork';s.dispatchEvent(new Event('change',{bubbles:true}));return 'select'}const b=[...document.querySelectorAll('#composer-manual-models button')].find(x=>/teamwork/i.test(x.innerText+' '+x.title));if(!b)return false;b.click();return 'manual-picker'})()");
    assert.ok(modelSelectResult, 'Teamwork is selectable from the active composer model controls');
    await until(() => run('window.lastbrowser.independent.request({schemaVersion:1,operation:"resolveScope",payload:{browserProfileId:"default",workspacePath:' + JSON.stringify(info.workspace) + '}}).then(async r=>r.ok&&(await window.lastbrowser.independent.request({schemaVersion:1,operation:"modelSelection",scope:r.value.scope,payload:{action:"get",includeCatalog:false}})).value?.model==="teamwork")'), 'persisted scoped Teamwork selection');
    const scopeSelection = { browserProfileId: 'default', workspacePath: info.workspace };
    const preflight = await run(`window.lastbrowser.sidekick.requestWebui({method:'GET',path:'/api/teamwork/status',scopeSelection:${JSON.stringify(scopeSelection)}})`);
    const modelRows = Array.isArray(preflight?.models) ? preflight.models.filter(row => row && typeof row.id === 'string' && typeof row.provider === 'string') : [];
    const perProvider = [...new Map(modelRows.map(row => [row.provider, row])).values()].slice(0, 3);
    assert.equal(perProvider.length, 3, 'scoped Teamwork status exposes three distinct ready fixture catalog providers');
    const poolIds = perProvider.map(row => row.id);
    assert.equal(new Set(poolIds).size, 3, 'three distinct actual catalog model IDs are selected');
    const configured = await run(`window.lastbrowser.sidekick.requestWebui({method:'POST',path:'/api/teamwork/config',scopeSelection:${JSON.stringify(scopeSelection)},body:{roles:{worker_pool:${JSON.stringify(poolIds)}}}})`);
    assert(configured?.ok === true, 'isolated Teamwork settings accept only the actual ready catalog IDs');
    report.teamworkPreflight = { mode: preflight.mode, modelsCount: preflight.models_count,
      providerIds: preflight.provider_ids, configuredWorkerPool: poolIds };
    const manifest = findOwnedSpaceManifest(ownedArg);
    if (manifest) {
      const text = fs.readFileSync(manifest, 'utf8');
      report.spaceEnrollment = { manifestFound: true, path: manifest.slice(ownedArg.length + 1),
        enrolled: /(?:^|\n)\s*enrolled\s*:\s*true\s*(?:#.*)?(?:\n|$)/i.test(text),
        yolo: /(?:^|\n)\s*yolo\s*:\s*true\s*(?:#.*)?(?:\n|$)/i.test(text) };
    }
    if (!report.spaceEnrollment) report.spaceEnrollment = { manifestFound: false, enrolled: null, yolo: null };
    await run('window.__rootTeamworkEvents=[];window.__rootTeamworkRelease=window.lastbrowser.sidekick.onChatStreamEvent(event=>window.__rootTeamworkEvents.push({...event,probeObservedAtMs:performance.now()}));true');
    await run(`(()=>{const t=document.querySelector('.native-chat-main form.chat-composer textarea');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(t,'ROOT_TEAMWORK_LIVE_SENTINEL: compare the three configured providers and report their distinct contributions.');t.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
    await until(() => run("document.querySelector('.native-chat-main form.chat-composer button[type=submit]')?.disabled===false"), 'actual native Teamwork send button enabled');
    await run("document.querySelector('.native-chat-main form.chat-composer button[type=submit]').click();true");
    await until(async () => {
      const events = await run("window.__rootTeamworkEvents||[]");
      report.eventTrace = safeEvents(events);
      report.workerFaults = report.eventTrace.filter(event => event.event === 'worker_fault').map(event => event.data);
      report.workerEnds = report.eventTrace.filter(event => event.event === 'teamwork_worker_end').map(event => event.data);
      report.providerFailures = report.workerEnds.filter(event => event.status !== 'complete');
      report.candidateRejections = report.eventTrace.flatMap(event => event.data?.candidate_rejections || []);
      report.workerStarts = report.eventTrace.filter(event => event.event === 'teamwork_worker_start');
      report.workerDeltas = report.eventTrace.filter(event => event.event === 'teamwork_worker_delta');
      const card = await run("document.querySelector('.teamwork-process-card')");
      const state = await fixtureState();
      const terminal = events.findLast(event => ['error', 'apperror', 'cancel', 'stream_end', 'worker_exit'].includes(event.event));
      const singleProvider = events.some(event => event.event === 'teamwork_stage' && event.data?.stage === 'single_provider');
      if (singleProvider) throw Error('unexpected_single_provider_reduced_mode');
      const deltaProviders = [...new Set(report.workerDeltas.map(event => event.data?.provider_id).filter(Boolean))];
      if (deltaProviders.length >= 2 && !report.staggerRelease) {
        const fixtureProvider = provider => provider.startsWith('custom:') ? provider.slice('custom:'.length) : provider;
        const providerToRelease = deltaProviders.map(providerId => ({ providerId, fixtureProvider: fixtureProvider(providerId) }))
          .find(row => state.heldProviders.includes(row.fixtureProvider));
        if (providerToRelease) {
          await fetch(`${info.origin}/release?provider=${encodeURIComponent(providerToRelease.fixtureProvider)}`, { method: 'POST' });
          report.staggerRelease = { trigger: 'two_distinct_provider_deltas', releasedProviderId: providerToRelease.providerId,
            releasedFixtureProvider: providerToRelease.fixtureProvider,
            observedProviders: deltaProviders };
        }
      }
      if (terminal && !report.staggerRelease && (report.workerStarts.length < 3 || deltaProviders.length < 3)) {
        const latestFixture = report.staggerRelease ? await fixtureState() : state;
        throw Error('teamwork_terminal_before_three_live_workers:' + JSON.stringify({
          event: terminal.event, types: events.map(event => event.event),
          workerFaults: report.workerFaults, workerEnds: report.workerEnds,
          candidateRejections: report.candidateRejections,
          fixtureRequestCounts: Object.fromEntries(models.map(row => [row.provider,
            latestFixture.requests.filter(request => request.provider === row.provider).length])),
          heldProviders: latestFixture.heldProviders, staggerRelease: report.staggerRelease }));
      }
      report.effectiveMode = 'multi_provider';
      return card && report.workerStarts.length >= 3 && deltaProviders.length >= 3 && state.heldWorkers >= 1;
    }, 'authoritative effective Teamwork mode and live fixture output in actual App', 90000);
    const firstCard = await run("(()=>{const c=document.querySelector('.teamwork-process-card');return c?{expanded:c.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded'),text:c.innerText}:null})()");
    assert(firstCard, 'actual renderer displayed Teamwork card');
    assert.equal(firstCard.expanded, 'false', 'card starts collapsed in actual App');
    assert.equal(report.effectiveMode, 'multi_provider', 'only actual three-provider Teamwork counts as a pass');
    assert(report.workerStarts.length >= 3 && report.workerDeltas.length >= 3);
    const eventContextOk = [...report.workerStarts, ...report.workerDeltas].every(event => event.nativeContext
      && event.nativeContext.schemaVersion === 1 && event.nativeContext.sessionId && event.nativeContext.streamId
      && event.nativeContext.writerGeneration && event.nativeContext.scope?.browserProfileId === 'default');
    assert(eventContextOk, 'Main nativeContext provenance is present on live events');
    report.collapsedDuringDeltas = { expanded: firstCard.expanded, visibleText: firstCard.text,
      starts: report.workerStarts.length, deltas: report.workerDeltas.length, actualServerHeldStreams: (await fixtureState()).heldWorkers };
    const cardButton = await run("document.querySelector('.teamwork-process-card button[aria-expanded]')");
    assert(cardButton);
    await run("document.querySelector('.teamwork-process-card button[aria-expanded]').click();true");
    const expanded = await run("(()=>{const c=document.querySelector('.teamwork-process-card');return {expanded:c.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded'),text:c.innerText}})()");
    assert.equal(expanded.expanded, 'true');
    const actualContributions = report.workerStarts.map(event => ({
      provider: event.data.provider_id,
      model: event.data.model_id,
    }));
    for (const contribution of actualContributions) {
      assert(expanded.text.includes(contribution.provider), `expanded contribution includes provider ${contribution.provider}`);
      assert(expanded.text.includes(contribution.model), `expanded contribution includes call model ${contribution.model}`);
    }
    report.expandedRoster = { expanded: expanded.expanded, mode: report.effectiveMode,
      showsAllFixtureModels: actualContributions.every(contribution =>
        expanded.text.includes(contribution.provider) && expanded.text.includes(contribution.model)), text: expanded.text };
    assert.equal(report.expandedRoster.showsAllFixtureModels, true);
    await fetch(info.origin + '/release', { method: 'POST' });
    await until(async () => {
      const state = await fixtureState();
      return state.released && state.heldWorkers === 0 && (await run("(()=>{const text=document.querySelector('.teamwork-process-card')?.innerText||'';return /Complete|Abgeschlossen|Completado|Terminé|Completato|Concluído|Завершено|完了/.test(text)})()"));
    }, 'persisted Teamwork final answer after provider fixture release', 90000);
    const streamEvents = await run('window.__rootTeamworkEvents.map(event=>event.event)');
    assert(streamEvents.includes('teamwork_complete'));
    assert(streamEvents.includes('stream_end') || streamEvents.includes('worker_exit'));
    report.streamEvents = streamEvents;
    report.fixture = await fixtureState();
    report.fixtureRequestCounts = Object.fromEntries(models.map(row => [row.provider,
      report.fixture.requests.filter(request => request.provider === row.provider).length]));
    report.workerFailureDiagnostics = report.workerEnds.map(event => {
      const fixtureModel = models.find(row => row.id === event.model_id);
      const requestCount = fixtureModel ? report.fixtureRequestCounts[fixtureModel.provider] : null;
      return { providerId: event.provider_id, modelId: event.model_id, role: event.role, status: event.status,
        failureCode: event.failure_code || null, fixtureRequestCount: requestCount,
        requestBoundary: requestCount === null ? 'unmapped_model' : requestCount === 0 ? 'no_fixture_request_observed' : 'fixture_request_observed' };
    });
    assert(report.staggerRelease, 'two provider streams were observed before releasing one to free a compute slot');
    report.spaceEnrollmentAfter = spaceSnapshot();
    assert.deepEqual(report.spaceEnrollmentAfter, report.spaceEnrollmentBefore,
      'Space enrollment manifest stayed byte-for-byte unchanged during the isolated probe');
    report.actualMainStartChatCalls = report.actualMainStartChatCalls || 0;
    assert(report.actualMainStartChatCalls > 0, 'turn went through the real Main startChat IPC');
    assert(report.fixture.requests.length >= 6, 'actual fixture request count proves planner, workers and synthesis');
    report.passed = true;
  } catch (error) {
    report.error = String(error?.stack || error);
    try {
      const events = await run('(window.__rootTeamworkEvents||[])');
      report.eventTrace = safeEvents(events);
      report.workerFaults = report.eventTrace.filter(event => event.event === 'worker_fault').map(event => event.data);
      report.workerEnds = report.eventTrace.filter(event => event.event === 'teamwork_worker_end').map(event => event.data);
      report.providerFailures = report.workerEnds.filter(event => event.status !== 'complete');
      report.candidateRejections = report.eventTrace.flatMap(event => event.data?.candidate_rejections || []);
    } catch {}
    try { report.failureUi = await run("({app:document.querySelector('.app-shell')?.innerText?.slice(0,1200),chat:document.querySelector('.native-chat-main')?.innerText?.slice(0,2000),events:(window.__rootTeamworkEvents||[]).map(e=>e.event)})"); } catch {}
    report.fixture = await fixtureState().catch(() => null);
    report.fixtureRequestCounts = Object.fromEntries(models.map(row => [row.provider,
      (report.fixture?.requests || []).filter(request => request.provider === row.provider).length]));
    report.workerFailureDiagnostics = report.workerEnds?.map(event => {
      const fixtureModel = models.find(row => row.id === event.model_id);
      const requestCount = fixtureModel ? report.fixtureRequestCounts[fixtureModel.provider] : null;
      return { providerId: event.provider_id, modelId: event.model_id, role: event.role, status: event.status,
        failureCode: event.failure_code || null, fixtureRequestCount: requestCount,
        requestBoundary: requestCount === null ? 'unmapped_model' : requestCount === 0 ? 'no_fixture_request_observed' : 'fixture_request_observed' };
    }) || [];
    report.spaceEnrollmentAfter = spaceSnapshot();
    report.phase = 'child_assertion_failed'; save();
  } finally {
    try { await fetch(info.origin + '/release', { method: 'POST' }); } catch {}
    if (window && !window.isDestroyed()) window.close();
    save();
    setTimeout(() => app.exit(report.passed ? 0 : 1), 800).unref();
  }
}

if (process.argv.includes('--electron-child')) void electronChild().catch(error => { console.error(error); process.exitCode = 1; });
else void main().catch(error => { console.error(error); process.exitCode = 1; });
