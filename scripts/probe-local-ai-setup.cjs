#!/usr/bin/env node
/* Real Castlabs Main/preload/private API/installer, synthetic files under 1 MiB. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, milliseconds = 20000) {
  const end = Date.now() + milliseconds;
  while (Date.now() < end) { const result = await check(); if (result) return result; await wait(30); }
  throw new Error('Local AI setup probe timeout: ' + label);
}
async function parent() {
  const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-local-ai-'));
  for (const [entry, name] of [['independent-controller', 'controller'], ['sidekick-api', 'api'], ['preload', 'preload']])
    require('esbuild').buildSync({ entryPoints: [path.join(root, `apps/desktop/src/main/${entry}.ts`)], outfile: path.join(temp, name + '.cjs'),
      bundle: true, platform: 'node', format: 'cjs', external: ['electron'] });
  fs.writeFileSync(path.join(temp, 'bootstrap.json'), JSON.stringify({ privateBridgeNonce: randomUUID() }), { mode: 0o600 });
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATH', 'PATHEXT', 'TEMP', 'TMP'].includes(key.toUpperCase())));
  let backend, electron, backendExit, electronExit, failure;
  try {
    backend = spawn(path.join(root, 'apps/desktop/runtime/python/python.exe'), [path.join(root, 'scripts/probe-local-ai-setup-backend.py'), temp],
      { cwd: root, env: environment, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    backend.stdout.resume(); let diagnostic = ''; backend.stderr.on('data', data => { diagnostic = (diagnostic + data).slice(-6000); });
    backendExit = new Promise(resolve => backend.once('exit', (code, signal) => resolve({ code, signal })));
    await until(async () => {
      if (backend.exitCode !== null) throw new Error('Controlled backend failed: ' + diagnostic);
      if (!fs.existsSync(path.join(temp, 'ready.json'))) return false;
      const info = JSON.parse(fs.readFileSync(path.join(temp, 'ready.json')));
      try { return (await fetch(info.apiUrl + '/health')).ok; } catch { return false; }
    }, 'actual API ready');
    electron = spawn(require('electron'), [__filename, '--electron-child', temp], { cwd: root, env: environment,
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    electron.stdout.resume(); let stderr = ''; electron.stderr.on('data', data => { stderr = (stderr + data).slice(-6000); });
    electronExit = new Promise(resolve => electron.once('exit', (code, signal) => resolve({ code, signal })));
    const watchdog = setTimeout(() => electron.kill(), 70000);
    const exited = await electronExit; clearTimeout(watchdog);
    if (fs.existsSync(path.join(temp, 'setup-phases.jsonl'))) process.stdout.write(fs.readFileSync(path.join(temp, 'setup-phases.jsonl')));
    if (exited.code !== 0) {
      if (fs.existsSync(path.join(temp, 'backend-phases.jsonl'))) process.stderr.write(fs.readFileSync(path.join(temp, 'backend-phases.jsonl')));
      throw new Error('Actual Main/Leaf setup failed: ' + JSON.stringify(exited) + ' ' + stderr + ' ' + diagnostic);
    }
    backend.stdin.end('shutdown\n');
    const stopped = await Promise.race([backendExit, wait(10000).then(() => null)]); assert.equal(stopped?.code, 0);
    const phases = fs.readFileSync(path.join(temp, 'backend-phases.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert(!phases.some(row => row.phase === 'external_attempt'));
    assert(phases.some(row => row.phase === 'actual_backend_shutdown' && row.activeIO === 0 && row.externalAttempts === 0));
    console.log(JSON.stringify({ phase: 'parent:passed', electron: require('electron/package.json').version,
      backendStopped: stopped, externalAttempts: 0, evidence: 'production Main/preload/private HTTP + actual SQLite consent/PID lease/installer; pinned synthetic manifest and localhost-only trusted transport; no real model download or inference/runtime readiness claim' }));
  } catch (error) { failure = error; }
  finally {
    if (electron && electron.exitCode === null) { electron.kill(); await electronExit; }
    if (backend && backend.exitCode === null) { backend.stdin.end('shutdown\n');
      if (!await Promise.race([backendExit, wait(10000).then(() => null)])) { backend.kill(); await backendExit; } }
    assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep)); assert(path.basename(temp).startsWith('lb-local-ai-'));
    fs.rmSync(temp, { recursive: true, force: true });
  }
  if (failure) throw failure;
}
async function child(temp) {
  const { app, BrowserWindow, BaseWindow, ipcMain, protocol, net } = require('electron');
  const { IndependentController, independentIpcRequest } = require(path.join(temp, 'controller.cjs'));
  const { independentApiRequest } = require(path.join(temp, 'api.cjs'));
  const info = JSON.parse(fs.readFileSync(path.join(temp, 'ready.json'))), nonce = JSON.parse(fs.readFileSync(path.join(temp, 'bootstrap.json'))).privateBridgeNonce;
  const log = (phase, fields = {}) => fs.appendFileSync(path.join(temp, 'setup-phases.jsonl'), JSON.stringify({ phase, at: new Date().toISOString(), ...fields }) + '\n');
  app.setPath('userData', path.join(temp, 'user-data')); app.setPath('crashDumps', path.join(temp, 'crash-dumps')); app.setAppLogsPath(path.join(temp, 'logs'));
  protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } }]);
  app.on('window-all-closed', () => {});
  const watchdog = setTimeout(() => { log('watchdog'); app.exit(74); }, 60000);
  let shell, controller;
  try {
    await app.whenReady();
    fs.writeFileSync(path.join(temp, 'index.html'), '<!doctype html><h1>Controlled local AI setup</h1><script>localStorage.setItem("lastbrowser.profiles.v1",JSON.stringify([{id:"setup-browser-a"},{id:"setup-browser-b"}]))</script>');
    protocol.handle('app', () => net.fetch(pathToFileURL(path.join(temp, 'index.html')).href));
    controller = new IndependentController({ userDataDir: app.getPath('userData'), isShell: owner => shell?.webContents === owner,
      apiRequest: (operation, scope, payload, profile) => independentApiRequest(info.apiUrl, operation, scope, payload, profile, nonce), attachSession: () => {} });
    ipcMain.handle('lastbrowser:independent:request', (event, envelope) => independentIpcRequest(controller, event, envelope));
    shell = new BrowserWindow({ show: false, width: 900, height: 600, webPreferences: { preload: path.join(temp, 'preload.cjs'), contextIsolation: true, sandbox: true } });
    await shell.loadURL('app://bundle/index.html');
    const request = async (operation, scope, payload = {}, backendProfileName) => {
      const result = await shell.webContents.executeJavaScript(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1, operation, scope, payload, backendProfileName })})`, true);
      if (!result.ok) throw Object.assign(new Error(result.error.code + ': ' + result.error.message), { code: result.error.code }); return result.value;
    };
    const a = await request('resolveScope', undefined, { workspacePath: info.workspaceA, browserProfileId: 'setup-browser-a' }, 'default');
    const b = await request('resolveScope', undefined, { workspacePath: info.workspaceB, browserProfileId: 'setup-browser-b' }, 'other');
    const setup = (scope, requestPayload) => request('localAi', scope, { action: 'setup', request: requestPayload });
    const stats = async () => (await fetch(info.fixtureOrigin + '/stats')).json();
    const permissionsBefore = await request('permissions', a.scope);
    const first = await setup(a.scope, { operation: 'get' }); assert.equal(first.preferences.revision, 0);
    assert.equal(fs.existsSync(path.join(app.getPath('userData'), 'local-ai')), false);
    await assert.rejects(setup(a.scope, { operation: 'get', cacheRoot: temp }));
    await assert.rejects(setup(a.scope, { operation: 'confirm', planDigest: '0'.repeat(64), licenseDigests: [], clientRequestId: randomUUID() }));
    const selected = await setup(a.scope, { operation: 'select', choice: { decision: 'local', preset: 'lightweight',
      artifactIds: [info.artifactId], expectedRevision: 0, clientRequestId: randomUUID() } }); assert.equal(selected.preferences.revision, 1);
    assert.equal((await setup(b.scope, { operation: 'get' })).preferences.revision, 0);
    const planRequest = { operation: 'plan', expectedRevision: 1, clientRequestId: randomUUID() };
    const planned = await setup(a.scope, planRequest), plan = planned.plan;
    assert.equal(plan.totalBytes, info.totalBytes); assert.equal(plan.executionUnavailable, true);
    const confirmation = { operation: 'confirm', planDigest: plan.planDigest,
      licenseDigests: [...new Set(plan.artifacts.map(artifact => artifact.licenseDigest))], clientRequestId: randomUUID() };
    await assert.rejects(setup(b.scope, confirmation));
    await shell.reload(); await until(() => !shell.webContents.isLoading(), 'shell reload');
    await assert.rejects(setup(a.scope, confirmation));
    const reviewedAgain = await setup(a.scope, planRequest); assert.equal(reviewedAgain.plan.planDigest, plan.planDigest);
    const confirmed = await setup(a.scope, confirmation); assert.equal(confirmed.consent.authority, 'private_human_action');
    assert.deepEqual(await request('permissions', a.scope), permissionsBefore);
    log('actual_review_and_private_consent', { scopeIsolation: true, planDigest: plan.planDigest, manifestBytes: plan.totalBytes,
      reloadRequiresReview: true, separateConfirm: true, executionUnavailable: true, workPermissionsUnchanged: true });
    const startRequest = { operation: 'start', planDigest: plan.planDigest, clientRequestId: randomUUID() };
    const started = await setup(a.scope, startRequest), job = started.job; assert.equal(job.state, 'pending');
    const replay = await setup(a.scope, startRequest); assert.equal(replay.job.jobId, job.jobId);
    await until(async () => { const current = await setup(a.scope, { operation: 'status', jobId: job.jobId });
      return current.job.downloadedBytes >= 262144 && (await stats()).active === 1; }, 'actual partial bytes and blocked read');
    await assert.rejects(setup(a.scope, { ...startRequest, clientRequestId: randomUUID() }));
    await assert.rejects(setup(b.scope, { operation: 'status', jobId: job.jobId }));
    assert.deepEqual((await setup(b.scope, { operation: 'status' })).jobs, []);
    await shell.reload(); await until(() => !shell.webContents.isLoading(), 'reload during background download');
    assert.equal((await setup(a.scope, { operation: 'status', jobId: job.jobId })).job.jobId, job.jobId);
    const cancelled = await setup(a.scope, { operation: 'cancel', jobId: job.jobId, clientRequestId: randomUUID() }); assert.equal(cancelled.job.state, 'stopping');
    const cache = path.join(app.getPath('userData'), 'local-ai', 'cache'), planDirectory = path.join(cache, plan.planDigest), moved = planDirectory + '-controlled-rename';
    assert.equal((await stats()).active, 1);
    assert.throws(() => fs.renameSync(planDirectory, moved), 'Directory remained movable while the actual installer held its FD pins');
    assert.equal((await setup(a.scope, { operation: 'status', jobId: job.jobId })).job.state, 'stopping');
    log('actual_cancel_pending_fd_close', { state: 'stopping', actualIO: 1, directoryPinHeld: true, rendererReloadPreservedJob: true });
    await fetch(info.fixtureOrigin + '/release');
    await until(async () => (await setup(a.scope, { operation: 'status', jobId: job.jobId })).job.state === 'cancelled', 'actual cancelled after FD close');
    assert.equal((await stats()).active, 0); fs.renameSync(planDirectory, moved); fs.renameSync(moved, planDirectory);
    const resumed = await setup(a.scope, { ...startRequest, clientRequestId: randomUUID() }); assert.notEqual(resumed.job.jobId, job.jobId);
    const complete = await until(async () => { const result = await setup(a.scope, { operation: 'status', jobId: resumed.job.jobId }); return result.job.state === 'complete' && result; }, 'resumed actual verified installation');
    assert.equal(complete.job.verifiedBytes, plan.totalBytes); assert.equal(complete.job.executionUnavailable, true);
    for (const artifact of plan.artifacts) for (const file of artifact.files) {
      const destination = path.join(planDirectory, createHash('sha256').update(artifact.artifactId).digest('hex'), file.relativePath);
      const content = fs.readFileSync(destination); assert.equal(content.length, file.bytes); assert.equal(createHash('sha256').update(content).digest('hex'), file.sha256);
    }
    const measured = await stats(); assert(measured.offsets.some(offset => offset > 0)); assert.equal(measured.active, 0); assert.equal(measured.externalAttempts, 0);
    await controller.shutdown(); controller = new IndependentController({ userDataDir: app.getPath('userData'), isShell: owner => shell?.webContents === owner,
      apiRequest: (operation, scope, payload, profile) => independentApiRequest(info.apiUrl, operation, scope, payload, profile, nonce), attachSession: () => {} });
    assert.equal((await setup(a.scope, { operation: 'status', jobId: resumed.job.jobId })).job.state, 'complete');
    await setup(b.scope, { operation: 'select', choice: { decision: 'skip', expectedRevision: 0, clientRequestId: randomUUID() } });
    assert.equal((await setup(b.scope, { operation: 'get' })).preferences.decision, 'skip');
    assert.equal((await setup(a.scope, { operation: 'get' })).preferences.decision, 'local');
    log('actual_verified_resume_and_controller_reload', { verifiedBytes: complete.job.verifiedBytes, actualRangeOffsets: measured.offsets,
      cancelledOnlyAfterFdClose: true, persistedStatus: 'complete', scopeB: 'skip', scopeA: 'local', executionUnavailable: true,
      hostStarted: controller.host !== undefined, visibleWindows: BaseWindow.getAllWindows().filter(window => window.isVisible()).length });
    assert.equal(controller.host, undefined); assert.equal(shell.isVisible(), false);
    await controller.shutdown(); shell.destroy(); clearTimeout(watchdog); assert.equal(BaseWindow.getAllWindows().length, 0);
    log('child:passed', { windows: 0, actualIO: 0 }); app.exit(0);
  } catch (error) {
    log('child:failed', { message: error.message, stack: error.stack });
    try { await controller?.shutdown(); } catch {} try { shell?.destroy(); } catch {}
    clearTimeout(watchdog); app.exit(1);
  }
}
if (process.argv.includes('--electron-child')) child(process.argv.at(-1)); else parent().catch(error => { console.error(error.stack); process.exitCode = 1; });
