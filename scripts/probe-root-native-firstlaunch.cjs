#!/usr/bin/env node
/*
 * Isolated real Main + preload + renderer + bundled Sidekick first-launch probe.
 * No config.yaml/workspaces.json seed, external network, real user profile,
 * credential logging, shared dist, or package/build output is used.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const desktop = path.join(root, 'apps', 'desktop');
const python = path.join(desktop, 'runtime', 'python', 'python.exe');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}`;
const buildRoot = path.join(root, 'out', `root-native-firstlaunch-${id}`);
const ownedRoot = path.join(root, 'output', `root-native-firstlaunch-${id}`);
const profileRoot = path.join(ownedRoot, 'profile');
const reportPath = path.join(ownedRoot, 'report.json');
const emptyWorkspace = process.argv.includes('--empty-workspace');
const sourceFiles = [
  'apps/desktop/src/main/main.ts', 'apps/desktop/src/main/services.ts',
  'apps/desktop/src/main/independent-controller.ts', 'apps/desktop/src/main/sidekick-api.ts',
  'apps/desktop/src/main/preload.ts', 'apps/desktop/src/renderer/App.tsx',
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
    schemaVersion: 1, probe: 'root-native-firstlaunch', startedAt: new Date().toISOString(),
    buildRoot, ownedRoot, privateUserData: path.join(profileRoot, 'user-data'),
    ownHome: path.join(profileRoot, 'ownHome'), workspace: path.join(profileRoot, 'ownHome', 'workspace'),
    sourceBuild: true, packageBuild: false, sharedDistUsed: false, sourceBefore: sourceSnapshot(),
    buildCommands: [], observations: [], deniedExternalMainFetchCount: 0,
    defaultWorkspaceHintSet: false,
    emptyWorkspaceAtLaunch: emptyWorkspace,
    requestActorModel: 'Main selects backendProfileName; sidekick-api sends it as sidekick_profile cookie. FastAPI request middleware populates the profile ContextVar; independent_operation derives actor from get_active_profile_name(). BrowserProfileId is a separate Main-validated payload field.',
    seedFilesBeforeStart: {}, profileCleanup: false, buildCleanup: false, childExit: null,
    limits: ['real source Main, preload and renderer with bundled Python 3.12 and in-tree Sidekick',
      'private unconfigured profile; no config.yaml or workspaces.json seed',
      'only HTTP resolveScope status/code/sanitized reason plus nonsecret request-shape categories are recorded',
      'not packaged/signed/release evidence']
  };
  let child = null;
  let timer = null;
  try {
    fs.mkdirSync(ownedRoot, { recursive: false });
    fs.mkdirSync(path.join(buildRoot, 'main'), { recursive: true });
    fs.mkdirSync(profileRoot, { recursive: true });
    for (const dir of [report.privateUserData, report.ownHome, ...(!emptyWorkspace ? [report.workspace] : []),
      path.join(profileRoot, 'app-data'), path.join(profileRoot, 'local-app-data'),
      path.join(profileRoot, 'temp'), path.join(profileRoot, 'guard')]) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(buildRoot, 'package.json'), JSON.stringify({ type: 'module' }));
    report.seedFilesBeforeStart = {
      configYamlExists: fs.existsSync(path.join(report.privateUserData, 'runtime', 'config.yaml')),
      workspacesRegistryExists: fs.existsSync(path.join(report.privateUserData, 'runtime', 'webui', 'workspaces.json'))
    };
    report.workspaceDirectoryExistsBeforeStart = fs.existsSync(report.workspace);

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
    const electronScript = path.join(__dirname, 'probe-root-native-firstlaunch.cjs');
    child = spawn(electron, [electronScript, '--electron-child', profileRoot], {
      cwd: root, env, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore']
    });
    report.childPid = child.pid ?? null;
    timer = setTimeout(() => { if (child && child.exitCode === null && child.signalCode === null) child.kill(); }, 140000);
    report.childExit = await new Promise((resolve, reject) => {
      child.once('error', error => reject(Object.assign(new Error('electron_spawn_failed'), { cause: error })));
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    clearTimeout(timer); timer = null;
    const childReport = path.join(profileRoot, 'child-report.json');
    if (fs.existsSync(childReport)) Object.assign(report, JSON.parse(fs.readFileSync(childReport, 'utf8')));
    report.pass = report.appShellLoaded === true && report.sidekickReady === true && report.observations.length > 0;
    report.outcome = report.observations.some(row => row.status === 403) ? 'http_403_reproduced'
      : report.observations.some(row => row.status >= 200 && row.status < 300) ? 'resolve_scope_succeeded'
        : report.observations.length ? 'other_http_result' : 'automatic_ui_resolve_scope_not_observed';
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
      const actual = confined(buildRoot, path.join(root, 'out'), 'root-native-firstlaunch-');
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
  const report = { observations: [], externalRequestsBlocked: 0, sidecarPids: [], appShellLoaded: false,
    sidekickReady: false, firstRunUiVisible: false, autoResolveObserved: false, cleanup: false };
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
    if (new URL(url).pathname === '/api/independent/v1/resolveScope') {
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
  const waitUntil = async (predicate, ms) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      try { if (await predicate()) return true; } catch {}
      await sleep(150);
    }
    return false;
  };
  const runInRenderer = code => window.webContents.executeJavaScript(code, true);
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
    report.appShellLoaded = await waitUntil(() => runInRenderer("Boolean(window.lastbrowser&&document.querySelector('.app-shell'))"), 30000);
    report.firstRunUiVisible = await runInRenderer("Boolean(document.querySelector('[role=dialog][aria-label=\\\"First-run setup\\\"]'))");
    report.activePathMode = await runInRenderer("localStorage.getItem('lastbrowser.activeSpacePath.v1') ? 'explicit_path' : 'browser_home'");
    report.sidekickReady = await waitUntil(() => runInRenderer("window.lastbrowser.services.status().then(s=>s.sidekick==='ready'&&s.webuiHealth==='ready')"), 65000);
    if (report.sidekickReady) {
      await waitUntil(() => report.autoResolveObserved, 25000);
      await sleep(1500); // Include any second overlapping first-launch resolution.
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
