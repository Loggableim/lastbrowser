#!/usr/bin/env node
/* Production Main reader/preload/private HTTP/native worker/SDK; local fixtures only. */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process'), { randomUUID } = require('node:crypto'), { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, milliseconds = 30000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) { const result = await check(); if (result) return result; await wait(40); }
  throw new Error('Native stream probe timeout: ' + label);
}
async function parent() {
  const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-chat-sse-'));
  for (const [entry, name] of [['independent-controller', 'independent'], ['native-chat-stream-controller', 'reader'], ['sidekick-api', 'api'], ['chat-stream', 'stream'], ['preload', 'preload'], ['session-request-policy', 'session-policy']])
    require('esbuild').buildSync({ entryPoints: [path.join(root, `apps/desktop/src/main/${entry}.ts`)], outfile: path.join(temp, name + '.cjs'),
      bundle: true, platform: 'node', format: 'cjs', external: ['electron'] });
  fs.writeFileSync(path.join(temp, 'bootstrap.json'), JSON.stringify({ privateBridgeNonce: randomUUID(), nativeStreamProbe: true,
      nativeGrillProbe: process.argv.includes('--grill'), nativeBrowserProbe: process.argv.includes('--browser'), nativeDiagnosticStacks: process.argv.includes('--diagnostic-stacks') }), { mode: 0o600 });
  if (process.argv.includes('--browser')) require('esbuild').buildSync({
    entryPoints: [path.join(root, 'apps/desktop/tests/native-browser-renderer-entry.tsx')], outfile: path.join(temp, 'browser-ui.js'),
    bundle: true, platform: 'browser', format: 'iife', target: 'chrome138', define: { 'process.env.NODE_ENV': '"production"' } });
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATH', 'PATHEXT', 'TEMP', 'TMP'].includes(key.toUpperCase())));
  let backend, electron, backendExit, electronExit, failure;
  try {
    backend = spawn(path.join(root, 'apps/desktop/runtime/python/python.exe'), [path.join(root, 'scripts/probe-independent-pipeline-backend.py'), temp],
      { cwd: root, env: environment, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    backend.stdout.resume(); let diagnostic = ''; backend.stderr.on('data', data => { diagnostic = (diagnostic + data).slice(-6000); });
    backendExit = new Promise(resolve => backend.once('exit', (code, signal) => resolve({ code, signal })));
    await until(async () => { if (backend.exitCode !== null) throw new Error('Backend failed: ' + diagnostic);
      if (!fs.existsSync(path.join(temp, 'ready.json'))) return false;
      try { return (await fetch(JSON.parse(fs.readFileSync(path.join(temp, 'ready.json'))).apiUrl + '/health')).ok; } catch { return false; } }, 'actual API startup');
    electron = spawn(require('electron'), [__filename, '--electron-child', temp], { cwd: root, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    electron.stdout.resume(); let stderr = ''; electron.stderr.on('data', data => { stderr = (stderr + data).slice(-6000); });
    electronExit = new Promise(resolve => electron.once('exit', (code, signal) => resolve({ code, signal })));
    const watchdog = setTimeout(() => electron.kill(), process.argv.includes('--grill') ? 320000 : 170000), exited = await electronExit; clearTimeout(watchdog);
    if (fs.existsSync(path.join(temp, 'stream-phases.jsonl'))) process.stdout.write(fs.readFileSync(path.join(temp, 'stream-phases.jsonl')));
    if (exited.code !== 0) {
      process.stderr.write(fs.readFileSync(path.join(temp, 'backend-phases.jsonl')));
      for (const name of fs.readdirSync(temp).filter(name => /^native-stack-[a-f0-9]{32}\.txt$/.test(name))) {
        const frames = fs.readFileSync(path.join(temp, name), 'utf8').split('\n').flatMap(line => {
          const match = /File "([^"]+)", line (\d+),? in (.*)/.exec(line);
          return match ? [{ file: path.basename(match[1]), line: Number(match[2]), function: match[3].slice(0, 120) }] : [];
        });
        console.log(JSON.stringify({ phase: 'actual_native_stack_locations', frames }));
      }
      throw new Error('Actual native stream pipeline failed: ' + JSON.stringify(exited) + ' ' + stderr + ' ' + diagnostic);
    }
    backend.stdin.end('shutdown\n');
    const stopped = await Promise.race([backendExit, wait(10000).then(() => null)]); assert.equal(stopped?.code, 0);
    const phases = fs.readFileSync(path.join(temp, 'backend-phases.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(phases.filter(row => row.phase === 'blocked_external_attempt').length, 0);
    if (!process.argv.includes('--browser')) {
      assert(phases.some(row => row.phase === 'native_provider_waiting' && row.case === 'nativestreama'));
      assert(phases.some(row => row.phase === 'native_provider_waiting' && row.case === 'nativestreamb'));
    }
    console.log(JSON.stringify({ phase: 'parent:passed', electron: require('electron/package.json').version, backendStopped: stopped,
      evidence: 'actual private stream proof/native SSE/status + production Main read controller/preload + isolated ordinary native workers/OpenAI SDK with localhost synthetic replies; full App boot and external provider/model quality untested' }));
  } catch (error) { failure = error; }
  finally {
    if (electron && electron.exitCode === null) { electron.kill(); await electronExit; }
    if (backend && backend.exitCode === null) { backend.stdin.end('shutdown\n'); if (!await Promise.race([backendExit, wait(10000).then(() => null)])) { backend.kill(); await backendExit; } }
    assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep)); assert(path.basename(temp).startsWith('lb-chat-sse-')); fs.rmSync(temp, { recursive: true, force: true });
  }
  if (failure) throw failure;
}
async function child(temp) {
  const { app, BrowserWindow, BaseWindow, ipcMain, protocol, net } = require('electron');
  const { IndependentController, independentIpcRequest } = require(path.join(temp, 'independent.cjs'));
  const { NativeChatStreamController } = require(path.join(temp, 'reader.cjs'));
  const api = require(path.join(temp, 'api.cjs')), { subscribeChatStream } = require(path.join(temp, 'stream.cjs'));
  const info = JSON.parse(fs.readFileSync(path.join(temp, 'ready.json'))), flags = JSON.parse(fs.readFileSync(path.join(temp, 'bootstrap.json'))), nonce = flags.privateBridgeNonce;
  const log = (phase, fields = {}) => fs.appendFileSync(path.join(temp, 'stream-phases.jsonl'), JSON.stringify({ phase, at: new Date().toISOString(), ...fields }) + '\n');
  app.setPath('userData', path.join(temp, 'user-data')); app.setPath('crashDumps', path.join(temp, 'crash-dumps')); app.setAppLogsPath(path.join(temp, 'logs'));
  protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } }]); app.on('window-all-closed', () => {});
  let shell, guest, independent, readers, readCalls = 0; const nativeEvents = [];
  const watchdog = setTimeout(() => { log('watchdog'); app.exit(74); }, flags.nativeGrillProbe ? 305000 : 155000);
  try {
    await app.whenReady();
    fs.writeFileSync(path.join(temp, 'index.html'), '<!doctype html><h1>Controlled native stream reader</h1><iframe src="app://bundle/frame.html"></iframe><script>localStorage.setItem("lastbrowser.locale","en");localStorage.setItem("lastbrowser.profiles.v1",JSON.stringify([{id:"stream-browser-a"},{id:"stream-browser-b"}]))</script>'
      + (flags.nativeBrowserProbe ? '<div id="native-browser-root"></div><link rel="stylesheet" href="browser-ui.css"><script src="browser-ui.js"></script>' : ''));
    fs.writeFileSync(path.join(temp, 'frame.html'), '<!doctype html><p>Untrusted subframe</p>');
    protocol.handle('app', request => {
      const name = path.basename(new URL(request.url).pathname);
      return net.fetch(pathToFileURL(path.join(temp, ['frame.html', 'browser-ui.js', 'browser-ui.css'].includes(name) ? name : 'index.html')).href);
    });
    const isShell = owner => shell?.webContents === owner;
    const { installSessionRequestPolicy } = require(path.join(temp, 'session-policy.cjs'));
    const attachSession = target => {
      installSessionRequestPolicy(target, details => {
        const decision = independent?.requestPolicy(details, target) || { owned: false, allowed: true };
        const url = new URL(details.url);
        return { owned: decision.owned, allowed: decision.allowed && (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) || ['127.0.0.1', 'localhost'].includes(url.hostname)) };
      });
      target.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      target.setPermissionCheckHandler(() => false);
    };
    independent = new IndependentController({ userDataDir: app.getPath('userData'), isShell,
      apiRequest: (operation, scope, payload, profile) => api.independentApiRequest(info.apiUrl, operation, scope, payload, profile, nonce), attachSession });
    const createReaders = () => new NativeChatStreamController({ isShell,
      readContext: binding => { readCalls++; return api.readNativeChatContext(info.apiUrl, { ...binding, workspacePath: binding.workspacePath ?? undefined, nativeBridgeNonce: nonce }); },
      subscribeTransport: (binding, onEvent) => subscribeChatStream(info.apiUrl, binding.streamId, null, event => {
        if (event.data?.nativeChat === true && ['stream_end', 'error', 'apperror', 'cancel'].includes(event.event)) {
          nativeEvents.push({ streamId: binding.streamId, kind: event.event, processExited: event.data.processExited });
          log('actual_native_terminal', { streamId: binding.streamId, kind: event.event, processExited: event.data.processExited,
            readerRegistered: readers.subscriptions.size > 0,
            ...Object.fromEntries(['code', 'errorCode', 'reasonCode', 'errorType', 'errorSite', 'causeType'].filter(key => event.data[key] !== undefined).map(key => [key, event.data[key]])) });
        }
        onEvent(event);
      }, undefined, 'sidekick_profile=other', api.nativeChatReadHeaders({ profile: binding.profile,
        workspacePath: binding.workspacePath ?? undefined, nativeBridgeNonce: binding.nativeChat ? nonce : undefined })),
      statusTransport: binding => api.getChatStreamStatus(info.apiUrl, binding.streamId, undefined,
        api.nativeChatReadHeaders({ profile: binding.profile, workspacePath: binding.workspacePath ?? undefined, nativeBridgeNonce: binding.nativeChat ? nonce : undefined })) });
    readers = createReaders();
    const nativeUiResults = [];
    ipcMain.handle('lastbrowser:independent:request', async (event, request) => {
      const result = await independentIpcRequest(independent, event, request);
      if (['openNativeBrowser', 'takeoverNativeBrowser'].includes(request?.operation)) nativeUiResults.push({ operation: request.operation, payload: request.payload, result });
      return result;
    });
    ipcMain.handle('lastbrowser:i18n:setLocale', (_event, locale) => locale);
    const bound = async (event, raw) => {
      // Same purpose/source mapping as main.ts: renderer never supplies scope/nonce.
      if (!raw || typeof raw !== 'object' || ['spaceScope', 'space_scope', 'nativeBridgeNonce'].some(key => key in raw)) throw new Error('Renderer authority denied');
      const binding = await independent.lookupBinding(raw.profile ?? 'default', raw.workspacePath ?? raw.workspace ?? null);
      if (!isShell(event.sender) || event.senderFrame !== event.sender.mainFrame || event.sender.isDestroyed()) throw new Error('Untrusted IPC sender');
      return { ...raw, ...(binding ? { profile: binding.backendProfileName, spaceScope: binding.scope, nativeBridgeNonce: nonce } : {}) };
    };
    ipcMain.handle('lastbrowser:sidekick:startChat', async (event, raw) => {
      const request = await bound(event, raw), capture = readers.beginCapture(event, request);
      const result = await api.startSidekickChat(info.apiUrl, request); await readers.captureStart(capture, result); return result;
    });
    ipcMain.handle('lastbrowser:sidekick:getSession', async (event, raw) => {
      const request = await bound(event, raw), capture = readers.beginCapture(event, request);
      const result = await api.getDesktopSession(info.apiUrl, request); await readers.captureSession(capture, result); return result;
    });
    ipcMain.handle('lastbrowser:sidekick:getStreamStatus', (event, value) => readers.status(event, value));
    ipcMain.handle('lastbrowser:sidekick:subscribeChatStream', (event, value) => readers.subscribe(event, value));
    ipcMain.handle('lastbrowser:sidekick:unsubscribeChatStream', (event, value) => readers.unsubscribe(event, value));
    ipcMain.handle('lastbrowser:sidekick:chatMode', async (event, raw) => api.controlChatMode(info.apiUrl, await bound(event, raw)));
    ipcMain.handle('lastbrowser:sidekick:grill', async (event, raw) => api.controlGrill(info.apiUrl, await bound(event, raw)));
    shell = new BrowserWindow({ show: false, width: 1000, height: 700, webPreferences: { preload: path.join(temp, 'preload.cjs'), contextIsolation: true, sandbox: true } });
    await shell.loadURL('app://bundle/index.html');
    const invoke = async (method, value, owner = shell.webContents) => owner.executeJavaScript(`window.lastbrowser.sidekick.${method}(${JSON.stringify(value)})`, true);
    const select = async (workspacePath, browserProfileId, backendProfileName) => {
      const result = await shell.webContents.executeJavaScript(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1, operation: 'resolveScope', backendProfileName, payload: { workspacePath, browserProfileId } })})`, true);
      assert.equal(result.ok, true); return result.value;
    };
    const a = await select(info.workspaceA, 'stream-browser-a', 'default'), b = await select(info.workspaceB, 'stream-browser-b', 'other');
    if (flags.nativeBrowserProbe) {
      await independent.start();
      const request = async (operation, scope, payload = {}) => {
        const result = await shell.webContents.executeJavaScript(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1, operation, scope, payload })})`, true);
        assert.equal(result.ok, true, JSON.stringify(result.error)); return result.value;
      };
      const permissions = await request('permissions', a.scope);
      await request('permissions', a.scope, { action: 'grant', expectedRevision: permissions.revision,
        permissions: { browserOrigins: [info.origin], allowedEffects: ['read', 'write'] } });
      const started = await invoke('startChat', { message: 'PIPELINE:nativebrowser', workspace: info.workspaceA, profile: 'stream-browser-a' });
      await invoke('subscribeChatStream', { streamId: started.streamId });
      await until(() => fs.readFileSync(path.join(temp, 'backend-phases.jsonl'), 'utf8').includes('"case": "nativebrowser", "assistant": false, "priorTools": 1'), 'actual native browser navigation', 75000);
      const identity = { sessionId: started.sessionId, streamId: started.streamId };
      await shell.webContents.executeJavaScript(`window.mountNativeBrowserProbe(${JSON.stringify(a.scope)},${JSON.stringify(started.sessionId)})`);
      await until(() => shell.webContents.executeJavaScript("Boolean(document.querySelector('.native-chat-browser-actions button:not(:disabled)'))"), 'actual mounted native browser activity');
      await shell.webContents.executeJavaScript("document.querySelector('.native-chat-browser-actions button').click();true");
      await until(() => nativeUiResults.some(row => row.operation === 'openNativeBrowser'), 'actual View browser button');
      const viewed = nativeUiResults.find(row => row.operation === 'openNativeBrowser').result;
      assert.equal(viewed.ok, true, JSON.stringify(viewed.error)); const view = viewed.value;
      await until(() => shell.webContents.executeJavaScript("Boolean(document.querySelector('.native-chat-browser img')?.naturalWidth)"), 'actual rendered screenshot');
      assert.equal(view.kind, 'native_browser_preview'); assert.equal(view.owner.runId, null);
      assert.equal(view.owner.sessionId, started.sessionId); assert.equal(view.owner.streamId, started.streamId);
      assert(view.preview.base64.length > 100); assert.equal(view.automationPaused, false);
      await until(() => shell.webContents.executeJavaScript("document.querySelectorAll('.native-chat-browser-actions button')[1]?.disabled===false"), 'actual Take over button ready');
      await shell.webContents.executeJavaScript("document.querySelectorAll('.native-chat-browser-actions button')[1].click();true");
      await until(() => nativeUiResults.some(row => row.operation === 'takeoverNativeBrowser'), 'actual Take over browser button');
      const capturedTakeover = nativeUiResults.find(row => row.operation === 'takeoverNativeBrowser').result;
      assert.equal(capturedTakeover.ok, true, JSON.stringify(capturedTakeover.error)); const taken = capturedTakeover.value;
      assert.equal(taken.automationPaused, true); assert.equal(taken.owner.streamId, started.streamId);
      const replay = await request('takeoverNativeBrowser', a.scope, nativeUiResults.find(row => row.operation === 'takeoverNativeBrowser').payload);
      assert.equal(replay.automationPaused, true);
      await fetch(info.origin + '/fixture/release', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ case: 'nativebrowser' }) });
      await until(async () => (await invoke('getStreamStatus', started.streamId)).native_controls.processExited === true, 'actual native browser worker exit', 75000);
      const saved = await invoke('getSession', { sessionId: started.sessionId, profile: 'stream-browser-a', workspacePath: info.workspaceA });
      assert(saved.session.messages.some(message => message.role === 'assistant' && message.content.includes('Controlled local browser task completed.')));
      log('actual_native_browser_final', { nativeOwner: true, screenshot: true, takeoverPausedAutomation: true, sameRequestReplay: true,
        originalChatCompleted: true, controlledLoopback: true, renderedBrowserButtons: true });
      await shell.webContents.executeJavaScript('window.unmountNativeBrowserProbe();true');
      readers.close(); await independent.shutdown(); shell.destroy(); clearTimeout(watchdog); app.exit(0); return;
    }
    const listen = () => shell.webContents.executeJavaScript('window.streamEvidence=[];window.lastbrowser.sidekick.onChatStreamEvent(event=>window.streamEvidence.push(event));void 0;');
    await listen();
    const startedA = await invoke('startChat', { message: 'PIPELINE:nativestreama', workspace: info.workspaceA, profile: 'stream-browser-a' });
    assert.deepEqual(startedA.spaceScope, a.scope); await invoke('subscribeChatStream', { streamId: startedA.streamId });
    const startedB = await invoke('startChat', { message: 'PIPELINE:nativestreamb', workspace: info.workspaceB, profile: 'stream-browser-b' });
    assert.deepEqual(startedB.spaceScope, b.scope);
    await until(async () => {
      if (fs.readFileSync(path.join(temp, 'backend-phases.jsonl'), 'utf8').includes('"case": "nativestreamb"')) return true;
      const status = await invoke('getStreamStatus', startedB.streamId);
      if (status.native_controls?.processExited) {
        log('actual_native_early_failure', { streamId: startedB.streamId, nativeControls: status.native_controls,
          ...Object.fromEntries(['error', 'errorCode', 'reasonCode', 'state', 'status'].filter(key => status[key] !== undefined).map(key => [key, status[key]])) });
        throw new Error('Actual native B worker exited before the controlled SDK provider');
      }
      return false;
    }, 'actual B SDK waiting', 75000);
    await shell.webContents.executeJavaScript('window.currentUiProfile="stream-browser-b"');
    const statusA = await invoke('getStreamStatus', startedA.streamId); assert.equal(statusA.native_controls.profileName, 'default');
    const rawStatus = info.apiUrl + '/api/chat/stream/status?stream_id=' + startedA.streamId;
    assert.equal((await fetch(rawStatus)).status, 403);
    assert.equal((await fetch(rawStatus, { headers: api.nativeChatReadHeaders({ profile: 'other', nativeBridgeNonce: nonce }) })).status, 403);
    assert.equal((await fetch(info.apiUrl + '/api/chat/read-context', { method: 'POST', headers: { ...api.nativeChatReadHeaders({ profile: 'default', nativeBridgeNonce: nonce }), 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: startedA.sessionId, stream_id: startedA.streamId, space_scope: b.scope }) })).status, 403);
    await assert.rejects(invoke('subscribeChatStream', { streamId: startedA.streamId, profile: 'other' }));
    log('actual_original_profile_reader', { uiProfile: 'other', streamProfile: statusA.native_controls.profileName, originalScope: true, rawAndForeignHttpDenied: true });
    guest = new BrowserWindow({ show: false, webPreferences: { preload: path.join(temp, 'preload.cjs'), contextIsolation: true, sandbox: true } });
    await guest.loadURL('app://bundle/index.html'); const callsBefore = readCalls;
    await assert.rejects(invoke('subscribeChatStream', { streamId: startedA.streamId }, guest.webContents));
    const subframe = shell.webContents.mainFrame.frames[0]; assert(subframe);
    await assert.rejects(readers.status({ sender: shell.webContents, senderFrame: subframe }, startedA.streamId));
    assert.equal(readCalls, callsBefore); guest.destroy(); guest = null;
    await invoke('unsubscribeChatStream', { streamId: startedA.streamId });
    assert.equal((await invoke('getStreamStatus', startedA.streamId)).native_controls.processExited, false);
    await shell.reload(); await until(() => !shell.webContents.isLoading(), 'actual shell reload'); await listen();
    readers.close(); readers = createReaders();
    await assert.rejects(invoke('getStreamStatus', startedA.streamId));
    const recovered = await invoke('getSession', { sessionId: startedA.sessionId, profile: 'stream-browser-a', workspacePath: info.workspaceA });
    assert.deepEqual(recovered.session.space_scope, a.scope); assert.equal(recovered.session.active_stream_id, startedA.streamId);
    await invoke('subscribeChatStream', { streamId: startedA.streamId });
    log('actual_reload_recovery', { originalProfile: 'default', rehydratedFromSavedSessionAndRegistry: true,
      guestAndSubframeReadCalls: 0, disconnectedReaderDidNotStopWorker: true });
    await fetch(info.origin + '/fixture/release', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ case: 'nativestreama' }) });
    await until(async () => (await invoke('getStreamStatus', startedA.streamId)).native_controls.processExited === true, 'actual A process exit');
    await until(() => nativeEvents.some(row => row.streamId === startedA.streamId && row.processExited === true), 'actual SSE process exit ACK');
    assert(nativeEvents.some(row => row.streamId === startedA.streamId && row.processExited === false));
    const finalSession = await invoke('getSession', { sessionId: startedA.sessionId, profile: 'stream-browser-a', workspacePath: info.workspaceA });
    assert(finalSession.session.messages.some(message => message.role === 'assistant' && message.content.includes('Controlled native original-profile answer A')));
    const recoveredB = await invoke('getSession', { sessionId: startedB.sessionId, profile: 'stream-browser-b', workspacePath: info.workspaceB });
    assert.deepEqual(recoveredB.session.space_scope, b.scope); assert.equal(recoveredB.session.active_stream_id, startedB.streamId);
    const bBefore = await invoke('getStreamStatus', startedB.streamId); assert.equal(bBefore.native_controls.processExited, false);
    await invoke('subscribeChatStream', { streamId: startedB.streamId });
    await fetch(info.origin + '/fixture/release', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ case: 'nativestreamb' }) });
    await until(async () => (await invoke('getStreamStatus', startedB.streamId)).native_controls.processExited === true, 'actual B process exit');
    const finalB = await invoke('getSession', { sessionId: startedB.sessionId, profile: 'stream-browser-b', workspacePath: info.workspaceB });
    assert(finalB.session.messages.some(message => message.role === 'assistant' && message.content.includes('Controlled native original-profile answer B')));
    const received = await shell.webContents.executeJavaScript('window.streamEvidence');
    const currentA = await invoke('getStreamStatus', startedA.streamId), currentB = await invoke('getStreamStatus', startedB.streamId);
    for (const [started, selected, current] of [[startedA, a, currentA], [startedB, b, currentB]]) {
      const events = received.filter(event => event.streamId === started.streamId); assert(events.length > 0);
      for (const event of events) assert.deepEqual(event.nativeContext, { schemaVersion: 1, scope: selected.scope,
        sessionId: started.sessionId, streamId: started.streamId, writerGeneration: current.native_controls.writerGeneration });
    }
    log('actual_native_stream_final', { earlyTerminalKeptOpen: true, actualExitAck: true, savedResultsAandB: true,
      profileBUnchangedDuringA: true, rendererVerifiedReaderContext: true,
      noBrowserHost: independent.host === undefined, visibleWindows: BaseWindow.getAllWindows().filter(window => window.isVisible()).length });
    if (flags.nativeGrillProbe) {
      const purpose = { sessionId: startedA.sessionId, profile: 'stream-browser-a', workspacePath: info.workspaceA };
      const beforeMode = await invoke('chatMode', { ...purpose, action: 'get' });
      const selectedMode = await invoke('chatMode', { ...purpose, action: 'set', mode: 'grill_me', lifetime: 'chat',
        expectedRevision: beforeMode.mode.revision, clientRequestId: randomUUID() });
      assert.equal(selectedMode.mode.mode, 'grill_me');
      const startedGrill = await invoke('grill', { ...purpose, action: 'start', expectedRevision: 0, clientRequestId: randomUUID(),
        objective: 'Controlled clarification', topics: [{ id: 'audience', label: 'Audience' }] });
      assert.equal(startedGrill.grill.status, 'asking');
      const grillTurn = await invoke('startChat', { ...purpose, workspace: info.workspaceA, message: 'PIPELINE:nativegrill' });
      await invoke('subscribeChatStream', { streamId: grillTurn.streamId });
      await until(async () => (await invoke('getStreamStatus', grillTurn.streamId)).native_controls.processExited === true, 'actual structured Grill exit', 75000);
      const questionSession = await invoke('getSession', purpose), state = questionSession.session.grill_state;
      assert.equal(state.questions.length, 1); const question = state.questions[0];
      assert.equal(question.prompt, 'Who will use the browser?'); assert.equal(question.options.length, 3); assert.equal(question.allowFreeText, true);
      const visible = questionSession.session.messages.findLast(message => message.role === 'assistant');
      assert.equal(visible.content, question.prompt); assert.equal(visible.grill_question.questionId, question.questionId);
      const questionEvents = (await shell.webContents.executeJavaScript('window.streamEvidence')).filter(event => event.streamId === grillTurn.streamId);
      assert(questionEvents.some(event => event.event === 'grill' && event.data.grill.questions[0].questionId === question.questionId));
      assert.equal(questionEvents.filter(event => ['token', 'delta'].includes(event.event)).length, 0);
      const answer = { ...purpose, action: 'answer', expectedRevision: state.revision, questionId: question.questionId,
        questionRevision: question.revision, text: 'Controlled equal free text answer', clientRequestId: randomUUID() };
      const answered = await invoke('grill', answer), replay = await invoke('grill', answer);
      assert.equal(replay.replayed, true); assert.equal(replay.grill.revision, answered.grill.revision);
      await assert.rejects(invoke('grill', { ...answer, text: 'Changed payload with the same request identity' }));
      const fallback = await invoke('startChat', { ...purpose, workspace: info.workspaceA, message: 'PIPELINE:nativegrillfallback' });
      await invoke('subscribeChatStream', { streamId: fallback.streamId });
      await until(async () => (await invoke('getStreamStatus', fallback.streamId)).native_controls.processExited === true, 'actual manual Grill fallback exit', 75000);
      const fallbackEvents = (await shell.webContents.executeJavaScript('window.streamEvidence')).filter(event => event.streamId === fallback.streamId);
      assert(fallbackEvents.some(event => event.event === 'grill_fallback' && event.data.reason === 'invalid_structured_question'));
      const fallbackSession = await invoke('getSession', purpose);
      assert.equal(fallbackSession.session.grill_state.questions.length, 1);
      assert.equal(fallbackSession.session.messages.findLast(message => message.role === 'assistant').content, 'Controlled manual clarification fallback.');
      await shell.reload(); await until(() => !shell.webContents.isLoading(), 'actual Grill document reload');
      const reloaded = await invoke('getSession', purpose);
      assert.equal(reloaded.session.grill_state.questions[0].answer.text, answer.text);
      const reviewed = await invoke('grill', { ...purpose, action: 'review', expectedRevision: reloaded.session.grill_state.revision, clientRequestId: randomUUID() });
      const finished = await invoke('grill', { ...purpose, action: 'finish', expectedRevision: reviewed.grill.revision, clientRequestId: randomUUID() });
      assert.equal(finished.grill.status, 'finished');
      const unchangedB = await invoke('getSession', { sessionId: startedB.sessionId, profile: 'stream-browser-b', workspacePath: info.workspaceB });
      assert.deepEqual(unchangedB.session.messages, finalB.session.messages);
      log('actual_native_grill_final', { structuredSdkQuestionPersisted: true, readableDisplay: true, partialJsonTokens: 0,
        options: 3, equalFreeText: true, idempotentAnswer: true, changedPayloadDenied: true,
        fallbackPersisted: true, actualReloadRecovered: true, explicitReviewFinish: true, otherProfileUnchanged: true });
    }
    readers.close(); await independent.shutdown(); shell.destroy(); clearTimeout(watchdog); assert.equal(BaseWindow.getAllWindows().length, 0);
    log('child:passed', { windows: 0 }); app.exit(0);
  } catch (error) {
    log('child:failed', { message: error.message, stack: error.stack }); readers?.close(); try { await independent?.shutdown(); } catch {}
    try { guest?.destroy(); shell?.destroy(); } catch {} clearTimeout(watchdog); app.exit(1);
  }
}
if (process.argv.includes('--electron-child')) child(process.argv.at(-1)); else parent().catch(error => { console.error(error.stack); process.exitCode = 1; });
