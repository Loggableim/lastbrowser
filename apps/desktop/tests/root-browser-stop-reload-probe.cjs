/* Controlled Electron probe for Main-owned independent browser lifecycle.
 * Run with `node apps/desktop/tests/root-browser-lifecycle-probe.cjs`.
 * It starts a private Electron test app and talks to BrowserHost only through
 * its normal lease/permit/action methods; it never enables remote debugging.
 */
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const projectRoot = path.resolve(__dirname, '../../..');
const electronExe = process.env.LASTBROWSER_TEST_ELECTRON || path.join(projectRoot,
  'output/feature-preview-2026-10-04T19-23-32-883Z-64a193fe/win-unpacked/electron.exe');
const hostBundle = process.env.ROOT_BROWSER_STOP_HOST_BUNDLE || path.join(projectRoot,
  'output/root-browser-stop-fixture/independent-browser-host.js');
const expectedElectronVersion = '37.10.3+wvcus';

function runParent() {
  assert.equal(process.platform, 'win32', 'This probe targets the checked-in Windows Electron runtime.');
  assert.ok(fs.existsSync(electronExe), `Electron executable missing: ${electronExe}`);
  const versionFile = path.join(path.dirname(electronExe), 'version');
  assert.equal(fs.readFileSync(versionFile, 'utf8').trim(), expectedElectronVersion,
    'Electron runtime does not match the reviewed WVCU version.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'root-browser-lifecycle-profile-'));
  const child = spawn(electronExe, [
    `--user-data-dir=${profile}`, '--disable-gpu', '--no-sandbox', __filename, '--child'
  ], { cwd: projectRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += chunk; process.stdout.write(chunk); });
  child.stderr.on('data', chunk => { stderr += chunk; process.stderr.write(chunk); });
  child.on('error', error => { console.error(`Electron spawn failed: ${error.message}`); process.exitCode = 1; });
  child.on('close', code => {
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* isolated temp profile only */ }
      if (code !== 0 || !stdout.includes('ROOT_BROWSER_STOP_RELOAD_PASS')) {
      console.error(`Probe failed: exit=${code}; ${stderr.slice(-3000)}`);
      process.exitCode = 1;
    }
  });
}

