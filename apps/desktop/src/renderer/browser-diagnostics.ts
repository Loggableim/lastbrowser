export const BROWSER_DIAGNOSTICS_ENABLED_KEY = '__lastbrowser_browser_diagnostics_enabled';
export const BROWSER_DIAGNOSTICS_EVENTS_KEY = '__lastbrowser_browser_diagnostics_events';
export const BROWSER_DIAGNOSTICS_CHANGED_EVENT = 'lastbrowser:browser-diagnostics-changed';
export const BROWSER_DIAGNOSTICS_MAX_EVENTS = 500;
export const BROWSER_DIAGNOSTICS_MAX_SESSION_BYTES = 2 * 1024 * 1024;
export const BROWSER_DIAGNOSTICS_SESSION_TTL_MS = 30 * 60 * 1000;

export type BrowserDiagnosticEvent = {
  sequence: number;
  at: number;
  event: string;
  fields: Record<string, string | number | boolean | null>;
  sessionId?: string;
  windowId?: string;
  mono?: number;
  nameVersion?: 1 | 2;
};

export type BrowserDiagnosticBatch = {
  sessionId: string;
  windowId: string;
  events: BrowserDiagnosticEvent[];
};

export type BrowserDiagnosticsSink = {
  accept(batch: BrowserDiagnosticBatch): void;
};

/** Stored names stay stable so older exports still parse. Aliases only affect new writes. */
export const BROWSER_DIAGNOSTIC_EVENT_ALIASES: Record<string, string> = {
  'chat.started': 'chat-chat-started',
  'chat.failed': 'chat-chat-failed',
  'chat.finished': 'chat-chat-finished'
};

const safeDiagnosticEvents = new Set([
  'mount', 'did-start-loading', 'dom-ready', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page',
  'page-title-updated', 'did-start-navigation', 'console-message', 'did-fail-load', 'render-process-gone', 'unmount', 'shell-context',
  'renderer-error', 'renderer-unhandled-rejection', 'chat-event', 'chat-state-update',
  'chat-stream-subscribe-start', 'chat-stream-subscribe-complete', 'chat-stream-subscribe-failed',
  'chat-completion-return', 'chat-stream-status-poll', 'chat-stream-unsubscribe', 'chat-chat-started',
  'chat-chat-failed', 'chat-chat-finished', 'quickchat-toggle', 'quickchat-visible', 'quickchat-send', 'quickchat-preflight-complete',
  'quickchat-accepted', 'quickchat-event', 'quickchat-rejected'
]);
const safePanels = new Set(['browser', 'chat', 'tasks', 'kanban', 'skills', 'agents', 'memory', 'workspaces', 'profiles', 'todos', 'insights', 'logs', 'gmail', 'settings', 'terminal', 'discord', 'appstore']);
const safeFieldNames = new Set([
  'tabId', 'webviewId', 'guestWebContentsId', 'active', 'errorCode', 'exitCode', 'reason', 'isMainFrame', 'isInPlace', 'level',
  'panel', 'viewportWidth', 'viewportHeight', 'devicePixelRatio', 'visibility', 'errorName', 'source',
  'ownsContext', 'streamMatches', 'hasStreamId', 'streamActive', 'snapshotPresent', 'pending',
  'sawStreamEnd', 'streamFailed', 'completed', 'cancelled', 'failed', 'messageCount',
  'deltaLength', 'contentLength', 'errorKind', 'stage', 'path', 'elapsedMs', 'open', 'streaming', 'eventType',
  'turnId', 'phase', 'nameVersion'
]);
const numericFields = new Set(['webviewId', 'guestWebContentsId', 'errorCode', 'exitCode', 'viewportWidth', 'viewportHeight', 'devicePixelRatio', 'messageCount', 'deltaLength', 'contentLength', 'elapsedMs']);
const booleanFields = new Set(['active', 'isMainFrame', 'isInPlace', 'ownsContext', 'streamMatches', 'hasStreamId', 'streamActive', 'snapshotPresent', 'pending', 'sawStreamEnd', 'streamFailed', 'completed', 'cancelled', 'failed', 'open', 'streaming']);

