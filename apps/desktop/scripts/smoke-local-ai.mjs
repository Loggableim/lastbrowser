// Real Electron/preload/IPC smoke in an explicitly isolated application home.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import net from 'node:net';
const desktop = fileURLToPath(new URL('../', import.meta.url));
const repo = path.resolve(desktop, '../..');
const modelsHome = path.resolve(process.argv[2] || path.join(repo, 'output/local-ai-evaluation'));
const output = path.join(repo, 'output/local-ai-evaluation'); mkdirSync(output, { recursive: true });
const profile = mkdtempSync(path.join(output, 'electron-smoke-'));
mkdirSync(path.join(profile, 'local-ai'));
const catalog = JSON.parse(readFileSync(path.join(desktop, 'vendor/local-ai/models.json'), 'utf8'));
for (const model of catalog) {
  const source = path.join(modelsHome, model.filename);
  if (existsSync(source)) linkSync(source, path.join(profile, 'local-ai', model.filename));
}
const boot = path.join(profile, 'boot.mjs');
writeFileSync(boot, `import {app} from 'electron'; app.setPath('userData', ${JSON.stringify(profile)}); await import(${JSON.stringify(pathToFileURL(path.join(desktop, 'dist/main/main.js')).href)});`);
const portServer = net.createServer(); await new Promise((resolve) => portServer.listen(0, '127.0.0.1', resolve));
const port = portServer.address().port; await new Promise((resolve) => portServer.close(resolve));
const child = spawn(path.join(repo, 'node_modules/electron/dist/electron.exe'), [`--remote-debugging-port=${port}`, '--disable-component-update', '--disable-background-networking', boot], { cwd: desktop, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let diagnostics = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { diagnostics = (diagnostics + chunk.toString()).slice(-32000); });
let socket; const pending = new Map(); let sequence = 0;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  let target;
  for (let i = 0; i < 100; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((item) => item.type === 'page' && item.url.startsWith('app://bundle')); } catch {}
    if (target) break;
    if (child.exitCode !== null) throw new Error('Electron exited before the shell became ready.');
    await delay(300);
  }
  if (!target) throw new Error('No shell CDP target.');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data); const job = pending.get(message.id);
    if (job) { pending.delete(message.id); clearTimeout(job.timer); message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result); }
  });
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 120000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  };
  for (let i = 0; i < 100 && !await evaluate('Boolean(window.lastbrowser?.localAi)'); i++) await delay(200);
  const services = await evaluate('window.lastbrowser.services.status()');
  if (path.resolve(services.runtimeDir).toLowerCase() !== path.join(profile, 'runtime').toLowerCase()) throw new Error('Application home isolation failed.');
  const hardware = await evaluate('window.lastbrowser.localAi.scan()');
  console.log('hardware', hardware.cpu, hardware.gpus.map((gpu) => gpu.name));
  await evaluate('window.lastbrowser.localAi.start("lfm-small", "cpu")');
  const state = await evaluate('window.lastbrowser.localAi.status("")');
  if (state.phase !== 'ready' || !state.toolTestPassed) throw new Error(state.error || 'Runtime test failed.');
  const spaceA = path.join(profile, 'space-a'); const spaceB = path.join(profile, 'space-b');
  mkdirSync(spaceA); mkdirSync(spaceB);
  await evaluate(`window.lastbrowser.localAi.configure(${JSON.stringify(spaceA)}, "lfm-small", true, true)`);
  if ((await evaluate(`window.lastbrowser.localAi.status(${JSON.stringify(spaceB)})`)).scope !== null) throw new Error('Space configuration leaked.');
  await evaluate('window.lastbrowser.localAi.start("qwen-balanced", "cpu")');
  await evaluate(`window.lastbrowser.localAi.configure(${JSON.stringify(spaceB)}, "qwen-balanced", false, true)`);
  const a = (await evaluate(`window.lastbrowser.localAi.status(${JSON.stringify(spaceA)})`)).scope;
  const b = (await evaluate(`window.lastbrowser.localAi.status(${JSON.stringify(spaceB)})`)).scope;
  if (a.modelId !== 'lfm-small' || b.modelId !== 'qwen-balanced' || !a.allowFallback || b.allowFallback) throw new Error('Space settings mismatch.');
  for (let i = 0; i < 100; i++) {
    if ((await evaluate('window.lastbrowser.services.status()')).sidekick === 'ready') break;
    await delay(300);
  }
  await evaluate(`window.lastbrowser.sidekick.addSpace({path:${JSON.stringify(spaceA)},name:"Local AI Smoke A",create:true})`);
  const fixture = path.join(spaceA, 'fixture.txt'); writeFileSync(fixture, 'Prüfwert: 73\n');
  await evaluate(`window.__localAiEvents=[]; window.__localAiUnsubscribe=window.lastbrowser.sidekick.onChatStreamEvent(e=>window.__localAiEvents.push(e));`);
  const response = await evaluate(`window.lastbrowser.sidekick.startChat({workspace:${JSON.stringify(spaceA)},message:${JSON.stringify(`Lies mit read_file die Datei ${fixture.replaceAll('\\', '/')}. Nenne ihren Prüfwert auf Deutsch.`)},useSpaceDefault:true})`);
  console.log('chat started', response.sessionId);
  await evaluate(`window.lastbrowser.sidekick.subscribeChatStream({streamId:${JSON.stringify(response.streamId)}})`);
  // Consume events with the production SSE bridge and verify persisted history.
  let detail;
  for (let i = 0; i < 180; i++) {
    const history = await evaluate(`window.lastbrowser.sidekick.getSession({sessionId:${JSON.stringify(response.sessionId)},workspacePath:${JSON.stringify(spaceA)}})`);
    detail = history.session || history;
    if ((detail.messages || []).some((message) => message._error || (message.role === 'assistant' && String(message.content).startsWith('**Error:**')))) throw new Error(JSON.stringify(detail.messages));
    if ((detail.messages || []).some((message) => message.role === 'assistant' && /73/.test(message.content || ''))) break;
    await delay(500);
  }
  if (!(detail?.messages || []).some((message) => message.role === 'assistant' && /73/.test(message.content || ''))) throw new Error('Electron/backend/local model chat did not return the fixture value.');
  for (let i = 0; i < 60; i++) {
    if ((await evaluate('window.lastbrowser.localAi.status("")')).activeChats === 0) break;
    await delay(500);
  }
  if ((await evaluate('window.lastbrowser.localAi.status("")')).activeChats !== 0) throw new Error('Completed chat retained its runtime lease.');
  await evaluate('window.__localAiUnsubscribe?.(); window.lastbrowser.localAi.stop()');
  const dom = await evaluate('({cards:document.querySelectorAll(".local-ai-setup").length,alerts:Array.from(document.querySelectorAll(".local-ai-setup [role=alert]")).map(e=>e.textContent)})');
  const screenshot = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path.join(output, 'electron-first-launch.png'), Buffer.from(screenshot.data, 'base64'));
  console.log(JSON.stringify({ passed: true, profile, spaces: [a.modelId, b.modelId], chatSession: response.sessionId, dom }));
} catch (error) {
  console.error(diagnostics.replace(/[a-f0-9]{64}/gi, '[redacted]').replace(/([?&]token=)[^&\s"]+/g, '$1[redacted]'));
  throw error;
} finally {
  socket?.close(); for (const job of pending.values()) clearTimeout(job.timer);
  if (child.exitCode === null && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
}
