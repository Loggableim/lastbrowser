/**
 * Isolated live Ollama Cloud smoke through the built Electron renderer,
 * preload IPC, bundled Sidekick API, and SSE stream.
 *
 * Requires OLLAMA_API_KEY in the parent environment. The key is never printed
 * or written to the disposable profile; the test asks only for a short `OK`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const electron = process.argv[2] || path.resolve('node_modules/electron/dist/electron.exe');
const entry = path.resolve('apps/desktop/dist/main/main.js');
const profile = mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-ollama-smoke-'));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
let child;
let cdp;
let sessionId = '';
let fatalError = null;

function check(name, passed, details = '') {
  checks.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${details ? ` — ${details}` : ''}`);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.waiting = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (!message.id || !this.waiting.has(message.id)) return;
      const { resolve, reject, timer } = this.waiting.get(message.id);
      clearTimeout(timer);
      this.waiting.delete(message.id);
      if (message.error) reject(new Error(`CDP ${message.error.code || 'error'}`));
      else resolve(message.result);
    };
  }

  async send(method, params = {}, timeoutMs = 12_000) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.waiting.has(id)) return;
        this.waiting.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
      timer.unref?.();
      this.waiting.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    for (const pending of this.waiting.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('CDP connection closed'));
    }
    this.waiting.clear();
    this.ws.close();
  }
}

async function evaluate(expression, awaitPromise = false, timeoutMs = 12_000) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  }, timeoutMs);
  if (result.exceptionDetails) throw new Error('Renderer evaluation failed');
  return result.result.value;
}

async function waitFor(expression, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(expression)) return true;
    } catch { /* renderer is still starting */ }
    await wait(250);
  }
  return false;
}

