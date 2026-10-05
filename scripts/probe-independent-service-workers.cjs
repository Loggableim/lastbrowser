#!/usr/bin/env node
/* Controlled installed-Electron evidence, not an assertion that bypass/CSP isolate pre-existing workers. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function parent() {
  const root = path.resolve(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-independent-service-workers-'));
  const phases = path.join(temp, 'phases.jsonl');
  for (const [entry, output] of [['independent-browser-host.ts', 'host.cjs'], ['session-request-policy.ts', 'policy.cjs'], ['agent-execution-partition.ts', 'partition.cjs']]) {
    require('esbuild').buildSync({ entryPoints: [path.join(root, 'apps/desktop/src/main', entry)],
      outfile: path.join(temp, output), bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'] });
  }
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [__filename, '--electron-child', temp],
    { windowsHide: true, cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stdout.on('data', () => {}); child.stderr.on('data', b => { stderr += b.toString(); });
  const watchdog = setTimeout(() => child.kill(), 45000);
  try {
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    const records = fs.existsSync(phases) ? fs.readFileSync(phases, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
    for (const record of records) process.stdout.write(`${JSON.stringify(record)}\n`);
    assert.equal(result.code, 0, `Controlled SW evidence failed: ${stderr.slice(-3000)}`);
    assert(records.some(record => record.phase === 'measured'));
    assert(records.some(record => record.phase === 'will-quit' && record.windows === 0));
    process.stdout.write(`${JSON.stringify({ phase: 'parent:completed', pid: child.pid, ...result,
      installedPackage: require('electron/package.json').version,
      evidence: 'real local HTTP + pre-existing SW + installed Electron + temporary shared persist Session; no external requests or model inference' })}\n`);
  } finally {
    clearTimeout(watchdog);
    const resolved = path.resolve(temp);
    assert(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert(path.basename(resolved).startsWith('lastbrowser-independent-service-workers-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

async function child(temp) {
  const { app, BaseWindow, WebContentsView, session } = require('electron');
  const { IndependentBrowserHostRegistry, browserActionDigest } = require(path.join(temp, 'host.cjs'));
  const { installSessionRequestPolicy } = require(path.join(temp, 'policy.cjs'));
  const { computeAgentExecutionPartition } = require(path.join(temp, 'partition.cjs'));
  app.setPath('userData', path.join(temp, 'user-data'));
  const log = (phase, data = {}) => fs.appendFileSync(path.join(temp, 'phases.jsonl'),
    `${JSON.stringify({ phase, at: new Date().toISOString(), ...data })}\n`);
  app.on('window-all-closed', () => {});
  app.on('will-quit', () => log('will-quit', { windows: BaseWindow.getAllWindows().length }));
  const watchdog = setTimeout(() => { log('watchdog'); app.exit(72); }, 38000);
  const sockets = new Set(); const requests = []; const counts = { userBefore: 0, userAfter: 0, controller: 0, registration: 0, direct: 0, sandbox: 0 };
  const accountEvidence = { sandboxNavigation: false, sandboxDefaultFetch: null };
  const scopedMutations = { allowed: 0, denied: 0, oldRun: 0, newRun: 0, idle: 0, sharedAllowed: 0, sharedOldRun: 0 };
  const servers = []; let registry, userHost, userView;
  try {
    await app.whenReady(); log('ready', { electron: process.versions.electron, chromium: process.versions.chrome });
    const listen = async handler => {
      const server = http.createServer(handler); servers.push(server);
      server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      return `http://127.0.0.1:${server.address().port}`;
    };
    const deniedOrigin = await listen((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/mutation' && Object.hasOwn(counts, url.searchParams.get('source'))) counts[url.searchParams.get('source')]++;
      if (url.pathname === '/mutation' && url.searchParams.get('source') === 'scopedDenied') scopedMutations.denied++;
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }); res.end('controlled mutation');
    });
    const origin = await listen((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/mutation' && ['allowed', 'oldRun', 'newRun', 'idle', 'sharedAllowed', 'sharedOldRun'].includes(url.searchParams.get('source'))) {
        scopedMutations[url.searchParams.get('source')]++; res.end('controlled scoped mutation'); return;
      }
      if (url.pathname === '/scoped-shared.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
        res.end(`onconnect=e=>{const port=e.ports[0];port.onmessage=async event=>{
          if(event.data.delay){port.postMessage('scheduled');await new Promise(r=>setTimeout(r,event.data.delay));}
          try {await fetch(self.location.origin+'/mutation?source='+encodeURIComponent(event.data.source));if(!event.data.delay)port.postMessage('sent')}
          catch {if(!event.data.delay)port.postMessage('failed')}
        };port.start();};`); return;
      }
      if (url.pathname === '/scoped-sw.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
        res.end(`self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
          self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
          self.addEventListener('message',e=>e.waitUntil((async()=>{
            if(e.data.delay){e.ports[0].postMessage('scheduled');await new Promise(r=>setTimeout(r,e.data.delay));}
            try { await fetch((e.data.denied?${JSON.stringify(deniedOrigin)}:self.location.origin)+'/mutation?source='+encodeURIComponent(e.data.source));
              if(!e.data.delay)e.ports[0].postMessage('sent'); }
            catch { if(!e.data.delay)e.ports[0].postMessage('failed'); }
          })()));`); return;
      }
      if (url.pathname === '/sw.js' || url.pathname === '/new-sw.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
        res.end(`self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
          self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
          self.addEventListener('message',e=>e.waitUntil((async()=>{
            try { await fetch(${JSON.stringify(deniedOrigin)}+'/mutation?source='+encodeURIComponent(e.data.source));e.ports[0].postMessage('sent'); }
            catch { e.ports[0].postMessage('failed'); }
          })()));`); return;
      }
      if (url.pathname === '/new-worker.js') { res.writeHead(200, { 'Content-Type': 'application/javascript' }); res.end('postMessage("created")'); return; }
      if (url.pathname === '/sandbox-agent-page') accountEvidence.sandboxNavigation = /controlled_account=present/.test(req.headers.cookie ?? '');
      if (url.pathname === '/account-check') {
        accountEvidence.sandboxDefaultFetch = /controlled_account=present/.test(req.headers.cookie ?? '');
        res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('controlled account check'); return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src *", 'Cache-Control': 'no-store' });
      res.end('<!doctype html><title>Controlled service worker boundary</title><h1>Controlled page</h1>');
    });
    const targetSession = session.fromPartition('persist:controlled-shared-sw');
    await targetSession.cookies.set({ url: origin, name: 'controlled_account', value: 'present' });
    installSessionRequestPolicy(targetSession, details => {
      const owned = Boolean(registry?.ownsWebContents(details.webContentsId));
      const parsed = new URL(details.url);
      const local = ['http:', 'data:'].includes(parsed.protocol) && (parsed.protocol === 'data:' || parsed.hostname === '127.0.0.1');
      if (parsed.origin === deniedOrigin) requests.push({ webContentsId: details.webContentsId ?? null, resourceType: details.resourceType, owned });
      return { owned: owned || !local, allowed: local && (!owned || registry.allowsRequest(details.webContentsId, details.url)) };
    });
    // Candidate only: preserve the server CSP, append a separate enforcing worker-src policy solely for IA responses.
    targetSession.webRequest.onHeadersReceived((details, callback) => {
      if (!registry?.ownsWebContents(details.webContentsId)) { callback({}); return; }
      const headers = { ...details.responseHeaders };
      const name = Object.keys(headers).find(key => key.toLowerCase() === 'content-security-policy') ?? 'Content-Security-Policy';
      headers[name] = [...(headers[name] ?? []), "worker-src 'none'"];
      if (new URL(details.url).pathname === '/sandbox-agent-page') headers[name].push('sandbox allow-scripts allow-forms');
      callback({ responseHeaders: headers });
    });
    userHost = new BaseWindow({ show: false });
    userView = new WebContentsView({ webPreferences: { session: targetSession, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    userHost.contentView.addChildView(userView); userView.setBounds({ x: 0, y: 0, width: 640, height: 480 });
    const user = userView.webContents;
    await user.loadURL(`${origin}/user-page`);
    const installed = await user.executeJavaScript(`(async()=>{
      await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
      for(let n=0;n<100&&!navigator.serviceWorker.controller;n++)await new Promise(r=>setTimeout(r,20));
      return {controller:!!navigator.serviceWorker.controller,registration:!!(await navigator.serviceWorker.getRegistration()).active};
    })()`);
    assert(installed.controller && installed.registration);
    const message = (wc, source, throughRegistration) => wc.executeJavaScript(`(async()=>{
      const worker=${throughRegistration ? '(await navigator.serviceWorker.getRegistration()).active' : 'navigator.serviceWorker.controller'};
      if(!worker)return 'missing';
      return await new Promise(resolve=>{const channel=new MessageChannel();
        const timer=setTimeout(()=>resolve('timeout'),3000);channel.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data)};
        worker.postMessage({source:${JSON.stringify(source)}},[channel.port2]);});
    })()`);
    assert.equal(await message(user, 'userBefore', false), 'sent'); assert.equal(counts.userBefore, 1);
    log('normal-user-sw-before', { ...installed, mutationCount: counts.userBefore, requests: [...requests] }); requests.length = 0;
    registry = new IndependentBrowserHostRegistry({ validateTicket: () => {}, resolvePartition: () => 'persist:controlled-shared-sw', actionTimeoutMs: 5000, cleanupTimeoutMs: 1500 });
    await registry.createLease({ leaseId: 'controlled-sw-lease', runId: 'controlled-sw-run',
      scope: { spaceId: 'controlled-space', backendProfileId: 'controlled-backend', browserProfileId: 'controlled-browser' },
      partitionKey: 'persist:controlled-shared-sw', runnerGeneration: 'controlled-generation', permissionEpoch: 1,
      allowedOrigins: [origin], expiresAt: Date.now() + 30000 });
    const agent = registry.leases.get('controlled-sw-lease').view.webContents;
    log('agent-created');
    // A new WCV needs an inert renderer before renderer-bound CDP domains can answer.
    await agent.loadURL('about:blank'); log('inert-renderer-created');
    await agent.debugger.sendCommand('Network.setBypassServiceWorker', { bypass: true });
    log('bypass-set');
    const action = { kind: 'navigate', url: `${origin}/agent-page`, effect: 'read' };
    const lease = registry.snapshot('controlled-sw-lease');
    await registry.execute({ permitId: 'controlled-permit', leaseId: lease.leaseId, runId: lease.runId, scope: lease.scope,
      targetId: lease.targetId, mainGeneration: lease.mainGeneration, runnerGeneration: lease.runnerGeneration,
      navigationEpoch: lease.navigationEpoch, permissionEpoch: lease.permissionEpoch,
      actionDigest: browserActionDigest(action), expiresAt: Date.now() + 10000, allowMutation: false }, action);
    log('agent-navigated');
    const available = await agent.executeJavaScript(`(async()=>({controller:!!navigator.serviceWorker.controller,
      registration:!!(await navigator.serviceWorker.getRegistration())?.active,registrations:(await navigator.serviceWorker.getRegistrations()).length}))()`);
    const direct = await agent.executeJavaScript(`fetch(${JSON.stringify(deniedOrigin + '/mutation?source=direct')}).then(()=>true,()=>false)`);
    assert.equal(direct, false); assert.equal(counts.direct, 0);
    const registerBlocked = await agent.executeJavaScript(`navigator.serviceWorker.register('/new-sw.js').then(()=>false,()=>true)`);
    const workerBlocked = await agent.executeJavaScript(`(()=>{try{new Worker('/new-worker.js');return false}catch{return true}})()`);
    const controllerResult = await message(agent, 'controller', false);
    const registrationResult = await message(agent, 'registration', true);
    await wait(100);
    log('candidate-evidence', { bypassAppliedBeforeFirstNavigation: true, existingCspPreserved: true, ownedWorkerSrcNone: true,
      agentWebContentsId: agent.id, available, directDenied: !direct, registerBlocked, workerBlocked,
      controllerResult, registrationResult, mutations: { controller: counts.controller, registration: counts.registration }, requests: [...requests] });
    assert(registerBlocked && workerBlocked); requests.length = 0;
    assert.equal(await message(user, 'userAfter', false), 'sent'); assert.equal(counts.userAfter, 1);
    log('normal-user-sw-after', { mutationCount: counts.userAfter, controllerStillPresent: await user.executeJavaScript('!!navigator.serviceWorker.controller'), requests: [...requests] });
    const candidatePreventsPreExistingWorkerMutation = counts.controller + counts.registration === 0;
    log('measured', { candidatePreventsPreExistingWorkerMutation,
      conclusion: candidatePreventsPreExistingWorkerMutation ? 'No controlled pre-existing worker mutation observed; not a universal isolation proof' : 'Bypass plus owned worker-src CSP leaves a pre-existing worker messaging route to unattributed network requests',
      deniedDirectMutationCount: counts.direct, userWorkerPreserved: counts.userBefore === 1 && counts.userAfter === 1 });
    await registry.cancel('controlled-sw-lease');
    await registry.createLease({ leaseId: 'controlled-sandbox-lease', runId: 'controlled-sandbox-run',
      scope: { spaceId: 'controlled-space', backendProfileId: 'controlled-backend', browserProfileId: 'controlled-browser' },
      partitionKey: 'persist:controlled-shared-sw', runnerGeneration: 'controlled-generation', permissionEpoch: 1,
      allowedOrigins: [origin], expiresAt: Date.now() + 15000 });
    const sandbox = registry.leases.get('controlled-sandbox-lease').view.webContents;
    await sandbox.loadURL('about:blank'); await sandbox.debugger.sendCommand('Network.setBypassServiceWorker', { bypass: true });
    const sandboxAction = { kind: 'navigate', url: `${origin}/sandbox-agent-page`, effect: 'read' };
    const sandboxLease = registry.snapshot('controlled-sandbox-lease');
    await registry.execute({ permitId: 'controlled-sandbox-permit', leaseId: sandboxLease.leaseId, runId: sandboxLease.runId, scope: sandboxLease.scope,
      targetId: sandboxLease.targetId, mainGeneration: sandboxLease.mainGeneration, runnerGeneration: sandboxLease.runnerGeneration,
      navigationEpoch: sandboxLease.navigationEpoch, permissionEpoch: sandboxLease.permissionEpoch,
      actionDigest: browserActionDigest(sandboxAction), expiresAt: Date.now() + 10000, allowMutation: false }, sandboxAction);
    const sandboxEvidence = await sandbox.executeJavaScript(`(async()=>{
      const result={securityOrigin:self.origin,domReadable:!!document.querySelector('h1'),serviceWorkerAccess:'unknown',localStorageAccess:'unknown',defaultFetch:'unknown'};
      try{const worker=navigator.serviceWorker.controller||(await navigator.serviceWorker.getRegistration())?.active;
        result.serviceWorkerAccess=worker?'available':'missing';if(worker)worker.postMessage({source:'sandbox'},[new MessageChannel().port2]);}
      catch(error){result.serviceWorkerAccess=error.name;}
      try{localStorage.getItem('controlled');result.localStorageAccess='available'}catch(error){result.localStorageAccess=error.name;}
      try{await fetch('/account-check');result.defaultFetch='success'}catch(error){result.defaultFetch=error.name;}
      return result;
    })()`);
    await wait(100);
    assert.equal(sandboxEvidence.serviceWorkerAccess, 'SecurityError'); assert.equal(counts.sandbox, 0);
    assert.equal(await message(user, 'userAfter', false), 'sent'); assert.equal(counts.userAfter, 2);
    log('opaque-origin-alternative', { ownedSandboxWithoutAllowSameOrigin: true, evidence: sandboxEvidence,
      serviceWorkerMutationCount: counts.sandbox, accountEvidence, normalUserWorkerStillWorks: true,
      conclusion: 'Native opaque origin denies existing SW access, but breaks same-origin storage/default authenticated fetch; reduced mode only, not equivalent browser/account compatibility' });
    await registry.closeAll('probe_completed'); assert.equal(registry.size, 0);
    const executionScope = { spaceId: 'execution-space', backendProfileId: 'execution-backend', browserProfileId: 'execution-browser' };
    const executionPartition = computeAgentExecutionPartition(executionScope);
    const executionSession = session.fromPartition(executionPartition);
    assert.equal((await executionSession.cookies.get({ name: 'controlled_account' })).length, 0, 'User cookies must never silently enter execution storage');
    // Explicit controlled account fixture, not an assertion that the UI login/setup flow is complete.
    await executionSession.cookies.set({ url: origin, name: 'controlled_agent_account', value: 'explicit-fixture' });
    let liveGeneration = 'execution-generation-one';
    const executionRequests = [];
    registry = new IndependentBrowserHostRegistry({ validateTicket: () => {}, resolvePartition: () => executionPartition,
      isRunnerGenerationLive: generation => generation === liveGeneration, cleanupTimeoutMs: 2500,
      attachSession: target => installSessionRequestPolicy(target, details => {
        const parsed = new URL(details.url);
        const allowed = registry.allowsSessionRequest(target, details.url) && parsed.hostname === '127.0.0.1';
        if (parsed.pathname === '/mutation') executionRequests.push({ webContentsId: details.webContentsId ?? null,
          source: parsed.searchParams.get('source'), allowed });
        return { owned: true, allowed };
      }) });
    const createExecution = async (leaseId, runId) => {
      await registry.createLease({ leaseId, runId, scope: executionScope, partitionKey: executionPartition,
        runnerGeneration: liveGeneration, permissionEpoch: 1, allowedOrigins: [origin], expiresAt: Date.now() + 20000 });
      const current = registry.snapshot(leaseId), action = { kind: 'navigate', url: `${origin}/execution-page`, effect: 'read' };
      await registry.execute({ permitId: `permit-${leaseId}`, leaseId, runId, scope: executionScope,
        targetId: current.targetId, mainGeneration: current.mainGeneration, runnerGeneration: current.runnerGeneration,
        navigationEpoch: current.navigationEpoch, permissionEpoch: current.permissionEpoch,
        actionDigest: browserActionDigest(action), expiresAt: Date.now() + 10000, allowMutation: false }, action);
      return registry.leases.get(leaseId).view.webContents;
    };
    const execution = await createExecution('execution-lease-one', 'execution-run-one');
    assert.equal(registry.snapshot('execution-lease-one').partitionKind, 'dedicated_agent');
    await execution.executeJavaScript(`(async()=>{
      await navigator.serviceWorker.register('/scoped-sw.js');await navigator.serviceWorker.ready;
      for(let n=0;n<100&&!navigator.serviceWorker.controller;n++)await new Promise(r=>setTimeout(r,20));
      if(!navigator.serviceWorker.controller)throw Error('Controlled execution worker did not claim');
    })()`);
    const scopedMessage = (wc, source, denied = false, delay = 0) => wc.executeJavaScript(`(async()=>{
      const worker=navigator.serviceWorker.controller||(await navigator.serviceWorker.getRegistration())?.active;
      return await new Promise(resolve=>{const channel=new MessageChannel();const timer=setTimeout(()=>resolve('timeout'),3000);
        channel.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data)};worker.postMessage(${JSON.stringify({ source, denied, delay })},[channel.port2]);});
    })()`);
    assert.equal(await scopedMessage(execution, 'allowed'), 'sent'); assert.equal(scopedMutations.allowed, 1);
    assert.equal(await scopedMessage(execution, 'scopedDenied', true), 'failed'); assert.equal(scopedMutations.denied, 0);
    const sharedMessage = (wc, source, delay = 0) => wc.executeJavaScript(`(async()=>{
      window.controlledShared ||= new SharedWorker('/scoped-shared.js',{name:'controlled-shared',extendedLifetime:true});
      const port=window.controlledShared.port;port.start();
      return await new Promise(resolve=>{const timer=setTimeout(()=>resolve('timeout'),3000);port.onmessage=e=>{clearTimeout(timer);resolve(e.data)};
        port.postMessage(${JSON.stringify({ source, delay })});});
    })()`);
    assert.equal(await sharedMessage(execution, 'sharedAllowed'), 'sent'); assert.equal(scopedMutations.sharedAllowed, 1);
    assert.equal(await sharedMessage(execution, 'sharedOldRun', 1200), 'scheduled');
    log('shared-worker-before-revoke', { actualOwnedSharedWorkers: execution.getAllSharedWorkers().length });
    assert.equal(await scopedMessage(execution, 'oldRun', false, 1200), 'scheduled');
    assert.equal(await scopedMessage(execution, 'idle', false, 1200), 'scheduled');
    await registry.cancel('execution-lease-one');
    assert.equal(registry.allowsSessionRequest(executionSession, `${origin}/mutation?source=idle`), false);
    assert.equal(Object.keys(executionSession.serviceWorkers.getAllRunning()).length, 0);
    liveGeneration = 'execution-generation-two';
    const fresh = await createExecution('execution-lease-two', 'execution-run-two');
    const retained = await fresh.executeJavaScript('(async()=>({controller:!!navigator.serviceWorker.controller,registrations:(await navigator.serviceWorker.getRegistrations()).length}))()');
    assert.equal(retained.controller, false); assert.equal(retained.registrations, 0);
    await wait(1400); assert.equal(scopedMutations.oldRun, 0); assert.equal(scopedMutations.idle, 0);
    assert.equal(scopedMutations.sharedOldRun, 0, 'An old SharedWorker must never gain the new Run lease');
    await fresh.executeJavaScript(`(async()=>{await navigator.serviceWorker.register('/scoped-sw.js');await navigator.serviceWorker.ready;
      for(let n=0;n<100&&!navigator.serviceWorker.controller;n++)await new Promise(r=>setTimeout(r,20));})()`);
    assert.equal(await scopedMessage(fresh, 'newRun'), 'sent'); assert.equal(scopedMutations.newRun, 1);
    assert.equal(await scopedMessage(fresh, 'scopedDenied', true), 'failed'); assert.equal(scopedMutations.denied, 0);
    liveGeneration = 'disconnected-generation';
    assert.equal(await scopedMessage(fresh, 'idle'), 'failed'); assert.equal(scopedMutations.idle, 0);
    await registry.closeAll('execution_probe_completed');
    assert.equal(await message(user, 'userAfter', false), 'sent'); assert.equal(counts.userAfter, 3);
    assert.equal((await executionSession.cookies.get({ name: 'controlled_agent_account' }))[0]?.value, 'explicit-fixture');
    assert.equal((await targetSession.cookies.get({ name: 'controlled_account' }))[0]?.value, 'present');
    log('execution-partition-isolation', { scopedMutations, executionRequests,
      userPartitionUnchanged: true, userServiceWorkerStillWorks: true, noAutomaticCookieCopy: true,
      explicitAgentCookiePreserved: true, oldRegistrationsAbsentBeforeNewRun: retained,
      oldDelayedWorkerCannotGainNewRunAuthority: scopedMutations.oldRun === 0, idleGateClosed: true, generationLossGateClosed: true });
    user.close(); userHost.destroy();
    for (const socket of sockets) socket.destroy();
    for (const server of servers) await new Promise(resolve => server.close(resolve));
    log('cleanup', { agentTargets: registry.size, windows: BaseWindow.getAllWindows().length });
    clearTimeout(watchdog); app.quit();
  } catch (error) {
    log('failed', { message: error.message, stack: error.stack });
    if (registry) await registry.closeAll('probe_failed').catch(() => {});
    if (userView && !userView.webContents.isDestroyed()) userView.webContents.close();
    if (userHost && !userHost.isDestroyed()) userHost.destroy();
    for (const socket of sockets) socket.destroy(); for (const server of servers) server.close();
    clearTimeout(watchdog); app.exit(1);
  }
}

if (process.argv.includes('--electron-child')) child(process.argv[process.argv.indexOf('--electron-child') + 1]);
else parent().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
