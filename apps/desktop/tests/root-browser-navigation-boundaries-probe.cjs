/* Real Electron/BrowserHost scope-boundary probe using only loopback targets. */
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
const hostBundle = process.env.ROOT_BROWSER_BOUNDARIES_HOST_BUNDLE || path.join(projectRoot,
  'output/root-browser-navigation-boundary-fixture/independent-browser-host.js');
const partitionBundle = process.env.ROOT_BROWSER_BOUNDARIES_PARTITION_BUNDLE || path.join(projectRoot,
  'output/root-browser-navigation-boundary-fixture/agent-execution-partition.js');
const expectedElectronVersion = '37.10.3+wvcus';

function runParent() {
  assert.equal(process.platform, 'win32', 'This probe uses the controlled Windows Electron runtime.');
  assert.ok(fs.existsSync(electronExe), `Electron executable missing: ${electronExe}`);
  assert.equal(fs.readFileSync(path.join(path.dirname(electronExe), 'version'), 'utf8').trim(), expectedElectronVersion);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'root-browser-boundaries-profile-'));
  // Deliberately omit --no-sandbox. No browser debugging port or external URL is used.
  const child = spawn(electronExe, [`--user-data-dir=${profile}`, '--disable-gpu', __filename, '--child'], {
    cwd: projectRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: process.env
  });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += chunk; process.stdout.write(chunk); });
  child.stderr.on('data', chunk => { stderr += chunk; process.stderr.write(chunk); });
  child.on('error', error => { console.error(`Electron spawn failed: ${error.message}`); process.exitCode = 1; });
  child.on('close', code => {
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* private probe profile only */ }
    if (code !== 0 || !stdout.includes('ROOT_BROWSER_BOUNDARIES_PASS')) {
      console.error(`Probe failed: exit=${code}; ${stderr.slice(-3000)}`); process.exitCode = 1;
    }
  });
}

async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function waitFor(predicate, message, timeoutMs = 7000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(message);
}