function sanitizeDiagnosticFields(fields: Record<string, string | number | boolean | null>): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!safeFieldNames.has(key) || value === null) continue;
    if (key === 'tabId' && typeof value === 'string' && /^[A-Za-z0-9:_-]{1,100}$/.test(value)) safe[key] = value;
    else if (key === 'panel' && typeof value === 'string' && safePanels.has(value)) safe[key] = value;
    else if (key === 'visibility' && typeof value === 'string' && ['visible', 'hidden', 'prerender'].includes(value)) safe[key] = value;
    else if (key === 'level' && typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3) safe[key] = value;
    else if (key === 'reason' && typeof value === 'string' && ['clean-exit', 'abnormal-exit', 'killed', 'crashed', 'oom', 'launch-failed', 'integrity-failure', 'other'].includes(value)) safe[key] = value;
    else if (key === 'errorName' && typeof value === 'string' && ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError', 'ErrorEvent'].includes(value)) safe[key] = value;
    else if (key === 'source' && typeof value === 'string' && ['window', 'delta'].includes(value)) safe[key] = value;
    else if (key === 'errorKind' && typeof value === 'string' && ['authentication', 'capacity', 'timeout', 'cancelled', 'provider'].includes(value)) safe[key] = value;
    else if (key === 'stage' && typeof value === 'string' && ['stream', 'fallback'].includes(value)) safe[key] = value;
    else if (key === 'path' && typeof value === 'string' && ['stream-event', 'stream-status', 'fallback-status'].includes(value)) safe[key] = value;
    else if (key === 'eventType' && typeof value === 'string' && ['token', 'delta', 'reasoning', 'companion', 'stream_end', 'done', 'cancel', 'error', 'apperror'].includes(value)) safe[key] = value;
    else if (key === 'turnId' && typeof value === 'string' && /^[a-z0-9]{8,32}$/.test(value)) safe[key] = value;
    else if (key === 'phase' && typeof value === 'string' && ['send', 'preflight', 'accepted', 'first-delta', 'completed', 'cancelled', 'error'].includes(value)) safe[key] = value;
    else if (key === 'nameVersion' && typeof value === 'number' && (value === 1 || value === 2)) safe[key] = value;
    else if (booleanFields.has(key) && typeof value === 'boolean') safe[key] = value;
    else if (numericFields.has(key) && typeof value === 'number' && Number.isFinite(value)) safe[key] = value;
  }
  return safe;
}

function getStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

// Keep token-heavy traces in memory and batch persistence so diagnostics do not
// serialize the entire buffer synchronously on every streamed token.
const buffers = new WeakMap<Storage, BrowserDiagnosticEvent[]>();
const flushTimers = new WeakMap<Storage, ReturnType<typeof setTimeout>>();
const sinks = new WeakMap<Storage, BrowserDiagnosticsSink>();

type DiagnosticSession = {
  sessionId: string;
  windowId: string;
  enabledAt: number;
  mono: number;
  truncated: boolean;
  missingBatches: number;
  sinkFailed: boolean;
  publishedThrough: number;
};
const sessions = new WeakMap<Storage, DiagnosticSession>();

