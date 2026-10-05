#!/usr/bin/env node
/* Real installed Castlabs probe. Only its own child/processes, temp profile and local HTTP server are used. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function observed(condition, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition()) && Date.now() < deadline) await wait(25);
  return await condition();
}
async function parent() {
  const root = path.resolve(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-independent-browser-'));
  const phases = path.join(temp, 'phases.jsonl');
  const bundled = path.join(temp, 'browser-host.cjs');
  require('esbuild').buildSync({ entryPoints: [path.join(root, 'apps/desktop/src/main/independent-browser-host.ts')],
    outfile: bundled, bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'] });
  require('esbuild').buildSync({ entryPoints: [path.join(root, 'apps/desktop/src/main/session-request-policy.ts')],
    outfile: path.join(temp, 'request-policy.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'] });
  const executable = require('electron');
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const runs = [];
  try {
    for (const mode of ['exercise', 'reopen']) {
      const started = Date.now();
      const child = spawn(executable, [__filename, '--electron-child', temp, mode], {
        windowsHide: true, cwd: root, env, stdio: ['ignore', 'pipe', 'pipe']
      });
      let stderr = '';
      child.stdout.on('data', () => {}); child.stderr.on('data', b => { stderr += b.toString(); });
      const timeout = setTimeout(() => { child.kill(); }, 45000);
      const exit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
      clearTimeout(timeout);
      runs.push({ mode, pid: child.pid, elapsedMs: Date.now() - started, ...exit });
      if (exit.code !== 0 && fs.existsSync(phases)) process.stderr.write(fs.readFileSync(phases, 'utf8'));
      assert.equal(exit.code, 0, `${mode} child failed: ${stderr.slice(-4000)}`);
      const records = fs.readFileSync(phases, 'utf8').trim().split('\n').map(x => JSON.parse(x));
      assert(records.some(r => r.phase === `${mode}:will-quit`), `Missing explicit will-quit for ${mode}`);
      assert(records.some(r => r.phase === `${mode}:passed`), `Missing measured pass for ${mode}`);
    }
    const records = fs.readFileSync(phases, 'utf8').trim().split('\n').map(x => JSON.parse(x));
    records.forEach(r => process.stdout.write(`${JSON.stringify(r)}\n`));
    process.stdout.write(`${JSON.stringify({ phase: 'parent:passed', installedPackage: require('electron/package.json').version,
      runs, evidence: 'real local HTTP + installed Electron + temp userData; no provider inference or full application acceptance' })}\n`);
  } finally {
    const resolved = path.resolve(temp);
    assert(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert(path.basename(resolved).startsWith('lastbrowser-independent-browser-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

async function electronChild(temp, mode) {
  const { app, BrowserWindow, BaseWindow, session, webContents, desktopCapturer } = require('electron');
  const { IndependentBrowserHostRegistry, browserActionDigest } = require(path.join(temp, 'browser-host.cjs'));
  const { installSessionRequestPolicy } = require(path.join(temp, 'request-policy.cjs'));
  app.setPath('userData', path.join(temp, 'user-data'));
  const log = (phase, values = {}) => fs.appendFileSync(path.join(temp, 'phases.jsonl'),
    `${JSON.stringify({ phase: `${mode}:${phase}`, at: new Date().toISOString(), ...values })}\n`);
  app.on('window-all-closed', () => log('window-all-closed'));
  app.on('before-quit', () => log('before-quit'));
  app.on('will-quit', () => log('will-quit', { windows: BaseWindow.getAllWindows().length }));
  const watchdog = setTimeout(() => { log('watchdog'); app.exit(72); }, 38000);
  let registry, shell, server;
  const scopeA = { spaceId: 'probe-space-a', backendProfileId: 'probe-backend-a', browserProfileId: 'probe-browser-a' };
  const scopeB = { spaceId: 'probe-space-b', backendProfileId: 'probe-backend-b', browserProfileId: 'probe-browser-b' };
  const partitionA = 'persist:independent-probe-a', partitionB = 'persist:independent-probe-b';
  const counts = { A: { tick: 0, mutate: 0 }, B: { tick: 0, mutate: 0 }, downloads: 0 };
  const probes = { ua: null, headers: null, blockedSeen: 0, foreignSeen: 0 };
  const sockets = new Set();
  try {
    await app.whenReady(); log('ready', { electron: process.versions.electron });
    if (mode === 'reopen') {
      const cookies = await session.fromPartition(partitionA).cookies.get({ name: 'probe_account' });
      assert.equal(cookies[0]?.value, 'A');
      assert.equal((await session.fromPartition(partitionB).cookies.get({ name: 'probe_account' }))[0]?.value, 'B');
      log('passed', { persistedAccountCookies: true }); clearTimeout(watchdog); app.quit(); return;
    }
    server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const account = /probe_account=([AB])/.exec(req.headers.cookie || '')?.[1];
      if (url.pathname === '/headers') {
        probes.ua = req.headers['user-agent'];
        res.writeHead(200, { 'Content-Type': 'application/json', 'X-Test-UA-Handler': 'preserved', 'X-Test-Adblock-Handler': 'input' }); res.end('{"local":true}'); return;
      }
      if (url.pathname === '/blocked') { probes.blockedSeen++; res.end('unexpected'); return; }
      if (url.pathname === '/tick' || url.pathname === '/mutate') {
        if (!account) { res.writeHead(401); res.end('missing account'); return; }
        counts[account][url.pathname === '/tick' ? 'tick' : 'mutate']++; res.end('ok'); return;
      }
      if (url.pathname === '/slow') { setTimeout(() => { if (!res.destroyed) { res.end('<h1>delayed local page</h1>'); } }, 1800); return; }
      if (url.pathname === '/redirect') { res.writeHead(302, { Location: 'https://scope-not-allowed.invalid/' }); res.end(); return; }
      if (url.pathname === '/download') {
        counts.downloads++; res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="probe.txt"' });
        res.end('local controlled download'); return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!doctype html><title>Controlled account ${account || 'none'}</title><h1>Account ${account || 'none'}</h1>
        <input id="text"><button id="mutate" onclick="fetch('/mutate')">controlled action</button>
        <button id="popup" onclick="window.open('/page')">popup</button>
        <button id="dialog" onclick="alert('controlled test');document.getElementById('dialog').textContent='dialog returned'">dialog</button>
        <a id="download" href="/download">download</a><div id="ticks">0</div>
        <script>let t=0;setInterval(()=>{document.getElementById('ticks').textContent=++t;fetch('/tick')},100)</script>`);
    });
    server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const attachSession = target => {
      installSessionRequestPolicy(target, details => ({ owned: Boolean(registry?.ownsWebContents(details.webContentsId)),
        allowed: !registry?.ownsWebContents(details.webContentsId) || registry.allowsRequest(details.webContentsId, details.url) }));
      target.webRequest.onBeforeSendHeaders((details, callback) => callback({ requestHeaders: { ...details.requestHeaders, 'User-Agent': 'Controlled probe UA' } }));
      target.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: { ...details.responseHeaders, 'X-Test-UA-Handler': ['preserved'] } }));
      // Real pinned Ghostery API installs its own listeners; the multiplexer must retain prior callbacks.
      const { ElectronBlocker } = require('@ghostery/adblocker-electron');
      const blocker = ElectronBlocker.parse(`${origin}/blocked`, { loadCosmeticFilters: false, loadNetworkFilters: true });
      const original = blocker.onHeadersReceived;
      blocker.onHeadersReceived = (details, callback) => original(details, response => callback({ ...response,
        responseHeaders: { ...(response.responseHeaders || details.responseHeaders), 'X-Test-Adblock-Handler': ['preserved'] } }));
      blocker.enableBlockingInSession(target);
      target.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      target.setPermissionCheckHandler(() => false);
    };
    await session.fromPartition(partitionA).cookies.set({ url: 'http://127.0.0.1', name: 'probe_account', value: 'A', expirationDate: Date.now() / 1000 + 3600 });
    await session.fromPartition(partitionB).cookies.set({ url: 'http://127.0.0.1', name: 'probe_account', value: 'B', expirationDate: Date.now() / 1000 + 3600 });
    registry = new IndependentBrowserHostRegistry({
      validateTicket: () => {}, resolvePartition: s => s.spaceId === scopeA.spaceId ? partitionA : partitionB,
      attachSession,
      actionTimeoutMs: 5000, cleanupTimeoutMs: 1500,
      onEvent: e => log(`event:${e.kind}`, { leaseId: e.lease.leaseId, state: e.lease.state,
        navigationEpoch: e.lease.navigationEpoch, reason: e.reason })
    });
    shell = new BrowserWindow({ show: false, width: 640, height: 480, webPreferences: { sandbox: true, contextIsolation: true } });
    await shell.loadURL('data:text/html,<title>Controlled Lastbrowser shell</title>');
    let permitSeq = 0;
    const ticket = (name, s) => ({ leaseId: `probe-lease-${name}`, runId: `probe-run-${name}`, scope: s,
      partitionKey: s === scopeA ? partitionA : partitionB, runnerGeneration: 'probe-generation', permissionEpoch: 1,
      allowedOrigins: [origin], expiresAt: Date.now() + 60000 });
    await registry.createLease(ticket('a', scopeA)); await registry.createLease(ticket('b', scopeB));
    const permit = (id, action) => { const l = registry.snapshot(id); return { permitId: `permit-${++permitSeq}`,
      leaseId: id, runId: l.runId, scope: l.scope, targetId: l.targetId, mainGeneration: l.mainGeneration,
      runnerGeneration: l.runnerGeneration, navigationEpoch: l.navigationEpoch, permissionEpoch: l.permissionEpoch,
      actionDigest: browserActionDigest(action), expiresAt: Date.now() + 10000, allowMutation: true }; };
    const execute = (id, action) => registry.execute(permit(id, action), action);
    await execute('probe-lease-a', { kind: 'navigate', url: `${origin}/page`, effect: 'read' });
    await execute('probe-lease-b', { kind: 'navigate', url: `${origin}/page`, effect: 'read' });
    probes.headers = await ownedPageFetch(registry, 'probe-lease-a', `${origin}/headers`);
    assert.equal(probes.ua, 'Controlled probe UA');
    assert.equal(probes.headers['x-test-ua-handler'], 'preserved'); assert.equal(probes.headers['x-test-adblock-handler'], 'preserved');
    let blocked = false;
    try { await ownedPageFetch(registry, 'probe-lease-a', `${origin}/blocked`); } catch { blocked = true; }
    assert(blocked); assert.equal(probes.blockedSeen, 0);
    log('request-multiplexer', { uaPreserved: true, uaHeadersPreserved: true, realGhosteryHeadersPreserved: true, adblockRequestDenied: true });
    assert.equal((await session.fromPartition(partitionA).cookies.get({ name: 'probe_account' }))[0].value, 'A');
    assert.equal((await session.fromPartition(partitionB).cookies.get({ name: 'probe_account' }))[0].value, 'B');
    const a = registry.leases.get('probe-lease-a'), b = registry.leases.get('probe-lease-b');
    const ownedWc = a.view.webContents, ownedId = ownedWc.id;
    let debuggerDetached = false;
    ownedWc.debugger.once('detach', () => { debuggerDetached = true; });
    await execute('probe-lease-a', { kind: 'click', selector: '#mutate', effect: 'write' });
    const initiallyHiddenClick = await observed(() => counts.A.mutate === 1);
    log('never-shown-action-ack', { initiallyHiddenClick, actionA: counts.A.mutate, visible: a.host.isVisible() });
    assert.equal(counts.A.mutate, 1, 'A never-shown host must deliver its authorized click');
    counts.A.mutate = 0;
    const before = counts.A.tick;
    a.host.showInactive(); a.host.minimize(); shell.showInactive(); shell.minimize();
    await wait(1500);
    assert(a.host.isMinimized()); assert(counts.A.tick >= before + 8);
    const actionStarted = Date.now();
    await execute('probe-lease-a', { kind: 'click', selector: '#mutate', effect: 'write' });
    const actionObserved = await observed(() => counts.A.mutate === 1);
    log('minimized-action-ack', { actionObserved, ackElapsedMs: Date.now() - actionStarted, actionA: counts.A.mutate, actionB: counts.B.mutate,
      timerStillRunning: counts.A.tick > before, minimized: a.host.isMinimized(), hostVisible: a.host.isVisible() });
    assert.equal(counts.A.mutate, 1); assert.equal(counts.B.mutate, 0);
    log('minimized', { before, after: counts.A.tick, actionA: counts.A.mutate, actionB: counts.B.mutate });
    a.host.hide(); shell.hide();
    for (let i = 0; i < 5; i++) {
      const loaded = new Promise(resolve => shell.webContents.once('did-finish-load', resolve)); shell.reload(); await loaded;
      assert(!ownedWc.isDestroyed()); assert.equal(registry.snapshot('probe-lease-a').webContentsId, ownedId);
    }
    for (let i = 0; i < 10; i++) {
      await shell.webContents.executeJavaScript(`document.title = ${JSON.stringify(i % 2 ? 'Space B' : 'Space A')}`);
      await execute('probe-lease-a', { kind: 'read', effect: 'read', maxChars: 500 });
      assert.equal(registry.snapshot('probe-lease-b').url, `${origin}/page`);
    }
    log('reload-and-switch', { shellReloads: 5, spaceSwitches: 10, targetUnchanged: ownedId === ownedWc.id,
      actionA: counts.A.mutate, actionB: counts.B.mutate });
    const slowAction = { kind: 'navigate', url: `${origin}/slow`, effect: 'read' };
    const pending = execute('probe-lease-a', slowAction).then(() => 'completed', e => e.code || 'interrupted');
    await wait(100);
    const takeover = registry.takeover('probe-lease-a');
    assert.equal(registry.snapshot('probe-lease-a').state, 'pausing'); assert(!a.host.isVisible());
    const late = { kind: 'read', effect: 'read' };
    assert.throws(() => execute('probe-lease-a', late), /gate is closed/);
    const taken = await takeover; assert.equal(taken.state, 'paused'); assert(a.host.isVisible());
    // Observe the actual native window surface, not just WCV.capturePage.
    // Only this owned window's thumbnail is examined; others are discarded.
    assert.notEqual(ownedWc.getType(), 'offscreen');
    await ownedWc.executeJavaScript("document.body.style.backgroundColor='rgb(13,117,231)';document.body.style.height='100vh'");
    const nativeSurface = await observed(async () => {
      const source = (await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 640, height: 480 } }))
        .find(item => item.id === a.host.getMediaSourceId());
      if (!source || source.thumbnail.isEmpty()) return false;
      const { width, height } = source.thumbnail.getSize(), pixels = source.thumbnail.toBitmap();
      const offset = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
      return Math.abs(pixels[offset] - 231) < 3 && Math.abs(pixels[offset + 1] - 117) < 3 && Math.abs(pixels[offset + 2] - 13) < 3;
    });
    assert(nativeSurface, 'The same native takeover target must actually be visible');
    const pendingOutcome = await pending; assert.equal(pendingOutcome, 'action_interrupted');
    // Manual user input is represented by direct page navigation only after acknowledged safe pause.
    await ownedWc.loadURL(`${origin}/page`);
    await ownedWc.capturePage(); ownedWc.focus();
    assert(ownedWc.isFocused());
    await ownedWc.executeJavaScript("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    await ownedWc.executeJavaScript("window.probeManualClicks=0;document.addEventListener('click',()=>window.probeManualClicks++,true)");
    const button = await ownedWc.executeJavaScript("(()=>{const r=document.querySelector('#mutate').getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
    ownedWc.sendInputEvent({ type: 'mouseMove', ...button });
    ownedWc.sendInputEvent({ type: 'mouseDown', ...button, button: 'left', clickCount: 1 });
    ownedWc.sendInputEvent({ type: 'mouseUp', ...button, button: 'left', clickCount: 1 });
    const manualDelivered = await observed(() => counts.A.mutate === 2);
    log('native-takeover-input-ack', { manualDelivered, actionA: counts.A.mutate, visible: a.host.isVisible(), state: registry.snapshot('probe-lease-a').state,
      url: ownedWc.getURL(), button });
    log('native-input-document-evidence', { clicks: await ownedWc.executeJavaScript('window.probeManualClicks'), requestAllowed: registry.allowsRequest(ownedId, `${origin}/mutate`) });
    assert(manualDelivered);
    log('native-takeover-surface-and-input', { sameWebContents: registry.snapshot('probe-lease-a').webContentsId === ownedId,
      nativeSurface, manualInputDelivered: true, actionA: counts.A.mutate, actionB: counts.B.mutate });
    const manual = registry.snapshot('probe-lease-a');
    assert.throws(() => registry.resume('probe-lease-a', taken.navigationEpoch, manual.permissionEpoch), /changed/);
    registry.resume('probe-lease-a', manual.navigationEpoch, manual.permissionEpoch); assert(!a.host.isVisible());
    await ownedWc.executeJavaScript("document.getElementById('text').value = 'old-input'");
    await execute('probe-lease-a', { kind: 'type', selector: '#text', text: 'controlled-input', clear: true, effect: 'write' });
    assert.equal(await ownedWc.executeJavaScript("document.getElementById('text').value"), 'controlled-input');
    log('takeover', { pauseBeforeVisibility: true, inFlightOutcome: pendingOutcome, staleResumeDenied: true, inputAfterResume: true });
    await execute('probe-lease-a', { kind: 'click', selector: '#popup', effect: 'read' }); await wait(100);
    assert.equal(BaseWindow.getAllWindows().length, 3);
    await execute('probe-lease-a', { kind: 'click', selector: '#dialog', effect: 'read' });
    assert.equal(await ownedWc.executeJavaScript("document.getElementById('dialog').textContent"), 'dialog returned');
    await execute('probe-lease-a', { kind: 'click', selector: '#download', effect: 'read' }); await wait(250);
    assert.equal(counts.downloads, 1);
    let redirectDenied = false;
    try { await execute('probe-lease-b', { kind: 'navigate', url: `${origin}/redirect`, effect: 'read' }); }
    catch { redirectDenied = true; }
    assert(redirectDenied); assert(!registry.snapshot('probe-lease-b').url.startsWith('https://scope-not-allowed.invalid'));
    log('page-boundaries', { popupDenied: true, dialogsDisabled: true, downloadDenied: true, redirectDenied: true });
    // Destroy exactly B, never substitute A or the shell.
    const bId = b.view.webContents.id; b.view.webContents.close({ waitForBeforeUnload: false }); await wait(100);
    assert.equal(registry.size, 1); assert(!webContents.fromId(bId));
    assert.throws(() => execute('probe-lease-b', { kind: 'read', effect: 'read' }), /not live/);
    log('target-loss', { destroyedWebContentsId: bId, remainingLeases: registry.size });
    const inFlight = execute('probe-lease-a', slowAction).catch(e => e.code || 'interrupted');
    const queued = execute('probe-lease-a', { kind: 'click', selector: '#mutate', effect: 'write' }).catch(e => e.code || 'denied');
    await wait(100); const mutationsBeforeStop = counts.A.mutate;
    await registry.cancel('probe-lease-a'); await Promise.all([inFlight, queued]);
    await wait(150); assert.equal(counts.A.mutate, mutationsBeforeStop); assert.equal(registry.size, 0);
    assert(ownedWc.isDestroyed()); assert(debuggerDetached);
    assert.equal(a.listeners.length, 0); assert.equal(a.timers.size, 0); assert.equal(a.consumed.size, 0);
    log('stop-and-cleanup', { noNewAction: counts.A.mutate === mutationsBeforeStop, registry: registry.size,
      destroyed: ownedWc.isDestroyed(), debuggerDetached, listenerRefs: a.listeners.length,
      timerRefs: a.timers.size, permitRefs: a.consumed.size });
    // Explicit app-quit cleanup while a new live workhost exists.
    await registry.createLease(ticket('quit', scopeA));
    await execute('probe-lease-quit', { kind: 'navigate', url: `${origin}/page`, effect: 'read' });
    const quitWc = webContents.fromId(registry.snapshot('probe-lease-quit').webContentsId);
    app.once('before-quit', event => {
      event.preventDefault(); log('quit-cleanup-start', { liveRegistry: registry.size, liveWindows: BaseWindow.getAllWindows().length });
      void (async () => {
        await registry.closeAll('explicit_app_quit'); assert.equal(registry.size, 0); assert(quitWc.isDestroyed());
        await session.fromPartition(partitionA).cookies.flushStore(); await session.fromPartition(partitionB).cookies.flushStore();
        shell.destroy(); shell = undefined;
        for (const socket of sockets) socket.destroy();
        await new Promise(resolve => server.close(resolve)); server = undefined;
        for (let i = 0; sockets.size && i < 20; i++) await wait(10);
        assert.equal(sockets.size, 0); assert.equal(BaseWindow.getAllWindows().length, 0);
        log('passed', { registry: 0, remainingWindows: 0, activeServerSockets: sockets.size, quitTargetDestroyed: quitWc.isDestroyed(),
          cleanupTriggeredByActualQuit: true });
        clearTimeout(watchdog); app.quit();
      })().catch(error => { log('failed', { error: String(error), stack: error.stack }); clearTimeout(watchdog); app.exit(1); });
    });
    app.quit();
  } catch (error) {
    log('failed', { error: String(error), stack: error.stack });
    try { await registry?.closeAll('probe_failed'); } catch { /* preserve failure */ }
    try { shell?.destroy(); } catch { /* already gone */ }
    for (const socket of sockets) socket.destroy();
    if (server) await new Promise(resolve => server.close(resolve));
    clearTimeout(watchdog); app.exit(1);
  }
}
// Controlled probe-only page fetch. Production gateway never accepts or exposes this JavaScript.
async function ownedPageFetch(registry, id, url) {
  const { webContents } = require('electron');
  const wc = webContents.fromId(registry.snapshot(id).webContentsId);
  return wc.executeJavaScript(`fetch(${JSON.stringify(url)}).then(async response => Object.fromEntries(response.headers.entries()))`);
}
if (process.argv.includes('--electron-child')) {
  const index = process.argv.indexOf('--electron-child');
  void electronChild(process.argv[index + 1], process.argv[index + 2]);
} else parent().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