async function runElectronProbe() {
  const { app, BrowserWindow, webContents } = require('electron');
  const { IndependentBrowserHostRegistry, browserActionDigest } = await import(pathToFileURL(hostBundle).href);
  const { computeAgentExecutionPartition } = await import(pathToFileURL(partitionBundle).href);
  const result = { electronVersion: process.versions.electron, stages: [] };
  let foreignRequests = 0, downloadRequests = 0;
  let shell, host;
  const events = [];
  const scopeByLease = new Map();
  const targetByLease = new Map();
  const downloadDir = path.join(app.getPath('userData'), 'Downloads');
  app.setPath('downloads', downloadDir);
  fs.mkdirSync(downloadDir, { recursive: true });

  let foreignOrigin = '';
  const pageHtml = () => `<!doctype html><title>Scoped BrowserHost Test</title>
    <main id="status">controlled page</main>
    <a id="other-origin" href="${foreignOrigin}/foreign">other origin</a>
    <a id="popup" href="/popup" target="_blank">popup</a>
    <a id="download" href="/download">download</a>`;
  const allowedServer = http.createServer((request, response) => {
    if (request.url === '/download') {
      downloadRequests++;
      response.writeHead(200, { 'content-type': 'application/octet-stream',
        'content-disposition': 'attachment; filename="root-browser-boundary-fixture.bin"', 'cache-control': 'no-store' });
      response.end(Buffer.from('private fixture download'));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(request.url.startsWith('/popup') ? '<!doctype html><title>Popup</title>' : pageHtml());
  });
  const foreignServer = http.createServer((_request, response) => {
    foreignRequests++;
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>Foreign</title><main>must never load</main>');
  });
  let allowedOrigin = '', fileFixture = '', fileFixtureUrl = '';
  try {
    await app.whenReady();
    allowedOrigin = await listen(allowedServer);
    foreignOrigin = await listen(foreignServer);
    fileFixture = path.join(app.getPath('userData'), 'external-protocol-fixture.html');
    fs.writeFileSync(fileFixture, '<!doctype html><title>Private protocol fixture</title>', { flag: 'wx' });
    fileFixtureUrl = pathToFileURL(fileFixture).href;
    shell = new BrowserWindow({ show: false, width: 500, height: 300, webPreferences: {
      nodeIntegration: false, contextIsolation: true, sandbox: true
    } });
    const shellPage = `data:text/html,${encodeURIComponent('<!doctype html><title>Boundary test shell</title>')}`;
    await shell.loadURL(shellPage);

    host = new IndependentBrowserHostRegistry({
      validateTicket: () => {}, resolvePartition: scope => computeAgentExecutionPartition(scope),
      cleanupTimeoutMs: 5000, onEvent: event => events.push(event)
    });
    const makeLease = async suffix => {
      const scope = { spaceId: `root-boundary-space-${suffix}`, backendProfileId: `root-boundary-profile-${suffix}`,
        browserProfileId: `root-boundary-browser-${suffix}` };
      const leaseId = `root-boundary-lease-${suffix}-${process.pid}`;
      const runId = `root-boundary-run-${suffix}-${process.pid}`;
      const partitionKey = computeAgentExecutionPartition(scope);
      scopeByLease.set(leaseId, { scope, runId, partitionKey });
      const lease = await host.createLease({ leaseId, runId, scope, partitionKey,
        runnerGeneration: `root-boundary-runner-${suffix}-${process.pid}`, permissionEpoch: 1,
        allowedOrigins: [allowedOrigin], expiresAt: Date.now() + 120000 });
      targetByLease.set(leaseId, { targetId: lease.targetId, webContentsId: lease.webContentsId,
        partitionKey: lease.partitionKey, mainGeneration: lease.mainGeneration,
        runnerGeneration: lease.runnerGeneration, scope: lease.scope, runId: lease.runId });
      return leaseId;
    };
    const permitFor = (leaseId, action, label) => {
      const lease = host.snapshot(leaseId), owner = scopeByLease.get(leaseId);
      return { permitId: `${label}-${Date.now()}-${Math.random()}`, leaseId, runId: owner.runId,
        scope: owner.scope, targetId: lease.targetId, mainGeneration: lease.mainGeneration,
        runnerGeneration: lease.runnerGeneration, navigationEpoch: lease.navigationEpoch,
        permissionEpoch: lease.permissionEpoch, actionDigest: browserActionDigest(action),
        expiresAt: Date.now() + 10000, allowMutation: true };
    };
    const perform = (leaseId, action, label) => host.execute(permitFor(leaseId, action, label), action);
    const navigate = (leaseId, label) => perform(leaseId,
      { kind: 'navigate', url: `${allowedOrigin}/target?${label}`, effect: 'read' }, `navigate-${label}`);
    const click = (leaseId, selector, label) => perform(leaseId,
      { kind: 'click', selector, effect: 'read' }, `click-${label}`);
    const identityStillOwned = (leaseId, prior) => {
      const current = host.snapshot(leaseId), owner = scopeByLease.get(leaseId);
      for (const key of ['targetId', 'webContentsId', 'partitionKey', 'mainGeneration', 'runnerGeneration'])
        assert.equal(current[key], prior[key], `${key} changed after denied browser action`);
      assert.deepEqual(current.scope, owner.scope);
      assert.equal(current.runId, owner.runId);
      assert.equal(current.partitionKind, 'dedicated_agent');
      return current;
    };
    const waitEvent = async (kind, leaseId) => waitFor(
      () => events.some(event => event.kind === kind && event.lease.leaseId === leaseId),
      `missing ${kind} event for ${leaseId}`);
    const beforeWebContents = () => webContents.getAllWebContents().map(item => item.id).sort((a, b) => a - b);

    // A distinct-origin page link is a real click/navigation attempt. It must
    // be blocked before the foreign loopback server sees any request.
    const originLease = await makeLease('origin');
    await navigate(originLease, 'origin');
    const originBefore = host.snapshot(originLease);
    const wcBeforeForeign = beforeWebContents();
    await click(originLease, '#other-origin', 'foreign-origin').catch(error => {
      assert.equal(error.code, 'action_interrupted'); // Denial closes the action gate fail-closed.
    });
    await waitEvent('navigation_denied', originLease);
    await new Promise(resolve => setTimeout(resolve, 150));
    const originAfter = identityStillOwned(originLease, targetByLease.get(originLease));
    assert.equal(foreignRequests, 0, 'foreign target received a request');
    assert.equal(new URL(originAfter.url).origin, allowedOrigin);
    assert.equal(originAfter.state, 'pausing');
    assert.deepEqual(beforeWebContents(), wcBeforeForeign, 'foreign navigation created a new WebContents');
    result.stages.push({ name: 'foreign origin blocked before request; original scoped target retained fail-closed',
      allowedOrigin, foreignOrigin, foreignRequests, state: originAfter.state,
      targetId: originAfter.targetId, navigationEpoch: originAfter.navigationEpoch });

    // Popup and download attempts run under another independent scope so a
    // denied navigation above cannot mask whether those own event handlers fire.
    const contentLease = await makeLease('content');
    await navigate(contentLease, 'content');
    let contents = beforeWebContents();
    await click(contentLease, '#popup', 'popup');
    await waitEvent('popup_denied', contentLease);
    assert.deepEqual(beforeWebContents(), contents, 'popup created a WebContents despite denial');
    assert.equal(identityStillOwned(contentLease, targetByLease.get(contentLease)).state, 'ready');

    contents = beforeWebContents();
    await click(contentLease, '#download', 'download');
    await waitEvent('download_denied', contentLease);
    await waitFor(() => downloadRequests === 1, 'controlled download endpoint was not requested');
    assert.deepEqual(beforeWebContents(), contents, 'download spawned another WebContents');
    assert.deepEqual(fs.readdirSync(downloadDir), [], 'denied download wrote a file');
    const contentAfter = identityStillOwned(contentLease, targetByLease.get(contentLease));
    assert.equal(contentAfter.state, 'ready');
    result.stages.push({ name: 'popup denied and download canceled in the scoped session',
      popupDenied: true, popupCreatedNoWebContents: true, downloadDenied: true,
      downloadRequests, filesWritten: fs.readdirSync(downloadDir).length,
      targetId: contentAfter.targetId, partitionKey: contentAfter.partitionKey });

    // Non-web protocols are presented as genuine scoped BrowserHost navigate
    // actions, but must fail before Electron receives a navigation command.
    // This avoids registering or invoking any OS protocol handler.
    const protocolLease = await makeLease('protocol');
    await navigate(protocolLease, 'protocol');
    const protocolBefore = host.snapshot(protocolLease);
    const protocolAttempts = [fileFixtureUrl, 'mailto:root-browser-boundary@example.invalid'];
    for (const [index, url] of protocolAttempts.entries()) {
      const action = { kind: 'navigate', url, effect: 'read' };
      await assert.rejects(perform(protocolLease, action, `external-protocol-${index}`), error =>
        error?.code === 'origin_denied');
      const afterAttempt = identityStillOwned(protocolLease, targetByLease.get(protocolLease));
      assert.equal(afterAttempt.url, protocolBefore.url, 'non-web scheme changed the browser location');
      assert.equal(afterAttempt.state, 'ready');
    }
    const protocolAfter = host.snapshot(protocolLease);
    result.stages.push({ name: 'non-web protocols rejected before navigation; scoped target unchanged',
      protocols: protocolAttempts.map(url => new URL(url).protocol), rejectedBeforeNavigation: true,
      state: protocolAfter.state, targetId: protocolAfter.targetId,
      fixtureIsOwnedByTempProfile: fileFixture.startsWith(app.getPath('userData')) });

    const targetIds = [...targetByLease.values()].map(value => value.webContentsId);
    await host.closeAll('scope_boundary_acceptance_cleanup');
    assert.equal(host.size, 0);
    for (const leaseId of scopeByLease.keys()) assert.equal(host.snapshot(leaseId).state, 'closed');
    assert.ok(targetIds.every(id => !webContents.getAllWebContents().some(item => item.id === id)));
    assert.equal(shell.isDestroyed(), false);
    shell.destroy(); shell = undefined;
    assert.equal(BrowserWindow.getAllWindows().length, 0);
    assert.equal(fs.readdirSync(downloadDir).length, 0);
    result.cleanup = { registrySize: host.size, allLeasesClosed: true, targetWebContentsGone: true,
      testWindowsRemaining: 0, downloadFiles: 0, privateProfileRemovedByParent: true };
    console.log(`ROOT_BROWSER_BOUNDARIES_PASS ${JSON.stringify(result)}`);
  } catch (error) {
    console.error(`ROOT_BROWSER_BOUNDARIES_FAIL ${error?.stack || error}`);
    process.exitCode = 1;
  } finally {
    try { await host?.closeAll('probe_finally'); } catch (error) { console.error(`cleanup: ${error?.message || error}`); process.exitCode = 1; }
    if (shell && !shell.isDestroyed()) shell.destroy();
    await Promise.all([new Promise(resolve => allowedServer.close(resolve)),
      new Promise(resolve => foreignServer.close(resolve))]);
    await app.quit();
  }
}

if (process.argv.includes('--child')) void runElectronProbe();
else runParent();
