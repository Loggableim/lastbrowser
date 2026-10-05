#!/usr/bin/env node
// Direct Portable executable smoke in an owned profile, driven only over loopback CDP.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
assert.equal(typeof globalThis.WebSocket, 'function', 'Use the existing Node WebSocket runtime');
const root = path.resolve(__dirname, '..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
async function main() {
  const distDir = fs.realpathSync(path.resolve(process.argv[2] || ''));
  assert(distDir.startsWith(fs.realpathSync(path.join(root, 'output')) + path.sep));
  const portableExe = path.join(distDir, 'Lastbrowser-0.1.43-x64-portable.exe');
  assert(fs.existsSync(portableExe), `Portable executable exists at ${portableExe}`);

  const owned = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-portable-'));
  const id = randomUUID(), port = await freePort(), pending = new Map();
  const report = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    distDir,
    portableExe,
    owned,
    isPortable: true,
    passed: false,
    limits: ['Explicit loopback CDP for controlled portable smoke', 'No real model inference']
  };

  let task, socket, sequence = 0, log = '';
  const env = {};
  for (const name of ['SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATH', 'PATHEXT', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMDATA']) {
    if (process.env[name]) env[name] = process.env[name];
  }
  for (const [name, relative] of Object.entries({ USERPROFILE: 'home', APPDATA: 'appdata', LOCALAPPDATA: 'localappdata', TEMP: 'tmp', TMP: 'tmp' })) {
    env[name] = path.join(owned, relative); fs.mkdirSync(env[name], { recursive: true });
  }
  env.LASTBROWSER_DOWNLOADS_DIR = path.join(owned, 'downloads');
  fs.mkdirSync(env.LASTBROWSER_DOWNLOADS_DIR, { recursive: true });

  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++sequence;
    const timer = setTimeout(() => { pending.delete(requestId); reject(Error('CDP timeout:' + method)); }, 25000);
    pending.set(requestId, { resolve, reject, timer }); socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async expression => {
    const value = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (value.exceptionDetails) throw Error(JSON.stringify(value.exceptionDetails)); return value.result.value;
  };

  try {
    task = spawn(portableExe, [
      `--user-data-dir=${path.join(owned, 'profile')}`,
      `--remote-debugging-port=${port}`,
      '--remote-debugging-address=127.0.0.1'
    ], {
      cwd: distDir,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    task.once('error', error => { report.spawnError = String(error); });
    for (const pipe of [task.stdout, task.stderr]) {
      pipe.on('data', bytes => { log += bytes; });
    }

    let target; const deadline = Date.now() + 90000;
    while (Date.now() < deadline && !target) {
      if (task.exitCode !== null || task.signalCode !== null) throw Error(`Portable launcher exited early with code ${task.exitCode}`);
      try {
        const rows = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = rows.find(row => row.type === 'page' && row.url.startsWith('app://'));
      } catch {}
      if (!target) await sleep(250);
    }
    assert(target, 'Portable launcher successfully extracted and exposed app:// renderer');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    socket.addEventListener('message', event => {
      const reply = JSON.parse(event.data);
      const waiter = pending.get(reply.id);
      if (!waiter) return;
      pending.delete(reply.id);
      clearTimeout(waiter.timer);
      if (reply.error) waiter.reject(Error(JSON.stringify(reply.error)));
      else waiter.resolve(reply.result);
    });
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });

    let ready = false; const healthDeadline = Date.now() + 80000;
    while (Date.now() < healthDeadline && !ready) {
      const state = await evaluate("(async()=>({shell:!!document.querySelector('.app-shell'),setup:!!document.querySelector('.local-ai-setup'),status:window.lastbrowser?await window.lastbrowser.services.status():null}))()");
      report.appState = state;
      ready = state.shell && state.setup && state.status?.sidekick === 'ready' && state.status?.webuiHealth === 'ready';
      if (!ready) await sleep(300);
    }
    assert(ready, 'Portable execution First Launch and bundled backend healthy');
    assert(path.resolve(report.appState.status.runtimeDir).startsWith(path.resolve(owned) + path.sep), 'Runtime belongs to isolated profile');

    report.title = await evaluate('document.title');
    report.pid = task.pid;

    let closeError;
    const closing = call('Browser.close').catch(error => { closeError = String(error); });
    const closeDeadline = Date.now() + 30000;
    while (task.exitCode === null && task.signalCode === null && Date.now() < closeDeadline) await sleep(200);
    assert.equal(task.exitCode, 0, 'Portable wrapper quits normally with exit code 0');
    await closing;
    if (closeError) report.closeAcknowledgement = closeError;
    report.exitCode = task.exitCode;
    report.passed = true;
  } catch (error) {
    report.error = String(error.stack || error);
    process.exitCode = 1;
  } finally {
    socket?.close();
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(Error('probe ended'));
    }
    if (task && task.exitCode === null && task.signalCode === null) task.kill();
    report.logTail = log.slice(-5000);
    report.finishedAt = new Date().toISOString();

    if (report.passed && path.resolve(owned).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(owned).startsWith('lastbrowser-portable-')) {
      try {
        fs.rmSync(owned, { recursive: true, force: true });
        report.cleanup = true;
      } catch (error) {
        report.cleanupError = String(error);
      }
    }
    const file = path.join(root, 'output', `portable-exe-${id}.json`);
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, report: file, error: report.error, cleanup: report.cleanup }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
