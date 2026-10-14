export const BROWSER_DIAGNOSTICS_ENABLED_KEY = '__lastbrowser_browser_diagnostics_enabled';
export const BROWSER_DIAGNOSTICS_EVENTS_KEY = '__lastbrowser_browser_diagnostics_events';
export const BROWSER_DIAGNOSTICS_CHANGED_EVENT = 'lastbrowser:browser-diagnostics-changed';
export const BROWSER_DIAGNOSTICS_MAX_EVENTS = 500;

export type BrowserDiagnosticEvent = {
  sequence: number;
  at: number;
  event: string;
  fields: Record<string, string | number | boolean | null>;
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
  'deltaLength', 'contentLength', 'errorKind', 'stage', 'path', 'elapsedMs', 'open', 'streaming', 'eventType'
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

export function flushBrowserDiagnostics(storage?: Storage): void {
  const target = getStorage(storage);
  if (!target) return;
  const timer = flushTimers.get(target);
  if (timer !== undefined) clearTimeout(timer);
  flushTimers.delete(target);
  const events = buffers.get(target);
  if (!events) return;
  try { target.setItem(BROWSER_DIAGNOSTICS_EVENTS_KEY, JSON.stringify(events)); } catch {}
}

export function isBrowserDiagnosticsEnabled(storage?: Storage): boolean {
  try {
    return getStorage(storage)?.getItem(BROWSER_DIAGNOSTICS_ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setBrowserDiagnosticsEnabled(enabled: boolean, storage?: Storage): void {
  try {
    const target = getStorage(storage);
    if (!target) return;
    if (!enabled) flushBrowserDiagnostics(target);
    if (enabled) target.setItem(BROWSER_DIAGNOSTICS_ENABLED_KEY, '1');
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
    const events = parsed.filter((entry): entry is BrowserDiagnosticEvent => (
      Boolean(entry) && typeof entry === 'object'
      && Number.isSafeInteger((entry as BrowserDiagnosticEvent).sequence)
      && (entry as BrowserDiagnosticEvent).sequence > 0
      && Number.isFinite((entry as BrowserDiagnosticEvent).at)
      && safeDiagnosticEvents.has((entry as BrowserDiagnosticEvent).event)
      && Boolean((entry as BrowserDiagnosticEvent).fields)
      && typeof (entry as BrowserDiagnosticEvent).fields === 'object'
    )).slice(-BROWSER_DIAGNOSTICS_MAX_EVENTS).map(entry => ({ ...entry, fields: sanitizeDiagnosticFields(entry.fields) }));
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
  if (!safeDiagnosticEvents.has(event)) return null;
  const target = getStorage(storage);
  if (!target) return null;
  if (!buffers.has(target)) readBrowserDiagnostics(target);
  const events = buffers.get(target) ?? [];
  const next: BrowserDiagnosticEvent = {
    sequence: (events[events.length - 1]?.sequence ?? 0) + 1,
    at: now,
    event,
    fields: sanitizeDiagnosticFields(fields)
  };
  events.push(next);
  try {
    if (events.length > BROWSER_DIAGNOSTICS_MAX_EVENTS) events.splice(0, events.length - BROWSER_DIAGNOSTICS_MAX_EVENTS);
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
    target.removeItem(BROWSER_DIAGNOSTICS_EVENTS_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

export function exportBrowserDiagnostics(storage?: Storage): string {
  flushBrowserDiagnostics(storage);
  return JSON.stringify({ schemaVersion: 1, events: readBrowserDiagnostics(storage) }, null, 2);
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
