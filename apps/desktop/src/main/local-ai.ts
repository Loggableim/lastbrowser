import { createHash, randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform, Readable } from 'node:stream';
import path from 'node:path';
import { createServer } from 'node:net';
import type { HardwareReport, LocalAiState, LocalModel } from './local-ai-contract.js';
import { assessModel, scanLocalHardware } from './local-ai-hardware.js';

export async function verifyModelFile(file: string, model: LocalModel): Promise<boolean> {
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(file)) { hash.update(chunk); bytes += chunk.length; }
  return bytes === model.bytes && hash.digest('hex') === model.sha256;
}

/** One application-owned engine. Only pinned catalog data can select URLs or files. */
export class LocalAiManager {
  private child: ChildProcess | null = null;
  private controller: AbortController | null = null;
  private stopping: Promise<void> | null = null;
  private activeChats = 0;
  private operation = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private state: LocalAiState;
  private readonly models: LocalModel[];
  private readonly key: string;
  constructor(private readonly runtimeRoot: string, private readonly storageRoot: string, private readonly fetcher: typeof fetch = fetch) {
    mkdirSync(storageRoot, { recursive: true });
    this.models = JSON.parse(readFileSync(path.join(runtimeRoot, 'models.json'), 'utf8')) as LocalModel[];
    for (const model of this.models) {
      if (!/^[a-z0-9-]+$/.test(model.id) || path.basename(model.filename) !== model.filename || !/^[a-f0-9]{64}$/.test(model.sha256) || !Number.isSafeInteger(model.bytes) || model.bytes <= 0 || !model.url.startsWith(`https://huggingface.co/${model.repository}/resolve/${model.revision}/`)) throw new Error('Ungültiger lokaler Modellkatalog.');
    }
    const keyPath = path.join(storageRoot, 'runtime.key');
    if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
    this.key = readFileSync(keyPath, 'utf8').trim();
    this.state = { hardware: null, catalog: this.models, installed: [], runtimeAvailable: existsSync(this.executable('cpu')),
      phase: 'idle', activeChats: 0, modelId: null, completedBytes: 0, totalBytes: 0, error: '', endpoint: null,
      backend: 'cpu', measuredTokensPerSecond: null, toolTestPassed: false, scope: null };
  }
  private executable(backend: 'cpu' | 'vulkan') { return path.join(this.runtimeRoot, backend, 'llama-server.exe'); }
  private model(id: string) { const model = this.models.find((item) => item.id === id); if (!model) throw new Error('Unbekanntes Modell.'); return model; }
  private file(model: LocalModel) { return path.join(this.storageRoot, model.filename); }
  private assertIdle() { if (this.controller || this.activeChats || this.operation) throw new Error('Lokale KI ist beschäftigt. Aktuellen Vorgang zuerst abschließen.'); }
  private async exclusive<T>(action: () => Promise<T>): Promise<T> {
    this.assertIdle(); this.operation = true;
    try { return await action(); } finally { this.operation = false; }
  }
  private scheduleIdleStop() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => { if (!this.activeChats && !this.operation) void this.stop(); }, 5 * 60 * 1000);
    this.idleTimer.unref();
  }
  acquireChat(): () => void {
    this.assertIdle();
    if (this.state.phase !== 'ready') throw new Error('Lokale KI nicht bereit.');
    this.activeChats++;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    let released = false;
    return () => { if (!released) { released = true; this.activeChats--; this.scheduleIdleStop(); } };
  }
  status(workspace = ''): LocalAiState {
    const scopeFile = path.join(this.storageRoot, createHash('sha256').update(workspace).digest('hex') + '.json');
    let scope = null;
    if (workspace && existsSync(scopeFile)) { try { scope = JSON.parse(readFileSync(scopeFile, 'utf8')); } catch {} }
    const recommendations = Object.fromEntries(this.models.map((model) => [model.id, this.state.hardware ? assessModel(model, this.state.hardware) : { usable: false, reason: 'Hardware zuerst prüfen.' }]));
    const usable = this.models.filter((model) => recommendations[model.id].usable && model.agentEvaluation === 'limited');
    const recommendedModel = this.state.hardware && this.state.hardware.availableRamBytes >= 8 * 1024 ** 3 ? usable.find((model) => model.id === 'qwen-balanced')?.id || usable[0]?.id : usable[0]?.id;
    return structuredClone({ ...this.state, recommendations, recommendedModel: recommendedModel || null, activeChats: this.activeChats, installed: this.models.filter((model) => existsSync(this.file(model))).map((model) => model.id), scope });
  }
  async scan(): Promise<HardwareReport> { this.state.hardware = await scanLocalHardware(this.storageRoot); return this.state.hardware; }
  async download(id: string): Promise<void> {
    return this.exclusive(() => this.downloadImpl(id));
  }
  private async downloadImpl(id: string): Promise<void> {
    const model = this.model(id);
    if (this.child) await this.stop();
    const hardware = await this.scan(); const assessment = assessModel(model, hardware);
    if (!assessment.usable) throw new Error(assessment.reason);
    const controller = new AbortController(); this.controller = controller;
    const target = this.file(model); const partial = target + '.partial';
    this.state = { ...this.state, phase: 'downloading', modelId: id, totalBytes: model.bytes, completedBytes: 0, error: '' };
    try {
      // Resume only against the immutable revision; hash validation covers the entire file.
      const { stat } = await import('node:fs/promises');
      let offset = existsSync(partial) ? (await stat(partial)).size : 0;
      if (offset > model.bytes) { unlinkSync(partial); offset = 0; }
      if (offset < model.bytes) {
        const response = await this.fetcher(model.url, { headers: offset ? { Range: `bytes=${offset}-` } : {}, signal: controller.signal });
        if (!response.ok || !response.body) throw new Error('Modelldownload fehlgeschlagen. Bitte erneut versuchen.');
        if (offset && response.status !== 206) offset = 0;
        if (response.status === 206 && !response.headers.get('content-range')?.startsWith(`bytes ${offset}-`)) throw new Error('Ungültige Download-Fortsetzung.');
        this.state.completedBytes = offset;
        const meter = new Transform({ transform: (chunk, _encoding, callback) => {
          this.state.completedBytes += chunk.length;
          callback(this.state.completedBytes > model.bytes ? new Error('Download überschreitet die erwartete Dateigröße.') : null, chunk);
        } });
        await pipeline(Readable.fromWeb(response.body as never), meter, createWriteStream(partial, { flags: offset ? 'a' : 'w', mode: 0o600 }), { signal: controller.signal });
      }
      this.state.phase = 'verifying';
      if (!await verifyModelFile(partial, model)) { unlinkSync(partial); throw new Error('Prüfsumme stimmt nicht. Datei wurde verworfen.'); }
      controller.signal.throwIfAborted(); renameSync(partial, target); this.state.phase = 'idle';
    } catch (error) {
      this.state.phase = controller.signal.aborted ? 'idle' : 'error';
      this.state.error = controller.signal.aborted ? 'Download abgebrochen. Er kann fortgesetzt werden.' : (error instanceof Error && error.message === 'terminated' ? 'Download-Verbindung unterbrochen. Erneut herunterladen setzt die Datei fort.' : String(error instanceof Error ? error.message : error));
    } finally { this.controller = null; }
  }
  async importFile(id: string, source: string): Promise<void> {
    return this.exclusive(() => this.importImpl(id, source));
  }
  private async importImpl(id: string, source: string): Promise<void> {
    const model = this.model(id);
    if (this.child) await this.stop();
    const { stat } = await import('node:fs/promises');
    if ((await stat(source)).size !== model.bytes) throw new Error('Die Dateigröße passt nicht zur Modellversion.');
    const hardware = await this.scan();
    if (!assessModel(model, hardware).usable) throw new Error(assessModel(model, hardware).reason);
    this.state.phase = 'verifying';
    const partial = this.file(model) + '.import'; const controller = new AbortController(); this.controller = controller;
    try {
      // Copy first and verify the copy, avoiding modification of an imported source during validation.
      let copied = 0;
      const meter = new Transform({ transform(chunk, _encoding, callback) { copied += chunk.length; callback(copied > model.bytes ? new Error('Import überschreitet die Modellgröße.') : null, chunk); } });
      await pipeline(createReadStream(source), meter, createWriteStream(partial, { mode: 0o600 }), { signal: controller.signal });
      if (!await verifyModelFile(partial, model)) throw new Error('Die Datei passt nicht zur festgelegten Modellversion.');
      controller.signal.throwIfAborted(); renameSync(partial, this.file(model)); this.state.phase = 'idle';
    } catch (error) { if (existsSync(partial)) unlinkSync(partial); this.state.phase = 'error'; this.state.error = String(error instanceof Error ? error.message : error); }
    finally { this.controller = null; }
  }
  cancel() { this.controller?.abort(); }
  async stop(force = false): Promise<void> {
    if (!force && this.activeChats) throw new Error('Lokale KI wird von einem Chat verwendet. Chat zuerst beenden.');
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
    this.cancel(); if (this.stopping) return this.stopping;
    const child = this.child; this.child = null; this.state.endpoint = null;
    if (!child) { if (!this.controller) this.state.phase = 'idle'; this.state.toolTestPassed = false; return; }
    this.stopping = new Promise<void>((resolve) => {
      const finish = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => { child.kill(); resolve(); }, 3000);
      child.once('exit', finish); child.kill();
    });
    await this.stopping; this.stopping = null;
    if (!this.controller) this.state.phase = 'idle';
    this.state.toolTestPassed = false;
  }
  async start(id: string, backend: 'cpu' | 'vulkan' = 'cpu'): Promise<void> {
    return this.exclusive(() => this.startImpl(id, backend));
  }
  private async startImpl(id: string, backend: 'cpu' | 'vulkan'): Promise<void> {
    const model = this.model(id); await this.stop();
    const controller = new AbortController(); this.controller = controller;
    this.state = { ...this.state, phase: 'loading', modelId: id, backend, error: '', toolTestPassed: false, measuredTokensPerSecond: null };
    try {
      if (!await verifyModelFile(this.file(model), model)) throw new Error('Modelldatei fehlt oder ist beschädigt.');
      controller.signal.throwIfAborted();
      const available = await new Promise<boolean>((resolve) => {
        const probe = createServer();
        probe.once('error', () => resolve(false));
        probe.listen({ host: '127.0.0.1', port: 11435, exclusive: true }, () => probe.close(() => resolve(true)));
      });
      if (!available) throw new Error('Port 11435 wird bereits verwendet. Bestehenden lokalen Dienst zuerst beenden.');
      controller.signal.throwIfAborted();
      const child = spawn(this.executable(backend), ['--model', this.file(model), '--alias', id, '--host', '127.0.0.1', '--port', '11435',
        '--api-key-file', path.join(this.storageRoot, 'runtime.key'), '--ctx-size', String(model.contextTokens), '--parallel', '1', '--threads', String(Math.max(1, Math.min(8, (this.state.hardware?.cores || 4) - 1))),
        '--n-gpu-layers', backend === 'cpu' ? '0' : '99', '--jinja', '--reasoning', 'off', '--chat-template-kwargs', '{"enable_thinking":false}'], { windowsHide: true, stdio: 'ignore' });
      this.child = child;
      const crashed = () => { if (this.child === child) { this.child = null; this.state.endpoint = null; this.state.phase = 'error'; this.state.error = 'Lokale Runtime wurde beendet. CPU-Betrieb oder ein kleineres Modell versuchen.'; } };
      child.once('error', crashed); child.once('exit', crashed);
      const endpoint = 'http://127.0.0.1:11435/v1'; let ready = false;
      for (let attempt = 0; attempt < 120; attempt++) {
        controller.signal.throwIfAborted(); if (this.child !== child) throw new Error(this.state.error);
        try {
          const response = await this.fetcher(endpoint + '/models', { headers: { Authorization: `Bearer ${this.key}` }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(1500)]) });
          const result = await response.json() as { data?: Array<{ id: string }> };
          if (response.ok && result.data?.some((entry) => entry.id === id)) { ready = true; break; }
        } catch { /* The owned child is still loading. */ }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!ready) throw new Error('Lokale Runtime nicht bereit; Portkonflikt oder Speicherproblem prüfen.');
      const response = await this.fetcher(endpoint + '/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.key}` },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
        body: JSON.stringify({ model: id, messages: [{ role: 'user', content: 'Rufe das Werkzeug add mit a=2 und b=3 auf.' }],
          tools: [{ type: 'function', function: { name: 'add', description: 'Addiert zwei Zahlen', parameters: { type: 'object', properties: { a: { type: 'integer' }, b: { type: 'integer' } }, required: ['a', 'b'], additionalProperties: false } } }],
          temperature: 0, max_tokens: 256, stream: false, chat_template_kwargs: { enable_thinking: false } })
      });
      if (!response.ok) throw new Error('Die Testanfrage ist fehlgeschlagen.');
      const result = await response.json() as { choices?: Array<{ message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>; timings?: { predicted_per_second?: number } };
      const call = result.choices?.[0]?.message?.tool_calls?.[0]?.function;
      let args: { a?: number; b?: number } = {}; try { args = JSON.parse(call?.arguments || '{}'); } catch {}
      this.state.toolTestPassed = result.choices?.[0]?.message?.tool_calls?.length === 1 && call?.name === 'add' && args.a === 2 && args.b === 3 && Object.keys(args).sort().join(',') === 'a,b';
      if (!this.state.toolTestPassed) throw new Error('Tool-Calling-Test nicht bestanden. Modell nicht als Agenten-Fallback aktiviert.');
      this.state.measuredTokensPerSecond = result.timings?.predicted_per_second ?? null;
      if (this.child !== child) throw new Error('Die gestartete Runtime wurde unerwartet beendet.');
      this.state.endpoint = endpoint; this.state.phase = 'ready';
      this.scheduleIdleStop();
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error); this.controller = null; await this.stop(); this.state.phase = 'error'; this.state.error = message;
    } finally { this.controller = null; }
  }
  async remove(id: string) { return this.exclusive(async () => { const model = this.model(id); if (this.state.modelId === id) await this.stop(); for (const file of [this.file(model), this.file(model) + '.partial']) if (existsSync(file)) unlinkSync(file); }); }
  clearSpace(workspace: string) {
    if (!workspace.trim() || workspace.length > 4096) throw new Error('Space auswählen.');
    const file = path.join(this.storageRoot, createHash('sha256').update(workspace).digest('hex') + '.json');
    if (existsSync(file)) unlinkSync(file);
  }
  configure(workspace: string, id: string, allowFallback: boolean, useAsDefault = true) {
    if (!workspace.trim() || workspace.length > 4096) throw new Error('Space auswählen.');
    if (this.state.phase !== 'ready' || this.state.modelId !== id) throw new Error('Modell zuerst laden und testen.');
    if (this.model(id).agentEvaluation === 'failed') throw new Error('Dieses Modell hat den Agenten-Basistest nicht bestanden. Anderen Kandidaten wählen.');
    const target = path.join(this.storageRoot, createHash('sha256').update(workspace).digest('hex') + '.json');
    writeFileSync(target + '.tmp', JSON.stringify({ workspace, modelId: id, allowFallback: allowFallback === true, useAsDefault }), { mode: 0o600 }); renameSync(target + '.tmp', target);
    return { provider: 'lastbrowser-local', model: id, baseUrl: this.state.endpoint!, apiKey: '' };
  }
}
