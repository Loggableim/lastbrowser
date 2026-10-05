#!/usr/bin/env node
/** Real source Main -> SidecarServices/shipped Python -> genuine preload/App.
 * No transport/router/SDK mocks, no user's paths or protocol registration.
 * Only the network/write deny guards and default-browser safety seam are tests.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { randomUUID, createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const phase = (name, fields = {}) => console.log('[backend-profile-ui] ' + JSON.stringify({ phase: name, at: new Date().toISOString(), ...fields }));
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function command(exe, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; for (const pipe of [child.stdout, child.stderr]) pipe.on('data', bytes => { output += bytes; });
    child.once('error', reject); child.once('close', code => code === 0 ? resolve(output) : reject(Error('build_failed:' + code + ':' + output.slice(-4500))));
  });
}
function cleanupOwned(directory, parent, prefix) {
  const absolute = path.resolve(directory), base = path.resolve(parent) + path.sep;
  if (!absolute.startsWith(base) || !path.basename(absolute).startsWith(prefix)) throw Error('unsafe_probe_cleanup');
  fs.rmSync(absolute, { recursive: true, force: true });
}
async function parent() {
  const id = randomUUID(), desktop = path.join(root, 'apps', 'desktop');
  const spaceSwitchProbe = process.argv.includes('--space-switch');
  const backendCrashProbe = process.argv.includes('--backend-crash');
  const mainCrashProbe = process.argv.includes('--main-crash');
  const interviewProbe = process.argv.includes('--interview');
  const profileSwitchProbe = process.argv.includes('--profile-switch');
  const backendProfileProbe = process.argv.includes('--backend-profile-switch');
  const browserProbe = process.argv.includes('--browser') || spaceSwitchProbe || backendCrashProbe || profileSwitchProbe || mainCrashProbe;
  const delegationProbe = process.argv.includes('--delegation') || browserProbe;
  const previewIndex = process.argv.indexOf('--preview');
  const preview = previewIndex < 0 ? null : fs.realpathSync(path.resolve(process.argv[previewIndex + 1] || ''));
  let packagedResources = null;
  if (preview) {
    assert(preview.startsWith(fs.realpathSync(path.join(root, 'output')) + path.sep), 'Preview must be an owned output');
    const receipt = JSON.parse(fs.readFileSync(path.join(preview, 'preview-result.json'), 'utf8'));
    assert.equal(receipt.unsigned, true); assert.equal(receipt.published, false);
    assert(receipt.resourceFiles > 0 && !receipt.error);
    packagedResources = path.join(preview, 'win-unpacked', 'resources');
    assert(fs.existsSync(path.join(packagedResources, 'app.asar')));
    assert(fs.existsSync(path.join(packagedResources, 'runtime', 'python', 'python.exe')));
  }
  const buildRoot = path.join(root, 'out', 'backend-profile-ui-' + id);
  const owned = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-backend-profile-ui-'));
  fs.mkdirSync(buildRoot, { recursive: true });
  fs.writeFileSync(path.join(buildRoot, 'package.json'), JSON.stringify({ type: 'module' }));
  const report = { schemaVersion: 1, startedAt: new Date().toISOString(), ownUserData: owned,
    sourceMain: digest(path.join(desktop, 'src', 'main', 'main.ts')), sourcePreload: digest(path.join(desktop, 'src', 'main', 'preload.ts')),
    sourceApp: digest(path.join(desktop, 'src', 'renderer', 'App.tsx')), sourceServices: digest(path.join(desktop, 'src', 'main', 'services.ts')),
    providerCalls: 0, backendProfileCalls: [], deniedProxyRequests: [], phases: [], childExit: null, cleanup: false,
    packagedResources, packagedExecutableStarted: false,
    limits: [preview ? 'Actual ASAR/backend/Python under installed Electron with packaged-path safety seam; no direct preview EXE startup or signing validation' : 'Source build; no signed/package/release validation', 'Controlled loopback SDK responses; no model-quality or external account claim',
      'Default protocol status forced true only for test safety; no OS registration tested'] };
  const sockets = new Set(), heldReplies = new Set();
  let delegatedRequests = 0, releasedDelegation = false, releasedAlpha = false;
  const heldAlphaReplies = new Set();
  const fixture = http.createServer((request, response) => {
    if (request.url === '/fixture/browser-page') {
      report.browserPageRequests = (report.browserPageRequests || 0) + 1;
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<!doctype html><title>Controlled browser work</title><body style="background:#234;color:white"><h1>Original delegated browser page</h1></body>'); return;
    }
    if (request.url === '/fixture/delegation-state') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ delegatedRequests, releasedDelegation })); return;
    }
    if (backendProfileProbe && request.url === '/fixture/backend-profile-state') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ calls: report.backendProfileCalls, releasedAlpha })); return;
    }
    if (request.url === '/fixture/release-delegation' && request.method === 'POST') {
      releasedDelegation = true;
      for (const finish of heldReplies) finish(); heldReplies.clear();
      response.writeHead(200); response.end('{}'); return;
    }
    if (request.method === 'CONNECT' || /^https?:/.test(request.url)) {
      report.deniedProxyRequests.push({ method: request.method, host: (() => { try { return new URL(request.url).hostname; } catch { return 'unknown'; } })() });
      response.writeHead(403); response.end(); return;
    }
    const requestPath = new URL(request.url, 'http://127.0.0.1').pathname;
    if (/^\/(?:default|alpha|beta)\/v1\/models$/.test(requestPath) || requestPath === '/v1/models') {
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ data: [{ id: 'backend-profile-ui-model', context_length: 64000 }] })); return;
    }
    if (backendProfileProbe && requestPath === '/fixture/release-alpha' && request.method === 'POST') {
      releasedAlpha = true; for (const finish of heldAlphaReplies) finish(); heldAlphaReplies.clear();
      response.writeHead(200); response.end('{}'); return;
    }
    if (backendProfileProbe && /^\/(?:alpha|beta)\/v1\/chat\/completions$/.test(requestPath)) {
      let raw = ''; request.on('data', bytes => { raw += bytes; }); request.on('end', () => {
        const input = JSON.parse(raw), profile = requestPath.startsWith('/alpha/') ? 'alpha' : 'beta';
        const userText = (input.messages || []).filter(item => item.role === 'user').map(item => String(item.content)).join('\n');
        const systemText = (input.messages || []).filter(item => item.role === 'system').map(item => String(item.content)).join('\n');
        const structuredReplyRequested = (input.messages || []).some(item => String(item.content).includes('Reply ONLY with JSON conforming to this schema:'));
        report.backendProfileCalls.push({ profile, model: input.model,
          promptMarker: userText.includes('ALPHA-ORIGINAL') ? 'ALPHA-ORIGINAL' : userText.includes('BETA-ISOLATED') ? 'BETA-ISOLATED' : 'other' });
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        const chunk = (text, finish = null) => response.write('data: ' + JSON.stringify({ id: profile + '-controlled', object: 'chat.completion.chunk', created: 1, model: input.model,
          choices: [{ index: 0, delta: text ? { content: text } : {}, finish_reason: finish }] }) + '\n\n');
        const expectedSchema = systemText.match(/Reply ONLY with JSON conforming to this schema:\s*(\{[\s\S]*?\})\s*\nA task proposal/);
        const responseText = JSON.stringify({ message: profile === 'alpha' ? 'Alpha isolated response.' : 'Beta isolated response.' });
        report.backendProfileCalls.at(-1).structuredSchemaRequested = structuredReplyRequested;
        report.backendProfileCalls.at(-1).expectedSchemaParsed = Boolean(expectedSchema);
        const finish = () => { if (response.destroyed) return; chunk(responseText); chunk(null, 'stop'); response.end('data: [DONE]\n\n'); };
        if (profile === 'alpha' && !releasedAlpha) heldAlphaReplies.add(finish); else finish();
        response.once('close', () => heldAlphaReplies.delete(finish));
      }); return;
    }
    if (requestPath === '/v1/chat/completions' || requestPath === '/default/v1/chat/completions') {
      let raw = ''; request.on('data', bytes => { raw += bytes; }); request.on('end', () => {
        const input = JSON.parse(raw); report.providerCalls++;
        const text = input.messages.filter(item => item.role === 'user').map(item => String(item.content)).join('\n');
        const assistant = text.includes('HUMAN MESSAGE:') && text.includes('Reply ONLY with JSON conforming');
        const cases = [...text.matchAll(/FULLAPP:(\w+)/g)].map(item => item[1]);
        const task = delegationProbe && cases.at(-1) === 'delegated';
        const interviewing = interviewProbe && text.includes('Current interview:');
        if (interviewProbe && !assistant && !interviewing && input.messages.some(row =>
          typeof row.content === 'string' && row.content.includes('Controlled personal research preferences'))) report.confirmedProfileInNativePrompt = true;
        const interviewRevision = interviewing ? Number(text.split('Current interview:').at(-1).match(/"revision"\s*:\s*(\d+)/)?.[1]) : null;
        if (interviewing) report.interviewRequests = (report.interviewRequests || 0) + 1;
        const content = JSON.stringify(interviewing && report.interviewRequests === 1 ? {
          schemaVersion: 1, kind: 'question', basedOnRevision: interviewRevision, topic: 'help',
          prompt: 'Controlled adaptive interview: what should this Space help with?',
          options: [{ id: 'research', label: 'Research' }, { id: 'writing', label: 'Writing' }, { id: 'planning', label: 'Planning' }],
          allowFreeText: true, selection: 'single', profilePatch: {}, understood: []
        } : task && assistant ? { message: 'Full app controlled task delegated.',
          task: { kind: 'start_chat', title: 'Controlled full app delegated task',
            instruction: 'Execute FULLAPP:delegated', desired_result: 'Controlled durable answer' } }
          : { message: 'Full app controlled assistant reply.' });
        if (!input.stream) { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ id: 'controlled', object: 'chat.completion', created: 1, model: 'backend-profile-ui-model', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 8, completion_tokens: 8, total_tokens: 16 } })); return; }
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        if (task && !assistant) {
          if (browserProbe && !input.messages.some(row => row.role === 'tool')) {
            const url = 'http://127.0.0.1:' + fixture.address().port + '/fixture/browser-page';
            report.browserToolAdvertised = input.tools?.some(row => row.function?.name === 'independent_browser_navigate') === true;
            for (const delta of [{ role: 'assistant', tool_calls: [{ index: 0, id: 'controlled-browser-navigation', type: 'function',
              function: { name: 'independent_browser_navigate', arguments: JSON.stringify({ url }) } }] }, {}]) {
              response.write('data: ' + JSON.stringify({ id: 'browser-tool', object: 'chat.completion.chunk', created: 1,
                model: 'backend-profile-ui-model', choices: [{ index: 0, delta, finish_reason: Object.keys(delta).length ? null : 'tool_calls' }] }) + '\n\n');
            }
            response.end('data: [DONE]\n\n'); return;
          }
          delegatedRequests++;
          const chunk = (text, finish = null) => response.write('data: ' + JSON.stringify({ id: 'delegated',
            object: 'chat.completion.chunk', created: 1, model: 'backend-profile-ui-model',
            choices: [{ index: 0, delta: text ? { content: text } : {}, finish_reason: finish }] }) + '\n\n');
          chunk('Controlled delegated work is active. ');
          const finish = () => { if (response.destroyed) return;
            chunk('Controlled delegated work completed.'); chunk(null, 'stop'); response.end('data: [DONE]\n\n'); };
          if (releasedDelegation) finish(); else heldReplies.add(finish);
          response.once('close', () => heldReplies.delete(finish)); return;
        }
        for (const delta of [{ role: 'assistant', content }, {}]) response.write('data: ' + JSON.stringify({ id: 'controlled', object: 'chat.completion.chunk', created: 1, model: 'backend-profile-ui-model', choices: [{ index: 0, delta, finish_reason: Object.keys(delta).length ? null : 'stop' }], usage: { prompt_tokens: 8, completion_tokens: 8, total_tokens: 16 } }) + '\n\n');
        response.end('data: [DONE]\n\n');
      }); return;
    }
    response.writeHead(404); response.end();
  });
  fixture.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  fixture.on('connect', (request, socket) => { report.deniedProxyRequests.push({ method: 'CONNECT', host: request.url.split(':')[0] }); socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + fixture.address().port;
  try {
    if (!preview) {
    phase('fresh_build');
    await command(process.execPath, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', path.join(desktop, 'tsconfig.main.json'), '--outDir', path.join(buildRoot, 'main')], root);
    await require('esbuild').build({ entryPoints: [path.join(desktop, 'src', 'main', 'preload.ts')], outfile: path.join(buildRoot, 'main', 'preload.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node20', external: ['electron'] });
    await command(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', path.join(desktop, 'vite.config.ts'), '--outDir', path.join(buildRoot, 'renderer')], desktop);
    } else {
      report.packagedAsarSha256 = digest(path.join(packagedResources, 'app.asar'));
      phase('actual_packaged_resources', { packagedResources, asarSha256: report.packagedAsarSha256 });
    }
    const userData = path.join(owned, 'user-data'), runtime = path.join(userData, 'runtime'), workspace = path.join(owned, 'workspace'),
      otherWorkspace = path.join(owned, 'other-workspace');
    for (const directory of [userData, runtime, workspace, otherWorkspace, path.join(runtime, 'webui'), path.join(owned, 'guard'), path.join(owned, 'user-home'), path.join(owned, 'app-data'), path.join(owned, 'tmp')]) fs.mkdirSync(directory, { recursive: true });
    fs.copyFileSync(path.join(root, 'scripts', 'probe-full-app-network-guard.py'), path.join(owned, 'guard', 'sitecustomize.py'));
    const config = { workspace, ...(browserProbe ? { platform_toolsets: { cli: ['browser', 'file'] } } : {}),
      model: { provider: 'custom:full-app', default: 'backend-profile-ui-model', base_url: origin + '/v1', api_key: 'synthetic-controlled-local', context_length: 64000 },
      custom_providers: [{ name: 'full-app', base_url: origin + '/v1', api_key: 'synthetic-controlled-local', models: { 'backend-profile-ui-model': { context_length: 64000 } } }] };
    fs.writeFileSync(path.join(runtime, 'config.yaml'), JSON.stringify(config)); // JSON is a valid YAML document.
    fs.writeFileSync(path.join(runtime, '.env'), `HTTP_PROXY=${origin}\nHTTPS_PROXY=${origin}\nALL_PROXY=${origin}\nNO_PROXY=localhost,127.0.0.1\n`);
    fs.writeFileSync(path.join(runtime, 'webui', 'workspaces.json'), JSON.stringify([{ name: 'Controlled app workspace', path: workspace },
      ...(spaceSwitchProbe ? [{ name: 'Other controlled workspace', path: otherWorkspace }] : [])]));
    fs.writeFileSync(path.join(owned, 'bootstrap.json'), JSON.stringify({ buildRoot: preview ? path.join(packagedResources, 'app.asar', 'dist') : buildRoot,
      packagedResources, userData, runtime, workspace, otherWorkspace, origin, delegationProbe, browserProbe, spaceSwitchProbe, backendCrashProbe, interviewProbe, profileSwitchProbe, backendProfileProbe, mainCrashProbe }));
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)$/i.test(key) || /^(?:SIDEKICK|HERMES|LASTBROWSER)_/.test(key) || ['ELECTRON_RUN_AS_NODE', 'PYTHONPATH', 'PYTHONHOME'].includes(key)) delete env[key];
    Object.assign(env, { LASTBROWSER_BACKEND_PROFILE_UI_PROBE_ROOT: owned, LASTBROWSER_FULL_APP_PROBE_ROOT: owned, LASTBROWSER_WEBUI_PYTHON: preview ? path.join(packagedResources, 'runtime', 'python', 'python.exe') : path.join(desktop, 'runtime', 'python', 'python.exe'),
      LASTBROWSER_DOWNLOADS_DIR: path.join(owned, 'downloads'), LASTBROWSER_ENABLE_CDP: '0', PYTHONPATH: path.join(owned, 'guard'),
      PYTHONDONTWRITEBYTECODE: '1', PYTHONNOUSERSITE: '1', PYTHONUNBUFFERED: '1', SIDEKICK_BASE_HOME: runtime,
      SIDEKICK_WEBUI_DEFAULT_WORKSPACE: workspace, USERPROFILE: path.join(owned, 'user-home'), APPDATA: path.join(owned, 'app-data'),
      TEMP: path.join(owned, 'tmp'), TMP: path.join(owned, 'tmp'),
      LOCALAPPDATA: path.join(owned, 'local-app-data'), GH_CONFIG_DIR: path.join(owned, 'empty-gh'), HTTP_PROXY: origin, HTTPS_PROXY: origin, ALL_PROXY: origin, NO_PROXY: 'localhost,127.0.0.1' });
    if (mainCrashProbe) {
      const first = spawn(require('electron'), [__filename, '--electron-child', owned], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const closed = new Promise(resolve => first.once('close', (code, signal) => resolve({ code, signal })));
      let initialLog = ''; first.stdout.on('data', bytes => { initialLog += bytes; }); first.stderr.on('data', bytes => { initialLog += bytes; });
      const handoffFile = path.join(owned, 'main-crash-handoff.json');
      const deadline = Date.now() + 180000;
      while (!fs.existsSync(handoffFile) && first.exitCode === null && first.signalCode === null && Date.now() < deadline) await sleep(150);
      if (!fs.existsSync(handoffFile)) { first.kill(); await closed; throw Error('main_crash_handoff_missing:' + initialLog.slice(-2000)); }
      const handoff = JSON.parse(fs.readFileSync(handoffFile, 'utf8'));
      assert.equal(handoff.mainPid, first.pid);
      first.kill('SIGKILL'); report.mainCrashExit = await closed;
      const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
      await sleep(2500);
      report.orphanedOwnedChildrenAfterMainCrash = handoff.childPids.filter(alive);
      // Only PIDs captured from this exact test Main's spawn calls. Preserve
      // the observation; explicit test cleanup is not automatic orphan cleanup.
      for (const pid of report.orphanedOwnedChildrenAfterMainCrash) { try { process.kill(pid, 'SIGKILL'); } catch {} }
      for (let count = 0; count < 40 && handoff.childPids.some(alive); count++) await sleep(150);
      assert.deepEqual(handoff.childPids.filter(alive), [], 'Owned old children stopped before restart');
      report.mainCrashHandoff = handoff;
      phase('actual_main_crashed', { exit: report.mainCrashExit, orphanedOwnedChildren: report.orphanedOwnedChildrenAfterMainCrash });
    }
    const child = spawn(require('electron'), [__filename, '--electron-child', owned], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const log = fs.createWriteStream(path.join(owned, 'app-run.log'));
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
    let lines = ''; child.stdout.on('data', bytes => { for (const line of (lines + bytes).split(/\r?\n/).slice(0, -1)) if (line.startsWith('[backend-profile-ui] ')) { const item = JSON.parse(line.slice('[backend-profile-ui] '.length)); report.phases.push(item); console.log(line); } lines = (lines + bytes).split(/\r?\n/).at(-1); });
    let timedOut = false; const timer = setTimeout(() => { timedOut = true; child.kill(); }, 260000);
    report.childExit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
    clearTimeout(timer); log.end();
    report.timedOut = timedOut;
    if (fs.existsSync(path.join(owned, 'child-report.json'))) report.actual = JSON.parse(fs.readFileSync(path.join(owned, 'child-report.json'), 'utf8'));
    const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
    const childPids = report.actual?.childPids ?? [];
    for (let count = 0; count < 40 && childPids.some(alive); count++) await sleep(150);
    report.remainingOwnedChildrenAfterExit = childPids.filter(alive);
    if (fs.existsSync(path.join(owned, 'python-audit.jsonl'))) report.pythonAudit = fs.readFileSync(path.join(owned, 'python-audit.jsonl'), 'utf8').trim().split(/\r?\n/).map(row => JSON.parse(row));
    if (report.childExit.code !== 0) { const tail = fs.readFileSync(path.join(owned, 'app-run.log'), 'utf8').split(/\r?\n/).slice(-45).join('\n'); phase('app_log_failure', { tail }); throw Error('full_app_failed:' + JSON.stringify(report.childExit)); }
    assert(report.actual?.passed); assert.equal(report.deniedProxyRequests.length, 0, 'no SDK/external proxy attempt');
    if (interviewProbe) assert(report.confirmedProfileInNativePrompt, 'Confirmed Space preferences reach the new native chat SDK prompt');
    if (backendProfileProbe) {
      const test = report.actual.backendProfileTest;
      assert(test?.passed, 'actual backend-profile UI sequence passed');
      assert.equal(test.profileBindings.alpha.backendProfileName, 'alpha');
      assert.equal(test.profileBindings.beta.backendProfileName, 'beta');
      assert.equal(test.alphaHeldDuringBeta, true);
      assert.equal(test.betaReplyVisibleOnlyInBeta, true);
      assert.equal(test.alphaReplyVisibleOnlyInAlpha, true);
      assert.equal(test.providerCalls.alpha, 1);
      assert.equal(test.providerCalls.beta, 1);
    }
    if (browserProbe) {
      assert(report.browserToolAdvertised, 'Actual independent browser tool advertised');
      assert(report.browserPageRequests > 0, 'Actual independent browser requested the controlled local page');
      if (mainCrashProbe) {
        assert.equal(report.actual.mainCrash?.recoveredState, 'interrupted');
        assert.equal(report.actual.mainCrash?.delegatedRequests, 1);
      } else if (backendCrashProbe) {
        assert.equal(report.actual.backendCrash?.recoveredState, 'interrupted');
        assert.equal(report.actual.backendCrash?.delegatedRequests, 1);
      } else assert(report.actual.browserTask?.actualTakeover && report.actual.browserTask?.screenshotLoaded);
    }
    assert.deepEqual(report.remainingOwnedChildrenAfterExit, [], 'real Sidecar terminated after Main quit');
    assert(report.pythonAudit?.some(row => row.event === 'bootstrap' && row.sidekickHome === runtime && row.stateHome === path.join(runtime, 'webui')));
    assert.equal(report.pythonAudit.filter(row => row.event === 'denied_write').length, 0);
    phase('backend_profile_app_passed', { providerCalls: report.backendProfileCalls, shellReloads: report.actual.shellReloads,
      nativeDialogs: report.actual.nativeDialogs.length, hardwareHelpers: report.actual.hardwareHelpers,
      remainingOwnedChildren: report.remainingOwnedChildrenAfterExit.length, guestAuthorityRejected: report.actual.guestAuthorityRejected });
  } finally {
    for (const socket of sockets) socket.destroy(); await new Promise(resolve => fixture.close(resolve));
    for (let attempt = 0; attempt < 10; attempt++) { try { cleanupOwned(owned, os.tmpdir(), 'lastbrowser-backend-profile-ui-'); report.cleanup = true; break; } catch (error) { if (attempt === 9) report.cleanupError = error.message; else await sleep(400); } }
    cleanupOwned(buildRoot, path.join(root, 'out'), 'backend-profile-ui-');
    report.finishedAt = new Date().toISOString(); const reportPath = path.join(root, 'output', 'backend-profile-ui-' + id + '.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true }); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    phase('finished', { report: reportPath, cleanup: report.cleanup, childExit: report.childExit });
  }
}

async function electronChild() {
  const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
  const owned = path.resolve(process.argv[process.argv.indexOf('--electron-child') + 1]);
  assert.equal(owned, process.env.LASTBROWSER_BACKEND_PROFILE_UI_PROBE_ROOT);
  const info = JSON.parse(fs.readFileSync(path.join(owned, 'bootstrap.json'), 'utf8'));
  const result = { passed: false, shellReloads: 0, nativeDialogs: [], registered: [], externalMainAttempts: [], childPids: [], sourceBoot: !info.packagedResources,
    packagedResources: info.packagedResources, packagedExecutableStarted: false, hardwareHelpers: 0, nativeReadRequests: 0 };
  if (info.packagedResources) {
    Object.defineProperty(app, 'isPackaged', { value: true });
    Object.defineProperty(process, 'resourcesPath', { value: info.packagedResources });
    app.getAppPath = () => path.join(info.packagedResources, 'app.asar');
  }
  app.setPath('userData', info.userData); app.setPath('sessionData', path.join(info.userData, 'session'));
  app.setPath('home', path.join(owned, 'user-home')); app.setPath('appData', path.join(owned, 'app-data'));
  app.isDefaultProtocolClient = () => true; // Existing screenshot safety seam.
  app.setAsDefaultProtocolClient = () => { throw Error('probe_os_registration_denied'); };
  app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost');
  const browserUiResults = [];
  result.resolveScopeCalls = [];
  const handle = ipcMain.handle.bind(ipcMain); ipcMain.handle = (name, listener) => {
    result.registered.push(name);
    return handle(name, async (event, ...args) => {
      const reply = await listener(event, ...args);
      if (name === 'lastbrowser:independent:request' && ['openNativeBrowser', 'takeoverNativeBrowser', 'openBrowser', 'takeover', 'resumeBrowser'].includes(args[0]?.operation)) {
        browserUiResults.push({ operation: args[0].operation, reply });
      }
      if (name === 'lastbrowser:independent:request' && args[0]?.operation === 'resolveScope') {
        result.resolveScopeCalls.push({ requestedBackendProfileName: args[0]?.backendProfileName ?? null,
          browserProfileId: args[0]?.payload?.browserProfileId ?? null, workspacePath: args[0]?.payload?.workspacePath ?? null,
          ok: reply?.ok === true, backendProfileName: reply?.value?.backendProfileName ?? null,
          scope: reply?.value?.scope ?? null, error: reply?.ok === false ? reply.error?.message ?? 'unknown' : null });
      }
      return reply;
    });
  };
  for (const name of ['showErrorBox', 'showMessageBox', 'showMessageBoxSync']) {
    dialog[name] = (...args) => { result.nativeDialogs.push({ name, title: typeof args[0] === 'string' ? args[0] : args.at(-1)?.title ?? 'unknown' }); throw Error('unexpected_native_dialog'); };
  }
  const childProcess = require('node:child_process'), originalSpawn = childProcess.spawn;
  const children = [], spawnRecords = [];
  childProcess.spawn = (exe, args, options) => {
    const task = originalSpawn(exe, args, options); children.push(task); if (task.pid) result.childPids.push(task.pid);
    spawnRecords.push({ task, exe, args: [...(args || [])], cwd: options?.cwd });
    if (typeof exe === 'string' && path.resolve(exe) === path.resolve(process.execPath)) result.hardwareHelpers++;
    return task;
  };
  const originalFetch = globalThis.fetch;
  const allowed = raw => { try { return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(raw).hostname); } catch { return false; } };
  globalThis.fetch = (input, ...args) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    if (!allowed(url)) { result.externalMainAttempts.push({ transport: 'fetch', host: new URL(url).hostname }); return Promise.reject(Error('probe_nonlocal_main_fetch_denied')); }
    if (/\/api\/chat\/(?:read-context|stream\/status)/.test(new URL(url).pathname)) result.nativeReadRequests++;
    return originalFetch(input, ...args);
  };
  require('node:module').syncBuiltinESMExports();
  let window; let driverTimer;
  const run = expression => window.webContents.executeJavaScript(expression, true);
  const inspectProfileFixture = async () => JSON.parse(await fs.promises.readFile(path.join(info.owned, 'backend-profile-state.json'), 'utf8').catch(() => 'null'));
  const until = async (check, label, ms = 30000) => { const deadline = Date.now() + ms; while (Date.now() < deadline) { try { if (await check()) return; } catch {} await sleep(125); } throw Error('timeout:' + label); };
  app.on('browser-window-created', (_event, created) => { created.webContents.on('console-message', (_event, level, message) => { if (level >= 2) phase('renderer_warning', { level, message: String(message).slice(0, 500) }); }); });
  const end = async () => {
    result.openWindowsBeforeQuit = BrowserWindow.getAllWindows().length;
    fs.writeFileSync(path.join(owned, 'child-report.json'), JSON.stringify(result, null, 2));
    if (driverTimer) clearTimeout(driverTimer);
    phase('request_actual_app_quit', { children: children.length, passed: result.passed });
    app.quit();
    setTimeout(() => { for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill(); app.exit(result.passed ? 0 : 1); }, 17000).unref();
  };
  app.once('will-quit', () => {
    result.quitEvent = true; result.remainingOwnedChildren = children.filter(task => task.exitCode === null && task.signalCode === null).map(task => task.pid);
    fs.writeFileSync(path.join(owned, 'child-report.json'), JSON.stringify(result, null, 2));
  });
  try {
    driverTimer = setTimeout(() => { phase('child_watchdog'); void end(); }, 235000);
    await import(pathToFileURL(path.join(info.buildRoot, 'main', 'main.js')).href);
    await app.whenReady();
    await until(async () => { window = BrowserWindow.getAllWindows().find(item => !item.isDestroyed() && item.webContents.getURL().startsWith('app://')); return Boolean(window); }, 'genuine Main BrowserWindow');
    window.minimize();
    const recoveringMain = info.mainCrashProbe && fs.existsSync(path.join(owned, 'main-crash-handoff.json'));
    await until(() => run(recoveringMain ? "Boolean(document.querySelector('.app-shell'))" : "Boolean(document.querySelector('.app-shell')&&document.querySelector('.local-ai-setup'))"), 'actual App startup');
    await until(() => run("window.lastbrowser.services.status().then(s=>s.sidekick==='ready'&&s.webuiHealth==='ready')"), 'real uvicorn health', 65000);
    result.status = await run('window.lastbrowser.services.status()'); assert.equal(result.status.runtimeDir, path.join(info.userData, 'runtime'));
    const handoffFile = path.join(owned, 'main-crash-handoff.json');
    if (info.mainCrashProbe && fs.existsSync(handoffFile)) {
      const prior = JSON.parse(fs.readFileSync(handoffFile, 'utf8'));
      const request = async operation => {
        const reply = await run(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1, operation, scope: prior.scope, payload: {} })})`);
        assert(reply.ok); return reply.value;
      };
      let snapshot;
      await until(async () => { snapshot = await request('activity'); return snapshot.runs.some(row => row.runId === prior.runId && row.state === 'interrupted'); }, 'Original run recovered after real Main restart', 45000);
      const original = snapshot.runs.find(row => row.runId === prior.runId);
      assert.equal(original.targetSessionId, prior.targetSessionId);
      assert.equal(snapshot.dispatches.filter(row => row.dispatchId === prior.dispatchId).length, 1);
      await fetch(info.origin + '/fixture/release-delegation', { method: 'POST' });
      window.webContents.reload(); result.shellReloads++;
      await until(() => run('Boolean(window.lastbrowser&&document.querySelector(".app-shell"))'), 'Actual renderer after restarted Main');
      await sleep(2500);
      const fixtureState = await (await fetch(info.origin + '/fixture/delegation-state')).json();
      assert.equal(fixtureState.delegatedRequests, 1, 'No automatic SDK replay after Main crash');
      assert((await request('activity')).runs.some(row => row.runId === prior.runId && row.state === 'interrupted'));
      result.mainCrash = { scope: prior.scope, runId: prior.runId, targetSessionId: original.targetSessionId,
        recoveredState: original.state, dispatchCount: 1, delegatedRequests: fixtureState.delegatedRequests, rendererReloadSurvived: true };
      result.passed = true; phase('actual_main_crash_recovery_passed', result.mainCrash); await end(); return;
    }
    await until(() => run("Boolean(document.querySelector('.local-ai-hardware strong'))"), 'actual automatic hardware scan', 45000);
    result.firstLaunchHardware = await run("document.querySelector('.local-ai-hardware').innerText");
    result.firstLaunchDialog = await run("Boolean(document.querySelector('[role=dialog][aria-label=\"First-run setup\"]'))");
    assert(result.firstLaunchDialog); assert.equal(result.hardwareHelpers, 0, 'hardware detection uses Electron Main API; no temp Electron scripts');
    phase('first_launch_hardware', { shellMinimized: window.isMinimized(), hardwareHelpers: result.hardwareHelpers });
    window.webContents.reload(); result.shellReloads++;
    await until(() => run("Boolean(document.querySelector('.local-ai-hardware strong'))"), 'real First Launch after Renderer reload', 45000);
    await run("(()=>{const b=[...document.querySelectorAll('.first-run-setup button,button')].find(e=>/browse without|skip without|ohne ki|without ai/i.test(e.innerText+' '+e.getAttribute('aria-label')));if(!b)throw Error('skip missing');b.click();return true})()");
    await until(() => run("!document.querySelector('[role=dialog][aria-label=\"First-run setup\"]')"), 'first launch explicit skip');
    if (info.backendProfileProbe) {
      const alphaWorkspace = path.join(owned, 'space-alpha'), betaWorkspace = path.join(owned, 'space-beta');
      const create = async (name, endpoint) => {
        const created = await run(`window.lastbrowser.sidekick.createProfile(${JSON.stringify({ name, clone_from: 'default', clone_config: true,
          base_url: info.origin + '/' + name + '/v1', api_key: 'synthetic-' + name + '-local' })})`);
        assert(created && !created.error, 'real createProfile IPC succeeded for ' + name);
        const home = path.join(info.runtime, 'profiles', name), space = name === 'alpha' ? alphaWorkspace : betaWorkspace;
        fs.mkdirSync(space, { recursive: true });
        fs.mkdirSync(path.join(home, 'webui_state'), { recursive: true });
        fs.writeFileSync(path.join(home, 'webui_state', 'workspaces.json'), JSON.stringify([{ name: name === 'alpha' ? 'Alpha isolated space' : 'Beta isolated space', path: space }], null, 2));
      };
      await create('alpha', info.origin + '/alpha/v1');
      await create('beta', info.origin + '/beta/v1');
      const profileReply = await run(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1, operation: 'backendProfiles', payload: {} })})`);
      assert(profileReply.ok); const profileNames = profileReply.value.profiles.map(profile => profile.name);
      assert(profileNames.includes('alpha') && profileNames.includes('beta'), 'actual backend profile enumeration includes alpha and beta');
      result.backendProfileCreation = { names: ['alpha', 'beta'], workspacePaths: { alpha: alphaWorkspace, beta: betaWorkspace } };

      await run("(()=>{const b=document.querySelector('.copilot-toggle-btn');if(b&&!b.classList.contains('active'))b.click();return true})()");
      await until(() => run("Boolean(document.querySelector('.space-assistant'))"), 'actual scoped assistant open');
      const createSpace = async ({ name, profile, workspace }) => {
        if (!(await run("Boolean(document.querySelector('.expanded-workspace-pill'))"))) {
          await run("document.querySelector('.sidebar-toggle')?.click();true");
          await until(() => run("Boolean(document.querySelector('.sidekick-sidebar'))"), 'real sidebar toggle response');
          if (!(await run("Boolean(document.querySelector('.expanded-workspace-pill'))"))) {
            await run("document.querySelector('.nova-dock-btn.toggle-expand-btn')?.click();true");
          }
        }
        await until(() => run("Boolean(document.querySelector('.expanded-workspace-pill'))"), 'actual Space picker header');
        await run("document.querySelector('.expanded-workspace-pill').click();true");
        await until(() => run("Boolean(document.querySelector('.workspace-create-btn'))"), 'actual new Space button');
        await run("document.querySelector('.workspace-create-btn').click();true");
        await until(() => run("Boolean(document.querySelector('.space-setup-modal'))"), 'actual Space setup dialog');
        await until(() => run("Boolean(document.querySelector('#space-backend-profile-select option[value=\"alpha\"]')&&document.querySelector('#space-backend-profile-select option[value=\"beta\"]'))"), 'actual backend profile choices');
        const setup = await run(`(()=>{const set=(element,value,prototype)=>{Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));};const inputs=[...document.querySelectorAll('input.space-setup-input')];if(inputs.length<2)throw Error('Space name/path inputs missing');set(inputs[0],${JSON.stringify(name)},HTMLInputElement.prototype);set(inputs[1],${JSON.stringify(workspace)},HTMLInputElement.prototype);const select=document.querySelector('#space-backend-profile-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,${JSON.stringify(profile)});select.dispatchEvent(new Event('change',{bubbles:true}));return {name:inputs[0].value,path:inputs[1].value,profile:select.value}})()`);
        assert.equal(setup.name, name); assert.equal(setup.path, workspace); assert.equal(setup.profile, profile);
        await run("document.querySelector('.space-setup-modal-footer .space-btn.primary').click();true");
        await until(() => run("Boolean(document.querySelector('.space-model-item'))"), 'actual model selection step');
        await until(() => run("[...document.querySelectorAll('.space-model-item')].some(item=>item.innerText.includes('backend-profile-ui-model'))"), 'local fixture model selectable');
        await run("[...document.querySelectorAll('.space-model-item')].find(item=>item.innerText.includes('backend-profile-ui-model')).click();true");
        await run("document.querySelector('.space-setup-modal-footer .space-btn.primary').click();true");
        await until(() => run("document.querySelector('.space-setup-modal-footer .space-btn.finish')?.disabled===false"), 'final Space creation step');
        await run("document.querySelector('.space-setup-modal-footer .space-btn.finish').click();true");
        let resolvedAssistant, exactBinding;
        await until(async () => {
          if (!(await run("!document.querySelector('.space-setup-modal')&&Boolean(document.querySelector('.space-assistant'))"))) return false;
          const resolved = await run(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1,
            operation: 'resolveScope', payload: { browserProfileId: 'default', workspacePath: workspace } })})`);
          if (!resolved.ok || resolved.value.backendProfileName !== profile) return false;
          const bindingReply = await run(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1,
            operation: 'profileBindings', payload: { browserProfileId: 'default' } })})`);
          if (!bindingReply.ok) return false;
          exactBinding = bindingReply.value.bindings.find(item => item.workspacePath === workspace
            && item.backendProfileName === profile
            && item.scope?.backendProfileId === resolved.value.scope.backendProfileId
            && item.scope?.spaceId === resolved.value.scope.spaceId
            && item.scope?.browserProfileId === resolved.value.scope.browserProfileId);
          resolvedAssistant = resolved.value;
          return Boolean(exactBinding);
        }, 'UI-created Space has authoritative ' + profile + ' profile binding', 45000);
        assert.equal(resolvedAssistant.backendProfileName, profile);
        assert.deepEqual(exactBinding.scope, resolvedAssistant.scope);
        let assistantSnapshot = await run(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1,
          operation: 'assistantSnapshot', scope: resolvedAssistant.scope, payload: {} })})`);
        assert(assistantSnapshot.ok, 'actual Assistant snapshot is readable for the bound Space');
        assert.deepEqual(assistantSnapshot.value.scope, resolvedAssistant.scope);
        assert.equal(assistantSnapshot.value.providerReady, true, 'bound profile provider is ready without optional onboarding');
        assert.equal(assistantSnapshot.value.model, 'backend-profile-ui-model');
        if (assistantSnapshot.value.interview) {
          const skipped = await run(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1,
            operation: 'interviewSkip', scope: resolvedAssistant.scope, payload: {
              expectedRevision: assistantSnapshot.value.interview.revision, clientRequestId: randomUUID()
            } })})`);
          assert(skipped.ok, 'controlled Space optional interview is explicitly skipped');
          assistantSnapshot = { ok: true, value: skipped.value };
        }
        assert.equal(assistantSnapshot.value.interview, null, 'fresh test Space is in normal conversation mode');
        const bindings = await run(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1, operation: 'profileBindings', payload: { browserProfileId: 'default' } })})`);
        assert(bindings.ok); const observedBindings = bindings.value.bindings.filter(item => item.workspacePath === workspace);
        result.backendProfileUiBindingObservations ??= [];
        result.backendProfileUiBindingObservations.push({ space: name, requestedProfile: profile,
          bindings: observedBindings.map(item => ({ backendProfileName: item.backendProfileName, scope: item.scope })),
          resolveCalls: result.resolveScopeCalls.filter(item => item.workspacePath === workspace) });
        phase('ui_backend_profile_binding_observed', result.backendProfileUiBindingObservations.at(-1));
        const binding = observedBindings.find(item => item.backendProfileName === profile);
        assert(binding, 'Main records the requested backend profile binding for UI-created space ' + name + ': ' + JSON.stringify(result.backendProfileUiBindingObservations.at(-1)));
        assert.equal(observedBindings.length, 1, 'UI Space creation must persist exactly one binding for its selected backend profile: ' + JSON.stringify(result.backendProfileUiBindingObservations.at(-1)));
        return binding;
      };
      const alphaBinding = await createSpace({ name: 'Alpha isolated space', profile: 'alpha', workspace: alphaWorkspace });
      const betaBinding = await createSpace({ name: 'Beta isolated space', profile: 'beta', workspace: betaWorkspace });
      const send = async (marker, expectedSpace) => {
        const before = await run("document.querySelector('.space-assistant-space-name')?.textContent || ''");
        assert(before.includes(expectedSpace), 'Assistant header matches selected Space before send; expected ' + expectedSpace + ', got ' + before);
        const filled = await run(`(()=>{const t=document.querySelector('.space-assistant-composer textarea');if(!t)throw Error('Assistant composer missing');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(marker)});t.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
        assert(filled); await sleep(150);
        const afterFill = await run("document.querySelector('.space-assistant-space-name')?.textContent || ''");
        assert(afterFill.includes(expectedSpace), 'Assistant stayed in the selected Space before dispatch; expected ' + expectedSpace + ', got ' + afterFill);
        await until(() => run("Boolean(document.querySelector('.space-assistant-composer button[type=submit]')&&!document.querySelector('.space-assistant-composer button[type=submit]').disabled)"), 'Assistant send enabled');
        await run("document.querySelector('.space-assistant-composer button[type=submit]').click();true");
      };
      const state = async () => (await (await fetch(info.origin + '/fixture/backend-profile-state')).json());
      await run("document.querySelector('.expanded-workspace-pill').click();true");
      await run("[...document.querySelectorAll('.workspace-picker-item')].find(item=>item.innerText.includes('Alpha isolated space')).click();true");
      await until(() => run("document.querySelector('.space-assistant-space-name')?.textContent.includes('Alpha isolated space')"), 'initial actual selection of Alpha Space');
      await send('ALPHA-ORIGINAL', 'Alpha isolated space');
      await until(async () => (await state()).calls.some(call => call.profile === 'alpha' && call.promptMarker === 'ALPHA-ORIGINAL'), 'held Alpha backend call', 60000);
      const alphaHeld = await state(); assert.equal(alphaHeld.calls.filter(call => call.profile === 'alpha').length, 1);
      await until(() => run("Boolean(document.querySelector('.expanded-workspace-pill'))"), 'Space picker remains available during Alpha turn');
      await run("document.querySelector('.expanded-workspace-pill').click();true");
      await until(() => run("[...document.querySelectorAll('.workspace-picker-item')].some(item=>item.innerText.includes('Beta isolated space'))"), 'Beta Space in actual picker');
      await run("[...document.querySelectorAll('.workspace-picker-item')].find(item=>item.innerText.includes('Beta isolated space')).click();true");
      await until(() => run("document.querySelector('.space-assistant-space-name')?.textContent.includes('Beta isolated space')"), 'actual switch to Beta Space');
      await until(() => run("document.querySelector('.space-assistant-composer textarea')?.value!==undefined"), 'Beta assistant composer ready');
      await send('BETA-ISOLATED', 'Beta isolated space');
      const betaDeadline = Date.now() + 10000;
      let betaAccepted = false;
      while (Date.now() < betaDeadline) {
        const observed = await state();
        if (observed.calls.some(call => call.profile === 'beta' && call.promptMarker === 'BETA-ISOLATED')) { betaAccepted = true; break; }
        await sleep(125);
      }
      if (!betaAccepted) {
        const scope = betaBinding.scope;
        const diagnostics = await run(`(async()=>{
          const scope=${JSON.stringify(scope)};
          const independent=window.lastbrowser.independent;
          const [snapshot,activity,modelSelection,profileBindings]=await Promise.all([
            independent.request({schemaVersion:1,operation:'assistantSnapshot',scope,payload:{}}),
            independent.request({schemaVersion:1,operation:'activity',scope,payload:{}}),
            independent.request({schemaVersion:1,operation:'modelSelection',scope,payload:{}}),
            independent.request({schemaVersion:1,operation:'profileBindings',payload:{browserProfileId:scope.browserProfileId}})
          ]);
          const sessions=await window.lastbrowser.sidekick.listSessions({workspacePath:${JSON.stringify(betaWorkspace)}}).catch(error=>({error:String(error)}));
          return {snapshot,activity,modelSelection,profileBindings,sessions,composer:{text:document.querySelector('.space-assistant-composer textarea')?.value,
            disabled:document.querySelector('.space-assistant-composer button[type=submit]')?.disabled,
            messages:[...document.querySelectorAll('.space-assistant-message')].map(item=>item.innerText)},
            bodyText:document.body.innerText.slice(-2500)};
        })()`);
        result.backendProfileBetaTimeout = { timeoutMs: 10000, fixtureCalls: (await state()).calls, diagnostics };
        phase('beta_profile_request_timeout_diagnostics', result.backendProfileBetaTimeout);
        throw Error('beta_profile_request_not_accepted_within_10s');
      }
      await until(() => run("[...document.querySelectorAll('.space-assistant-message.assistant')].some(message=>message.innerText.includes('Beta isolated response.'))"), 'Beta reply in Beta UI', 10000);
      const betaVisibleOnly = await run("(()=>{const messages=[...document.querySelectorAll('.space-assistant-message')].map(item=>item.innerText).join('\\n');return {beta:messages.includes('Beta isolated response.'),alpha:messages.includes('Alpha isolated response.'),alphaPrompt:messages.includes('ALPHA-ORIGINAL')}})()");
      assert(betaVisibleOnly.beta && !betaVisibleOnly.alpha && !betaVisibleOnly.alphaPrompt, 'Beta transcript has no Alpha messages');
      await run("document.querySelector('.expanded-workspace-pill').click();true");
      await run("[...document.querySelectorAll('.workspace-picker-item')].find(item=>item.innerText.includes('Alpha isolated space')).click();true");
      await until(() => run("document.querySelector('.space-assistant-space-name')?.textContent.includes('Alpha isolated space')"), 'actual return to Alpha Space');
      const alphaBeforeRelease = await run("(()=>{const messages=[...document.querySelectorAll('.space-assistant-message')].map(item=>item.innerText).join('\\n');return {prompt:messages.includes('ALPHA-ORIGINAL'),reply:messages.includes('Alpha isolated response.'),beta:messages.includes('BETA-ISOLATED')}})()");
      assert(alphaBeforeRelease.prompt && !alphaBeforeRelease.reply && !alphaBeforeRelease.beta, 'Alpha retains its pending turn, without Beta transcript');
      const beforeRelease = await state(); assert.equal(beforeRelease.calls.filter(call => call.profile === 'alpha').length, 1);
      await fetch(info.origin + '/fixture/release-alpha', { method: 'POST' });
      await until(() => run("[...document.querySelectorAll('.space-assistant-message.assistant')].some(message=>message.innerText.includes('Alpha isolated response.'))"), 'held Alpha response resumes in Alpha', 60000);
      await run("document.querySelector('.expanded-workspace-pill').click();true");
      await run("[...document.querySelectorAll('.workspace-picker-item')].find(item=>item.innerText.includes('Beta isolated space')).click();true");
      await until(() => run("document.querySelector('.space-assistant-space-name')?.textContent.includes('Beta isolated space')"), 'final return to Beta Space');
      const betaVisibleAfterAlpha = await run("(()=>{const messages=[...document.querySelectorAll('.space-assistant-message')].map(item=>item.innerText).join('\\n');return {beta:messages.includes('Beta isolated response.'),alpha:messages.includes('Alpha isolated response.'),alphaPrompt:messages.includes('ALPHA-ORIGINAL')}})()");
      assert(betaVisibleAfterAlpha.beta && !betaVisibleAfterAlpha.alpha && !betaVisibleAfterAlpha.alphaPrompt, 'Beta transcript remains isolated after Alpha reply');
      const finalState = await state(); const alphaCalls = finalState.calls.filter(call => call.profile === 'alpha'), betaCalls = finalState.calls.filter(call => call.profile === 'beta');
      assert.equal(alphaCalls.length, 1); assert.equal(betaCalls.length, 1);
      result.backendProfileTest = { passed: true, profileBindings: { alpha: alphaBinding, beta: betaBinding },
        alphaHeldDuringBeta: true, betaReplyVisibleOnlyInBeta: true, alphaReplyVisibleOnlyInAlpha: true,
        alphaBeforeRelease, betaVisibleOnly, betaVisibleAfterAlpha, providerCalls: { alpha: alphaCalls.length, beta: betaCalls.length },
        providerCallMarkers: finalState.calls.map(call => ({ profile: call.profile, model: call.model, promptMarker: call.promptMarker })) };
      result.passed = true; phase('backend_profile_ui_a_to_b_to_a_passed', result.backendProfileTest);
      await end(); return;
    }
    await run("(()=>{const button=document.querySelector('.copilot-toggle-btn');if(!button)throw Error('Sidekick icon missing');if(button.classList.contains('active'))button.click();return true})()");
    await until(() => run("!document.querySelector('.space-assistant')"), 'actual Sidekick icon closes Assistant');
    await run("document.querySelector('.copilot-toggle-btn').click();true");
    await until(() => run("Boolean(document.querySelector('[data-testid=space-assistant-panel]'))"), 'actual upper-right Assistant icon');
    result.iconToggleObserved = true;
    await until(() => run("document.querySelector('.space-assistant-model')?.innerText.includes('backend-profile-ui-model')"), 'actual scoped model');
    await run("(()=>{const t=document.querySelector('.space-assistant textarea');if(!t)throw Error('composer missing');const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;setter.call(t,'Controlled full app conversation');t.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
    await sleep(150);
    await run("document.querySelector('.space-assistant form').requestSubmit();true");
    await until(() => run("[...document.querySelectorAll('.space-assistant-message.assistant')].some(e=>e.innerText.includes('Full app controlled assistant reply.'))"), 'actual Assistant SDK result', 75000);
    await until(() => run("Boolean(document.querySelector('.space-assistant-composer button[type=submit]'))"), 'actual Assistant turn settled', 75000);
    result.assistantReply = true;
    const selection = await run(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1, operation: 'resolveScope', payload: { browserProfileId: 'default', workspacePath: null } })})`);
    assert(selection.ok); result.scope = selection.value.scope;
    if (info.interviewProbe) {
      const binding = await run(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1, operation: 'resolveScope', payload: { browserProfileId: 'default', workspacePath: info.workspace } })})`);
      assert(binding.ok); const interviewScope = binding.value.scope;
      const read = async operation => { const reply = await run(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1, operation, scope: interviewScope, payload: {} })})`); assert(reply.ok); return reply.value; };
      const permissionsBefore = await read('permissions');
      const originalName = await run("document.querySelector('.space-assistant-header span').textContent");
      const profileTab = async () => { await run("document.querySelectorAll('.space-assistant-tabs button')[1].click();true"); };
      const button = async label => { await until(() => run(`Boolean([...document.querySelectorAll('.space-assistant button')].find(b=>${label}.test(b.textContent)&&!b.disabled))`), 'interview button ' + label);
        await run(`[...document.querySelectorAll('.space-assistant button')].find(b=>${label}.test(b.textContent)&&!b.disabled).click();true`); };
      await profileTab(); await button('/Assistant einrichten|Set up this assistant/i');
      let interview;
      await until(async () => { interview = (await read('assistantSnapshot')).interview; return Boolean(interview?.question); }, 'actual immediate interview question');
      await until(() => run("[3,4].includes(document.querySelectorAll('.space-interview-options input').length)"), 'three or four immediate options');
      const initialOptions = interview.question.options.length;
      const chosenOption = await run("document.querySelector('.space-interview-options input').value");
      await run("document.querySelector('.space-interview-options input').click();true");
      assert.equal((await read('assistantSnapshot')).interview.answers.length, 0, 'Choosing an option alone does not submit');
      await run("(()=>{const t=document.querySelector('.space-interview form textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'Controlled personal research preferences');t.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
      await until(() => run("document.querySelector('.space-interview form button[type=submit]')?.disabled===false"), 'equal free answer enabled');
      await run("document.querySelector('.space-interview form').requestSubmit();true");
      await until(async () => { interview = (await read('assistantSnapshot')).interview;
        return interview?.answers.length === 1 && interview.question?.prompt.startsWith('Controlled adaptive interview:'); }, 'actual structured model follow-up', 75000);
      assert.equal(interview.answers[0].freeText, 'Controlled personal research preferences');
      assert.deepEqual(interview.answers[0].selectedOptionIds, [chosenOption]);
      await until(() => run("document.querySelector('.space-interview legend')?.textContent.startsWith('Controlled adaptive interview:')"), 'structured follow-up shown');
      await run("(()=>{const t=document.querySelector('.space-interview form textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'Controlled free-only follow-up');t.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
      await until(() => run("document.querySelector('.space-interview form button[type=submit]')?.disabled===false"), 'free-only follow-up enabled');
      await run("document.querySelector('.space-interview form').requestSubmit();true");
      await until(async () => { interview = (await read('assistantSnapshot')).interview;
        return interview?.answers.length === 2 && interview.manualFallback; }, 'model error reaches understandable manual fallback', 75000);
      assert.equal(interview.answers[1].freeText, 'Controlled free-only follow-up');
      assert.deepEqual(interview.answers[1].selectedOptionIds, []);
      window.webContents.reload(); result.shellReloads++;
      await until(() => run('Boolean(document.querySelector(".space-assistant-tabs"))'), 'actual interview reload');
      await profileTab();
      await until(() => run("Boolean(document.querySelector('.space-interview [role=status]'))"), 'manual fallback visible after reload');
      assert.equal((await read('assistantSnapshot')).interview.answers.length, 2);
      await run("(()=>{const t=document.querySelector('.space-interview form textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'das reicht');t.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
      await until(() => run("document.querySelector('.space-interview form button[type=submit]')?.disabled===false"), 'explicit finish answer enabled');
      await run("document.querySelector('.space-interview form').requestSubmit();true");
      await until(async () => (await read('assistantSnapshot')).interview.stage === 'review', 'explicit user review');
      await button('/Präferenzen bestätigen|Confirm preferences/i');
      let confirmed;
      await until(async () => { confirmed = await read('assistantSnapshot'); return confirmed.interview?.stage === 'confirmed' && confirmed.confirmedProfile; }, 'explicit preference confirmation');
      assert(confirmed.confirmedProfile.values.purpose.includes('Controlled personal research preferences'));
      assert.equal(await run("document.querySelector('.space-assistant-header span').textContent"), originalName, 'Confirmation does not navigate');
      assert.deepEqual(await read('permissions'), permissionsBefore, 'Interview preferences grant no permissions');
      const activity = await read('activity'); assert.equal(activity.runs.length, 0); assert.equal(activity.dispatches.length, 0);
      result.interview = { scope: interviewScope, initialOptions, structuredOptions: 3, equalFreeText: true, freeOnlyAnswer: true, optionAloneDidNotSubmit: true,
        manualFallback: true, answerRetainedAfterReload: true, explicitReview: true, explicitConfirmation: true,
        noNavigation: true, noPermissionsGranted: true, noRunsStarted: true, profilePurpose: confirmed.confirmedProfile.values.purpose };
      phase('actual_full_app_interview_passed', result.interview);
      await run("document.querySelectorAll('.space-assistant-tabs button')[0].click();true");
    }
    let verifyDelegatedUi;
    if (info.delegationProbe) {
      const panelBinding = await run(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1,
        operation: 'resolveScope', payload: { browserProfileId: 'default', workspacePath: info.workspace } })})`);
      assert(panelBinding.ok); const panelScope = panelBinding.value.scope;
      const request = async (operation, payload = {}) => {
        const reply = await run(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1, operation, scope: panelScope, payload })})`);
        assert(reply.ok, JSON.stringify(reply)); return reply.value;
      };
      if (info.browserProbe) {
        const permissions = await request('permissions');
        await request('permissions', { action: 'grant', expectedRevision: permissions.revision,
          permissions: { browserOrigins: [info.origin], allowedEffects: ['read', 'write'] } });
      }
      const submit = async message => {
        await run(`(()=>{const t=document.querySelector('.space-assistant-composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(message)});t.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
        await until(() => run("document.querySelector('.space-assistant-composer button[type=submit]')?.disabled===false"), 'actual panel composer ready');
        await run("document.querySelector('.space-assistant-composer').requestSubmit();true");
      };
      const before = await request('assistantSnapshot'), ids = new Set(before.messages.map(row => row.id));
      assert(before.messages.some(row => row.content.includes('Controlled full app conversation')), 'Probe observes actual selected Panel Space');
      await submit('Starte einen Arbeitschat und leg los: FULLAPP:delegated');
      let delegated;
      await until(async () => { const snapshot = await request('assistantSnapshot');
        const error = snapshot.messages.find(row => !ids.has(row.id) && row.errorCode);
        if (error) throw Error('delegation:' + error.errorCode);
        delegated = snapshot.messages.find(row => !ids.has(row.id) && row.runId && row.targetSessionId); return Boolean(delegated);
      }, 'actual full App panel delegation', 75000);
      await until(async () => (await (await fetch(info.origin + '/fixture/delegation-state')).json()).delegatedRequests === 1,
        'actual delegated SDK request', 75000);
      const parallelBefore = await request('assistantSnapshot'), parallelIds = new Set(parallelBefore.messages.map(row => row.id));
      await submit('Beantworte diese Nachricht während der Auftrag läuft: FULLAPP:parallel');
      await until(async () => (await request('assistantSnapshot')).messages.some(row => !parallelIds.has(row.id)
        && row.role === 'assistant' && row.content.includes('Full app controlled assistant reply.')), 'actual parallel Assistant conversation', 75000);
      assert.equal((await (await fetch(info.origin + '/fixture/delegation-state')).json()).releasedDelegation, false);
      phase('actual_parallel_assistant_passed', { runId: delegated.runId, scope: panelScope });
      if (info.mainCrashProbe) {
        const active = await request('activity');
        assert(active.runs.some(row => row.runId === delegated.runId && row.state === 'running'));
        fs.writeFileSync(path.join(owned, 'main-crash-handoff.json'), JSON.stringify({ mainPid: process.pid,
          childPids: result.childPids, scope: panelScope, runId: delegated.runId,
          targetSessionId: delegated.targetSessionId, dispatchId: delegated.dispatchId }));
        phase('actual_main_crash_ready', { mainPid: process.pid, runId: delegated.runId });
        await new Promise(() => {});
      }
      if (info.profileSwitchProbe) {
        window.restore();
        const selector = `.space-assistant [data-run-id="${delegated.runId}"] .space-assistant-controls button`;
        await until(() => run(`document.querySelectorAll(${JSON.stringify(selector)})[3]?.disabled===false`), 'browser view before profile switch');
        await run(`document.querySelectorAll(${JSON.stringify(selector)})[3].click();true`);
        await until(() => browserUiResults.some(row => row.operation === 'openBrowser'), 'actual original profile browser lease');
        const lease = browserUiResults.find(row => row.operation === 'openBrowser').reply;
        assert(lease.ok); result.originalBrowserLeaseId = lease.value.leaseId;
        await run("(()=>{if(!document.querySelector('.expanded-bottom-footer'))document.querySelector('.toggle-expand-btn')?.click();return true})()");
        await until(() => run("Boolean(document.querySelector('.expanded-bottom-footer .footer-link-btn'))"), 'actual Settings entry');
        await run("document.querySelector('.expanded-bottom-footer .footer-link-btn').click();true");
        await until(() => run("document.querySelectorAll('.settings-section-button').length>=3"), 'actual Settings sections');
        await run("document.querySelectorAll('.settings-section-button')[2].click();true");
        await until(() => run("Boolean(document.querySelector('.profile-switcher-trigger'))"), 'actual Preferences profile picker');
        await run("document.querySelector('.profile-switcher-trigger').click();true");
        await until(() => run("Boolean(document.querySelector('.profile-switcher-menu form input'))"), 'actual profile create form');
        await run("(()=>{const t=document.querySelector('.profile-switcher-menu form input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(t,'Controlled alternate profile');t.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
        await until(() => run("document.querySelector('.profile-switcher-menu form button[type=submit]')?.disabled===false"), 'actual profile create ready');
        await run("document.querySelector('.profile-switcher-menu form').requestSubmit();true");
        await until(() => run("!document.querySelector('.profile-switcher-menu')"), 'actual profile creation closes picker');
        await run("document.querySelector('.profile-switcher-trigger').click();true");
        await until(() => run("[...document.querySelectorAll('.profile-switcher-item')].some(row=>row.textContent.includes('Controlled alternate profile'))"), 'actual created profile');
        await run("[...document.querySelectorAll('.profile-switcher-item')].find(row=>row.textContent.includes('Controlled alternate profile')).click();true");
        await until(() => run("document.querySelector('.profile-switcher-trigger').textContent.includes('Controlled alternate profile')"), 'actual switched browser profile');
        const selectedId = await run("localStorage.getItem('lastbrowser.activeProfile.v1')");
        assert(selectedId && selectedId !== 'default');
        const alternate = await run(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1, operation: 'resolveScope', payload: { browserProfileId: selectedId, workspacePath: info.workspace } })})`);
        assert(alternate.ok); assert.equal(alternate.value.scope.browserProfileId, selectedId);
        assert.notEqual(alternate.value.scope.spaceId, panelScope.spaceId);
        const otherActivity = await run(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1, operation: 'activity', scope: alternate.value.scope, payload: {} })})`);
        assert(otherActivity.ok); assert(!otherActivity.value.runs.some(row => row.runId === delegated.runId));
        window.minimize();
        const originalActivity = await request('activity');
        const originalRun = originalActivity.runs.find(row => row.runId === delegated.runId);
        assert.equal(originalRun.state, 'running'); assert.deepEqual(originalRun.scope, panelScope);
        window.restore();
        await run("document.querySelector('.profile-switcher-trigger').click();true");
        await until(() => run("[...document.querySelectorAll('.profile-switcher-item')].some(row=>row.querySelector('.profile-switcher-item-badge'))"), 'original default profile entry');
        await run("[...document.querySelectorAll('.profile-switcher-item')].find(row=>row.querySelector('.profile-switcher-item-badge')).click();true");
        await until(() => run(`localStorage.getItem('lastbrowser.activeProfile.v1')==='default'&&Boolean(document.querySelector('.space-assistant [data-run-id="${delegated.runId}"]'))`), 'original scoped run restored after profile switch');
        result.profileSwitch = { browserProfileSwitches: 2, alternateScope: alternate.value.scope, originalScope: panelScope,
          originalRunStillRunning: true, foreignRunAbsent: true, originalBrowserLeaseId: result.originalBrowserLeaseId };
        phase('actual_profile_switch_passed', result.profileSwitch);
      }
      if (info.backendCrashProbe) {
        const backend = spawnRecords.find(row => row.args.includes('cli.web_server:app')
          && row.task.exitCode === null && row.task.signalCode === null);
        assert(backend?.task.pid, 'Crash only the actual backend child spawned by this isolated Main');
        assert(path.resolve(backend.exe).startsWith(path.resolve(info.packagedResources || root) + path.sep));
        const beforeCrash = await request('activity');
        assert(beforeCrash.runs.some(row => row.runId === delegated.runId && row.state === 'running'));
        assert(backend.task.kill(), 'Owned backend receives abrupt termination');
        await until(() => backend.task.exitCode !== null || backend.task.signalCode !== null, 'actual owned backend exit');
        // A signal termination may require explicit restart on Windows. Use
        // the genuine service IPC and report this separately from auto-restart.
        await sleep(2500);
        const autoRestarted = spawnRecords.some(row => row !== backend && row.args.includes('cli.web_server:app'));
        if (!autoRestarted) await run('window.lastbrowser.services.start()');
        await until(() => run("window.lastbrowser.services.status().then(s=>s.sidekick==='ready'&&s.webuiHealth==='ready')"), 'actual backend health after crash', 65000);
        let recovered;
        await until(async () => { recovered = await request('activity');
          return recovered.runs.some(row => row.runId === delegated.runId && row.state === 'interrupted');
        }, 'original persisted run recovered as interrupted', 45000);
        const original = recovered.runs.find(row => row.runId === delegated.runId);
        assert.equal(original.targetSessionId, delegated.targetSessionId);
        assert.equal(recovered.dispatches.filter(row => row.dispatchId === delegated.dispatchId).length, 1);
        await fetch(info.origin + '/fixture/release-delegation', { method: 'POST' });
        window.webContents.reload(); result.shellReloads++;
        await until(() => run('Boolean(window.lastbrowser&&document.querySelector(".app-shell"))'), 'actual App reload after backend recovery');
        await sleep(2500);
        const fixtureState = await (await fetch(info.origin + '/fixture/delegation-state')).json();
        assert.equal(fixtureState.delegatedRequests, 1, 'No automatic replay of interrupted SDK work');
        assert((await request('activity')).runs.some(row => row.runId === delegated.runId && row.state === 'interrupted'));
        result.backendCrash = { pid: backend.task.pid, exitCode: backend.task.exitCode, signal: backend.task.signalCode,
          autoRestarted, explicitServiceRestart: !autoRestarted, scope: panelScope, runId: delegated.runId,
          targetSessionId: delegated.targetSessionId, recoveredState: original.state, dispatchCount: 1,
          delegatedRequests: fixtureState.delegatedRequests, rendererReloadSurvived: true };
        assert.equal(result.nativeDialogs.length, 0);
        result.passed = true; phase('actual_backend_crash_recovery_passed', result.backendCrash);
        await end(); return;
      }
      if (info.spaceSwitchProbe) {
        window.restore();
        const browserButtons = `.space-assistant [data-run-id="${delegated.runId}"] .space-assistant-controls button`;
        await until(() => run(`document.querySelectorAll(${JSON.stringify(browserButtons)})[3]?.disabled===false`), 'original browser View before Space switches');
        await run(`document.querySelectorAll(${JSON.stringify(browserButtons)})[3].click();true`);
        await until(() => browserUiResults.some(row => row.operation === 'openBrowser'), 'original browser lease preview');
        const originalPreview = browserUiResults.find(row => row.operation === 'openBrowser').reply;
        assert(originalPreview.ok, JSON.stringify(originalPreview.error));
        result.originalBrowserLeaseId = originalPreview.value.leaseId;
        await run("document.querySelector('.toggle-expand-btn')?.click();true");
        const switchSpace = async name => {
          await until(() => run("Boolean(document.querySelector('.expanded-workspace-pill'))"), 'actual Space picker');
          await run("document.querySelector('.expanded-workspace-pill').click();true");
          await until(() => run(`Boolean([...document.querySelectorAll('.workspace-picker-item')].find(row=>row.querySelector('.workspace-item-name')?.textContent===${JSON.stringify(name)}))`), 'actual registered Space item');
          await run(`[...document.querySelectorAll('.workspace-picker-item')].find(row=>row.querySelector('.workspace-item-name')?.textContent===${JSON.stringify(name)}).click();true`);
          await until(() => run(`document.querySelector('.space-assistant-header span')?.textContent===${JSON.stringify(name)}`), 'actual selected Space Assistant');
        };
        for (let index = 0; index < 2; index++) {
          await switchSpace('Other controlled workspace');
          const other = await run(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1, operation: 'resolveScope', payload: { browserProfileId: 'default', workspacePath: info.otherWorkspace } })})`);
          assert(other.ok); assert.notEqual(other.value.scope.spaceId, panelScope.spaceId);
          const foreign = await run(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1, operation: 'activity', scope: other.value.scope, payload: {} })})`);
          assert(foreign.ok); assert(!foreign.value.runs.some(row => row.runId === delegated.runId));
          window.minimize();
          const original = await request('activity');
          assert(original.runs.some(row => row.runId === delegated.runId && row.state === 'running'));
          window.restore();
          await switchSpace('Controlled app workspace');
          await until(() => run(`Boolean(document.querySelector('.space-assistant [data-run-id="${delegated.runId}"]'))`), 'original live run returns to its Space');
        }
        result.actualSpaceSwitches = 4;
        phase('actual_browser_space_switches_passed', { count: result.actualSpaceSwitches, originalLeaseId: result.originalBrowserLeaseId });
      }
      window.webContents.reload(); result.shellReloads++;
      await until(() => run('Boolean(window.lastbrowser&&document.querySelector(".app-shell"))'), 'delegated task reload');
      window.minimize();
      if (info.browserProbe) {
        window.restore();
        const selector = `.space-assistant [data-run-id="${delegated.runId}"] .space-assistant-controls button`;
        await until(() => run(`document.querySelectorAll(${JSON.stringify(selector)})[3]?.disabled===false`),
          'actual full App live browser activity after reload', 75000);
        const previewsBefore = browserUiResults.filter(row => row.operation === 'openBrowser').length;
        await run(`document.querySelectorAll(${JSON.stringify(selector)})[3].click();true`);
        await until(() => browserUiResults.filter(row => row.operation === 'openBrowser').length > previewsBefore, 'actual full App browser View');
        const preview = browserUiResults.filter(row => row.operation === 'openBrowser').at(-1).reply;
        assert(preview.ok, JSON.stringify(preview.error));
        assert.equal(preview.value.runId, delegated.runId);
        if (info.spaceSwitchProbe || info.profileSwitchProbe) assert.equal(preview.value.leaseId, result.originalBrowserLeaseId, 'Original browser lease survives actual Space/profile switches and reload');
        await until(() => run("Boolean(document.querySelector('.space-assistant figure img')?.naturalWidth)"), 'actual full App screenshot loaded');
        await until(() => run(`document.querySelectorAll(${JSON.stringify(selector)})[4]?.disabled===false`), 'actual full App Take over ready');
        const takeoverLabel = await run(`document.querySelectorAll(${JSON.stringify(selector)})[4].textContent`);
        await run(`document.querySelectorAll(${JSON.stringify(selector)})[4].click();true`);
        await until(() => browserUiResults.some(row => row.operation === 'takeover'), 'actual full App Take over');
        const taken = browserUiResults.find(row => row.operation === 'takeover').reply;
        assert(taken.ok, JSON.stringify(taken.error)); assert.equal(taken.value.state, 'paused');
        assert.equal(taken.value.runId, delegated.runId);
        assert.deepEqual(taken.value.scope, panelScope);
        // In-flight inference must reach its real safe boundary before the
        // user sees the target. Release only the controlled provider response.
        assert.equal(taken.value.visible, false);
        await fetch(info.origin + '/fixture/release-delegation', { method: 'POST' });
        await until(async () => (await request('activity')).runs.some(row => row.runId === delegated.runId && row.state === 'paused'),
          'actual full App safe pause checkpoint', 75000);
        await until(() => run(`document.querySelectorAll(${JSON.stringify(selector)})[4]?.disabled===false`), 'actual safe takeover ready');
        await run(`document.querySelectorAll(${JSON.stringify(selector)})[4].click();true`);
        await until(() => browserUiResults.filter(row => row.operation === 'takeover').length === 2, 'actual safe manual takeover');
        const visible = browserUiResults.filter(row => row.operation === 'takeover').at(-1).reply;
        assert(visible.ok, JSON.stringify(visible.error)); assert.equal(visible.value.visible, true);
        await until(() => run(`document.querySelectorAll(${JSON.stringify(selector)})[4]?.textContent!==${JSON.stringify(takeoverLabel)}`),
          'actual resume button after safe takeover');
        await run(`document.querySelectorAll(${JSON.stringify(selector)})[4].click();true`);
        await until(() => browserUiResults.some(row => row.operation === 'resumeBrowser'), 'actual full App browser resume');
        const resumed = browserUiResults.find(row => row.operation === 'resumeBrowser').reply;
        assert(resumed.ok, JSON.stringify(resumed.error));
        // Resume uses existing scheduler admission. Its immediate browser
        // snapshot may remain paused until the queued run acquires compute.
        assert(['paused', 'ready'].includes(resumed.value.state));
        result.browserTask = { actualPanelView: true, screenshotLoaded: true, actualTakeover: true,
          automationPaused: true, safeCheckpointPaused: true, visibleTakeover: true, actualResume: true,
          resumeAdmissionState: resumed.value.state, originalSessionId: delegated.targetSessionId, scope: panelScope, rendererReloadSurvived: true };
        phase('actual_full_app_browser_passed', result.browserTask);
      }
      await fetch(info.origin + '/fixture/release-delegation', { method: 'POST' });
      await until(async () => (await request('activity')).runs.some(row => row.runId === delegated.runId && row.state === 'completed'),
        'actual delegated run settlement', 75000);
      result.delegationStorage = fs.readdirSync(info.userData, { recursive: true })
        .filter(file => typeof file === 'string' && file.endsWith(delegated.targetSessionId + '.json'))
        .map(file => { const saved = JSON.parse(fs.readFileSync(path.join(info.userData, file), 'utf8'));
          return { file, profile: saved.profile, workspace: saved.workspace, spaceScope: saved.space_scope,
            independentScope: saved.independent?.scope, hasFinalAnswer: (saved.messages || []).some(row => row.content?.includes('Controlled delegated work completed.')) }; });
      phase('actual_delegated_storage', { rows: result.delegationStorage });
      let settled;
      await until(async () => {
        try {
          settled = await run(`window.lastbrowser.sidekick.getSession(${JSON.stringify({ sessionId: delegated.targetSessionId, profile: 'default', workspacePath: info.workspace })})`);
        } catch (error) {
          if (result.delegatedReadError !== String(error)) phase('actual_delegated_read_error', { error: String(error) });
          result.delegatedReadError = String(error); return false;
        }
        return settled.session.messages.some(row => row.role === 'assistant' && row.content?.includes('Controlled delegated work completed.'));
      }, 'actual original result projection', 75000);
      assert(settled.session.messages.some(row => row.role === 'assistant' && row.content?.includes('Controlled delegated work completed.')),
        'Original delegated chat has actual final answer');
      assert.deepEqual(settled.session.space_scope, panelScope);
      const listed = await run(`window.lastbrowser.sidekick.listSessions(${JSON.stringify({ profile: 'default', workspacePath: info.workspace })})`);
      assert.equal(listed.sessions.filter(row => row.session_id === delegated.targetSessionId).length, 1,
        'Original delegated chat is present once in normal Workspace sidebar list');
      const activity = await request('activity');
      assert.equal(activity.dispatches.filter(row => row.dispatchId === delegated.dispatchId).length, 1);
      result.delegatedPanel = { targetSessionId: delegated.targetSessionId, runId: delegated.runId,
        scope: panelScope, parallelAssistant: true, readerReloadSurvived: true, originalAnswerSaved: true,
        normalSidebarListed: true };
      verifyDelegatedUi = async () => {
      window.restore();
      await until(() => run(`Boolean([...document.querySelectorAll('.space-assistant-message.assistant')]
        .find(row=>row.textContent.includes('Full app controlled task delegated.'))?.querySelector('button'))`),
        'original delegation message open button');
      await run(`(()=>{const row=[...document.querySelectorAll('.space-assistant-message.assistant')]
        .find(row=>row.textContent.includes('Full app controlled task delegated.'));
        row.querySelector('button').click();return true})()`);
      await until(() => run("Boolean(document.querySelector('.native-chat-main')?.textContent.includes('Controlled delegated work completed.'))"),
        'actual work chat opened with saved response', 75000);
      phase('actual_open_work_chat_passed', { targetSessionId: delegated.targetSessionId });
      await run("(()=>{document.querySelector('.context-sidebar.collapsed button')?.click();document.querySelector('.toggle-expand-btn')?.click();return true})()");
      await until(() => run("document.querySelectorAll('.sidebar-drawer-tabs .drawer-tab-btn').length>=2"), 'actual Sidebar drawer tabs');
      await run("document.querySelectorAll('.sidebar-drawer-tabs .drawer-tab-btn')[1].click();true");
      const delegatedTitle = listed.sessions.find(row => row.session_id === delegated.targetSessionId).title;
      assert(delegatedTitle, 'Delegated work chat has a real persisted title');
      await until(() => run(`Boolean([...document.querySelectorAll('.context-sidebar .session-item.active .session-main,.sidebar-session-item.is-active')]
        .some(row=>row.textContent.includes(${JSON.stringify(delegatedTitle)})))`),
        'actual active delegated sidebar row', 75000);
      result.delegatedPanel.actualOpenWorkChat = true;
      result.delegatedPanel.actualActiveSidebarRow = true;
      phase('actual_full_app_delegation_passed', result.delegatedPanel);
      };
    }
    // Opening a work chat loads genuine catalogs. A following explicit chat
    // start must tolerate their short admission overlap without start retries.
    if (verifyDelegatedUi) await verifyDelegatedUi();
    await run('window.fullAppEvents=[];window.fullAppRelease=window.lastbrowser.sidekick.onChatStreamEvent(e=>window.fullAppEvents.push(e));true');
    const nativeWorkspace = info.interviewProbe ? info.workspace : null;
    const nativeScope = info.interviewProbe ? result.interview.scope : result.scope;
    const started = await run(`window.lastbrowser.sidekick.startChat(${JSON.stringify({ message: 'Controlled full app native stream', profile: 'default', ...(nativeWorkspace ? { workspace: nativeWorkspace } : {}) })})`);
    assert.deepEqual(started.spaceScope, nativeScope); result.nativeStarted = { sessionId: started.sessionId, streamId: started.streamId, scope: started.spaceScope };
    await run(`window.lastbrowser.sidekick.subscribeChatStream(${JSON.stringify({ streamId: started.streamId })})`);
    await until(() => run(`window.lastbrowser.sidekick.getStreamStatus(${JSON.stringify(started.streamId)}).then(s=>s.native_controls?.processExited===true)`), 'genuine Main native Reader actual exit', 75000);
    const saved = await run(`window.lastbrowser.sidekick.getSession(${JSON.stringify({ sessionId: started.sessionId, profile: 'default', workspacePath: nativeWorkspace })})`);
    result.nativeTerminalDiagnostics = await run("window.fullAppEvents.filter(e=>['worker_fault','apperror','error'].includes(e.event)).map(e=>({event:e.event,errorCode:e.data?.errorCode,errorType:e.data?.errorType,message:String(e.data?.message||'').slice(0,300)}))");
    phase('native_terminal_diagnostics', { events: result.nativeTerminalDiagnostics });
    assert.deepEqual(saved.session.space_scope, nativeScope); assert(saved.session.messages.some(item => item.role === 'assistant' && item.content.includes('Full app controlled assistant reply.')));
    const mode = await run(`window.lastbrowser.sidekick.chatMode(${JSON.stringify({ action: 'get', sessionId: started.sessionId, browserProfileId: 'default', workspacePath: nativeWorkspace })})`);
    const grill = await run(`window.lastbrowser.sidekick.grill(${JSON.stringify({ action: 'get', sessionId: started.sessionId, browserProfileId: 'default', workspacePath: nativeWorkspace })})`);
    assert.equal(mode.ok, true); assert.equal(mode.mode.mode, 'action'); assert.equal(grill.ok, true);
    result.purposeReaders = { nativeScope: true, chatMode: mode.mode.mode, modeRevision: mode.mode.revision, grillEmpty: grill.grill === null };
    const envelopes = await run('window.fullAppEvents'); assert(envelopes.some(item => item.nativeContext?.streamId === started.streamId && item.nativeContext?.writerGeneration));
    // Genuine preload/App in another native window still has no Shell ownership.
    const guest = new BrowserWindow({ show: false, webPreferences: { preload: path.join(info.buildRoot, 'main', 'preload.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: true } });
    await guest.loadURL(window.webContents.getURL());
    await until(() => guest.webContents.executeJavaScript('Boolean(window.lastbrowser)'), 'genuine guest preload');
    const denied = await guest.webContents.executeJavaScript(`window.lastbrowser.independent.request(${JSON.stringify({ schemaVersion: 1, operation: 'assistantSnapshot', scope: result.scope, payload: {} })})`, true);
    assert.equal(denied.ok, false);
    const guestDefault = await guest.webContents.executeJavaScript('window.lastbrowser.system.setDefaultBrowser()', true);
    assert.equal(guestDefault, false, 'Guest cannot alter OS browser defaults');
    const readsBefore = result.nativeReadRequests;
    const guestRead = await guest.webContents.executeJavaScript(`window.lastbrowser.sidekick.getStreamStatus(${JSON.stringify(started.streamId)}).then(()=>false,()=>true)`, true);
    assert.equal(guestRead, true); assert.equal(result.nativeReadRequests, readsBefore);
    guest.destroy(); result.guestAuthorityRejected = true;
    window.webContents.reload(); result.shellReloads++;
    await until(() => run('Boolean(window.lastbrowser&&document.querySelector(".app-shell"))'), 'final reload');
    const recovered = await run(`window.lastbrowser.sidekick.getSession(${JSON.stringify({ sessionId: started.sessionId, profile: 'default', workspacePath: nativeWorkspace })})`);
    assert.deepEqual(recovered.session.space_scope, nativeScope);
    const files = fs.readdirSync(info.userData, { recursive: true }).filter(file => typeof file === 'string');
    result.sessionFiles = files.filter(file => path.basename(file).startsWith(started.sessionId) && file.endsWith('.json'));
    assert(result.sessionFiles.length > 0, 'actual session persisted within owned userData');
    result.writableRoots = { electronUserData: app.getPath('userData'), electronSessionData: app.getPath('sessionData'), electronHome: app.getPath('home'),
      sidecarRuntime: result.status.runtimeDir, sourceRoot: root, sourceRootUsedForCodeOnly: true };
    assert.equal(result.nativeDialogs.length, 0);
    for (const channel of ['lastbrowser:independent:request', 'lastbrowser:sidekick:chatMode', 'lastbrowser:sidekick:grill', 'lastbrowser:sidekick:subscribeChatStream', 'lastbrowser:sidekick:getStreamStatus']) assert(result.registered.includes(channel));
    result.passed = true; phase('actual_main_pipeline_passed', { shellReloads: result.shellReloads, nativeDialogs: result.nativeDialogs.length, nativeScope: result.scope, channels: result.registered.length });
  } catch (error) { result.error = String(error.stack || error);
    if (info.backendProfileProbe && result.backendProfileBetaTimeout === undefined && window && !window.isDestroyed()) {
      try {
        const beta = result.backendProfileUiBindingObservations?.find(row => row.space === 'Beta isolated space')?.bindings?.[0]?.scope;
        if (beta) {
          result.backendProfileBetaTimeout = await run(`(async()=>{
            const scope=${JSON.stringify(beta)}, independent=window.lastbrowser.independent;
            const [snapshot,activity,modelSelection,profileBindings]=await Promise.all([
              independent.request({schemaVersion:1,operation:'assistantSnapshot',scope,payload:{}}),
              independent.request({schemaVersion:1,operation:'activity',scope,payload:{}}),
              independent.request({schemaVersion:1,operation:'modelSelection',scope,payload:{}}),
              independent.request({schemaVersion:1,operation:'profileBindings',payload:{browserProfileId:scope.browserProfileId}})
            ]);
            const sessions=await window.lastbrowser.sidekick.listSessions({workspacePath:${JSON.stringify(info.workspace)}}).catch(error=>({error:String(error)}));
            return {timeoutCause:${JSON.stringify(String(error.message || error))},timeoutMs:10000,providerCalls:(await (await fetch(${JSON.stringify(info.origin + '/fixture/backend-profile-state')})).json()).calls,
              snapshot,activity,modelSelection,profileBindings,sessions,composer:{text:document.querySelector('.space-assistant-composer textarea')?.value,
                disabled:document.querySelector('.space-assistant-composer button[type=submit]')?.disabled},
              nativeChatStreamStatus:window.lastbrowser.sidekick.getStreamStatus?await window.lastbrowser.sidekick.getStreamStatus(snapshot.value?.active_stream_id || '').catch(error=>({error:String(error)})):null};
          })()`);
          phase('beta_profile_failure_diagnostics', result.backendProfileBetaTimeout);
        }
      } catch (diagnosticError) { result.backendProfileBetaTimeoutDiagnosticError = String(diagnosticError.stack || diagnosticError); }
    }
    try { result.failureUi = await run("({assistant:document.querySelector('.space-assistant')?.innerText,chat:document.querySelector('.native-chat-main')?.innerText,sidebar:document.querySelector('.sidekick-sidebar')?.innerText,icon:document.querySelector('.copilot-toggle-btn')?.className,forms:[...document.querySelectorAll('.space-assistant form')].map(f=>f.className),dialogs:[...document.querySelectorAll('[role=dialog]')].map(d=>d.getAttribute('aria-label'))})"); } catch {}
    phase('fatal', { error: result.error, ui: result.failureUi }); }
  await end();
}
(process.argv.includes('--electron-child') ? electronChild() : parent()).catch(error => { phase('failed', { error: error.message }); process.exitCode = 1; });