try {
  if (!process.env.OLLAMA_API_KEY?.trim()) throw new Error('OLLAMA_API_KEY is required');
  if (!existsSync(electron) || !existsSync(entry)) throw new Error('Build Electron and dist/main/main.js first');

  const port = await freePort();
  child = spawn(electron, [
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    ...(path.basename(electron).toLowerCase() === 'electron.exe' ? [entry] : []),
  ], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: process.env,
  });

  let target;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = targets.find((candidate) => candidate.type === 'page' && /index\.html/.test(candidate.url));
      if (target) break;
    } catch { /* Electron has not opened CDP yet */ }
    await wait(250);
  }
  if (!target) throw new Error('Electron renderer did not become available');

  cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  const rendererReady = await waitFor("Boolean(document.querySelector('.shell-rail, .sidekick-sidebar'))");
  check('built renderer mounts', rendererReady);
  if (!rendererReady) throw new Error('Renderer did not mount');

  let runtimeReady = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const status = await evaluate('window.lastbrowser.services.status()', true);
    runtimeReady = status?.sidekick === 'ready' && status?.webuiHealth === 'ready';
    if (runtimeReady) break;
    await wait(250);
  }
  check('bundled Sidekick runtime is ready', runtimeReady);
  if (!runtimeReady) throw new Error('Bundled Sidekick runtime is not ready');

  const catalog = await evaluate(`(async () => {
    const result = await window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/models/live?provider=ollama-cloud' });
    const models = Array.isArray(result?.models) ? result.models : [];
    return {
      provider: String(result?.provider || ''),
      deepseek: models.some((model) => String(model?.id || '').toLowerCase().includes('deepseek-v4.1-flash')),
      modelCount: models.length,
    };
  })()`, true, 60_000);
  check('Sidekick live catalog includes the configured Ollama Cloud default', catalog?.provider === 'ollama-cloud' && catalog?.deepseek === true, `provider=${catalog?.provider || 'missing'} modelCount=${catalog?.modelCount ?? 0}`);
  if (!catalog?.deepseek) throw new Error('Ollama Cloud model is missing from the live catalog');

  const created = await evaluate(`window.lastbrowser.sidekick.createSession({ model: 'deepseek-v4.1-flash', modelProvider: 'ollama-cloud', profile: 'default' })`, true);
  sessionId = String(created?.session?.session_id || '');
  check('isolated chat session created', Boolean(sessionId));
  if (!sessionId) throw new Error('Sidekick did not return a session ID');

  await evaluate(`(() => {
    window.__ollamaSmoke = { streamId: '', events: [], startedAt: 0, firstTokenMs: null };
    window.__ollamaSmokeUnsubscribe = window.lastbrowser.sidekick.onChatStreamEvent((event) => {
      if (!event || typeof event !== 'object') return;
      const smoke = window.__ollamaSmoke;
      smoke.events.push(event);
      const text = event.data?.text || event.data?.content;
      if (smoke.firstTokenMs === null && ['token', 'delta'].includes(event.event) && typeof text === 'string' && text) {
        smoke.firstTokenMs = Math.round(performance.now() - smoke.startedAt);
      }
    });
    return true;
  })()`);

  const started = await evaluate(`(async () => {
    window.__ollamaSmoke.startedAt = performance.now();
    const result = await window.lastbrowser.sidekick.startChat({
      sessionId: ${JSON.stringify(sessionId)},
      message: 'Reply with only the word OK.',
      model: 'deepseek-v4.1-flash',
      modelProvider: 'ollama-cloud',
      profile: 'default',
      mode: 'action',
      chatMode: 'chat',
    });
    window.__ollamaSmoke.streamId = result.streamId;
    await window.lastbrowser.sidekick.subscribeChatStream({ streamId: result.streamId });
    return { streamId: result.streamId, sessionId: result.sessionId };
  })()`, true, 60_000);
  const streamId = String(started?.streamId || '');
  check('chat starts through the desktop IPC bridge', Boolean(streamId));
  if (!streamId) throw new Error('Chat did not return a stream ID');

  let ended = false;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const streamState = await evaluate(`(async () => {
      const status = await window.lastbrowser.sidekick.getStreamStatus(${JSON.stringify(streamId)});
      const events = window.__ollamaSmoke.events.filter((event) => event.streamId === ${JSON.stringify(streamId)});
      const delta = events.find((event) => ['token', 'delta'].includes(event.event) && typeof (event.data?.text || event.data?.content) === 'string' && (event.data.text || event.data.content));
      const reasoning = events.some((event) => event.event === 'reasoning' && typeof event.data?.text === 'string' && event.data.text.length > 0);
      const successfulTerminal = events.some((event) => event.event === 'stream_end');
      const failedTerminal = events.some((event) => ['error', 'cancel'].includes(event.event));
      return { active: status?.active === true, eventCount: events.length, eventKinds: [...new Set(events.map((event) => event.event).filter(Boolean))], hasToken: Boolean(delta), hasReasoning: reasoning, successfulTerminal, failedTerminal };
    })()`, true, 60_000);
    if (!streamState.successfulTerminal && !streamState.failedTerminal && streamState.active) {
      await wait(300);
      continue;
    }
    if (streamState.successfulTerminal || streamState.failedTerminal || !streamState.active && streamState.eventCount > 0) {
      ended = streamState.successfulTerminal && !streamState.failedTerminal;
      break;
    }
    await wait(300);
  }

  const progress = await evaluate(`(() => {
    const events = window.__ollamaSmoke.events.filter((event) => event.streamId === ${JSON.stringify(streamId)});
    const reasoning = events.some((event) => event.event === 'reasoning' && typeof event.data?.text === 'string' && event.data.text.length > 0);
    return { events: events.length, kinds: [...new Set(events.map((event) => event.event).filter(Boolean))], firstTokenMs: window.__ollamaSmoke.firstTokenMs, hasReasoning: reasoning };
  })()`);
  check('answer deltas reach the renderer before stream completion', progress?.firstTokenMs !== null, `firstContentMs=${progress?.firstTokenMs} eventKinds=${progress?.kinds?.join(',')}`);
  check('thinking deltas reach the renderer', progress?.hasReasoning === true);
  check('stream terminates successfully without provider error or cancellation', ended);

  const finalState = await evaluate(`(async () => {
    const result = await window.lastbrowser.sidekick.getSession({ sessionId: ${JSON.stringify(sessionId)}, messages: true });
    const messages = result?.session?.messages || [];
    const assistant = [...messages].reverse().find((message) => message?.role === 'assistant');
    const content = typeof assistant?.content === 'string' ? assistant.content : '';
    return { present: Boolean(content.trim()), answerOk: content.trim().toUpperCase().replace(/[.!\\s]/g, '') === 'OK', provider: result?.session?.model_provider, model: result?.session?.model };
  })()`, true);
  check(
    'final answer is persisted on the requested Ollama Cloud model',
    finalState?.present === true
      && finalState?.answerOk === true
      && String(finalState?.provider || '').toLowerCase() === 'ollama-cloud'
      && String(finalState?.model || '').toLowerCase() === 'deepseek-v4.1-flash',
    `provider=${finalState?.provider} model=${finalState?.model}`,
  );

  if (process.env.OLLAMA_CANCEL_SMOKE === '1') {
    const cancelSession = await evaluate(`window.lastbrowser.sidekick.createSession({ model: 'deepseek-v4.1-flash', modelProvider: 'ollama-cloud', profile: 'default' })`, true);
    const cancelSessionId = String(cancelSession?.session?.session_id || '');
    if (!cancelSessionId) throw new Error('Could not create cancellation session');
    const cancelStarted = await evaluate(`(async () => {
      const result = await window.lastbrowser.sidekick.startChat({
        sessionId: ${JSON.stringify(cancelSessionId)},
        message: 'Write a long original story in 100 numbered paragraphs. Start the story immediately.',
        model: 'deepseek-v4.1-flash', modelProvider: 'ollama-cloud',
        profile: 'default', mode: 'action', chatMode: 'chat',
      });
      await window.lastbrowser.sidekick.subscribeChatStream({ streamId: result.streamId });
      return { streamId: result.streamId };
    })()`, true, 60_000);
    const cancelStreamId = String(cancelStarted?.streamId || '');
    if (!cancelStreamId) throw new Error('Cancellation chat did not return a stream ID');
    let streaming = false;
    const cancelDeadline = Date.now() + 90_000;
    while (Date.now() < cancelDeadline) {
      streaming = await evaluate(`window.__ollamaSmoke.events.some((event) => event.streamId === ${JSON.stringify(cancelStreamId)} && ['token', 'delta', 'reasoning'].includes(event.event) && Boolean(event.data?.text || event.data?.content))`);
      if (streaming) break;
      await wait(300);
    }
    check('cancellation request reaches a live Ollama generation', streaming);
    await evaluate(`window.lastbrowser.sidekick.cancelStream(${JSON.stringify(cancelStreamId)})`, true);
    let stopped = false;
    const stopDeadline = Date.now() + 30_000;
    while (Date.now() < stopDeadline) {
      const status = await evaluate(`window.lastbrowser.sidekick.getStreamStatus(${JSON.stringify(cancelStreamId)})`, true);
      if (status?.active === false) { stopped = true; break; }
      await wait(300);
    }
    check('cancelled Ollama stream becomes inactive within 30 seconds', stopped);
    if (!stopped) throw new Error('Cancelled stream remained active');
    await evaluate(`window.lastbrowser.sidekick.deleteSession({ sessionId: ${JSON.stringify(cancelSessionId)} })`, true);
  }

  if (process.env.OLLAMA_TEAMWORK_SMOKE === '1') {
    const teamworkStatus = await evaluate(`window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/teamwork/status' })`, true);
    const ollamaModel = Array.isArray(teamworkStatus?.models)
      ? teamworkStatus.models.find((model) => String(model?.provider || '').toLowerCase() === 'ollama-cloud'
        && String(model?.id || '').toLowerCase().includes('deepseek-v4.1-flash'))
      : null;
    check('Teamwork live model pool exposes Ollama Cloud DeepSeek Flash', Boolean(ollamaModel?.id));
    if (!ollamaModel?.id) throw new Error('Teamwork has no live Ollama Cloud DeepSeek Flash candidate');

    const configured = await evaluate(`window.lastbrowser.sidekick.requestWebui({
      method: 'POST',
      path: '/api/teamwork/config',
      body: {
        enabled: true,
        strategy: 'balanced',
        auto_scale: false,
        max_subagents: 1,
        shared_grounding: false,
        roles: {
          planner: ${JSON.stringify(ollamaModel.id)},
          worker_pool: [${JSON.stringify(ollamaModel.id)}],
          critic: ${JSON.stringify(ollamaModel.id)},
          synthesizer: ${JSON.stringify(ollamaModel.id)},
        },
        hot_swap: { enabled: false, fallback_quorum_min: 1 },
      },
    })`, true);
    check('isolated Teamwork config pins every role to the live Ollama model',
      configured?.config?.roles?.planner === ollamaModel.id
        && configured?.config?.roles?.critic === ollamaModel.id
        && configured?.config?.roles?.synthesizer === ollamaModel.id
        && Array.isArray(configured?.config?.roles?.worker_pool)
        && configured.config.roles.worker_pool.length === 1
        && configured.config.roles.worker_pool[0] === ollamaModel.id);
    if (!configured?.ok) throw new Error('Could not configure the isolated Teamwork smoke');

    const teamworkSession = await evaluate(`window.lastbrowser.sidekick.createSession({ model: ${JSON.stringify(ollamaModel.id)}, modelProvider: 'ollama-cloud', profile: 'default' })`, true);
    const teamworkSessionId = String(teamworkSession?.session?.session_id || '');
    if (!teamworkSessionId) throw new Error('Could not create isolated Teamwork session');
    await evaluate(`(() => { window.__teamworkSmokeEvents = []; window.__ollamaSmokeUnsubscribe = window.lastbrowser.sidekick.onChatStreamEvent((event) => { if (event && typeof event === 'object') window.__teamworkSmokeEvents.push(event); }); return true; })()`);
    const teamworkStarted = await evaluate(`(async () => {
      const result = await window.lastbrowser.sidekick.startChat({
        sessionId: ${JSON.stringify(teamworkSessionId)},
        message: 'Answer with one short sentence: what is 2 + 2?',
        model: 'teamwork',
        modelProvider: 'ollama-cloud',
        profile: 'default',
        mode: 'chat',
        chatMode: 'chat',
      });
      await window.lastbrowser.sidekick.subscribeChatStream({ streamId: result.streamId });
      return { streamId: result.streamId };
    })()`, true, 60_000);
    const teamworkStreamId = String(teamworkStarted?.streamId || '');
    if (!teamworkStreamId) throw new Error('Teamwork chat did not return a stream ID');

    const teamworkDeadline = Date.now() + 180_000;
    let teamworkEnded = false;
    while (Date.now() < teamworkDeadline) {
      const terminal = await evaluate(`(() => {
        const events = window.__teamworkSmokeEvents.filter((event) => event.streamId === ${JSON.stringify(teamworkStreamId)});
        return { ended: events.some((event) => event.event === 'stream_end'), failed: events.some((event) => ['error', 'apperror', 'cancel'].includes(event.event)), events };
      })()`);
      if (terminal.ended || terminal.failed) {
        teamworkEnded = terminal.ended && !terminal.failed;
        break;
      }
      await wait(500);
    }
    const teamworkResult = await evaluate(`(async () => {
      const events = window.__teamworkSmokeEvents.filter((event) => event.streamId === ${JSON.stringify(teamworkStreamId)});
      const complete = events.find((event) => event.event === 'teamwork_complete')?.data;
      const usedModels = Array.isArray(complete?.models_used) ? complete.models_used.map((model) => String(model)) : [];
      const session = await window.lastbrowser.sidekick.getSession({ sessionId: ${JSON.stringify(teamworkSessionId)}, messages: true });
      const messages = session?.session?.messages || [];
      const answer = [...messages].reverse().find((message) => message?.role === 'assistant' && !message?._error)?.content;
      return { complete: Boolean(complete), usedModels, allRolesOllama: usedModels.length >= 4 && usedModels.every((model) => model.toLowerCase().includes('deepseek-v4.1-flash')), answer: typeof answer === 'string' && answer.trim().length > 0, events: [...new Set(events.map((event) => event.event))] };
    })()`, true);
    check('live Teamwork run completes using only the pinned Ollama model', teamworkEnded
      && teamworkResult?.complete === true
      && teamworkResult?.allRolesOllama === true
      && teamworkResult?.answer === true,
    `models=${teamworkResult?.usedModels?.length || 0} events=${teamworkResult?.events?.join(',') || ''}`);
    await evaluate(`window.lastbrowser.sidekick.deleteSession({ sessionId: ${JSON.stringify(teamworkSessionId)} })`, true);
  }

  if (process.env.OLLAMA_GOAL_SMOKE === '1') {
    const goalSessionResult = await evaluate(`window.lastbrowser.sidekick.createSession({ model: 'deepseek-v4.1-flash', modelProvider: 'ollama-cloud', profile: 'default' })`, true);
    const goalSessionId = String(goalSessionResult?.session?.session_id || '');
    if (!goalSessionId) throw new Error('Could not create the isolated persistent-goal session');

    const goalStart = await evaluate(`(async () => {
      window.__goalSmokeEvents = [];
      window.__goalSmokeUnsubscribe = window.lastbrowser.sidekick.onChatStreamEvent((event) => {
        if (event && typeof event === 'object') window.__goalSmokeEvents.push(event);
      });
      return window.lastbrowser.sidekick.requestWebui({
        method: 'POST',
        path: '/api/goal',
        body: {
          session_id: ${JSON.stringify(goalSessionId)},
          args: 'This task must use at least two assistant turns. In the first assistant turn, output exactly "STEP 1: READY" and nothing else. On the next continuation turn, output exactly "PERSISTED GOAL DONE" and nothing else. The goal is complete only after both markers have actually appeared in separate assistant turns, in that order. Do not repeat the first marker or describe earlier turns in the final response.',
          profile: 'default',
          model: 'deepseek-v4.1-flash',
          model_provider: 'ollama-cloud',
          max_turns: 4,
        },
      });
    })()`, true, 60_000);
    const goalStreamId = String(goalStart?.stream_id || '');
    check('persistent goal stores its request and starts an Ollama Cloud stream', goalStart?.ok === true && Boolean(goalStreamId));
    if (!goalStreamId) throw new Error('Persistent-goal kickoff did not return a stream ID');
    const goalSessionBeforeReload = await evaluate(`window.lastbrowser.sidekick.getSession({ sessionId: ${JSON.stringify(goalSessionId)}, messages: false })`, true, 60_000);
    const goalTurnsBeforeReload = Number(goalSessionBeforeReload?.session?.goal?.turns_used || 0);
    check('goal session persists its active stream before reload', goalSessionBeforeReload?.session?.active_stream_id === goalStreamId);

    // Reload while the goal-owned model stream is live. The app must restore
    // the pending turn, reconnect to the stream, and launch its queued continuation.
    await cdp.send('Page.reload', { ignoreCache: true });
    const restoredRenderer = await waitFor("Boolean(document.querySelector('.shell-rail, .sidekick-sidebar'))", 45_000);
    check('renderer restarts during the persistent-goal turn', restoredRenderer);
    if (!restoredRenderer) throw new Error('Renderer did not return after the goal smoke reload');
    let restoredRuntimeReady = false;
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const status = await evaluate('window.lastbrowser.services.status()', true);
      restoredRuntimeReady = status?.sidekick === 'ready' && status?.webuiHealth === 'ready';
      if (restoredRuntimeReady) break;
      await wait(500);
    }
    check('Sidekick runtime is ready again after renderer restart', restoredRuntimeReady);
    if (!restoredRuntimeReady) throw new Error('Sidekick runtime did not recover after renderer restart');
    await evaluate(`(() => {
      window.__goalSmokeEvents = [];
      window.__goalSmokeUnsubscribe = window.lastbrowser.sidekick.onChatStreamEvent((event) => {
        if (event && typeof event === 'object') window.__goalSmokeEvents.push(event);
      });
      return true;
    })()`);

    const goalDeadline = Date.now() + 240_000;
    let goalSnapshot = null;
    let observedContinuation = false;
    while (Date.now() < goalDeadline) {
      goalSnapshot = await evaluate(`(async () => {
        const result = await window.lastbrowser.sidekick.getSession({ sessionId: ${JSON.stringify(goalSessionId)}, messages: true });
        const session = result?.session || {};
        const goal = session.goal || null;
        const messages = Array.isArray(session.messages) ? session.messages : [];
        const assistantContents = messages
          .filter((message) => message?.role === 'assistant' && !message?._error && typeof message?.content === 'string' && message.content.trim())
          .map((message) => message.content.trim());
        const events = Array.isArray(window.__goalSmokeEvents) ? window.__goalSmokeEvents : [];
        const continuation = events.find((event) => event?.event === 'goal_continue' && event?.data?.session_id === ${JSON.stringify(goalSessionId)});
        return {
          goalStatus: String(goal?.status || ''),
          turnsUsed: Number(goal?.turns_used || 0),
          assistantTurns: assistantContents.length,
          step1Index: assistantContents.findIndex((content) => /STEP 1:\\s*READY/i.test(content)),
          hasFinal: assistantContents.some((content) => /PERSISTED GOAL DONE/i.test(content)),
          finalIndex: assistantContents.findIndex((content) => /PERSISTED GOAL DONE/i.test(content)),
          goalReason: String(goal?.last_reason || ''),
          pausedReason: String(goal?.paused_reason || ''),
          activeStreamId: session.active_stream_id || null,
          goalStateError: Boolean(session.goal_state_error),
          continuationPrompt: continuation?.data?.continuation_prompt || '',
        };
      })()`, true, 60_000);
      if (goalSnapshot?.continuationPrompt) observedContinuation = true;
      if (goalSnapshot?.goalStateError || ['done', 'paused', 'cleared'].includes(goalSnapshot?.goalStatus)) break;
      await wait(1200);
    }

    check('renderer recovery completes the persisted goal across separate turns',
      goalSnapshot?.goalStateError === false
        && goalSnapshot?.turnsUsed >= 2
        && goalSnapshot?.assistantTurns >= 2
        && goalSnapshot?.goalStatus === 'done'
        && goalSnapshot?.step1Index >= 0
        && goalSnapshot?.hasFinal === true
        && goalSnapshot?.finalIndex > goalSnapshot?.step1Index,
      `goal=${goalSnapshot?.goalStatus || 'missing'} turns=${goalSnapshot?.turnsUsed ?? 0} assistantTurns=${goalSnapshot?.assistantTurns ?? 0} step1Index=${goalSnapshot?.step1Index ?? -1} finalIndex=${goalSnapshot?.finalIndex ?? -1} judge=${String(goalSnapshot?.goalReason || '').slice(0, 70)} paused=${String(goalSnapshot?.pausedReason || '').slice(0, 70)}`);
    const continuationCompletedAfterReload = goalSnapshot?.goalStatus === 'done'
      && goalSnapshot?.turnsUsed > goalTurnsBeforeReload
      && goalSnapshot?.finalIndex > goalSnapshot?.step1Index;
    check('persistent goal continuation completed after renderer restart',
      observedContinuation || continuationCompletedAfterReload,
      `capturedEvent=${observedContinuation} turnsBeforeReload=${goalTurnsBeforeReload} turnsAfter=${goalSnapshot?.turnsUsed ?? 0}`);

    await evaluate(`(async () => {
      window.__goalSmokeUnsubscribe?.();
      return window.lastbrowser.sidekick.deleteSession({ sessionId: ${JSON.stringify(goalSessionId)} });
    })()`, true, 60_000);
  }

  const deleted = await evaluate(`window.lastbrowser.sidekick.deleteSession({ sessionId: ${JSON.stringify(sessionId)} })`, true);
  sessionId = '';
  check('temporary chat session is deleted', deleted?.ok === true || deleted?.deleted === true);

  await evaluate('window.__ollamaSmokeUnsubscribe?.()');
  cdp.close();
} catch (error) {
  const safeMessage = String(error?.message || 'unexpected failure')
    .replaceAll(process.env.OLLAMA_API_KEY || '\0', '[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 240);
  fatalError = safeMessage;
  check('live Ollama Cloud smoke completes without fatal errors', false, safeMessage);
  console.error(`FATAL ${error?.name || 'Error'}: ${safeMessage}`);
} finally {
  if (child?.pid && process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  }
  const tempRoot = path.resolve(os.tmpdir());
  const resolvedProfile = path.resolve(profile);
  if (path.dirname(resolvedProfile) === tempRoot && path.basename(resolvedProfile).startsWith('lastbrowser-ollama-smoke-')) {
    try { rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 }); } catch { /* best effort after taskkill */ }
  }
}

const passed = checks.filter((item) => item.passed).length;
const failed = checks.length - passed;
console.log(`Result: ${passed}/${checks.length} checks passed${failed ? `, ${failed} failed` : ''}`);
process.exitCode = !fatalError && checks.length > 0 && failed === 0 ? 0 : 1;
