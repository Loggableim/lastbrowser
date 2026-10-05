#!/usr/bin/env node
/* Real component/Main/API/AIAgent/SDK pipeline using only owned temporary profiles. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check(); if (value) return value;
    await wait(100);
  }
  throw new Error('Controlled pipeline timeout: ' + label);
}
async function parent() {
  const root = path.resolve(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-independent-pipeline-'));
  const phases = path.join(temp, 'phases.jsonl');
  const esbuild = require('esbuild');
  const builds = [
    ['apps/desktop/src/main/independent-controller.ts', 'controller.cjs'],
    ['apps/desktop/src/main/sidekick-api.ts', 'api.cjs'],
    ['apps/desktop/src/main/preload.ts', 'preload.cjs'],
    ['apps/desktop/src/main/session-request-policy.ts', 'session-policy.cjs'],
    ['apps/desktop/src/main/agent-execution-partition.ts', 'execution-partition.cjs']
  ];
  for (const [entry, file] of builds) esbuild.buildSync({ entryPoints: [path.join(root, entry)], outfile: path.join(temp, file),
    bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'] });
  esbuild.buildSync({ entryPoints: [path.join(root, 'apps/desktop/tests/independent-pipeline-renderer-entry.tsx')],
    outfile: path.join(temp, 'renderer.js'), bundle: true, platform: 'browser', format: 'iife', target: 'chrome138',
    define: { 'process.env.NODE_ENV': '"production"' } });
  fs.writeFileSync(path.join(temp, 'bootstrap.json'), JSON.stringify({ privateBridgeNonce: randomUUID(), interviewProbe: process.argv.includes('--interview') }), { mode: 0o600 });
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    ['SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATH', 'PATHEXT', 'TEMP', 'TMP'].includes(key.toUpperCase())));
  let backend, electron, backendExit, electronExit, error;
  try {
    backend = spawn(path.join(root, 'apps/desktop/runtime/python/python.exe'), [path.join(root, 'scripts/probe-independent-pipeline-backend.py'), temp],
      { cwd: root, env: environment, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    backend.stdout.resume(); let diagnostic = '';
    backend.stderr.on('data', data => { diagnostic = (diagnostic + data.toString()).slice(-6000); });
    backendExit = new Promise(resolve => backend.once('exit', (code, signal) => resolve({ code, signal })));
    await until(async () => { if (backend.exitCode !== null) throw new Error('Backend fixture failed: ' + diagnostic);
      if (!fs.existsSync(path.join(temp, 'ready.json'))) return false;
      const info = JSON.parse(fs.readFileSync(path.join(temp, 'ready.json')));
      try { return (await fetch(info.apiUrl + '/health')).ok; } catch { return false; }
    }, 'native API ready');
    const electronEnv = { ...environment }; delete electronEnv.ELECTRON_RUN_AS_NODE;
    electron = spawn(require('electron'), [__filename, '--electron-child', temp],
      { cwd: root, env: electronEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    electron.stdout.resume(); let stderr = '';
    electron.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-8000); });
    electronExit = new Promise(resolve => electron.once('exit', (code, signal) => resolve({ code, signal })));
    const watchdog = setTimeout(() => electron.kill(), 180000);
    const exited = await electronExit; clearTimeout(watchdog);
    if (exited.code !== 0) {
      if (fs.existsSync(phases)) process.stderr.write(fs.readFileSync(phases));
      if (fs.existsSync(path.join(temp, 'backend-phases.jsonl'))) {
        const diagnostics = fs.readFileSync(path.join(temp, 'backend-phases.jsonl'), 'utf8').trim().split('\n')
          .map(line => JSON.parse(line)).filter(row => row.phase !== 'api_request' || row.status >= 400);
        process.stderr.write(diagnostics.map(row => JSON.stringify(row)).join('\n') + '\n');
      }
      throw new Error('Electron pipeline failed: ' + JSON.stringify(exited) + ' ' + stderr);
    }
    process.stdout.write(fs.readFileSync(phases));
    backend.stdin.end('shutdown\n');
    const backendStopped = await Promise.race([backendExit, wait(10000).then(() => null)]);
    assert.equal(backendStopped?.code, 0, 'Backend explicit shutdown did not finish');
    const backendPhases = fs.readFileSync(path.join(temp, 'backend-phases.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert(backendPhases.some(row => row.phase === 'backend_shutdown'));
    const authEvidence = backendPhases.filter(row => row.phase === 'auth_store_unchanged_before_first_sdk');
    assert.equal(authEvidence.length, 2); assert(authEvidence.every(row => row.unchanged));
    const childPhases = fs.readFileSync(phases, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert(childPhases.some(row => row.phase === 'passed'));
    assert(childPhases.some(row => row.phase === 'will-quit' && row.windows === 0));
    console.log(JSON.stringify({ phase: 'parent:passed', electron: require('electron/package.json').version, backendStopped,
      providerRequests: backendPhases.filter(row => row.phase === 'provider_request').length,
      evidence: 'actual mounted SpaceAssistantPanel + production preload/controller/API + isolated AIAgent/OpenAI SDK + controlled loopback SSE; no model-quality/full App.tsx/Store acceptance claim' }));
  } catch (failure) { error = failure; }
  finally {
    if (electron && electron.exitCode === null) { electron.kill(); await electronExit; }
    if (backend && backend.exitCode === null) {
      backend.stdin.end('shutdown\n');
      if (!await Promise.race([backendExit, wait(10000).then(() => null)])) { backend.kill(); await backendExit; }
    }
    assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert(path.basename(temp).startsWith('lastbrowser-independent-pipeline-'));
    fs.rmSync(temp, { recursive: true, force: true });
  }
  if (error) throw error;
}

async function child(temp) {
  const { app, BrowserWindow, BaseWindow, ipcMain, protocol, net, session, webContents } = require('electron');
  const { IndependentController, independentIpcRequest } = require(path.join(temp, 'controller.cjs'));
  const { independentApiRequest, removeSpace } = require(path.join(temp, 'api.cjs'));
  const { installSessionRequestPolicy } = require(path.join(temp, 'session-policy.cjs'));
  const { computeAgentExecutionPartition } = require(path.join(temp, 'execution-partition.cjs'));
  const info = JSON.parse(fs.readFileSync(path.join(temp, 'ready.json')));
  const privateBridgeNonce = JSON.parse(fs.readFileSync(path.join(temp, 'bootstrap.json'))).privateBridgeNonce;
  const interviewProbe = JSON.parse(fs.readFileSync(path.join(temp, 'bootstrap.json'))).interviewProbe;
  const log = (phase, data = {}) => fs.appendFileSync(path.join(temp, 'phases.jsonl'), JSON.stringify({ phase, at: new Date().toISOString(), ...data }) + '\n');
  app.setPath('userData', path.join(temp, 'user-data'));
  app.setPath('crashDumps', path.join(temp, 'crash-dumps'));
  app.setAppLogsPath(path.join(temp, 'app-logs'));
  protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } }]);
  app.on('window-all-closed', () => {});
  app.on('will-quit', () => log('will-quit', { windows: BaseWindow.getAllWindows().length }));
  const watchdog = setTimeout(() => { log('watchdog'); app.exit(72); }, 165000);
  let shell, controller;
  try {
    await app.whenReady();
    protocol.handle('app', request => {
      const file = new URL(request.url).pathname.slice(1) || 'index.html';
      if (!['index.html', 'renderer.js', 'renderer.css'].includes(file)) return new Response('denied', { status: 403 });
      return net.fetch(pathToFileURL(path.join(temp, file)).href);
    });
    const escaped = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    fs.writeFileSync(path.join(temp, 'index.html'), `<!doctype html><html><head><title>Controlled Lastbrowser pipeline</title><link rel="stylesheet" href="renderer.css"></head>
      <body data-workspace-path="${escaped(info.workspaceA)}" data-browser-profile-id="pipeline-browser" data-backend-profile-name="default">
      <script>localStorage.setItem('lastbrowser.locale','en');localStorage.setItem('lastbrowser.profiles.v1',JSON.stringify([{id:'pipeline-browser'},{id:'pipeline-browser-b'}]));</script>
      <div id="root"></div><script src="renderer.js"></script></body></html>`);
    const attachSession = target => {
      installSessionRequestPolicy(target, details => {
        const scoped = controller?.requestPolicy(details, target) || { owned: false, allowed: true };
        const url = new URL(details.url);
        return { owned: scoped.owned, allowed: scoped.allowed && (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) || ['127.0.0.1', 'localhost'].includes(url.hostname)) };
      });
      target.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      target.setPermissionCheckHandler(() => false);
      target.on('will-download', (event, item, contents) => { if (controller?.ownsWebContents(contents?.id)) { event.preventDefault(); item.cancel(); } });
    };
    controller = new IndependentController({ userDataDir: app.getPath('userData'), isShell: contents => shell?.webContents === contents,
      apiRequest: (operation, scope, payload, profile) => independentApiRequest(info.apiUrl, operation, scope, payload, profile, privateBridgeNonce), attachSession });
    ipcMain.handle('lastbrowser:independent:request', (event, envelope) => independentIpcRequest(controller, event, envelope));
    ipcMain.handle('lastbrowser:sidekick:removeSpace', async (event, input) => {
      const bound = await controller.bindSpaceRemoval(event, input); bound.recheck();
      const result = await removeSpace(info.apiUrl, { ...bound.request,
        ...(bound.request.spaceScope ? { nativeBridgeNonce: privateBridgeNonce } : {}) });
      bound.recheck(); return result;
    });
    ipcMain.handle('lastbrowser:i18n:setLocale', (_event, locale) => locale);
    await controller.start();
    shell = new BrowserWindow({ show: false, width: 1100, height: 800,
      webPreferences: { preload: path.join(temp, 'preload.cjs'), sandbox: true, contextIsolation: true } });
    shell.webContents.on('console-message', (_event, level, message) => { if (level >= 2) log('renderer_diagnostic', { message: message.slice(0, 1500) }); });
    attachSession(shell.webContents.session);
    await shell.loadURL('app://bundle/index.html');
    shell.show(); shell.minimize();
    const inShell = code => shell.webContents.executeJavaScript(code, true);
    const request = async (operation, scope, payload = {}) => {
      const envelope = await inShell(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1, operation, scope, payload })})`);
      if (!envelope.ok) throw Object.assign(new Error('Actual broker: ' + envelope.error.code), { code: envelope.error.code });
      return envelope.value;
    };
    const initial = await until(async () => { const evidence = await inShell('window.pipelineEvidence');
      if (evidence?.error) throw new Error('Actual React scope failed: ' + evidence.error);
      return evidence?.selection || false;
    }, 'actual React Scope');
    assert.equal(await inShell('Boolean(document.querySelector("textarea"))'), true);
    const scopeA = initial.scope;
    const selectedB = { workspacePath: info.workspaceB, browserProfileId: 'pipeline-browser-b', backendProfileName: 'other' };
    await inShell(`window.pipelineSelectScope(${JSON.stringify(selectedB)})`);
    const scopeB = (await inShell('window.pipelineEvidence.selection')).scope;
    assert.notEqual(scopeA.backendProfileId, scopeB.backendProfileId);
    await inShell(`window.pipelineSelectScope(${JSON.stringify({ workspacePath: info.workspaceA, browserProfileId: 'pipeline-browser', backendProfileName: 'default' })})`);
    const saved = JSON.parse(fs.readFileSync(path.join(temp, 'user-data/independent-browser-bindings.json')));
    const partitions = new Map(saved.bindings.map(value => [value.scope.spaceId, value.partitionKey]));
    for (const [scope, account] of [[scopeA, 'A'], [scopeB, 'B']]) {
      const userSession = session.fromPartition(partitions.get(scope.spaceId));
      await userSession.cookies.set({ url: info.origin, name: 'pipeline_user_account', value: account });
      const executionSession = session.fromPartition(computeAgentExecutionPartition(scope));
      assert.equal((await executionSession.cookies.get({ name: 'pipeline_user_account' })).length, 0);
      // Controlled explicit account fixture in the real execution Session; no automatic User-cookie copy or login-UI claim.
      await executionSession.cookies.set({ url: info.origin, name: 'pipeline_account', value: account });
      log('explicit_execution_account_fixture', { scope, dedicatedAgentSession: true, noAutomaticUserCookieCopy: true });
      const capabilities = await request('capabilities', scope, { refresh: true });
      const connection = capabilities.entries.flatMap(entry => entry.connections || []).find(value => value.connectionId === 'provider:custom:pipeline');
      assert.equal(connection.status, 'configured');
      await request('bindings', scope, { action: 'bind', capabilityId: 'assistant.conversation', connectionId: connection.connectionId,
        permittedUse: ['conversation', 'adaptive_interview', 'agent_reasoning'], expectedRevision: 0, clientRequestId: randomUUID() });
      const permissions = await request('permissions', scope);
      await request('permissions', scope, { action: 'grant', expectedRevision: permissions.revision,
        permissions: { browserOrigins: [info.origin], networkOrigins: [], connectorBindings: [], allowedWorkspaceRoots: [], allowedEffects: ['read', 'write'], rawCdp: false, terminal: false, desktop: false } });
    }
    if (interviewProbe) {
      const beforePermissions = await request('permissions', scopeA);
      const beforeB = await request('assistantSnapshot', scopeB);
      const click = async label => {
        await until(() => inShell(`Boolean([...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(label)}&&!button.disabled))`), 'actual button ' + label);
        await inShell(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(label)}).click();true`);
      };
      await click('Profile'); await click('Set up this assistant');
      const initialOptions = await until(() => inShell("(()=>{const n=document.querySelectorAll('.space-interview-options input').length;return n>=3&&n<=4?n:false})()"), 'actual initial interview options');
      await inShell("document.querySelector('.space-interview-options input').click();true");
      assert.equal((await request('assistantSnapshot', scopeA)).interview.answers.length, 0);
      const answer = async text => {
        await inShell(`(()=>{const field=document.querySelector('.space-interview form textarea');const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;setter.call(field,${JSON.stringify(text)});field.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
        await until(() => inShell("document.querySelector('.space-interview button[type=submit]')?.disabled===false"), 'actual interview answer ready');
        await inShell("document.querySelector('.space-interview form').requestSubmit();true");
      };
      await answer('Controlled research workspace with freely entered preferences.');
      await until(() => inShell("document.querySelector('.space-interview legend')?.textContent==='Which help is useful for this controlled Space?'"), 'actual structured SDK interview question', 75000);
      assert.equal(await inShell("document.querySelectorAll('.space-interview-options input').length"), 4);
      await answer('Prefer summaries and clear explanations, without background actions.');
      await until(async () => (await request('assistantSnapshot', scopeA)).interview.modelError==='interview_model_unavailable', 'actual bounded model fallback', 75000);
      await until(() => inShell("document.querySelectorAll('.space-interview-options input').length>=3"), 'actual manual fallback options');
      await new Promise(resolve => { shell.webContents.once('did-finish-load', resolve); shell.webContents.reload(); });
      await click('Profile');
      await until(() => inShell("Boolean(document.querySelector('.space-interview legend'))"), 'actual interview reload recovery');
      const recovered = await request('assistantSnapshot', scopeA);
      assert.equal(recovered.interview.answers.length, 2);
      await click('Review profile'); await click('Confirm preferences');
      await until(async () => (await request('assistantSnapshot', scopeA)).interview.stage==='confirmed', 'actual explicit profile confirmation');
      const confirmed = await request('assistantSnapshot', scopeA);
      assert(confirmed.confirmedProfile.values.purpose.includes('Controlled research workspace'));
      assert.deepEqual(await request('permissions', scopeA), beforePermissions);
      const afterB = await request('assistantSnapshot', scopeB);
      for (const field of ['scope', 'conversationId', 'revision', 'messages', 'interview', 'confirmedProfile']) assert.deepEqual(afterB[field], beforeB[field]);
      const evidence = await inShell('window.pipelineEvidence'); assert.equal(evidence.enterCount, 0);
      log('actual_interview_final', { options: [initialOptions,4], choiceDoesNotSubmit: true, equalFreeText: true, actualSdkQuestion: true,
        boundedRepairFallback: true, actualReloadRecovered: true, explicitConfirmation: true, noNavigation: true, permissionsUnchanged: true, otherProfileUnchanged: true });
      for (const name of ['profilechat', 'profilerun']) {
        const before = await request('assistantSnapshot', scopeA), previous = new Set(before.messages.map(message => message.id));
        await inShell(`(()=>{const field=document.querySelector('.space-assistant-composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,${JSON.stringify('Starte PIPELINE:' + name)});field.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
        await until(() => inShell("document.querySelector('.space-assistant-composer button[type=submit]')?.disabled===false"), 'actual confirmed-profile delegation ready');
        await inShell("document.querySelector('.space-assistant-composer').requestSubmit();true");
        const dispatched = await until(async () => {
          const snapshot = await request('assistantSnapshot', scopeA);
          const failure = snapshot.messages.find(message => !previous.has(message.id) && message.errorCode);
          if (failure) throw new Error('Confirmed-profile delegation failed: ' + failure.errorCode);
          return snapshot.messages.find(message => !previous.has(message.id) && message.runId && message.targetSessionId) || false;
        }, 'actual confirmed-profile dispatch ' + name, 75000);
        await until(async () => {
          const activity = await request('activity', scopeA), run = activity.runs.find(row => row.runId === dispatched.runId);
          if (run?.state === 'failed') throw new Error('Confirmed-profile task failed: ' + run.reasonCode);
          return run?.state === 'completed';
        }, 'actual confirmed-profile completion ' + name, 75000);
        const capture = await until(() => {
          const phases = fs.readFileSync(path.join(temp, 'backend-phases.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
          return phases.find(row => row.phase === 'actual_confirmed_profile_sdk_context' && row.case === name) || false;
        }, 'actual confirmed-profile SDK payload ' + name, 75000);
        assert(capture?.purposePresent); assert(capture?.helpPresent);
        await until(() => {
          for (const file of fs.readdirSync(path.join(temp, 'backend-home'), { recursive: true }).filter(file => String(file).endsWith(dispatched.targetSessionId + '.json'))) {
            const saved = JSON.parse(fs.readFileSync(path.join(temp, 'backend-home', file), 'utf8'));
            if ((saved.messages || []).some(message => message.role === 'assistant' && message.content?.includes('Controlled confirmed-profile task completed.'))) return true;
          }
          return false;
        }, 'actual original working-chat projection ' + name, 75000);
      }
      assert.deepEqual(await request('permissions', scopeA), beforePermissions);
      log('actual_confirmed_profile_final', { workingChatSdkContext: true, independentRunSdkContext: true, actualPanelDispatch: true,
        originalScope: true, preferencesDidNotGrantRights: true });
      await inShell('window.pipelineDispose();true'); await controller.shutdown(); shell.destroy();
      log('passed', { interviewProbe: true }); clearTimeout(watchdog); app.quit(); return;
    }
    const status = () => fetch(info.origin + '/fixture/status').then(response => response.json());
    const release = name => fetch(info.origin + '/fixture/release', { method: 'POST', body: JSON.stringify({ case: name }) });
    const activity = scope => request('activity', scope);
    const approve = async (scope, runId) => {
      const observed = await until(async () => { const value = await activity(scope);
        return value.approvals.find(row => row.runId === runId && row.state === 'pending') || false;
      }, 'real mutation approval');
      await request('approve', scope, { approvalId: observed.approvalId, approved: true, actionDigest: observed.actionDigest,
        expectedPermissionRevision: observed.permissionRevision });
    };
    const delegate = async (scope, name) => {
      const clientRequestId = randomUUID();
      const beforeTurn = await request('assistantSnapshot', scope);
      const previousRuns = new Set(beforeTurn.messages.map(message => message.runId).filter(Boolean));
      const previousMessages = new Set(beforeTurn.messages.map(message => message.id));
      for (let attempt = 0; ; attempt++) {
        const snapshot = await request('assistantSnapshot', scope);
        try {
          await request('assistantTurn', scope, { message: 'Starte PIPELINE:' + name, expectedRevision: snapshot.revision, clientRequestId });
          break;
        } catch (error) { if (error.code !== 'stale_revision' || attempt >= 2) throw error; }
      }
      const reply = await until(async () => { const value = await request('assistantSnapshot', scope);
        const error = value.messages.findLast(row => row.role === 'assistant' && row.errorCode && !previousMessages.has(row.id));
        if (error) throw new Error('Assistant actual delegation failed: ' + error.errorCode);
        return value.messages.findLast(row => row.role === 'assistant' && !row.pending && row.runId
          && !previousRuns.has(row.runId) && row.content === 'Controlled task delegated.') || false;
      }, 'actual Assistant delegation ' + name);
      return reply;
    };
    const runState = (scope, runId, states) => until(async () => {
      const value = await activity(scope), run = value.runs.find(row => row.runId === runId);
      if (run?.state === 'failed') throw new Error('Actual run failed: ' + run.reasonCode);
      return run && states.includes(run.state) ? run : false;
    }, 'run ' + runId.slice(0, 8) + ' -> ' + states.join('/'));
    const verifyProjection = async (scope, reply, expectedContent) => {
      const directory = path.join(temp, 'backend-home');
      const projection = await until(() => {
        const candidates = fs.readdirSync(directory, { recursive: true }).filter(file => String(file).endsWith(reply.targetSessionId + '.json'));
        for (const file of candidates) {
          const data = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
          if (data.independent?.runId === reply.runId && data.independent.state === 'completed'
            && data.messages.some(message => message.role === 'assistant' && message.content === expectedContent)) return data;
        }
        return false;
      }, 'native durable workchat result');
      assert.deepEqual(projection.independent.scope, scope);
      assert.equal(projection.messages.filter(message => message.role === 'assistant' && message.independentRunId === reply.runId).length, 1);
      return projection;
    };
    const held = async (scope, name) => {
      const reply = await delegate(scope, name);
      await until(() => controller.host?.list().find(lease => lease.runId === reply.runId && lease.url.endsWith('/page')), 'real managed host');
      await until(() => { const rows = fs.readFileSync(path.join(temp, 'backend-phases.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
        return rows.some(row => row.phase === 'provider_waiting' && row.case === name);
      }, 'SDK provider hold ' + name);
      return reply;
    };
    const pause = await held(scopeA, 'pause');
    const before = await status(); await wait(450); assert((await status()).ticks.A > before.ticks.A);
    log('minimized_real_agent_progress', { runId: pause.runId, account: 'A' });
    await new Promise(resolve => { shell.webContents.once('did-finish-load', resolve); shell.webContents.reload(); });
    await until(() => inShell('window.pipelineEvidence?.selection || false'), 'React shell reload');
    await inShell(`window.pipelineSelectScope(${JSON.stringify(selectedB)})`);
    const bBefore = await status(); await wait(350); assert((await status()).ticks.A > bBefore.ticks.A);
    assert(controller.host.list().some(lease => lease.runId === pause.runId && lease.scope.spaceId === scopeA.spaceId));
    const conversation = await request('assistantSnapshot', scopeA);
    await request('assistantTurn', scopeA, { message: 'Was läuft gerade?', expectedRevision: conversation.revision, clientRequestId: randomUUID() });
    await until(async () => (await request('assistantSnapshot', scopeA)).messages.some(row => row.role === 'assistant' && row.content.includes(pause.runId.slice(0, 8))), 'actual status conversation parallel');
    const current = (await activity(scopeA)).runs.find(row => row.runId === pause.runId);
    await request('runControl', scopeA, { runId: pause.runId, command: 'pause', expectedRevision: current.stateRevision, clientRequestId: randomUUID() });
    await release('pause'); await runState(scopeA, pause.runId, ['paused']);
    const lease = controller.host.list().find(value => value.runId === pause.runId);
    assert.equal(lease.state, 'paused');
    await request('resumeBrowser', scopeA, { runId: pause.runId, navigationEpoch: lease.navigationEpoch, permissionEpoch: lease.permissionEpoch, clientRequestId: randomUUID() });
    await approve(scopeA, pause.runId);
    await until(async () => (await status()).mutations.A === 1, 'controlled approved browser mutation');
    await release('pause_complete'); await runState(scopeA, pause.runId, ['completed']);
    await verifyProjection(scopeA, pause, 'Controlled local browser task completed.');
    log('reload_switch_parallel_assistant_pause_resume_approval', { runId: pause.runId });
    const chat = await delegate(scopeB, 'chat'); await runState(scopeB, chat.runId, ['completed']);
    assert(chat.targetSessionId && chat.targetSessionId !== conversation.conversationId);
    await verifyProjection(scopeB, chat, 'Controlled delegated work chat completed.');
    log('actual_delegated_work_chat_completed', { sessionId: chat.targetSessionId });
    for (const name of ['stop', 'revoke', 'lost']) {
      const reply = await held(scopeB, name);
      const before = await status();
      if (name === 'stop') {
        const run = (await activity(scopeB)).runs.find(row => row.runId === reply.runId);
        await request('runControl', scopeB, { runId: reply.runId, command: 'cancel', expectedRevision: run.stateRevision, clientRequestId: randomUUID() });
      } else if (name === 'revoke') {
        const permission = await request('permissions', scopeB);
        const result = await request('permissions', scopeB, { action: 'revoke', expectedRevision: permission.revision });
        assert.equal(result.acknowledgement.acknowledged, true);
      } else {
        const owned = controller.host.list().find(value => value.runId === reply.runId);
        assert(controller.ownsWebContents(owned.webContentsId)); webContents.fromId(owned.webContentsId).close();
      }
      await release(name);
      const terminal = await runState(scopeB, reply.runId, name === 'stop' ? ['cancelled'] : ['interrupted']);
      assert(!controller.host.list().some(lease => lease.runId === reply.runId));
      assert.equal((await status()).mutations.B || 0, before.mutations.B || 0);
      log('actual_' + name + '_closed_dispatch', { runId: reply.runId, state: terminal.state });
      if (name === 'revoke') {
        const permission = await request('permissions', scopeB);
        await request('permissions', scopeB, { action: 'grant', expectedRevision: permission.revision,
          permissions: { browserOrigins: [info.origin], allowedEffects: ['read', 'write'] } });
      }
    }
    const removeReply = await held(scopeB, 'remove');
    const beforeRemove = await status();
    const removed = await inShell(`window.lastbrowser.sidekick.removeSpace(${JSON.stringify({ path: info.workspaceB, browserProfileId: scopeB.browserProfileId })})`);
    assert.equal(removed.ok, true); assert(Array.isArray(removed.workspaces));
    assert(!removed.workspaces.some(space => space.path === info.workspaceB));
    await release('remove');
    await until(() => !controller.host.list().some(lease => lease.runId === removeReply.runId), 'removed Space target closed');
    const removal = await status();
    assert.equal(removal.mutations.B || 0, beforeRemove.mutations.B || 0);
    assert(removal.removalEvidence.some(profile => profile.runs.some(run => run.runId === removeReply.runId && ['cancelled', 'interrupted'].includes(run.state))));
    assert(removal.removalEvidence.some(profile => profile.bindings.some(binding => binding.scope.spaceId === scopeB.spaceId
      && binding.scope.backendProfileId === scopeB.backendProfileId && binding.tombstoned)));
    assert(removal.removalEvidence.some(profile => profile.bindings.some(binding => binding.scope.spaceId === scopeA.spaceId
      && binding.scope.backendProfileId === scopeA.backendProfileId && !binding.tombstoned)));
    assert(fs.existsSync(info.workspaceB), 'Removing a Space must preserve its user files');
    await request('activity', scopeA);
    log('actual_space_removal_stopped_and_tombstoned', { runId: removeReply.runId, removedSpaceId: scopeB.spaceId,
      otherProfileUnaffected: true, userFilesRetained: true });
    const observed = await status(); assert.equal(observed.ticks.missing || 0, 0);
    assert.equal(observed.deniedExternalProxyRequests, 0);
    await inShell('window.pipelineDispose()'); await controller.shutdown();
    assert.equal(controller.browserTargets().length, 0);
    shell.destroy(); log('passed', { actualProviderRequests: observed.providerCalls, browserAccounts: ['A', 'B'], osDefaultProtocolRegistration: false });
    clearTimeout(watchdog); app.quit();
  } catch (error) {
    log('failed', { message: String(error.message), stack: String(error.stack).slice(0, 5000) });
    if (shell && !shell.isDestroyed()) {
      log('renderer_evidence', { evidence: await shell.webContents.executeJavaScript('JSON.stringify({pipeline:window.pipelineEvidence,text:document.body.innerText.slice(0,2000)})').catch(() => 'unavailable') });
    }
    if (controller) await controller.shutdown().catch(() => {});
    if (shell && !shell.isDestroyed()) shell.destroy();
    clearTimeout(watchdog); app.exit(1);
  }
}
if (process.argv.includes('--electron-child')) child(process.argv.at(-1));
else parent().catch(error => { console.error(error.message); process.exitCode = 1; });
