#!/usr/bin/env node
/** Source-only cold-start diagnosis. Own synthetic homes, no account/VM access.
 * Observe genuine Main/App/preload without changing window/GPU/readiness policy.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { randomUUID, createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const phase = (name, detail = {}) => console.log('[startup-readiness] ' + JSON.stringify({ phase: name, ...detail }));

async function command(executable, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { output = (output + bytes).slice(-10000); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(Error('build_' + code + ':' + output)));
  });
}

async function parent() {
  const id = randomUUID();
  const owned = path.join(root, 'output', 'startup-readiness-' + id);
  const buildRoot = path.join(root, 'out', 'startup-readiness-' + id);
  const userData = path.join(owned, 'profile', 'user-data');
  const runtime = path.join(userData, 'runtime');
  const ownHome = path.join(owned, 'profile', 'home');
  const workspace = path.join(ownHome, 'workspace');
  const python = process.env.STARTUP_PROBE_PYTHON;
  const electron = process.env.STARTUP_PROBE_ELECTRON;
  const esbuild = process.env.ESBUILD_BINARY_PATH;
  for (const [name, file] of Object.entries({ python, electron, esbuild })) if (!file || !fs.existsSync(file)) throw Error('required_existing_dependency_' + name);
  for (const directory of [owned, buildRoot, userData, runtime, ownHome, workspace, path.join(runtime, 'webui'),
    path.join(owned, 'profile', 'guard'), path.join(owned, 'profile', 'temp'), path.join(owned, 'profile', 'app-data'),
    path.join(owned, 'profile', 'local-app-data')]) fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(buildRoot, 'package.json'), '{"type":"module"}');
  const files = ['main/main.ts', 'main/preload.ts', 'main/window-chrome.ts', 'main/app-protocol.ts', 'main/app-startup.ts', 'main/drm.ts', 'renderer/main.tsx', 'renderer/App.tsx'];
  const report = { schemaVersion: 1, sourceHead: '236727b2d2acb388fa6300e7022cb3f9ad7c535a', startedAt: new Date().toISOString(),
    owned, buildRoot, sourceHashes: Object.fromEntries(files.map(file => [file, sha(path.join(root, 'apps/desktop/src', file))])),
    dependencyPaths: { python, electron, esbuild }, launches: [], providerInferenceRequests: 0, externalRequests: [],
    limits: ['Source build under pinned existing Castlabs Electron; not installed Guest ASAR or VM proof',
      'Synthetic configured loopback provider; no credential or SDK inference',
      'Default-browser state forced true and protocol writes prohibited for OS safety',
      'Main capturePage/DOM/paint timing evidence; no human native-window acceptance',
      'Parent windowsHide restored with showInactive for controlled pixel observation; no focus request'] };
  const sockets = new Set();
  const server = http.createServer((request, response) => {
    if (request.method === 'CONNECT' || /^https?:/.test(request.url)) {
      report.externalRequests.push({ transport: 'proxy', method: request.method });
      response.writeHead(403); response.end(); return;
    }
    if (request.url.includes('completions') || request.url.includes('responses')) report.providerInferenceRequests++;
    response.writeHead(request.url === '/v1/models' ? 200 : 403, { 'content-type': 'application/json' });
    response.end(request.url === '/v1/models' ? '{"data":[{"id":"startup-fixture","context_length":64000}]}' : '{}');
  });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  server.on('connect', (_request, socket) => { report.externalRequests.push({ transport: 'proxy', method: 'CONNECT' }); socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  fs.writeFileSync(path.join(runtime, 'config.yaml'), JSON.stringify({ workspace,
    model: { provider: 'custom:startup', default: 'startup-fixture', base_url: origin + '/v1', api_key: 'synthetic-loopback-only', context_length: 64000 },
    custom_providers: [{ name: 'startup', base_url: origin + '/v1', api_key: 'synthetic-loopback-only', models: { 'startup-fixture': { context_length: 64000 } } }] }));
  fs.writeFileSync(path.join(runtime, 'webui/workspaces.json'), JSON.stringify([{ name: 'Synthetic startup workspace', path: workspace }]));
  fs.writeFileSync(path.join(runtime, '.env'), `HTTP_PROXY=${origin}\nHTTPS_PROXY=${origin}\nALL_PROXY=${origin}\nNO_PROXY=localhost,127.0.0.1\n`);
  fs.copyFileSync(path.join(root, 'scripts/probe-full-app-network-guard.py'), path.join(owned, 'profile/guard/sitecustomize.py'));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/(API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key) || /^(SIDEKICK|HERMES|LASTBROWSER)_/.test(key)
    || ['ELECTRON_RUN_AS_NODE', 'PYTHONPATH', 'PYTHONHOME'].includes(key)) delete env[key];
  Object.assign(env, { LASTBROWSER_FULL_APP_PROBE_ROOT: path.join(owned, 'profile'), LASTBROWSER_WEBUI_PYTHON: python,
    LASTBROWSER_DOWNLOADS_DIR: path.join(owned, 'profile/downloads'), LASTBROWSER_ENABLE_CDP: '0',
    SIDEKICK_BASE_HOME: runtime, SIDEKICK_WEBUI_DEFAULT_WORKSPACE: workspace,
    PYTHONPATH: path.join(owned, 'profile/guard'), PYTHONDONTWRITEBYTECODE: '1', PYTHONNOUSERSITE: '1', PYTHONUNBUFFERED: '1',
    USERPROFILE: ownHome, HOME: ownHome, APPDATA: path.join(owned, 'profile/app-data'), LOCALAPPDATA: path.join(owned, 'profile/local-app-data'),
    TEMP: path.join(owned, 'profile/temp'), TMP: path.join(owned, 'profile/temp'),
    GH_CONFIG_DIR: path.join(owned, 'profile/empty-gh'), HTTP_PROXY: origin, HTTPS_PROXY: origin, ALL_PROXY: origin, NO_PROXY: 'localhost,127.0.0.1' });
  try {
    phase('build_source');
    await command(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'apps/desktop/tsconfig.main.json', '--outDir', path.join(buildRoot, 'main')], root, env);
    await command(esbuild, ['apps/desktop/src/main/preload.ts', '--bundle', '--platform=node', '--format=cjs', '--target=node20', '--external:electron', '--outfile=' + path.join(buildRoot, 'main/preload.cjs')], root, env);
    await command(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.config.ts', '--outDir', path.join(buildRoot, 'renderer')], path.join(root, 'apps/desktop'), env);
    for (const mode of ['fresh', 'persisted-settings']) {
      phase('launch', { mode });
      const bootstrap = { mode, buildRoot, owned, userData, ownHome };
      fs.writeFileSync(path.join(owned, 'bootstrap.json'), JSON.stringify(bootstrap));
      const child = spawn(electron, [__filename, '--electron-child', owned], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let log = '';
      for (const pipe of [child.stdout, child.stderr]) pipe.on('data', bytes => { log = (log + bytes).slice(-20000); });
      const timer = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); }, 115000);
      const exit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
      clearTimeout(timer);
      const file = path.join(owned, mode + '.json');
      const result = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { error: 'child_report_missing' };
      result.exit = exit; result.logTail = log.slice(-6000); report.launches.push(result);
      await sleep(1800);
      result.runningOwnedChildrenAfterExit = (result.ownedChildren || []).filter(({ pid }) => {
        try { process.kill(pid, 0); return true; } catch { return false; }
      }).map(({ pid }) => pid);
      if (exit.code !== 0 || !result.passed) throw Error('launch_failed:' + mode + ':' + result.error);
      if (result.runningOwnedChildrenAfterExit.length) throw Error('owned_child_cleanup_not_confirmed:' + mode);
    }
    report.passed = report.providerInferenceRequests === 0 && report.launches.every(row => row.passed);
  } catch (error) { report.error = error.message; report.passed = false; }
  finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
    report.completedAt = new Date().toISOString();
    fs.writeFileSync(path.join(owned, 'report.json'), JSON.stringify(report, null, 2));
    phase('complete', { passed: report.passed, error: report.error, report: path.join(owned, 'report.json') });
    process.exitCode = report.passed ? 0 : 1;
  }
}

async function child() {
  const { app, BrowserWindow, dialog, session, components } = require('electron');
  const owned = path.resolve(process.argv[process.argv.indexOf('--electron-child') + 1]);
  const info = JSON.parse(fs.readFileSync(path.join(owned, 'bootstrap.json'), 'utf8'));
  const started = Date.now();
  const result = { mode: info.mode, events: [], samples: [], rendererExceptions: [], rendererMessages: [], externalMainFetches: [],
    processGone: [], nativeDialogs: [], ownedChildren: [], passed: false, electronVersion: process.versions.electron };
  const write = () => fs.writeFileSync(path.join(owned, info.mode + '.json'), JSON.stringify(result, null, 2));
  const event = (kind, fields = {}) => { result.events.push({ kind, elapsedMs: Date.now() - started, ...fields }); write(); };
  app.on('ready', () => event('app-ready', { componentStatus: components?.status() }));
  if (components?.whenReady) {
    const actualWhenReady = components.whenReady.bind(components);
    components.whenReady = (...args) => {
      event('components-whenReady-called', { required: args[0] ?? 'default_all_supported', componentStatus: components.status() });
      return actualWhenReady(...args).then(value => { event('components-whenReady-resolved', { componentStatus: components.status() }); return value; },
        error => { event('components-whenReady-rejected', { message: error.message, componentStatus: components.status() }); throw error; });
    };
  }
  app.setPath('userData', info.userData);
  app.setPath('sessionData', path.join(info.userData, 'session'));
  app.setPath('home', info.ownHome);
  app.setPath('appData', path.join(owned, 'profile/app-data'));
  app.isDefaultProtocolClient = () => true;
  app.setAsDefaultProtocolClient = () => { throw Error('probe_os_registration_denied'); };
  app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost');
  for (const name of ['showErrorBox', 'showMessageBox', 'showMessageBoxSync']) dialog[name] = () => {
    result.nativeDialogs.push({ name }); write(); throw Error('unexpected_native_dialog');
  };
  const childProcess = require('node:child_process'), originalSpawn = childProcess.spawn, children = [];
  childProcess.spawn = (exe, args, options) => {
    const process = originalSpawn(exe, args, options); children.push(process);
    if (process.pid) result.ownedChildren.push({ pid: process.pid, executable: path.basename(String(exe)) });
    return process;
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, ...args) => {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const url = new URL(raw);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      result.externalMainFetches.push({ host: url.hostname }); write(); return Promise.reject(Error('nonloopback_main_request_denied'));
    }
    return originalFetch(input, ...args);
  };
  require('node:module').syncBuiltinESMExports();
  let window;
  app.on('browser-window-created', (_event, created) => {
    event('window-created', { visible: created.isVisible(), bounds: created.getBounds() });
    for (const name of ['show', 'ready-to-show', 'unresponsive', 'responsive', 'closed']) created.on(name, () => event(name));
    const wc = created.webContents;
    for (const name of ['did-start-loading', 'dom-ready', 'did-finish-load', 'did-stop-loading']) wc.on(name, () => event(name));
    wc.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => event('did-fail-load', { errorCode, errorDescription, isMainFrame }));
    wc.on('render-process-gone', (_event, details) => { result.processGone.push(details); event('render-process-gone', details); });
    wc.on('preload-error', (_event, _preload, error) => event('preload-error', { message: error.message }));
    wc.on('console-message', (_event, level, message) => { if (level >= 2) {
      result.rendererMessages.push({ level, message: String(message).slice(0, 700), elapsedMs: Date.now() - started }); write();
    } });
    try {
      wc.debugger.attach('1.3');
      wc.debugger.on('message', (_event, method, params) => {
        if (method === 'Runtime.exceptionThrown') { result.rendererExceptions.push({ elapsedMs: Date.now() - started,
          description: String(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || '').slice(0, 2500) }); write(); }
      });
      void wc.debugger.sendCommand('Runtime.enable');
    } catch (error) { event('debugger-observer-unavailable', { message: error.message }); }
  });
  const run = code => window.webContents.executeJavaScript(code, true);
  const until = async (check, name, budget = 30000) => {
    const end = Date.now() + budget;
    while (Date.now() < end) { try { if (await check()) return; } catch {} await sleep(150); }
    throw Error('timeout:' + name);
  };
  const sample = async label => {
    const dom = await run(`(()=>({rootChildren:document.querySelector('#root')?.children.length,appShell:!!document.querySelector('.app-shell'),
      settings:!!document.querySelector('.app-shell.panel-settings'),bodyTextLength:document.body.innerText.length,
      bridge:!!window.lastbrowser,readyState:document.readyState,visibility:document.visibilityState,
      storedPanel:localStorage.getItem('lastbrowser.activePanel'),paint:performance.getEntriesByType('paint').map(e=>({name:e.name,startTime:e.startTime}))}))()`);
    const image = await window.webContents.capturePage();
    const bitmap = image.toBitmap(), colors = new Set();
    for (let index = 0; index < bitmap.length; index += 4 * 97) colors.add(bitmap.subarray(index, index + 3).toString('hex'));
    const screenshot = path.join(owned, info.mode + '-' + label + '.png'); fs.writeFileSync(screenshot, image.toPNG());
    const row = { label, elapsedMs: Date.now() - started, ...dom, visible: window.isVisible(), minimized: window.isMinimized(),
      screenshot, size: image.getSize(), sampledColors: colors.size };
    result.samples.push(row); write(); return row;
  };
  let watchdog;
  const finish = () => {
    if (watchdog) clearTimeout(watchdog); write(); app.quit();
    setTimeout(() => { for (const process of children) if (process.exitCode === null && process.signalCode === null) process.kill(); app.exit(result.passed ? 0 : 1); }, 17000).unref();
  };
  app.on('will-quit', () => {
    result.quitObserved = true;
    result.runningOwnedChildrenAtQuit = children.filter(process => process.exitCode === null && process.signalCode === null).map(process => process.pid);
    write();
  });
  try {
    watchdog = setTimeout(() => { result.error = 'child_watchdog'; finish(); }, 92000);
    setTimeout(() => event('10s-state', { appReady: app.isReady(), windows: BrowserWindow.getAllWindows().length,
      ...(app.isReady() ? { componentStatus: components?.status() } : {}) }), 10000).unref();
    await import(pathToFileURL(path.join(info.buildRoot, 'main/main.js')).href);
    event('main-import-complete', { appReady: app.isReady() });
    await app.whenReady();
    await until(() => { window = BrowserWindow.getAllWindows().find(item => !item.isDestroyed() && item.webContents.getURL().startsWith('app://')); return !!window; }, 'real-main-window');
    window.showInactive();
    await until(() => run("document.readyState==='complete'"), 'document-ready');
    await sample('document-ready');
    await until(() => run("!!document.querySelector('.app-shell')"), 'react-shell');
    await sample('shell');
    await until(() => run("window.lastbrowser.services.status().then(s=>s.sidekick==='ready'&&s.webuiHealth==='ready')"), 'sidecar-ready', 60000);
    result.serviceStatus = await run("window.lastbrowser.services.status().then(s=>({sidekick:s.sidekick,webuiHealth:s.webuiHealth,drm:s.drm}))");
    if (info.mode === 'fresh') {
      await until(() => run("!!document.querySelector('.first-run-ai-choice-actions .secondary-btn,.first-run-skip-btn')"), 'fresh-wizard');
      await run(`(()=>{const b=document.querySelector('.first-run-ai-choice-actions .secondary-btn');if(b)b.click();return true})()`);
      await until(() => run("!!document.querySelector('.first-run-skip-btn')"), 'browser-only-wizard');
      await run("document.querySelector('.first-run-skip-btn').click();true");
      await until(() => run("!document.querySelector('[aria-label=\"First-run setup\"]')"), 'wizard-skipped');
      window.webContents.send('lastbrowser:browser:shortcut', { action: 'open-settings' });
      await until(() => run("!!document.querySelector('.app-shell.panel-settings')"), 'settings-open');
      await run("window.lastbrowser.browser.clearData({cache:true,cookies:false,storage:false})");
      await session.defaultSession.flushStorageData();
      result.settingsPersisted = await run("localStorage.getItem('lastbrowser.activePanel')==='settings'");
    } else {
      await until(() => run("!!document.querySelector('.app-shell.panel-settings')"), 'persisted-settings');
      result.settingsRestoredWithoutReload = true;
    }
    await sleep(15000); const stable = await sample('15s-stable');
    result.passed = stable.appShell && stable.sampledColors > 10 && result.rendererExceptions.length === 0 && result.processGone.length === 0 && result.nativeDialogs.length === 0;
    if (info.mode === 'persisted-settings') {
      window.webContents.reload(); await until(() => run("!!document.querySelector('.app-shell.panel-settings')"), 'settings-after-manual-reload');
      await sleep(1000); await sample('manual-reload');
    }
  } catch (error) { result.error = error.message; result.passed = false; }
  finish();
}

(process.argv.includes('--electron-child') ? child() : parent()).catch(error => { console.error(error.message); process.exitCode = 1; });
