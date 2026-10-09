#!/usr/bin/env node
// Direct packaged EXE smoke in an owned profile, driven only over loopback CDP.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
assert.equal(typeof globalThis.WebSocket, 'function', 'Use the existing Node WebSocket runtime');
const root = path.resolve(__dirname, '..');
const signedReleaseName = 'release-local-0.1.45-20261005-102014';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function resolveProbeTarget() {
  const args = process.argv.slice(2);
  const signedRelease = args[0] === '--signed-release';
  if ((signedRelease && args.length !== 2) || (!signedRelease && args.length !== 1)) {
    throw new Error(`Usage: node ${path.basename(__filename)} [--signed-release] <directory>`);
  }
  const target = fs.realpathSync(path.resolve(signedRelease ? args[1] : args[0]));
  const expected = signedRelease
    ? path.resolve(root, 'apps', 'desktop', signedReleaseName)
    : fs.realpathSync(path.join(root, 'output'));
  if (signedRelease) {
    if (path.basename(target) !== signedReleaseName || path.dirname(target).toLowerCase() !== path.resolve(root, 'apps', 'desktop').toLowerCase()) {
      throw new Error(`--signed-release accepts only ${expected}`);
    }
  } else if (!target.startsWith(expected + path.sep)) {
    throw new Error(`Unsigned preview directory must be under ${expected}`);
  }
  return { target, signedRelease };
}
function verifyAuthenticodeTimestamp(executable) {
  const command = '$ErrorActionPreference="Stop"; $s=Get-AuthenticodeSignature -LiteralPath $env:LASTBROWSER_SIGNED_PROBE_EXE; [pscustomobject]@{status=[string]$s.Status; signer=if($s.SignerCertificate){$s.SignerCertificate.Subject}else{$null}; timestampPresent=($null -ne $s.TimeStamperCertificate); timestampSigner=if($s.TimeStamperCertificate){$s.TimeStamperCertificate.Subject}else{$null}} | ConvertTo-Json -Compress';
  const powershellEnv = { ...process.env, LASTBROWSER_SIGNED_PROBE_EXE: executable };
  delete powershellEnv.PSModulePath;
  const powershell = path.join(process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8', windowsHide: true,
    env: powershellEnv
  });
  if (result.error || result.status !== 0) throw new Error(`Get-AuthenticodeSignature failed: ${result.error || result.stderr || result.status}`);
  let signature;
  try { signature = JSON.parse(result.stdout.trim()); } catch { throw new Error(`Could not parse Get-AuthenticodeSignature result: ${result.stdout}`); }
  if (signature.status !== 'Valid' || !signature.signer || signature.timestampPresent !== true || !signature.timestampSigner) {
    throw new Error(`Executable must have a valid Authenticode signature and timestamp; status=${signature.status}, timestampPresent=${signature.timestampPresent}`);
  }
  return signature;
}
async function freePort() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
async function main() {
  const { target: preview, signedRelease } = resolveProbeTarget();
  if (!signedRelease) {
    const receipt = JSON.parse(fs.readFileSync(path.join(preview, 'preview-result.json'), 'utf8'));
    assert(receipt.unsigned && !receipt.published && !receipt.error);
  }
  const executable = path.join(preview, 'win-unpacked', 'Lastbrowser.exe');
  assert(fs.lstatSync(executable).isFile(), `Packaged executable exists at ${executable}`);
  const signature = signedRelease ? verifyAuthenticodeTimestamp(executable) : null;
  const owned = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-direct-exe-'));
  const id = randomUUID(), port = await freePort(), pending = new Map();
  const report = { schemaVersion: 1, startedAt: new Date().toISOString(), preview, owned,
    directExecutable: true, passed: false, limits: ['Explicit loopback CDP for controlled smoke only', 'No real model inference or full feature acceptance'] };
  if (signedRelease) Object.assign(report, { signedRelease: true, signatureVerified: true, signatureStatus: signature.status, signer: signature.signer, timestampSigner: signature.timestampSigner });
  let task, socket, sequence = 0, log = '';
  const env = {};
  for (const name of ['SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATH', 'PATHEXT', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMDATA']) if (process.env[name]) env[name] = process.env[name];
  for (const [name, relative] of Object.entries({ USERPROFILE: 'home', APPDATA: 'appdata', LOCALAPPDATA: 'localappdata', TEMP: 'tmp', TMP: 'tmp' })) {
    env[name] = path.join(owned, relative); fs.mkdirSync(env[name], { recursive: true });
  }
  env.LASTBROWSER_DOWNLOADS_DIR = path.join(owned, 'downloads');
  fs.mkdirSync(env.LASTBROWSER_DOWNLOADS_DIR, { recursive: true });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++sequence;
    const timer = setTimeout(() => { pending.delete(requestId); reject(Error('CDP timeout:' + method)); }, 20000);
    pending.set(requestId, { resolve, reject, timer }); socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async expression => {
    const value = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (value.exceptionDetails) throw Error(JSON.stringify(value.exceptionDetails)); return value.result.value;
  };
  try {
    task = spawn(executable, [`--user-data-dir=${path.join(owned, 'profile')}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'],
      { cwd: path.join(preview, 'win-unpacked'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    task.once('error', error => { report.spawnError = String(error); });
    for (const pipe of [task.stdout, task.stderr]) pipe.on('data', bytes => { log += bytes; });
    let target; const deadline = Date.now() + 80000;
    while (Date.now() < deadline && !target) {
      if (task.exitCode !== null || task.signalCode !== null) throw Error('EXE exited before App loaded');
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(row => row.type === 'page' && row.url.startsWith('app://')); } catch {}
      if (!target) await sleep(250);
    }
    assert(target, 'Direct EXE exposes actual app:// renderer');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    socket.addEventListener('message', event => { const reply = JSON.parse(event.data); const waiter = pending.get(reply.id); if (!waiter) return;
      pending.delete(reply.id); clearTimeout(waiter.timer); if (reply.error) waiter.reject(Error(JSON.stringify(reply.error))); else waiter.resolve(reply.result); });
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let ready = false; const healthDeadline = Date.now() + 80000;
    while (Date.now() < healthDeadline && !ready) {
      const state = await evaluate("(async()=>{const setup=document.querySelector('.first-run-fullscreen-wrap,.first-run-ai-choice-screen');return {shell:!!document.querySelector('.app-shell'),setup:!!setup&&!!(setup.offsetWidth||setup.offsetHeight||setup.getClientRects().length),status:window.lastbrowser?await window.lastbrowser.services.status():null}})()");
      report.appState = state; ready = state.shell && state.setup && state.status?.sidekick === 'ready' && state.status?.webuiHealth === 'ready';
      if (!ready) await sleep(300);
    }
    assert(ready, 'Actual EXE First Launch and bundled backend healthy');
    assert(path.resolve(report.appState.status.runtimeDir).startsWith(path.resolve(owned) + path.sep), 'Runtime belongs to isolated profile');
    report.title = await evaluate('document.title'); report.pid = task.pid;
    let closeError;
    const closing = call('Browser.close').catch(error => { closeError = String(error); });
    const closeDeadline = Date.now() + 30000;
    while (task.exitCode === null && task.signalCode === null && Date.now() < closeDeadline) await sleep(200);
    assert.equal(task.exitCode, 0, 'Direct EXE quits normally');
    await closing;
    if (closeError) report.closeAcknowledgement = closeError;
    report.exitCode = task.exitCode; report.passed = true;
  } catch (error) { report.error = String(error.stack || error); process.exitCode = 1; }
  finally {
    socket?.close(); for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(Error('probe ended')); }
    if (task && task.exitCode === null && task.signalCode === null) task.kill();
    report.logTail = log.slice(-5000); report.finishedAt = new Date().toISOString();
    // Keep isolated files on failure for diagnosis; never touch another profile.
    if (report.passed && path.resolve(owned).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(owned).startsWith('lastbrowser-direct-exe-')) {
      try { fs.rmSync(owned, { recursive: true, force: true }); report.cleanup = true; } catch (error) { report.cleanupError = String(error); }
    }
    const file = path.join(root, 'output', `direct-exe-${id}.json`); fs.writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, report: file, error: report.error, cleanup: report.cleanup }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