async function runElectronProbe() {
  const { app, BrowserWindow, webContents } = require('electron');
  const { IndependentBrowserHostRegistry, browserActionDigest } = await import(pathToFileURL(
    hostBundle).href);
  const { computeAgentExecutionPartition } = await import(pathToFileURL(
    path.join(projectRoot, 'apps/desktop/dist/main/agent-execution-partition.js')).href);
  const scope = { spaceId: 'root-lifecycle-space', backendProfileId: 'root-lifecycle-backend', browserProfileId: 'root-lifecycle-browser' };
  const runId = `root-lifecycle-${process.pid}`;
  const partitionKey = computeAgentExecutionPartition(scope);
  let shellRequests = 0;
  let signalDelayedNavigation;
  const delayedNavigationReceived = new Promise(resolve => { signalDelayedNavigation = resolve; });
  let delayedNavigationResponse;
  const server = http.createServer((request, response) => {
    if (request.url === '/delayed') {
      delayedNavigationResponse = response;
      signalDelayedNavigation();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    if (request.url === '/shell') {
      shellRequests++;
      response.end('<!doctype html><title>Controlled shell</title><main>shell renderer reload probe</main>');
      return;
    }
    response.end(`<!doctype html><title>Controlled browser target</title><main id="status">ticks=0; clicks=0</main>
      <button id="advance" onclick="window.clicks++;render()">advance</button>
      <script>window.ticks=0;window.clicks=0;function render(){document.querySelector('#status').innerText='ticks='+window.ticks+'; clicks='+window.clicks}
      setInterval(()=>{window.ticks++;render()},100)</script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  let host, shell, targetWebContentsId, targetId, initialPartition;
  const events = [];
  const result = { electronVersion: process.versions.electron, origin, stages: [] };
  const permitFor = (action, id) => {
    const lease = host.snapshot('root-lifecycle-lease');
    return { permitId: `${id}-${Date.now()}-${Math.random()}`, leaseId: lease.leaseId, runId,
      scope, targetId: lease.targetId, mainGeneration: lease.mainGeneration, runnerGeneration: lease.runnerGeneration,
      navigationEpoch: lease.navigationEpoch, permissionEpoch: lease.permissionEpoch,
      actionDigest: browserActionDigest(action), expiresAt: Date.now() + 10000, allowMutation: true };
  };
  const perform = async (action, id) => host.execute(permitFor(action, id), action);
  const readStatus = async id => {
    const value = await perform({ kind: 'read', selector: '#status', maxChars: 256, effect: 'read' }, id);
    assert.equal(value.title, 'Controlled browser target');
    return value.text;
  };
  try {
    await app.whenReady();
    shell = new BrowserWindow({ show: true, width: 640, height: 420, webPreferences: {
      nodeIntegration: false, contextIsolation: true, sandbox: true
    } });
    await shell.loadURL(`${origin}/shell`);
    host = new IndependentBrowserHostRegistry({ validateTicket: () => {}, resolvePartition: () => partitionKey,
      cleanupTimeoutMs: 5000, onEvent: event => events.push(event) });
    await host.createLease({ leaseId: 'root-lifecycle-lease', runId, scope, partitionKey,
      runnerGeneration: `runner-${process.pid}`, permissionEpoch: 1, allowedOrigins: [origin], expiresAt: Date.now() + 120000 });
    const firstAction = { kind: 'navigate', url: `${origin}/target`, effect: 'read' };
    const first = await perform(firstAction, 'navigate');
    assert.equal(new URL(first.url).origin, origin);
    const firstLease = host.snapshot('root-lifecycle-lease');
    targetWebContentsId = firstLease.webContentsId; targetId = firstLease.targetId; initialPartition = firstLease.partitionKey;
    assert.ok(firstLease.navigationEpoch > 0);
    await new Promise(resolve => setTimeout(resolve, 250));
    const beforeMinimize = await readStatus('read-before-minimize');
    const minimized = new Promise(resolve => shell.once('minimize', resolve));
    shell.minimize();
    await minimized;
    await new Promise(resolve => setTimeout(resolve, 300));
    const afterMinimize = await readStatus('read-after-minimize');
    assert.notEqual(afterMinimize, beforeMinimize, `page did not advance while shell minimized: ${beforeMinimize}`);
    assert.equal(shell.isMinimized(), true);
    result.stages.push({ name: 'actual page read advances while shell minimized', beforeMinimize, afterMinimize,
      shellMinimized: shell.isMinimized() });

    const click = { kind: 'click', selector: '#advance', effect: 'write' };
    await perform(click, 'click-before-reload');
    const afterClickBeforeReload = await readStatus('read-click-before-reload');
    assert.match(afterClickBeforeReload, /clicks=1/);
    const beforeReloadLease = host.snapshot('root-lifecycle-lease');
    let didFinish;
    const reloadDone = new Promise(resolve => { didFinish = resolve; });
    shell.webContents.once('did-finish-load', didFinish);
    shell.webContents.reload();
    await Promise.race([reloadDone, new Promise((_, reject) => setTimeout(() => reject(new Error('shell renderer reload timed out')), 10000))]);
    assert.equal(shell.isMinimized(), true, 'shell unexpectedly restored during renderer reload');
    const afterReloadLease = host.snapshot('root-lifecycle-lease');
    assert.equal(afterReloadLease.webContentsId, targetWebContentsId);
    assert.equal(afterReloadLease.targetId, targetId);
    assert.equal(afterReloadLease.partitionKey, initialPartition);
    assert.equal(afterReloadLease.navigationEpoch, beforeReloadLease.navigationEpoch);
    await new Promise(resolve => setTimeout(resolve, 300));
    const afterReload = await readStatus('read-after-shell-reload');
    assert.notEqual(afterReload, afterClickBeforeReload, 'page activity stopped across shell renderer reload');
    assert.match(afterReload, /clicks=1/);
    await perform(click, 'click-after-reload');
    const afterClickReload = await readStatus('read-click-after-reload');
    assert.match(afterClickReload, /clicks=2/);
    assert.equal(shellRequests, 2, 'shell renderer did not reload its isolated local page');
    result.stages.push({ name: 'same target/session continues real read and click after shell renderer reload',
      targetId, webContentsId: targetWebContentsId, partitionKey: initialPartition,
      beforeReload: afterClickBeforeReload, afterReload, afterReloadClick: afterClickReload,
      shellRendererLoads: shellRequests });

    // Hold an actual local navigation response in flight. Cancellation is
    // acknowledged by the host only after its target teardown completes.
    const delayedNavigate = { kind: 'navigate', url: `${origin}/delayed`, effect: 'read' };
    const pendingResult = perform(delayedNavigate, 'late-navigation').then(
      value => ({ settled: 'fulfilled', value }),
      error => ({ settled: 'rejected', code: error?.code || '', inFlight: error?.inFlight === true })
    );
    await Promise.race([delayedNavigationReceived,
      new Promise((_, reject) => setTimeout(() => reject(new Error('delayed navigation was not received')), 10000))]);
    const stopAckStartedAt = Date.now();
    await host.cancel('root-lifecycle-lease');
    const stopAckMs = Date.now() - stopAckStartedAt;
    assert.equal(host.snapshot('root-lifecycle-lease').state, 'closed');
    if (delayedNavigationResponse && !delayedNavigationResponse.destroyed)
      delayedNavigationResponse.end('<!doctype html><title>Late response</title><main>late response must not restore the lease</main>');
    const late = await Promise.race([pendingResult,
      new Promise((_, reject) => setTimeout(() => reject(new Error('cancelled action result did not settle')), 5000))]);
    assert.equal(late.settled, 'rejected', 'late browser action response was accepted after stop acknowledgement');
    assert.ok(['action_interrupted', 'target_lost'].includes(late.code), `unexpected late result: ${JSON.stringify(late)}`);
    const postStopAction = { kind: 'read', selector: '#status', maxChars: 256, effect: 'read' };
    const postStopPermit = permitFor(postStopAction, 'post-stop-read');
    assert.throws(() => host.execute(postStopPermit, postStopAction), error =>
      ['lease_missing', 'target_lost', 'gate_closed'].includes(error?.code));
    assert.equal(host.size, 0, 'stop acknowledgement left an actionable lease behind');
    result.stages.push({ name: 'accepted host stop prevents post-ack action and rejects late navigation result',
      stopAckMs, lateAction: late, postStopActionRejected: true, registrySize: host.size });

    assert.equal(host.size, 0);
    assert.equal(host.snapshot('root-lifecycle-lease').state, 'closed');
    assert.ok(events.some(event => event.kind === 'closed' && event.lease.leaseId === 'root-lifecycle-lease'));
    assert.equal(webContents.getAllWebContents().some(item => item.id === targetWebContentsId), false,
      'independent target WebContents remained after cleanup');
    shell.destroy(); shell = undefined;
    assert.equal(BrowserWindow.getAllWindows().length, 0, 'test windows remained after cleanup');
    result.cleanup = { registrySize: host.size, leaseState: host.snapshot('root-lifecycle-lease').state,
      targetWebContentsGone: true, windowsRemaining: 0, closedEvent: true };
    console.log(`ROOT_BROWSER_STOP_RELOAD_PASS ${JSON.stringify(result)}`);
  } catch (error) {
    console.error(`ROOT_BROWSER_STOP_RELOAD_FAIL ${error?.stack || error}`);
    process.exitCode = 1;
  } finally {
    try { await host?.closeAll('probe_finally'); } catch (error) { console.error(`cleanup: ${error?.message || error}`); process.exitCode = 1; }
    if (shell && !shell.isDestroyed()) shell.destroy();
    await new Promise(resolve => server.close(resolve));
    await app.quit();
  }
}

if (process.argv.includes('--child')) void runElectronProbe();
else runParent();