function randomDiagnosticId(prefix: string): string {
  const bytes = new Uint8Array(8);
  const cryptoRef = globalThis.crypto;
  if (cryptoRef?.getRandomValues) cryptoRef.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return prefix + [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}

function sessionFor(storage: Storage, now: number): DiagnosticSession {
  const current = sessions.get(storage);
  if (current) return current;
  const created: DiagnosticSession = {
    sessionId: randomDiagnosticId('s'),
    windowId: randomDiagnosticId('w'),
    enabledAt: now,
    mono: 0,
    truncated: false,
    missingBatches: 0,
    sinkFailed: false,
    publishedThrough: 0
  };
  sessions.set(storage, created);
  return created;
}

function canonicalDiagnosticEvent(event: string): { name: string; nameVersion: 1 | 2 } | null {
  if (safeDiagnosticEvents.has(event)) return { name: event, nameVersion: 1 };
  const alias = BROWSER_DIAGNOSTIC_EVENT_ALIASES[event];
  if (alias && safeDiagnosticEvents.has(alias)) return { name: alias, nameVersion: 2 };
  return null;
}

function jsonBytes(events: BrowserDiagnosticEvent[]): number {
  return new TextEncoder().encode(JSON.stringify(events)).length;
}

function trimDiagnosticBudget(storage: Storage, events: BrowserDiagnosticEvent[]): void {
  const session = sessions.get(storage);
  while (events.length > BROWSER_DIAGNOSTICS_MAX_EVENTS || jsonBytes(events) > BROWSER_DIAGNOSTICS_MAX_SESSION_BYTES) {
    events.shift();
    if (session) session.truncated = true;
    if (events.length === 0) break;
  }
}

function publishUnsent(storage: Storage): void {
  const sink = sinks.get(storage);
  const session = sessions.get(storage);
  const events = buffers.get(storage);
  if (!sink || !session || !events) return;
  const pending = events.filter(entry => entry.sequence > session.publishedThrough && entry.sessionId === session.sessionId);
  if (pending.length === 0) return;
  try {
    sink.accept({
      sessionId: session.sessionId,
      windowId: session.windowId,
      events: pending.map(entry => ({ ...entry, fields: { ...entry.fields } }))
    });
    session.publishedThrough = pending[pending.length - 1].sequence;
  } catch {
    session.sinkFailed = true;
  }
}

export function flushBrowserDiagnostics(storage?: Storage): void {
  const target = getStorage(storage);
  if (!target) return;
  const timer = flushTimers.get(target);
  if (timer !== undefined) clearTimeout(timer);
  flushTimers.delete(target);
  const events = buffers.get(target);
  if (!events) return;
  if (sinks.has(target)) {
    publishUnsent(target);
    return;
  }
  try { target.setItem(BROWSER_DIAGNOSTICS_EVENTS_KEY, JSON.stringify(events)); } catch {}
}

export function attachBrowserDiagnosticsSink(sink: BrowserDiagnosticsSink | null, storage?: Storage): void {
  const target = getStorage(storage);
  if (!target) return;
  if (sink) sinks.set(target, sink);
  else sinks.delete(target);
  const timer = flushTimers.get(target);
  if (timer !== undefined) clearTimeout(timer);
  flushTimers.delete(target);
}

export function isBrowserDiagnosticsEnabled(storage?: Storage): boolean {
  try {
    return getStorage(storage)?.getItem(BROWSER_DIAGNOSTICS_ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setBrowserDiagnosticsEnabled(enabled: boolean, storage?: Storage, now = Date.now()): void {
  try {
    const target = getStorage(storage);
    if (!target) return;
    if (!enabled) flushBrowserDiagnostics(target);
    if (enabled) {
      sessions.delete(target);
      sessionFor(target, now);
      target.setItem(BROWSER_DIAGNOSTICS_ENABLED_KEY, '1');
    }
    else target.removeItem(BROWSER_DIAGNOSTICS_ENABLED_KEY);
    if (enabled) target.setItem('__lastbrowser_chat_stream_debug', '1');
    else target.removeItem('__lastbrowser_chat_stream_debug');
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(BROWSER_DIAGNOSTICS_CHANGED_EVENT));
  } catch {
    // Diagnostics are optional and must never affect normal browsing.
  }
}

export function readBrowserDiagnostics(storage?: Storage): BrowserDiagnosticEvent[] {
  try {
    const target = getStorage(storage);
    if (!target) return [];
    const cached = buffers.get(target);
    if (cached) return cached.map(entry => ({ ...entry, fields: { ...entry.fields } }));
    const raw = target.getItem(BROWSER_DIAGNOSTICS_EVENTS_KEY);
    if (!raw) { buffers.set(target, []); return []; }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const events = parsed.filter((entry): entry is BrowserDiagnosticEvent => {
      if (!entry || typeof entry !== 'object') return false;
      const candidate = entry as BrowserDiagnosticEvent;
      const identityOk = (value: string | undefined) => value === undefined || /^[a-z0-9]{8,40}$/.test(value);
      return Number.isSafeInteger(candidate.sequence) && candidate.sequence > 0
        && Number.isFinite(candidate.at)
        && safeDiagnosticEvents.has(candidate.event)
        && Boolean(candidate.fields) && typeof candidate.fields === 'object'
        && identityOk(candidate.sessionId) && identityOk(candidate.windowId)
        && (candidate.mono === undefined || (Number.isFinite(candidate.mono) && candidate.mono >= 0));
    }).slice(-BROWSER_DIAGNOSTICS_MAX_EVENTS).map(entry => ({ ...entry, fields: sanitizeDiagnosticFields(entry.fields) }));
    buffers.set(target, events);
    return events.map(entry => ({ ...entry, fields: { ...entry.fields } }));
  } catch {
    return [];
  }
}

export function recordBrowserDiagnostic(
  event: string,
  fields: Record<string, string | number | boolean | null> = {},
  storage?: Storage,
  now = Date.now()
): BrowserDiagnosticEvent | null {
  if (!isBrowserDiagnosticsEnabled(storage)) return null;
  const canonical = canonicalDiagnosticEvent(event);
  if (!canonical) return null;
  const target = getStorage(storage);
  if (!target) return null;
  const session = sessionFor(target, now);
  if (now - session.enabledAt > BROWSER_DIAGNOSTICS_SESSION_TTL_MS) {
    flushBrowserDiagnostics(target);
    setBrowserDiagnosticsEnabled(false, target, now);
    return null;
  }
  if (!buffers.has(target)) readBrowserDiagnostics(target);
  const events = buffers.get(target) ?? [];
  const next: BrowserDiagnosticEvent = {
    sequence: (events[events.length - 1]?.sequence ?? 0) + 1,
    at: now,
    mono: session.mono + 1,
    sessionId: session.sessionId,
    windowId: session.windowId,
    event: canonical.name,
    fields: sanitizeDiagnosticFields(fields),
    ...(canonical.nameVersion === 2 ? { nameVersion: 2 as const } : {})
  };
  session.mono = next.mono ?? session.mono;
  events.push(next);
  try {
    trimDiagnosticBudget(target, events);
    buffers.set(target, events);
    if (!flushTimers.has(target)) flushTimers.set(target, setTimeout(() => flushBrowserDiagnostics(target), 250));
    return { ...next, fields: { ...next.fields } };
  } catch {
    // Storage quota/privacy errors should never change browser behavior.
    return null;
  }
}

export function clearBrowserDiagnostics(storage?: Storage): void {
  try {
    const target = getStorage(storage);
    if (!target) return;
    const timer = flushTimers.get(target);
    if (timer !== undefined) clearTimeout(timer);
    flushTimers.delete(target);
    buffers.set(target, []);
    sessions.delete(target);
    target.removeItem(BROWSER_DIAGNOSTICS_EVENTS_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

export function exportBrowserDiagnostics(storage?: Storage): string {
  flushBrowserDiagnostics(storage);
  const target = getStorage(storage);
  const session = target ? sessions.get(target) : undefined;
  return JSON.stringify({
    schemaVersion: 1,
    truncated: session?.truncated ?? false,
    missingBatches: session?.missingBatches ?? 0,
    sinkFailed: session?.sinkFailed ?? false,
    events: readBrowserDiagnostics(storage)
  }, null, 2);
}

export function correlateQuickChatTurn(turnId: string, storage?: Storage): Array<{ phase: string | number | boolean | null; event: string; at: number; mono?: number; elapsedMs: string | number | boolean | null }> {
  if (!/^[a-z0-9]{8,32}$/.test(turnId)) return [];
  return readBrowserDiagnostics(storage).filter(entry => entry.fields.turnId === turnId).map(entry => ({
    phase: entry.fields.phase ?? null,
    event: entry.event,
    at: entry.at,
    mono: entry.mono,
    elapsedMs: entry.fields.elapsedMs ?? null
  }));
}

/** Session-wide reads are asynchronous. The v1 array helpers stay synchronous. */
export function queryBrowserDiagnosticsV2(options: { afterSequence?: number; event?: string; tabId?: string } = {}, storage?: Storage): Promise<{ schemaVersion: 2; events: BrowserDiagnosticEvent[]; truncated: boolean; missingBatches: number }> {
  const target = getStorage(storage);
  const session = target ? sessions.get(target) : undefined;
  return Promise.resolve({
    schemaVersion: 2,
    events: queryBrowserDiagnostics(options, storage),
    truncated: session?.truncated ?? false,
    missingBatches: session?.missingBatches ?? 0
  });
}

/** A cursor lets an agent retrieve only new evidence instead of repeatedly dumping the buffer. */
export function queryBrowserDiagnostics(options: { afterSequence?: number; event?: string; tabId?: string } = {}, storage?: Storage): BrowserDiagnosticEvent[] {
  return readBrowserDiagnostics(storage).filter(entry => (
    entry.sequence > (options.afterSequence ?? 0)
    && (!options.event || entry.event === options.event)
    && (!options.tabId || entry.fields.tabId === options.tabId)
  ));
}

export function summarizeBrowserDiagnostics(storage?: Storage) {
  const events = readBrowserDiagnostics(storage);
  const counts: Record<string, number> = {};
  const tabs: Record<string, { mounts: number; navigations: number; failures: number }> = Object.create(null);
  for (const entry of events) {
    counts[entry.event] = (counts[entry.event] ?? 0) + 1;
    const tabId = entry.fields.tabId;
    if (typeof tabId !== 'string') continue;
    const tab = tabs[tabId] ?? (tabs[tabId] = { mounts: 0, navigations: 0, failures: 0 });
    if (entry.event === 'mount') tab.mounts += 1;
    if (entry.event === 'did-start-navigation') tab.navigations += 1;
    if (entry.event === 'did-fail-load') tab.failures += 1;
  }
  return { schemaVersion: 1, retainedEvents: events.length, firstSequence: events[0]?.sequence ?? null,
    lastSequence: events.at(-1)?.sequence ?? null, counts, tabs };
}

export function subscribeToBrowserDiagnosticsEnabled(onChange: (enabled: boolean) => void): () => void {
  const update = (): void => onChange(isBrowserDiagnosticsEnabled());
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(BROWSER_DIAGNOSTICS_CHANGED_EVENT, update);
  window.addEventListener('storage', update);
  update();
  return () => {
    window.removeEventListener(BROWSER_DIAGNOSTICS_CHANGED_EVENT, update);
    window.removeEventListener('storage', update);
  };
}
