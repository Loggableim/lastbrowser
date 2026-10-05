#!/usr/bin/env node
/* Actual Main/preload/private API and native login input, temporary profiles only. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, milliseconds = 20000) {
  const end = Date.now() + milliseconds;
  while (Date.now() < end) { const value = await check(); if (value) return value; await wait(50); }
  throw new Error('Browser account probe timeout: ' + label);
}
async function parent() {
  const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-ia-acct-'));
  const esbuild = require('esbuild');
  for (const [entry, name] of [['independent-controller', 'controller'], ['sidekick-api', 'api'], ['preload', 'preload'], ['session-request-policy', 'policy'], ['agent-execution-partition', 'partition']])
    esbuild.buildSync({ entryPoints: [path.join(root, `apps/desktop/src/main/${entry}.ts`)], outfile: path.join(temp, name + '.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'] });
  fs.writeFileSync(path.join(temp, 'bootstrap.json'), JSON.stringify({ privateBridgeNonce: randomUUID() }), { mode: 0o600 });
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATH', 'PATHEXT', 'TEMP', 'TMP'].includes(key.toUpperCase())));
  let backend, electron, backendExit, electronExit, error;
  try {
    backend = spawn(path.join(root, 'apps/desktop/runtime/python/python.exe'), [path.join(root, 'scripts/probe-independent-pipeline-backend.py'), temp], { cwd: root, env: environment, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    backend.stdout.resume(); let diagnostic = ''; backend.stderr.on('data', data => { diagnostic = (diagnostic + data).slice(-5000); });
    backendExit = new Promise(resolve => backend.once('exit', (code, signal) => resolve({ code, signal })));
    await until(async () => { if (backend.exitCode !== null) throw new Error('Backend probe failed: ' + diagnostic);
      if (!fs.existsSync(path.join(temp, 'ready.json'))) return false;
      const info = JSON.parse(fs.readFileSync(path.join(temp, 'ready.json'))); try { return (await fetch(info.apiUrl + '/health')).ok; } catch { return false; }
    }, 'native API');
    electron = spawn(require('electron'), [__filename, '--electron-child', temp], { cwd: root, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    electron.stdout.resume(); let stderr = ''; electron.stderr.on('data', data => { stderr = (stderr + data).slice(-8000); });
    electronExit = new Promise(resolve => electron.once('exit', (code, signal) => resolve({ code, signal })));
    const watchdog = setTimeout(() => electron.kill(), 100000);
    const exited = await electronExit; clearTimeout(watchdog);
    const phases = path.join(temp, 'account-phases.jsonl');
    if (fs.existsSync(phases)) process.stdout.write(fs.readFileSync(phases));
    if (exited.code !== 0) {
      const errors = fs.readFileSync(path.join(temp, 'backend-phases.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter(row => row.phase !== 'api_request' || row.status >= 400);
      process.stderr.write(errors.map(row => JSON.stringify(row)).join('\n') + '\n');
      throw new Error('Actual browser account pipeline failed: ' + JSON.stringify(exited) + ' ' + stderr);
    }
    backend.stdin.end('shutdown\n');
    const stopped = await Promise.race([backendExit, wait(10000).then(() => null)]); assert.equal(stopped?.code, 0);
    const evidence = fs.readFileSync(path.join(temp, 'backend-phases.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(evidence.filter(row => row.phase === 'blocked_external_attempt').length, 0);
    assert.equal(evidence.filter(row => row.phase === 'controlled_login_form_submitted').length, 2);
    console.log(JSON.stringify({ phase: 'parent:passed', electron: require('electron/package.json').version, backendStopped: stopped,
      evidence: 'actual native login form input + own Session cookies + production controller/preload/private API/CAS binding + isolated AIAgent/OpenAI SDK account reuse; generic website authentication remains user_confirmed, external OAuth and model quality untested' }));
  } catch (failure) { error = failure; }
  finally {
    if (electron && electron.exitCode === null) { electron.kill(); await electronExit; }
    if (backend && backend.exitCode === null) { backend.stdin.end('shutdown\n'); if (!await Promise.race([backendExit, wait(10000).then(() => null)])) { backend.kill(); await backendExit; } }
    assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep)); assert(path.basename(temp).startsWith('lb-ia-acct-')); fs.rmSync(temp, { recursive: true, force: true });
  }
  if (error) throw error;
}
async function child(temp) {
  const { app, BrowserWindow, BaseWindow, session, webContents, ipcMain, protocol, net, desktopCapturer } = require('electron');
  const { IndependentController, independentIpcRequest } = require(path.join(temp, 'controller.cjs'));
  const { independentApiRequest } = require(path.join(temp, 'api.cjs'));
  const { installSessionRequestPolicy } = require(path.join(temp, 'policy.cjs'));
  const { computeAgentExecutionPartition } = require(path.join(temp, 'partition.cjs'));
  const info = JSON.parse(fs.readFileSync(path.join(temp, 'ready.json'))), nonce = JSON.parse(fs.readFileSync(path.join(temp, 'bootstrap.json'))).privateBridgeNonce;
  const log = (phase, fields = {}) => fs.appendFileSync(path.join(temp, 'account-phases.jsonl'), JSON.stringify({ phase, at: new Date().toISOString(), ...fields }) + '\n');
  app.setPath('userData', path.join(temp, 'user-data')); app.setPath('crashDumps', path.join(temp, 'crash-dumps')); app.setAppLogsPath(path.join(temp, 'app-logs'));
  protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } }]);
  app.on('window-all-closed', () => {}); app.on('will-quit', () => log('will-quit', { windows: BaseWindow.getAllWindows().length }));
  const watchdog = setTimeout(() => { log('watchdog'); app.exit(74); }, 90000);
  let shell, controller;
  try {
    await app.whenReady();
    fs.writeFileSync(path.join(temp, 'index.html'), '<!doctype html><h1>Controlled browser account probe</h1><script>localStorage.setItem("lastbrowser.profiles.v1",JSON.stringify([{id:"pipeline-browser"},{id:"pipeline-browser-b"}]))</script>');
    protocol.handle('app', () => net.fetch(pathToFileURL(path.join(temp, 'index.html')).href));
    const attachSession = target => {
      installSessionRequestPolicy(target, details => { const policy = controller?.requestPolicy(details, target) || { owned: false, allowed: true };
        const url = new URL(details.url);
        if (policy.owned && !policy.allowed) log('owned_request_denied', { origin: url.origin, pathname: url.pathname, webContentsId: details.webContentsId,
          leases: controller?.host?.list().map(row => ({ state: row.state, visible: row.visible, purpose: row.purpose, runnerLive: row.runnerGeneration === controller.generation, origins: controller.host.leases.get(row.leaseId)?.ticket.allowedOrigins })) });
        return { owned: policy.owned, allowed: policy.allowed && (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) || ['127.0.0.1', 'localhost'].includes(url.hostname)) }; });
      target.setPermissionRequestHandler((_contents, _permission, callback) => callback(false)); target.setPermissionCheckHandler(() => false);
      target.on('will-download', (event, item, contents) => { if (controller?.ownsWebContents(contents?.id)) { event.preventDefault(); item.cancel(); } });
    };
    let discardStartAcknowledgement = true, persistedUnknownFlow;
    controller = new IndependentController({ userDataDir: app.getPath('userData'), isShell: target => shell?.webContents === target,
      apiRequest: async (operation, scope, payload, profile) => {
        const result = await independentApiRequest(info.apiUrl, operation, scope, payload, profile, nonce);
        if (operation === 'browser.connectionStart' && discardStartAcknowledgement) {
          discardStartAcknowledgement = false; persistedUnknownFlow = result.flowId;
          throw new Error('Controlled HTTP acknowledgement discarded after actual durable start');
        }
        return result;
      }, attachSession });
    ipcMain.handle('lastbrowser:independent:request', (event, envelope) => independentIpcRequest(controller, event, envelope));
    shell = new BrowserWindow({ show: false, width: 1000, height: 700, webPreferences: { preload: path.join(temp, 'preload.cjs'), contextIsolation: true, sandbox: true } });
    attachSession(shell.webContents.session); await shell.loadURL('app://bundle/index.html');
    const request = async (operation, scope, payload = {}, backendProfileName) => {
      const result = await shell.webContents.executeJavaScript(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1, operation, scope, payload, backendProfileName })})`, true);
      if (!result.ok) throw Object.assign(new Error(result.error.code + ': ' + result.error.message), { code: result.error.code }); return result.value;
    };
    const selections = [await request('resolveScope', undefined, { workspacePath: info.workspaceA, browserProfileId: 'pipeline-browser' }, 'default'),
      await request('resolveScope', undefined, { workspacePath: info.workspaceB, browserProfileId: 'pipeline-browser-b' }, 'other')];
    const localCatalog = await request('localAi', selections[0].scope, { action: 'catalog' }); assert(localCatalog.catalog);
    assert.equal(fs.existsSync(path.join(temp, 'user-data/local-ai/cache')), false);
    const hardware = await request('localAi', selections[0].scope, { action: 'scan' });
    assert.equal(controller.host, undefined); assert.equal(BaseWindow.getAllWindows().length, 1); assert.equal(shell.isVisible(), false);
    assert(hardware.scan.hardware.ramTotalBytes.value > 0); assert(hardware.scan.hardware.diskFreeBytes.value > 0);
    assert(hardware.scan.hardware.adapters.every(adapter => adapter.dedicatedBytes.value === null && adapter.processBudgetBytes.value === null));
    const recommendation = await request('localAi', selections[0].scope, { action: 'recommend', scanId: hardware.scan.hardware.scanId, preset: 'balanced', contextTokens: 2048 });
    assert.equal(recommendation.result.hardwareScanId, hardware.scan.hardware.scanId); assert.deepEqual(recommendation.result.selectedArtifactIds, []);
    await assert.rejects(request('localAi', selections[1].scope, { action: 'recommend', scanId: hardware.scan.hardware.scanId, preset: 'balanced', contextTokens: 2048 }));
    log('actual_local_ai_main_probe', { observedAt: hardware.scan.hardware.observedAt, cpuName: hardware.scan.hardware.cpuName,
      ramMeasured: hardware.scan.hardware.ramTotalBytes.status, diskMeasured: hardware.scan.hardware.diskFreeBytes.status, gpuAdapters: hardware.scan.hardware.adapters.length,
      vramCapacity: 'unknown', noInferenceRuntimeClaim: true, noInstalledModelClaim: true, hostStarted: false, visibleWindows: 0,
      selectedModelCount: recommendation.result.selectedArtifactIds.length, otherScopeScanDenied: true });
    await controller.start();
    const accounts = [];
    for (const [index, selected] of selections.entries()) {
      const scope = selected.scope, own = session.fromPartition(computeAgentExecutionPartition(scope)), user = session.fromPartition(selected.partitionKey);
      await user.cookies.set({ url: info.origin, name: 'pipeline_user_account', value: index ? 'B' : 'A' });
      const permissions = await request('permissions', scope), beforeCookies = await own.cookies.get({}); assert.equal(beforeCookies.length, 0);
      const startRequest = { action: 'start', origin: info.origin, clientRequestId: randomUUID() };
      if (index === 0) {
        await assert.rejects(request('browserConnection', scope, startRequest), error => error.code === 'independent_request_failed');
        assert.equal(typeof persistedUnknownFlow, 'string');
        assert.equal(controller.host.list().length, 0);
      }
      const opened = await request('browserConnection', scope, startRequest);
      if (index === 0) {
        assert.equal(opened.flowId, persistedUnknownFlow);
        const replay = await request('browserConnection', scope, startRequest);
        assert.equal(replay.flowId, opened.flowId); assert.equal(controller.host.list().length, 1);
        log('actual_unknown_start_ack_recovery', { sameRequestId: true, actualPersistedFlowReused: true, nativeTargets: 1, explicitRetry: true });
      }
      assert.equal(opened.setupStatus, 'awaiting_user'); assert.equal(opened.authenticationStatus, 'unknown');
      const lease = controller.host.list().find(row => row.purpose === 'account_setup' && row.scope.spaceId === scope.spaceId); assert(lease?.visible);
      const target = webContents.fromId(lease.webContentsId); assert.equal(target.session, own); assert.notEqual(target.session, user);
      const nativeWindow = BaseWindow.getAllWindows().find(window => window !== shell && window.isVisible()); assert(nativeWindow);
      const nativeSource = (await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 640, height: 480 } })).find(source => source.id === nativeWindow.getMediaSourceId());
      assert(nativeSource && !nativeSource.thumbnail.isEmpty(), 'Login surface has no actual native window evidence');
      await target.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const click = async selector => {
        const point = await target.executeJavaScript(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
        target.focus(); for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) target.sendInputEvent({ type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
      };
      await click('#account'); target.sendInputEvent({ type: 'char', keyCode: index ? 'B' : 'A' });
      assert.equal(await target.executeJavaScript('document.querySelector("#account").value'), index ? 'B' : 'A');
      await click('#login'); await until(() => target.getURL().endsWith('/page'), 'actual login redirect');
      assert.equal((await own.cookies.get({ name: 'pipeline_account' })).length, 1);
      assert.equal((await own.cookies.get({ name: 'pipeline_user_account' })).length, 0);
      const confirmed = await request('browserConnection', scope, { action: 'confirm', flowId: opened.flowId, expectedRevision: opened.revision, clientRequestId: randomUUID(), accountLabel: 'Controlled ' + (index ? 'B' : 'A') });
      assert.equal(confirmed.setupStatus, 'user_confirmed'); assert.equal(confirmed.healthStatus, 'unknown');
      assert.equal(controller.host.list().length, 0); assert.deepEqual(await request('permissions', scope), permissions);
      const confirmedReplay = await request('browserConnection', scope, startRequest);
      assert.equal(confirmedReplay.flowId, confirmed.flowId); assert.equal(confirmedReplay.setupStatus, 'user_confirmed');
      assert.equal(controller.host.list().length, 0);
      for (const name of ['leaseId', 'mainProof', 'mainGeneration', 'runnerGeneration']) assert.equal(Object.hasOwn(confirmedReplay, name), false);
      const capabilities = await request('capabilities', scope, { refresh: true });
      const entry = capabilities.entries.find(row => row.capabilityId === 'browser.account'), connection = entry?.connections.find(row => row.connectionId === confirmed.connectionId);
      assert.equal(connection?.status, 'configured'); assert.equal(connection.authenticationStatus, 'user_confirmed');
      const bindings = await request('bindings', scope, { action: 'bind', capabilityId: 'browser.account', connectionId: confirmed.connectionId, permittedUse: ['browser.account.use'], expectedRevision: 0, clientRequestId: randomUUID() });
      const bound = bindings.connectionBindings.find(row => row.connectionId === confirmed.connectionId); assert(bound);
      const refs = [{ bindingId: bound.bindingId, connectionId: bound.connectionId, connectionRevision: bound.connectionRevision, revision: bound.revision }];
      const ticket = { scope, allowedOrigins: [info.origin], accountBindings: refs };
      const privateBinding = controller.bindings.get(JSON.stringify([scope.backendProfileId, scope.spaceId, scope.browserProfileId]));
      await controller.accounts.validateTicket(privateBinding, ticket);
      await assert.rejects(controller.accounts.validateTicket(privateBinding, { ...ticket, accountBindings: [] }), /explicitly bound/);
      accounts.push({ scope, own, user, confirmed, ticket, privateBinding });
      log('actual_human_login', { scope, nativeVisibleInput: true, ownSessionOnly: true, userCookieCopied: false, workPermissionsUnchanged: true,
        authenticationStatus: confirmed.authenticationStatus, healthStatus: confirmed.healthStatus, receiptBound: true });
    }
    assert.notEqual(accounts[0].own, accounts[1].own);
    shell.webContents.reload(); await until(() => !shell.webContents.isLoading(), 'shell reload');
    for (const account of accounts) await controller.accounts.validateTicket(account.privateBinding, account.ticket);
    log('receipt_reuse_after_renderer_reload', { scopes: 2, immutableProfileBindings: true });
    const logout = await request('browserConnection', accounts[0].scope, { action: 'logout', connectionId: accounts[0].confirmed.connectionId, expectedRevision: accounts[0].confirmed.revision, clientRequestId: randomUUID() });
    assert.equal(logout.setupStatus, 'revoked'); assert.equal(logout.reasonCode, 'user_logged_out');
    assert.equal((await accounts[0].own.cookies.get({})).length, 0); assert.equal((await accounts[0].user.cookies.get({ name: 'pipeline_user_account' })).length, 1);
    assert.equal((await accounts[1].own.cookies.get({ name: 'pipeline_account' })).length, 1); await controller.accounts.validateTicket(accounts[1].privateBinding, accounts[1].ticket);
    await assert.rejects(controller.accounts.validateTicket(accounts[0].privateBinding, accounts[0].ticket));
    log('scoped_logout', { ownSessionCleared: true, otherScopePreserved: true, userSessionPreserved: true, staleReceiptDenied: true });
    const fresh = await request('browserConnection', accounts[0].scope, { action: 'start', origin: info.origin, clientRequestId: randomUUID() });
    const state = await request('permissions', accounts[0].scope);
    await request('permissions', accounts[0].scope, { action: 'revoke', expectedRevision: state.revision });
    await assert.rejects(request('browserConnection', accounts[0].scope, { action: 'confirm', flowId: fresh.flowId, expectedRevision: fresh.revision, clientRequestId: randomUUID() }));
    assert.equal(controller.host.list().length, 0);
    await controller.accounts.validateTicket(accounts[1].privateBinding, accounts[1].ticket);
    log('revocation_vs_confirm', { setupTargetGone: true, confirmationDenied: true, otherScopePreserved: true });
    // Actual Assistant -> RunManager -> isolated AIAgent/OpenAI SDK -> Main
    // account ticket. The provider replies are controlled fixture data only.
    const work = accounts[1], catalog = await request('capabilities', work.scope, { refresh: true });
    const provider = catalog.entries.flatMap(row => row.connections || []).find(row => row.connectionId === 'provider:custom:pipeline'); assert(provider);
    await request('bindings', work.scope, { action: 'bind', capabilityId: 'assistant.conversation', connectionId: provider.connectionId,
      permittedUse: ['conversation', 'adaptive_interview', 'agent_reasoning'], expectedRevision: 0, clientRequestId: randomUUID() });
    const currentPermissions = await request('permissions', work.scope);
    await request('permissions', work.scope, { action: 'grant', expectedRevision: currentPermissions.revision,
      permissions: { browserOrigins: [info.origin], allowedEffects: ['read'], networkOrigins: [], connectorBindings: [], allowedWorkspaceRoots: [], rawCdp: false, terminal: false, desktop: false } });
    const snapshot = await request('assistantSnapshot', work.scope);
    await request('assistantTurn', work.scope, { message: 'Starte PIPELINE:lost', expectedRevision: snapshot.revision, clientRequestId: randomUUID() });
    const reply = await until(async () => { const state = await request('assistantSnapshot', work.scope);
      const failure = state.messages.findLast(row => row.errorCode); if (failure) throw new Error('Account reuse assistant failed: ' + failure.errorCode);
      return state.messages.findLast(row => row.runId && !row.pending) || false;
    }, 'actual account-bound delegation', 30000);
    const runtimeLease = await until(() => controller.host.list().find(row => row.runId === reply.runId && row.state === 'ready' && row.url.endsWith('/page')), 'account runtime target', 30000);
    const nativeTicket = controller.host.leases.get(runtimeLease.leaseId).ticket;
    assert.equal(nativeTicket.accountBindings.length, 1); assert.equal(nativeTicket.accountBindings[0].connectionId, work.confirmed.connectionId);
    const target = webContents.fromId(runtimeLease.webContentsId); assert.equal(target.session, work.own);
    assert.equal(await target.executeJavaScript('document.querySelector("h1").innerText'), 'Controlled account B');
    await until(async () => { const rows = fs.readFileSync(path.join(temp, 'backend-phases.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
      return rows.some(row => row.phase === 'provider_waiting' && row.case === 'lost');
    }, 'actual SDK waiting boundary');
    log('actual_runtime_account_reuse', { scope: work.scope, immutableAccountBinding: true, actualOwnSession: true,
      actualHttpAccount: 'controlled_B', modelProvider: 'controlled_loopback_SSE', inferenceQualityClaim: false });
    const duringRunLogout = await request('browserConnection', work.scope, { action: 'logout', connectionId: work.confirmed.connectionId,
      expectedRevision: work.confirmed.revision, clientRequestId: randomUUID() });
    assert.equal(duringRunLogout.setupStatus, 'revoked');
    await fetch(info.origin + '/fixture/release', { method: 'POST', body: JSON.stringify({ case: 'lost' }) });
    const stoppedRun = await until(async () => { const state = await request('activity', work.scope); const run = state.runs.find(row => row.runId === reply.runId);
      return run && ['interrupted', 'cancelled'].includes(run.state) ? run : false;
    }, 'actual account-revoked worker terminal');
    assert.equal(controller.host.list().length, 0); assert.equal((await work.own.cookies.get({})).length, 0);
    assert.equal((await work.user.cookies.get({ name: 'pipeline_user_account' })).length, 1);
    log('logout_vs_actual_worker_dispatch', { state: stoppedRun.state, ownedTargets: 0, workerAuthorityRevoked: true, ownCookiesCleared: true, userSessionPreserved: true });
    const status = await fetch(info.origin + '/fixture/status').then(response => response.json()); assert.equal(status.deniedExternalProxyRequests, 0);
    log('passed', { scopes: 2, externalAttempts: 0, cookieCopy: false, externalOAuth: 'not_tested' });
    await controller.shutdown(); shell.destroy(); clearTimeout(watchdog); assert.equal(BaseWindow.getAllWindows().length, 0); app.quit();
  } catch (error) {
    log('failure', { name: error.name, message: String(error.message).slice(0, 1200), stack: String(error.stack).slice(0, 3500) });
    await controller?.shutdown().catch(() => {}); for (const window of BaseWindow.getAllWindows()) window.destroy(); clearTimeout(watchdog); app.exit(1);
  }
}
if (process.argv.includes('--electron-child')) child(process.argv.at(-1)); else parent().catch(error => { console.error(error.stack); process.exitCode = 1; });
