#!/usr/bin/env node
// Reproduce Settings -> Providers/Plugins in the unsigned packaged preview.
// Uses an owned userData profile and an exhausted bootstrap state to prevent downloads.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
assert.equal(typeof globalThis.WebSocket, 'function', 'Use the existing Node WebSocket runtime');

const root = path.resolve(__dirname, '../../..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function responseShape(value) {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) return { type: 'array', length: value.length, itemKeys: value.length && value[0] && typeof value[0] === 'object' ? Object.keys(value[0]).sort() : [] };
  if (typeof value !== 'object') return { type: typeof value };
  const result = { type: 'object', keys: Object.keys(value).sort() };
  for (const key of ['plugins', 'items', 'groups', 'models', 'fallback_model']) {
    if (Object.hasOwn(value, key)) result[key] = responseShape(value[key]);
  }
  return result;
}

async function main() {
  const preview = fs.realpathSync(path.resolve(process.argv[2] || ''));
  assert(preview.startsWith(fs.realpathSync(path.join(root, 'output')) + path.sep));
  const receipt = JSON.parse(fs.readFileSync(path.join(preview, 'preview-result.json'), 'utf8'));
  assert(receipt.unsigned && !receipt.published && !receipt.error);
  const owned = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-settings-packaged-'));
  const userData = path.join(owned, 'profile');
  const runtime = path.join(userData, 'runtime');
  const bootstrapDirectory = path.join(runtime, 'webui', 'local-ai-bootstrap');
  fs.mkdirSync(bootstrapDirectory, { recursive: true });
  fs.writeFileSync(path.join(bootstrapDirectory, 'router.json'), JSON.stringify({
    schemaVersion: 1, installKey: 'router-lfm2.5-230m-qad-q4_0-v1', revision: 1, state: 'failed',
    jobId: null, attempt: 3, downloadedBytes: 0, verifiedBytes: 0, totalBytes: 149091630,
    artifactId: 'LiquidAI/LFM2.5-230M-GGUF:LFM2.5-230M-QAD-Q4_0', artifactRevision: 'b27f8147d98080b0d6f063ff41de6e381ea9a530',
    sha256: 'e75f83268de11b2a1bcfab5f3b5c5c0c97569ddbbc0990aad88437e45b8ba292',
    licenseLabel: 'LFM Open License v1.0', licenseUrl: 'https://huggingface.co/LiquidAI/LFM2.5-230M-GGUF/blob/b27f8147d98080b0d6f063ff41de6e381ea9a530/LICENSE',
    commercialThresholdUsd: 10000000, executionUnavailable: true, errorCode: 'isolated_test_no_download',
    updatedAt: new Date().toISOString(), lastRequestIds: []
  }));

  const port = await freePort();
  const report = { schemaVersion: 1, preview, owned, userData, runtime, directExecutable: true, passed: false,
    bootstrapDownloadPrevented: true, apiShapes: {}, errorBoundary: [], consoleErrors: [],
    limits: ['Isolated package smoke only; no real user profile', 'No bootstrap/model download or inference'] };
  const env = {};
  for (const name of ['SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATH', 'PATHEXT', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMDATA']) if (process.env[name]) env[name] = process.env[name];
  for (const [name, relative] of Object.entries({ USERPROFILE: 'home', APPDATA: 'appdata', LOCALAPPDATA: 'localappdata', TEMP: 'tmp', TMP: 'tmp' })) {
    env[name] = path.join(owned, relative); fs.mkdirSync(env[name], { recursive: true });
  }
  env.LASTBROWSER_DOWNLOADS_DIR = path.join(owned, 'downloads');
  fs.mkdirSync(env.LASTBROWSER_DOWNLOADS_DIR, { recursive: true });
  let task, socket, sequence = 0, log = '';
  const pending = new Map();
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout:' + method)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  try {
    task = spawn(path.join(preview, 'win-unpacked', 'Lastbrowser.exe'), [`--user-data-dir=${userData}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'],
      { cwd: path.join(preview, 'win-unpacked'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    task.once('error', error => { report.spawnError = String(error); });
    for (const pipe of [task.stdout, task.stderr]) pipe.on('data', bytes => { log += bytes; });
    let target;
    const deadline = Date.now() + 100000;
    while (Date.now() < deadline && !target) {
      if (task.exitCode !== null || task.signalCode !== null) throw Error('EXE exited before app renderer loaded');
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(row => row.type === 'page' && row.url.startsWith('app://')); } catch {}
      if (!target) await sleep(250);
    }
    assert(target, 'Actual packaged app:// renderer appeared');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.consoleAPICalled') {
        const args = message.params.args || [];
        const first = args[0]?.value;
        if (typeof first === 'string' && /Panel render failed/.test(first)) {
          report.errorBoundary.push(args.map(arg => ({ type: arg.type, value: arg.value, description: arg.description })).slice(0, 4));
        } else if (message.params.type === 'error') {
          const text = args.map(arg => arg.value ?? arg.description ?? '').join(' ').slice(0, 1000);
          if (/Cannot convert undefined or null to object|Panel render failed|Uncaught/.test(text)) report.consoleErrors.push(text);
        }
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const description = message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || '';
        if (/Cannot convert undefined or null to object/.test(description)) report.consoleErrors.push(description.slice(0, 2000));
        return;
      }
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id); clearTimeout(waiter.timer);
      if (message.error) waiter.reject(Error(JSON.stringify(message.error))); else waiter.resolve(message.result);
    });
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    await call('Runtime.enable');
    let appReady = false;
    const readyUntil = Date.now() + 100000;
    while (Date.now() < readyUntil && !appReady) {
      const state = await evaluate(`(async()=>({shell:!!document.querySelector('.app-shell'),status:window.lastbrowser?await window.lastbrowser.services.status():null}))()`);
      report.appState = { shell: state.shell, status: state.status && { sidekick: state.status.sidekick, webuiHealth: state.status.webuiHealth, runtimeDir: state.status.runtimeDir } };
      appReady = state.shell && state.status?.sidekick === 'ready' && state.status?.webuiHealth === 'ready';
      if (!appReady) await sleep(350);
    }
    assert(appReady, 'Packaged Sidekick backend healthy');
    assert(path.resolve(report.appState.status.runtimeDir).startsWith(path.resolve(owned) + path.sep), 'Backend runtime belongs to test profile');
    const bootstrapStatus = JSON.parse(fs.readFileSync(path.join(bootstrapDirectory, 'router.json'), 'utf8'));
    assert.equal(bootstrapStatus.state, 'failed', 'Bootstrap remains in the intentionally download-free state');
    assert.equal(bootstrapStatus.attempt, 3, 'Bootstrap did not retry');
    assert.equal(bootstrapStatus.downloadedBytes, 0, 'Bootstrap did not download any bytes');
    assert.equal(bootstrapStatus.verifiedBytes, 0, 'Bootstrap did not verify downloaded artifacts');

    const safeShapes = await evaluate(`(async()=>{
      const api=window.lastbrowser.sidekick;
      const pairs=await Promise.all([
        ['settings',api.getSettings()],['models',api.requestWebui({method:'GET',path:'/api/models'})],
        ['auth',api.requestWebui({method:'GET',path:'/api/auth/status'})],['plugins',api.requestWebui({method:'GET',path:'/api/plugins'})],
        ['fallback',api.getFallbackModel()],['extensions',window.lastbrowser.extensions.list()],['presets',window.lastbrowser.extensions.presets()]
      ].map(async([key,promise])=>[key,await promise]));
      const shape=v=>{if(v===null)return{type:'null'};if(Array.isArray(v))return{type:'array',length:v.length,itemKeys:v[0]&&typeof v[0]==='object'?Object.keys(v[0]).sort():[]};if(typeof v!=='object')return{type:typeof v};const out={type:'object',keys:Object.keys(v).sort()};for(const k of ['plugins','items','groups','models','fallback_model'])if(Object.hasOwn(v,k))out[k]=shape(v[k]);return out};
      return Object.fromEntries(pairs.map(([k,v])=>[k,shape(v)]));
    })()`);
    report.apiShapes = safeShapes;

    await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Erstmal ohne KI browsen|Browse without AI/i.test(x.innerText));if(b)b.click();return !!b})()");
    await sleep(1200);
    report.navControls = await evaluate("[...document.querySelectorAll('button,[role=button],a')].map(x=>({text:(x.innerText||'').trim(),title:x.getAttribute('title'),aria:x.getAttribute('aria-label'),className:String(x.className||'')})).filter(x=>/settings|config|einstellungen/i.test([x.text,x.title,x.aria].join(' '))).slice(0,20)");
    await evaluate(`(()=>{const controls=[...document.querySelectorAll('button,[role=button],a')];const b=controls.find(x=>/^(settings|einstellungen)$/i.test([x.innerText,x.getAttribute('aria-label')].filter(Boolean).join(' ').trim()))||controls.find(x=>x.classList.contains('nova-dock-btn')&&/einstellungen|settings/i.test(x.getAttribute('aria-label')||''));if(!b)throw Error('Settings navigation button not found');b.click();return true})()`);
    await sleep(500);
    report.settingsHeading = await evaluate("document.querySelector('.settings-editor-head')?.innerText||null");
    report.afterSettingsClick = await evaluate("({headings:[...document.querySelectorAll('h1,h2,h3')].map(x=>x.innerText).slice(0,12),dialogs:[...document.querySelectorAll('[role=dialog]')].map(x=>x.innerText.slice(0,300)),classes:[...document.querySelectorAll('[class*=settings]')].map(x=>String(x.className)).slice(0,20),sectionButtons:[...document.querySelectorAll('.settings-section-nav button')].map(x=>({text:x.innerText,html:x.innerHTML.slice(0,250),className:x.className})),nav:[...document.querySelectorAll('button[aria-label],button[title]')].map(x=>({text:x.innerText,aria:x.getAttribute('aria-label'),title:x.title})).slice(0,15)})");
    assert(report.settingsHeading, 'Settings panel rendered');
    for (const section of ['providers', 'plugins']) {
      await evaluate(`(()=>{const buttons=[...document.querySelectorAll('.settings-section-nav button')];const b=buttons[${section === 'providers' ? 3 : 5}];if(!b)throw Error('Settings section not found: ${section}');b.click();return true})()`);
      await sleep(900);
      report.sections ||= {};
      report.sections[section] = await evaluate("({heading:document.querySelector('.settings-editor-head')?.innerText||null,panelError:document.querySelector('.panel-error-main')?.innerText||null,extensionError:document.querySelector('.extensions-settings-content [role=alert]')?.innerText||null})");
      assert(report.sections[section].heading, `${section} section rendered`);
      assert(section === 'plugins' ? /plugins/i.test(report.sections[section].heading) : /ki|ai|model|provider/i.test(report.sections[section].heading), `${section} section selected`);
      if (report.sections[section].panelError) break;
    }
    await sleep(300);
    report.targetTypeErrorObserved = report.errorBoundary.some(args => JSON.stringify(args).includes('Cannot convert undefined or null to object'))
      || report.consoleErrors.some(text => text.includes('Cannot convert undefined or null to object'))
      || Object.values(report.sections || {}).some(value => value.panelError?.includes('Cannot convert undefined or null to object'));
    report.passed = true;
  } catch (error) {
    report.error = String(error.stack || error); process.exitCode = 1;
  } finally {
    socket?.close();
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(Error('probe ended')); }
    if (task && task.exitCode === null && task.signalCode === null) task.kill();
    report.logTail = log.slice(-3000);
    report.finishedAt = new Date().toISOString();
    const file = path.join(root, 'output', `settings-plugins-packaged-${randomUUID()}.json`);
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
    report.report = file;
    console.log(JSON.stringify({ passed: report.passed, targetTypeErrorObserved: report.targetTypeErrorObserved, report: file, error: report.error }));
    if (report.passed && path.resolve(owned).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(owned).startsWith('lastbrowser-settings-packaged-')) {
      try { fs.rmSync(owned, { recursive: true, force: true }); report.cleanup = true; } catch (error) { report.cleanupError = String(error); }
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
