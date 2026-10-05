#!/usr/bin/env node
/*
 * Isolated real Main + preload + renderer + bundled Sidekick Local AI qualification probe.
 * No config.yaml/workspaces.json seed, external network, real user profile,
 * credential logging, shared dist, or package/build output is used.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const desktop = path.join(root, 'apps', 'desktop');
const python = path.join(desktop, 'runtime', 'python', 'python.exe');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// The Windows LocalAI guard reserves two SHA-256 path components plus the
// pinned filename below the userData cache. Keep this private probe profile
// short enough for the real Main guard to exercise it instead of rejecting
// the harness path itself.
const id = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
const buildRoot = path.join(root, 'out', `local-ai-full-app-${id}`);
const ownedRoot = path.join(root, 'output', `local-ai-full-app-${id}`);
const profileRoot = path.join(ownedRoot, 'profile');
const reportPath = path.join(ownedRoot, 'report.json');
const sourceFiles = [
  'apps/desktop/src/main/main.ts', 'apps/desktop/src/main/services.ts',
  'apps/desktop/src/main/independent-controller.ts', 'apps/desktop/src/main/sidekick-api.ts',
  'apps/desktop/src/main/preload.ts', 'apps/desktop/src/renderer/App.tsx',
  'apps/desktop/src/main/local-ai-controller.ts', 'apps/desktop/src/main/local-ai-role-profile.ts',
  'apps/desktop/src/renderer/components/LocalAiSetupPane.tsx',
  'apps/desktop/src/renderer/components/LocalAiChatQualification.tsx',
  'apps/desktop/src/renderer/local-ai-runtime-contracts.ts',
  'services/sidekick/web/api/local_ai_setup.py', 'services/sidekick/web/api/local_ai_runtime_host.py',
  'services/sidekick/runtime/local_ai/registry.py', 'services/sidekick/runtime/local_ai/installer.py',
  'apps/desktop/src/renderer/panels/TeamworkSettingsPanel.tsx',
  'apps/desktop/src/renderer/independent-assistant-controller.ts',
  'services/sidekick/web/api/independent.py', 'services/sidekick/runtime/independent/scope_binding.py',
  'services/sidekick/runtime/independent/scope.py', 'services/sidekick/web/api/profiles.py',
  'services/sidekick/cli/web_server.py'
];
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceSnapshot = () => Object.fromEntries(sourceFiles.map(file => [file, sha(path.join(root, file))]));
const confined = (target, base, prefix) => {
  const full = path.resolve(target), parent = path.resolve(base) + path.sep;
  if (!full.startsWith(parent) || !path.basename(full).startsWith(prefix)) throw Error('unsafe_probe_path');
  return full;
};
const cleanReason = (code, message) => {
  const text = String(message || '').toLowerCase();
  if (code === 'native_bridge_required') return 'bridge_authorization_rejected';
  if (text.includes('backend profile context does not match')) return 'request_actor_profile_mismatch';
  if (text.includes('backend profile is not configured')) return 'request_actor_profile_unconfigured';
  if (text.includes('no existing default workspace')) return 'default_workspace_missing';
  if (text.includes('workspace is not available')) return 'workspace_unavailable';
  if (text.includes('workspace is not registered') || text.includes('workspace is not uniquely registered')) return 'workspace_registration_rejected';
  if (text.includes('partition')) return 'partition_binding_rejected';
  if (text.includes('unknown space identity')) return 'unknown_native_space_identity';
  if (text.includes('native space identity')) return 'final_scope_identity_resolution_failed';
  if (text.includes('space locator')) return 'native_space_locator_changed';
  if (text.includes('profile is no longer available')) return 'profile_registry_mismatch';
  return code === 'scope_mismatch' || code === 'scope_denied' ? 'scope_denial_other' : 'backend_error_unclassified';
};
const inLoopback = value => {
  try { const host = new URL(value).hostname.toLowerCase(); return ['127.0.0.1', 'localhost', '[::1]'].includes(host); }
  catch { return false; }
};
const requestShape = body => {
  try {
    const request = JSON.parse(String(body || '{}'));
    const payload = request.payload && typeof request.payload === 'object' ? request.payload : {};
    return {
      scopeIsNull: request.scope === null,
      workspaceSelection: payload.workspacePath == null ? 'home' : 'explicit_workspace',
      browserProfileDefault: payload.browserProfileId === 'default',
      backendProfileDefault: payload.backendProfileName == null || payload.backendProfileName === 'default'
    };
  } catch { return { requestShape: 'unavailable' }; }
};

async function run(executable, args, cwd, name) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => {
      if (output.length < 24000) output += bytes.toString('utf8').slice(0, 24000 - output.length);
    });
    child.once('error', error => reject(Object.assign(new Error('probe_subprocess_spawn_failed'), { cause: error })));
    child.once('close', code => {
      if (code === 0) return resolve({ name, exitCode: code });
      const detail = name === 'vite-renderer' && /TeamworkSettingsPanel\.tsx:709/.test(output)
        ? 'renderer_jsx_parse_mismatch_TeamworkSettingsPanel_709_711'
        : `${name}_exit_${code}`;
      reject(Object.assign(new Error('probe_subprocess_failed'), { phase: name, exitCode: code, detail }));
    });
  });
}

async function parent() {
  const report = {
    schemaVersion: 1, probe: 'local-ai-full-app-qualification', startedAt: new Date().toISOString(),
    buildRoot, ownedRoot, privateUserData: path.join(profileRoot, 'user-data'),
    ownHome: path.join(profileRoot, 'ownHome'), workspace: path.join(profileRoot, 'ownHome', 'workspace'),
    sourceBuild: true, packageBuild: false, sharedDistUsed: false, sourceBefore: sourceSnapshot(),
    buildCommands: [], observations: [], localAiOperations: [], deniedExternalMainFetchCount: 0,
    defaultWorkspaceHintSet: false,
    requestActorModel: 'Main selects backendProfileName; sidekick-api sends it as sidekick_profile cookie. FastAPI request middleware populates the profile ContextVar; independent_operation derives actor from get_active_profile_name(). BrowserProfileId is a separate Main-validated payload field.',
    seedFilesBeforeStart: {}, profileCleanup: false, buildCleanup: false, childExit: null,
    limits: ['real source Main, preload and renderer with bundled Python 3.12 and in-tree Sidekick',
      'private unconfigured profile; no config.yaml or workspaces.json seed',
      'pinned 350M bytes are prepopulated into the owned app cache; the real installer verifies them offline',
      'runtime review/bootstrap/receipt/capability and ordinary local chat use real Main and bundled Sidekick',
      'not packaged/signed/release evidence']
  };
  let child = null;
  let timer = null;
  try {
    fs.mkdirSync(ownedRoot, { recursive: false });
    fs.mkdirSync(path.join(buildRoot, 'main'), { recursive: true });
    fs.mkdirSync(profileRoot, { recursive: true });
    for (const dir of [report.privateUserData, report.ownHome, report.workspace,
      path.join(profileRoot, 'app-data'), path.join(profileRoot, 'local-app-data'),
      path.join(profileRoot, 'temp'), path.join(profileRoot, 'guard')]) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(buildRoot, 'package.json'), JSON.stringify({ type: 'module' }));
    report.seedFilesBeforeStart = {
      configYamlExists: fs.existsSync(path.join(report.privateUserData, 'runtime', 'config.yaml')),
      workspacesRegistryExists: fs.existsSync(path.join(report.privateUserData, 'runtime', 'webui', 'workspaces.json'))
    };

    const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
    const mainArgs = [tsc, '-p', path.join(desktop, 'tsconfig.main.json'), '--outDir', path.join(buildRoot, 'main')];
    await run(process.execPath, mainArgs, root, 'tsc-main'); report.buildCommands.push({ name: 'tsc-main', exitCode: 0 });
    const esbuild = require('esbuild');
    await esbuild.build({ entryPoints: [path.join(desktop, 'src', 'main', 'preload.ts')],
      outfile: path.join(buildRoot, 'main', 'preload.cjs'), bundle: true, platform: 'node',
      format: 'cjs', target: 'node20', external: ['electron'] });
    report.buildCommands.push({ name: 'esbuild-preload', exitCode: 0 });
    await run(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build',
      '--config', path.join(desktop, 'vite.config.ts'), '--outDir', path.join(buildRoot, 'renderer')], desktop, 'vite-renderer');
    report.buildCommands.push({ name: 'vite-renderer', exitCode: 0 });
    report.sourceAfterBuild = sourceSnapshot();
    report.sourceChangedDuringBuild = JSON.stringify(report.sourceBefore) !== JSON.stringify(report.sourceAfterBuild);

    const guardSource = path.join(root, 'scripts', 'probe-full-app-network-guard.py');
    fs.copyFileSync(guardSource, path.join(profileRoot, 'guard', 'sitecustomize.py'));
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (/(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key)
        || /^(?:SIDEKICK|HERMES|LASTBROWSER)_/.test(key)
        || ['ELECTRON_RUN_AS_NODE', 'PYTHONPATH', 'PYTHONHOME'].includes(key)) delete env[key];
    }
    Object.assign(env, {
      LASTBROWSER_FULL_APP_PROBE_ROOT: profileRoot,
      LASTBROWSER_WEBUI_PYTHON: python,
      LASTBROWSER_DOWNLOADS_DIR: path.join(profileRoot, 'downloads'),
      LASTBROWSER_ENABLE_CDP: '0', PYTHONPATH: path.join(profileRoot, 'guard'),
      PYTHONDONTWRITEBYTECODE: '1', PYTHONNOUSERSITE: '1', PYTHONUNBUFFERED: '1',
      USERPROFILE: report.ownHome, HOME: report.ownHome,
      APPDATA: path.join(profileRoot, 'app-data'), LOCALAPPDATA: path.join(profileRoot, 'local-app-data'),
      TEMP: path.join(profileRoot, 'temp'), TMP: path.join(profileRoot, 'temp')
    });
    const electron = require('electron');
    const bootstrap = { buildRoot, userData: report.privateUserData, ownHome: report.ownHome, workspace: report.workspace };
    fs.writeFileSync(path.join(profileRoot, 'bootstrap.json'), JSON.stringify(bootstrap));
    const electronScript = path.join(__dirname, 'probe-local-ai-full-app.cjs');
    child = spawn(electron, [electronScript, '--electron-child', profileRoot], {
      cwd: root, env, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore']
    });
    report.childPid = child.pid ?? null;
    timer = setTimeout(() => { if (child && child.exitCode === null && child.signalCode === null) child.kill(); }, 300000);
    report.childExit = await new Promise((resolve, reject) => {
      child.once('error', error => reject(Object.assign(new Error('electron_spawn_failed'), { cause: error })));
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    clearTimeout(timer); timer = null;
    const childReport = path.join(profileRoot, 'child-report.json');
    if (fs.existsSync(childReport)) Object.assign(report, JSON.parse(fs.readFileSync(childReport, 'utf8')));
    report.pass = report.appShellLoaded === true && report.sidekickReady === true && report.localAi?.ready === true
      && report.localAi?.ordinaryChatAnswer === true && report.localAi?.reloadReady === true && report.localAi?.spaceBUnavailable === true;
    report.outcome = report.pass ? 'local_ai_full_flow_passed' : report.observations.some(row => row.status >= 200 && row.status < 300)
      ? 'main_started_local_ai_flow_incomplete' : 'scope_resolution_failed';
  } catch (error) {
    report.failurePhase = error.phase || 'probe';
    if (error.detail) report.failureDetail = error.detail;
    report.failureClass = error.exitCode !== undefined ? 'controlled_build_or_child_nonzero'
      : error.cause?.code === 'EPERM' ? 'spawn_blocked_by_sandbox' : 'probe_error';
    if (error.exitCode !== undefined) report.failureExitCode = error.exitCode;
  } finally {
    if (timer) clearTimeout(timer);
    if (child && child.exitCode === null && child.signalCode === null) {
      try { child.kill(); } catch {}
      await sleep(1000);
    }
    try {
      const actual = confined(buildRoot, path.join(root, 'out'), 'local-ai-full-app-');
      if (fs.existsSync(actual)) fs.rmSync(actual, { recursive: true, force: true });
      report.buildCleanup = !fs.existsSync(actual);
    } catch { report.buildCleanup = false; }
    try {
      const actual = confined(profileRoot, ownedRoot, 'profile');
      if (fs.existsSync(actual)) fs.rmSync(actual, { recursive: true, force: true });
      report.profileCleanup = !fs.existsSync(actual);
    } catch { report.profileCleanup = false; }
    const electronChildExited = report.childExit?.code === 0 && report.childExit?.signal === null;
    report.cleanup = {
      build: report.buildCleanup,
      profile: report.profileCleanup,
      electronChildExited,
      complete: report.buildCleanup === true && report.profileCleanup === true && electronChildExited
    };
    report.sourceAfterProbe = sourceSnapshot();
    report.sourceChangedDuringProbe = JSON.stringify(report.sourceBefore) !== JSON.stringify(report.sourceAfterProbe);
    report.finishedAt = new Date().toISOString();
    fs.mkdirSync(ownedRoot, { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ report: reportPath, outcome: report.outcome || report.failureClass || 'probe_incomplete',
      buildCommands: report.buildCommands, childExit: report.childExit, sourceChangedDuringProbe: report.sourceChangedDuringProbe,
      cleanup: report.cleanup }));
  }
  if (!report.pass && !report.failureClass) process.exitCode = 2;
  if (report.failureClass) process.exitCode = 1;
}

async function electronChild() {
  const { app, BrowserWindow, session, dialog } = require('electron');
  const owned = path.resolve(process.argv[process.argv.indexOf('--electron-child') + 1]);
  const bootstrap = JSON.parse(fs.readFileSync(path.join(owned, 'bootstrap.json'), 'utf8'));
  const report = { observations: [], rendererErrors: [], localAiIpc: [], externalRequestsBlocked: 0, sidecarPids: [], appShellLoaded: false,
    sidekickReady: false, firstRunUiVisible: false, autoResolveObserved: false, localAiOperations: [], localAi: null, cleanup: false };
  const probePython = path.join(root, 'apps', 'desktop', 'runtime', 'python', 'python.exe');
  const probeBinary = path.join(root, 'apps', 'desktop', 'runtime', 'local-ai', 'b11377-cpu', 'llama-server.exe');
  const probeCode = `import sys;sys.path.insert(0,${JSON.stringify(path.join(root, 'services', 'sidekick'))});from pathlib import Path;from runtime.local_ai.runtime_probe import _run_probe_process;print(_run_probe_process(Path(${JSON.stringify(probeBinary)}),('--version',),timeout=3)[0:3:2])`;
  const probeEnv = {};
  for (const name of ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']) if (process.env[name]) probeEnv[name] = process.env[name];
  const probe = spawnSync(probePython, ['-c', probeCode], { cwd: root, env: probeEnv, windowsHide: true, encoding: 'utf8', timeout: 10000 });
  report.runtimeSpawnComparison = { electronDirectPythonStatus: probe.status, electronDirectPythonErrorCode: probe.error?.code || null,
    electronDirectPythonSignal: probe.signal || null, output: (probe.stdout || '').trim().slice(0, 120), stderrBytes: Buffer.byteLength(probe.stderr || '') };
  app.setPath('userData', bootstrap.userData);
  app.setPath('sessionData', path.join(bootstrap.userData, 'session'));
  app.setPath('home', bootstrap.ownHome);
  app.setPath('appData', path.join(path.dirname(bootstrap.ownHome), 'app-data'));
  app.isDefaultProtocolClient = () => false;
  app.setAsDefaultProtocolClient = () => { throw Error('probe_os_protocol_registration_denied'); };
  app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost');
  for (const method of ['showErrorBox', 'showMessageBox', 'showMessageBoxSync']) {
    dialog[method] = () => { throw Error('probe_native_dialog_denied'); };
  }
  const childProcess = require('node:child_process');
  const { ipcMain } = require('electron');
  const originalHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) => originalHandle(channel, async (event, request) => {
    const localAiRequest = channel === 'lastbrowser:independent:request' && request?.operation === 'localAi';
    const observation = localAiRequest ? { action: request.payload?.action || null,
      setupOperation: request.payload?.action === 'setup' ? request.payload.request?.operation || null : null,
      runtimeOperation: request.payload?.action === 'runtime' ? request.payload.request?.operation || null : null,
      ...(request.payload?.action === 'setup' && request.payload.request?.operation === 'confirm' ? { expectedConfirm: {
        planDigest: request.payload.request.planDigest, licenseDigests: request.payload.request.licenseDigests,
        clientRequestId: request.payload.request.clientRequestId } } : {}) } : null;
    let value;
    try { value = await listener(event, request); }
    catch (error) {
      if (observation && report.localAiIpc.length < 80) report.localAiIpc.push({ ...observation, ok: false,
        errorCode: String(error?.code || error?.name || 'error').slice(0, 80),
        errorMessage: String(error?.message || 'request failed').slice(0, 160) });
      throw error;
    }
    if (observation && report.localAiIpc.length < 80) {
      const result = observation.action === 'recommend' ? value?.value?.result : null;
      const catalog = observation.action === 'catalog' ? value?.value?.catalog : null;
      const plan = observation.action === 'setup' && observation.setupOperation === 'plan' ? value?.value?.plan : null;
      const jobs = observation.action === 'setup' && observation.setupOperation === 'status' ? value?.value?.jobs : null;
      const runtimeResult = observation.action === 'runtime' ? value?.value : null;
      const consent = observation.action === 'setup' && observation.setupOperation === 'confirm' ? value?.value?.consent : null;
      const job = observation.action === 'setup' && ['start', 'status'].includes(observation.setupOperation) ? value?.value?.job : null;
      report.localAiIpc.push({ ...observation, ok: value?.ok === true,
        errorCode: value?.ok === false ? String(value.error?.code || 'unknown').slice(0, 80) : null,
        errorMessage: value?.ok === false ? String(value.error?.message || '').replace(/[^a-zA-Z0-9_.: -]/g, '_').slice(0, 160) : null,
        setupDecision: value?.ok === true ? value.value?.preferences?.decision || null : null,
        ...(catalog ? { catalogArtifacts: catalog.artifacts.map(item => ({ artifactId: item.artifactId, manifestComplete: item.manifestComplete })) } : {}),
        ...(plan ? { plan: { planId: plan.planId, planDigest: plan.planDigest, setupRevision: plan.setupRevision,
          artifacts: plan.artifacts.map(item => ({ ...item, files: item.files.map(file => ({ ...file })) })) } } : {}),
        ...(Array.isArray(jobs) ? { jobs: jobs.map(job => ({ state: job.state, errorCode: job.errorCode,
          downloadedBytes: job.downloadedBytes, verifiedBytes: job.verifiedBytes, totalBytes: job.totalBytes })) } : {}),
        ...(consent ? { consent: { scope: consent.scope, authority: consent.authority, planDigest: consent.planDigest,
          licenseDigests: consent.licenseDigests, confirmedAt: consent.confirmedAt, clientRequestId: consent.clientRequestId } } : {}),
        ...(runtimeResult ? { runtimeResult: { operation: runtimeResult.operation, state: runtimeResult.state,
          available: runtimeResult.available, executionUnavailable: runtimeResult.executionUnavailable,
          reasonCode: runtimeResult.reasonCode, diagnosticOnly: runtimeResult.diagnosticOnly,
          releaseRedistributionVerified: runtimeResult.releaseRedistributionVerified,
          operationVerified: runtimeResult.operationVerified, qualityPassed: runtimeResult.qualityPassed, sloPassed: runtimeResult.sloPassed,
          synthetic: runtimeResult.synthetic, samples: runtimeResult.samples, productChatQualified: runtimeResult.productChatQualified } } : {}),
        ...(job ? { job: { state: job.state, errorCode: job.errorCode,
          downloadedBytes: job.downloadedBytes, verifiedBytes: job.verifiedBytes, totalBytes: job.totalBytes } } : {}),
        ...(result ? { recommendationState: result.state, candidateState: result.chatQualificationCandidate?.state || null,
          candidateArtifactId: result.chatQualificationCandidate?.artifactId || null,
          reasonCodes: (result.reasonCodes || []).slice(0, 6) } : {}) });
    }
    return value;
  });
  const originalSpawn = childProcess.spawn;
  childProcess.spawn = (exe, args, options) => {
    const spawned = originalSpawn(exe, args, options);
    if (spawned.pid) report.sidecarPids.push(spawned.pid);
    return spawned;
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    if (!inLoopback(url) && !url.startsWith('app:')) {
      report.externalRequestsBlocked++;
      throw Error('probe_external_main_fetch_denied');
    }
    const response = await originalFetch(input, init);
    const pathname = new URL(url).pathname;
    if (/\/api\/independent\/v1\/localAi(?:\.|\/)/.test(pathname)) {
      let body = {};
      try { body = JSON.parse(init.body || '{}'); } catch {}
      const operation = body.payload?.request?.operation || null;
      report.localAiOperations.push({ endpoint: pathname.split('/').at(-1), action: body.payload?.action || null,
        actionOperation: operation, status: response.status });
      if (pathname.endsWith('localAi.runtime') && operation === 'review') {
        let data = {};
        try { data = await response.clone().json(); } catch {}
        const review = data?.review || data?.value?.review || data;
        report.runtimeReview = { keys: Object.keys(review || {}).slice(0, 32), operation: review?.operation || null,
          artifactId: review?.artifactId || null, artifactRevision: review?.artifactRevision || null, role: review?.role || null,
          available: review?.available, operationVerified: review?.operationVerified, purposeDigestValid: /^[a-f0-9]{64}$/i.test(review?.purposeDigest || ''),
          expiresAt: review?.expiresAt || null, runtimeBuildRef: review?.runtimeBuildRef || null, contextTokens: review?.contextTokens || null,
          parallelRequests: review?.parallelRequests || null, budgetSeconds: review?.budgetSeconds || null,
          ramLimitBytes: review?.ramLimitBytes || null, reasonCode: review?.reasonCode || null };
      }
      if (pathname.endsWith('localAi.setup') && body.payload?.request?.operation === 'get') {
        let data = {};
        try { data = await response.clone().json(); } catch {}
        report.localAiPreferenceDecisions = report.localAiPreferenceDecisions || [];
        report.localAiPreferenceDecisions.push(data.preferences?.decision || data.value?.preferences?.decision || 'unknown');
      }
    }
    if (pathname === '/api/independent/v1/resolveScope') {
      let body = null;
      try { body = await response.clone().json(); } catch {}
      const error = body && body.error && typeof body.error === 'object' ? body.error : {};
      const observation = {
        status: response.status,
        errorCode: response.ok ? null : String(error.code || 'missing_error_code').slice(0, 128),
        sanitizedReason: response.ok ? 'resolved' : cleanReason(error.code, error.message),
        retryable: !response.ok && error.retryable === true,
        requestShape: requestShape(init.body),
        source: 'actual_Main_apiRequest_observed_during_renderer_startup'
      };
      report.observations.push(observation);
      report.autoResolveObserved = true;
      fs.writeFileSync(path.join(owned, 'child-report.json'), JSON.stringify(report, null, 2));
    }
    return response;
  };
  require('node:module').syncBuiltinESMExports();
  app.once('ready', () => {
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      callback(inLoopback(details.url) ? {} : { cancel: true });
    });
  });
  let window;
  const waitUntil = async (predicate, labelOrMs, maybeMs) => {
    const ms = typeof labelOrMs === 'number' ? labelOrMs : maybeMs;
    if (!Number.isFinite(ms)) throw Error('invalid_probe_wait_timeout');
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      try { if (await predicate()) return true; } catch {}
      await sleep(150);
    }
    return false;
  };
  const runInRenderer = code => window.webContents.executeJavaScript(code, true);
  const clickMatching = async (selector, pattern) => {
    const clicked = await runInRenderer(`(()=>{const r=${pattern};const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(x=>r.test((x.innerText||'')+' '+(x.getAttribute('aria-label')||'')));if(!e)return false;e.click();return true})()`);
    if (!clicked) throw Error(`probe_click_target_not_found_${selector.replace(/[^a-z0-9_.-]/gi, '_')}`);
    return true;
  };
  const bridge = async (operation, scope, payload) => {
    const request = { schemaVersion: 1, operation, ...(scope ? { scope } : {}), payload };
    const answer = await runInRenderer(`window.lastbrowser.independent.request(${JSON.stringify(request)})`);
    if (!answer?.ok) throw Error('bridge_' + operation + '_' + String(answer?.error?.code || 'failed'));
    return answer.value;
  };
  try {
    await import(pathToFileURL(path.join(bootstrap.buildRoot, 'main', 'main.js')).href);
    await app.whenReady();
    const windows = BrowserWindow.getAllWindows();
    window = windows.find(item => !item.isDestroyed() && item.webContents.getURL().startsWith('app://'));
    if (!window) {
      await waitUntil(() => { window = BrowserWindow.getAllWindows().find(item => !item.isDestroyed()
        && item.webContents.getURL().startsWith('app://')); return Boolean(window); }, 20000);
    }
    if (!window) throw Error('genuine_main_window_not_created');
    window.minimize();
    window.webContents.on('console-message', (_event, level, message) => {
      if (level >= 2 && report.rendererErrors.length < 20) report.rendererErrors.push(String(message)
        .replace(/[A-Z]:\\[^\s"']+/gi, '<path>').slice(0, 300));
    });
    window.webContents.on('render-process-gone', (_event, details) => { report.renderGoneReason = details.reason; });
    report.appShellLoaded = await waitUntil(() => runInRenderer("Boolean(window.lastbrowser&&document.querySelector('.app-shell'))"), 30000);
    report.firstRunUiVisible = await runInRenderer("Boolean(document.querySelector('[role=dialog][aria-label=\\\"First-run setup\\\"]'))");
    report.firstRunButtons = await runInRenderer("[...document.querySelectorAll('[role=dialog] button, .footer-link-btn')].map(e=>(e.innerText||e.getAttribute('aria-label')||'').trim()).filter(Boolean).slice(0,30)");
    report.activePathMode = await runInRenderer("localStorage.getItem('lastbrowser.activeSpacePath.v1') ? 'explicit_path' : 'browser_home'");
    report.sidekickReady = await waitUntil(() => runInRenderer("window.lastbrowser.services.status().then(s=>s.sidekick==='ready'&&s.webuiHealth==='ready')"), 65000);
    if (report.sidekickReady) {
      await waitUntil(() => report.autoResolveObserved, 25000);
      await sleep(1500); // Include any second overlapping first-launch resolution.
    }
    if (report.sidekickReady) {
      const localAi = report.localAi = { phase: 'open-settings', cachePrepopulated: false, installerVerified: false,
        qualificationReady: false, ordinaryChatAnswer: false, reloadReady: false, spaceBUnavailable: false };
      localAi.rendererServiceStatus = await runInRenderer("window.lastbrowser.services.status().then(s=>({sidekick:s.sidekick,webuiHealth:s.webuiHealth,hasWebuiUrl:Boolean(s.webuiUrl)}))");
      if (report.firstRunUiVisible) {
        // Exercise the actual persisted skip inside First-run, then reopen
        // Settings through the separate header dismissal action.
        if (!await waitUntil(() => runInRenderer("[...document.querySelectorAll('.first-run-fullscreen-wrap .local-ai-setup button')].some(x=>/without local ai|ohne lokale ki fortfahren/i.test(x.innerText||'')&&!x.disabled)"), 20000))
          throw Error('first_run_local_ai_skip_not_ready');
        await clickMatching('.first-run-fullscreen-wrap .local-ai-setup button', '/without local ai|ohne lokale ki fortfahren/i');
        if (!await waitUntil(() => report.localAiIpc.some(row => row.setupOperation === 'select' && row.setupDecision === 'skip'), 10000))
          throw Error('first_run_skip_choice_not_persisted');
        // This similarly worded button only dismisses the dialog; it does not
        // alter the per-Space LocalAI choice.
        await clickMatching('.first-run-skip-btn', '/browse without|skip without|ohne ki|without ai/i');
        if (!await waitUntil(() => runInRenderer("!document.querySelector('[role=dialog][aria-label=\"First-run setup\"]')"), 'dismiss First-run setup', 15000)) throw Error('first_run_dismiss_timeout');
      }
      report.settingsTargets = await runInRenderer("[...document.querySelectorAll('button')].filter(e=>/settings|einstellungen/i.test((e.innerText||'')+' '+(e.title||'')+' '+(e.getAttribute('aria-label')||''))).map(e=>({text:(e.innerText||'').trim().slice(0,60),title:(e.title||'').slice(0,60),aria:(e.getAttribute('aria-label')||'').slice(0,60),className:String(e.className).slice(0,80)})).slice(0,12)");
      await clickMatching('.nova-dock-btn', '/settings|einstellungen/i');
      await waitUntil(() => runInRenderer("Boolean(document.querySelector('.settings-section-nav'))"), 'Settings navigation', 15000);
      await clickMatching('.settings-section-nav button', '/AI & local models|KI & lokale Modelle|intelligenza artificiale|modelos locales|modèles locaux|modelos locais|локальные модели|ローカルモデル/i');
      await waitUntil(() => runInRenderer("Boolean(document.querySelector('.local-ai-setup'))"), 'Local AI settings pane', 20000);
      const candidateReady = await waitUntil(() => runInRenderer("document.querySelector('[data-local-ai-chat-candidate]')?.getAttribute('data-local-ai-chat-candidate')==='ready_to_download'"), 'eligible pinned local chat recommendation', 30000);
      if (!candidateReady) {
        localAi.candidateSnapshot = await runInRenderer("(()=>{const p=document.querySelector('.local-ai-setup'),e=document.querySelector('[data-local-ai-chat-candidate]');return{pane:!!p,alerts:[...(p?.querySelectorAll('[role=alert]')||[])].map(x=>(x.innerText||'').slice(0,180)),steps:[...(p?.querySelectorAll('.local-ai-step')||[])].map(s=>({state:s.getAttribute('data-state'),model:(s.querySelector('.local-ai-model')?.innerText||'').slice(0,240),status:[...s.querySelectorAll('[role=status],[role=alert]')].map(x=>(x.innerText||'').slice(0,180))})),candidate:e?{state:e.getAttribute('data-local-ai-chat-candidate'),summary:(e.innerText||'').slice(0,300)}:null,buttons:[...(p?.querySelectorAll('button')||[])].map(x=>(x.innerText||'').trim().slice(0,80)).filter(Boolean).slice(0,20)}})()");
        throw Error('local_ai_candidate_not_eligible');
      }
      localAi.phase = 'candidate-ready';
      localAi.candidateButtonBefore = await runInRenderer("(()=>{const p=document.querySelector('.settings-editor .local-ai-setup'),e=p?.querySelector('[data-local-ai-chat-candidate] button');window.__probeCandidateClicks=0;if(e)document.addEventListener('click',event=>{if(event.target instanceof Element&&event.target.closest('.settings-editor .local-ai-setup [data-local-ai-chat-candidate] button'))window.__probeCandidateClicks++},true);return{paneCount:document.querySelectorAll('.settings-editor .local-ai-setup').length,candidateCount:p?.querySelectorAll('[data-local-ai-chat-candidate]').length||0,text:e?.innerText||null,disabled:e?.disabled??null,matchesDisabled:e?.matches(':disabled')??null,visible:e?!!(e.getClientRects().length):false,html:e?.outerHTML||null}})()");
      const candidateActionReady = await waitUntil(() => runInRenderer("(()=>{const e=document.querySelector('.settings-editor .local-ai-setup [data-local-ai-chat-candidate] button');return Boolean(e&&!e.disabled)})()"), 'chat candidate setup action enabled', 15000);
      if (!candidateActionReady) throw Error('local_ai_candidate_action_disabled');
      await clickMatching('.settings-editor .local-ai-setup [data-local-ai-chat-candidate] button', '/set up local short answers|lokale kurzantworten einrichten|configura le risposte|configurar respuestas|configurer les réponses|configurar respostas|настроить короткие|ローカル短文回答を設定/i');
      const localChoiceAccepted = await waitUntil(() => report.localAiIpc.some(row => row.setupOperation === 'select' && row.setupDecision === 'local'), 'explicit local model choice', 30000);
      if (!localChoiceAccepted) localAi.candidateButtonAfter = await runInRenderer("(()=>({clicks:window.__probeCandidateClicks,button:document.querySelector('.settings-editor .local-ai-setup [data-local-ai-chat-candidate] button')?.outerHTML||null,alerts:[...document.querySelectorAll('.settings-editor .local-ai-setup [role=alert]')].map(e=>({text:e.innerText,code:e.getAttribute('data-error-code')})),statuses:[...document.querySelectorAll('.settings-editor .local-ai-setup [role=status]')].map(e=>(e.innerText||'').slice(0,120)),pane:document.querySelector('.settings-editor .local-ai-setup')?.innerText.slice(0,700)}))()");
      if (!localChoiceAccepted) throw Error('local_ai_candidate_choice_not_accepted');
      await waitUntil(() => runInRenderer("Boolean(document.querySelector('.local-ai-plan'))"), 'exact model and license plan', 30000);
      const uiPlan = report.localAiIpc.findLast(row => row.setupOperation === 'plan' && row.ok && row.plan)?.plan;
      if (!uiPlan) throw Error('local_ai_ui_plan_not_returned');
      const plan = uiPlan;
      const artifact = plan.artifacts.find(item => item.artifactId === 'LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0'
        && item.revision === '9969000761ce34de907bf20017cbfc3d52d6eaf9');
      if (!artifact || !Array.isArray(artifact.files) || artifact.files.length !== 2) throw Error('pinned_chat_plan_mismatch');
      const workspacePath = await runInRenderer("localStorage.getItem('lastbrowser.activeSpacePath.v1')||null");
      const resolved = await bridge('resolveScope', null, { workspacePath, browserProfileId: 'default' });
      const scope = resolved.scope;
      const sourceRoot = path.join(root, 'output', 'local-ai-model-cache-350m');
      const modelSource = path.join(sourceRoot, 'LFM2.5-350M-QAD-Q4_0.gguf');
      const licenseSource = path.join(sourceRoot, 'LICENSE');
      const cacheRoot = path.join(bootstrap.userData, 'local-ai', 'cache');
      const cacheDir = path.join(cacheRoot, plan.planDigest, crypto.createHash('sha256').update(artifact.artifactId).digest('hex'));
      fs.mkdirSync(cacheDir, { recursive: true });
      for (const file of artifact.files) {
        const source = file.kind === 'weights' ? modelSource : file.kind === 'license' ? licenseSource : null;
        if (!source || sha(source) !== file.sha256 || fs.statSync(source).size !== file.bytes) throw Error('pinned_source_hash_or_size_mismatch');
        const target = path.resolve(cacheDir, file.relativePath);
        if (!target.startsWith(cacheDir + path.sep)) throw Error('unsafe_model_cache_target');
        fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target);
      }
      localAi.cachePrepopulated = true;
      localAi.cacheSourceHashesValid = artifact.files.every(file => sha(path.join(cacheDir, file.relativePath)) === file.sha256);
      if (!localAi.cacheSourceHashesValid) throw Error('prefilled_cache_verification_failed');
      localAi.phase = 'await-consent';
      await runInRenderer("(()=>{const e=document.querySelector('.local-ai-plan input[type=checkbox]');if(!e)throw Error('exact-license-consent-checkbox-missing');if(!e.checked)e.click();return e.checked})()");
      await clickMatching('.local-ai-plan button:not([disabled])', '/start download|download starten|avvia il download|iniciar descarga|démarrer le téléchargement|iniciar download|загрузить|ダウンロードを開始/i');
      localAi.phase = 'installing';
      const installDeadline = Date.now() + 30000; let completed = null;
      while (Date.now() < installDeadline) {
        const status = await bridge('localAi', scope, { action: 'setup', request: { operation: 'status' } });
        completed = (status.jobs || []).find(job => job.planDigest === plan.planDigest && job.state === 'complete');
        if (completed) break; await sleep(1000);
      }
      if (!completed) {
        localAi.installStatusFailure = await runInRenderer("(()=>({alerts:[...document.querySelectorAll('.settings-editor .local-ai-setup [role=alert]')].map(e=>({text:e.innerText,code:e.getAttribute('data-error-code')})),planButtons:[...document.querySelectorAll('.settings-editor .local-ai-setup .local-ai-plan button')].map(e=>({text:e.innerText,disabled:e.disabled}))}))()");
        throw Error('validated_install_did_not_complete');
      }
      localAi.installerVerified = completed.verifiedBytes === completed.totalBytes;
      if (!localAi.installerVerified) throw Error('installer_did_not_verify_all_pinned_bytes');
      localAi.phase = 'qualifying';
      const qualificationFinished = await waitUntil(() => runInRenderer("['ready','failed'].includes(document.querySelector('.local-ai-runtime')?.getAttribute('data-local-ai-qualification'))"), 'actual Main runtime qualification result', 30000);
      const ready = await runInRenderer("document.querySelector('.local-ai-runtime')?.getAttribute('data-local-ai-qualification')==='ready'");
      if (!qualificationFinished || !ready) {
        localAi.qualificationFailure = await runInRenderer("(()=>({phase:document.querySelector('.local-ai-runtime')?.getAttribute('data-local-ai-qualification')||null,text:(document.querySelector('.local-ai-runtime')?.innerText||'').slice(0,400)}))()");
        throw Error('local_ai_runtime_qualification_not_ready');
      }
      const capability = await bridge('localAi', scope, { action: 'runtime', request: { operation: 'capability' } });
      if (capability.state !== 'ready' || capability.artifactRevision !== artifact.revision || capability.contextTokens !== 1024) throw Error('local_ai_capability_mismatch');
      const roleProfile = await bridge('localAi', scope, { action: 'roleProfile', request: { operation: 'read' } });
      if (!(roleProfile.profile?.selections || []).some(item => item.task === 'chat.answer' && item.artifactId === artifact.artifactId && item.contextTokens === 1024))
        throw Error('chat_answer_role_not_bound');
      localAi.capabilityState = capability.state; localAi.qualityEvidencePresent = Boolean(capability.qualityEvidenceRef);
      localAi.roleBindingPreserved = true; localAi.qualificationReady = true; localAi.phase = 'qualified';
      fs.writeFileSync(path.join(owned, 'child-report.json'), JSON.stringify(report, null, 2));
    }
    report.rendererErrorVisible = await runInRenderer("Boolean(document.querySelector('.space-assistant [role=alert]'))");
    report.sidecarPids = [...new Set(report.sidecarPids)];
  } catch (error) {
    report.childFailureClass = String(error.message || 'probe_child_error').replace(/[^a-zA-Z0-9_:-]/g, '_').slice(0, 100);
  } finally {
    fs.writeFileSync(path.join(owned, 'child-report.json'), JSON.stringify(report, null, 2));
    if (app.isReady()) {
      app.quit();
      setTimeout(() => app.exit(report.autoResolveObserved ? 0 : 2), 12000).unref();
    } else app.exit(2);
  }
}

(process.argv.includes('--electron-child') ? electronChild() : parent()).catch(error => {
  if (process.argv.includes('--electron-child')) {
    try {
      const owned = path.resolve(process.argv[process.argv.indexOf('--electron-child') + 1]);
      const code = error?.code === 'EPERM' ? 'sandbox_spawn_blocked'
        : String(error?.message || 'probe_child_error').replace(/[^a-zA-Z0-9_:-]/g, '_').slice(0, 100);
      fs.writeFileSync(path.join(owned, 'child-report.json'), JSON.stringify({
        observations: [], appShellLoaded: false, sidekickReady: false, childFailureClass: code
      }));
      try { require('electron').app.quit(); } catch {}
      setTimeout(() => { try { require('electron').app.exit(1); } catch {} }, 1000).unref();
    } catch {}
  }
  process.exitCode = 1;
});
