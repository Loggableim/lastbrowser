#!/usr/bin/env node
// E3/E9: actual source Electron UI flow for persistent goals and isolated Quickchat.
// Uses an owned temporary profile and a controlled loopback-only model fixture.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', '..', '..');
const desktop = path.join(root, 'apps', 'desktop');
const id = randomUUID();
const owned = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-e3-e9-ui-'));
const build = path.join(root, 'out', 'e3-e9-ui-' + id);
const output = path.join(root, 'output', 'e3-e9-ui-' + id + '.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function cleanOwned(target, parent, prefix) {
  const absolute = path.resolve(target), base = path.resolve(parent) + path.sep;
  if (!absolute.startsWith(base) || !path.basename(absolute).startsWith(prefix)) throw Error('unsafe_probe_cleanup');
  fs.rmSync(absolute, { recursive: true, force: true });
}
async function command(exe, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = ''; for (const pipe of [child.stdout, child.stderr]) pipe.on('data', bytes => text += bytes.toString());
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(text) : reject(Error(`command_failed:${code}:${text.slice(-5000)}`)));
  });
}

async function main() {
  const report = { schemaVersion: 1, probe: 'persistent-goal-quickchat-ui', id, output, phases: [],
    providerKinds: [], ipc: { goalCommands: [], quickchatStarts: [], quickchatCancels: [] }, passed: false };
  let fixture; let electron; let ownedDone = false;
  const heldQuickchat = new Set(), heldGoalJudges = new Set();
  const fixtureState = { requests: 0, providerKinds: [], pageRequests: 0, quickchatAborted: 0, goalJudgeRequests: 0,
    goalJudgeAborted: 0, goalJudgesReleased: 0, released: false };
  try {
    fs.mkdirSync(build, { recursive: true });
    fs.writeFileSync(path.join(build, 'package.json'), '{"type":"module"}');
    fixture = http.createServer((request, response) => {
      if (request.url === '/fixture/page') {
        fixtureState.pageRequests++;
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><title>E9 controlled summary page</title><main><h1>E9_PAGE_FIXTURE_MARKER</h1><p>Only local synthetic text for the UI probe.</p></main>'); return;
      }
      if (request.url === '/fixture/state') {
        response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(fixtureState)); return;
      }
      if (request.url === '/fixture/release' && request.method === 'POST') {
        fixtureState.released = true; for (const finish of heldQuickchat) finish(); heldQuickchat.clear();
        response.writeHead(200); response.end('{}'); return;
      }
      if (request.url === '/fixture/release-goal' && request.method === 'POST') {
        for (const finish of heldGoalJudges) { finish(); fixtureState.goalJudgesReleased++; } heldGoalJudges.clear();
        response.writeHead(200); response.end('{}'); return;
      }
      if (request.url === '/v1/models') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ data: [{ id: 'e3-e9-ui-model', context_length: 64000 }] })); return;
      }
      if (request.url !== '/v1/chat/completions' || request.method !== 'POST') { response.writeHead(404); response.end(); return; }
      let raw = ''; request.on('data', chunk => raw += chunk); request.on('end', () => {
        const input = JSON.parse(raw), messages = input.messages || [];
        const text = messages.map(message => String(message.content || '')).join('\n');
        const kind = text.toLowerCase().includes('strict judge evaluating') ? 'goal_judge'
          : text.includes('E9_PAGE_FIXTURE_MARKER') ? 'quickchat_summary'
          : text.includes('E9_QUICKCHAT_RESET_SENTINEL') ? 'quickchat_reset'
            : text.includes('E9_NORMAL_WORKCHAT_SENTINEL') ? 'normal_workchat'
              : text.includes('E9_PERSISTENT_GOAL_SENTINEL') ? 'persistent_goal' : 'other';
        fixtureState.requests++; fixtureState.providerKinds.push(kind); report.providerKinds.push(kind);
        if (kind === 'goal_judge') fixtureState.goalJudgeRequests++;
        const ordinal = fixtureState.requests;
        const headers = { 'content-type': 'text/event-stream', connection: 'close',
          'x-ratelimit-limit-requests': '20', 'x-ratelimit-remaining-requests': '20', 'x-ratelimit-reset-requests': '1m',
          'x-ratelimit-limit-tokens': '1000000', 'x-ratelimit-remaining-tokens': '1000000', 'x-ratelimit-reset-tokens': '1m',
          'x-request-id': `e3-e9-controlled-${ordinal}` };
        response.writeHead(200, headers);
        const chunk = (delta, finish = null) => response.write('data: ' + JSON.stringify({ id: `e3-e9-${ordinal}`,
          object: 'chat.completion.chunk', created: 1, model: input.model,
          choices: [{ index: 0, delta, finish_reason: finish }] }) + '\n\n');
        const answer = kind === 'goal_judge' ? JSON.stringify({ done: false, reason: 'Controlled fixture keeps the goal unfinished for pause verification.' })
          : kind === 'quickchat_summary' ? 'E9_SUMMARY_OK'
          : kind === 'normal_workchat' ? 'E9_NORMAL_WORKCHAT_REPLY'
            : kind === 'persistent_goal' ? 'E9_GOAL_STEP_OK' : 'E9_CONTROLLED_REPLY';
        chunk({ role: 'assistant', content: JSON.stringify({ message: answer }) });
        const finish = () => { if (response.destroyed) return; chunk({}, 'stop'); response.end('data: [DONE]\n\n'); };
        if (kind === 'quickchat_reset' && !fixtureState.released) {
          heldQuickchat.add(finish);
          response.once('close', () => { heldQuickchat.delete(finish); if (!response.writableEnded) fixtureState.quickchatAborted++; });
        } else if (kind === 'goal_judge') {
          heldGoalJudges.add(finish);
          response.once('close', () => { heldGoalJudges.delete(finish); if (!response.writableEnded) fixtureState.goalJudgeAborted++; });
        } else finish();
      });
    });
    await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${fixture.address().port}`;

    report.phases.push('source_build');
    await command(process.execPath, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p',
      path.join(desktop, 'tsconfig.main.json'), '--outDir', path.join(build, 'main')], root);
    await require('esbuild').build({ entryPoints: [path.join(desktop, 'src', 'main', 'preload.ts')],
      outfile: path.join(build, 'main', 'preload.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node20', external: ['electron'] });
    await command(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config',
      path.join(desktop, 'vite.config.ts'), '--outDir', path.join(build, 'renderer')], desktop);

    const userData = path.join(owned, 'user-data'), runtime = path.join(userData, 'runtime');
    const workspace = path.join(owned, 'workspace'), scopeChangeWorkspace = path.join(owned, 'workspace-scope-b');
    for (const directory of [userData, runtime, workspace, scopeChangeWorkspace, path.join(runtime, 'webui'), path.join(owned, 'guard'),
      path.join(owned, 'user-home'), path.join(owned, 'app-data'), path.join(owned, 'tmp'), path.join(owned, 'downloads')])
      fs.mkdirSync(directory, { recursive: true });
    fs.copyFileSync(path.join(root, 'scripts', 'probe-full-app-network-guard.py'), path.join(owned, 'guard', 'sitecustomize.py'));
    fs.writeFileSync(path.join(runtime, 'config.yaml'), JSON.stringify({ workspace,
      model: { provider: 'custom:e3e9', default: 'e3-e9-ui-model', base_url: origin + '/v1', api_key: 'synthetic-local-fixture' },
      custom_providers: [{ name: 'e3e9', base_url: origin + '/v1', api_key: 'synthetic-local-fixture',
        models: { 'e3-e9-ui-model': { context_length: 64000 } } }] }));
    fs.writeFileSync(path.join(runtime, '.env'), `HTTP_PROXY=${origin}\nHTTPS_PROXY=${origin}\nALL_PROXY=${origin}\nNO_PROXY=localhost,127.0.0.1\n`);
    fs.writeFileSync(path.join(runtime, 'webui', 'workspaces.json'), JSON.stringify([
      { name: 'E3 E9 isolated workspace', path: workspace }, { name: 'E3 E9 scope-change workspace', path: scopeChangeWorkspace }]));
    fs.writeFileSync(path.join(owned, 'bootstrap.json'), JSON.stringify({ build, owned, runtime, userData, workspace, scopeChangeWorkspace, origin }));
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)$/i.test(key)
      || /^(?:SIDEKICK|HERMES|LASTBROWSER)_/.test(key) || ['ELECTRON_RUN_AS_NODE', 'PYTHONPATH', 'PYTHONHOME'].includes(key)) delete env[key];
    Object.assign(env, { LASTBROWSER_FULL_APP_PROBE_ROOT: owned,
      LASTBROWSER_WEBUI_PYTHON: path.join(desktop, 'runtime', 'python', 'python.exe'),
      LASTBROWSER_DOWNLOADS_DIR: path.join(owned, 'downloads'), LASTBROWSER_ENABLE_CDP: '0',
      PYTHONPATH: path.join(owned, 'guard'), PYTHONDONTWRITEBYTECODE: '1', PYTHONNOUSERSITE: '1', PYTHONUNBUFFERED: '1',
      SIDEKICK_BASE_HOME: runtime, SIDEKICK_WEBUI_DEFAULT_WORKSPACE: workspace,
      USERPROFILE: path.join(owned, 'user-home'), APPDATA: path.join(owned, 'app-data'), LOCALAPPDATA: path.join(owned, 'local-app-data'),
      TEMP: path.join(owned, 'tmp'), TMP: path.join(owned, 'tmp'), GH_CONFIG_DIR: path.join(owned, 'empty-gh'),
      HTTP_PROXY: origin, HTTPS_PROXY: origin, ALL_PROXY: origin, NO_PROXY: 'localhost,127.0.0.1' });
    for (const key of ['GH_CONFIG_DIR']) fs.mkdirSync(env[key], { recursive: true });

    electron = spawn(require('electron'), [__filename, '--electron-child', owned],
      { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    report.processFamily = [{ role: 'electron-root', pid: electron.pid, parentPid: process.pid,
      executable: require('electron'), startedAt: new Date().toISOString() }];
    const processFamilyPath = path.join(owned, 'process-family.jsonl');
    fs.appendFileSync(processFamilyPath, JSON.stringify(report.processFamily[0]) + '\n');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify({ ...report, phase: 'electron_spawned', finishedAt: null }, null, 2));
    const logPath = path.join(owned, 'app-run.log'), log = fs.createWriteStream(logPath);
    electron.stdout.pipe(log, { end: false }); electron.stderr.pipe(log, { end: false });
    const exit = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { report.timedOut = true; void command('taskkill.exe', ['/PID', String(electron.pid), '/T', '/F'], root).catch(() => {}); }, 360000);
      electron.once('error', reject);
      electron.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
    });
    log.end(); report.childExit = exit;
    if (fs.existsSync(processFamilyPath)) report.processFamily = fs.readFileSync(processFamilyPath, 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
    const childReport = path.join(owned, 'child-report.json');
    if (fs.existsSync(childReport)) Object.assign(report, JSON.parse(fs.readFileSync(childReport, 'utf8')));
    if (fs.existsSync(logPath)) report.appLogTail = fs.readFileSync(logPath, 'utf8').slice(-16000);
    const audit = path.join(owned, 'python-audit.jsonl');
    if (fs.existsSync(audit)) report.pythonAudit = fs.readFileSync(audit, 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
    const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
    report.remainingOwnedChildrenAfterExit = (report.processFamily || []).filter(entry => entry.role === 'owned-child' && alive(entry.pid)).map(entry => entry.pid);
    for (const pid of report.remainingOwnedChildrenAfterExit) {
      try { await command('taskkill.exe', ['/PID', String(pid), '/T', '/F'], root); } catch {}
    }
    report.remainingOwnedChildrenAfterCleanup = report.remainingOwnedChildrenAfterExit.filter(alive);
    report.childFailure = report.error || null;
    assert.equal(exit.code, 0, 'isolated source Electron exits successfully'); assert.equal(report.probeCompleted, true);
    assert.equal(fixtureState.quickchatAborted, 1, 'Reset aborts exactly the active controlled Quickchat provider response');
    report.networkIsolation = { externalMainFetchesDenied: report.externalMainAttempts?.length || 0,
      localFixtureOnlyProviderKinds: fixtureState.providerKinds };
    assert.equal(report.pythonAudit?.filter(row => row.event === 'denied_write').length || 0, 0, 'Python sidecar writes stay in owned profile');
    fs.writeFileSync(output, JSON.stringify({ ...report, fixtureState, finishedAt: new Date().toISOString() }, null, 2));
    ownedDone = true;
    console.log(JSON.stringify({ output, passed: report.passed, goal: report.goal, quickchat: report.quickchat,
      providerKinds: report.providerKinds, childExit: report.childExit }, null, 2));
    if (!report.passed) throw Error('acceptance_findings_failed:' + JSON.stringify(report.acceptanceFindings));
  } catch (error) {
    report.passed = false; report.outerError = String(error?.stack || error);
    report.childFailure ||= report.error || null;
    if (!report.error) report.error = report.outerError;
    if (electron && electron.exitCode === null && electron.signalCode === null) {
      try { await command('taskkill.exe', ['/PID', String(electron.pid), '/T', '/F'], root); } catch {}
    }
    try {
      const processFamilyPath = path.join(owned, 'process-family.jsonl');
      if (fs.existsSync(processFamilyPath)) report.processFamily = fs.readFileSync(processFamilyPath, 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
      report.fixtureState = fixtureState; report.finishedAt = new Date().toISOString();
      fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2)); ownedDone = true; } catch {}
    throw error;
  } finally {
    if (fixture) { for (const finish of heldQuickchat) finish(); for (const finish of heldGoalJudges) finish(); await new Promise(resolve => fixture.close(resolve)); }
    cleanOwned(build, path.join(root, 'out'), 'e3-e9-ui-');
    if (ownedDone) cleanOwned(owned, os.tmpdir(), 'lastbrowser-e3-e9-ui-');
  }
}

async function electronChild() {
  const { app, BrowserWindow, ipcMain } = require('electron');
  const owned = path.resolve(process.argv[process.argv.indexOf('--electron-child') + 1]);
  assert.equal(owned, process.env.LASTBROWSER_FULL_APP_PROBE_ROOT);
  const info = JSON.parse(fs.readFileSync(path.join(owned, 'bootstrap.json'), 'utf8'));
  const result = { passed: false, childPids: [], externalMainAttempts: [], goalIpc: [], quickchatIpc: [], acceptanceFindings: [],
    phase: 'startup', sourceBuildRoot: info.build };
  const processFamilyPath = path.join(owned, 'process-family.jsonl');
  const recordProcess = entry => fs.appendFileSync(processFamilyPath, JSON.stringify({ ...entry, recordedAt: new Date().toISOString() }) + '\n');
  recordProcess({ role: 'electron-renderer-main', pid: process.pid, parentPid: process.ppid, executable: process.execPath });
  app.setPath('userData', info.userData); app.setPath('sessionData', path.join(info.userData, 'session'));
  app.setPath('home', path.join(owned, 'user-home')); app.setPath('appData', path.join(owned, 'app-data'));
  app.isDefaultProtocolClient = () => true;
  app.setAsDefaultProtocolClient = () => { throw Error('probe_os_registration_denied'); };
  app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost');
  const childProcess = require('node:child_process'), originalSpawn = childProcess.spawn;
  const children = [];
  childProcess.spawn = (exe, args, options) => {
    const child = originalSpawn(exe, args, options); children.push(child); if (child.pid) {
      result.childPids.push(child.pid); recordProcess({ role: 'owned-child', pid: child.pid, parentPid: process.pid,
        executable: String(exe), args: [...(args || [])].map(String), cwd: options?.cwd || null });
      save();
    } return child;
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, ...args) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    try { if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) {
      result.externalMainAttempts.push({ host: new URL(url).hostname }); return Promise.reject(Error('probe_nonlocal_fetch_denied')); }
    } catch { return Promise.reject(Error('probe_invalid_fetch_url')); }
    const response = await originalFetch(input, ...args);
    if (new URL(url).pathname === '/api/quickchat/cancel') {
      let body = {}; try { body = await response.clone().json(); } catch {}
      result.quickchatBackendCancel = { status: response.status, quickChatId: body.quick_chat_id || null,
        streamId: body.stream_id || null, reset: body.reset === true, cancelled: body.cancelled === true };
    }
    return response;
  };
  require('node:module').syncBuiltinESMExports();
  const originalHandle = ipcMain.handle.bind(ipcMain);
  let delayNextGoalStatus = false, releaseDelayedGoalStatus = null;
  ipcMain.handle = (channel, listener) => originalHandle(channel, async (event, ...args) => {
    const request = args[0] && typeof args[0] === 'object' ? args[0] : {};
    let value;
    try { value = await listener(event, ...args); }
    catch (error) {
      if (channel === 'lastbrowser:sidekick:chatMode') (result.chatMode ||= []).push({ action: request.action, error: String(error?.message || error).slice(0, 400) });
      if (channel === 'lastbrowser:sidekick:goalCommand') (result.goalIpcErrors ||= []).push({ args: request.args,
        expectedRevision: request.expectedRevision, error: String(error?.message || error).slice(0, 400) });
      throw error;
    }
    if (channel === 'lastbrowser:sidekick:goalCommand' && request.args === 'status' && delayNextGoalStatus) {
      delayNextGoalStatus = false;
      result.scopeGuardStatusHeld = { sessionId: request.sessionId, phase: result.phase };
      save();
      await new Promise(resolve => { releaseDelayedGoalStatus = resolve; });
    }
    if (channel === 'lastbrowser:sidekick:createSession')
      (result.sessionCreates ||= []).push({ sessionId: value?.session?.session_id || null });
    if (channel === 'lastbrowser:sidekick:goalCommand' && request.args !== 'status')
      result.goalIpc.push({ sessionId: request.sessionId, args: request.args, expectedRevision: request.expectedRevision,
        clientRequestId: request.clientRequestId, ok: value?.ok, action: value?.action, revision: value?.goal?.revision ?? value?.revision,
        status: value?.goal?.status, streamId: value?.stream_id });
    if (channel === 'lastbrowser:sidekick:chatMode') (result.chatMode ||= []).push({ action: request.action,
      ok: value?.ok, mode: value?.mode?.mode, capabilities: value?.capabilities || null });
    if (channel.startsWith('lastbrowser:quickchat:')) {
      const safe = { channel, quickChatId: request.quickChatId, streamId: request.streamId, scope: request.scope || null };
      if (channel.endsWith(':start')) { safe.prompt = String(request.prompt || '').slice(0, 400); safe.result = value; }
      else safe.result = value;
      result.quickchatIpc.push(safe);
    }
    return value;
  });
  let window; const run = expression => window.webContents.executeJavaScript(expression, true);
  const fixtureSnapshot = async () => {
    const response = await originalFetch(info.origin + '/fixture/state');
    if (!response.ok) throw Error('fixture_state_unavailable:' + response.status);
    return response.json();
  };
  const providerCount = async () => (await fixtureSnapshot()).requests;
  const providerKinds = async () => (await fixtureSnapshot()).providerKinds;
  const until = async (check, label, ms = 30000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { try { if (await check()) return; } catch {} await sleep(125); }
    throw Error('timeout:' + label);
  };
  const save = () => fs.writeFileSync(path.join(owned, 'child-report.json'), JSON.stringify(result, null, 2));
  app.on('browser-window-created', (_event, created) => created.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) (result.rendererWarnings ||= []).push(String(message).slice(0, 400));
  }));
  try {
    await import(require('node:url').pathToFileURL(path.join(info.build, 'main', 'main.js')).href);
    await app.whenReady();
    await until(() => BrowserWindow.getAllWindows().some(item => !item.isDestroyed() && item.webContents.getURL().startsWith('app://')),
      'actual Electron BrowserWindow');
    window = BrowserWindow.getAllWindows().find(item => !item.isDestroyed() && item.webContents.getURL().startsWith('app://'));
    await until(() => run("Boolean(document.querySelector('.app-shell')&&document.querySelector('.local-ai-setup'))"), 'actual app and First Run setup');
    await until(() => run("window.lastbrowser.services.status().then(s=>s.sidekick==='ready'&&s.webuiHealth==='ready')"), 'owned Sidekick runtime', 65000);
    await until(() => run("Boolean(document.querySelector('.local-ai-hardware strong'))"), 'actual First Run hardware scan', 45000);
    window.webContents.reload();
    await until(() => run("Boolean(window.lastbrowser&&document.querySelector('.local-ai-hardware strong'))"), 'actual First Run after renderer reload');
    const skip = await run("(()=>{const b=[...document.querySelectorAll('.first-run-setup button,button')].find(e=>/browse without|skip without|ohne ki|without ai/i.test(e.innerText+' '+e.getAttribute('aria-label')));if(!b)throw Error('real First Run skip button missing');b.click();return true})()");
    assert.equal(skip, true, 'Clicks the genuine First Run skip control; no app-state stub');
    await until(() => run("!document.querySelector('[role=dialog][aria-label=\"First-run setup\"]')"), 'explicit real First Run skip');
    result.firstRun = { genuineSkipButtonClicked: true, hardwareScanObserved: true, rendererReloaded: true };
    // The app defaults to Modern Browser, which has no ShellRail. After the
    // genuine setup skip, select the test route in this isolated profile.
    await run("localStorage.setItem('lastbrowser.activePanel','chat');localStorage.setItem('lastbrowser.layoutMode.v1','classic');window.location.reload();true");
    await until(() => run("Boolean(window.lastbrowser&&document.querySelector('.app-shell.panel-chat:not(.modern-mode)'))"), 'isolated classic native-chat route');
    window.minimize();
    result.phase = 'first_run'; save();
    const toggle = await run("document.querySelector('.copilot-toggle-btn')?.classList.contains('active')===true");
    if (toggle) await run("document.querySelector('.copilot-toggle-btn').click();true");
    await until(() => run("!document.querySelector('.space-assistant')"), 'Assistant overlay closed before native work chat');
    await run("document.querySelector('.shell-rail .rail-main .rail-button')?.click();true");
    await until(() => run("Boolean(document.querySelector('.native-chat-main .chat-composer textarea'))"), 'actual native chat composer');

    const createsBeforeNative = result.sessionCreates?.length || 0;
    result.phase = 'new_native_chat';
    await run("document.querySelector('.native-chat-main .new-chat-btn')?.click();true");
    await until(() => (result.sessionCreates?.length || 0) > createsBeforeNative, 'actual UI-created native chat');
    const nativeSessionId = result.sessionCreates.at(-1)?.sessionId;
    assert(nativeSessionId, 'Native New Chat button created a session through Main');
    result.nativeSessionId = nativeSessionId;
    assert.equal(await run("Boolean(document.querySelector('.native-chat-main section.persistent-goal-controls'))"), false, 'No permanent goal controls in a fresh Workchat');

    const inputText = async (selector, text) => run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing:'+${JSON.stringify(selector)});const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
    const pressComposerEnter = async (selector, text) => {
      await inputText(selector, text);
      await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing_enter_target');e.focus();return true})()`);
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'ENTER' });
      window.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'ENTER' });
    };
    const submitComposer = async text => {
      await inputText('.native-chat-main .chat-composer textarea', text);
      await run("document.querySelector('.native-chat-main .chat-composer').requestSubmit();true");
    };
    await until(() => result.chatMode?.some(call => call.ok === true && call.capabilities?.goal === true), 'native chat goal capability readiness');
    result.phase = 'goal_slash_command';
    await submitComposer('/goal');
    await until(() => run("Boolean(document.querySelector('.native-chat-main section.persistent-goal-controls form textarea'))"), 'explicit /goal opens the goal editor');
    const goalText = 'E9_PERSISTENT_GOAL_SENTINEL: answer once, then remain paused; do not continue autonomously.';
    await inputText('.native-chat-main section.persistent-goal-controls form textarea', goalText);
    await run("(()=>{const f=document.querySelector('.native-chat-main section.persistent-goal-controls form');f.requestSubmit();f.requestSubmit();return true})()");
    await until(() => run(`window.lastbrowser.sidekick.goalCommand(${JSON.stringify({ sessionId: nativeSessionId,
      args: 'status', browserProfileId: 'default', workspacePath: info.workspace })}).then(r=>r.ok&&r.goal?.status==='active')`), 'CAS0 goal active after actual UI submission', 45000);
    await until(() => result.goalIpc.some(call => call.args === goalText), 'goal start returned through the Main IPC boundary');
    const goalStart = result.goalIpc.find(call => call.args === goalText);
    await sleep(350);
    assert.equal(result.goalIpc.filter(call => call.args === goalText).length, 1, 'Rapid duplicate Start submits only one goal IPC request');
    assert(goalStart?.ok, 'Actual GoalControls UI invoked goalCommand');
    assert.equal(goalStart.expectedRevision, 0, 'Goal start uses compare-and-swap revision zero');
    assert.equal(goalStart.status, 'active'); assert(goalStart.streamId, 'Goal submission started a real scoped native stream');
    await run(`window.lastbrowser.sidekick.subscribeChatStream(${JSON.stringify({ streamId: goalStart.streamId })})`);
    await until(async () => (await fixtureSnapshot()).goalJudgeRequests >= 1, 'controlled goal judge request is in flight');
    result.goal = { sessionId: nativeSessionId, goal: goalText, startRevision: goalStart.expectedRevision,
      startCommittedRevision: goalStart.revision, kickoffStream: goalStart.streamId };
    // Hold fixture responses so both pause actions run while a real native
    // model request is in flight, then release the response deterministically.
    result.phase = 'goal_pause_resume';
    await submitComposer('/goal pause');
    await sleep(1500);
    const pauseCall = result.goalIpc.find(call => call.args === 'pause');
    if (!pauseCall) result.acceptanceFindings.push({ id: 'pause_during_goal_kickoff', passed: false,
      detail: 'Composer /goal pause produced no Main goalCommand IPC while the initial goal command was still waiting for its native stream.' });
    else {
      assert(pauseCall.ok && pauseCall.status === 'paused');
      assert.equal(pauseCall.expectedRevision, goalStart.revision, 'Pause uses the committed goal revision');
      assert(pauseCall.revision > goalStart.revision, 'Pause advances the goal revision');
    }
    await originalFetch(info.origin + '/fixture/release-goal', { method: 'POST' });
    await until(() => run(`window.lastbrowser.sidekick.getStreamStatus(${JSON.stringify(goalStart.streamId)}).then(s=>s.native_controls?.processExited===true)`),
      'paused goal kickoff stream exit', 75000);
    await until(() => run(`window.lastbrowser.sidekick.goalCommand(${JSON.stringify({ sessionId: nativeSessionId, args: 'status',
      browserProfileId: 'default', workspacePath: info.workspace })}).then(r=>r.ok&&r.goal?.status==='paused')`), 'actual /goal pause persisted');
    const pausedAfterFirstReload = await windowReload();
    const staleCas = await run(`window.lastbrowser.sidekick.goalCommand(${JSON.stringify({ sessionId: nativeSessionId, args: 'pause',
      browserProfileId: 'default', workspacePath: info.workspace, expectedRevision: goalStart.revision,
      clientRequestId: 'e3-e9-stale-cas-check' })}).then(value=>({value})).catch(error=>({error:String(error)}))`);
    assert(staleCas.error && /revision|conflict/i.test(staleCas.error), 'Stale goal revision is rejected as a CAS conflict');
    const pausedAfterStaleCas = await run(`window.lastbrowser.sidekick.goalCommand(${JSON.stringify({ sessionId: nativeSessionId, args: 'status',
      browserProfileId: 'default', workspacePath: info.workspace })})`);
    assert.equal(pausedAfterStaleCas.goal?.revision, pausedAfterFirstReload.goal.revision, 'Stale CAS does not mutate the goal revision');
    async function windowReload() {
      window.webContents.reload();
      await until(() => run('Boolean(window.lastbrowser&&document.querySelector(".app-shell"))'), 'actual renderer reload after goal pause');
      const status = await run(`window.lastbrowser.sidekick.goalCommand(${JSON.stringify({ sessionId: nativeSessionId, args: 'status',
        browserProfileId: 'default', workspacePath: info.workspace })})`);
      assert.equal(status.goal?.status, 'paused', 'Paused goal persists across Renderer reload');
      return status;
    }
    const resumeBefore = await providerCount();
    await until(() => run("[...document.querySelectorAll('.native-chat-main section.persistent-goal-controls .persistent-goal-compact-row button')].some(button=>/resume|fortsetzen/i.test(button.innerText)&&!button.disabled)"), 'actual GoalControls Resume button enabled');
    const resumeCallsBeforeSlash = result.goalIpc.filter(call => call.args === 'resume').length;
    // This probe minimized its owned window for background Goal coverage. A
    // keyboard diagnosis is meaningful only after restoring and focusing that
    // actual window; record DOM focus and delivered native key events.
    window.restore(); window.show(); window.focus(); window.webContents.focus();
    await sleep(250);
    const focusAttempt = await run(`(()=>{const field=document.querySelector('.native-chat-main .chat-composer textarea');field?.focus();return {
      focusCall:document.activeElement===field,documentHasFocus:document.hasFocus(),activeTag:document.activeElement?.tagName,
      activeClass:document.activeElement?.className}})()`);
    result.goalSlashResume = { focusBeforeEnter: { ...focusAttempt,
      windowFocused: window.isFocused(), windowMinimized: window.isMinimized() }, keyboardEvents: [] };
    await run(`(()=>{window.__goalEnterTrace=[];const field=document.querySelector('.native-chat-main .chat-composer textarea');const form=field?.form;
      for(const type of ['keydown','keypress','keyup','submit'])document.addEventListener(type,event=>{
        if(event.target!==field&&event.target!==form)return;const row={type,key:event.key||null,code:event.code||null,
          trusted:event.isTrusted,defaultPreventedAtCapture:event.defaultPrevented,targetTag:event.target?.tagName,
          activeTag:document.activeElement?.tagName,valueAtCapture:field?.value||''};window.__goalEnterTrace.push(row);
        setTimeout(()=>{row.defaultPreventedAfterDispatch=event.defaultPrevented;row.valueAfterDispatch=field?.value||''},0);
      },true);return {instrumented:Boolean(field&&form)}})()`);
    await pressComposerEnter('.native-chat-main .chat-composer textarea', '/goal resume');
    await sleep(2500);
    result.goalSlashResume = { ...result.goalSlashResume, mainIpcDispatched: result.goalIpc.some(call => call.args === 'resume'),
      dispatchCount: result.goalIpc.filter(call => call.args === 'resume').length - resumeCallsBeforeSlash,
      composerValueAfterEnter: await run("document.querySelector('.native-chat-main .chat-composer textarea')?.value"),
      keyboardEvents: await run('window.__goalEnterTrace||[]'),
      renderedStatus: await run("document.querySelector('.native-chat-main section.persistent-goal-controls')?.innerText?.slice(0,500)"),
      errors: result.goalIpcErrors || [] };
    if (result.goalSlashResume.mainIpcDispatched) await until(() => run(`window.lastbrowser.sidekick.goalCommand(${JSON.stringify({ sessionId: nativeSessionId, args: 'status',
      browserProfileId: 'default', workspacePath: info.workspace })}).then(r=>r.ok&&r.goal?.status==='active')`), 'composer /goal resume command commits');
    if (!result.goalSlashResume.mainIpcDispatched) {
      result.acceptanceFindings.push({ id: 'goal_resume_slash_enter', passed: false,
        detail: 'Real Electron Enter in the native chat composer did not dispatch Goal resume IPC; fallback button is tested separately.' });
      await inputText('.native-chat-main .chat-composer textarea', '');
      await run("[...document.querySelectorAll('.native-chat-main section.persistent-goal-controls .persistent-goal-compact-row button')].find(button=>/resume|fortsetzen/i.test(button.innerText)&&!button.disabled)?.click();true");
      result.goalSlashResume.fallback = 'GoalControls button';
    }
    await until(() => run(`window.lastbrowser.sidekick.goalCommand(${JSON.stringify({ sessionId: nativeSessionId, args: 'status',
      browserProfileId: 'default', workspacePath: info.workspace })}).then(r=>r.ok&&r.goal?.status==='active')`), 'actual /goal resume command');
    await until(() => result.goalIpc.some(call => call.args === 'resume'), 'resume returned through Main IPC');
    const resumeCall = result.goalIpc.find(call => call.args === 'resume');
    assert.equal(resumeCall.expectedRevision, pauseCall?.revision ?? pausedAfterFirstReload.goal.revision, 'Resume uses the committed pause revision');
    assert(resumeCall?.ok && resumeCall.streamId); await run(`window.lastbrowser.sidekick.subscribeChatStream(${JSON.stringify({ streamId: resumeCall.streamId })})`);
    await until(async () => (await fixtureSnapshot()).requests > resumeBefore, 'resumed goal provider request');
    await originalFetch(info.origin + '/fixture/release-goal', { method: 'POST' });
    await until(() => run(`window.lastbrowser.sidekick.getStreamStatus(${JSON.stringify(resumeCall.streamId)}).then(s=>s.native_controls?.processExited===true)`),
      'resumed goal stream exit', 75000);
    assert(await providerCount() > resumeBefore, 'Resume dispatched a real provider request');
    await until(() => run(`window.lastbrowser.sidekick.goalCommand(${JSON.stringify({ sessionId: nativeSessionId, args: 'status',
      browserProfileId: 'default', workspacePath: info.workspace })}).then(r=>r.ok&&r.goal?.status==='paused')`), 'resumed goal reaches paused state');
    const pauseCallsAtStop = await providerCount();
    await sleep(2200);
    assert.equal(await providerCount(), pauseCallsAtStop, 'No provider continuation after persistent goal pause');
    await windowReload();
    result.goal = { ...result.goal, pausedAfterReload: true, pausedRevision: (await run(`window.lastbrowser.sidekick.goalCommand(${JSON.stringify({ sessionId: nativeSessionId,
      args: 'status', browserProfileId: 'default', workspacePath: info.workspace })})`)).goal.revision,
      resumedStream: resumeCall.streamId, noPostPauseProviderContinuation: true,
      explicitPauseDuringKickoffDispatched: Boolean(pauseCall) };
    if (pauseCall) result.acceptanceFindings.push({ id: 'pause_during_goal_kickoff', passed: true,
      detail: 'Composer pause reached Main IPC while the native goal stream was active.' });

    // The existing real Goal-bearing Workchat is the independent transcript
    // that Quickchat reset must leave intact; avoid an unrelated AUTO-policy send.
    const regularSessionId = nativeSessionId;
    result.regularWorkchat = { sessionId: regularSessionId, goalSessionPreserved: true };

    // Navigate to a controlled local page through the real browser omnibox;
    // verify the current Modern Browser research action, not a legacy-shell selector.
    result.phase = 'actual_page_summary_quickchat';
    await inputText('.addressbar input', info.origin + '/fixture/page');
    await run("document.querySelector('.addressbar').requestSubmit();true");
    await until(() => run("document.querySelector('.addressbar input')?.value.includes('/fixture/page')"), 'controlled page URL entered');
    await run("[...document.querySelectorAll('.shell-rail .rail-button')].find(button=>/browser|search|suche/i.test(button.title+' '+button.textContent))?.click();true");
    await until(() => run("document.querySelector('webview')!==null"), 'actual browser panel and webview mounted');
    await until(() => run(`document.querySelector('webview')?.getAttribute('src')?.includes(${JSON.stringify('/fixture/page')})`), 'actual browser webview navigated');
    await until(async () => (await fixtureSnapshot()).pageRequests > 0, 'controlled page actually loaded in the browser webview');
    const priorModernPageRequests = (await fixtureSnapshot()).pageRequests;
    await run("localStorage.setItem('lastbrowser.layoutMode.v1','modern');true");
    window.webContents.reload();
    await until(() => run("Boolean(document.querySelector('.app-shell.modern-mode.panel-browser'))"), 'actual Modern Browser layout after reload');
    await until(() => run(`Boolean(document.querySelector('webview')?.getAttribute('src')?.includes(${JSON.stringify('/fixture/page')}))`),
      'controlled page remains selected in Modern Browser');
    await until(async () => (await fixtureSnapshot()).pageRequests > priorModernPageRequests, 'controlled page reloaded in Modern Browser');
    result.quickchatResearchSurface = await run(`[...document.querySelectorAll('button')].filter(button=>/summarize|research|zusammenfassen/i.test(
      button.title+' '+button.getAttribute('aria-label')+' '+button.textContent)).map(button=>({className:button.className,
      title:button.title||null,ariaLabel:button.getAttribute('aria-label'),text:button.textContent.trim(),disabled:button.disabled}))`);
    const researchTrigger = await run("Boolean(document.querySelector('.titlebar-research-trigger-btn'))");
    if (researchTrigger) {
      await run("document.querySelector('.titlebar-research-trigger-btn').click();true");
      await until(() => run("Boolean(document.querySelector('.titlebar-research-flyout'))"), 'modern browser research action menu');
      const summarizeAction = await run(`(()=>{const trigger=document.querySelector('.titlebar-summarize-btn');
        const label=trigger?.getAttribute('aria-label')||trigger?.title||'';
        const normalize=value=>String(value||'').normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').toLocaleLowerCase();
        return [...document.querySelectorAll('.titlebar-research-flyout .action-strip-btn')].map(button=>({button,
          label:button.getAttribute('aria-label')||button.title||button.textContent.trim()}))
          .find(item=>normalize(item.label)===normalize(label))?.button||null;})()`);
      if (!summarizeAction) throw Error('modern_research_summary_action_missing');
      await run(`(()=>{const trigger=document.querySelector('.titlebar-summarize-btn');const label=trigger?.getAttribute('aria-label')||trigger?.title||'';
        const normalize=value=>String(value||'').normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').toLocaleLowerCase();
        const button=[...document.querySelectorAll('.titlebar-research-flyout .action-strip-btn')].find(item=>
          normalize(item.getAttribute('aria-label')||item.title||item.textContent.trim())===normalize(label));
        if(!button)throw Error('modern_research_summary_action_missing');button.click();return true;})()`);
      result.quickchatResearchSurfaceUsed = 'modern-titlebar-research-flyout';
    } else {
      const visibleAction = await run("[...document.querySelectorAll('.titlebar-summarize-btn,.browser-action-strip .action-strip-btn,.context-actions button')].find(button=>/summarize|zusammenfassen/i.test(button.title+' '+button.getAttribute('aria-label')+' '+button.textContent)&&!button.disabled)");
      if (!visibleAction) throw Error('modern_research_summary_action_missing');
      await run("[...document.querySelectorAll('.titlebar-summarize-btn,.browser-action-strip .action-strip-btn,.context-actions button')].find(button=>/summarize|zusammenfassen/i.test(button.title+' '+button.getAttribute('aria-label')+' '+button.textContent)&&!button.disabled).click();true");
      result.quickchatResearchSurfaceUsed = await run("document.querySelector('.titlebar-summarize-btn')?'modern-titlebar-summarize':document.querySelector('.browser-action-strip .action-strip-btn')?'modern-in-page-action-strip':'context-sidebar-action'");
    }
    await until(() => run("Boolean(document.querySelector('.copilot-split-panel[aria-label]'))"), 'real Quickchat panel opened from summarize action');
    await until(() => run("[...document.querySelectorAll('.copilot-bubble.assistant')].some(e=>e.innerText.includes('E9_SUMMARY_OK'))"),
      'actual page summary appeared in Quickchat', 75000);
    assert((await providerKinds()).includes('quickchat_summary'), 'Summary provider received selected controlled page context');
    result.quickchatSummary = { actualToolbarAction: true, markerDelivered: true, responseRendered: true,
      panel: await run("document.querySelector('.copilot-split-panel')?.getAttribute('aria-label')") };
    await run("document.querySelector('.copilot-mode-switch')?.click();true");
    await until(() => run("Boolean(document.querySelector('.space-assistant'))"), 'actual Space Assistant mode switch');
    await run("document.querySelector('.space-assistant-mode-switch')?.click();true");
    await until(() => run("Boolean(document.querySelector('.copilot-split-panel'))"), 'return to the same Quickchat after Assistant mode switch');
    assert(await run("[...document.querySelectorAll('.copilot-bubble.assistant')].some(e=>e.innerText.includes('E9_SUMMARY_OK'))"),
      'Switching to Space Assistant and back preserves Quickchat transcript');
    result.quickchatSummary.spaceAssistantModeSwitchPreservedQuickchat = true;

    result.phase = 'reset_only_own_quickchat';
    await inputText('.copilot-input-field', 'E9_QUICKCHAT_RESET_SENTINEL');
    await run("document.querySelector('.copilot-input-container').requestSubmit();true");
    await until(() => run("document.querySelector('.copilot-send-btn.stop')!==null"), 'held actual Quickchat response is running');
    await until(() => result.quickchatIpc.some(call => call.channel.endsWith(':start')
      && String(call.prompt).includes('E9_QUICKCHAT_RESET_SENTINEL')), 'actual Quickchat Main start IPC');
    const quickStart = result.quickchatIpc.find(call => call.channel.endsWith(':start')
      && String(call.prompt).includes('E9_QUICKCHAT_RESET_SENTINEL'));
    await run("document.querySelector('.copilot-new-chat-btn')?.click();true");
    await until(() => run("document.querySelector('.copilot-empty-state')!==null&&!document.querySelector('.copilot-send-btn.stop')"),
      'actual Quickchat New Chat resets its view');
    await until(() => result.quickchatIpc.some(call => call.channel.endsWith(':cancel')
      && call.quickChatId === quickStart.result.quickChatId), 'reset reached the bound Main cancel IPC');
    await until(() => result.quickchatBackendCancel?.reset === true, 'backend confirms private Quickchat reset');
    const cancel = result.quickchatIpc.find(call => call.channel.endsWith(':cancel') && call.quickChatId === quickStart.result.quickChatId);
    assert.equal(cancel.streamId, quickStart.result.streamId, 'Reset cancels exactly the Quickchat stream it started');
    assert.equal(result.quickchatBackendCancel.quickChatId, quickStart.result.quickChatId);
    assert.equal(result.quickchatBackendCancel.streamId, quickStart.result.streamId);
    assert.equal(result.quickchatBackendCancel.status, 200);
    const preservedWorkchat = await run(`window.lastbrowser.sidekick.getSession(${JSON.stringify({ sessionId: regularSessionId,
      profile: 'default', workspacePath: info.workspace })})`);
    assert.equal(preservedWorkchat.session.session_id, nativeSessionId,
      'Quickchat reset leaves the independent Goal-bearing Workchat session intact');
    assert.equal(await run("[...document.querySelectorAll('.copilot-message-row')].length"), 0, 'Quickchat transcript was removed by reset');
    result.quickchat = { start: { quickChatId: quickStart.result.quickChatId, streamId: quickStart.result.streamId },
      resetCancelMatchedOwnStream: true, responseAborted: true, transcriptCleared: true,
      ordinaryWorkchatPreserved: true, mainSessionIdsUnaffected: [nativeSessionId, regularSessionId] };

    // Exercise a delayed short-control preflight across a genuine Space switch.
    result.phase = 'scope_change_discards_late_goal_control';
    const pausedScopeStatus = await run(`window.lastbrowser.sidekick.goalCommand(${JSON.stringify({ sessionId: nativeSessionId, args: 'status',
      browserProfileId: 'default', workspacePath: info.workspace })})`);
    assert.equal(pausedScopeStatus.goal?.status, 'paused');
    await run("document.querySelector('.shell-rail .rail-main .rail-button')?.click();true");
    await until(() => run("Boolean(document.querySelector('.native-chat-main section.persistent-goal-controls'))"), 'return to actual goal Workchat controls');
    await until(() => run("[...document.querySelectorAll('.native-chat-main section.persistent-goal-controls .persistent-goal-compact-row button')].some(button=>/resume|fortsetzen/i.test(button.innerText)&&!button.disabled)"), 'Goal Resume for scope-race scenario enabled');
    const scopeResumeBefore = await providerCount();
    await run("[...document.querySelectorAll('.native-chat-main section.persistent-goal-controls .persistent-goal-compact-row button')].find(button=>/resume|fortsetzen/i.test(button.innerText)&&!button.disabled)?.click();true");
    await until(() => result.goalIpc.some(call => call.args === 'resume'), 'goal resumed for scope-race scenario');
    const scopeResume = result.goalIpc.filter(call => call.args === 'resume').at(-1);
    assert(scopeResume?.ok && scopeResume.streamId);
    await run(`window.lastbrowser.sidekick.subscribeChatStream(${JSON.stringify({ streamId: scopeResume.streamId })})`);
    await until(async () => (await fixtureSnapshot()).requests > scopeResumeBefore, 'scope-race goal provider request');
    await until(async () => (await fixtureSnapshot()).goalJudgeRequests >= 3, 'scope-race Goal judge request held');
    const pausesBeforeScopeSwitch = result.goalIpc.filter(call => call.args === 'pause').length;
    delayNextGoalStatus = true;
    await submitComposer('/goal pause');
    await until(() => result.scopeGuardStatusHeld?.sessionId === nativeSessionId, 'Goal-control status response held before renderer context check');
    await run("document.querySelector('.space-button')?.click();true");
    await until(() => run("Boolean(document.querySelector('.space-dropdown .space-list button'))"), 'actual Space selector dropdown');
    await run(`[...document.querySelectorAll('.space-dropdown .space-list button')].find(button=>button.innerText.includes(${JSON.stringify(info.scopeChangeWorkspace)}))?.click();true`);
    await until(() => run(`localStorage.getItem('lastbrowser.activeSpacePath.v1')===${JSON.stringify(info.scopeChangeWorkspace)}`), 'actual user-facing Space selection changed scope');
    assert.equal(typeof releaseDelayedGoalStatus, 'function', 'held status preflight can be released');
    releaseDelayedGoalStatus(); releaseDelayedGoalStatus = null;
    await sleep(1000);
    result.scopeChange = { changedThroughSpaceSelector: true, from: info.workspace, to: info.scopeChangeWorkspace,
      delayedShortControlReplyReleasedAfterSwitch: true,
      stalePauseIpcDispatched: result.goalIpc.filter(call => call.args === 'pause').length > pausesBeforeScopeSwitch };
    assert.equal(result.scopeChange.stalePauseIpcDispatched, false, 'Late status response from old Space cannot dispatch Goal pause');
    const cleanupStatus = await run(`window.lastbrowser.sidekick.goalCommand(${JSON.stringify({ sessionId: nativeSessionId, args: 'status',
      browserProfileId: 'default', workspacePath: info.workspace })})`);
    assert.equal(cleanupStatus.goal?.status, 'active', 'Old scoped Goal remains unchanged by discarded UI action');
    const cleanupPause = await run(`window.lastbrowser.sidekick.goalCommand(${JSON.stringify({ sessionId: nativeSessionId, args: 'pause',
      browserProfileId: 'default', workspacePath: info.workspace, expectedRevision: cleanupStatus.goal.revision,
      clientRequestId: 'e3-e9-scope-cleanup' })})`);
    assert.equal(cleanupPause.goal?.status, 'paused', 'Probe cleanup pauses only its own scoped Goal');
    await originalFetch(info.origin + '/fixture/release-goal', { method: 'POST' });
    await until(() => run(`window.lastbrowser.sidekick.getStreamStatus(${JSON.stringify(scopeResume.streamId)}).then(s=>s.native_controls?.processExited===true)`),
      'scope-race Goal stream exits after controlled release', 75000);
    result.acceptanceFindings.push({ id: 'scope_change_discards_late_goal_control', passed: true,
      detail: 'Actual Space selector changed the workspace while the status preflight response was held; no stale pause IPC was sent.' });

    await windowReload();
    const persistedGoal = await run(`window.lastbrowser.sidekick.goalCommand(${JSON.stringify({ sessionId: nativeSessionId, args: 'status',
      browserProfileId: 'default', workspacePath: info.workspace })})`);
    assert.equal(persistedGoal.goal?.status, 'paused');
    const preservedGoalSession = await run(`window.lastbrowser.sidekick.getSession(${JSON.stringify({ sessionId: nativeSessionId,
      profile: 'default', workspacePath: info.workspace })})`);
    assert(preservedGoalSession.session, 'Original goal-bearing Workchat remains available after Quickchat reset');
    result.goal.afterQuickchatReset = true;
    result.probeCompleted = true; result.passed = result.acceptanceFindings.every(finding => finding.passed); result.phase = 'validated'; save();
  } catch (error) {
    result.error = String(error?.stack || error);
    try { result.failureUi = await run("({shellClass:document.querySelector('.app-shell')?.className,activePanel:document.querySelector('.shell-rail .rail-button.active')?.getAttribute('title'),railButtons:[...document.querySelectorAll('.shell-rail .rail-main .rail-button')].map(e=>({title:e.title,text:e.innerText})),native:document.querySelector('.native-chat-main')?.innerText?.slice(0,1200),sidebarTabs:[...document.querySelectorAll('.sidebar-drawer-tabs [role=tab]')].map(e=>e.innerText),quickchat:document.querySelector('.copilot-split-panel')?.innerText?.slice(0,1200),goal:document.querySelector('.native-chat-main section.persistent-goal-controls')?.innerText,goalHtml:document.querySelector('.native-chat-main section.persistent-goal-controls')?.outerHTML?.slice(0,2400),goalEditorToken:[...document.querySelectorAll('.chat-composer textarea')].map(e=>({value:e.value,placeholder:e.placeholder,aria:e.getAttribute('aria-label')})),dialogs:[...document.querySelectorAll('[role=dialog]')].map(e=>e.getAttribute('aria-label'))})"); } catch {}
  } finally {
    result.ipc = { goalCommands: result.goalIpc, quickchatStarts: result.quickchatIpc.filter(call => call.channel.endsWith(':start')),
      quickchatCancels: result.quickchatIpc.filter(call => call.channel.endsWith(':cancel')) };
    result.providerKinds = result.providerKinds || [];
    save();
    for (const child of children) if (child.exitCode === null && child.signalCode === null) try { child.kill(); } catch {}
    globalThis.fetch = originalFetch;
    process.exitCode = result.probeCompleted ? 0 : 1;
    app.quit(); setTimeout(() => app.exit(result.probeCompleted ? 0 : 1), 2500);
  }
}

if (process.argv.includes('--electron-child')) void electronChild().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
else void main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
