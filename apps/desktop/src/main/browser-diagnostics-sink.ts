export const MAIN_DIAGNOSTICS_MAX_EVENTS = 500;
export const MAIN_DIAGNOSTICS_MAX_BYTES = 2 * 1024 * 1024;

const knownEvents = new Set([
  'mount', 'did-start-loading', 'dom-ready', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page',
  'page-title-updated', 'did-start-navigation', 'console-message', 'did-fail-load', 'render-process-gone', 'unmount', 'shell-context',
  'renderer-error', 'renderer-unhandled-rejection', 'chat-event', 'chat-state-update',
  'chat-stream-subscribe-start', 'chat-stream-subscribe-complete', 'chat-stream-subscribe-failed',
  'chat-completion-return', 'chat-stream-status-poll', 'chat-stream-unsubscribe', 'chat-chat-started',
  'chat-chat-failed', 'chat-chat-finished', 'quickchat-toggle', 'quickchat-visible', 'quickchat-send', 'quickchat-preflight-complete',
  'quickchat-accepted', 'quickchat-event', 'quickchat-rejected'
]);

export type MainDiagnosticEvent = {
  sequence: number;
  at: number;
  event: string;
  fields: Record<string, string | number | boolean | null>;
  sessionId?: string;
  windowId?: string;
  mono?: number;
};

export type MainDiagnosticBatch = {
  sessionId: string;
  windowId: string;
  events: MainDiagnosticEvent[];
};

/**
 * One writer for sanitized renderer batches. v1 read/query/summary stay in the renderer.
 * This sink answers session-wide v2 reads and never accepts a sender outside the shell set.
 */
export class MainDiagnosticsSink {
  private active = false;
  private readonly events: MainDiagnosticEvent[] = [];
  private readonly seen = new Set<string>();
  private readonly nextSequence = new Map<string, number>();
  private truncated = false;
  private missingBatches = 0;
  private rejectedSenders = 0;
  constructor(private readonly maxBytes = MAIN_DIAGNOSTICS_MAX_BYTES) {}

  start(): void { this.active = true; }
  stop(): void { this.active = false; }
  get collecting(): boolean { return this.active; }

  accept(senderWebContentsId: number, shellWebContentsIds: ReadonlySet<number>, batch: unknown): void {
    if (!this.active) return;
    if (!Number.isSafeInteger(senderWebContentsId) || !shellWebContentsIds.has(senderWebContentsId)) {
      this.rejectedSenders += 1;
      return;
    }
    const parsed = this.parseBatch(batch);
    if (!parsed) {
      this.rejectedSenders += 1;
      return;
    }
    for (const event of parsed.events) {
      const key = `${parsed.sessionId}:${event.sequence}`;
      if (this.seen.has(key)) continue;
      const expected = this.nextSequence.get(parsed.sessionId) ?? 1;
      if (event.sequence > expected) this.missingBatches += event.sequence - expected;
      if (event.sequence >= expected) this.nextSequence.set(parsed.sessionId, event.sequence + 1);
      this.seen.add(key);
      this.events.push({ ...event, sessionId: parsed.sessionId, windowId: parsed.windowId });
    }
    this.trim();
  }

  async query(afterSequence = 0): Promise<{ schemaVersion: 2; events: MainDiagnosticEvent[]; truncated: boolean; missingBatches: number }> {
    return {
      schemaVersion: 2,
      events: this.events.filter(event => event.sequence > afterSequence).map(cloneEvent),
      truncated: this.truncated,
      missingBatches: this.missingBatches
    };
  }

  export(): { schemaVersion: 2; truncated: boolean; missingBatches: number; rejectedSenders: number; events: MainDiagnosticEvent[] } {
    return {
      schemaVersion: 2,
      truncated: this.truncated,
      missingBatches: this.missingBatches,
      rejectedSenders: this.rejectedSenders,
      events: this.events.map(cloneEvent)
    };
  }

  clear(): void {
    this.events.length = 0;
    this.seen.clear();
    this.nextSequence.clear();
    this.truncated = false;
    this.missingBatches = 0;
  }

  private trim(): void {
    const encoded = () => new TextEncoder().encode(JSON.stringify(this.events)).length;
    while (this.events.length > MAIN_DIAGNOSTICS_MAX_EVENTS || encoded() > this.maxBytes) {
      const removed = this.events.shift();
      if (!removed) break;
      this.truncated = true;
      if (removed.sessionId) this.seen.delete(`${removed.sessionId}:${removed.sequence}`);
    }
  }

  private parseBatch(batch: unknown): MainDiagnosticBatch | null {
    if (!batch || typeof batch !== 'object') return null;
    const record = batch as MainDiagnosticBatch;
    if (!/^[a-z0-9]{8,40}$/.test(record.sessionId ?? '') || !/^[a-z0-9]{8,40}$/.test(record.windowId ?? '')) return null;
    if (!Array.isArray(record.events) || record.events.length > MAIN_DIAGNOSTICS_MAX_EVENTS) return null;
    const events: MainDiagnosticEvent[] = [];
    for (const entry of record.events) {
      if (!entry || typeof entry !== 'object') return null;
      if (!Number.isSafeInteger(entry.sequence) || entry.sequence < 1 || !Number.isFinite(entry.at)) return null;
      if (!knownEvents.has(entry.event) || !entry.fields || typeof entry.fields !== 'object' || Array.isArray(entry.fields)) return null;
      events.push({
        sequence: entry.sequence,
        at: entry.at,
        event: entry.event,
        fields: { ...entry.fields },
        mono: typeof entry.mono === 'number' && Number.isFinite(entry.mono) ? entry.mono : undefined
      });
    }
    return { sessionId: record.sessionId, windowId: record.windowId, events };
  }
}

function cloneEvent(event: MainDiagnosticEvent): MainDiagnosticEvent {
  return { ...event, fields: { ...event.fields } };
}
